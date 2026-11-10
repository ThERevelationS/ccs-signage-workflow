// Mountable import/export buttons for the estimator surfaces.
//
// Each component is self-contained (loads its own entity data where needed)
// so a parent only needs to mount it and pass the props documented on each.
// Pure logic lives in src/components/estimator/exportEstimates.js and
// importEstimates.js — those are unit-tested; these are thin UI wrappers.
//
// Mount points (backlog §19):
//   <ExportEstimatesButton estimates={rows}/>      → EstimatorQueues toolbar (#452 CSV / #468 backup)
//   <ExportEstimateJsonButton estimate={est}/>     → EstimateDetail toolbar (#451)
//   <ImportEstimateJsonButton onImported={fn}/>    → EstimatorQueues toolbar (#451 re-import, #455, #460)
//   <ExportChangeOrdersButton rows={cos}/>         → ChangeOrders toolbar (#465)
//   <ImportPartsLibraryButton onComplete={fn}/>    → Part Library surface (#453)
//   <ImportLineItemsButton estimate onApplied/>    → EstimateDetail (#473)
//   <ImportTemplateSectionsButton estimate/>       → EstimateDetail (#467)
//   <CopyBomButton estimateId targetBuilderProductId/> → Product/parts panels (#464)
//   <ExportQuoteHtmlButton estimate pricing/>      → CustomerQuotePanel header (#461)
//   <ExportJobCostingCsvButton estimate/>          → EstimateDetail (#474)

import { useRef, useState } from "react";
import { Download, Upload, FileJson, FileSpreadsheet, Loader2, Library, ListPlus, Copy, FileText, DatabaseBackup } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { staffEntities } from "@/components/staff/staffEntities";
import { loadAllEntityRows } from "@/lib/loadAllEntityRows";
import { loadAllCustomers } from "@/components/estimator/customerSync";
import { computePricing } from "@/components/estimator/aioPricing";
import { buildCustomerQuoteRows } from "@/components/estimator/customerQuote";
import {
  exportEstimateJson,
  exportEstimatesBackupJson,
  exportEstimatesCsv,
  exportChangeOrdersCsv,
  exportEstimateCostingCsv,
  exportStandaloneQuoteHtml,
} from "@/components/estimator/exportEstimates";
import {
  parseEstimateImportJson,
  importEstimateRecord,
  mapPartsLibraryCsv,
  importPartsLibraryRows,
  mapLineItemsCsv,
  appendLineItemsToEstimate,
  templateImportableSections,
  appendTemplateSectionsToEstimate,
  copyProductBomToProduct,
} from "@/components/estimator/importEstimates";

const btn = "h-8 px-3 inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50";
const modalBtn = "h-[30px] px-3 rounded-sm border border-gray-300 bg-white text-[12px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60";
const modalPrimary = "h-[30px] px-4 rounded-sm bg-lime-300 border border-lime-400 text-[12px] font-bold text-gray-800 disabled:opacity-60";

// ---------------------------------------------------------------------------
// #452 + #468 — bulk estimates CSV + full backup JSON
// ---------------------------------------------------------------------------

export function ExportEstimatesButton({ estimates = [], className = btn }) {
  const [err, setErr] = useState("");
  const run = (fn, fallback) => {
    try { setErr(""); fn(); } catch (e) { setErr(e?.message || fallback); }
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" className={className} disabled={!estimates.length}
        title={`Export ${estimates.length} estimate(s) to CSV — flat columns, all loaded fields`}
        onClick={() => run(() => exportEstimatesCsv(estimates), "Export failed.")}>
        <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
      </button>
      <button type="button" className={className} disabled={!estimates.length}
        title="Download every loaded estimate as one JSON backup file (re-importable)"
        onClick={() => run(() => exportEstimatesBackupJson(estimates), "Backup failed.")}>
        <DatabaseBackup className="w-3.5 h-3.5" /> Backup JSON
      </button>
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// #451 — single estimate JSON export
// ---------------------------------------------------------------------------

export function ExportEstimateJsonButton({ estimate, className = btn }) {
  const [err, setErr] = useState("");
  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" className={className}
        title="Download this estimate as JSON — re-importable as a new draft"
        onClick={() => { try { setErr(""); exportEstimateJson(estimate); } catch (e) { setErr(e?.message || "Export failed."); } }}>
        <FileJson className="w-3.5 h-3.5" /> Export JSON
      </button>
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// #451 + #455 + #460 — estimate JSON import (native exports or legacy/BOM)
// ---------------------------------------------------------------------------

export function ImportEstimateJsonButton({ sessionToken = "", createMissingCustomer = false, onImported, className = btn }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handle = async (file) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text());
      const { estimates, format } = parseEstimateImportJson(parsed);
      if (!estimates.length) throw new Error("The file contains no estimates.");
      const legacy = format === "bare";
      const preview = estimates.slice(0, 10).map((e) =>
        `• ${e.project_name || e.project || e.title || "(untitled)"} — ${e.client_name || e.customer || e.customer_name || "no customer"}`
      ).join("\n");
      const ok = window.confirm(
        `Import ${estimates.length} estimate(s)${legacy ? " using the legacy/BOM mapping (customer, project, items→line items)" : ""}?\n\n${preview}${estimates.length > 10 ? `\n…and ${estimates.length - 10} more` : ""}\n\nEach imports as a new draft with a new estimate number.`
      );
      if (!ok) return;

      const customers = await loadAllCustomers().catch(() => []);
      const results = { imported: 0, linked: 0, unlinked: 0, failed: [] };
      for (const raw of estimates) {
        try {
          const { estimate, resolution } = await importEstimateRecord({
            raw,
            format,
            sessionToken,
            customers,
            createCustomer: createMissingCustomer,
            confirmFuzzyMatch: async (customer, importName) =>
              window.confirm(`Link imported estimate for "${importName}" to existing customer "${customer.company_name}"?`),
          });
          results.imported += 1;
          if (estimate?.customer_id) results.linked += 1; else results.unlinked += 1;
        } catch (error) {
          results.failed.push({ name: raw?.project_name || raw?.client_name || "estimate", message: error?.message || "Import failed." });
        }
      }
      onImported?.(results);
      window.alert(
        `Import finished — ${results.imported} estimate(s) created${results.linked ? `, ${results.linked} linked to an existing customer` : ""}${results.unlinked ? `, ${results.unlinked} left unlinked` : ""}.` +
        (results.failed.length ? `\n${results.failed.length} failed:\n` + results.failed.slice(0, 5).map((f) => `• ${f.name}: ${f.message}`).join("\n") : "")
      );
    } catch (e) {
      window.alert(e?.message || "The estimate file could not be imported.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <button type="button" className={className} disabled={busy}
        title="Import estimate(s) from JSON — accepts exported estimate files or legacy/BOM-shaped JSON ({customer, project, items|bom})"
        onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {busy ? "Importing…" : "Import estimates (JSON)"}
      </button>
      <input ref={inputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
    </>
  );
}

// ---------------------------------------------------------------------------
// #465 — change orders CSV
// ---------------------------------------------------------------------------

export function ExportChangeOrdersButton({ rows = [], className = btn }) {
  const [err, setErr] = useState("");
  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" className={className} disabled={!rows.length}
        title={`Export ${rows.length} change order(s) to CSV`}
        onClick={() => { try { setErr(""); exportChangeOrdersCsv(rows); } catch (e) { setErr(e?.message || "Export failed."); } }}>
        <Download className="w-3.5 h-3.5" /> Export CSV
      </button>
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// #453 — parts library CSV import → PartTemplate rows
// ---------------------------------------------------------------------------

export function ImportPartsLibraryButton({ onComplete, className = btn }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handle = async (file) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const text = await file.text();
      const { templates, dropped, totalRows } = mapPartsLibraryCsv(text);
      if (!templates.length) throw new Error("No importable rows — each row needs a name/part_name. Columns: name, type, unit, unit_cost, unit_price, qty, supplier, sku, category.");
      const ok = window.confirm(
        `Import ${templates.length} part(s) into the Part Library?${dropped.length ? ` ${dropped.length} row(s) will be skipped (no name).` : ""}\n\nRe-running the same CSV is safe — rows are deduped by content.`
      );
      if (!ok) return;
      const res = await importPartsLibraryRows({ templates, delayMs: 100 });
      onComplete?.(res);
      window.alert(
        `Part Library import finished — ${res.created} created, ${res.existing} already existed${dropped.length ? `, ${dropped.length} skipped` : ""} (of ${totalRows} rows).` +
        (res.errors.length ? `\n${res.errors.length} failed:\n` + res.errors.slice(0, 5).map((e2) => `• Row ${e2.row} ${e2.name}: ${e2.message}`).join("\n") : "")
      );
    } catch (e) {
      window.alert(e?.message || "The parts CSV could not be imported.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <button type="button" className={className} disabled={busy}
        title="Import parts into the Part Library from CSV — columns: name, type, unit, unit_cost, unit_price, qty, supplier, sku, category"
        onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Library className="w-3.5 h-3.5" />}
        {busy ? "Importing…" : "Import parts (CSV)"}
      </button>
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
    </>
  );
}

// ---------------------------------------------------------------------------
// #473 — estimate line items CSV import → append to line_items
// ---------------------------------------------------------------------------

export function ImportLineItemsButton({ estimate, onApplied, className = btn }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handle = async (file) => {
    if (!file || busy || !estimate?.id) return;
    setBusy(true);
    try {
      const text = await file.text();
      const { lineItems, dropped, totalRows } = mapLineItemsCsv(text);
      if (!lineItems.length) throw new Error("No importable rows — each row needs a name. Columns: section, name, qty, unit_cost, unit_price, notes.");
      const ok = window.confirm(
        `Append ${lineItems.length} line item(s) to "${estimate.project_name || estimate.estimate_number}"?${dropped.length ? ` ${dropped.length} row(s) will be skipped (no name).` : ""}\n\nSave the estimate afterward to keep them.`
      );
      if (!ok) return;
      const saved = await appendLineItemsToEstimate({ estimate, lineItems });
      onApplied?.(saved);
      window.alert(`Added ${lineItems.length} line item(s)${dropped.length ? ` — ${dropped.length} row(s) skipped` : ""} (of ${totalRows} rows).`);
    } catch (e) {
      window.alert(e?.message || "The line-items CSV could not be imported.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <button type="button" className={className} disabled={busy || !estimate?.id}
        title="Append line items from CSV — columns: section, name, qty, unit_cost, unit_price, notes"
        onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListPlus className="w-3.5 h-3.5" />}
        {busy ? "Importing…" : "Import line items (CSV)"}
      </button>
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
    </>
  );
}

// ---------------------------------------------------------------------------
// #467 — instantiate sections from a ProjectTemplate
// ---------------------------------------------------------------------------

export function ImportTemplateSectionsButton({ estimate, onApplied, className = btn }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loadError, setLoadError] = useState("");

  const openPicker = async () => {
    setOpen(true);
    setLoading(true);
    setLoadError("");
    try {
      // ProjectTemplate reads go through the platform entity client (the same
      // path moduleTemplateService uses) — the staff gateway does not carry it.
      const { base44 } = await import("@/api/base44Client");
      const rows = await loadAllEntityRows({ entity: base44.entities.ProjectTemplate, sort: "-created_date", label: "Project templates" });
      setTemplates((rows || []).filter((t) => templateImportableSections(t).length > 0));
    } catch (e) {
      setLoadError(e?.message || "Templates could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const apply = async (template) => {
    if (busy || !estimate?.id) return;
    setBusy(true);
    try {
      const count = templateImportableSections(template).length;
      if (!window.confirm(`Append ${count} section(s) from template "${template.template_name || "Untitled"}" to this estimate?`)) return;
      const saved = await appendTemplateSectionsToEstimate({ estimate, template });
      onApplied?.(saved);
      setOpen(false);
      window.alert(`Added ${count} template section(s). Save the estimate afterward to keep them.`);
    } catch (e) {
      window.alert(e?.message || "The template sections could not be added.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className} disabled={!estimate?.id}
        title="Append line-item sections from a saved Project Template"
        onClick={openPicker}>
        <ListPlus className="w-3.5 h-3.5" /> Insert template sections
      </button>
      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader><DialogTitle className="text-[15px]">Insert Sections from Template</DialogTitle></DialogHeader>
          {loading ? (
            <div className="py-6 text-center text-[12px] text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading templates…</div>
          ) : loadError ? (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{loadError}</div>
          ) : templates.length === 0 ? (
            <p className="text-[12px] text-gray-500 py-4">No saved templates carry importable line-item sections. Templates whose project data includes a line_items or sections list appear here.</p>
          ) : (
            <div className="divide-y divide-gray-200 max-h-[320px] overflow-y-auto">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center gap-2 py-2">
                  <div className="flex-1">
                    <div className="text-[12px] font-semibold text-gray-800">{t.template_name || "Untitled"}</div>
                    <div className="text-[11px] text-gray-500">{templateImportableSections(t).length} section(s) · {t.module_key || "module"}</div>
                  </div>
                  <button type="button" disabled={busy} onClick={() => apply(t)} className={modalPrimary}>Insert</button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// #464 — copy a Product's BOM from another estimate
// ---------------------------------------------------------------------------

export function CopyBomButton({ estimateId, targetBuilderProductId, expectedEstimateUpdatedAt = "", onCopied, className = btn }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [estimates, setEstimates] = useState([]);
  const [products, setProducts] = useState([]);
  const [sourceEstimate, setSourceEstimate] = useState(null);
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState("");

  const openPicker = async () => {
    setOpen(true);
    setLoading(true);
    setLoadError("");
    setSourceEstimate(null);
    setProducts([]);
    try {
      const rows = await loadAllEntityRows({ entity: staffEntities.AllInOneEstimate, sort: "-created_date", label: "Estimates for BOM copy" });
      setEstimates((rows || []).filter((e) => e.id && e.id !== estimateId && e.deleted !== true).slice(0, 200));
    } catch (e) {
      setLoadError(e?.message || "Estimates could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const pickEstimate = async (est) => {
    setSourceEstimate(est);
    setLoading(true);
    setLoadError("");
    try {
      const rows = await loadAllEntityRows({ entity: staffEntities.BuilderProduct, query: { estimate_id: est.id }, sort: "created_date", label: "Source products" });
      setProducts(rows || []);
      if (!(rows || []).length) setLoadError("This estimate has no Products with a BOM to copy.");
    } catch (e) {
      setLoadError(e?.message || "Products could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (product) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await copyProductBomToProduct({
        estimateId,
        sourceBuilderProductId: product.id,
        targetBuilderProductId,
        expectedEstimateUpdatedAt,
      });
      onCopied?.(res);
      setOpen(false);
      window.alert(`Copied ${res.packages} BOM package(s) from "${product.client_label || product.product_name || product.name || "Product"}" to this Product.`);
    } catch (e) {
      window.alert(e?.message || "The BOM could not be copied.");
    } finally {
      setBusy(false);
    }
  };

  const term = search.trim().toLowerCase();
  const visibleEstimates = term
    ? estimates.filter((e) => [e.estimate_number, e.project_name, e.client_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(term)))
    : estimates;

  return (
    <>
      <button type="button" className={className} disabled={!estimateId || !targetBuilderProductId}
        title="Copy all Parts/Part Groups (the BOM) from a Product on another estimate into this Product"
        onClick={openPicker}>
        <Copy className="w-3.5 h-3.5" /> Copy BOM from estimate
      </button>
      <Dialog open={open} onOpenChange={(v) => !v && setOpen(false)}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader><DialogTitle className="text-[15px]">Copy BOM from Another Estimate</DialogTitle></DialogHeader>
          {!sourceEstimate ? (
            <>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search estimates by number, project, or customer"
                className="w-full h-[32px] px-2 border border-gray-300 rounded-sm text-[12px] focus:outline-none focus:border-red-400" />
              {loading ? (
                <div className="py-6 text-center text-[12px] text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</div>
              ) : loadError ? (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{loadError}</div>
              ) : (
                <div className="divide-y divide-gray-200 max-h-[320px] overflow-y-auto mt-2">
                  {visibleEstimates.slice(0, 50).map((e) => (
                    <button key={e.id} type="button" onClick={() => pickEstimate(e)} className="w-full flex items-center gap-2 py-2 text-left hover:bg-gray-50 px-1 rounded">
                      <div className="flex-1">
                        <div className="text-[12px] font-semibold text-gray-800">{e.project_name || e.estimate_number || "Estimate"}</div>
                        <div className="text-[11px] text-gray-500">#{e.estimate_number || "—"} · {e.client_name || "no customer"}</div>
                      </div>
                    </button>
                  ))}
                  {!visibleEstimates.length && <p className="text-[12px] text-gray-500 py-4">No other estimates found.</p>}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-[12px] text-gray-600">Source: <b>{sourceEstimate.project_name || sourceEstimate.estimate_number}</b> — pick the Product whose BOM to copy.</div>
              {loading ? (
                <div className="py-6 text-center text-[12px] text-gray-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading products…</div>
              ) : loadError ? (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{loadError}</div>
              ) : (
                <div className="divide-y divide-gray-200 max-h-[320px] overflow-y-auto mt-2">
                  {products.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 py-2">
                      <div className="flex-1">
                        <div className="text-[12px] font-semibold text-gray-800">{p.client_label || p.product_name || p.name || "Product"}</div>
                        <div className="text-[11px] text-gray-500">{p.module_key || p.product_category || ""}</div>
                      </div>
                      <button type="button" disabled={busy} onClick={() => copy(p)} className={modalPrimary}>{busy ? "Copying…" : "Copy BOM"}</button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => { setSourceEstimate(null); setProducts([]); setLoadError(""); }} className={`${modalBtn} mt-2`}>← Back to estimates</button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// #461 — standalone quote HTML download
// ---------------------------------------------------------------------------

export function ExportQuoteHtmlButton({ estimate, pricing, quoteRows, className = btn }) {
  const [err, setErr] = useState("");
  const run = () => {
    try {
      setErr("");
      const effectivePricing = pricing || computePricing(estimate);
      const rows = quoteRows || buildCustomerQuoteRows(estimate, effectivePricing);
      exportStandaloneQuoteHtml({ estimate, pricing: effectivePricing, quoteRows: rows });
    } catch (e) { setErr(e?.message || "Export failed."); }
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" className={className}
        title="Download the customer quote as a self-contained .html file — opens anywhere, includes a Print/Save-PDF button"
        onClick={run}>
        <FileText className="w-3.5 h-3.5" /> Quote HTML
      </button>
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// #474 — estimate job-costing breakdown CSV
// ---------------------------------------------------------------------------

export function ExportJobCostingCsvButton({ estimate, className = btn }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy || !estimate?.id) return;
    setBusy(true);
    try {
      const productIds = (estimate.line_items || []).map((l) => l.builder_product_id).filter(Boolean);
      const [products, parts, groups] = await Promise.all([
        productIds.length
          ? loadAllEntityRows({ entity: staffEntities.BuilderProduct, query: { estimate_id: estimate.id }, sort: "created_date", label: "Estimate products" })
          : Promise.resolve([]),
        Promise.all(productIds.map((pid) =>
          loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: pid }, sort: "sort_order", label: "Estimate parts" }).catch(() => [])
        )).then((sets) => sets.flat()),
        Promise.all(productIds.map((pid) =>
          loadAllEntityRows({ entity: staffEntities.BuilderPartGroup, query: { builder_product_id: pid }, sort: "sort_order", label: "Estimate part groups" }).catch(() => [])
        )).then((sets) => sets.flat()),
      ]);
      exportEstimateCostingCsv({ estimate, products, parts, groups });
    } catch (e) {
      window.alert(e?.message || "The job-costing export failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={className} disabled={busy || !estimate?.id}
      title="Export the job-costing breakdown — per-part internal cost vs customer price per section, plus totals"
      onClick={run}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
      {busy ? "Exporting…" : "Job costing CSV"}
    </button>
  );
}
