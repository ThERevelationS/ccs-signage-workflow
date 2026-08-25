import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { MATERIAL_TYPES, typeLabel } from "@/components/masterInventory/foundationFieldSchema";
import FoundationMaterialDialog from "@/components/masterInventory/FoundationMaterialDialog";

export default function FoundationCatalog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState("concrete_service");
  const [editing, setEditing] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    const res = await base44.entities.FoundationInventory.list("-created_date", 500);
    setRows(res || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const visible = rows.filter((r) => r.material_type === activeType);

  const handleDelete = async (row) => {
    await base44.entities.FoundationInventory.delete(row.id);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <Link to="/Estimator" className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600">
            <ArrowLeft className="w-4 h-4" /> Estimator
          </Link>
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="bg-red-600 hover:bg-red-700 text-white"
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