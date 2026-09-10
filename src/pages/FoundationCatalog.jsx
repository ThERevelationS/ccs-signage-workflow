import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { MATERIAL_TYPES, typeLabel } from "@/components/masterInventory/foundationFieldSchema";
import FoundationMaterialDialog from "@/components/masterInventory/FoundationMaterialDialog";
import { deleteEntityIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

export default function FoundationCatalog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState("concrete_service");
  const [editing, setEditing] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const deleteRef = useRef(new Set());

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await loadAllEntityRows({ entity: base44.entities.FoundationInventory, sort: "-created_date", label: "Foundation Catalog inventory" });
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

  const visible = rows.filter((r) => r.material_type === activeType);

  const handleDelete = async (row) => {
    if (!row?.id || loadError || deleteRef.current.has(row.id)) return;
    deleteRef.current.add(row.id);
    if (!window.confirm(`Delete "${row.material_name || "this material"}"? This cannot be undone.`)) {
      deleteRef.current.delete(row.id);
      return;
    }
    try {
      const live = await base44.entities.FoundationInventory.get(row.id);
      if (row.updated_date && live?.updated_date && row.updated_date !== live.updated_date) {
        alert("This Foundation Catalog item changed in another session and was not deleted. The latest catalog will be reloaded first.");
        await load();
        return;
      }
      await deleteEntityIfUnchanged({
        entity: base44.entities.FoundationInventory,
        record: live,
        label: `Foundation Catalog item “${live.material_name || row.material_name || "Material"}”`,
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
            <ArrowLeft className="w-4 h-4" /> Estimator
          </Link>
          <Button
            disabled={!!loadError}
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> New Material
          </Button>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Foundation Catalog</h1>
        <p className="text-sm text-gray-500 mb-4">
          Materials, poles, walls and equipment used by the Concrete | Masonry | Poles estimator.
        </p>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {MATERIAL_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setActiveType(t.value)}
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
          <div className="py-12 text-center text-gray-400">Loading catalog…</div>
        ) : loadError ? (
          <div className="py-8 text-center bg-red-50 rounded-xl border border-red-200 text-red-700">
            <div className="font-semibold">Foundation Catalog could not be verified.</div>
            <div className="text-xs mt-1">{loadError}</div>
            <Button variant="outline" size="sm" className="mt-3" onClick={load}>Retry</Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-12 text-center bg-white rounded-xl border border-dashed border-gray-300 text-gray-500">
            No {typeLabel(activeType)} entries yet.
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((row) => (
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
                  <button
                    disabled={!!loadError}
                    onClick={() => {
                      setEditing(row);
                      setDialogOpen(true);
                    }}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(row)} className="text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
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