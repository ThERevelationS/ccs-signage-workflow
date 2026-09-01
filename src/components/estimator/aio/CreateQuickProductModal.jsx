import { useEffect, useMemo, useState } from "react";
import { PackagePlus, Save } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/components/estimator/aioPricing";
import { acceptedCustomerUnitPrice } from "@/components/estimator/customerPricing";

export default function CreateQuickProductModal({ open, line, partCount = 0, onClose, onSave }) {
  const [name, setName] = useState("");
  const [productGroup, setProductGroup] = useState("my");
  const [categories, setCategories] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [extraCategories, setExtraCategories] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(line?.client_product_name || line?.project_name || "Quick Product");
    setProductGroup("my");
    setCategories(line?.product_category ? [line.product_category] : []);
    setExtraCategories("");
    setSaving(false);
    setError("");
    Promise.all([
      base44.entities.QuickProductCategory.list().catch(() => []),
      base44.auth.me().catch(() => null),
    ]).then(([rows, me]) => setAvailableCategories((rows || [])
      .filter((row) => row.product_group === "global" || !row.created_by_id || (!!me?.id && row.created_by_id === me.id))
      .sort((a, b) => String(a.category_name || "").localeCompare(String(b.category_name || "")))))
      .catch(() => setAvailableCategories([]));
  }, [open, line?.line_id, line?.builder_product_id]);

  const visibleCategories = useMemo(
    () => availableCategories.filter((row) => (row.product_group || "my") === productGroup),
    [availableCategories, productGroup]
  );

  const toggleCategory = (categoryName) => {
    setCategories((current) => current.includes(categoryName)
      ? current.filter((name) => name !== categoryName)
      : [...current, categoryName]);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    const extra = extraCategories.split(",").map((item) => item.trim()).filter(Boolean);
    const finalCategories = [...new Set([...categories, ...extra])];
    setSaving(true);
    setError("");
    try {
      await onSave?.({ name: name.trim(), productGroup, categories: finalCategories });
      onClose?.();
    } catch (err) {
      setError(err?.message || "Quick Product could not be saved.");
      setSaving(false);
    }
  };

  const frozenCost = Number(line?.total_snapshot || 0);
  const frozenCustomerPrice = acceptedCustomerUnitPrice(line);
  const isBuilder = line?.module_key !== "custom";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose?.()}>
      <DialogContent className="sm:max-w-[680px] p-0 overflow-hidden border-gray-300 shadow-2xl">
        <DialogHeader className="px-5 py-4 bg-[#3f3f3f] text-white border-b-4 border-lime-300">
          <DialogTitle className="text-white text-[17px] flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-lime-300" /> Create Quick Product
          </DialogTitle>
          <p className="text-[11px] text-gray-300 mt-1">
            Saves the complete Product package — not just its price. Builder configuration, Parts, Part Groups, inventory snapshots, frozen pricing, overrides and notes are preserved.
          </p>
        </DialogHeader>

        <form onSubmit={submit} className="p-5 bg-white space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-[10px] font-bold tracking-wide text-gray-500 sm:col-span-2">
              QUICK PRODUCT NAME
              <input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full h-[36px] px-3 border border-gray-300 rounded text-[13px]" />
            </label>

            <div className="sm:col-span-2">
              <div className="text-[10px] font-bold tracking-wide text-gray-500 mb-1.5">AVAILABILITY</div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setProductGroup("my")} className={`rounded border px-3 py-2 text-left ${productGroup === "my" ? "border-lime-400 bg-lime-50" : "border-gray-200 bg-white"}`}>
                  <div className="text-[11px] font-bold text-gray-900">My Quick Product</div>
                  <div className="text-[9px] text-gray-500 mt-0.5">Personal reusable template.</div>
                </button>
                <button type="button" onClick={() => setProductGroup("global")} className={`rounded border px-3 py-2 text-left ${productGroup === "global" ? "border-lime-400 bg-lime-50" : "border-gray-200 bg-white"}`}>
                  <div className="text-[11px] font-bold text-gray-900">Global Quick Product</div>
                  <div className="text-[9px] text-gray-500 mt-0.5">Shared company template.</div>
                </button>
              </div>
            </div>

            <div className="sm:col-span-2 rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-[9px] font-bold tracking-widest text-gray-400 mb-2">PRODUCT PACKAGE</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                <div><span className="text-gray-500 block">Class</span><strong>{isBuilder ? "Builder Product" : "Custom Product"}</strong></div>
                <div><span className="text-gray-500 block">Builder</span><strong>{line?.builder_name || (isBuilder ? "Builder" : "None")}</strong></div>
                <div><span className="text-gray-500 block">Parts</span><strong>{partCount}</strong></div>
                <div><span className="text-gray-500 block">Internal Cost</span><strong>{money(frozenCost)}</strong></div>
                <div><span className="text-gray-500 block">Customer Price</span><strong>{money(frozenCustomerPrice)}</strong></div>
              </div>
              {line?.needs_reattach_review && <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[9px] text-amber-700">Detached/override Part state will be preserved exactly in the Quick Product.</div>}
            </div>

            <div className="sm:col-span-2">
              <div className="text-[10px] font-bold tracking-wide text-gray-500 mb-1.5">CATEGORIES</div>
              {visibleCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {visibleCategories.map((category) => {
                    const selected = categories.includes(category.category_name);
                    return (
                      <button key={category.id} type="button" onClick={() => toggleCategory(category.category_name)} className={`h-[26px] px-2.5 rounded-full border text-[10px] font-semibold ${selected ? "border-lime-400 bg-lime-100 text-gray-900" : "border-gray-300 bg-white text-gray-600"}`}>
                        {category.category_name}
                      </button>
                    );
                  })}
                </div>
              )}
              <input value={extraCategories} onChange={(event) => setExtraCategories(event.target.value)} placeholder="Add categories, comma separated..." className="w-full h-[34px] px-3 border border-gray-300 rounded text-[11px]" />
              <div className="text-[9px] text-gray-400 mt-1">Existing selected: {categories.length ? categories.join(", ") : "none"}</div>
            </div>
          </div>

          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}

          <div className="flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={onClose} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600">Cancel</button>
            <button type="submit" disabled={saving || !name.trim()} className="h-[32px] px-4 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-50 inline-flex items-center gap-1.5">
              <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save Quick Product"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
