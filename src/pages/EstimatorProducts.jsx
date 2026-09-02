import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Edit3,
  Package,
  PackagePlus,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { ESTIMATOR_MODULES } from "@/components/estimator/moduleRegistry";
import { money } from "@/components/estimator/aioPricing";
import { loadProductionProductTypes } from "@/components/estimator/productionProductTypes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const moduleLabel = (key) => ESTIMATOR_MODULES.find((module) => module.key === key)?.label || (key === "custom" ? "Custom Product" : key || "Product");

function productPrice(product) {
  const quantity = Math.max(0, num(product.product_quantity, 1)) || 1;
  const frozenUnit = num(product.price_snapshot?.frozen_cost, product.total_price !== undefined && product.total_price !== null ? num(product.total_price) / quantity : 0);
  const extended = product.total_price !== undefined && product.total_price !== null ? num(product.total_price) : frozenUnit * quantity;
  return { quantity, frozenUnit, extended };
}

function QuickProductEditDialog({ product, open, onClose, onSaved, productionProductTypes = [] }) {
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !product) return;
    setDraft({
      product_name: product.product_name || "",
      product_group: product.product_group === "global" ? "global" : "my",
      product_category: product.product_category || "",
      production_product_type: product.production_product_type || "",
      categories_text: (product.categories || []).join(", "),
      client_description: product.client_description || "",
      product_notes: product.product_notes || "",
      is_active: product.is_active !== false,
    });
    setError("");
    setSaving(false);
  }, [open, product?.id]);

  if (!draft || !product) return null;
  const patch = (changes) => setDraft((current) => ({ ...current, ...changes }));

  const save = async (event) => {
    event.preventDefault();
    if (!draft.product_name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const categories = [...new Set(draft.categories_text.split(",").map((value) => value.trim()).filter(Boolean))];
      const payload = {
        product_name: draft.product_name.trim(),
        product_group: draft.product_group === "global" ? "global" : "my",
        product_category: draft.product_category.trim(),
        production_product_type: draft.production_product_type,
        categories,
        client_description: draft.client_description,
        product_notes: draft.product_notes,
        is_active: draft.is_active,
      };
      const updated = await base44.entities.QuickProduct.update(product.id, payload);
      onSaved?.({ ...product, ...payload, ...(updated || {}) });
      onClose?.();
    } catch (err) {
      setError(err?.message || "Quick Product could not be updated.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose?.()}>
      <DialogContent className="sm:max-w-[720px] p-0 overflow-hidden border-gray-300 shadow-2xl">
        <DialogHeader className="px-5 py-4 bg-[#3f3f3f] text-white border-b-4 border-lime-300">
          <DialogTitle className="text-white text-[17px] flex items-center gap-2"><Edit3 className="w-5 h-5 text-lime-300" /> Edit Quick Product</DialogTitle>
          <p className="text-[10px] text-gray-300 mt-1">Metadata only. Builder configuration, Parts, Part Groups, frozen inventory snapshots and frozen pricing are not rewritten.</p>
        </DialogHeader>
        <form onSubmit={save} className="p-5 bg-white space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-[10px] font-bold tracking-wide text-gray-500 sm:col-span-2">PRODUCT NAME<input autoFocus value={draft.product_name} onChange={(event) => patch({ product_name: event.target.value })} className="mt-1 w-full h-[34px] px-3 border border-gray-300 rounded text-[12px]" /></label>
            <label className="text-[10px] font-bold tracking-wide text-gray-500">LIBRARY<select value={draft.product_group} onChange={(event) => patch({ product_group: event.target.value })} className="mt-1 w-full h-[34px] px-2 border border-gray-300 rounded bg-white text-[12px]"><option value="my">My Quick Products</option><option value="global">Global Quick Products</option></select></label>
            <label className="text-[10px] font-bold tracking-wide text-gray-500">PRODUCT CATEGORY<input value={draft.product_category} onChange={(event) => patch({ product_category: event.target.value })} className="mt-1 w-full h-[34px] px-3 border border-gray-300 rounded text-[12px]" placeholder="e.g. Wall Signs" /></label>
            <label className="text-[10px] font-bold tracking-wide text-gray-500 sm:col-span-2">PRODUCTION PRODUCT TYPE<select value={draft.production_product_type} onChange={(event) => patch({ production_product_type: event.target.value })} className="mt-1 w-full h-[34px] px-2 border border-gray-300 rounded bg-white text-[12px]"><option value="">Unclassified</option>{draft.production_product_type && !productionProductTypes.includes(draft.production_product_type) && <option value={draft.production_product_type}>{draft.production_product_type} (not in current SIP list)</option>}{productionProductTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select><span className="block mt-1 text-[9px] font-normal text-gray-400">Used when this Quick Product is converted into a Work Order/SIP product.</span></label>
            <label className="text-[10px] font-bold tracking-wide text-gray-500 sm:col-span-2">SEARCH CATEGORIES<input value={draft.categories_text} onChange={(event) => patch({ categories_text: event.target.value })} className="mt-1 w-full h-[34px] px-3 border border-gray-300 rounded text-[12px]" placeholder="Interior, Acrylic, Routed, ADA" /><span className="block mt-1 text-[9px] font-normal text-gray-400">Comma separated. These organize/search the reusable template and do not alter its Parts.</span></label>
            <label className="text-[10px] font-bold tracking-wide text-gray-500 sm:col-span-2">CLIENT DESCRIPTION<textarea value={draft.client_description} onChange={(event) => patch({ client_description: event.target.value })} rows={3} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-[12px] resize-y" /></label>
            <label className="text-[10px] font-bold tracking-wide text-gray-500 sm:col-span-2">PRODUCT NOTES<textarea value={draft.product_notes} onChange={(event) => patch({ product_notes: event.target.value })} rows={3} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded text-[12px] resize-y" /></label>
          </div>
          <label className="flex items-center justify-between gap-4 rounded border border-gray-200 bg-gray-50 px-3 py-2.5 cursor-pointer"><div><div className="text-[11px] font-bold text-gray-800">Active Quick Product</div><div className="text-[9px] text-gray-500">Inactive templates stay preserved but are hidden from Add Product.</div></div><input type="checkbox" checked={draft.is_active} onChange={(event) => patch({ is_active: event.target.checked })} className="w-4 h-4 accent-lime-600" /></label>
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</div>}
          <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600">Cancel</button><button type="submit" disabled={saving || !draft.product_name.trim()} className="h-[32px] px-4 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-50">{saving ? "Saving…" : "Save Quick Product"}</button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function EstimatorProducts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [quickProducts, setQuickProducts] = useState([]);
  const [productionProductTypes, setProductionProductTypes] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [status, setStatus] = useState("active");
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  const view = searchParams.get("view") || "all";
  const moduleFilter = searchParams.get("module") || "";

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      base44.entities.QuickProduct.list().catch(() => []),
      base44.auth.me().catch(() => null),
      loadProductionProductTypes(),
    ]).then(([rows, me, productionTypes]) => {
      if (!active) return;
      setQuickProducts(rows || []);
      setProductionProductTypes(productionTypes || []);
      setUser(me);
    }).catch((err) => active && setError(err?.message || "Products could not be loaded."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const builders = useMemo(() => moduleFilter ? ESTIMATOR_MODULES.filter((module) => module.key === moduleFilter) : ESTIMATOR_MODULES, [moduleFilter]);

  const visibleQuickProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return quickProducts.filter((product) => {
      const group = product.product_group === "global" ? "global" : "my";
      // "My" templates are personal by definition. Built-in created_by_id is the
      // ownership boundary; unowned rows remain visible for imported legacy compatibility.
      if (group === "my" && product.created_by_id && product.created_by_id !== user?.id) return false;
      if (scope !== "all" && group !== scope) return false;
      if (status === "active" && product.is_active === false) return false;
      if (status === "inactive" && product.is_active !== false) return false;
      if (moduleFilter && (product.source_module_key || (product.source_product_class === "custom" ? "custom" : "")) !== moduleFilter) return false;
      if (!q) return true;
      const haystack = [product.product_name, product.source_builder_name, product.source_module_key, product.product_category, product.production_product_type, product.client_description, product.product_notes, ...(product.categories || [])].filter(Boolean).join(" ").toLowerCase();
      return q.split(/\s+/).every((term) => haystack.includes(term));
    }).sort((a, b) => String(a.product_name || "").localeCompare(String(b.product_name || "")));
  }, [quickProducts, query, scope, status, moduleFilter, user?.id, user?.role]);

  const accessibleQuickProducts = quickProducts.filter((product) => product.product_group === "global" || !product.created_by_id || product.created_by_id === user?.id);
  const activeCount = accessibleQuickProducts.filter((product) => product.is_active !== false).length;
  const globalCount = accessibleQuickProducts.filter((product) => product.is_active !== false && product.product_group === "global").length;
  const myCount = accessibleQuickProducts.filter((product) => product.is_active !== false && product.product_group !== "global").length;

  const setView = (nextView) => {
    const next = new URLSearchParams(searchParams);
    if (nextView === "all") next.delete("view");
    else next.set("view", nextView);
    setSearchParams(next);
  };

  const updateLocal = (updated) => setQuickProducts((current) => current.map((row) => row.id === updated.id ? { ...row, ...updated } : row));

  const toggleActive = async (product) => {
    const next = product.is_active === false;
    try {
      const updated = await base44.entities.QuickProduct.update(product.id, { is_active: next });
      updateLocal({ ...product, is_active: next, ...(updated || {}) });
    } catch (err) {
      setError(err?.message || "Quick Product status could not be changed.");
    }
  };

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-[1280px] mx-auto p-4 sm:p-5 space-y-4">
        <div className="bg-white border border-gray-200 rounded-md px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="w-9 h-9 rounded bg-red-50 text-red-700 flex items-center justify-center"><Package className="w-5 h-5" /></div>
          <div className="min-w-0 flex-1"><h1 className="text-[18px] font-bold text-gray-900">Products</h1><p className="text-[10px] text-gray-500">Builders create configurable Products. Quick Products are reusable frozen Product packages. Master Inventory remains the Part resource library.</p></div>
          <Link to="/MasterInventory"><Button variant="outline" className="h-[31px] text-[11px]"><Boxes className="w-3.5 h-3.5 mr-1.5" /> Master Inventory</Button></Link>
          <Link to="/NewAllInOneEstimate"><Button className="h-[31px] text-[11px] bg-[#454545] hover:bg-[#353535]"><PackagePlus className="w-3.5 h-3.5 mr-1.5" /> New Estimate</Button></Link>
        </div>

        {error && <div className="px-3 py-2 rounded border border-red-200 bg-red-50 text-[11px] text-red-700">{error}</div>}

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white border border-gray-200 rounded px-3 py-2"><div className="text-[9px] font-bold tracking-wider text-gray-400">BUILDERS</div><div className="text-[18px] font-bold text-gray-900">{ESTIMATOR_MODULES.length}</div></div>
          <div className="bg-white border border-gray-200 rounded px-3 py-2"><div className="text-[9px] font-bold tracking-wider text-gray-400">MY QUICK PRODUCTS</div><div className="text-[18px] font-bold text-gray-900">{myCount}</div></div>
          <div className="bg-white border border-gray-200 rounded px-3 py-2"><div className="text-[9px] font-bold tracking-wider text-gray-400">GLOBAL QUICK PRODUCTS</div><div className="text-[18px] font-bold text-gray-900">{globalCount}</div></div>
        </div>

        <div className="bg-white border border-gray-200 rounded-md px-3 py-2 flex flex-wrap items-center gap-1.5">
          {[['all', 'All'], ['builders', 'Builders'], ['quick', 'Quick Products']].map(([key, label]) => <button key={key} type="button" onClick={() => setView(key)} className={`h-[28px] px-3 rounded border text-[10px] font-bold ${view === key || (key === 'all' && view === 'all') ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>{label}</button>)}
          {moduleFilter && <div className="ml-auto text-[10px] text-gray-500">Filtered to <strong>{moduleLabel(moduleFilter)}</strong> <button type="button" onClick={() => { const next = new URLSearchParams(searchParams); next.delete('module'); setSearchParams(next); }} className="ml-1 underline">clear</button></div>}
        </div>

        {view !== "quick" && (
          <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between"><div><h2 className="text-[13px] font-bold text-gray-900">Product Builders</h2><p className="text-[10px] text-gray-500">Open a Builder directly in Quick Price, or add the same Builder inside a full estimate.</p></div><span className="text-[10px] text-gray-400">{builders.length} shown</span></div>
            <div className="divide-y divide-gray-100">
              {builders.map((module) => (
                <Link key={module.key} to={`/QuickPrice?module=${module.key}`} className="flex items-center justify-between gap-4 px-4 py-2.5 hover:bg-red-50/40">
                  <div className="min-w-0"><div className="text-[12px] font-semibold text-gray-800">{module.label}</div><div className="text-[9px] text-gray-400">Configurable Builder · creates persistent Product + Parts when used in an estimate</div></div>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-red-700 whitespace-nowrap">Open Builder <ArrowRight className="w-3.5 h-3.5" /></div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {view !== "builders" && (
          <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="min-w-0 lg:flex-1"><h2 className="text-[13px] font-bold text-gray-900">Quick Product Library</h2><p className="text-[10px] text-gray-500">Reusable Product snapshots saved from an estimate Product. Metadata can change here without rewriting the frozen Builder/Part package.</p></div>
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="relative w-[230px]"><Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Quick Products..." className="w-full h-[30px] pl-8 pr-2 border border-gray-300 rounded text-[11px]" /></div>
                <select value={scope} onChange={(event) => setScope(event.target.value)} className="h-[30px] px-2 border border-gray-300 rounded bg-white text-[10px]"><option value="all">My + Global</option><option value="my">My</option><option value="global">Global</option></select>
                <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-[30px] px-2 border border-gray-300 rounded bg-white text-[10px]"><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All Statuses</option></select>
              </div>
            </div>

            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 text-[9px] text-gray-500 flex items-center justify-between"><span>{visibleQuickProducts.length} matching Quick Product{visibleQuickProducts.length === 1 ? "" : "s"}</span><span>{activeCount} active total</span></div>

            {loading ? <div className="py-14 text-center text-[11px] text-gray-400">Loading Quick Products…</div> : visibleQuickProducts.length === 0 ? (
              <div className="py-12 px-6 text-center">
                <PackagePlus className="w-9 h-9 text-gray-300 mx-auto" />
                <div className="mt-2 text-[12px] font-bold text-gray-800">No Quick Products found</div>
                <p className="mt-1 text-[10px] text-gray-500 max-w-xl mx-auto">Build or open a Product inside an estimate, then use <strong>Save as Quick Product</strong>. The complete Builder, Parts, Part Groups, inventory snapshots and accepted pricing are preserved.</p>
                <Link to="/NewAllInOneEstimate" className="inline-flex mt-3"><Button variant="outline" className="h-[30px] text-[10px]">Open a New Estimate</Button></Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b border-gray-200"><tr className="text-[9px] tracking-wide text-gray-500"><th className="px-4 py-2 font-bold">QUICK PRODUCT</th><th className="px-3 py-2 font-bold">SOURCE</th><th className="px-3 py-2 font-bold">PARTS</th><th className="px-3 py-2 font-bold text-right">FROZEN PRICE</th><th className="px-3 py-2 font-bold">LIBRARY</th><th className="px-3 py-2 font-bold">STATUS</th><th className="px-4 py-2 font-bold text-right">ACTIONS</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibleQuickProducts.map((product) => {
                      const price = productPrice(product);
                      const partCount = product.parts_snapshot?.length ?? product.parts?.length ?? 0;
                      const global = product.product_group === "global";
                      return <tr key={product.id} className="hover:bg-gray-50/70">
                        <td className="px-4 py-2.5 min-w-[230px]"><div className="text-[11px] font-bold text-gray-900">{product.product_name || "Quick Product"}</div><div className="mt-0.5 text-[9px] text-gray-400 truncate max-w-[320px]">{product.product_category || (product.categories || []).join(" · ") || "Uncategorized"}</div>{product.production_product_type && <div className="mt-0.5 text-[8px] text-cyan-700 truncate max-w-[320px]">Production: {product.production_product_type}</div>}</td>
                        <td className="px-3 py-2.5 text-[10px] text-gray-600 whitespace-nowrap">{moduleLabel(product.source_module_key || (product.source_product_class === "custom" ? "custom" : ""))}<div className="text-[8px] text-gray-400">Template v{num(product.template_version, 1)}</div></td>
                        <td className="px-3 py-2.5 text-[10px] text-gray-700">{partCount}<div className="text-[8px] text-gray-400">{product.part_groups_snapshot?.length || 0} groups</div></td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap"><div className="text-[11px] font-bold text-gray-900">{money(price.extended)}</div>{price.quantity !== 1 && <div className="text-[8px] text-gray-400">{price.quantity} × {money(price.frozenUnit)}</div>}</td>
                        <td className="px-3 py-2.5"><span className={`inline-flex items-center gap-1 h-[22px] px-2 rounded border text-[9px] font-bold ${global ? "border-blue-200 bg-blue-50 text-blue-700" : "border-violet-200 bg-violet-50 text-violet-700"}`}>{global ? <ShieldCheck className="w-3 h-3" /> : <UserRound className="w-3 h-3" />}{global ? "GLOBAL" : "MY"}</span></td>
                        <td className="px-3 py-2.5"><span className={`inline-flex items-center gap-1 text-[9px] font-semibold ${product.is_active === false ? "text-gray-400" : "text-emerald-700"}`}>{product.is_active === false ? "Inactive" : <><CheckCircle2 className="w-3 h-3" /> Active</>}</span></td>
                        <td className="px-4 py-2.5"><div className="flex justify-end gap-1"><button type="button" onClick={() => setEditing(product)} className="h-[27px] px-2.5 rounded border border-gray-300 bg-white text-[9px] font-bold text-gray-700 hover:bg-gray-50">Edit</button><button type="button" onClick={() => toggleActive(product)} className="h-[27px] px-2.5 rounded border border-gray-300 bg-white text-[9px] font-bold text-gray-600 hover:bg-gray-50">{product.is_active === false ? "Activate" : "Deactivate"}</button></div></td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>

      <QuickProductEditDialog product={editing} open={!!editing} onClose={() => setEditing(null)} onSaved={updateLocal} productionProductTypes={productionProductTypes} />
    </div>
  );
}