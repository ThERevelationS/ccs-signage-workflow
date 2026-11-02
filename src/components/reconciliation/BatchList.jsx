import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, RefreshCw, Scale, Vault } from "lucide-react";
import {
  DataTableShell,
  FilterBar,
  FilterField,
  FilterSelect,
  StatusChip,
  Td,
  Tr,
  filterInputCls,
  statusLabel,
} from "@/components/kit";
import {
  batchCollected,
  batchExpected,
  batchName,
  batchPaymentCount,
  batchStatusTone,
  batchVariance,
  buildBatchFilters,
  clean,
} from "./reconUiModel";

const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (iso) => {
  const d = clean(iso);
  if (!d) return "—";
  const parsed = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString();
};

const VarianceBadge = ({ value }) => {
  const v = Number(value) || 0;
  if (Math.abs(v) < 0.005) return <StatusChip tone="emerald" label="Balanced" />;
  return <StatusChip tone={v > 0 ? "sky" : "red"} label={`${v > 0 ? "Over" : "Short"} ${usd(Math.abs(v))}`} />;
};

const inputCls = filterInputCls;

// Batch table backed by the I-03 list_batches action: status / location /
// close-date filters apply server-side, each row opens the BatchDetail modal.
// `reloadToken` is the page's coordination bump — it changes whenever the
// bootstrap reload runs (after a close or reopen) so this list re-queries.
export default function BatchList({
  sessionToken,
  invoke,
  locations = [],
  salesLocations = [],
  onOpen,
  reloadToken = 0,
}) {
  const [status, setStatus] = useState("");
  const [locationId, setLocationId] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Location filter options: SalesLocation registry names first (new batches
  // resolve their label through it), then any legacy batch location names the
  // bootstrap reported. list_batches matches the value against BOTH
  // location_id and the stored location name, so a name key covers old rows.
  const locationOptions = useMemo(() => {
    const opts = [];
    const seen = new Set();
    for (const loc of salesLocations || []) {
      const name = clean(loc?.name);
      if (!name || loc?.active === false || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      opts.push({ value: name, label: clean(loc?.code) ? `${name} (${clean(loc.code)})` : name });
    }
    for (const loc of locations || []) {
      const name = clean(loc);
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      opts.push({ value: name, label: name });
    }
    return opts;
  }, [salesLocations, locations]);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    try {
      const data = await invoke(sessionToken, {
        action: "list_batches",
        ...buildBatchFilters({ status, locationId, dateStart, dateEnd }),
      });
      setBatches(Array.isArray(data?.batches) ? data.batches : []);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Batch list failed to load.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, invoke, status, locationId, dateStart, dateEnd]);

  useEffect(() => { load(); }, [load, reloadToken]);

  const filtered = status || locationId || dateStart || dateEnd;

  return (
    <div>
      <FilterBar>
        <FilterField label="Status">
          <FilterSelect value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="reopened">Reopened</option>
          </FilterSelect>
        </FilterField>
        <FilterField label="Location">
          <FilterSelect value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">All locations</option>
            {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </FilterSelect>
        </FilterField>
        <FilterField label="Closed from">
          <input type="date" className={`${inputCls} w-auto`} value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
        </FilterField>
        <FilterField label="Closed to">
          <input type="date" className={`${inputCls} w-auto`} value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
        </FilterField>
        <div className="ml-auto flex items-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          <button type="button" onClick={load}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
            <RefreshCw className="h-4 w-4" />Refresh
          </button>
        </div>
      </FilterBar>

      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

      {loading && batches.length === 0 ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading batches…
        </div>
      ) : (
        <DataTableShell
          head={[
            "Batch",
            "Date",
            "Location",
            { label: "Payments", className: "text-right" },
            { label: "Expected", className: "text-right" },
            { label: "Collected", className: "text-right" },
            "Variance",
            "Status",
            "By",
            { label: "", className: "px-2" },
          ]}
          isEmpty={batches.length === 0}
          emptyState={filtered
            ? { icon: Vault, title: "No batches match these filters.", message: "Loosen the status, location, or date filters." }
            : { icon: Vault, title: "No reconciliation batches yet.", message: "Closed batches will appear here — use Close batch to sweep waiting payments." }}
        >
          {batches.map((b) => (
            <Tr key={b.id} onClick={() => onOpen?.(b)} className="cursor-pointer">
              <Td className="font-semibold text-slate-900 dark:text-slate-100">
                <span className="inline-flex items-center gap-1.5">
                  <Scale className="h-3.5 w-3.5 text-violet-500" />
                  {batchName(b)}
                  {batchName(b) !== clean(b?.batch_number) && clean(b?.batch_number) && (
                    <span className="text-xs font-normal text-slate-400">({b.batch_number})</span>
                  )}
                </span>
              </Td>
              <Td className="text-slate-500">{fmtDate(b.closed_at)}</Td>
              <Td className="text-slate-700 dark:text-slate-300">{clean(b.location) || clean(b.location_id) || "—"}</Td>
              <Td className="text-right text-slate-500">{batchPaymentCount(b)}</Td>
              <Td className="text-right text-slate-600 dark:text-slate-300">{usd(batchExpected(b))}</Td>
              <Td className="text-right font-medium">{usd(batchCollected(b))}</Td>
              <Td><VarianceBadge value={batchVariance(b)} /></Td>
              <Td><StatusChip tone={batchStatusTone(b.status)} label={statusLabel(b.status || "closed")} /></Td>
              <Td className="text-slate-500">{clean(b.closed_by) || clean(b.created_by) || "—"}</Td>
              <Td className="px-2 text-slate-400"><ChevronRight className="h-4 w-4" /></Td>
            </Tr>
          ))}
        </DataTableShell>
      )}
    </div>
  );
}
