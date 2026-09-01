import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Boxes, Edit3, Layers3, Package, Search, ShieldCheck, UserRound } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { listPartTemplates } from "@/components/estimator/parts/partTemplateService";
import { money } from "@/components/estimator/aioPricing";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function EditTemplateDialog({ template, user, open, onClose, onSaved }) {
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const canEdit = !!template && (user?.role === "admin" || !template.created_by_id || template.created_by_id === user?.id);

  useEffect(() => {
    if (!open || !template) return;
    setDraft({
      template_name: template.template_name || "",
      product_group: template.product_group === "global" ? "global" : "my",
      category: template.category || "",
      tags_text: (template.tags || []).join(", "),
      description: template.description || "",
      notes: template.notes || "",
      is_active: template.is_active !== false,
    });
    setSaving(false);
    setError("");
  }, [open, template?.id]);

  if (!template || !draft) return null;
  const patch = (changes) => setDraft((current) => ({ ...current, ...changes }));

  const save = async (event) => {
    event.preventDefault();
    if (!canEdit || saving || !draft.template_name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const tags = [...new Set(draft.tags_text.split(",").map((value) => value.trim()).filter(Boolean))];
      const snapshotParts = template.template_type === "part_group"
        ? (template.parts_snapshot || [])
        : [template.part_snapshot || {}];
      const payload = {
        template_name: draft.template_name.trim(),
        product_group: draft.product_group === "global" ? "global" : "my",
        category: draft.category.trim(),
        tags,
        description: draft.description,
        notes: draft.notes,
        is_active: draft.is_active,
        search_text: [
          draft.template_name,
          draft.category,
          tags,
          draft.description,
          draft.notes,
          template.source_module_key,
          template.source_part_type,
          template.source_part_subtype,
          snapshotParts.map((part) => [part.part_name, part.client_label, part.part_type, part.part_subtype, part.inventory_item_name]),
        ].flat(3).filter(Boolean).join(" ").toLowerCase(),
      };
      const updated = await base44.entities.PartTemplate.update(template.id, payload);
      onSaved?.({ ...template, ...payload, ...(updated || {}) });
      onClose?.();
    } catch (err) {
      setError(err?.message || "Saved Part could not be updated.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose?.()}>
      <DialogContent className="sm:max-w-[680px] p-0 overflow-hidden border-gray-300 shadow-2xl">
        <DialogHeader className="px-5 py-4 bg-[#3f3f3f] text-white border-b-4 border-lime-300"><DialogTitle className="text-white text-[17px] flex items-center gap-2"><Edit3 className="w-5 h-5 text-lime-300" /> Edit Saved Part</DialogTitle><p className="text-[10px] text-gray-300 mt-1">Metadata only. Saved Part/Group snapshots, inventory references and frozen pricing are not rewritten.</p></DialogHeader>
        <form onSubmit={save} className="p-5 bg-white space-y-4">
          {!canEdit && <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">This Global Part was created by another user. You can use it, but only its creator or an admin can edit it.</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="sm:col-span-2 text-[10px] font-bold tracking-wide text-gray-500">SAVED PART NAME<input disabled={!canEdit} autoFocus value={draft.template_name} onChange={(event) => patch({ template_name: event.target.value })} className="mt-1 w-full h-[34px] px-3 border border-gray-300 rounded text-[12px] disabled:bg-gray-100" /></label>
            <label className="text-[10px] font-bold tracking-wide text-gray-500">LIBRARY<select disabled={!canEdit} value={draft.product_group} onChange={(event) => patch({ product_group: event.target.value })} className="mt-1 w-full h-[34px] px-2 border border-gray-300 rounded bg-white text-[12px] disabled:bg-gray-100"><option value="my">My Parts</option><option value="global">Global Parts</option></select></label>
            <label className="text-[10px] font-bold tracking-wide text-gray-500">CATEGORY<input disabled={!canEdit} value={draft.category} onChange={(event) => patch({ category: event.target.value })} className="mt-1 w-full h-[34px] px-3 border border-gray-300 rounded text-[12px] disabled:bg-gray-100" /></label>
            <label className="sm:col-span-2 text-[10px] font-bold tracking-wide text-gray-500">SEARCH TAGS<input disabled={!canEdit} value={draft.tags_text} onChange={(event) => patch({ tags_text: event.target.value })} className="mt-1 w-full h-[34px] px-3 border border-gray-300 rounded text-[12px] disabled:bg-gray-100" /></label>
            <label className="sm:col-span-2 text-[10px] font-bold tracking-wide text-gray-500">DESCRIPTION<textarea disabled={!canEdit} value={draft.description} onChange={(event) => patch({ description: event.target.value })} rows={2} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-[12px] resize-y disabled:bg-gray-100" /></label>
            <label className="sm:col-span-2 text-[10px] font-bold tracking-wide text-gray-500">INTERNAL NOTES<textarea disabled={!canEdit} value={draft.notes} onChange={(event) => patch({ notes: event.target.value })} rows={2} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-[12px] resize-y disabled:bg-gray-100" /></label>
          </div>
          <label className="flex items-center justify-between gap-4 rounded border border-gray-200 bg-gray-50 px-3 py-2.5"><div><div className="text-[11px] font-bold text-gray-800">Active Saved Part</div><div className="text-[9px] text-gray-500">Inactive records stay preserved but are hidden from Add Saved Part.</div></div><input disabled={!canEdit} type="checkbox" checked={draft.is_active} onChange={(event) => patch({ is_active: event.target.checked })} className="w-4 h-4 accent-lime-600" /></label>
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}
          <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600">Close</button>{canEdit && <button type="submit" disabled={saving || !draft.template_name.trim()} className="h-[32px] px-4 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-50">{saving ? "Saving…" : "Save Changes"}</button>}</div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function EstimatorParts() {
  const [templates, setTemplates] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("active");
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([listPartTemplates({ includeInactive: true }), base44.auth.me().catch(() => null)])
      .then(([rows, me]) => { if (!active) return; setTemplates(rows || []); setUser(me); })
      .catch((err) => active && setError(err?.message || "Part Library could not be loaded."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((template) => {
      const group = template.product_group === "global" ? "global" : "my";
      if (scope !== "all" && group !== scope) return false;
      if (type !== "all" && template.template_type !== type) return false;
      if (status === "active" && template.is_active === false) return false;
      if (status === "inactive" && template.is_active !== false) return false;
      if (!q) return true;
      const haystack = [template.template_name, template.category, template.description, template.notes, template.search_text, template.source_module_key, template.source_part_type, template.source_part_subtype, ...(template.tags || [])].filter(Boolean).join(" ").toLowerCase();
      return q.split(/\s+/).every((term) => haystack.includes(term));
    });
  }, [templates, query, scope, type, status]);

  const updateLocal = (updated) => setTemplates((current) => current.map((row) => row.id === updated.id ? { ...row, ...updated } : row));
  const active = templates.filter((row) => row.is_active !== false);
  const myCount = active.filter((row) => row.product_group !== "global").length;
  const globalCount = active.filter((row) => row.product_group === "global").length;
  const groupCount = active.filter((row) => row.template_type === "part_group").length;

  const toggleActive = async (template) => {
    const canEdit = user?.role === "admin" || !template.created_by_id || template.created_by_id === user?.id;
    if (!canEdit) return setEditing(template);
    try {
      const next = template.is_active === false;
      const updated = await base44.entities.PartTemplate.update(template.id, { is_active: next });
      updateLocal({ ...template, is_active: next, ...(updated || {}) });
    } catch (err) {
      setError(err?.message || "Saved Part status could not be changed.");
    }
  };

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-[1280px] mx-auto p-4 sm:p-5 space-y-4">
        <div className="bg-white border border-gray-200 rounded-md px-4 py-3 flex flex-wrap items-center gap-3"><div className="w-9 h-9 rounded bg-violet-50 text-violet-700 flex items-center justify-center"><Layers3 className="w-5 h-5" /></div><div className="min-w-0 flex-1"><h1 className="text-[18px] font-bold text-gray-900">Parts</h1><p className="text-[10px] text-gray-500">Permanent reusable Part and Part Group templates. Parts are Product components; Master Inventory remains the underlying material, labor, equipment and supply resource library.</p></div><Link to="/EstimatorProducts"><Button variant="outline" className="h-[31px] text-[11px]"><Package className="w-3.5 h-3.5 mr-1.5" /> Products</Button></Link><Link to="/MasterInventory"><Button variant="outline" className="h-[31px] text-[11px]"><Boxes className="w-3.5 h-3.5 mr-1.5" /> Master Inventory</Button></Link></div>
        {error && <div className="px-3 py-2 rounded border border-red-200 bg-red-50 text-[11px] text-red-700">{error}</div>}

        <div className="grid grid-cols-3 gap-2"><div className="bg-white border border-gray-200 rounded px-3 py-2"><div className="text-[9px] font-bold tracking-wider text-gray-400">MY PARTS</div><div className="text-[18px] font-bold text-gray-900">{myCount}</div></div><div className="bg-white border border-gray-200 rounded px-3 py-2"><div className="text-[9px] font-bold tracking-wider text-gray-400">GLOBAL PARTS</div><div className="text-[18px] font-bold text-gray-900">{globalCount}</div></div><div className="bg-white border border-gray-200 rounded px-3 py-2"><div className="text-[9px] font-bold tracking-wider text-gray-400">COMPONENT ASSEMBLIES</div><div className="text-[18px] font-bold text-gray-900">{groupCount}</div></div></div>

        <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex flex-col xl:flex-row xl:items-center gap-3"><div className="min-w-0 xl:flex-1"><h2 className="text-[13px] font-bold text-gray-900">Part Library</h2><p className="text-[10px] text-gray-500">Save a Part or Part Group from any estimate Product. Reusing it creates a new independent copy and never changes the saved template or source Product.</p></div><div className="flex flex-wrap items-center gap-1.5"><div className="relative w-[240px]"><Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search saved Parts..." className="w-full h-[30px] pl-8 pr-2 border border-gray-300 rounded text-[11px]" /></div><select value={scope} onChange={(event) => setScope(event.target.value)} className="h-[30px] px-2 border border-gray-300 rounded bg-white text-[10px]"><option value="all">My + Global</option><option value="my">My</option><option value="global">Global</option></select><select value={type} onChange={(event) => setType(event.target.value)} className="h-[30px] px-2 border border-gray-300 rounded bg-white text-[10px]"><option value="all">Parts + Groups</option><option value="part">Single Parts</option><option value="part_group">Part Groups</option></select><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-[30px] px-2 border border-gray-300 rounded bg-white text-[10px]"><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All Statuses</option></select></div></div>
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 text-[9px] text-gray-500">{visible.length} matching saved component{visible.length === 1 ? "" : "s"}</div>

          {loading ? <div className="py-16 text-center text-[11px] text-gray-400">Loading Part Library…</div> : visible.length === 0 ? <div className="py-14 text-center"><Layers3 className="w-9 h-9 text-gray-300 mx-auto" /><div className="mt-2 text-[12px] font-bold text-gray-700">No saved Parts found</div><div className="mt-1 text-[10px] text-gray-400">Inside an estimate, expand a Product Part or Part Group and choose Save to Library.</div></div> : <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-gray-50 border-b border-gray-200"><tr className="text-[9px] tracking-wide text-gray-500"><th className="px-4 py-2 font-bold">SAVED PART</th><th className="px-3 py-2 font-bold">TYPE</th><th className="px-3 py-2 font-bold">SOURCE</th><th className="px-3 py-2 font-bold text-right">FROZEN COST</th><th className="px-3 py-2 font-bold">LIBRARY</th><th className="px-3 py-2 font-bold">STATUS</th><th className="px-4 py-2 font-bold text-right">ACTIONS</th></tr></thead><tbody className="divide-y divide-gray-100">{visible.map((template) => {
            const isGroup = template.template_type === "part_group";
            const global = template.product_group === "global";
            const changed = Math.abs(Number(template.current_cost || 0) - Number(template.frozen_cost || 0)) > 0.005;
            return <tr key={template.id} className="hover:bg-gray-50/70"><td className="px-4 py-2.5 min-w-[230px]"><div className="text-[11px] font-bold text-gray-900">{template.template_name}</div><div className="mt-0.5 text-[9px] text-gray-400 truncate max-w-[340px]">{template.category || (template.tags || []).join(" · ") || "Uncategorized"}</div></td><td className="px-3 py-2.5 text-[10px] text-gray-700 whitespace-nowrap">{isGroup ? <span className="inline-flex items-center gap-1"><Layers3 className="w-3 h-3 text-violet-600" /> Part Group</span> : "Part"}<div className="text-[8px] text-gray-400">{template.part_count || 1} Part{Number(template.part_count || 1) === 1 ? "" : "s"}</div></td><td className="px-3 py-2.5 text-[10px] text-gray-600"><div>{template.source_module_key || "Custom / Manual"}</div><div className="text-[8px] text-gray-400">{template.source_part_type ? String(template.source_part_type).replaceAll("_", " ") : "component"}</div></td><td className="px-3 py-2.5 text-right whitespace-nowrap"><div className="text-[11px] font-bold text-gray-900">{money(template.frozen_cost)}</div>{changed && <div className="text-[8px] text-amber-600">saved current {money(template.current_cost)}</div>}</td><td className="px-3 py-2.5"><span className={`inline-flex items-center gap-1 h-[22px] px-2 rounded border text-[9px] font-bold ${global ? "border-blue-200 bg-blue-50 text-blue-700" : "border-violet-200 bg-violet-50 text-violet-700"}`}>{global ? <ShieldCheck className="w-3 h-3" /> : <UserRound className="w-3 h-3" />}{global ? "GLOBAL" : "MY"}</span>{template.contains_detached_parts && <div className="mt-1 text-[8px] text-amber-600 inline-flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" /> detached snapshot</div>}</td><td className="px-3 py-2.5 text-[9px] font-semibold"><span className={template.is_active === false ? "text-gray-400" : "text-emerald-700"}>{template.is_active === false ? "Inactive" : "Active"}</span></td><td className="px-4 py-2.5"><div className="flex justify-end gap-1"><button type="button" onClick={() => setEditing(template)} className="h-[27px] px-2.5 rounded border border-gray-300 bg-white text-[9px] font-bold text-gray-700 hover:bg-gray-50">Edit</button><button type="button" onClick={() => toggleActive(template)} className="h-[27px] px-2.5 rounded border border-gray-300 bg-white text-[9px] font-bold text-gray-600 hover:bg-gray-50">{template.is_active === false ? "Activate" : "Deactivate"}</button></div></td></tr>;
          })}</tbody></table></div>}
        </section>
      </div>
      <EditTemplateDialog template={editing} user={user} open={!!editing} onClose={() => setEditing(null)} onSaved={updateLocal} />
    </div>
  );
}
