import React, { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  X,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Plus,
  SkipForward,
} from "lucide-react";
import {
  routeRow,
  validateColumns,
  TARGETS,
  nameKey,
  REQUIRED_COLUMNS,
} from "./importMappers";

/**
 * ExcelImporterDialog
 * -------------------
 * Drops in an external system's "PartDetailsExport" XLSX, routes each row to
 * the correct inventory entity, dedupes by name (case-insensitive), and
 * UPDATES existing items rather than creating duplicates.
 *
 *  - Validates required columns (rejects wrong file types).
 *  - Auto-routes to: Vinyl / Substrates / Metal.
 *  - Groups same-product different-size vinyl using product_group_key.
 *  - Shows a preview with counts: New / Update / Skip per category.
 *  - Idempotent: re-running the import only updates changed prices.
 */
export default function ExcelImporterDialog({ onClose, onComplete }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState([]); // routed rows: { target_key, payload, name, action, existingId }
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null); // { created, updated, skipped, errors }

  // ------------------------- Step 1: Pick + validate file -------------------------

  const handleFile = async (f) => {
    setFileError(null);
    setRows([]);
    setResult(null);

    if (!f) return;

    const name = f.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      setFileError("Wrong file type. Please upload a .xlsx or .xls file exported from your external inventory system.");
      setFile(null);
      return;
    }

    setFile(f);
    setParsing(true);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!data.length) {
        setFileError("The spreadsheet is empty.");
        setParsing(false);
        return;
      }

      const headers = Object.keys(data[0]);
      const { ok, missing } = validateColumns(headers);
      if (!ok) {
        setFileError(
          `This doesn't look like a Part Details export. Missing required columns: ${missing.join(
            ", "
          )}. Expected columns include: ${REQUIRED_COLUMNS.join(", ")}.`
        );
        setParsing(false);
        return;
      }

      // Load existing items from every target entity so we can dedupe by name
      const existing = {};
      await Promise.all(
        Object.entries(TARGETS).map(async ([key, conf]) => {
          try {
            const list = await conf.entity.list();
            existing[key] = new Map(list.map((it) => [nameKey(it[conf.nameField]), it]));
          } catch (e) {
            console.error(`Failed to load existing ${key}:`, e);
            existing[key] = new Map();
          }
        })
      );

      // Route every row + decide action (create / update / skip)
      const routed = data
        .map((row) => {
          const r = routeRow(row);
          if (!r.name) return null;
          const existingItem = existing[r.target_key].get(nameKey(r.name));
          return {
            ...r,
            action: existingItem ? "update" : "create",
            existingId: existingItem?.id || null,
          };
        })
        .filter(Boolean);

      // De-dupe within the SAME import batch (last occurrence wins)
      const seen = new Map();
      routed.forEach((r) => {
        const k = `${r.target_key}::${nameKey(r.name)}`;
        seen.set(k, r);
      });

      setRows(Array.from(seen.values()));
    } catch (err) {
      console.error("Parse error:", err);
      setFileError("Could not read this file. Please make sure it's a valid Excel file.");
    }
    setParsing(false);
  };

  // ------------------------- Step 2: Preview counts -------------------------

  const summary = useMemo(() => {
    const out = {};
    Object.keys(TARGETS).forEach((k) => {
      out[k] = { create: 0, update: 0 };
    });
    rows.forEach((r) => {
      out[r.target_key][r.action] += 1;
    });
    return out;
  }, [rows]);

  // ------------------------- Step 3: Run import -------------------------

  const runImport = async () => {
    setImporting(true);
    setProgress({ done: 0, total: rows.length });
    const res = { created: 0, updated: 0, skipped: 0, errors: [] };

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const isRateLimit = (err) => {
      const msg = String(err?.message || "").toLowerCase();
      const status = err?.response?.status || err?.status;
      return status === 429 || msg.includes("rate limit") || msg.includes("too many requests");
    };

    // Process one row at a time with a small delay between requests, and
    // retry rate-limit failures with exponential backoff. This is the
    // most reliable way to stay under the backend's per-second cap.
    const PER_REQUEST_DELAY_MS = 120;   // ~8 req/sec steady-state
    const MAX_RETRIES = 5;

    const writeOne = async (r) => {
      const conf = TARGETS[r.target_key];
      let attempt = 0;
      while (true) {
        try {
          if (r.action === "update") {
            await conf.entity.update(r.existingId, r.payload);
            res.updated += 1;
          } else {
            await conf.entity.create(r.payload);
            res.created += 1;
          }
          return;
        } catch (err) {
          if (isRateLimit(err) && attempt < MAX_RETRIES) {
            // Exponential backoff: 500ms, 1s, 2s, 4s, 8s + jitter
            const backoff = 500 * Math.pow(2, attempt) + Math.random() * 250;
            await sleep(backoff);
            attempt += 1;
            continue;
          }
          console.error(`Import error for "${r.name}":`, err);
          res.errors.push({ name: r.name, message: err?.message || "Failed" });
          return;
        }
      }
    };

    for (let i = 0; i < rows.length; i++) {
      await writeOne(rows[i]);
      setProgress({ done: i + 1, total: rows.length });
      if (i < rows.length - 1) await sleep(PER_REQUEST_DELAY_MS);
    }

    setResult(res);
    setImporting(false);
    onComplete?.();
  };

  // ------------------------- Render -------------------------

  const hasRoutedRows = rows.length > 0;
  const totalCreate = Object.values(summary).reduce((s, v) => s + v.create, 0);
  const totalUpdate = Object.values(summary).reduce((s, v) => s + v.update, 0);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="border-b sticky top-0 bg-white z-10">
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Import Inventory from Excel
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-5">
          {/* Step 1: pick file */}
          {!hasRoutedRows && !result && (
            <>
              <div className="text-sm text-slate-600 space-y-2">
                <p>
                  Drop in a <strong>Part Details Export</strong> spreadsheet from your external
                  inventory system. Items are automatically routed by name to the right inventory
                  section.
                </p>
                <ul className="list-disc list-inside text-xs text-slate-500 space-y-0.5">
                  <li>Items with matching names are <strong>updated</strong> — no duplicates.</li>
                  <li>Same vinyl in different widths is grouped automatically.</li>
                  <li>Must be a .xlsx with the standard Part Details columns.</li>
                </ul>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/40 transition-colors"
              >
                <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-700">
                  {file ? file.name : "Click to select Excel file"}
                </p>
                <p className="text-xs text-slate-500 mt-1">.xlsx or .xls</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </div>

              {parsing && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Parsing and matching items…
                </div>
              )}

              {fileError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-800">{fileError}</div>
                </div>
              )}
            </>
          )}

          {/* Step 2: preview */}
          {hasRoutedRows && !result && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-emerald-900">
                  <p className="font-medium">Parsed {rows.length} unique items.</p>
                  <p className="text-xs mt-0.5">
                    {totalCreate} new item{totalCreate === 1 ? "" : "s"} to create
                    {totalUpdate > 0 && `, ${totalUpdate} existing item${totalUpdate === 1 ? "" : "s"} to update`}.
                  </p>
                </div>
              </div>

              <div className="border rounded-lg divide-y">
                {Object.entries(summary).map(([key, counts]) => {
                  const total = counts.create + counts.update;
                  if (total === 0) return null;
                  return (
                    <div key={key} className="p-3 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-800">{TARGETS[key].label}</span>
                      <div className="flex items-center gap-2">
                        {counts.create > 0 && (
                          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                            <Plus className="w-3 h-3 mr-1" />
                            {counts.create} new
                          </Badge>
                        )}
                        {counts.update > 0 && (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                            <RefreshCw className="w-3 h-3 mr-1" />
                            {counts.update} update
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {importing && (
                <div className="text-sm text-slate-600 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importing {progress.done} of {progress.total}…
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={onClose} disabled={importing}>
                  Cancel
                </Button>
                <Button
                  onClick={runImport}
                  disabled={importing}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing…
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Import {rows.length} Items
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: results */}
          {result && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-emerald-900">
                  <p className="font-semibold">Import complete</p>
                  <p className="text-xs mt-1">
                    <span className="inline-flex items-center gap-1 mr-3">
                      <Plus className="w-3 h-3" /> {result.created} created
                    </span>
                    <span className="inline-flex items-center gap-1 mr-3">
                      <RefreshCw className="w-3 h-3" /> {result.updated} updated
                    </span>
                    {result.errors.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-red-700">
                        <SkipForward className="w-3 h-3" /> {result.errors.length} errors
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                  <p className="text-xs font-semibold text-red-800 mb-2">Errors:</p>
                  <ul className="text-xs text-red-700 space-y-1">
                    {result.errors.map((e, i) => (
                      <li key={i}>
                        • <strong>{e.name}</strong>: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t">
                {result.errors.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Keep only failed rows and re-run with the slow throttled path
                      const failedNames = new Set(result.errors.map((e) => e.name));
                      const failedRows = rows.filter((r) => failedNames.has(r.name));
                      setRows(failedRows);
                      setResult(null);
                    }}
                    className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry {result.errors.length} Failed
                  </Button>
                )}
                <Button onClick={onClose} className="bg-emerald-600 hover:bg-emerald-700">
                  Done
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}