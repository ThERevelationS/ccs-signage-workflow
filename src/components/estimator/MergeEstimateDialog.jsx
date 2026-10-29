import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import MergeDraftList from "@/components/estimator/MergeDraftList";
import { listMergeCandidateDrafts, mergeableLines, mergeDraftSections } from "@/components/estimator/estimateMergeService";

// Merge products from another draft into this one, section by section.
export default function MergeEstimateDialog({ open, onOpenChange, targetId, deletedBy, onMerged }) {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [trashSource, setTrashSource] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSource(null); setPicked(new Set()); setTrashSource(false); setError(""); setProgress("");
    setLoading(true);
    listMergeCandidateDrafts(targetId).then(setDrafts).catch((e) => setError(e?.message || "Drafts could not be loaded.")).finally(() => setLoading(false));
  }, [open, targetId]);

  const lines = mergeableLines(source);
  const toggle = (id) => setPicked((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const allPicked = lines.length > 0 && picked.size === lines.length;

  const submit = async () => {
    if (busy || !source || !picked.size) return;
    setBusy(true); setError("");
    try {
      const result = await mergeDraftSections({
        targetId, sourceId: source.id, builderProductIds: [...picked], trashSource: trashSource && allPicked, deletedBy,
        onProgress: (done, total) => setProgress(`Merged ${done} of ${total}…`),
      });
      onOpenChange(false);
      onMerged?.(result);
    } catch (e) {
      setError(e?.message || "The merge could not be completed.");
      onMerged?.(null);
    } finally {
      setBusy(false); setProgress("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{source ? `Merge from "${source.project_name || "draft"}"` : "Merge another draft"}</DialogTitle>
          <DialogDescription>{source ? "Pick the products to copy into this estimate." : "Choose the draft whose products you want to bring into this estimate."}</DialogDescription>
        </DialogHeader>
        {!source ? <MergeDraftList drafts={drafts} loading={loading} onPick={(d) => { setSource(d); setPicked(new Set(mergeableLines(d).map((l) => l.builder_product_id))); }} /> : (
          <div className="space-y-3">
            <div className="max-h-64 overflow-y-auto space-y-1">
              {lines.map((line) => (
                <label key={line.builder_product_id} className="flex items-center gap-2 min-h-[40px] border border-gray-200 rounded px-3 py-1.5 cursor-pointer hover:bg-gray-50">
                  <Checkbox checked={picked.has(line.builder_product_id)} onCheckedChange={() => toggle(line.builder_product_id)} disabled={busy} />
                  <span className="text-[13px] text-gray-900">{line.client_product_name || line.project_name || "Product"}</span>
                </label>
              ))}
            </div>
            <label className={`flex items-center gap-2 text-[12px] ${allPicked ? "text-gray-700" : "text-gray-400"}`}>
              <Checkbox checked={trashSource && allPicked} onCheckedChange={(v) => setTrashSource(!!v)} disabled={busy || !allPicked} />
              Move the source draft to Trash after merging (all products selected)
            </label>
            <div className="flex justify-between gap-2">
              <button type="button" disabled={busy} onClick={() => setSource(null)} className="h-9 px-3 rounded border border-gray-300 text-[12px] text-gray-600 disabled:opacity-50">Back</button>
              <button type="button" disabled={busy || !picked.size} onClick={submit} aria-busy={busy} className="h-9 px-4 rounded bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700 disabled:opacity-50">
                {busy ? progress || "Merging…" : `Merge ${picked.size} product(s)`}
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-[12px] text-red-700" role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}