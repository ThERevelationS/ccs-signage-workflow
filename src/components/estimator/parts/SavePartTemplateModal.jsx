import { useEffect, useMemo, useState } from "react";
import { BookmarkPlus, Layers3, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/components/estimator/aioPricing";
import { savePartGroupTemplate, savePartTemplate } from "./partTemplateService";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export default function SavePartTemplateModal({
  open,
  itemType = "part",
  part = null,
  group = null,
  parts = [],
  estimateId = "",
  builderProductId = "",
  onClose,
  onSaved,
}) {
  const [name, setName] = useState("");
  const [library, setLibrary] = useState("my");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isGroup = itemType === "part_group";
  const activeParts = useMemo(() => (parts || []).filter((row) => row.is_active !== false), [parts]);
  const partCount = isGroup ? activeParts.length : (part ? 1 : 0);
  const frozenCost = isGroup
    ? activeParts.reduce((sum, row) => sum + num(row.frozen_extended_cost), 0)
    : num(part?.frozen_extended_cost);

  useEffect(() => {
    if (!open) return;
    setName(isGroup ? (group?.client_label || group?.group_name || "Saved Part Group") : (part?.client_label || part?.part_name || "Saved Part"));
    setLibrary("my");
    setCategory("");
    setTags("");
    setDescription(isGroup ? (group?.description || "") : "");
    setNotes("");
    setSaving(false);
    setError("");
  }, [open, isGroup, group?.id, part?.id]);

  const save = async (event) => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const options = {
        template_name: name.trim(),
        product_group: library,
        category: category.trim(),
        tags: tags.split(",").map((value) => value.trim()).filter(Boolean),
        description,
        notes,
      };
      const created = isGroup
        ? await savePartGroupTemplate({ estimateId, builderProductId, group, parts: activeParts, options })
        : await savePartTemplate({ estimateId, builderProductId, part, options });
      onSaved?.(created);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Part could not be saved to the Part Library.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose?.()}>
      <DialogContent className="sm:max-w-[650px] p-0 overflow-hidden border-gray-300 shadow-2xl">
        <DialogHeader className="px-5 py-4 bg-[#3f3f3f] text-white border-b-4 border-lime-300">
          <DialogTitle className="text-white text-[17px] flex items-center gap-2"><BookmarkPlus className="w-5 h-5 text-lime-300" /> Save to Part Library</DialogTitle>
          <p className="text-[10px] text-gray-300 mt-1">Creates a permanent reusable snapshot. Master Inventory records remain unchanged.</p>
        </DialogHeader>
        <form onSubmit={save} className="p-5 bg-white space-y-4">
          <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2.5 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-white border border-gray-200 flex items-center justify-center text-gray-600"><Layers3 className="w-4 h-4" /></div>
            <div className="min-w-0 flex-1"><div className="text-[11px] font-bold text-gray-800">{isGroup ? group?.group_name || "Part Group" : part?.part_name || "Part"}</div><div className="text-[9px] text-gray-500">{isGroup ? `${partCount} Parts saved together as one reusable component assembly` : `${part?.part_type || "Part"} · ${part?.inventory_item_name || "manual / Builder cost"}`}</div></div>
            <div className="text-right"><div className="text-[9px] text-gray-400">FROZEN COST</div><div className="text-[13px] font-bold text-gray-900">{money(frozenCost)}</div></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="sm:col-span-2 text-[10px] font-bold tracking-wide text-gray-500">SAVED PART NAME<input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full h-[34px] px-3 border border-gray-300 rounded text-[12px]" /></label>
            <label className="text-[10px] font-bold tracking-wide text-gray-500">LIBRARY<select value={library} onChange={(event) => setLibrary(event.target.value)} className="mt-1 w-full h-[34px] px-2 border border-gray-300 rounded bg-white text-[12px]"><option value="my">My Parts</option><option value="global">Global Parts</option></select></label>
            <label className="text-[10px] font-bold tracking-wide text-gray-500">CATEGORY<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. Mounting, Electrical, Cabinet" className="mt-1 w-full h-[34px] px-3 border border-gray-300 rounded text-[12px]" /></label>
            <label className="sm:col-span-2 text-[10px] font-bold tracking-wide text-gray-500">SEARCH TAGS<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="stud mount, acrylic, hardware, install" className="mt-1 w-full h-[34px] px-3 border border-gray-300 rounded text-[12px]" /><span className="block mt-1 text-[9px] font-normal text-gray-400">Comma separated.</span></label>
            <label className="sm:col-span-2 text-[10px] font-bold tracking-wide text-gray-500">DESCRIPTION<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-[12px] resize-y" /></label>
            <label className="sm:col-span-2 text-[10px] font-bold tracking-wide text-gray-500">INTERNAL NOTES<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-[12px] resize-y" /></label>
          </div>

          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">When reused, this snapshot becomes an independent Part{isGroup ? " Group" : ""} in the target Product. Builder recalculation will not overwrite the inserted copy. Existing Master Inventory links and frozen/current snapshots are preserved for traceability.</div>
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}
          <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600">Cancel</button><button type="submit" disabled={saving || !name.trim()} className="h-[32px] px-4 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-50 inline-flex items-center gap-1.5"><Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save Part"}</button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
