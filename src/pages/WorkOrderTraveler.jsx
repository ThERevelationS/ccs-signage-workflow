import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Printer } from "lucide-react";

const clean = (v) => String(v ?? "").trim();
const listRows = (v) => (Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : []);
const fmtDate = (v) => {
  const s = clean(v);
  if (!s) return "—";
  const d = s.length === 10 ? new Date(`${s}T12:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STAGE_LABELS = {
  estimating: "Estimating", sales: "Sales", permitting: "Permitting", design: "Design",
  production: "Production", fabrication: "Fabrication", installation: "Installation", completed: "Completed",
};

function TaskRow({ task }) {
  return (
    <div className="border-b border-slate-200 py-1.5 last:border-0">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-sm border-2 ${task.completed ? "border-slate-800 bg-slate-800" : "border-slate-400"}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium leading-snug ${task.completed ? "text-slate-400 line-through" : "text-slate-900"}`}>
            {clean(task.text) || "Task"}
            {task.is_milestone ? <span className="ml-1.5 rounded bg-violet-100 px-1 py-0.5 text-[10px] font-bold uppercase text-violet-700">milestone</span> : null}
            {task.is_critical_path ? <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[10px] font-bold uppercase text-red-700">critical</span> : null}
          </p>
          <p className="text-[11px] text-slate-500">
            {[clean(task.assigned_to), clean(task.due_date) && `due ${fmtDate(task.due_date)}`, task.estimated_hours ? `est ${task.estimated_hours}h` : ""].filter(Boolean).join(" · ")}
          </p>
          {Array.isArray(task.sub_tasks) && task.sub_tasks.length > 0 && (
            <div className="ml-4 mt-1 space-y-0.5">
              {task.sub_tasks.map((st, i) => (
                <div key={st.id || i} className="flex items-start gap-1.5">
                  <span className={`mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm border ${st.completed ? "border-slate-600 bg-slate-600" : "border-slate-300"}`} />
                  <span className={`text-xs ${st.completed ? "text-slate-400 line-through" : "text-slate-700"}`}>{clean(st.text)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="w-16 shrink-0 border-b border-dotted border-slate-300 pb-3 text-right text-[10px] text-slate-400">initials</div>
      </div>
    </div>
  );
}

export default function WorkOrderTraveler() {
  const [wo, setWo] = useState(null);
  const [riders, setRiders] = useState([]);
  const [permits, setPermits] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const woId = useMemo(() => new URLSearchParams(window.location.search).get("wo") || "", []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!woId) { setError("No work order specified."); setLoading(false); return; }
      try {
        const res = await base44.functions.invoke("workOrderTraveler", { work_order_id: woId });
        const data = res?.data || res;
        if (cancelled) return;
        const record = data?.work_order;
        if (!record?.id) throw new Error(data?.error || "Work order not found.");
        setWo(record);
        document.title = `Traveler — ${clean(record.title) || woId}`;
        setRiders(listRows(data?.riders).filter((r) => r?.id && !r.deleted));
        setPermits(listRows(data?.permits).filter((p) => p?.id));
        setMaterials(listRows(data?.materials).filter((m) => m?.id && ["issue", "return"].includes(clean(m.reason))));
      } catch (e) {
        if (!cancelled) setError(e?.message || "Could not load work order.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [woId]);

  const tasks = useMemo(() => (Array.isArray(wo?.notes) ? wo.notes : []), [wo]);
  const taskGroups = useMemo(() => {
    const groups = new Map();
    for (const t of tasks) {
      const key = clean(t.checklist_context) || "General";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    return [...groups.entries()];
  }, [tasks]);

  const jobCode = useMemo(() => `WO-${clean(wo?.id).toUpperCase() || "—"}`, [wo]);
  const barcodeWidths = useMemo(
    () => clean(wo?.id).split("").map((c) => (c.charCodeAt(0) % 4) + 1),
    [wo],
  );

  const permitRows = useMemo(
    () => permits.map((p) => ({
      id: p.id,
      name: clean(p.row_name) || (Array.isArray(p.office_types) ? p.office_types.map(clean).filter(Boolean).join(" + ") : "") || "Permit",
      locality: clean(p.locality_name),
      status: clean(p.permit_received_date)
        ? `Received ${fmtDate(p.permit_received_date)}`
        : clean(p.status) || "active",
      fee: Number.isFinite(Number(p.jurisdiction_fee_amount)) && clean(p.jurisdiction_fee_amount) ? Number(p.jurisdiction_fee_amount) : null,
      feeStatus: clean(p.jurisdiction_fee_status),
    })),
    [permits],
  );

  const woPermitSummary = useMemo(() => {
    if (!wo) return "";
    return [
      clean(wo.township_city) || clean(wo.county) ? `Locality: ${[clean(wo.township_city), clean(wo.county)].filter(Boolean).join(", ")}` : "",
      clean(wo.permit_code) ? `Code ${clean(wo.permit_code)}` : "",
      clean(wo.permit_class) ? `Class ${clean(wo.permit_class)}` : "",
      clean(wo.permit_number) ? `Permit # ${clean(wo.permit_number)}` : "",
      clean(wo.permit_submitted_date) ? `Submitted ${fmtDate(wo.permit_submitted_date)}` : "",
      clean(wo.permit_approved_date) ? `Approved ${fmtDate(wo.permit_approved_date)}` : "",
      clean(wo.permit_receipt_confirmed_date) ? `Received ${fmtDate(wo.permit_receipt_confirmed_date)}` : "",
      clean(wo.permitting) && clean(wo.permitting) !== "na" ? `Required: ${clean(wo.permitting)}` : "",
    ].filter(Boolean).join(" · ");
  }, [wo]);

  const cutList = useMemo(() => {
    if (!wo) return [];
    const rows = [];
    for (const p of Array.isArray(wo.products) ? wo.products : []) {
      const label = clean(p?.description) || clean(p?.customer_description) || clean(p?.product_type);
      const qty = Number(p?.quantity) || 0;
      if (!label && !qty) continue;
      rows.push({ id: p.id, label: label || "Item", type: clean(p.product_type || p.category), qty: qty || null });
    }
    for (let i = 1; i <= 6; i += 1) {
      const label = clean(wo[`product_${i}`]);
      if (label) rows.push({ id: `legacy-${i}`, label, type: "", qty: null });
    }
    return rows;
  }, [wo]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-violet-600" /></div>;
  }
  if (error || !wo) {
    return <div className="flex min-h-screen items-center justify-center p-8 text-center"><p className="text-red-600">{error || "Work order not found."}</p></div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl bg-white p-6 shadow print:shadow-none">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <p className="text-xs text-slate-500">Print preview — use your browser's print dialog to paper or PDF.</p>
          <button type="button" onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>

        {/* Header */}
        <div className="border-b-2 border-slate-900 pb-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Shop Traveler</p>
              <h1 className="text-2xl font-bold text-slate-900">{clean(wo.title) || "Work Order"}</h1>
              <p className="text-sm text-slate-600">{clean(wo.client_name) || "—"}</p>
            </div>
            <div className="text-right text-[11px] text-slate-600">
              <div className="inline-block rounded border-2 border-slate-900 px-3 py-1.5">
                <div className="flex h-7 items-stretch justify-center gap-px">
                  {barcodeWidths.map((w, i) => <div key={i} className="bg-slate-900" style={{ width: `${w}px` }} />)}
                </div>
                <p className="mt-1 text-center font-mono text-[10px] font-bold tracking-[0.3em] text-slate-900">{jobCode}</p>
              </div>
              <p className="mt-1">Printed {new Date().toLocaleDateString()}</p>
              {wo.asap ? <p className="mt-1 inline-block rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">ASAP</p> : null}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px]">
            {[
              ["Stage", STAGE_LABELS[clean(wo.current_stage)] || clean(wo.current_stage) || "—"],
              ["Start", fmtDate(wo.start_date)],
              ["Due", fmtDate(wo.due_date)],
              ["Assigned", clean(wo.assigned_to) || "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded border border-slate-300 px-2 py-1.5">
                <p className="font-bold uppercase text-slate-400">{k}</p>
                <p className="font-semibold text-slate-800">{v}</p>
              </div>
            ))}
          </div>
        </div>

        {clean(wo.description) && (
          <div className="mt-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Scope / Description</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{clean(wo.description)}</p>
          </div>
        )}

        {wo.image_url && (
          <div className="mt-4">
            <img src={wo.image_url} alt={clean(wo.title)} className="max-h-56 rounded border border-slate-200 object-contain" />
          </div>
        )}

        {/* Permits */}
        {(permitRows.length > 0 || woPermitSummary) && (
          <div className="mt-4 break-inside-avoid">
            <h2 className="border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Permits{permitRows.length > 0 ? ` (${permitRows.length})` : ""}
            </h2>
            {permitRows.length > 0 ? (
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] font-bold uppercase text-slate-400">
                    <th className="py-1 pr-2">Permit</th>
                    <th className="py-1 pr-2">Locality</th>
                    <th className="py-1 pr-2">Status</th>
                    <th className="py-1 text-right">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {permitRows.map((p) => (
                    <tr key={p.id} className="border-t border-slate-200">
                      <td className="py-1.5 pr-2 font-medium text-slate-800">{p.name}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{p.locality || "—"}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{p.status}</td>
                      <td className="py-1.5 text-right text-slate-600">
                        {p.fee != null ? `${usd(p.fee)}${p.feeStatus ? ` (${p.feeStatus})` : ""}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-1.5 text-xs text-slate-600">{woPermitSummary}</p>
            )}
          </div>
        )}

        {/* Cut list */}
        {cutList.length > 0 && (
          <div className="mt-4 break-inside-avoid">
            <h2 className="border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Cut list ({cutList.length})
            </h2>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase text-slate-400">
                  <th className="py-1 pr-2">Item</th>
                  <th className="py-1 pr-2">Type</th>
                  <th className="py-1 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {cutList.map((c) => (
                  <tr key={c.id} className="border-t border-slate-200">
                    <td className="py-1.5 pr-2 font-medium text-slate-800">{c.label}</td>
                    <td className="py-1.5 pr-2 text-slate-600">{c.type || "—"}</td>
                    <td className="py-1.5 text-right font-mono text-slate-800">{c.qty ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Materials / Inventory pulls */}
        {materials.length > 0 && (
          <div className="mt-4 break-inside-avoid">
            <h2 className="border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Materials / Inventory pulls ({materials.length})
            </h2>
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase text-slate-400">
                  <th className="py-1 pr-2">Item</th>
                  <th className="py-1 pr-2">Reason</th>
                  <th className="py-1 pr-2 text-right">Qty</th>
                  <th className="py-1 text-right">Ext cost</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => (
                  <tr key={m.id} className="border-t border-slate-200">
                    <td className="py-1.5 pr-2 font-medium text-slate-800">{clean(m.item_label) || "Item"}</td>
                    <td className="py-1.5 pr-2 text-slate-600">{clean(m.reason) || "—"}</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-slate-800">{Math.abs(Number(m.delta) || 0)}</td>
                    <td className="py-1.5 text-right text-slate-600">{usd(Math.abs(Number(m.delta) || 0) * (Number(m.unit_cost) || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tasks */}
        <div className="mt-4">
          <h2 className="border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Production Checklist ({tasks.filter((t) => t.completed).length}/{tasks.length} done)
          </h2>
          {taskGroups.length === 0 ? (
            <p className="py-3 text-sm text-slate-400">No tasks on this work order.</p>
          ) : taskGroups.map(([group, items]) => (
            <div key={group} className="mt-2">
              {taskGroups.length > 1 && <p className="text-[11px] font-bold uppercase text-slate-400">{group}</p>}
              {items.map((t, i) => <TaskRow key={t.id || i} task={t} />)}
            </div>
          ))}
        </div>

        {/* Riders */}
        {riders.length > 0 && (
          <div className="mt-5 break-inside-avoid">
            <h2 className="border-b border-slate-300 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Riders ({riders.length})
            </h2>
            {riders.map((r) => (
              <div key={r.id} className="mt-2 rounded border border-slate-300 p-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">{clean(r.title)}</p>
                  <p className="text-[11px] text-slate-500">{STAGE_LABELS[clean(r.rider_stage) || clean(r.current_stage)] || "—"} · due {fmtDate(r.due_date)}</p>
                </div>
                {clean(r.description) && <p className="mt-1 text-xs text-slate-600">{clean(r.description)}</p>}
                {Array.isArray(r.notes) && r.notes.length > 0 && (
                  <div className="mt-1.5">
                    {r.notes.map((t, i) => <TaskRow key={t.id || i} task={t} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Files */}
        {Array.isArray(wo.files) && wo.files.length > 0 && (
          <div className="mt-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Attached Files</h2>
            <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
              {wo.files.map((f, i) => <li key={f.id || i}>{clean(f.name) || "file"}</li>)}
            </ul>
          </div>
        )}

        {/* Sign-off */}
        <div className="mt-8 grid grid-cols-3 gap-6 break-inside-avoid">
          {["Received by", "Completed by", "QC / Date"].map((label) => (
            <div key={label}>
              <div className="h-10 border-b border-slate-400" />
              <p className="mt-1 text-center text-[10px] font-bold uppercase text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between border-t border-slate-300 pt-2 text-[10px] text-slate-400">
          <span>Shop Traveler — {clean(wo.title) || "Work Order"} · {jobCode}</span>
          <span>Printed {new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
        </div>
      </div>
    </div>
  );
}