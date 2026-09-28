import { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import FleetConfirmDialog from "@/components/fleet/FleetConfirmDialog";
import { AlertTriangle, DollarSign, Loader2, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";

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
const policyMin = policy => Math.max(0, Number(policy?.minimum_amount || 0));
const policyMax = policy => {
  const value = Number(policy?.maximum_amount || 0);
  return Number.isFinite(value) && value > 0 ? value : Infinity;
};
const rangesOverlap = (a, b) => policyMin(a) <= policyMax(b) && policyMin(b) <= policyMax(a);
const policyRangeText = policy => policyMax(policy) === Infinity ? `${money(policyMin(policy))} and above` : `${money(policyMin(policy))} to ${money(policyMax(policy))}`;
const policyDesired = policy => ({
  name: String(policy?.name || "").trim(),
  approval_tier: String(policy?.approval_tier || policy?.name || "").trim(),
  minimum_amount: Number(policy?.minimum_amount || 0),
  maximum_amount: Number(policy?.maximum_amount || 0),
  approval_required: policy?.approval_required !== false,
  enabled: policy?.enabled !== false,
  notes: String(policy?.notes || "").trim(),
  sort_order: Number(policy?.sort_order || 0),
});
const policyMatches = (row, desired) => {
  const actual = policyDesired(row);
  return Object.keys(desired).every(key => actual[key] === desired[key]);
};
const definiteMutationFailure = err => {
  if (err?.fleetDefinite) return true;
  const status = Number(err?.response?.status || 0);
  return status >= 400 && status < 500;
};
const responseError = message => {
  const err = new Error(message);
  err.fleetDefinite = true;
  return err;
};

export default function FleetRepairApprovalPolicies() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const [uncertain, setUncertain] = useState(null);
  const [editor, setEditor] = useState(null);
  const [deletePolicy, setDeletePolicy] = useState(null);
  const addButtonRef = useRef(null);
  const editorDialogRef = useRef(null);
  const editorNameRef = useRef(null);
  const editorPreviousFocusRef = useRef(null);
  const busyRef = useRef(busy);
  const uncertainRef = useRef(uncertain);
  const recoveryRef = useRef(null);
  const refreshRetryRef = useRef(null);
  busyRef.current = busy;
  uncertainRef.current = uncertain;

  const fetchPolicies = async () => {
    const { data } = await base44.functions.invoke("fleetRepairEstimateAction", { action: "policy_list" });
    if (data?.error) throw responseError(data.error);
    if (!Array.isArray(data?.policies)) throw new Error("The policy list response could not be verified.");
    return data.policies;
  };
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchPolicies();
      setPolicies(rows);
      setLoadFailed(false);
      setRefreshWarning("");
      return true;
    } catch (err) {
      setLoadFailed(true);
      setError(err?.message || "Unable to load Fleet repair approval policies.");
      return false;
    } finally {
      setLoading(false);
    }
  };
  const refreshAfterMutation = async verb => {
    try {
      setPolicies(await fetchPolicies());
      setRefreshWarning("");
      return true;
    } catch {
      setRefreshWarning(`${verb} succeeded, but the policy list could not refresh. Use Retry refresh; do not repeat the operation.`);
      return false;
    }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!editor) return undefined;
    editorPreviousFocusRef.current = document.activeElement;
    requestAnimationFrame(() => editorNameRef.current?.focus());
    const handleKey = event => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!busyRef.current && !uncertainRef.current) setEditor(null);
        return;
      }
      if (event.key !== "Tab" || !editorDialogRef.current) return;
      const controls = [...editorDialogRef.current.querySelectorAll("button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)")]
        .filter(element => element.getClientRects().length > 0);
      if (!controls.length) { event.preventDefault(); editorDialogRef.current.focus(); return; }
      const first = controls[0], last = controls[controls.length - 1], active = document.activeElement;
      if (!editorDialogRef.current.contains(active) || active === editorDialogRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      requestAnimationFrame(() => {
        if (editorPreviousFocusRef.current?.isConnected) editorPreviousFocusRef.current.focus();
        else addButtonRef.current?.focus();
      });
    };
  }, [!!editor]);

  useEffect(() => {
    if (uncertain && !busy) requestAnimationFrame(() => recoveryRef.current?.focus());
  }, [uncertain, busy]);

  const mutationBlocked = !!busy || !!uncertain || loading || loadFailed;
  const editorLocked = !!busy || !!uncertain;
  const retryRefresh = async () => {
    const ok = await load();
    requestAnimationFrame(() => (ok ? addButtonRef.current : refreshRetryRef.current)?.focus());
  };
  const sorted = useMemo(() => policies.slice().sort((a, b) => Number(a.minimum_amount || 0) - Number(b.minimum_amount || 0)), [policies]);
  const coverage = useMemo(() => {
    const enabled = policies.filter(policy => policy.enabled !== false).slice().sort((a,b) => policyMin(a) - policyMin(b));
    const findings = [];
    if (!enabled.length) return { enabled, findings:[{ tone:"warning", text:"No enabled approval policies exist. Every submitted Fleet repair estimate currently matches no policy and follows the no-threshold auto-approval behavior." }] };
    if (policyMin(enabled[0]) > 0) findings.push({ tone:"warning", text:`Estimates below ${money(policyMin(enabled[0]))} match no policy and auto-approve.` });
    for (let index = 0; index < enabled.length - 1; index += 1) {
      const current = enabled[index];
      const next = enabled[index + 1];
      const currentMax = policyMax(current);
      const nextMin = policyMin(next);
      if (currentMax === Infinity || nextMin <= currentMax) {
        findings.push({ tone:"overlap", text:`${current.name} overlaps ${next.name}. In the overlapping amount range, the enabled policy with the higher minimum amount wins.` });
      } else if (nextMin - currentMax > 0.01) {
        findings.push({ tone:"warning", text:`There is an uncovered gap above ${money(currentMax)} and below ${money(nextMin)}. Estimates in that gap auto-approve.` });
      }
    }
    const last = enabled[enabled.length - 1];
    if (policyMax(last) !== Infinity) findings.push({ tone:"warning", text:`Estimates above ${money(policyMax(last))} match no policy and auto-approve.` });
    return { enabled, findings };
  }, [policies]);
  const editorOverlaps = useMemo(() => {
    if (!editor || editor.enabled === false) return [];
    const current = { minimum_amount:Number(editor.minimum_amount || 0), maximum_amount:editor.maximum_amount === "" ? 0 : Number(editor.maximum_amount || 0) };
    if (!Number.isFinite(current.minimum_amount) || !Number.isFinite(Number(current.maximum_amount || 0))) return [];
    return policies.filter(policy => policy.id !== editor.id && policy.enabled !== false && rangesOverlap(current, policy));
  }, [editor, policies]);

  const openCreate = () => {
    if (mutationBlocked) return;
    setError(""); setNotice(""); setRefreshWarning("");
    setEditor({ ...emptyPolicy(), _creation_key: `fleet-policy-${crypto.randomUUID()}` });
  };
  const openEdit = policy => {
    if (mutationBlocked) return;
    setError(""); setNotice(""); setRefreshWarning("");
    setEditor({ ...policy, minimum_amount: String(policy.minimum_amount ?? 0), maximum_amount: Number(policy.maximum_amount || 0) ? String(policy.maximum_amount) : "", sort_order: String(policy.sort_order ?? 0) });
  };
  const replacePolicy = row => setPolicies(current => {
    const exists = current.some(policy => policy.id === row.id);
    return exists ? current.map(policy => policy.id === row.id ? row : policy) : [...current, row];
  });
  const checkUncertain = async () => {
    if (!uncertain || busy) return;
    const pending = uncertain;
    setBusy("recover"); setError(""); setRefreshWarning("");
    try {
      const rows = await fetchPolicies();
      setPolicies(rows);
      setLoadFailed(false);
      if (pending.kind === "save" && pending.mode === "create") {
        const row = rows.find(policy => policy.creation_key === pending.creation_key);
        if (!row) {
          setUncertain(null);
          setNotice("Server confirms the new threshold was not created. Review the editor before saving again.");
          requestAnimationFrame(() => editorNameRef.current?.focus());
        } else if (policyMatches(row, pending.desired)) {
          setUncertain(null); setEditor(null);
          setNotice("Server confirms the new threshold was saved. The create operation was not repeated.");
        } else {
          setError("A threshold exists with this creation identity but its current values differ. Close and review the current policies; do not repeat the save.");
        }
        return;
      }
      if (pending.kind === "save" && pending.mode === "update") {
        const row = rows.find(policy => policy.id === pending.id);
        if (!row) {
          setError("The edited threshold no longer exists. Close the editor and review current policies; do not repeat the save.");
        } else if (policyMatches(row, pending.desired) && row.updated_date !== pending.expected_updated_date) {
          setUncertain(null); setEditor(null);
          setNotice("Server confirms the threshold update is present. The update was not repeated.");
        } else if (row.updated_date === pending.expected_updated_date) {
          setUncertain(null);
          setNotice("Server confirms the threshold was not updated. Review the editor before saving again.");
          requestAnimationFrame(() => editorNameRef.current?.focus());
        } else {
          setUncertain(null); setEditor(null);
          setNotice("The threshold changed while the save response was uncertain. Current server values were loaded; review them before making another edit.");
        }
        return;
      }
      if (pending.kind === "toggle") {
        const row = rows.find(policy => policy.id === pending.id);
        setUncertain(null);
        if (!row) {
          setNotice("The threshold no longer exists. Current server policies were loaded; no toggle was repeated.");
        } else if ((row.enabled !== false) === pending.enabled && row.updated_date !== pending.expected_updated_date) {
          setNotice(`Server confirms ${row.name} is now ${pending.enabled ? "enabled" : "disabled"}. The toggle was not repeated.`);
        } else if (row.updated_date === pending.expected_updated_date) {
          setNotice(`Server confirms ${row.name} was not changed. Review it before trying the toggle again.`);
        } else {
          setNotice(`${row.name} changed while the toggle response was uncertain. Current server values were loaded; review them before another change.`);
        }
        requestAnimationFrame(() => addButtonRef.current?.focus());
        return;
      }
      if (pending.kind === "delete") {
        const row = rows.find(policy => policy.id === pending.id);
        setUncertain(null);
        if (!row) {
          setNotice("Server confirms the threshold is deleted. The deletion was not repeated.");
        } else if (row.updated_date === pending.expected_updated_date) {
          setNotice(`Server confirms ${row.name} was not deleted. Review it before trying again.`);
        } else {
          setNotice(`${row.name} changed after the delete confirmation. It was not deleted; current server values were loaded for review.`);
        }
        requestAnimationFrame(() => addButtonRef.current?.focus());
      }
    } catch (err) {
      setError(`${err?.message || "Unable to verify the policy operation."} The operation remains unconfirmed; do not repeat it.`);
    } finally {
      setBusy("");
    }
  };

  const save = async () => {
    if (!editor || mutationBlocked) return;
    const existing = !!editor.id;
    const min = Number(editor.minimum_amount || 0);
    const max = editor.maximum_amount === "" ? 0 : Number(editor.maximum_amount || 0);
    if (!editor.name.trim()) { setError("Policy name is required."); return; }
    if (!Number.isFinite(min) || min < 0 || !Number.isFinite(max) || max < 0) { setError("Approval amounts must be valid non-negative numbers."); return; }
    if (max > 0 && max < min) { setError("Maximum amount must be greater than or equal to the minimum, or blank for no maximum."); return; }
    const desired = policyDesired({
      ...editor,
      minimum_amount: min,
      maximum_amount: max,
      approval_tier: editor.approval_tier.trim() || editor.name.trim(),
    });
    const expectedUpdatedDate = existing ? String(editor.updated_date || "") : "";
    const creationKey = existing ? "" : String(editor._creation_key || "");
    setBusy("save"); setError(""); setNotice(""); setRefreshWarning("");
    try {
      const payload = {
        action: existing ? "policy_update" : "policy_create",
        ...(existing ? { id: editor.id, expected_updated_date: expectedUpdatedDate } : { creation_key: creationKey }),
        policy: desired,
      };
      const { data } = await base44.functions.invoke("fleetRepairEstimateAction", payload);
      if (data?.error) throw responseError(data.error);
      if (!data?.policy?.id) throw new Error("The policy save response could not be verified.");
      replacePolicy(data.policy);
      setEditor(null);
      setNotice(existing ? "Approval threshold updated." : "Approval threshold created.");
      await refreshAfterMutation(existing ? "Threshold update" : "Threshold creation");
    } catch (err) {
      if (definiteMutationFailure(err)) {
        setError(err?.message || "Unable to save repair approval policy.");
      } else {
        setUncertain({ kind:"save", mode:existing ? "update" : "create", id:editor.id || "", expected_updated_date:expectedUpdatedDate, creation_key:creationKey, desired });
        setError("The policy save response could not be confirmed. Check current server status before attempting another save.");
      }
    } finally {
      setBusy("");
    }
  };

  const toggle = async policy => {
    if (mutationBlocked) return;
    const enabled = policy.enabled === false;
    setBusy(policy.id); setError(""); setNotice(""); setRefreshWarning("");
    try {
      const { data } = await base44.functions.invoke("fleetRepairEstimateAction", {
        action: "policy_update",
        id: policy.id,
        expected_updated_date: policy.updated_date,
        policy: { ...policy, enabled },
      });
      if (data?.error) throw responseError(data.error);
      if (!data?.policy?.id) throw new Error("The threshold update response could not be verified.");
      replacePolicy(data.policy);
      setNotice(`${policy.name} ${enabled ? "enabled" : "disabled"}.`);
      await refreshAfterMutation("Threshold update");
    } catch (err) {
      if (definiteMutationFailure(err)) setError(err?.message || "Unable to update repair approval policy.");
      else {
        setUncertain({ kind:"toggle", id:policy.id, expected_updated_date:policy.updated_date, enabled });
        setError("The enable/disable response could not be confirmed. Check current server status before trying another policy change.");
      }
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (!deletePolicy || mutationBlocked) return;
    const pending = deletePolicy;
    setBusy("delete"); setError(""); setNotice(""); setRefreshWarning("");
    try {
      const { data } = await base44.functions.invoke("fleetRepairEstimateAction", { action: "policy_delete", id: pending.id, expected_updated_date: pending.updated_date });
      if (data?.error) throw responseError(data.error);
      if (data?.deleted !== true) throw new Error("The threshold delete response could not be verified.");
      setPolicies(current => current.filter(policy => policy.id !== pending.id));
      setDeletePolicy(null);
      setNotice(`${pending.name} deleted.`);
      await refreshAfterMutation("Threshold deletion");
      requestAnimationFrame(() => addButtonRef.current?.focus());
    } catch (err) {
      if (definiteMutationFailure(err)) {
        setDeletePolicy(null);
        setError(err?.message || "Unable to delete repair approval policy.");
        try { setPolicies(await fetchPolicies()); setLoadFailed(false); } catch { setRefreshWarning("The delete was blocked, and current policies could not be refreshed. Use Retry refresh before trying again."); }
        requestAnimationFrame(() => addButtonRef.current?.focus());
      } else {
        setDeletePolicy(null);
        setUncertain({ kind:"delete", id:pending.id, expected_updated_date:pending.updated_date });
        setError("The delete response could not be confirmed. Check current server status before attempting another deletion.");
      }
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

    <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/20 px-3 py-2 text-xs text-indigo-800 dark:text-indigo-300 flex gap-2"><ShieldCheck className="w-4 h-4 shrink-0 mt-0.5"/><span>If a submitted estimate lands in a tier requiring approval, Fleet blocks starting and completing that work order until an admin approves it. A tier marked “No approval” auto-approves on submission. If multiple enabled tiers match, the tier with the highest minimum amount wins.</span></div>
    {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 px-3 py-2 text-sm">{error}</div>}

    <div className="mt-4 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="px-3 py-2.5 bg-gray-50 dark:bg-slate-800/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div><div className="text-sm font-semibold text-gray-900 dark:text-slate-100">Effective Policy Coverage</div><div className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">Read-only preview of enabled ranges and uncovered auto-approval areas.</div></div><span className="text-[11px] font-bold text-gray-500 dark:text-slate-300">{coverage.enabled.length} enabled tier{coverage.enabled.length===1?"":"s"}</span></div>
      {coverage.enabled.length > 0 && <div className="p-3 flex flex-wrap gap-2">{coverage.enabled.map(policy => <span key={policy.id} className={`text-xs rounded-full px-2.5 py-1 font-semibold ${policy.approval_required !== false ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"}`}>{policy.name}: {policyRangeText(policy)} · {policy.approval_required !== false ? "approval" : "auto"}</span>)}</div>}
      {coverage.findings.length ? <div className="border-t border-gray-100 dark:border-slate-800 divide-y divide-gray-100 dark:divide-slate-800">{coverage.findings.map((finding,index) => <div key={`${finding.text}-${index}`} className={`px-3 py-2 text-xs flex items-start gap-2 ${finding.tone === "overlap" ? "text-indigo-800 bg-indigo-50/60 dark:text-indigo-300 dark:bg-indigo-950/10" : "text-amber-800 bg-amber-50/60 dark:text-amber-300 dark:bg-amber-950/10"}`}><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5"/>{finding.text}</div>)}</div> : <div className="border-t border-gray-100 dark:border-slate-800 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">Enabled policies cover the full amount range without gaps or overlaps.</div>}
    </div>

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
      {editor.enabled !== false && <div className={`rounded-lg border px-3 py-2 text-xs ${editorOverlaps.length ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300"}`}>{editorOverlaps.length ? <>This range overlaps {editorOverlaps.map(policy=>policy.name).join(", ")}. That is allowed, but the enabled matching policy with the highest minimum amount wins for overlapping estimates.</> : <>No overlap with the currently enabled saved thresholds.</>}</div>}
      <Field label="Notes"><textarea rows={3} value={editor.notes} onChange={e => setEditor(v => ({ ...v, notes: e.target.value }))} className="field" placeholder="Optional approval guidance"/></Field>
      <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setEditor(null)} disabled={!!busy} className="min-h-11 px-4 rounded-lg border border-gray-300 dark:border-slate-700 font-semibold">Cancel</button><button type="button" onClick={save} disabled={!!busy} className="min-h-11 px-4 rounded-lg bg-indigo-600 text-white font-semibold inline-flex items-center gap-2">{busy === "save" && <Loader2 className="w-4 h-4 animate-spin"/>}Save Threshold</button></div>
    </div><style>{`.field{width:100%;min-height:44px;border:1px solid rgb(209 213 219);border-radius:.5rem;background:transparent;padding:.625rem .75rem;font-size:.875rem}.dark .field{border-color:rgb(51 65 85)}`}</style></div></div>}

    <FleetConfirmDialog open={!!deletePolicy} title={`Delete ${deletePolicy?.name || "approval policy"}?`} description="Future repair estimates will no longer use this threshold. Existing estimate approvals and work-order history are not changed." confirmLabel="Delete Threshold" tone="warning" busy={busy === "delete"} onCancel={() => busy !== "delete" && setDeletePolicy(null)} onConfirm={remove}/>
  </section>;
}

function Field({ label, children }) { return <label className="block"><span className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">{label}</span>{children}</label>; }
