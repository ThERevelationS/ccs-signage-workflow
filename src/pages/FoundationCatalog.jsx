import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Pencil, Trash2, Search } from "lucide-react";
import { MATERIAL_TYPES, typeLabel } from "@/components/masterInventory/foundationFieldSchema";
// groupInventoryBySupplier (CMP-A08 tail) sections the catalog list by
// canonical supplier key — "No supplier recorded" stays visible last.
import { groupInventoryBySupplier } from "@/components/masterInventory/inventoryNormalization";
import FoundationMaterialDialog from "@/components/masterInventory/FoundationMaterialDialog";
import { deleteEntityIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { staffEntities } from "@/components/staff/staffEntities";

export default function FoundationCatalog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState(() => new URLSearchParams(window.location.search).get("type") || "concrete_service");
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const writeParam = (key, value, defaultValue = "") => {
    try {
      const next = new URLSearchParams(window.location.search);
      if (value && value !== defaultValue) next.set(key, value); else next.delete(key);
      window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
    } catch {}
  };
  const [editing, setEditing] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const deleteRef = useRef(new Set());

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await loadAllEntityRows({ entity: staffEntities.FoundationInventory, sort: "-created_date", label: "Foundation Catalog inventory" });
      setRows(res || []);
    } catch (error) {
      console.error("Foundation catalog load failed:", error);
      setLoadError(error?.message || "Foundation Catalog could not be verified.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const q = search.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (r.material_type !== activeType) return false;
    if (!q) return true;
    return [r.material_name, r.material_description, r.supplier, r.unit]
      .filter(Boolean).join(" ").toLowerCase().includes(q);
  });

  // (#421) The catalog fetches paged via loadAllEntityRows and the type chips
  // need whole-table counts; the rendered list windows instead of mounting
  // every row at once. Resets when the type or search changes.
  const ROW_PAGE = 60;
  const [visibleCount, setVisibleCount] = useState(ROW_PAGE);
  useEffect(() => { setVisibleCount(ROW_PAGE); }, [activeType, q]);

  // CMP-A08 tail: the filtered list sections by canonical supplier key
  // (unrecorded suppliers sort last, never merged). The visibleCount window
  // still caps rendered ROWS — group headers don't count against it.
  const catalogSections = (() => {
    let budget = visibleCount;
    const out = [];
    for (const group of groupInventoryBySupplier(visible)) {
      if (budget <= 0) break;
      const groupRows = group.rows.slice(0, budget);
      budget -= groupRows.length;
      out.push({ ...group, rows: groupRows });
    }
    return out;
  })();

  const handleDelete = async (row) => {
    if (!row?.id || loadError || deleteRef.current.has(row.id)) return;
    deleteRef.current.add(row.id);
    if (!window.confirm(`Delete "${row.material_name || "this material"}"? This cannot be undone.`)) {
      deleteRef.current.delete(row.id);
      return;
    }
    try {
      const live = await staffEntities.FoundationInventory.get(row.id);
      if (row.updated_date && live?.updated_date && row.updated_date !== live.updated_date) {
        alert("This Foundation Catalog item changed in another session and was not deleted. The latest catalog will be reloaded first.");
        await load();
        return;
      }
      await deleteEntityIfUnchanged({
        entity: staffEntities.FoundationInventory,
        record: live,
        label: `Foundation Catalog item "${live.material_name || row.material_name || "Material"}"`,
      });
      await load();
    } catch (error) {
      console.error("Foundation catalog delete failed:", error);
      alert(error?.message || "Foundation Catalog item could not be deleted.");
      await load();
    } finally {
      deleteRef.current.delete(row.id);
    }
  };

  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <Link to="/Estimator" className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Estimator
          </Link>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
            <Input
              placeholder="Search name, description, supplier…"
              aria-label="Search catalog materials"
              value={search}
              onChange={(e) => { const v = e.target.value; setSearch(v); writeParam("q", v); }}
              className="pl-9 h-9"
            />
          </div>
          <Button
            disabled={!!loadError}
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
          >
            <Plus className="w-4 h-4" aria-hidden="true" /> New Material
          </Button>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Foundation Catalog</h1>
        <p className="text-sm text-gray-500 mb-4">
          Materials, poles, walls and equipment used by the Concrete | Masonry | Poles estimator.
        </p>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4" role="tablist" aria-label="Material type filter"
          onKeyDown={(e) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
            const tabs = [...e.currentTarget.querySelectorAll('button[role="tab"]')];
            const i = tabs.indexOf(document.activeElement);
            if (i < 0) return;
            e.preventDefault();
            const next = e.key === "Home" ? tabs[0] : e.key === "End" ? tabs[tabs.length - 1] : tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
            next?.focus();
          }}>
          {MATERIAL_TYPES.map((t) => (
            <button type="button"
              key={t.value}
              role="tab"
              aria-selected={activeType === t.value}
              onClick={() => { const v = t.value; setActiveType(v); writeParam("type", v, "concrete_service"); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border ${
                activeType === t.value
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-red-300"
              }`}
            >
              {t.label} ({rows.filter((r) => r.material_type === t.value).length})
            </button>
          ))}
        </div>

        {loading ? (
          <ListSkeleton rows={6} />
        ) : loadError ? (
          <div role="alert" className="py-8 text-center bg-red-50 rounded-xl border border-red-200 text-red-700">
            <div className="font-semibold">Foundation Catalog could not be verified.</div>
            <div className="text-xs mt-1">{loadError}</div>
            <Button variant="outline" size="sm" className="mt-3" onClick={load}>Retry</Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-12 text-center bg-white rounded-xl border border-dashed border-gray-300 text-gray-500">
            No {typeLabel(activeType)} entries yet.
          </div>
        ) : (
          <div className="space-y-4">
            {catalogSections.map((group) => (
              <div key={group.key ?? "__unassigned__"} className="space-y-2">
                {/* CMP-A08 tail: explicit supply grouping — rows split by their
                    canonical supplier key; unrecorded suppliers stay visible
                    last instead of silently merging into another vendor. */}
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200 pb-1">
                  {group.label ? <>Supplier: <span className="text-slate-700 normal-case">{group.label}</span></> : 'No supplier recorded'}
                </div>
                {group.rows.map((row) => (
              <div
                key={row.id}
                className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{row.material_name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {row.material_description || row.supplier || "—"}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-sm font-semibold text-gray-800">
                    ${Number(row.cost_per_unit || row.cost_per_day || row.pole_stock_price || 0).toFixed(2)}
                    <span className="text-xs text-gray-400 font-normal">
                      {row.unit ? ` / ${row.unit}` : ""}
                    </span>
                  </div>
                  <button type="button"
                    disabled={!!loadError}
                    onClick={() => {
                      setEditing(row);
                      setDialogOpen(true);
                    }}
                    title={`Edit ${row.material_name || "material"}`}
                    aria-label={`Edit ${row.material_name || "material"}`}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-gray-400 hover:text-red-600"
                  >
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => handleDelete(row)} title={`Delete ${row.material_name || "material"}`} aria-label={`Delete ${row.material_name || "material"}`} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
                ))}
              </div>
            ))}
            {visible.length > visibleCount && (
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + ROW_PAGE)}
                className="w-full h-[30px] rounded-lg border border-gray-300 bg-white text-[11px] font-bold text-gray-600 hover:bg-gray-50"
              >
                Show {Math.min(ROW_PAGE, visible.length - visibleCount)} more ({visible.length - visibleCount} remaining)
              </button>
            )}
          </div>
        )}
      </div>

      <FoundationMaterialDialog
        open={dialogOpen}
        record={editing}
        defaultType={activeType}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          load();
        }}
      />
    </div>
  );
}