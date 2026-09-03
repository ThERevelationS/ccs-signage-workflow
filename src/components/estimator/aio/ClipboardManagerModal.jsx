import React, { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, Package, Search, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listClipboardItems, pasteClipboardItem, removeClipboardItem } from "@/components/estimator/products/clipboardService";

const typeLabel = (type) => type === "part_group" ? "Part Group" : type === "part" ? "Part" : "Product";
const daysLeft = (date) => Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 86400000));

export default function ClipboardManagerModal({ open, estimateId, lines = [], onClose, onPasted }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [targetByItem, setTargetByItem] = useState({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const pasteRef = useRef(false);

  const load = async () => {
    setLoading(true);
    setError("");
    setItems([]);
    try {
      setItems(await listClipboardItems());
    } catch (err) {
      setError(err?.message || "Clipboard could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setTypeFilter("all");
    setTargetByItem({});
    load();
  }, [open]);

  const targets = (lines || []).filter((line) => !!line.builder_product_id);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== "all" && item.item_type !== typeFilter) return false;
      if (!q) return true;
      const haystack = `${item.item_name || ""} ${item.search_text || ""} ${item.source_product_name || ""}`.toLowerCase();
      return q.split(/\s+/).every((term) => haystack.includes(term));
    });
  }, [items, query, typeFilter]);

  const paste = async (item) => {
    if (!item?.id || pasteRef.current) return;
    pasteRef.current = true;
    const targetBuilderProductId = item.item_type === "product" ? "" : (targetByItem[item.id] || targets[0]?.builder_product_id || "");
    if (item.item_type !== "product" && !targetBuilderProductId) {
      setError("Add or choose a target Product before pasting this Part or Part Group.");
      pasteRef.current = false;
      return;
    }
    setBusyId(item.id);
    setError("");
    try {
      await pasteClipboardItem({ estimateId, clipboardItem: item, targetBuilderProductId });
      await onPasted?.();
    } catch (err) {
      setError(err?.message || "Clipboard item could not be pasted.");
    } finally {
      pasteRef.current = false;
      setBusyId("");
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Remove “${item.item_name}” from the clipboard?`)) return;
    await removeClipboardItem(item.id);
    setItems((current) => current.filter((row) => row.id !== item.id));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busyId && onClose?.()}>
      <DialogContent className="sm:max-w-[1050px] p-0 overflow-hidden gap-0 border-gray-300 shadow-2xl">
        <DialogHeader className="px-5 py-4 bg-[#3f3f3f] text-white border-b-4 border-lime-300">
          <DialogTitle className="text-white text-[17px] flex items-center gap-2"><ClipboardPaste className="w-5 h-5 text-lime-300" /> Estimator Clipboard</DialogTitle>
          <p className="text-[11px] text-gray-300 mt-1">Database-backed copies stay available for 30 days. Product pastes create a new independent Product snapshot; Part and Part Group pastes target an existing Product.</p>
        </DialogHeader>

        <div className="bg-white min-h-[590px] flex flex-col">
          <div className="p-3 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clipboard by item, estimate, order, company or Product..." className="w-full h-[34px] pl-9 pr-3 border border-gray-300 rounded bg-white text-[12px]" />
            </div>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-[34px] px-3 border border-gray-300 rounded bg-white text-[11px] text-gray-700">
              <option value="all">All clipboard items</option>
              <option value="product">Products</option>
              <option value="part_group">Part Groups</option>
              <option value="part">Parts</option>
            </select>
          </div>

          {error && <div className="mx-3 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}

          <div className="flex-1 overflow-y-auto max-h-[510px] p-3">
            {loading ? (
              <div className="py-20 text-center text-[12px] text-gray-400">Loading clipboard…</div>
            ) : error ? (
              <div className="py-20 text-center"><Package className="w-9 h-9 text-red-300 mx-auto mb-2" /><div className="text-[12px] font-semibold text-red-700">Clipboard could not be verified.</div><div className="text-[10px] text-red-500 mt-1">Close and reopen the clipboard to retry.</div></div>
            ) : visible.length === 0 ? (
              <div className="py-20 text-center">
                <Package className="w-9 h-9 text-gray-300 mx-auto mb-2" />
                <div className="text-[12px] font-semibold text-gray-600">No clipboard items found.</div>
                <div className="text-[10px] text-gray-400 mt-1">Use Copy on a Product, Part Group or Part to save it here for 30 days.</div>
              </div>
            ) : (
              <div className="space-y-2">
                {visible.map((item) => {
                  const isProduct = item.item_type === "product";
                  const selectedTarget = targetByItem[item.id] || targets[0]?.builder_product_id || "";
                  return (
                    <div key={item.id} className="rounded border border-gray-200 bg-white p-3 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded flex items-center justify-center flex-shrink-0 ${isProduct ? "bg-cyan-100 text-cyan-700" : item.item_type === "part_group" ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-600"}`}><Package className="w-4 h-4" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-bold text-gray-900">{item.item_name}</span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600">{typeLabel(item.item_type).toUpperCase()}</span>
                            <span className="text-[9px] px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">expires in {daysLeft(item.expires_at)}d</span>
                          </div>
                          <div className="mt-1 text-[10px] text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                            <span>Estimate: <strong>{item.source_estimate_number || "—"}</strong></span>
                            <span>Order: <strong>{item.source_order || "—"}</strong></span>
                            <span>Company: <strong>{item.source_company || "—"}</strong></span>
                            {item.source_product_name && <span>From Product: <strong>{item.source_product_name}</strong></span>}
                            <span>Copied: <strong>{item.copied_at ? new Date(item.copied_at).toLocaleDateString() : "—"}</strong></span>
                          </div>
                          {!isProduct && (
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-[9px] font-bold tracking-wide text-gray-400">PASTE INTO</span>
                              <select value={selectedTarget} onChange={(event) => setTargetByItem((current) => ({ ...current, [item.id]: event.target.value }))} className="h-[28px] max-w-[360px] flex-1 border border-gray-300 rounded bg-white px-2 text-[10px] text-gray-700">
                                {targets.length === 0 && <option value="">No Products available</option>}
                                {targets.map((line) => <option key={line.builder_product_id} value={line.builder_product_id}>{line.client_product_name || line.project_name || line.builder_name || "Product"}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button type="button" disabled={busyId === item.id} onClick={() => paste(item)} className="h-[30px] px-3 rounded border border-lime-400 bg-lime-200 text-[10px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-50 inline-flex items-center gap-1"><ClipboardPaste className="w-3.5 h-3.5" /> {busyId === item.id ? "Pasting…" : "Paste"}</button>
                          <button type="button" disabled={!!busyId} onClick={() => remove(item)} className="w-[30px] h-[30px] rounded border border-red-200 bg-white text-red-500 hover:bg-red-50 flex items-center justify-center" title="Remove from clipboard"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">{items.length} active item{items.length === 1 ? "" : "s"} · expired items are removed automatically</span>
            <button type="button" disabled={!!busyId} onClick={onClose} className="h-[30px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600">Close</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
