import { useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { staffEntities } from "@/components/staff/staffEntities";
import { useAuth, getSessionToken } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2,
  ArrowLeft, Download, Lock, Play,
} from "lucide-react";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { replaceCustomerFieldsIfUnchanged } from "@/components/estimator/customerPersistence";
import { ensureIdempotentEntityCreate, newCreationRequestKey } from "@/components/estimator/idempotentEntityCreate";
import { downloadCsv } from "@/components/shared/exportCsv";
import {
  IMPORT_TYPE_LIST, IMPORT_TYPES, parseCsvText, validateImport, planImport,
  chunkRows, toCustomerPayload, toContactPayload, toLocationPayload,
  customerRefMatches, locationDedupeKey, contactDedupeKey, nonEmptyFields,
} from "./importModel";

const BATCH_SIZE = 25;
const PREVIEW_LIMIT = 200;

// ensureEstimateCustomer's field allowlist (base44/functions/ensureEstimateCustomer).
// Everything else the CSV carries is patched afterwards via the same CAS
// updateMany the customers page uses — so no field silently gets dropped.
const ENSURE_CUSTOMER_FIELDS = new Set([
  "company_phone", "contact_office_phone", "contact_first_name", "contact_last_name",
  "contact_email", "contact_office_ext", "salesperson", "location",
  "default_tax_group", "terms", "location_address_1", "billing_address_1", "notes",
]);
const CUSTOMER_PATCH_FIELDS = IMPORT_TYPES.customers.columns
  .map((c) => c.key)
  .filter((k) => k !== "company_name" && !ENSURE_CUSTOMER_FIELDS.has(k));

const emptyStats = () => ({ created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, errors: [] });

// Cheap content fingerprint — same file re-imported is detectable in history.
const fileHash = (text) => {
  let h = 0x811c9dc5;
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
};

// ---------------------------------------------------------------------------
// Executors — one per executable import type. Each returns the shared stats
// shape {created, updated, unchanged, skipped, failed, errors:[{row,message}]}.
// ---------------------------------------------------------------------------

async function executeCustomers(rows, ctx) {
  const stats = emptyStats();
  for (const chunk of chunkRows(rows, BATCH_SIZE)) {
    for (const { row, data } of chunk) {
      const payload = toCustomerPayload(data);
      const ensureFields = nonEmptyFields(payload, [...ENSURE_CUSTOMER_FIELDS]);
      try {
        const res = await base44.functions.invoke("ensureEstimateCustomer", {
          company_name: payload.company_name,
          fields: ensureFields,
          session_token: ctx.sessionToken,
        });
        const body = res?.data || res;
        if (body?.error) throw new Error(body.error);
        const customer = body?.customer;
        if (!customer?.id) throw new Error("Customer could not be verified after create.");
        if (body.reused) stats.unchanged += 1; else stats.created += 1;

        // Fields outside the ensure allowlist go through the customers page's
        // CAS write. Blank CSV cells never clobber existing data.
        const patch = nonEmptyFields(payload, CUSTOMER_PATCH_FIELDS);
        if (Object.keys(patch).length) {
          const baseline = Object.fromEntries(Object.keys(patch).map((k) => [k, customer[k]]));
          await replaceCustomerFieldsIfUnchanged({
            entity: staffEntities.Customer,
            customerId: customer.id,
            expectedFields: baseline,
            nextFields: patch,
            label: `Imported Customer "${payload.company_name}"`,
          });
          stats.updated += 1;
        }
      } catch (error) {
        stats.failed += 1;
        stats.errors.push({ row, message: error?.message || "Customer import failed." });
      }
      ctx.onProgress?.(stats);
    }
  }
  return stats;
}

async function executeContacts(rows, ctx) {
  const stats = emptyStats();
  const customers = await loadAllEntityRows({
    entity: staffEntities.Customer, sort: "created_date", label: "Customers for contact import",
  });
  for (const chunk of chunkRows(rows, BATCH_SIZE)) {
    for (const { row, data } of chunk) {
      try {
        const target = customers.find((c) => customerRefMatches(c, data.customer));
        if (!target?.id) {
          stats.skipped += 1;
          stats.errors.push({ row, message: `Customer "${data.customer}" not found — import customers first.` });
          continue;
        }
        const payload = toContactPayload(data);
        const key = contactDedupeKey(payload);
        const fresh = await staffEntities.Customer.get(target.id);
        if (!fresh?.id) throw new Error("Customer record could not be re-read.");
        const list = Array.isArray(fresh.additional_contacts) ? [...fresh.additional_contacts] : [];
        const idx = list.findIndex((c) => contactDedupeKey(c) === key);
        let changed = false;
        if (idx >= 0) {
          // Merge only non-empty imported fields into the matching contact.
          const merged = { ...list[idx] };
          for (const [k, v] of Object.entries(payload)) {
            if (v !== "" && v !== undefined && v !== null && merged[k] !== v) { merged[k] = v; changed = true; }
          }
          list[idx] = merged;
        } else {
          list.push(payload);
          changed = true;
        }
        if (!changed) {
          stats.unchanged += 1;
        } else {
          await replaceCustomerFieldsIfUnchanged({
            entity: staffEntities.Customer,
            customerId: fresh.id,
            expectedFields: { additional_contacts: fresh.additional_contacts },
            nextFields: { additional_contacts: list },
            label: `Imported contact for "${target.company_name}"`,
          });
          if (idx >= 0) stats.updated += 1; else stats.created += 1;
        }
      } catch (error) {
        stats.failed += 1;
        stats.errors.push({ row, message: error?.message || "Contact import failed." });
      }
      ctx.onProgress?.(stats);
    }
  }
  return stats;
}

async function executeAddresses(rows, ctx) {
  const stats = emptyStats();
  const [customers, locations] = await Promise.all([
    loadAllEntityRows({ entity: staffEntities.Customer, sort: "created_date", label: "Customers for address import" }),
    loadAllEntityRows({ entity: staffEntities.CustomerLocation, sort: "created_date", label: "Customer locations for address import" }),
  ]);
  const existingKeys = new Set(locations.map((l) => locationDedupeKey(l?.customer_id, l)));
  for (const chunk of chunkRows(rows, BATCH_SIZE)) {
    for (const { row, data } of chunk) {
      try {
        const target = customers.find((c) => customerRefMatches(c, data.customer));
        if (!target?.id) {
          stats.skipped += 1;
          stats.errors.push({ row, message: `Customer "${data.customer}" not found — import customers first.` });
          continue;
        }
        const key = locationDedupeKey(target.id, data);
        if (existingKeys.has(key)) {
          stats.unchanged += 1;
          continue;
        }
        const payload = toLocationPayload(data, target.id, {
          source: "csv_import",
          import_job_id: ctx.jobId || "",
          customer_name: target.company_name || "",
        });
        await ensureIdempotentEntityCreate({
          entity: staffEntities.CustomerLocation,
          keyField: "creation_request_key",
          key: newCreationRequestKey("import-location"),
          data: payload,
          label: `Imported address for "${target.company_name}"`,
        });
        existingKeys.add(key);
        stats.created += 1;
      } catch (error) {
        stats.failed += 1;
        stats.errors.push({ row, message: error?.message || "Address import failed." });
      }
      ctx.onProgress?.(stats);
    }
  }
  return stats;
}

const EXECUTORS = {
  customers: executeCustomers,
  customer_contacts: executeContacts,
  customer_addresses: executeAddresses,
};

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

export default function ImportWizard({ onImportFinished }) {
  const { currentUser } = useAuth();
  const fileRef = useRef(null);
  const runningRef = useRef(false);
  const [typeKey, setTypeKey] = useState("");
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState(null);   // {headers, records, validation, plan}
  const [parseError, setParseError] = useState("");
  const [phase, setPhase] = useState("setup");  // setup | preview | running | done
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [jobError, setJobError] = useState("");

  const type = typeKey ? IMPORT_TYPES[typeKey] : null;

  const reset = () => {
    setParsed(null);
    setParseError("");
    setResult(null);
    setJobError("");
    setPhase("setup");
    setProgress({ done: 0, total: 0 });
    if (fileRef.current) fileRef.current.value = "";
  };

  const pickType = (key) => { setTypeKey(key); reset(); };

  const handleFile = async (f) => {
    if (!f) return;
    setFileName(f.name || "pasted.csv");
    try {
      setCsvText(await f.text());
    } catch {
      setParseError("The file could not be read.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const runParse = () => {
    setParseError("");
    setParsed(null);
    const text = csvText;
    if (!text.trim()) { setParseError("Paste CSV text or choose a file first."); return; }
    try {
      const { headers, records } = parseCsvText(text);
      if (!headers.length || !records.length) {
        setParseError("No data rows found — expected a header row plus at least one record.");
        return;
      }
      const validation = validateImport({ headers, records }, typeKey);
      const plan = planImport(records, validation);
      setParsed({ headers, records, validation, plan, text });
      setPhase("preview");
    } catch (error) {
      setParseError(error?.message || "The CSV could not be parsed.");
    }
  };

  const processedCount = (s) => s.created + s.updated + s.unchanged + s.skipped + s.failed;

  const execute = async () => {
    if (!parsed || !type?.executable || runningRef.current) return;
    runningRef.current = true;
    setPhase("running");
    setJobError("");
    const started = Date.now();
    const sessionToken = getSessionToken();
    const valid = parsed.validation.valid;
    setProgress({ done: 0, total: valid.length });
    let job = null;
    try {
      job = await staffEntities.ImportJob.create({
        user_email: currentUser?.email || "",
        import_type: type.jobType,
        status: "running",
        total_items: valid.length,
        file_name: fileName || "pasted.csv",
        file_hash: fileHash(parsed.text),
        file_size_bytes: parsed.text.length,
        started_at: new Date(started).toISOString(),
        phase: "applying",
        invalid_items: parsed.plan.invalid,
      });
    } catch (error) {
      // History must never block the import itself — the job row is recorded
      // again at completion if the create raced ahead of visibility.
      console.error("ImportJob create failed:", error?.message || error);
      setJobError("Import history could not be recorded — the import itself will still run.");
    }

    let stats;
    try {
      stats = await EXECUTORS[typeKey](valid, {
        sessionToken,
        jobId: job?.id || "",
        onProgress: (s) => setProgress({ done: processedCount(s), total: valid.length }),
      });
    } catch (error) {
      stats = { ...emptyStats(), failed: valid.length, errors: [{ row: 0, message: error?.message || "Import failed." }] };
    }

    const summary = `${stats.created} created, ${stats.updated} updated, ${stats.unchanged} unchanged, ${stats.skipped} skipped, ${stats.failed + parsed.plan.invalid} row error(s)`;
    try {
      if (job?.id) {
        await staffEntities.ImportJob.update(job.id, {
          status: "completed",
          processed_items: processedCount(stats),
          created_items: stats.created,
          updated_items: stats.updated,
          unchanged_items: stats.unchanged,
          skipped_items: stats.skipped,
          invalid_items: parsed.plan.invalid,
          conflict_items: stats.failed,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - started,
          result_message: summary,
        });
      }
    } catch (error) {
      console.error("ImportJob completion update failed:", error?.message || error);
    }

    setResult({ stats, summary });
    setPhase("done");
    runningRef.current = false;
    onImportFinished?.();
  };

  const downloadErrors = () => {
    const rows = [
      ...(parsed?.validation.errors || []),
      ...(result?.stats.errors || []),
    ].map((e) => [e.row, e.message]);
    downloadCsv(`import-errors-${typeKey}-${Date.now()}.csv`, ["Row", "Error"], rows);
  };

  const previewRows = useMemo(() => {
    if (!parsed) return [];
    const errByRow = new Map();
    (parsed.validation.errors || []).forEach((e) => {
      errByRow.set(e.row, [...(errByRow.get(e.row) || []), e.message]);
    });
    const validByRow = new Map(parsed.validation.valid.map((v) => [v.row, v.data]));
    const kth = parsed.validation.keyToHeader || {};
    return parsed.records.slice(0, PREVIEW_LIMIT).map((rec) => {
      const ok = validByRow.has(rec.row);
      // Valid rows show typed values; invalid rows show the raw CSV cell so the
      // user sees what the validator choked on.
      const data = ok ? validByRow.get(rec.row) : Object.fromEntries(
        Object.entries(kth).map(([key, header]) => [key, header ? rec.data?.[header] : ""]),
      );
      return { row: rec.row, data, errors: errByRow.get(rec.row) || [], ok };
    });
  }, [parsed]);

  // ---- Step 1: choose type + source -----------------------------------------
  if (phase === "setup") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {IMPORT_TYPE_LIST.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => pickType(t.key)}
              className={`text-left border rounded-md p-3 transition-colors ${
                typeKey === t.key ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-gray-900">{t.label}</span>
                {t.executable
                  ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">import</Badge>
                  : <Badge className="bg-amber-100 text-amber-800 border-amber-200"><Lock className="w-3 h-3 mr-1" />preview only</Badge>}
              </div>
              <p className="mt-1 text-[11px] text-gray-500 leading-snug">{t.description}</p>
            </button>
          ))}
        </div>

        {type && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-[13px] flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-indigo-600" /> {type.label} CSV
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-[10px] text-gray-500">
                Expected columns (synonyms recognized):{" "}
                {type.columns.map((c) => c.label).join(", ")}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="h-[30px] text-[11px]" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5 mr-1" /> Choose .csv file
                </Button>
                <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
                {fileName && <span className="text-[11px] text-gray-600">{fileName}</span>}
                <span className="text-[10px] text-gray-400">— or paste below</span>
              </div>
              <Textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={`${type.columns.slice(0, 4).map((c) => c.synonyms[0]).join(",")},...`}
                className="min-h-[140px] font-mono text-[11px]"
              />
              {parseError && (
                <Alert variant="destructive"><AlertTriangle className="w-4 h-4" /><AlertDescription className="text-[11px]">{parseError}</AlertDescription></Alert>
              )}
              <Button className="h-[30px] text-[11px]" onClick={runParse} disabled={!csvText.trim()}>
                Parse &amp; preview
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ---- Step 2: preview -------------------------------------------------------
  if (phase === "preview" && parsed) {
    const { plan, validation } = parsed;
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="h-[30px] text-[11px]" onClick={reset}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
          </Button>
          <div>
            <div className="text-[14px] font-bold text-gray-900">{type.label} — preview</div>
            <div className="text-[10px] text-gray-500">{fileName || "pasted.csv"} · {plan.total} row(s)</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px]">
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">{plan.valid} valid</Badge>
          <Badge className="bg-red-100 text-red-800 border-red-200">{plan.invalid} invalid</Badge>
        </div>

        {validation.unmappedHeaders?.length > 0 && (
          <Alert><AlertTriangle className="w-4 h-4" /><AlertDescription className="text-[11px]">
            Unmapped columns (ignored): {validation.unmappedHeaders.join(", ")}
          </AlertDescription></Alert>
        )}
        {validation.missingRequired?.length > 0 && (
          <Alert variant="destructive"><AlertTriangle className="w-4 h-4" /><AlertDescription className="text-[11px]">
            Missing required column(s): {validation.missingRequired.join(", ")}
          </AlertDescription></Alert>
        )}

        <div className="border border-gray-200 rounded-md overflow-auto ccs-scrollbar-hidden max-h-[420px] bg-white">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left px-2 py-1.5 font-semibold text-gray-500 w-12">Row</th>
                {type.columns.slice(0, 6).map((c) => (
                  <th key={c.key} className="text-left px-2 py-1.5 font-semibold text-gray-500">{c.label}</th>
                ))}
                <th className="text-left px-2 py-1.5 font-semibold text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {previewRows.map((r) => (
                <tr key={r.row} className={r.ok ? "" : "bg-red-50"}>
                  <td className="px-2 py-1 text-gray-400">{r.row}</td>
                  {type.columns.slice(0, 6).map((c) => (
                    <td key={c.key} className="px-2 py-1 text-gray-700 max-w-[180px] truncate">
                      {String(r.data?.[c.key] ?? "")}
                    </td>
                  ))}
                  <td className="px-2 py-1">
                    {r.ok
                      ? <span className="text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />ok</span>
                      : <span className="text-red-700">{r.errors.join("; ")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {parsed.records.length > PREVIEW_LIMIT && (
            <div className="px-3 py-2 text-[10px] text-gray-400 border-t">
              Showing first {PREVIEW_LIMIT} of {parsed.records.length} rows.
            </div>
          )}
        </div>

        {!type.executable && (
          <Alert><Lock className="w-4 h-4" /><AlertDescription className="text-[11px]">
            {type.gateReason}
          </AlertDescription></Alert>
        )}

        <div className="flex items-center gap-2">
          <Button
            className="h-[30px] text-[11px]"
            disabled={!type.executable || plan.valid === 0 || !!validation.missingRequired?.length}
            onClick={execute}
          >
            <Play className="w-3.5 h-3.5 mr-1" />
            {type.executable ? `Import ${plan.valid} row(s)` : "Execution unavailable"}
          </Button>
          {validation.errors?.length > 0 && (
            <Button variant="outline" className="h-[30px] text-[11px]" onClick={downloadErrors}>
              <Download className="w-3.5 h-3.5 mr-1" /> Error CSV
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ---- Step 3: running -------------------------------------------------------
  if (phase === "running") {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="border border-gray-200 rounded-md bg-white p-6 text-center space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
        <div className="text-[13px] font-bold text-gray-900">Importing {type?.label}…</div>
        <div className="text-[11px] text-gray-500">{progress.done} / {progress.total} rows ({pct}%)</div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden max-w-md mx-auto">
          <div className="h-full bg-indigo-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        {jobError && <div className="text-[10px] text-amber-700">{jobError}</div>}
      </div>
    );
  }

  // ---- Step 4: done ----------------------------------------------------------
  const stats = result?.stats || emptyStats();
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-[13px] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {type?.label} import finished
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-[11px]">
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">{stats.created} created</Badge>
            <Badge className="bg-blue-100 text-blue-800 border-blue-200">{stats.updated} updated</Badge>
            <Badge className="bg-gray-100 text-gray-700 border-gray-200">{stats.unchanged} unchanged</Badge>
            <Badge className="bg-amber-100 text-amber-800 border-amber-200">{stats.skipped} skipped</Badge>
            <Badge className="bg-red-100 text-red-800 border-red-200">{stats.failed + (parsed?.plan.invalid || 0)} errors</Badge>
          </div>
          <p className="text-[11px] text-gray-600">{result?.summary}</p>
          {jobError && <p className="text-[10px] text-amber-700">{jobError}</p>}
          <div className="flex items-center gap-2">
            {(stats.errors.length + (parsed?.validation.errors?.length || 0)) > 0 && (
              <Button variant="outline" className="h-[30px] text-[11px]" onClick={downloadErrors}>
                <Download className="w-3.5 h-3.5 mr-1" /> Download error CSV
              </Button>
            )}
            <Button className="h-[30px] text-[11px]" onClick={reset}>Import another file</Button>
          </div>
        </CardContent>
      </Card>
      {stats.errors.length > 0 && (
        <div className="border border-red-200 rounded-md bg-red-50 p-3 max-h-[240px] overflow-auto ccs-scrollbar-hidden">
          {stats.errors.slice(0, 100).map((e, i) => (
            <div key={i} className="text-[11px] text-red-800">Row {e.row || "—"}: {e.message}</div>
          ))}
        </div>
      )}
    </div>
  );
}
