import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { staffEntities } from "@/components/staff/staffEntities";
import { loadAllEntityRows } from "@/lib/loadAllEntityRows";
import { getModuleLabel } from "@/components/estimator/moduleRegistry";
import { assertNoPendingLinesForCopy } from "@/components/estimator/builder/builderMutationRecovery";
import { cloneProductInEstimate } from "@/components/estimator/products/productOperations";
import { copyProductBomToProduct } from "@/components/estimator/importEstimates";
import { copyEstimateSections, estimateNumberLookups } from "./copyFromEstimateService";

const secondary = "h-9 px-3 rounded border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50";
const primary = "h-9 px-4 rounded border border-lime-500 bg-lime-300 text-xs font-bold text-gray-900 hover:bg-lime-400 disabled:opacity-50";
const productName = (line) => line?.client_product_name || line?.project_name || line?.builder_name || "Untitled Product";
const money = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
  ? `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";
const linesOf = (row) => Array.isArray(row?.line_items) ? row.line_items : [];
const packageNames = (results) => (results || []).flatMap((item) => item.group
  ? [item.group.client_label || item.group.group_name || "Part Group"]
  : (item.parts || []).map((part) => part.client_label || part.part_name || "Part"));

export default function CopyFromEstimateDialog({ open, mode, estimate, targetBuilderProductId, expectedEstimateUpdatedAt = "", onClose, onCopied }) {
  const [estimates, setEstimates] = useState([]);
  const [exact, setExact] = useState([]);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState(null);
  const [target, setTarget] = useState(null);
  const [selected, setSelected] = useState([]);
  const [sourceProduct, setSourceProduct] = useState("");
  const [targetProduct, setTargetProduct] = useState("");
  const [partCounts, setPartCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const resultNotifiedRef = useRef(false);
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (!open || !estimate?.id) return;
    let active = true;
    setSource(null); setSelected([]); setSourceProduct(""); setTargetProduct(targetBuilderProductId || "");
    setEstimates([]); setExact([]); setSearch(""); setPartCounts({}); setResult(null); resultNotifiedRef.current = false; setError(""); setProgress(""); setStep(1); setLoading(true);
    Promise.all([
      staffEntities.AllInOneEstimate.filter({ deleted: { $ne: true } }, "-updated_date", 500),
      staffEntities.AllInOneEstimate.get(estimate.id),
    ]).then(([rows, current]) => {
      if (!active) return;
      if (!Array.isArray(rows) || !current?.id) throw new Error("Estimates could not be loaded.");
      setEstimates(rows.filter((row) => row?.id && row.id !== estimate.id && row.deleted !== true));
      setTarget(current);
    }).catch((err) => { if (active) setError(err?.message || "Estimates could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, estimate?.id, targetBuilderProductId]);

  useEffect(() => {
    const lookups = estimateNumberLookups(search);
    setExact([]);
    if (!open || step !== 1 || !lookups.length) { setSearching(false); return; }
    let active = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const batches = await Promise.all(lookups.map((number) => staffEntities.AllInOneEstimate.filter({ estimate_number: number }, "-updated_date", 50)));
        if (active) setExact(batches.flat().filter((row) => row?.id && row.id !== estimate?.id && row.deleted !== true));
      } catch {
        if (active) setError("Exact estimate lookup failed. Please try again.");
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [search, open, step, estimate?.id]);

  const pickEstimate = async (row) => {
    setLoading(true); setError("");
    try {
      const current = await staffEntities.AllInOneEstimate.get(row.id);
      if (!current?.id || current.deleted === true) throw new Error("This estimate is no longer available.");
      setSource(current); setSelected([]); setSourceProduct(""); setPartCounts({}); setStep(2);
      if (mode === "bom") {
        const counts = {};
        for (const line of linesOf(current).filter((item) => item.builder_product_id)) {
          const parts = await loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: line.builder_product_id }, sort: "sort_order", label: "Source BOM Parts" });
          counts[line.builder_product_id] = parts.filter((part) => part.is_active !== false).length;
        }
        setPartCounts(counts);
      }
    } catch (err) { setError(err?.message || "The source estimate could not be loaded."); }
    finally { setLoading(false); }
  };

  const copy = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setProgress("");
    let outcome;
    try {
      if (mode === "sections") {
        outcome = await copyEstimateSections({
          sourceEstimateId: source.id, estimateId: estimate.id,
          lines: selected.map((index) => linesOf(source)[index]),
          expectedEstimateUpdatedAt, clone: cloneProductInEstimate,
          getEstimate: (id) => staffEntities.AllInOneEstimate.get(id),
          onProgress: ({ index, total, line }) => setProgress(`Copying ${index} of ${total}: ${productName(line)}`),
        });
      } else {
        setProgress("Copying BOM…");
        const currentSource = await staffEntities.AllInOneEstimate.get(source.id);
        if (!currentSource?.id || currentSource.deleted === true) throw new Error("The source estimate is no longer available.");
        const currentLine = linesOf(currentSource).find((line) => line.builder_product_id === sourceProduct);
        if (!currentLine) throw new Error("The source Product is no longer on that estimate.");
        assertNoPendingLinesForCopy([currentLine], "copying its BOM");
        const copied = await copyProductBomToProduct({
          estimateId: estimate.id, sourceBuilderProductId: sourceProduct,
          targetBuilderProductId: targetProduct, expectedEstimateUpdatedAt,
        });
        outcome = { copied: [copied], failures: [], packages: copied.packages, packageNames: packageNames(copied.results) };
      }
    } catch (err) {
      const partial = err?.bomCopyProgress;
      outcome = {
        copied: [], packages: partial?.packages || 0, packageNames: packageNames(partial?.results),
        failures: [{ message: err?.message || "The copy could not be completed.", line: partial?.failedItem ? { client_product_name: partial.failedItem } : null }],
      };
    }
    setResult(outcome); setBusy(false); setProgress(""); busyRef.current = false;
  };

  const finish = async () => {
    if (busyRef.current) return;
    if (!result || resultNotifiedRef.current) { onClose?.(); return; }
    busyRef.current = true; setBusy(true);
    try {
      await onCopied?.(result);
      resultNotifiedRef.current = true;
      onClose?.();
    } catch {
      resultNotifiedRef.current = true;
      setResult((previous) => ({ ...previous, refreshError: "The estimate could not be refreshed. Reload it before making further changes." }));
    } finally {
      busyRef.current = false; setBusy(false);
    }
  };

  const byId = new Map();
  [...exact, ...estimates].forEach((row) => { if (!byId.has(row.id)) byId.set(row.id, row); });
  const term = search.trim().toLowerCase();
  const exactIds = new Set(exact.map((row) => row.id));
  const visible = [...byId.values()].filter((row) => exactIds.has(row.id) || !term || [row.estimate_number, row.project_name, row.client_name].some((value) => String(value || "").toLowerCase().includes(term)));
  const sourceLines = linesOf(source);
  const copyable = sourceLines.map((line, index) => line.builder_product_id ? index : -1).filter((index) => index >= 0);
  const targetLines = linesOf(target).filter((line) => line.builder_product_id);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) finish(); }}>
      <DialogContent hideClose={busy} className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{mode === "sections" ? "Copy products from an estimate" : "Copy BOM from an estimate"}</DialogTitle>
          <DialogDescription>{mode === "sections" ? "Copy selected products, their builder projects, Parts, and pricing into this estimate." : "Copy Parts and Part Groups from one Product into a Product on this estimate."}</DialogDescription>
        </DialogHeader>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">1 Choose estimate · 2 Choose products · 3 Copy</div>
        {error && <div role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>}
        {result ? (
          <div className="space-y-3 text-sm">
            <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
              {mode === "sections" ? `${result.copied.length} product(s) copied.` : `${result.packages || 0} BOM package(s) copied.`}
              {result.copied.map(({ line }, index) => line && <div key={index} className="mt-1 text-xs">{productName(line)}</div>)}
              {result.packageNames?.map((name, index) => <div key={index} className="mt-1 text-xs">{name}</div>)}
            </div>
            {result.failures.map((failure, index) => <div key={index} role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700"><strong>{failure.line ? `${productName(failure.line)}: ` : ""}</strong>{failure.message}</div>)}
            {result.refreshError && <p role="alert" className="text-xs text-red-700">{result.refreshError}</p>}
            {result.failures.length > 0 && <p className="text-xs text-slate-600">If a copy started but did not finish, use the Product’s Resume action before making other changes.</p>}
            <div className="flex justify-end"><button type="button" className={primary} disabled={busy} onClick={finish}>{busy ? "Refreshing…" : "Done"}</button></div>
          </div>
        ) : (
          <>
            {step === 1 && <>
              <input aria-label="Search estimates" value={search} onChange={(event) => { setSearch(event.target.value); setError(""); }} placeholder="Search number, project, or customer" className="h-9 w-full rounded border border-slate-300 px-3 text-sm" />
              {(loading || searching) && <p role="status" className="text-xs text-slate-500"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />{loading ? "Loading estimates…" : "Searching older estimates…"}</p>}
              <div className="max-h-80 overflow-y-auto rounded border border-slate-200 divide-y divide-slate-100">
                {!loading && !visible.length && <p className="p-4 text-xs text-slate-500">No matching estimates found.</p>}
                {visible.map((row) => <button key={row.id} type="button" disabled={loading} onClick={() => pickEstimate(row)} className="w-full p-3 text-left hover:bg-slate-50 disabled:opacity-50">
                  <span className="block text-sm font-semibold text-slate-900">{row.project_name || "Untitled estimate"}</span>
                  <span className="block text-xs text-slate-500">#{row.estimate_number || "—"} · {row.client_name || "No customer"} · {row.status || "draft"} · {linesOf(row).length} products{money(row.quote_total) ? ` · ${money(row.quote_total)}` : ""}</span>
                </button>)}
              </div>
            </>}
            {step === 2 && <>
              <div className="text-xs text-slate-600">From <strong>{source?.project_name || source?.estimate_number || "Estimate"}</strong></div>
              {loading ? <p role="status" className="text-xs text-slate-500">Loading Products and Parts…</p> : <>
                {mode === "sections" && copyable.length > 0 && <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" disabled={busy} checked={selected.length === copyable.length} onChange={(event) => setSelected(event.target.checked ? copyable : [])} /> Select all available products</label>}
                <div className="max-h-72 overflow-y-auto rounded border border-slate-200 divide-y divide-slate-100">
                  {!sourceLines.length && <p className="p-4 text-xs text-slate-500">This estimate has no products.</p>}
                  {sourceLines.map((line, index) => {
                    const available = !!line.builder_product_id;
                    return <label key={line.line_id || `${line.builder_product_id}-${index}`} className={`flex items-start gap-3 p-3 text-sm ${available ? "hover:bg-slate-50" : "opacity-50"}`}>
                      <input type={mode === "sections" ? "checkbox" : "radio"} name={mode === "bom" ? "source-product" : undefined} disabled={!available || busy} checked={mode === "sections" ? selected.includes(index) : sourceProduct === line.builder_product_id} onChange={(event) => mode === "sections" ? setSelected((prev) => event.target.checked ? [...prev, index] : prev.filter((item) => item !== index)) : setSourceProduct(line.builder_product_id)} />
                      <span><strong className="block">{productName(line)}</strong><span className="text-xs text-slate-500">{getModuleLabel(line.module_key) || "Custom"} · Qty {line.customer_quantity ?? 1}{money(line.customer_price_snapshot ?? line.total_snapshot) ? ` · ${money(line.customer_price_snapshot ?? line.total_snapshot)}` : ""}{mode === "bom" && available ? ` · ${partCounts[line.builder_product_id] ?? 0} active Parts` : ""}{!available ? " · No persistent Product record to copy" : ""}</span></span>
                    </label>;
                  })}
                </div>
              </>}
            </>}
            {step === 3 && mode === "bom" && <div className="space-y-2">
              <p className="text-xs text-slate-600">Choose the Product on this estimate that will receive the Parts.</p>
              {!targetLines.length && <p className="text-xs text-slate-500">This estimate has no Products with a persistent Product record.</p>}
              <div className="max-h-64 overflow-y-auto rounded border border-slate-200 divide-y divide-slate-100">
                {targetLines.map((line, index) => <label key={line.line_id || index} className="flex gap-3 p-3 text-sm hover:bg-slate-50"><input type="radio" name="target-product" disabled={busy} checked={targetProduct === line.builder_product_id} onChange={() => setTargetProduct(line.builder_product_id)} /><span><strong className="block">{productName(line)}</strong><span className="text-xs text-slate-500">{getModuleLabel(line.module_key) || "Custom"}</span></span></label>)}
              </div>
            </div>}
            {progress && <p role="status" className="text-xs font-semibold text-slate-600">{progress}</p>}
            <div className="flex justify-between gap-2 pt-1">
              <button type="button" className={secondary} disabled={busy || loading} onClick={() => step === 1 ? onClose?.() : setStep(step === 3 ? 2 : 1)}>{step === 1 ? "Cancel" : "Back"}</button>
              {step === 2 && mode === "sections" && <button type="button" className={primary} disabled={busy || loading || !selected.length} onClick={copy}>Copy {selected.length} products</button>}
              {step === 2 && mode === "bom" && <button type="button" className={primary} disabled={busy || loading || !sourceProduct || !partCounts[sourceProduct]} onClick={() => targetBuilderProductId ? copy() : setStep(3)}>{targetBuilderProductId ? "Copy BOM" : "Choose target"}</button>}
              {step === 3 && mode === "bom" && <button type="button" className={primary} disabled={busy || !targetProduct} onClick={copy}>Copy BOM</button>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
