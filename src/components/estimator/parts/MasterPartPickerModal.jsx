import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Loader2, Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadMasterPartCatalog, typeDetails } from "./partCatalog";
import { money } from "@/components/estimator/aioPricing";

export default function MasterPartPickerModal({ open, onClose, onAdd, mode = "add", initialQuantity = 1, catalogFilter = null }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [loadError, setLoadError] = useState("");
  const addRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setQuantity(initialQuantity);
    setLoading(true);
    setLoadError("");
    setItems([]);
    setSelectedId("");
    loadMasterPartCatalog()
      .then((rows) => {
        if (!active) return;
        const scopedRows = typeof catalogFilter === "function" ? rows.filter(catalogFilter) : rows;
        setItems(scopedRows);
        setSelectedId(scopedRows[0]?.id || "");
      })
      .catch((error) => active && setLoadError(error?.message || "Master Inventory could not be verified."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [open, initialQuantity, catalogFilter]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCategory("all");
      setQuantity(1);
      setSelectedId("");
      setAdding(false);
      setLoadError("");
      addRef.current = false;
    }
  }, [open]);

  const categories = useMemo(() => {
    const map = new Map();
    items.forEach((item) => (item.categories || [{ key: item.categoryKey, label: item.categoryLabel }]).forEach((entry) => map.set(entry.key, entry.label)));
    return [...map.entries()].map(([key, label]) => ({ key, label }));
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (category !== "all" && !(item.categories || [{ key: item.categoryKey }]).some((entry) => entry.key === category)) return false;
      if (!q) return true;
      return q.split(/\s+/).every((term) => item.searchText.includes(term));
    });
  }, [items, query, category]);

  const selected = items.find((item) => item.id === selectedId) || filtered[0] || null;
  const details = selected ? typeDetails(selected.entity, selected.row) : [];

  const add = async () => {
    if (!selected || loadError || addRef.current) return;
    addRef.current = true;
    setAdding(true);
    try {
      await onAdd?.(selected, mode === "switch" ? Math.max(0, Number(initialQuantity || 0)) : mode === "select" ? 1 : Math.max(0, Number(quantity || 0)));
      onClose?.();
    } finally {
      addRef.current = false;
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !adding && onClose?.()}>
      <DialogContent className="sm:max-w-[1050px] p-0 overflow-hidden gap-0 border-gray-300 shadow-2xl">
        <DialogHeader className="px-5 pt-5 pb-4 bg-[#3f3f3f] text-white border-b-4 border-lime-300">
          <div className="flex items-center gap-3 pr-8">
            <div className="w-10 h-10 rounded bg-lime-300 text-gray-900 flex items-center justify-center"><Boxes className="w-5 h-5" /></div>
            <div>
              <DialogTitle className="text-white text-[17px]">{mode === "switch" ? "Switch Part from Master Inventory" : mode === "select" ? "Select Master Inventory Resource" : "Add Part from Master Inventory"}</DialogTitle>
              <p className="text-[11px] text-gray-300 mt-1">{mode === "switch" ? "Choose the replacement inventory record. The current Part quantity is preserved while the inventory link and frozen inventory/pricing snapshot are explicitly replaced." : mode === "select" ? "Choose the authoritative Master Inventory resource. This selection creates a reference only; it does not copy or change the inventory record." : "Choose the exact inventory record. The complete Master Inventory row and current pricing are frozen into the estimate Part."}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.8fr] min-h-[590px] bg-white">
          <section className="border-r border-gray-200 min-w-0 flex flex-col">
            <div className="p-3 border-b border-gray-200 space-y-2 bg-gray-50">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search inventory by name, type, supplier, size, manufacturer..." className="w-full h-[36px] pl-9 pr-3 border border-gray-300 rounded text-[12px] bg-white" />
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                <button type="button" onClick={() => setCategory("all")} className={`h-[27px] px-2.5 rounded border text-[10px] font-semibold whitespace-nowrap ${category === "all" ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-300"}`}>All Parts</button>
                {categories.map((cat) => (
                  <button key={cat.key} type="button" onClick={() => setCategory(cat.key)} className={`h-[27px] px-2.5 rounded border text-[10px] font-semibold whitespace-nowrap ${category === cat.key ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-600 border-gray-300"}`}>{cat.label}</button>
                ))}
              </div>
            </div>
            <div className="px-3 py-2 border-b border-gray-100 text-[10px] text-gray-500">{filtered.length} matching Master Inventory Part{filtered.length === 1 ? "" : "s"}</div>
            <div className="flex-1 overflow-y-auto max-h-[480px] p-2 space-y-1">
              {loading ? (
                <div className="py-16 flex items-center justify-center gap-2 text-[12px] text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading Master Inventory…</div>
              ) : loadError ? (
                <div className="py-16 text-center"><div className="text-[12px] font-semibold text-red-700">Master Inventory could not be verified.</div><div className="text-[10px] text-red-500 mt-1">{loadError}</div><div className="text-[10px] text-gray-400 mt-1">Close and reopen the picker to retry. No Part can be selected from a partial catalog.</div></div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center text-[12px] text-gray-400">No inventory Parts match this search.</div>
              ) : filtered.map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`w-full text-left p-3 rounded border transition-colors ${selected?.id === item.id ? "border-lime-400 bg-lime-50" : "border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[12px] font-bold text-gray-900 truncate">{item.name}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{item.categoryLabel} · {String(item.subtype || "").replace(/_/g, " ")}{item.supplier ? ` · ${item.supplier}` : ""}</div>
                    </div>
                    <div className="text-right flex-shrink-0"><div className="text-[11px] font-bold text-gray-800">{money(item.unitCost)}</div><div className="text-[9px] text-gray-400">per {item.unit}</div></div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <aside className="p-4 bg-gray-50 flex flex-col">
            {loadError ? (
              <div className="flex-1 flex items-center justify-center text-center px-5"><div><div className="text-[12px] font-semibold text-red-700">Inventory unavailable</div><div className="text-[10px] text-gray-500 mt-1">Part creation and switching are disabled until the complete Master Inventory catalog can be read.</div></div></div>
            ) : selected ? (
              <>
                <div className="text-[9px] font-bold tracking-widest text-gray-400">SELECTED PART</div>
                <div className="text-[16px] font-bold text-gray-900 mt-1">{selected.name}</div>
                <div className="text-[10px] text-gray-500 mt-1">{selected.categoryLabel} · {String(selected.subtype || "").replace(/_/g, " ")}</div>

                <div className="mt-4 rounded border border-gray-200 bg-white p-3">
                  <div className="text-[9px] font-bold tracking-widest text-gray-400 mb-2">PRICING INFORMATION</div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between gap-3"><span className="text-gray-500">Pricing mode</span><strong>{String(selected.pricingMode).replace(/_/g, " ")}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-gray-500">Master cost</span><strong>{money(selected.unitCost)} / {selected.unit}</strong></div>
                    {selected.supplier && <div className="flex justify-between gap-3"><span className="text-gray-500">Supplier</span><strong className="text-right">{selected.supplier}</strong></div>}
                  </div>
                </div>

                {details.length > 0 && (
                  <div className="mt-3 rounded border border-gray-200 bg-white p-3 max-h-[245px] overflow-y-auto">
                    <div className="text-[9px] font-bold tracking-widest text-gray-400 mb-2">PART DETAILS</div>
                    <div className="space-y-1.5 text-[11px]">
                      {details.map((detail) => <div key={detail.field} className="flex justify-between gap-3"><span className="text-gray-500">{detail.label}</span><strong className="text-right">{Array.isArray(detail.value) ? detail.value.join(", ") : String(detail.value).replace(/_/g, " ")}</strong></div>)}
                    </div>
                  </div>
                )}

                <div className="mt-auto pt-4 space-y-3">
                  {mode === "switch" ? (
                    <div className="rounded border border-gray-200 bg-white px-3 py-2 flex justify-between"><span className="text-[10px] font-bold text-gray-500">PRESERVED QUANTITY</span><strong className="text-[12px]">{Number(initialQuantity || 0).toLocaleString()}</strong></div>
                  ) : mode !== "select" ? (
                    <label className="text-[10px] font-bold tracking-wide text-gray-500 block">QUANTITY<input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-1 w-full h-[34px] px-2 border border-gray-300 rounded bg-white text-[12px]" /></label>
                  ) : null}
                  {mode !== "select" && <div className="rounded border border-lime-300 bg-lime-50 px-3 py-2 flex justify-between"><span className="text-[10px] font-bold text-gray-600">FROZEN EXTENDED COST</span><strong className="text-[13px]">{money(Number(mode === "switch" ? initialQuantity : quantity || 0) * selected.unitCost)}</strong></div>}
                  <div className="flex justify-end gap-2">
                    <button type="button" disabled={adding} onClick={onClose} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600">Cancel</button>
                    <button type="button" disabled={adding} onClick={add} className="h-[32px] px-4 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-50 inline-flex items-center gap-1.5">{adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}{adding ? (mode === "switch" ? "Switching…" : mode === "select" ? "Selecting…" : "Adding…") : (mode === "switch" ? "Switch Part" : mode === "select" ? "Select Resource" : "Add Part")}</button>
                  </div>
                </div>
              </>
            ) : <div className="flex-1 flex items-center justify-center text-[12px] text-gray-400">Select an inventory Part.</div>}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
