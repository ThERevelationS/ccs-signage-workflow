// Master Inventory — Extruded Metals & Poles tab.
//
// Single flat list combining two data sources:
//   1. Inventory entity — extruded stock (Angle / Channel / Tube / Flat Bar /
//      Round Bar / I-Beam / H-Beam / Pipe). LEGACY rows with non-extrusion
//      product_type or non-enum material_type are HIDDEN here — see the
//      "Clean Up Legacy Rows" button to migrate them out.
//   2. FoundationInventory rows with material_type = "pole" — sign poles.
//
// Pole toggle: each Inventory extrusion row carries an `is_pole` boolean. When
// ON, the Concrete | Masonry | Poles estimator also lists this row as an
// available pole (geometry derived from product_type + size, $/ft from
// cost_per_unit, paint rate from the global Foundation Setting). The original
// FoundationInventory pole rows still work exactly as before — nothing is
// migrated.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Inventory, FoundationInventory } from "@/entities/all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Package, Anchor, Wand2, Loader2 } from "lucide-react";
import InventoryTable from "./InventoryTable";
import InventoryFormModal from "./InventoryFormModal";
import {
  VALID_MATERIAL_TYPES,
  VALID_EXTRUSION_PRODUCT_TYPES,
  previewLegacyMigration,
  migrateLegacyInventoryRows,
} from "./legacyInventoryMigrator";

// True if this Inventory row is a real extrusion (not legacy junk and not
// sheet/plate). Sheet/Plate belong in Substrates.
const isValidExtrusion = (row) =>
  VALID_MATERIAL_TYPES.has(row.material_type) &&
  VALID_EXTRUSION_PRODUCT_TYPES.has(row.product_type);

// ── Form schema for an EXTRUDED METAL row (Inventory entity) ───────────────
const EXTRUDED_METALS_SOURCE = {
  key: "extruded_metals",
  label: "Extruded Metal",
  entity: Inventory,
  nameField: "size",
  fields: [
    { name: "material_type", label: "Material", type: "select",
      options: ["Aluminum", "Steel", "Stainless_Steel", "Galvanized_Steel", "Brass", "Copper", "Plastic", "Other"],
      required: true, table: true },
    // Note: "Sheet" and "Plate" intentionally omitted — sheet/plate stock
    // belongs in the Substrates tab (DimensionalLetterMaterial).
    { name: "product_type", label: "Product", type: "select",
      options: ["Angle", "Channel", "Tube_Square", "Tube_Round", "Flat_Bar", "Round_Bar", "I_Beam", "H_Beam", "Pipe", "Other"],
      required: true, table: true },
    { name: "size", label: "Size", type: "text", required: true, table: true },
    { name: "thickness_gauge", label: "Thick. / Gauge", type: "text", table: true },
    { name: "standard_length", label: "Std Length (ft)", type: "number" },
    { name: "cost_per_unit", label: "Cost", type: "number", required: true, table: true },
    { name: "unit_type", label: "Unit", type: "select",
      options: ["per_foot", "per_piece", "per_pound", "per_sqft"], table: true },
    { name: "is_pole", label: "Use as Pole", type: "boolean", table: true },
    { name: "supplier", label: "Supplier", type: "text", table: true },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
};

// ── Form schema for a POLE row (FoundationInventory entity, material_type=pole) ──
const POLES_SOURCE = {
  key: "poles",
  label: "Pole",
  entity: FoundationInventory,
  nameField: "material_name",
  defaults: { material_type: "pole" },
  fields: [
    { name: "material_name", label: "Name", type: "text", required: true, table: true },
    { name: "pole_shape", label: "Shape", type: "select",
      options: ["square", "round"], table: true },
    { name: "pole_width_inches", label: "Width (in)", type: "number", table: true },
    { name: "pole_depth_inches", label: "Depth (in)", type: "number" },
    { name: "pole_wall_thickness_inches", label: "Wall Thick. (in)", type: "number" },
    { name: "pole_stock_length_ft", label: "Stock Length (ft)", type: "number", table: true },
    { name: "pole_pricing_mode", label: "Pricing", type: "select",
      options: ["per_foot", "stock_price"], table: true },
    { name: "cost_per_unit", label: "$/ft", type: "number", table: true },
    { name: "pole_stock_price", label: "Stock Price", type: "number" },
    { name: "paint_rate_per_linear_ft", label: "Paint $/LF", type: "number" },
    { name: "supplier", label: "Supplier", type: "text", table: true },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
};

// ── Combined-view schema used to render the single flat table ──────────────
// is_pole is wired as an inline toggle — only applies to Extruded rows.
const COMBINED_TABLE_SOURCE = {
  key: "extruded_metals_poles",
  label: "Item",
  nameField: "_displayName",
  fields: [
    { name: "_kind", label: "Kind", type: "text", table: true },
    { name: "material_type", label: "Material", type: "text", table: true },
    { name: "product_type", label: "Product", type: "text", table: true },
    { name: "size", label: "Size", type: "text", table: true },
    { name: "thickness_gauge", label: "Thick. / Gauge", type: "text", table: true },
    { name: "cost_per_unit", label: "Cost", type: "number", table: true },
    { name: "unit_type", label: "Unit", type: "text", table: true },
    { name: "is_pole", label: "Use as Pole", type: "boolean", table: true },
    { name: "supplier", label: "Supplier", type: "text", table: true },
  ],
};

// Project a FoundationInventory pole row onto the combined-table columns.
const polesToRow = (p) => ({
  ...p,
  _kind: "Pole",
  _displayName: p.material_name,
  _entity: FoundationInventory,
  material_type: "Pole",
  product_type: p.pole_shape ? `${p.pole_shape} pole` : "pole",
  size: [p.pole_width_inches, p.pole_depth_inches].filter(Boolean).join(" × ") +
        (p.pole_width_inches ? '"' : ""),
  thickness_gauge: p.pole_wall_thickness_inches ? `${p.pole_wall_thickness_inches}"` : "",
  cost_per_unit: p.pole_pricing_mode === "stock_price" ? p.pole_stock_price : p.cost_per_unit,
  unit_type: p.pole_pricing_mode === "stock_price"
    ? `per ${p.pole_stock_length_ft || "?"}ft stock`
    : "per_foot",
  // A dedicated pole row in FoundationInventory IS always a pole — but the
  // toggle is only meaningful for Inventory extrusions. We surface "true"
  // visually and the table prevents toggling because the field is on a
  // different entity.
  is_pole: true,
});

const metalsToRow = (m) => ({
  ...m,
  _kind: "Extruded",
  _displayName: `${m.material_type || ""} ${m.product_type || ""} ${m.size || ""}`.trim(),
  _entity: Inventory,
});

export default function MasterExtrudedMetalsPolesTab({ isAdmin }) {
  const [metalsItems, setMetalsItems] = useState([]);
  const [polesItems, setPolesItems] = useState([]);
  const [allMetalsRaw, setAllMetalsRaw] = useState([]); // unfiltered, for legacy detection
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formSource, setFormSource] = useState(EXTRUDED_METALS_SOURCE);
  const [migrating, setMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState({ done: 0, total: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [metals, foundation] = await Promise.all([
        Inventory.list(),
        FoundationInventory.list(),
      ]);
      setAllMetalsRaw(metals);
      // Filter out legacy junk rows — sheet/plate, permits, labor, trim cap, etc.
      setMetalsItems(metals.filter(isValidExtrusion));
      setPolesItems(foundation.filter((r) => r.material_type === "pole"));
    } catch (e) {
      console.error("Failed to load extruded metals & poles:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Legacy-row preview counts
  const legacyPreview = useMemo(
    () => previewLegacyMigration(allMetalsRaw),
    [allMetalsRaw]
  );
  const legacyTotal =
    legacyPreview.labor_service +
    legacyPreview.sign_parts_supplies +
    legacyPreview.substrate;

  // Build the combined, search-filtered list.
  const combined = useMemo(() => {
    const rows = [
      ...metalsItems.map(metalsToRow),
      ...polesItems.map(polesToRow),
    ];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((it) =>
      Object.values(it).some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [metalsItems, polesItems, search]);

  const handleAddMetal = () => {
    setEditingItem(null);
    setFormSource(EXTRUDED_METALS_SOURCE);
    setShowForm(true);
  };
  const handleAddPole = () => {
    setEditingItem(null);
    setFormSource(POLES_SOURCE);
    setShowForm(true);
  };

  const handleEdit = (item) => {
    const src = item._kind === "Pole" ? POLES_SOURCE : EXTRUDED_METALS_SOURCE;
    setFormSource(src);
    setEditingItem(item);
    setShowForm(true);
  };

  const handleDelete = async (item) => {
    const src = item._kind === "Pole" ? POLES_SOURCE : EXTRUDED_METALS_SOURCE;
    const name = item._displayName || item[src.nameField];
    if (!window.confirm(`Delete "${name}"?`)) return;
    await src.entity.delete(item.id);
    load();
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditingItem(null);
    load();
  };

  const handleCleanupLegacy = async () => {
    if (legacyTotal === 0) return;
    const msg =
      `Migrate ${legacyTotal} legacy row${legacyTotal === 1 ? "" : "s"} out of Extruded Metals?\n\n` +
      `  • ${legacyPreview.labor_service} → Labor & Services\n` +
      `  • ${legacyPreview.sign_parts_supplies} → Sign Parts | Supplies\n` +
      `  • ${legacyPreview.substrate} → Substrates\n\n` +
      `Original rows will be DELETED from Inventory after a successful copy.\n\nContinue?`;
    if (!window.confirm(msg)) return;

    setMigrating(true);
    setMigrationProgress({ done: 0, total: legacyTotal });
    try {
      const summary = await migrateLegacyInventoryRows(allMetalsRaw, {
        onProgress: setMigrationProgress,
      });
      alert(
        `Migration complete.\n\n` +
        `  • ${summary.labor_service} → Labor & Services\n` +
        `  • ${summary.sign_parts_supplies} → Sign Parts | Supplies\n` +
        `  • ${summary.substrate} → Substrates\n` +
        (summary.errors ? `  • ${summary.errors} errors (see console)\n` : "")
      );
      await load();
    } catch (e) {
      console.error(e);
      alert("Migration failed — see console for details.");
    }
    setMigrating(false);
  };

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardHeader className="border-b">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-slate-700" />
            Extruded Metals & Poles
            <Badge variant="outline" className="ml-2 font-normal">
              {combined.length} of {metalsItems.length + polesItems.length}
            </Badge>
            {legacyTotal > 0 && (
              <Badge variant="outline" className="ml-1 font-normal bg-amber-50 text-amber-800 border-amber-300">
                {legacyTotal} legacy hidden
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            {isAdmin && legacyTotal > 0 && (
              <Button
                onClick={handleCleanupLegacy}
                disabled={migrating}
                variant="outline"
                className="h-9 border-amber-300 text-amber-800 hover:bg-amber-50"
                title={`Move ${legacyTotal} misfiled legacy row(s) to their correct entities`}
              >
                {migrating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    {migrationProgress.done}/{migrationProgress.total}
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-1" />
                    Clean Up {legacyTotal} Legacy Row{legacyTotal === 1 ? "" : "s"}
                  </>
                )}
              </Button>
            )}
            {isAdmin && (
              <>
                <Button onClick={handleAddMetal} className="bg-blue-600 hover:bg-blue-700 text-white h-9">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Metal
                </Button>
                <Button onClick={handleAddPole} variant="outline" className="h-9">
                  <Anchor className="w-4 h-4 mr-1" />
                  Add Pole
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="text-xs text-slate-500 mb-3 flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
          <Anchor className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
          <span>
            Toggle <strong>Use as Pole</strong> on any extrusion to make it selectable in the
            Concrete | Masonry | Poles estimator. Shape is derived from product type
            (Tube_Square → square, Tube_Round / Pipe → round), width from <em>Size</em>,
            $/ft from <em>Cost</em>, and paint rate from your Foundation Settings.
            Dedicated pole rows below still work as before.
          </span>
        </div>
        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading…</div>
        ) : (
          <InventoryTable
            source={COMBINED_TABLE_SOURCE}
            items={combined}
            canEdit={isAdmin}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onInlineToggle={(itemId, fieldName, next) => {
              // Update local state for the Extruded row whose is_pole toggle changed.
              if (fieldName === "is_pole") {
                setMetalsItems((prev) =>
                  prev.map((it) => (it.id === itemId ? { ...it, [fieldName]: next } : it))
                );
                setAllMetalsRaw((prev) =>
                  prev.map((it) => (it.id === itemId ? { ...it, [fieldName]: next } : it))
                );
              }
            }}
          />
        )}
      </CardContent>

      {showForm && (
        <InventoryFormModal
          source={formSource}
          editingItem={editingItem}
          onCancel={() => { setShowForm(false); setEditingItem(null); }}
          onSaved={handleSaved}
        />
      )}
    </Card>
  );
}