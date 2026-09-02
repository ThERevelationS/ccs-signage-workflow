import { useEffect, useMemo, useRef, useState } from "react";
import {
  Type,
  Layers,
  Wrench,
  Zap,
  Cpu,
  Hammer,
  Sticker,
  Paintbrush,
  Plus,
  Search,
  ArrowRight,
  PackagePlus,
  Sparkles,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ESTIMATOR_MODULES } from "@/components/estimator/moduleRegistry";
import { listQuickProducts } from "@/components/estimator/products/quickProductService";
import { money } from "@/components/estimator/aioPricing";

const META = {
  channel_letters: {
    icon: Type,
    color: "text-purple-700",
    iconBg: "bg-purple-100",
    accent: "border-purple-200 hover:border-purple-400 hover:bg-purple-50/60",
    blurb: "Channel letters, dimensional letters, purchased letters, installation, equipment and travel.",
    keywords: "letters channel dimensional dimensional letters raceway install installation illuminated signage",
  },
  foundation: {
    icon: Layers,
    color: "text-amber-700",
    iconBg: "bg-amber-100",
    accent: "border-amber-200 hover:border-amber-400 hover:bg-amber-50/60",
    blurb: "Concrete foundations, masonry, poles, excavation, walls, caps and site landscaping.",
    keywords: "concrete masonry foundation footing footings pole poles excavation brick wall monument base landscaping",
  },
  maintenance: {
    icon: Wrench,
    color: "text-teal-700",
    iconBg: "bg-teal-100",
    accent: "border-teal-200 hover:border-teal-400 hover:bg-teal-50/60",
    blurb: "Service calls, troubleshooting, repairs, retrofits, crew, equipment and travel.",
    keywords: "maintenance service repair repairs troubleshooting retrofit retrofits service call lighting electrical",
  },
  laser: {
    icon: Zap,
    color: "text-pink-700",
    iconBg: "bg-pink-100",
    accent: "border-pink-200 hover:border-pink-400 hover:bg-pink-50/60",
    blurb: "Laser cutting and engraving with machine time, materials, supplies and labor.",
    keywords: "laser engraving engrave etch cutting acrylic wood plastic machine",
  },
  cnc: {
    icon: Cpu,
    color: "text-emerald-700",
    iconBg: "bg-emerald-100",
    accent: "border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50/60",
    blurb: "CNC routing, machining, workholding, material cutting and labor.",
    keywords: "cnc router routing machining cut cutting acrylic pvc hdu aluminum wood workholding vacuum",
  },
  metal: {
    icon: Hammer,
    color: "text-orange-700",
    iconBg: "bg-orange-100",
    accent: "border-orange-200 hover:border-orange-400 hover:bg-orange-50/60",
    blurb: "Metal materials, fabrication, welding, finishing and shop labor.",
    keywords: "metal fabrication welding weld aluminum steel angle tube sheet finishing paint fabricated",
  },
  brick_stone: {
    icon: Layers,
    color: "text-stone-700",
    iconBg: "bg-stone-200",
    accent: "border-stone-300 hover:border-stone-500 hover:bg-stone-100/70",
    blurb: "Brick, stone, block, mortar, masonry materials and installation labor.",
    keywords: "brick stone block masonry mortar veneer monument wall base",
  },
  vinyl: {
    icon: Sticker,
    color: "text-indigo-700",
    iconBg: "bg-indigo-100",
    accent: "border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/60",
    blurb: "Cut vinyl, printed graphics, laminate, application and production labor.",
    keywords: "vinyl graphics graphic print printed printing laminate decal decals wrap film application",
  },
  painting: {
    icon: Paintbrush,
    color: "text-sky-700",
    iconBg: "bg-sky-100",
    accent: "border-sky-200 hover:border-sky-400 hover:bg-sky-50/60",
    blurb: "Paint panels, dimensional lettering and complex shapes with paint, mask, supplies and labor.",
    keywords: "paint painting finish finishing spray color pms panel lettering letters dimensional mask primer",
  },
};

const getMeta = (key) =>
  META[key] || {
    icon: Layers,
    color: "text-gray-700",
    iconBg: "bg-gray-100",
    accent: "border-gray-200 hover:border-gray-400 hover:bg-gray-50",
    blurb: "",
    keywords: "",
  };

export default function AddProductGrid({ counts = {}, onAdd, onAddCustom, onAddQuickProduct, className = "" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [addingKey, setAddingKey] = useState(null);
  const [customNameOpen, setCustomNameOpen] = useState(false);
  const [customName, setCustomName] = useState("Custom Product");
  const [quickProducts, setQuickProducts] = useState([]);
  const [quickLoading, setQuickLoading] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const timer = setTimeout(() => searchRef.current?.focus(), 80);
    setQuickLoading(true);
    listQuickProducts()
      .then((rows) => setQuickProducts(rows || []))
      .catch(() => setQuickProducts([]))
      .finally(() => setQuickLoading(false));
    return () => clearTimeout(timer);
  }, [open]);

  const customMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const haystack = "blank custom product manual parts inventory build your own product";
    return q.split(/\s+/).every((term) => haystack.includes(term));
  }, [query]);

  const quickResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    return quickProducts.filter((product) => {
      if (!q) return true;
      const haystack = [
        product.product_name,
        product.source_builder_name,
        product.source_module_key,
        product.product_category,
        product.production_product_type,
        ...(product.categories || []),
      ].filter(Boolean).join(" ").toLowerCase();
      return q.split(/\s+/).every((term) => haystack.includes(term));
    });
  }, [quickProducts, query]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const registryOrder = Object.fromEntries(ESTIMATOR_MODULES.map((m, i) => [m.key, i]));

    return ESTIMATOR_MODULES.filter((mod) => {
      if (!q) return true;
      const meta = getMeta(mod.key);
      const haystack = `${mod.label} ${mod.key} ${meta.blurb} ${meta.keywords}`.toLowerCase();
      return q.split(/\s+/).every((term) => haystack.includes(term));
    }).sort((a, b) => {
      if (q) return registryOrder[a.key] - registryOrder[b.key];
      const countDiff = Number(counts[b.key] || 0) - Number(counts[a.key] || 0);
      return countDiff || registryOrder[a.key] - registryOrder[b.key];
    });
  }, [query, counts]);

  const handleAdd = async (mod) => {
    if (!mod || addingKey) return;
    setAddingKey(mod.key);
    try {
      await onAdd(mod);
      setOpen(false);
    } finally {
      setAddingKey(null);
    }
  };

  const beginCustom = () => {
    if (addingKey) return;
    setOpen(false);
    setCustomName("Custom Product");
    setCustomNameOpen(true);
  };

  const handleAddCustom = async () => {
    if (addingKey) return;
    setAddingKey("custom");
    try {
      await onAddCustom?.(customName.trim() || "Custom Product");
      setCustomNameOpen(false);
    } finally {
      setAddingKey(null);
    }
  };

  const handleAddQuick = async (quickProduct) => {
    if (!quickProduct || addingKey) return;
    setAddingKey(`quick:${quickProduct.id}`);
    try {
      await onAddQuickProduct?.(quickProduct);
      setOpen(false);
    } finally {
      setAddingKey(null);
    }
  };

  const handleSearchKeyDown = (event) => {
    const totalMatches = results.length + quickResults.length + (customMatches ? 1 : 0);
    if (event.key !== "Enter" || totalMatches !== 1 || addingKey) return;
    event.preventDefault();
    if (customMatches) beginCustom();
    else if (results.length === 1) handleAdd(results[0]);
    else handleAddQuick(quickResults[0]);
  };

  const usedCount = ESTIMATOR_MODULES.filter((mod) => Number(counts[mod.key] || 0) > 0).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`h-[32px] px-3 inline-flex items-center gap-1.5 rounded-sm border border-gray-700 bg-[#454545] text-white text-[12px] font-semibold shadow-sm hover:bg-[#353535] active:translate-y-px ${className}`}
      >
        <Plus className="w-3.5 h-3.5 text-lime-300" />
        Add Product
      </button>

      <Dialog open={open} onOpenChange={(next) => !addingKey && setOpen(next)}>
        <DialogContent className="sm:max-w-[900px] p-0 overflow-hidden gap-0 border-gray-300 shadow-2xl">
          <DialogHeader className="px-5 pt-5 pb-4 bg-gradient-to-r from-slate-950 to-slate-800 text-white border-b border-slate-700">
            <div className="flex items-start gap-3 pr-8">
              <div className="w-10 h-10 rounded-md bg-lime-300 text-slate-950 flex items-center justify-center shadow-sm flex-shrink-0">
                <PackagePlus className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-[18px] font-bold text-white leading-tight">Find a Product</DialogTitle>
                <p className="mt-1 text-[11px] text-slate-300 font-normal">
                  Search by product type, material, process or service. Select a result to build it directly inside this estimate.
                </p>
              </div>
            </div>

            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search products — try acrylic, graphics, masonry, service, letters..."
                className="w-full h-[42px] pl-10 pr-4 rounded-md bg-white text-[13px] text-gray-900 placeholder:text-gray-400 border border-white/20 shadow-inner outline-none focus:ring-2 focus:ring-lime-300"
              />
            </div>
          </DialogHeader>

          <div className="bg-white">
            <div className="px-5 py-2.5 border-b border-gray-100 flex items-center justify-between gap-3 bg-gray-50/80">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="w-3.5 h-3.5 text-lime-600 flex-shrink-0" />
                <span className="text-[11px] font-semibold text-gray-700">
                  {query ? `${results.length + quickResults.length + (customMatches ? 1 : 0)} matching product${results.length + quickResults.length + (customMatches ? 1 : 0) === 1 ? "" : "s"}` : "Blank Products, Builders & Quick Products"}
                </span>
                {!query && usedCount > 0 && (
                  <span className="text-[10px] text-gray-400">• types already used on this estimate are shown first</span>
                )}
              </div>
              <span className="text-[10px] text-gray-400 whitespace-nowrap">{ESTIMATOR_MODULES.length} builders · {quickProducts.length} Quick Products</span>
            </div>

            <div className="p-3 max-h-[520px] overflow-y-auto">
              {!customMatches && results.length === 0 && quickResults.length === 0 && !quickLoading ? (
                <div className="py-14 px-6 text-center">
                  <div className="mx-auto w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                    <Search className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="text-[13px] font-bold text-gray-800">No products found</div>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Try a broader term such as “vinyl,” “metal,” “service,” “letters,” or “concrete.”
                  </p>
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="mt-4 h-[30px] px-3 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {customMatches && (
                    <button
                      type="button"
                      disabled={!!addingKey}
                      onClick={beginCustom}
                      className="w-full text-left border-2 border-lime-300 rounded-md p-4 bg-lime-50/70 hover:bg-lime-100/80 hover:border-lime-500 transition-all shadow-sm disabled:opacity-60 disabled:cursor-wait"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-[#454545] text-lime-300 flex items-center justify-center"><PackagePlus className="w-5 h-5" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2"><span className="text-[13px] font-extrabold text-gray-900">Blank / Custom Product</span><span className="text-[9px] px-2 py-0.5 rounded bg-lime-200 border border-lime-300 text-gray-700 font-bold">BUILD FROM PARTS</span></div>
                          <p className="mt-1 text-[10px] text-gray-600">Name the Product yourself and add any Parts directly from the Master Inventory. No dedicated Builder is attached.</p>
                          <div className="mt-2 text-[10px] font-bold text-gray-800 inline-flex items-center gap-1">{addingKey === "custom" ? "Creating product…" : "Create blank product"}{addingKey !== "custom" && <ArrowRight className="w-3 h-3" />}</div>
                        </div>
                      </div>
                    </button>
                  )}
                  {results.length > 0 && (
                  <div>
                    <div className="text-[9px] font-extrabold tracking-widest text-gray-400 px-1 pb-1.5">BUILDERS</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {results.map((mod) => {
                    const meta = getMeta(mod.key);
                    const Icon = meta.icon;
                    const count = Number(counts[mod.key] || 0);
                    const adding = addingKey === mod.key;

                    return (
                      <button
                        type="button"
                        key={mod.key}
                        disabled={!!addingKey}
                        onClick={() => handleAdd(mod)}
                        className={`group min-h-[92px] text-left border rounded-md p-3 transition-all shadow-sm hover:shadow-md disabled:opacity-60 disabled:cursor-wait ${meta.accent}`}
                      >
                        <div className="flex items-start gap-3 h-full">
                          <div className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${meta.iconBg}`}>
                            <Icon className={`w-[18px] h-[18px] ${meta.color}`} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-bold text-gray-900 truncate">{mod.label}</span>
                              {count > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-white border border-gray-200 text-[9px] font-semibold text-gray-500 whitespace-nowrap">
                                  {count} in estimate
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-[10px] leading-[1.45] text-gray-500 line-clamp-2">{meta.blurb}</p>
                            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-gray-700 group-hover:text-gray-950">
                              {adding ? "Adding product…" : "Add to estimate"}
                              {!adding && <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                    </div>
                  </div>
                  )}

                  {(quickLoading || quickResults.length > 0) && (
                    <div>
                      <div className="text-[9px] font-extrabold tracking-widest text-gray-400 px-1 pb-1.5 flex items-center justify-between">
                        <span>QUICK PRODUCTS</span>
                        <span className="font-medium normal-case tracking-normal">{quickLoading ? "Loading…" : `${quickResults.length} available`}</span>
                      </div>
                      {quickLoading ? (
                        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-6 text-center text-[11px] text-gray-400">Loading Quick Products…</div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {quickResults.map((product) => {
                            const adding = addingKey === `quick:${product.id}`;
                            const builderLabel = product.source_product_class === "builder"
                              ? (product.source_builder_name || "Builder Product")
                              : product.source_product_class === "legacy"
                                ? "Legacy Quick Product"
                                : "Custom Product";
                            const quickQuantity = Math.max(0, Number(product.product_quantity ?? 1) || 0);
                            const quickUnitPrice = Number(product.price_snapshot?.frozen_cost ?? 0);
                            const quickExtendedPrice = product.total_price !== undefined && product.total_price !== null
                              ? Number(product.total_price || 0)
                              : quickUnitPrice * quickQuantity;
                            return (
                              <button
                                type="button"
                                key={product.id}
                                disabled={!!addingKey}
                                onClick={() => handleAddQuick(product)}
                                className="group min-h-[86px] text-left border border-cyan-200 rounded-md p-3 bg-cyan-50/40 hover:border-cyan-400 hover:bg-cyan-50 transition-all shadow-sm hover:shadow-md disabled:opacity-60 disabled:cursor-wait"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="w-9 h-9 rounded-md bg-cyan-100 text-cyan-700 flex items-center justify-center flex-shrink-0"><PackagePlus className="w-[18px] h-[18px]" /></div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[12px] font-bold text-gray-900 truncate">{product.product_name}</span>
                                      <span className="text-[9px] px-1.5 py-0.5 rounded border border-cyan-200 bg-white text-cyan-700 font-semibold">{product.product_group === "global" ? "GLOBAL" : "MY"}</span>
                                    </div>
                                    <div className="mt-1 text-[10px] text-gray-500 truncate">{builderLabel}{product.product_category ? ` · ${product.product_category}` : ""}{product.production_product_type ? ` · Production: ${product.production_product_type}` : ""}</div>
                                    <div className="mt-1 flex items-center justify-between gap-2">
                                      <span className="text-[9px] text-gray-400 truncate">{(product.categories || []).join(" · ") || "Uncategorized"}</span>
                                      <div className="text-right flex-shrink-0">
                                        <div className="text-[11px] font-bold text-gray-800">{money(quickExtendedPrice)}</div>
                                        {quickQuantity !== 1 && quickUnitPrice > 0 && <div className="text-[8px] text-gray-400">{quickQuantity} × {money(quickUnitPrice)}</div>}
                                      </div>
                                    </div>
                                    <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-gray-700 group-hover:text-gray-950">{adding ? "Adding Quick Product…" : "Add Quick Product"}{!adding && <ArrowRight className="w-3 h-3" />}</div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
              <span className="text-[10px] text-gray-400">Tip: when one search result remains, press Enter to add it.</span>
              <button
                type="button"
                disabled={!!addingKey}
                onClick={() => setOpen(false)}
                className="h-[28px] px-3 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={customNameOpen} onOpenChange={(next) => !addingKey && setCustomNameOpen(next)}>
        <DialogContent className="sm:max-w-[520px] p-0 overflow-hidden border-gray-300 shadow-xl">
          <DialogHeader className="px-5 py-4 bg-[#424242] text-white border-b-4 border-lime-300">
            <DialogTitle className="text-white text-[16px] flex items-center gap-2"><PackagePlus className="w-5 h-5 text-lime-300" /> Create Blank / Custom Product</DialogTitle>
            <p className="text-[11px] text-gray-300 mt-1">Give the Product its client-facing name. You can add and group Master Inventory Parts immediately afterward.</p>
          </DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); handleAddCustom(); }} className="p-5 bg-white space-y-4">
            <label className="text-[10px] font-bold tracking-wide text-gray-500 block">PRODUCT NAME
              <input autoFocus value={customName} onChange={(event) => setCustomName(event.target.value)} className="mt-1 w-full h-[36px] px-3 border border-gray-300 rounded text-[13px]" placeholder="e.g. Worship Center Circle Sign" />
            </label>
            <div className="rounded border border-lime-200 bg-lime-50 px-3 py-2 text-[10px] text-gray-700">This Product has no dedicated Builder. Its price is the sum of its Parts, with frozen Master Inventory snapshots and explicit Update Price control.</div>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={!!addingKey} onClick={() => setCustomNameOpen(false)} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600">Cancel</button>
              <button type="submit" disabled={!!addingKey || !customName.trim()} className="h-[32px] px-4 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-50">{addingKey === "custom" ? "Creating…" : "Create Product"}</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
