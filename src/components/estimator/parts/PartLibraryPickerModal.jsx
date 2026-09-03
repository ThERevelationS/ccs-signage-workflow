import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookmarkPlus, Layers3, PackagePlus, Search, ShieldCheck, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/components/estimator/aioPricing";
import { instantiatePartTemplate, listPartTemplates } from "./partTemplateService";

export default function PartLibraryPickerModal({ open, estimateId, builderProductId, onClose, onAdded }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [type, setType] = useState("all");
  const [addingId, setAddingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setQuery("");
    setScope("all");
    setType("all");
    setError("");
    setTemplates([]);
    setLoading(true);
    listPartTemplates()
      .then((rows) => active && setTemplates(rows || []))
      .catch((err) => active && setError(err?.message || "Part Library could not be loaded."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [open]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((template) => {
      const group = template.product_group === "global" ? "global" : "my";
      if (scope !== "all" && group !== scope) return false;
      if (type !== "all" && template.template_type !== type) return false;
      if (!q) return true;
      const haystack = [template.template_name, template.category, template.description, template.notes, template.source_module_key, template.source_part_type, template.source_part_subtype, template.search_text, ...(template.tags || [])].filter(Boolean).join(" ").toLowerCase();
      return q.split(/\s+/).every((term) => haystack.includes(term));
    });
  }, [templates, query, scope, type]);

  const add = async (template) => {
    if (!template?.id || addingId) return;
    setAddingId(template.id);
    setError("");
    try {
      await instantiatePartTemplate({ estimateId, targetBuilderProductId: builderProductId, template });
      await onAdded?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || "Saved Part could not be added to this Product.");
    } finally {
      setAddingId("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !addingId && onClose?.()}>
      <DialogContent className="sm:max-w-[980px] p-0 overflow-hidden gap-0 border-gray-300 shadow-2xl">
        <DialogHeader className="px-5 py-4 bg-[#3f3f3f] text-white border-b-4 border-lime-300">
          <DialogTitle className="text-white text-[17px] flex items-center gap-2"><BookmarkPlus className="w-5 h-5 text-lime-300" /> Add from Part Library</DialogTitle>
          <p className="text-[10px] text-gray-300 mt-1">Reusable Parts and Part Groups are separate from Master Inventory. The selected snapshot is copied into this Product as an independent component.</p>
        </DialogHeader>

        <div className="bg-white min-h-[560px] flex flex-col">
          <div className="p-3 border-b border-gray-200 bg-gray-50 flex flex-col md:flex-row gap-2">
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search saved Parts by name, category, tag, material, process..." className="w-full h-[34px] pl-9 pr-3 border border-gray-300 rounded bg-white text-[12px]" /></div>
            <select value={scope} onChange={(event) => setScope(event.target.value)} className="h-[34px] px-3 border border-gray-300 rounded bg-white text-[11px]"><option value="all">My + Global</option><option value="my">My Parts</option><option value="global">Global Parts</option></select>
            <select value={type} onChange={(event) => setType(event.target.value)} className="h-[34px] px-3 border border-gray-300 rounded bg-white text-[11px]"><option value="all">Parts + Groups</option><option value="part">Single Parts</option><option value="part_group">Part Groups</option></select>
          </div>
          {error && <div className="mx-3 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}
          <div className="px-3 py-2 border-b border-gray-100 text-[10px] text-gray-500">{visible.length} matching saved component{visible.length === 1 ? "" : "s"}</div>

          <div className="flex-1 overflow-y-auto max-h-[470px] p-3">
            {loading ? <div className="py-20 text-center text-[11px] text-gray-400">Loading Part Library…</div> : error ? (
              <div className="py-20 text-center"><AlertTriangle className="w-9 h-9 text-red-300 mx-auto" /><div className="mt-2 text-[12px] font-semibold text-red-700">Part Library could not be verified.</div><div className="mt-1 text-[10px] text-red-500">Close and reopen this picker to retry.</div></div>
            ) : visible.length === 0 ? (
              <div className="py-20 text-center"><BookmarkPlus className="w-9 h-9 text-gray-300 mx-auto" /><div className="mt-2 text-[12px] font-semibold text-gray-600">No saved Parts found.</div><div className="mt-1 text-[10px] text-gray-400">Expand a Product Part or Part Group and use Save to Library.</div></div>
            ) : <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {visible.map((template) => {
                const isGroup = template.template_type === "part_group";
                const global = template.product_group === "global";
                const changed = Math.abs(Number(template.current_cost || 0) - Number(template.frozen_cost || 0)) > 0.005;
                return <div key={template.id} className="rounded border border-gray-200 bg-white p-3 shadow-sm hover:border-gray-300">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded flex items-center justify-center flex-shrink-0 ${isGroup ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-700"}`}>{isGroup ? <Layers3 className="w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap"><span className="text-[12px] font-bold text-gray-900">{template.template_name}</span><span className={`inline-flex items-center gap-1 h-[20px] px-1.5 rounded border text-[8px] font-bold ${global ? "border-blue-200 bg-blue-50 text-blue-700" : "border-violet-200 bg-violet-50 text-violet-700"}`}>{global ? <ShieldCheck className="w-2.5 h-2.5" /> : <UserRound className="w-2.5 h-2.5" />}{global ? "GLOBAL" : "MY"}</span></div>
                      <div className="mt-0.5 text-[9px] text-gray-500">{isGroup ? `${template.part_count || 0} Part component assembly` : `${template.source_part_type || "Part"}${template.source_part_subtype ? ` · ${String(template.source_part_subtype).replaceAll("_", " ")}` : ""}`}{template.category ? ` · ${template.category}` : ""}</div>
                      {template.description && <div className="mt-1 text-[9px] text-gray-400 line-clamp-2">{template.description}</div>}
                      {(template.tags || []).length > 0 && <div className="mt-1 text-[8px] text-gray-400 truncate">{template.tags.join(" · ")}</div>}
                    </div>
                    <div className="text-right flex-shrink-0"><div className="text-[11px] font-bold text-gray-900">{money(template.frozen_cost)}</div>{changed && <div className="text-[8px] text-amber-600">saved current {money(template.current_cost)}</div>}</div>
                  </div>
                  {template.contains_detached_parts && <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[9px] text-amber-700 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Contains a detached/override Part snapshot</div>}
                  <div className="mt-3 flex justify-end"><button type="button" disabled={!!addingId} onClick={() => add(template)} className="h-[29px] px-3 rounded border border-lime-400 bg-lime-200 text-[10px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-50 inline-flex items-center gap-1"><PackagePlus className="w-3.5 h-3.5" /> {addingId === template.id ? "Adding…" : "Add to Product"}</button></div>
                </div>;
              })}
            </div>}
          </div>
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between"><span className="text-[9px] text-gray-400">Saved prices are copied exactly; linked inventory can then be checked through normal Product pricing controls.</span><button type="button" disabled={!!addingId} onClick={onClose} className="h-[30px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600">Close</button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
