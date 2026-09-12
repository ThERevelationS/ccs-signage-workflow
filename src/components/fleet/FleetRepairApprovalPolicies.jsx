import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import FleetConfirmDialog from "@/components/fleet/FleetConfirmDialog";
import { DollarSign, Loader2, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";

const emptyPolicy = () => ({
  name: "",
  approval_tier: "",
  minimum_amount: "0",
  maximum_amount: "",
  approval_required: true,
  enabled: true,
  notes: "",
  sort_order: "0",
});
const money = value => Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

export default function FleetRepairApprovalPolicies() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);
  const [deletePolicy, setDeletePolicy] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await base44.functions.invoke("fleetRepairEstimateAction", { action: "policy_list" });
      if (data?.error) throw new Error(data.error);
      setPolicies(data?.policies || []);
    } catch (err) {
      setError(err?.message || "Unable to load Fleet repair approval policies.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const sorted = useMemo(() => policies.slice().sort((a, b) => Number(a.minimum_amount || 0) - Number(b.minimum_amount || 0)), [policies]);

  const save = async () => {
    if (!editor) return;
    const existing = editor.id ? policies.find(row => row.id === editor.id) : null;
    const min = Number(editor.minimum_amount || 0);
    const max = editor.maximum_amount === "" ? 0 : Number(editor.maximum_amount || 0);
    if (!editor.name.trim()) { setError("Policy name is required."); return; }
    if (!Number.isFinite(min) || min < 0 || !Number.isFinite(max) || max < 0) { setError("Approval amounts must be valid non-negative numbers."); return; }
    if (max > 0 && max < min) { setError("Maximum amount must be greater than or equal to the minimum, or blank for no maximum."); return; }
    setBusy("save");
    setError("");
    try {
      const payload = {
        action: existing ? "policy_update" : "policy_create",
        ...(existing ? { id: existing.id, expected_updated_date: existing.updated_date } : { creation_key: `${new Date().toISOString().slice(0,10)}-${crypto.randomUUID()}` }),
        policy: {
          name: editor.name.trim(),
          approval_tier: editor.approval_tier.trim() || editor.name.trim(),
          minimum_amount: min,
          maximum_amount: max,
          approval_required: editor.approval_required !== false,
          enabled: editor.enabled !== false,
          notes: editor.notes.trim(),
          sort_order: Number(editor.sort_order || 0),
        },
      };
      const { data } = await base44.functions.invoke("fleetRepairEstimateAction", payload);
      if (data?.error) throw new Error(data.error);
      setEditor(null);
      await load();
    } catch (err) {
      setError(err?.message || "Unable to save repair approval policy.");
    } finally {
      setBusy("");
    }
  };

  const toggle = async policy => {
    setBusy(policy.id);
    setError("");
    try {
      const { data } = await base44.functions.invoke("fleetRepairEstimateAction", {
        action: "policy_update",
        id: policy.id,
        expected_updated_date: policy.updated_date,
        policy: { ...policy, enabled: policy.enabled === false },
      });
      if (data?.error) throw new Error(data.error);
      await load();
    } catch (err) {
      setError(err?.message || "Unable to update repair approval policy.");
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (!deletePolicy) return;
    setBusy("delete");
    setError("");
    try {
      const { data } = await base44.functions.invoke("fleetRepairEstimateAction", { action: "policy_delete", id: deletePolicy.id });
      if (data?.error) throw new Error(data.error);
      setDeletePolicy(null);
      await load();
    } catch (err) {
      setError(err?.message || "Unable to delete repair approval policy.");
    } finally {
      setBusy("");
    }
  };

  return <section className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm">
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h2 className="font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2"><DollarSign className="w-5 h-5 text-indigo-500"/>Repair Estimate Approval Thresholds</h2>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Fleet-only approval tiers. They do not affect CCS estimating, customer pricing, signage WorkOrders, or Master Inventory.</p>
      </div>
      <button type="button" onClick={() => setEditor({ ...emptyPolicy() })} className="min-h-11 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold"><Plus className="w-4 h-4"/>Add Threshold</button>
    </div>

    <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/20 px-3 py-2 text-xs text-indigo-800 dark:text-indigo-300 flex gap-2"><ShieldCheck className="w-4 h-4 shrink-0 mt-0.5"/><span>If a submitted estimate lands in a tier requiring approval, Fleet blocks starting and completing that work order until an admin approves it. A tier marked “No approval” auto-approves on submission.</span></div>
    {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 px-3 py-2 text-sm">{error}</div>}

    <div className="mt-4 space-y-2">
      {loading ? <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400"/></div> : sorted.length ? sorted.map(policy => {
        const openEnded = !Number(policy.maximum_amount || 0);
        return <div key={policy.id} className={`rounded-xl border p-3 sm:p-4 ${policy.enabled === false ? "border-gray-200 bg-gray-50 opacity-70 dark:border-slate-800 dark:bg-slate-950/40" : "border-gray-200 dark:border-slate-700"}`}>
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-gray-900 dark:text-slate-100">{policy.name}</span><span className={`text-[10px] rounded-full px-2 py-1 font-bold ${policy.approval_required !== false ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"}`}>{policy.approval_required !== false ? "APPROVAL REQUIRED" : "AUTO APPROVE"}</span>{policy.enabled === false && <span className="text-[10px] rounded-full px-2 py-1 font-bold bg-gray-200 text-gray-600 dark:bg-slate-800 dark:text-slate-300">DISABLED</span>}</div>
              <div className="text-sm text-gray-600 dark:text-slate-300 mt-1">{money(policy.minimum_amount)} {openEnded ? "and above" : `to ${money(policy.maximum_amount)}`} · Tier: {policy.approval_tier || policy.name}</div>
              {policy.notes && <div className="text-xs text-gray-500 dark:text-slate-400 mt-2">{policy.notes}</div>}
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button type="button" onClick={() => toggle(policy)} disabled={!!busy} className="min-h-10 px-3 rounded-lg border border-gray-300 dark:border-slate-700 text-xs font-semibold disabled:opacity-50">{busy === policy.id ? "Saving…" : policy.enabled === false ? "Enable" : "Disable"}</button>
              <button type="button" onClick={() => setEditor({ ...policy, minimum_amount: String(policy.minimum_amount ?? 0), maximum_amount: Number(policy.maximum_amount || 0) ? String(policy.maximum_amount) : "", sort_order: String(policy.sort_order ?? 0) })} className="min-h-10 px-3 rounded-lg border border-indigo-300 text-indigo-700 dark:text-indigo-300 text-xs font-semibold inline-flex items-center gap-1"><Pencil className="w-3.5 h-3.5"/>Edit</button>
              <button type="button" onClick={() => setDeletePolicy(policy)} className="min-h-10 min-w-10 rounded-lg border border-red-300 text-red-700 dark:border-red-900 dark:text-red-300 inline-flex items-center justify-center" aria-label={`Delete ${policy.name}`}><Trash2 className="w-4 h-4"/></button>
            </div>
          </div>
        </div>;
      }) : <div className="rounded-lg border border-dashed border-gray-300 dark:border-slate-700 px-4 py-6 text-center text-sm text-gray-500 dark:text-slate-400">No approval thresholds are configured. Submitted Fleet repair estimates will not require approval until you add a policy.</div>}
    </div>

    {editor && <div className="fixed inset-0 z-[120] bg-black/60 p-3 sm:p-6 overflow-y-auto"><div role="dialog" aria-modal="true" aria-labelledby="repair-policy-title" className="mx-auto max-w-2xl rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"><div className="p-4 border-b border-gray-200 dark:border-slate-800 flex items-start justify-between gap-3"><div><h3 id="repair-policy-title" className="font-bold text-lg text-gray-900 dark:text-slate-100">{editor.id ? "Edit" : "Add"} Approval Threshold</h3><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Use a blank maximum for an open-ended top tier.</p></div><button type="button" onClick={() => !busy && setEditor(null)} className="min-h-11 min-w-11 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800" aria-label="Close"><X className="w-5 h-5 mx-auto"/></button></div><div className="p-4 space-y-4">
      <div className="grid sm:grid-cols-2 gap-3"><Field label="Policy name"><input value={editor.name} onChange={e => setEditor(v => ({ ...v, name: e.target.value }))} className="field" placeholder="Manager approval"/></Field><Field label="Approval tier"><input value={editor.approval_tier} onChange={e => setEditor(v => ({ ...v, approval_tier: e.target.value }))} className="field" placeholder="Manager"/></Field></div>
      <div className="grid sm:grid-cols-2 gap-3"><Field label="Minimum amount"><input type="number" min="0" step="0.01" value={editor.minimum_amount} onChange={e => setEditor(v => ({ ...v, minimum_amount: e.target.value }))} className="field"/></Field><Field label="Maximum amount"><input type="number" min="0" step="0.01" value={editor.maximum_amount} onChange={e => setEditor(v => ({ ...v, maximum_amount: e.target.value }))} className="field" placeholder="Blank = no maximum"/></Field></div>
      <label className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-slate-700 p-3 cursor-pointer"><input type="checkbox" checked={editor.approval_required !== false} onChange={e => setEditor(v => ({ ...v, approval_required: e.target.checked }))} className="mt-1"/><span><span className="font-semibold text-sm text-gray-900 dark:text-slate-100">Require admin approval</span><span className="block text-xs text-gray-500 dark:text-slate-400 mt-1">When off, submitted estimates in this tier are automatically approved.</span></span></label>
      <label className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-slate-700 p-3 cursor-pointer"><input type="checkbox" checked={editor.enabled !== false} onChange={e => setEditor(v => ({ ...v, enabled: e.target.checked }))} className="mt-1"/><span><span className="font-semibold text-sm text-gray-900 dark:text-slate-100">Policy enabled</span><span className="block text-xs text-gray-500 dark:text-slate-400 mt-1">Disabled thresholds are ignored during estimate submission.</span></span></label>
      <Field label="Notes"><textarea rows={3} value={editor.notes} onChange={e => setEditor(v => ({ ...v, notes: e.target.value }))} className="field" placeholder="Optional approval guidance"/></Field>
      <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setEditor(null)} disabled={!!busy} className="min-h-11 px-4 rounded-lg border border-gray-300 dark:border-slate-700 font-semibold">Cancel</button><button type="button" onClick={save} disabled={!!busy} className="min-h-11 px-4 rounded-lg bg-indigo-600 text-white font-semibold inline-flex items-center gap-2">{busy === "save" && <Loader2 className="w-4 h-4 animate-spin"/>}Save Threshold</button></div>
    </div><style>{`.field{width:100%;min-height:44px;border:1px solid rgb(209 213 219);border-radius:.5rem;background:transparent;padding:.625rem .75rem;font-size:.875rem}.dark .field{border-color:rgb(51 65 85)}`}</style></div></div>}

    <FleetConfirmDialog open={!!deletePolicy} title={`Delete ${deletePolicy?.name || "approval policy"}?`} description="Future repair estimates will no longer use this threshold. Existing estimate approvals and work-order history are not changed." confirmLabel="Delete Threshold" tone="warning" busy={busy === "delete"} onCancel={() => busy !== "delete" && setDeletePolicy(null)} onConfirm={remove}/>
  </section>;
}

function Field({ label, children }) { return <label className="block"><span className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">{label}</span>{children}</label>; }
