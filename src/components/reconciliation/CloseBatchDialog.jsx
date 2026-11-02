import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Filter, Loader2, MapPin, X } from "lucide-react";
import { EmptyState, FilterField, FilterSelect, filterInputCls } from "@/components/kit";
import {
  BUCKET_LABELS,
  TENDER_BUCKETS,
  adjustmentDrafts,
  adjustmentsCentsOf,
  buildCandidateFilters,
  buildClosePayload,
  candidateBucket,
  candidateDay,
  candidateLocationId,
  clean,
  expectedBuckets,
  fromCents,
  resolveCounted,
  toCents,
  varianceCents,
} from "./reconUiModel";

const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inputCls = filterInputCls;
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

const METHOD_OPTIONS = [
  { value: "", label: "All tenders" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "card", label: "Card" },
  { value: "ach", label: "ACH" },
  { value: "financing", label: "Financing" },
  { value: "credit_memo", label: "Credit memo" },
  { value: "other", label: "Other" },
];

// I-04 close wizard driving the deployed I-03 contract: the filter bar scopes
// list_candidates (location/date/method), the preview shows per-bucket
// expected totals over the SELECTED rows (unchecked rows are excluded from
// the close), counted drafts resolve blank → expected, and confirm issues
// close_batch with the exact payment_ids plus a creation_request_key held in
// a ref — a retried submit converges on the same batch instead of opening a
// second one.
export default function CloseBatchDialog({ sessionToken, invoke, locations = [], salesLocations = [], onClose, onClosed }) {
  const [locKey, setLocKey] = useState("");
  const [method, setMethod] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [locOptions, setLocOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [counted, setCounted] = useState(() => Object.fromEntries(TENDER_BUCKETS.map((b) => [b, ""])));
  const [batchLoc, setBatchLoc] = useState("");
  const [batchLocId, setBatchLocId] = useState("");
  const [batchName, setBatchName] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const keyRef = useRef(crypto.randomUUID());
  const locOptionsSeeded = useRef(false);

  // Batch location (which drawer/site this close is for) — the SalesLocation
  // registry first, then legacy batch location names. Distinct axis from the
  // payment-location filter below, which scopes WHICH payments are in scope.
  const batchLocOptions = useMemo(() => {
    const opts = [];
    const seen = new Set();
    for (const loc of salesLocations || []) {
      const name = clean(loc?.name);
      if (!name || loc?.active === false || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      opts.push({ value: name, locId: clean(loc?.id), label: clean(loc?.code) ? `${name} (${clean(loc.code)})` : name });
    }
    for (const loc of locations || []) {
      const name = clean(loc);
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      opts.push({ value: name, locId: "", label: name });
    }
    return opts;
  }, [salesLocations, locations]);

  const load = useCallback(async (filters = {}) => {
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    try {
      const data = await invoke(sessionToken, {
        action: "list_candidates",
        ...buildCandidateFilters(filters),
      });
      const rows = Array.isArray(data?.candidates) ? data.candidates : [];
      setCandidates(rows);
      setSelected(new Set(rows.map((p) => clean(p?.id)).filter(Boolean)));
      // Seed the payment-location filter once from the unfiltered pool — the
      // resolved keys (job-site ids / free-text) are the only values the
      // backend's location matcher accepts.
      if (!locOptionsSeeded.current) {
        locOptionsSeeded.current = true;
        const keys = new Set(rows.map(candidateLocationId).filter(Boolean));
        for (const k of Object.keys(data?.groups?.by_location || {})) {
          if (k && k !== "(none)") keys.add(k);
        }
        setLocOptions([...keys].sort());
      }
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Candidates failed to load.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, invoke]);

  // Mount: unfiltered pool (also seeds the location options). Filter edits
  // re-query server-side; the selection resets to the new result set.
  useEffect(() => { load({}); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const applyFilters = (next = {}) => {
    load({ locationId: locKey, method, dateStart, dateEnd, ...next });
  };

  const selectedRows = useMemo(
    () => candidates.filter((p) => selected.has(clean(p?.id))),
    [candidates, selected],
  );
  const expected = useMemo(() => expectedBuckets(selectedRows), [selectedRows]);
  const resolved = useMemo(() => resolveCounted(counted, expected), [counted, expected]);
  const adjRows = useMemo(() => adjustmentDrafts(adjustment, adjustmentNote), [adjustment, adjustmentNote]);
  const adjCents = adjustmentsCentsOf(adjRows);
  const variance = varianceCents(expected.totalCents, resolved.collectedCents, adjCents);
  const allSelected = candidates.length > 0 && selected.size === candidates.length;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(candidates.map((p) => clean(p?.id)).filter(Boolean)));
  };
  const toggleOne = (id) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllRef = (el) => { if (el) el.indeterminate = selected.size > 0 && !allSelected; };

  const submit = async () => {
    if (saving) return;
    if (selected.size === 0) { setSubmitError("Select at least one payment to close."); return; }
    if (adjRows.length && !clean(adjustmentNote)) { setSubmitError("Explain the cash adjustment."); return; }
    setSaving(true);
    setSubmitError("");
    try {
      const data = await invoke(sessionToken, buildClosePayload({
        paymentIds: [...selected],
        locationId: batchLocId,
        locationName: batchLoc,
        name: batchName,
        counted: resolved.counted,
        adjustments: adjRows,
        notes,
        creationKey: keyRef.current,
      }));
      onClosed?.(data);
    } catch (err) {
      setSubmitError(err?.response?.data?.error || err?.message || "The batch could not be closed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Close batch</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {loading ? "Loading candidates…" : `${selected.size} of ${candidates.length} payment${candidates.length === 1 ? "" : "s"} selected · ${usd(fromCents(expected.totalCents))} expected`}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2 dark:border-slate-700 dark:bg-slate-800/40">
          <span className="inline-flex items-center gap-1.5 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"><Filter className="h-3.5 w-3.5" />Scope</span>
          <FilterField label="Payment location">
            <FilterSelect value={locKey} onChange={(e) => { setLocKey(e.target.value); applyFilters({ locationId: e.target.value }); }}>
              <option value="">All payment locations</option>
              {locOptions.map((k) => <option key={k} value={k}>{k}</option>)}
            </FilterSelect>
          </FilterField>
          <FilterField label="Tender">
            <FilterSelect value={method} onChange={(e) => { setMethod(e.target.value); applyFilters({ method: e.target.value }); }}>
              {METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </FilterSelect>
          </FilterField>
          <FilterField label="Paid from">
            <input type="date" className={`${inputCls} w-auto`} value={dateStart} onChange={(e) => { setDateStart(e.target.value); applyFilters({ dateStart: e.target.value }); }} />
          </FilterField>
          <FilterField label="Paid to">
            <input type="date" className={`${inputCls} w-auto`} value={dateEnd} onChange={(e) => { setDateEnd(e.target.value); applyFilters({ dateEnd: e.target.value }); }} />
          </FilterField>
        </div>

        {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

        {loading && candidates.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 py-10 text-slate-500 dark:border-slate-700"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading candidates…</div>
        ) : candidates.length === 0 ? (
          <EmptyState compact icon={MapPin} title="No recorded payments match this scope."
            message="Adjust the filters, or wait until payments are recorded." className="py-8" />
        ) : (
          <div className={`max-h-52 overflow-y-auto rounded-xl border border-slate-200 transition-opacity dark:border-slate-700 ${loading ? "opacity-60" : ""}`}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="w-8 px-3 py-2"><input type="checkbox" ref={selectAllRef} checked={allSelected} onChange={toggleAll} /></th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Tender</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((p) => {
                  const id = clean(p?.id);
                  const on = selected.has(id);
                  return (
                    <tr key={id} onClick={() => toggleOne(id)} className={`cursor-pointer border-t border-slate-100 dark:border-slate-800 ${on ? "" : "opacity-45"}`}>
                      <td className="px-3 py-1.5"><input type="checkbox" checked={on} onChange={() => toggleOne(id)} onClick={(e) => e.stopPropagation()} /></td>
                      <td className="px-3 py-1.5 text-slate-500">{candidateDay(p) || "—"}</td>
                      <td className="px-3 py-1.5 font-medium text-slate-800 dark:text-slate-200">{p.invoice_number || p.invoice_id || "—"}</td>
                      <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{p.customer_display_name || "—"}</td>
                      <td className="px-3 py-1.5 text-slate-500">{candidateLocationId(p) || "—"}</td>
                      <td className="px-3 py-1.5 text-slate-500">{BUCKET_LABELS[candidateBucket(p)] || p.method}</td>
                      <td className="px-3 py-1.5 text-right font-semibold">{usd(p.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Tender</th>
                <th className="px-4 py-2 text-right">Payments</th>
                <th className="px-4 py-2 text-right">Expected</th>
                <th className="px-4 py-2 text-right">Counted</th>
                <th className="px-4 py-2 text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {TENDER_BUCKETS.map((b) => {
                const expCents = expected.buckets[b].expectedCents;
                const exp = fromCents(expCents);
                const cntCents = clean(counted[b]) === "" ? expCents : toCents(counted[b]);
                const v = varianceCents(expCents, cntCents, b === "cash" ? adjCents : 0);
                return (
                  <tr key={b} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 font-semibold text-slate-800 dark:text-slate-200">{BUCKET_LABELS[b]}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{expected.buckets[b].count}</td>
                    <td className="px-4 py-2 text-right">{usd(exp)}</td>
                    <td className="px-4 py-2 text-right">
                      <input className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                        type="number" step="0.01" min="0" placeholder={exp.toFixed(2)} value={counted[b]}
                        onChange={(e) => setCounted((c) => ({ ...c, [b]: e.target.value }))} />
                    </td>
                    <td className={`px-4 py-2 text-right font-semibold ${Math.abs(v) < 0.5 ? "text-emerald-600" : "text-amber-600"}`}>{usd(fromCents(v))}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold dark:border-slate-700 dark:bg-slate-800/60">
                <td className="px-4 py-2 text-slate-900 dark:text-slate-100">Total</td>
                <td className="px-4 py-2 text-right">{expected.count}</td>
                <td className="px-4 py-2 text-right">{usd(fromCents(expected.totalCents))}</td>
                <td className="px-4 py-2 text-right">{usd(fromCents(resolved.collectedCents))}</td>
                <td className={`px-4 py-2 text-right ${Math.abs(variance) < 0.5 ? "text-emerald-600" : "text-amber-600"}`}>{usd(fromCents(variance))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">Blank counted fields default to the expected amount. The cash adjustment is applied to the cash line.</p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>Batch location</label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select className={`${inputCls} pl-9`} value={batchLoc}
                onChange={(e) => {
                  const opt = batchLocOptions.find((o) => o.value === e.target.value);
                  setBatchLoc(e.target.value);
                  setBatchLocId(opt?.locId || "");
                }}>
                <option value="">— none —</option>
                {batchLocOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Batch name <span className="font-normal text-slate-400">(optional)</span></label>
            <input className={inputCls} value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="Defaults to the REC-#### number" />
          </div>
          <div>
            <label className={labelCls}>Cash adjustment $</label>
            <input className={inputCls} type="number" step="0.01" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className={labelCls}>Adjustment reason{adjRows.length ? " *" : ""}</label>
            <input className={inputCls} value={adjustmentNote} onChange={(e) => setAdjustmentNote(e.target.value)} placeholder="Till over/short reason" />
          </div>
        </div>

        <div className="mt-3">
          <label className={labelCls}>Batch notes</label>
          <textarea className={`${inputCls} min-h-14`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Deposit bag #, drawer, anything the next closer should know…" />
        </div>

        {Math.abs(variance) >= 0.5 && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            This close is {variance > 0 ? "over" : "short"} by {usd(fromCents(Math.abs(variance)))}. Double-check the counted amounts before closing.
          </div>
        )}
        {submitError && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{submitError}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">Cancel</button>
          <button onClick={submit} disabled={saving || loading || selected.size === 0}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Close {selected.size} payment{selected.size === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
