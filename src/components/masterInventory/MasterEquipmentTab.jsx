// Master Inventory — Equipment tab.
//
// Top-level: Rental | Owned sub-tabs (ownership state).
// Within each ownership tab: Equipment | Attachments | Sub-Attachments.
//
// Merges equipment from two underlying entities:
//   - FoundationInventory rows with material_type in (excavation_equipment, attachment, sub_attachment)
//   - ChannelLetterInstallEquipment rows
//
// Only TOP-LEVEL Equipment items get cross-estimator visibility toggles
// (Channel & Dimensional / Concrete-Masonry-Poles / Sign Maintenance).
// Attachments and Sub-Attachments inherit visibility from the Equipment they
// are linked to — they are not surfaced independently to estimators.

import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Edit, Plus, Wrench, Link2, Settings2, Truck, ArrowUpFromLine, Star } from "lucide-react";

const FoundationInventoryEntity = base44.entities.FoundationInventory;
const ChannelLetterInstallEquipmentEntity = base44.entities.ChannelLetterInstallEquipment;

// ── small helpers ──────────────────────────────────────────────────────────
const FOUNDATION_EQUIPMENT_TYPES = ["excavation_equipment", "attachment", "sub_attachment"];
// Equipment types that belong to the dedicated "Boom Lifts" tab.
const BOOM_EQUIPMENT_TYPES = ["boom_lift", "boom_truck"];

function MultiSelectDropdown({ label, options, selectedIds, onChange }) {
  const toggle = (id) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((i) => i !== id) : [...selectedIds, id]);
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="border rounded-md p-2 space-y-1 max-h-40 overflow-y-auto bg-slate-50">
        {options.length === 0 && <p className="text-xs text-slate-400 italic">No items available</p>}
        {options.map((opt) => (
          <div key={opt.id} className="flex items-center gap-2">
            <Checkbox id={`ms-${opt.id}`} checked={selectedIds.includes(opt.id)} onCheckedChange={() => toggle(opt.id)} />
            <Label htmlFor={`ms-${opt.id}`} className="text-xs cursor-pointer">{opt.material_name}</Label>
          </div>
        ))}
      </div>
    </div>
  );
}

// Convert a row (regardless of source entity) into a normalized shape for the list view.
function normalizeRow(row, source) {
  if (source === "channel_letter_equipment") {
    return {
      _source: source,
      id: row.id,
      name: row.equipment_name,
      kind: "equipment",              // top-level equipment (no attachment tree on this entity)
      equipment_type: row.equipment_type || "",
      ownership: row.ownership || "rented",
      is_primary_owned: row.is_primary_owned ?? false,
      cost_per_day: row.cost_per_day || 0,
      cost_per_week: row.cost_per_week || 0,
      cost_per_month: row.cost_per_month || 0,
      show_in_channel_letters: row.show_in_channel_letters ?? true,
      show_in_foundation: row.show_in_foundation ?? false,
      show_in_sign_maintenance: row.show_in_sign_maintenance ?? false,
      raw: row,
    };
  }
  // FoundationInventory equipment row
  const kind =
    row.material_type === "attachment" ? "attachment" :
    row.material_type === "sub_attachment" ? "sub_attachment" : "equipment";
  return {
    _source: "foundation_equipment",
    id: row.id,
    name: row.material_name,
    kind,
    equipment_type: row.equipment_type || "",
    ownership: row.ownership || "rented",
    cost_per_day: row.cost_per_day || 0,
    cost_per_week: row.cost_per_week || 0,
    cost_per_month: row.cost_per_month || 0,
    show_in_channel_letters: row.show_in_channel_letters ?? false,
    show_in_foundation: row.show_in_foundation ?? true,
    show_in_sign_maintenance: row.show_in_sign_maintenance ?? false,
    raw: row,
  };
}

export default function MasterEquipmentTab({ isAdmin }) {
  const [foundationRows, setFoundationRows] = useState([]);
  const [channelRows, setChannelRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ownership, setOwnership] = useState("rented"); // "rented" | "owned"
  const [activeKind, setActiveKind] = useState("equipment");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);          // normalized row or { kind, _source, raw: {} } for new
  const [newSource, setNewSource] = useState("foundation_equipment");

  const load = async () => {
    setLoading(true);
    try {
      const [fnd, chn] = await Promise.all([
        FoundationInventoryEntity.list(),
        ChannelLetterInstallEquipmentEntity.list(),
      ]);
      setFoundationRows(fnd.filter((r) => FOUNDATION_EQUIPMENT_TYPES.includes(r.material_type)));
      setChannelRows(chn);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Normalized + filtered list
  const allNormalized = useMemo(() => {
    const a = foundationRows.map((r) => normalizeRow(r, "foundation_equipment"));
    const b = channelRows.map((r) => normalizeRow(r, "channel_letter_equipment"));
    return [...a, ...b].filter((r) => (r.ownership || "rented") === ownership);
  }, [foundationRows, channelRows, ownership]);

  const isBoom = (r) => BOOM_EQUIPMENT_TYPES.includes(r.equipment_type);
  // "Construction Equipment" = top-level equipment that is NOT a boom lift/truck.
  const equipmentRows  = allNormalized.filter((r) => r.kind === "equipment" && !isBoom(r));
  const boomRows       = allNormalized.filter((r) => r.kind === "equipment" && isBoom(r));
  const attachmentRows = allNormalized.filter((r) => r.kind === "attachment");
  const subAttachRows  = allNormalized.filter((r) => r.kind === "sub_attachment");

  // We need ALL foundation attachments/sub-attachments regardless of ownership for the linking pickers,
  // because compatibility is a global tree.
  const allFoundationAttachments    = foundationRows.filter((r) => r.material_type === "attachment");
  const allFoundationSubAttachments = foundationRows.filter((r) => r.material_type === "sub_attachment");
  const allFoundationEquipment      = foundationRows.filter((r) => r.material_type === "excavation_equipment");

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const deleteItem = async (row) => {
    if (!window.confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    if (row._source === "channel_letter_equipment") {
      await ChannelLetterInstallEquipmentEntity.delete(row.id);
    } else {
      await FoundationInventoryEntity.delete(row.id);
    }
    load();
  };

  const toggleVisibility = async (row, field, next) => {
    const entity = row._source === "channel_letter_equipment" ? ChannelLetterInstallEquipmentEntity : FoundationInventoryEntity;
    await entity.update(row.id, { [field]: next });
    // optimistic local refresh
    if (row._source === "channel_letter_equipment") {
      setChannelRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: next } : r)));
    } else {
      setFoundationRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: next } : r)));
    }
  };

  // Mark a boom lift as the "Primary owned lift" — the suggester's go-to pick.
  // Only ONE channel-letter equipment row can be primary at a time, so clear it
  // on every other channel row first.
  const setPrimaryOwned = async (row, next) => {
    if (row._source !== "channel_letter_equipment") return;
    if (next) {
      const others = channelRows.filter((r) => r.id !== row.id && r.is_primary_owned);
      await Promise.all(others.map((r) => ChannelLetterInstallEquipmentEntity.update(r.id, { is_primary_owned: false })));
    }
    await ChannelLetterInstallEquipmentEntity.update(row.id, { is_primary_owned: next });
    setChannelRows((prev) => prev.map((r) =>
      r.id === row.id ? { ...r, is_primary_owned: next } : (next ? { ...r, is_primary_owned: false } : r)
    ));
  };

  const openAdd = () => {
    // Boom Lifts tab → create a ChannelLetterInstallEquipment boom_lift (no attachment tree).
    if (activeKind === "boom_lift") {
      setNewSource("channel_letter_equipment");
      setEditItem({
        _new: true,
        kind: "equipment",
        _source: "channel_letter_equipment",
        equipment_type: "boom_lift",
        raw: {
          equipment_name: "",
          equipment_type: "boom_lift",
          pricing_mode: "per_day",
          ownership,
          cost_per_day: 0, cost_per_week: 0, cost_per_month: 0, delivery_pickup_cost: 0,
          show_in_channel_letters: true, show_in_foundation: false, show_in_sign_maintenance: false,
        },
      });
      setShowForm(true);
      return;
    }
    // New rows default to FoundationInventory so attachment-tree linking is available.
    // The form lets the user pick the entity for top-level Equipment.
    setNewSource("foundation_equipment");
    setEditItem({
      _new: true,
      kind: activeKind,
      _source: "foundation_equipment",
      raw: {
        material_type:
          activeKind === "attachment" ? "attachment" :
          activeKind === "sub_attachment" ? "sub_attachment" : "excavation_equipment",
        material_name: "",
        cost_per_day: 0, cost_per_week: 0, cost_per_month: 0, pickup_delivery_cost: 0,
        ownership,
        compatible_attachment_ids: [], compatible_sub_attachment_ids: [],
        show_in_channel_letters: false, show_in_foundation: true, show_in_sign_maintenance: false,
        sort_order: 0,
      },
    });
    setShowForm(true);
  };

  const openEdit = (row) => {
    setNewSource(row._source);
    setEditItem({ ...row });
    setShowForm(true);
  };

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardHeader className="border-b flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-cyan-600" />
          Equipment
          <Badge variant="outline" className="ml-2 font-normal">{allNormalized.length} items</Badge>
        </CardTitle>
        <div className="flex items-center gap-3">
          <Tabs value={ownership} onValueChange={setOwnership}>
            <TabsList>
              <TabsTrigger value="rented">Rental</TabsTrigger>
              <TabsTrigger value="owned">Owned</TabsTrigger>
            </TabsList>
          </Tabs>
          {isAdmin && (
            <Button size="sm" onClick={openAdd} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-1" /> Add {activeKind === "equipment" ? "Construction Equipment" : activeKind === "boom_lift" ? "Boom Lift" : activeKind === "attachment" ? "Attachment" : "Sub-Attachment"}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <Tabs value={activeKind} onValueChange={setActiveKind}>
          <TabsList className="mb-4">
            <TabsTrigger value="equipment"><Wrench className="w-3.5 h-3.5 mr-1" /> Construction Equipment ({equipmentRows.length})</TabsTrigger>
            <TabsTrigger value="boom_lift"><ArrowUpFromLine className="w-3.5 h-3.5 mr-1" /> Boom Lifts ({boomRows.length})</TabsTrigger>
            <TabsTrigger value="attachment"><Link2 className="w-3.5 h-3.5 mr-1" /> Attachments ({attachmentRows.length})</TabsTrigger>
            <TabsTrigger value="sub_attachment"><Settings2 className="w-3.5 h-3.5 mr-1" /> Sub-Attachments ({subAttachRows.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="equipment">
            <EquipmentList
              rows={equipmentRows}
              attachments={allFoundationAttachments}
              equipment={allFoundationEquipment}
              loading={loading}
              isAdmin={isAdmin}
              onEdit={openEdit}
              onDelete={deleteItem}
              onToggle={toggleVisibility}
            />
          </TabsContent>
          <TabsContent value="boom_lift">
            <EquipmentList
              rows={boomRows}
              attachments={allFoundationAttachments}
              equipment={allFoundationEquipment}
              loading={loading}
              isAdmin={isAdmin}
              isBoomList
              onEdit={openEdit}
              onDelete={deleteItem}
              onToggle={toggleVisibility}
              onSetPrimary={setPrimaryOwned}
            />
          </TabsContent>
          <TabsContent value="attachment">
            <EquipmentList
              rows={attachmentRows}
              attachments={allFoundationAttachments}
              subAttachments={allFoundationSubAttachments}
              equipment={allFoundationEquipment}
              isAttachment
              loading={loading}
              isAdmin={isAdmin}
              onEdit={openEdit}
              onDelete={deleteItem}
              onToggle={toggleVisibility}
            />
          </TabsContent>
          <TabsContent value="sub_attachment">
            <EquipmentList
              rows={subAttachRows}
              attachments={allFoundationAttachments}
              isSubAttachment
              loading={loading}
              isAdmin={isAdmin}
              onEdit={openEdit}
              onDelete={deleteItem}
              onToggle={toggleVisibility}
            />
          </TabsContent>
        </Tabs>
      </CardContent>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem?._new ? "Add" : "Edit"} {activeKind === "equipment" ? "Construction Equipment" : activeKind === "boom_lift" ? "Boom Lift" : activeKind === "attachment" ? "Attachment" : "Sub-Attachment"}</DialogTitle></DialogHeader>
          {editItem && (
            <EquipmentForm
              normalized={editItem}
              ownership={ownership}
              allFoundationEquipment={allFoundationEquipment}
              allFoundationAttachments={allFoundationAttachments}
              allFoundationSubAttachments={allFoundationSubAttachments}
              onCancel={() => { setShowForm(false); setEditItem(null); }}
              onSaved={() => { setShowForm(false); setEditItem(null); load(); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── List ──────────────────────────────────────────────────────────────────
function EquipmentList({ rows, attachments = [], subAttachments = [], equipment = [], isAttachment, isSubAttachment, isBoomList, loading, isAdmin, onEdit, onDelete, onToggle, onSetPrimary }) {
  if (loading) return <div className="text-center text-slate-400 py-8">Loading…</div>;
  if (rows.length === 0) return <div className="text-center py-8 text-slate-400 text-sm italic border rounded bg-slate-50">No items in this category.</div>;

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Card key={`${row._source}-${row.id}`} className="hover:shadow-sm">
          <CardHeader className="py-3 px-4 flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                {row.name}
                <Badge variant="outline" className="text-[10px] font-normal">
                  {row._source === "channel_letter_equipment" ? "Channel Letter Equip." : "Foundation"}
                </Badge>
                {isBoomList && row.ownership === "owned" && row.is_primary_owned && (
                  <Badge className="text-[10px] font-medium bg-amber-100 text-amber-800 border-amber-200 gap-1">
                    <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Primary
                  </Badge>
                )}
              </CardTitle>
              <div className="flex gap-4 text-xs text-slate-600 mt-1">
                {row.ownership === "owned" ? (
                  <span className="text-emerald-700 font-medium">Owned — no rental cost</span>
                ) : (
                  <>
                    <span>Day: <strong>${row.cost_per_day}</strong></span>
                    <span>Wk: <strong>${row.cost_per_week}</strong></span>
                    <span>Mo: <strong>${row.cost_per_month}</strong></span>
                  </>
                )}
              </div>
            </div>
            {isAdmin && (
              <div className="flex gap-1">
                {isBoomList && row.ownership === "owned" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onSetPrimary?.(row, !row.is_primary_owned)}
                    className={`h-7 w-7 ${row.is_primary_owned ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}
                    title={row.is_primary_owned ? "Primary owned lift — the suggester's go-to pick. Click to unset." : "Set as Primary owned lift (suggester's go-to pick)"}
                  >
                    <Star className={`w-4 h-4 ${row.is_primary_owned ? "fill-amber-500" : ""}`} />
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => onEdit(row)} className="h-7 w-7"><Edit className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="ghost" onClick={() => onDelete(row)} className="h-7 w-7 text-red-500"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0 space-y-2">
            {/* Visibility toggles — only on top-level Equipment.
                Attachments and Sub-Attachments inherit visibility from their parent Equipment. */}
            {!isAttachment && !isSubAttachment && (
              <div className="flex flex-wrap gap-4 pt-1 border-t mt-1">
                <ToggleRow label="Channel & Dimensional" checked={row.show_in_channel_letters} onChange={(v) => onToggle(row, "show_in_channel_letters", v)} disabled={!isAdmin} />
                <ToggleRow label="Concrete | Masonry"   checked={row.show_in_foundation}      onChange={(v) => onToggle(row, "show_in_foundation",      v)} disabled={!isAdmin} />
                <ToggleRow label="Sign Maintenance"     checked={row.show_in_sign_maintenance} onChange={(v) => onToggle(row, "show_in_sign_maintenance", v)} disabled={!isAdmin} />
              </div>
            )}

            {/* Dependency display */}
            {!isAttachment && !isSubAttachment && row._source === "foundation_equipment" && (
              <div className="text-xs text-slate-500 pt-1">
                <strong>Linked Attachments:</strong>{" "}
                {row.raw.compatible_attachment_ids?.length
                  ? attachments.filter((a) => row.raw.compatible_attachment_ids.includes(a.id)).map((a) => a.material_name).join(", ")
                  : "None"}
              </div>
            )}
            {isAttachment && (
              <div className="text-xs text-slate-500 space-y-1 pt-1">
                <div><strong>Compatible Equipment:</strong> {equipment.filter((e) => e.compatible_attachment_ids?.includes(row.id)).map((e) => e.material_name).join(", ") || "None"}</div>
                <div><strong>Linked Sub-Attachments:</strong> {row.raw.compatible_sub_attachment_ids?.length ? subAttachments.filter((s) => row.raw.compatible_sub_attachment_ids.includes(s.id)).map((s) => s.material_name).join(", ") : "None"}</div>
              </div>
            )}
            {isSubAttachment && (
              <div className="text-xs text-slate-500 pt-1">
                <strong>Compatible Attachments:</strong>{" "}
                {attachments.filter((a) => a.compatible_sub_attachment_ids?.includes(row.id)).map((a) => a.material_name).join(", ") || "None"}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ToggleRow({ label, checked, onChange, disabled }) {
  return (
    <div className="flex items-center gap-2">
      <Switch checked={!!checked} onCheckedChange={onChange} disabled={disabled} />
      <Label className="text-xs">{label}</Label>
    </div>
  );
}

// ── Form ──────────────────────────────────────────────────────────────────
function EquipmentForm({ normalized, ownership, allFoundationEquipment, allFoundationAttachments, allFoundationSubAttachments, onCancel, onSaved }) {
  const isNew = !!normalized._new;
  const source = normalized._source;
  const kind   = normalized.kind;

  // Build initial form from underlying row + visibility flags.
  const initial = useMemo(() => {
    if (source === "channel_letter_equipment") {
      const r = normalized.raw || {};
      return {
        // channel letter equipment fields
        equipment_name: r.equipment_name || "",
        equipment_type: r.equipment_type || "boom_lift",
        pricing_mode: r.pricing_mode || "per_day",
        ownership: r.ownership || ownership,
        cost_per_day: r.cost_per_day || 0,
        cost_per_week: r.cost_per_week || 0,
        cost_per_month: r.cost_per_month || 0,
        cost_flat: r.cost_flat || 0,
        delivery_pickup_cost: r.delivery_pickup_cost || 0,
        max_height_feet: r.max_height_feet || 0,
        vertical_reach_safety_margin_feet: r.vertical_reach_safety_margin_feet ?? 2,
        is_default_for_height: !!r.is_default_for_height,
        default_height_min_feet: r.default_height_min_feet || 0,
        default_height_max_feet: r.default_height_max_feet || 0,
        is_primary_owned: !!r.is_primary_owned,
        mpg: r.mpg || 0,
        fuel_type: r.fuel_type || "na",
        idle_running_cost_per_hour: r.idle_running_cost_per_hour || 0,
        rental_company: r.rental_company || "",
        notes: r.notes || "",
        show_in_channel_letters: r.show_in_channel_letters ?? true,
        show_in_foundation: r.show_in_foundation ?? false,
        show_in_sign_maintenance: r.show_in_sign_maintenance ?? false,
      };
    }
    // foundation
    const r = normalized.raw || {};
    return {
      material_name: r.material_name || "",
      material_type: r.material_type || (kind === "attachment" ? "attachment" : kind === "sub_attachment" ? "sub_attachment" : "excavation_equipment"),
      equipment_type: r.equipment_type || "",
      supports_attachments: r.supports_attachments ?? true,
      ownership: r.ownership || ownership,
      cost_per_day: r.cost_per_day || 0,
      cost_per_week: r.cost_per_week || 0,
      cost_per_month: r.cost_per_month || 0,
      pickup_delivery_cost: r.pickup_delivery_cost || 0,
      rental_company: r.rental_company || "",
      mpg: r.mpg || 0,
      fuel_type: r.fuel_type || "na",
      idle_running_cost_per_hour: r.idle_running_cost_per_hour || 0,
      compatible_attachment_ids: r.compatible_attachment_ids || [],
      compatible_sub_attachment_ids: r.compatible_sub_attachment_ids || [],
      allow_multiple: !!r.allow_multiple,
      is_pillar_excavation: !!r.is_pillar_excavation,
      is_spread_foot_excavation: !!r.is_spread_foot_excavation,
      is_non_excavation_equipment: !!r.is_non_excavation_equipment,
      is_miscellaneous_attachment: !!r.is_miscellaneous_attachment,
      notes: r.notes || "",
      show_in_channel_letters: r.show_in_channel_letters ?? false,
      show_in_foundation: r.show_in_foundation ?? true,
      show_in_sign_maintenance: r.show_in_sign_maintenance ?? false,
    };
  }, [normalized, source, kind, ownership]);

  const [form, setForm] = useState(initial);
  // For attachments, allow reverse-linking to top-level equipment.
  const [linkedEquipmentIds, setLinkedEquipmentIds] = useState(
    kind === "attachment" ? allFoundationEquipment.filter((e) => e.compatible_attachment_ids?.includes(normalized.id)).map((e) => e.id) : []
  );
  const [linkedAttachmentIdsForSub, setLinkedAttachmentIdsForSub] = useState(
    kind === "sub_attachment" ? allFoundationAttachments.filter((a) => a.compatible_sub_attachment_ids?.includes(normalized.id)).map((a) => a.id) : []
  );

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const nameField = source === "channel_letter_equipment" ? "equipment_name" : "material_name";
  const isValid = !!form[nameField];

  const handleSave = async () => {
    let savedId = normalized.id;
    // When Owned, blank out rental-only fields so we don't carry stale values.
    const cleanForOwnership = (p) => {
      if ((p.ownership || ownership) === "owned") {
        p.rental_company = "";
        // Owned items don't have a rental pricing mode — force flat.
        if ("pricing_mode" in p) p.pricing_mode = "owned_flat";
      } else if ("pricing_mode" in p) {
        // Rented items default to per_day if not already a per_* mode.
        if (!/^per_(day|week|month)$/.test(p.pricing_mode || "")) p.pricing_mode = "per_day";
      }
      return p;
    };
    if (source === "channel_letter_equipment") {
      const payload = cleanForOwnership({ ...form });
      if (isNew) {
        const saved = await ChannelLetterInstallEquipmentEntity.create(payload);
        savedId = saved.id;
      } else {
        await ChannelLetterInstallEquipmentEntity.update(normalized.id, payload);
      }
      // Only one boom may be the Primary owned lift — clear it on all others.
      if (payload.is_primary_owned) {
        const all = await ChannelLetterInstallEquipmentEntity.list();
        await Promise.all(
          all
            .filter((r) => r.id !== savedId && r.is_primary_owned)
            .map((r) => ChannelLetterInstallEquipmentEntity.update(r.id, { is_primary_owned: false }))
        );
      }
    } else {
      const payload = cleanForOwnership({ ...form });
      if (isNew) {
        const saved = await FoundationInventoryEntity.create(payload);
        savedId = saved.id;
      } else {
        await FoundationInventoryEntity.update(normalized.id, payload);
      }

      // Bi-directional link sync for foundation attachments / sub-attachments.
      if (form.material_type === "attachment") {
        for (const eq of allFoundationEquipment) {
          const selected = linkedEquipmentIds.includes(eq.id);
          const arr = eq.compatible_attachment_ids || [];
          const has = arr.includes(savedId);
          if (selected && !has) await FoundationInventoryEntity.update(eq.id, { compatible_attachment_ids: [...arr, savedId] });
          else if (!selected && has) await FoundationInventoryEntity.update(eq.id, { compatible_attachment_ids: arr.filter((i) => i !== savedId) });
        }
      } else if (form.material_type === "sub_attachment") {
        for (const att of allFoundationAttachments) {
          const selected = linkedAttachmentIdsForSub.includes(att.id);
          const arr = att.compatible_sub_attachment_ids || [];
          const has = arr.includes(savedId);
          if (selected && !has) await FoundationInventoryEntity.update(att.id, { compatible_sub_attachment_ids: [...arr, savedId] });
          else if (!selected && has) await FoundationInventoryEntity.update(att.id, { compatible_sub_attachment_ids: arr.filter((i) => i !== savedId) });
        }
      }
    }
    onSaved?.();
  };

  // === Derived state =========================================================
  const currentOwnership = form.ownership || ownership;
  const isRented = currentOwnership === "rented";
  const isOwned  = currentOwnership === "owned";

  // Equipment type list — uniform across both storage entities. Labels are
  // shown in Title Case but the stored value remains snake_case.
  const EQUIPMENT_TYPES = [
    "ladder", "scissor_lift", "boom_lift", "boom_truck", "scaffold",
    "truck", "car", "van", "flatbed",
    "hand_tool", "power_tool", "safety", "other",
  ];
  const titleCase = (s) =>
    String(s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // Equipment types that consume fuel — these get MPG + idle-running-cost fields
  // regardless of ownership. Boom lifts/trucks and vehicles burn fuel while
  // driving AND while idling on-site.
  const FUEL_TYPES = new Set([
    "scissor_lift", "boom_lift", "boom_truck",
    "truck", "car", "van", "flatbed",
  ]);
  const equipmentType =
    source === "channel_letter_equipment" ? form.equipment_type : form.equipment_type;
  const hasFuel = FUEL_TYPES.has(equipmentType);

  // "Supports Attachments?" toggle — replaces the old Storage dropdown.
  // YES → foundation_equipment (so the attachment tree is available).
  // NO  → channel_letter_equipment (lighter row, no attachment tree).
  // Only meaningful for NEW top-level equipment.
  const supportsAttachments = source === "foundation_equipment";
  const switchSupportsAttachments = (yes) => {
    const next = yes ? "foundation_equipment" : "channel_letter_equipment";
    if (next === source) return;
    normalized._source = next;
    // Preserve common values across the swap
    const carry = {
      ownership: form.ownership || ownership,
      cost_per_day: form.cost_per_day || 0,
      cost_per_week: form.cost_per_week || 0,
      cost_per_month: form.cost_per_month || 0,
      notes: form.notes || "",
      mpg: form.mpg || 0,
      fuel_type: form.fuel_type || "na",
      idle_running_cost_per_hour: form.idle_running_cost_per_hour || 0,
      show_in_channel_letters: form.show_in_channel_letters,
      show_in_foundation: form.show_in_foundation,
      show_in_sign_maintenance: form.show_in_sign_maintenance,
    };
    const name = form[nameField] || "";
    setForm(
      next === "channel_letter_equipment"
        ? {
            equipment_name: name,
            equipment_type: equipmentType || "boom_lift",
            pricing_mode: "per_day",
            cost_flat: 0,
            delivery_pickup_cost: form.pickup_delivery_cost || 0,
            max_height_feet: 0,
            rental_company: "",
            ...carry,
          }
        : {
            material_name: name,
            material_type: "excavation_equipment",
            equipment_type: equipmentType || "boom_lift",
            supports_attachments: true,
            pickup_delivery_cost: form.delivery_pickup_cost || 0,
            compatible_attachment_ids: [],
            compatible_sub_attachment_ids: [],
            allow_multiple: false,
            is_pillar_excavation: false,
            is_spread_foot_excavation: false,
            is_non_excavation_equipment: false,
            is_miscellaneous_attachment: false,
            ...carry,
          }
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. Name */}
      <div>
        <Label className="text-xs">Name *</Label>
        <Input className="h-8" value={form[nameField] || ""} onChange={(e) => set(nameField, e.target.value)} />
      </div>

      {/* 2. Ownership — right below Name */}
      <div>
        <Label className="text-xs">Ownership</Label>
        <Select value={currentOwnership} onValueChange={(v) => set("ownership", v)}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="rented">Rented</SelectItem>
            <SelectItem value="owned">Owned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 3. "Supports Attachments?" — replaces the old Storage dropdown.
              Only shown for NEW top-level equipment; existing items can't switch storage. */}
      {isNew && kind === "equipment" && (
        <div className="flex items-center justify-between rounded-md border p-2.5 bg-slate-50">
          <div>
            <Label className="text-xs font-semibold">Supports Attachments?</Label>
            <p className="text-[11px] text-slate-500">Turn on for equipment that uses attachments / sub-attachments (e.g. excavators, augers).</p>
          </div>
          <Switch checked={supportsAttachments} onCheckedChange={switchSupportsAttachments} />
        </div>
      )}

      {/* 4. Equipment Type (uniform list, Title-Case labels) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Equipment Type</Label>
          <Select
            value={equipmentType || ""}
            onValueChange={(v) => set("equipment_type", v)}
          >
            <SelectTrigger className="h-8"><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              {EQUIPMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {source === "channel_letter_equipment" && (
          <div>
            <Label className="text-xs">Max Height (ft)</Label>
            <Input type="number" className="h-8" value={form.max_height_feet || 0} onChange={(e) => set("max_height_feet", parseFloat(e.target.value) || 0)} />
          </div>
        )}
      </div>

      {/* Boom reach / default-range config — drives the equipment suggester. */}
      {source === "channel_letter_equipment" && ["boom_lift", "boom_truck"].includes(equipmentType) && (
        <div className="rounded-lg border bg-sky-50/60 border-sky-200 p-3 space-y-3">
          <p className="text-xs font-semibold text-sky-900">Boom Reach & Auto-Select</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Safety Margin (ft)</Label>
              <Input type="number" className="h-8" value={form.vertical_reach_safety_margin_feet ?? 2} onChange={(e) => set("vertical_reach_safety_margin_feet", parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          {isOwned && (
            <Toggle
              label="Primary owned lift (suggester's go-to pick)"
              checked={form.is_primary_owned}
              onChange={(v) => set("is_primary_owned", v)}
            />
          )}
          <Toggle
            label="Default for a height range"
            checked={form.is_default_for_height}
            onChange={(v) => set("is_default_for_height", v)}
          />
          {form.is_default_for_height && (
            <div className="grid grid-cols-2 gap-3 pl-1">
              <div>
                <Label className="text-xs">Min Height (ft)</Label>
                <Input type="number" className="h-8" value={form.default_height_min_feet || 0} onChange={(e) => set("default_height_min_feet", parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-xs">Max Height (ft)</Label>
                <Input type="number" className="h-8" value={form.default_height_max_feet || 0} onChange={(e) => set("default_height_max_feet", parseFloat(e.target.value) || 0)} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. Pricing Mode — only for RENTED. Always Per Day / Week / Month. */}
      {isRented && (
        <div className="rounded-lg border bg-slate-50 p-3 space-y-3">
          <p className="text-xs font-semibold text-slate-700">Rental Pricing (per day / week / month)</p>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs">Cost/Day</Label><Input type="number" className="h-8" value={form.cost_per_day} onChange={(e) => set("cost_per_day", parseFloat(e.target.value) || 0)} /></div>
            <div><Label className="text-xs">Cost/Week</Label><Input type="number" className="h-8" value={form.cost_per_week} onChange={(e) => set("cost_per_week", parseFloat(e.target.value) || 0)} /></div>
            <div><Label className="text-xs">Cost/Month</Label><Input type="number" className="h-8" value={form.cost_per_month} onChange={(e) => set("cost_per_month", parseFloat(e.target.value) || 0)} /></div>
          </div>
          <div>
            <Label className="text-xs">Rental Company</Label>
            <Input
              className="h-8"
              value={source === "channel_letter_equipment" ? (form.rental_company || "") : (form.rental_company || "")}
              onChange={(e) => set("rental_company", e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Delivery / Pickup applies to both — keep visible always */}
      <div>
        <Label className="text-xs">Delivery / Pickup ($)</Label>
        <Input
          type="number"
          className="h-8"
          value={source === "channel_letter_equipment" ? (form.delivery_pickup_cost || 0) : (form.pickup_delivery_cost || 0)}
          onChange={(e) => {
            const v = parseFloat(e.target.value) || 0;
            if (source === "channel_letter_equipment") set("delivery_pickup_cost", v);
            else set("pickup_delivery_cost", v);
          }}
        />
      </div>

      {/* 6. Fuel costs — for boom lifts / trucks / vehicles, regardless of ownership. */}
      {hasFuel && (
        <div className="rounded-lg border bg-amber-50/60 border-amber-200 p-3 space-y-3">
          <p className="text-xs font-semibold text-amber-900">Fuel Costs</p>
          <p className="text-[11px] text-amber-800">
            Driving fuel cost uses MPG × route miles × $/gal. Idle cost charges per hour the
            unit is running on-site (e.g. boom holding position).
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">MPG (driving)</Label>
              <Input type="number" className="h-8" value={form.mpg || 0} onChange={(e) => set("mpg", parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label className="text-xs">Fuel Type</Label>
              <Select value={form.fuel_type || "na"} onValueChange={(v) => set("fuel_type", v)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="na">N/A</SelectItem>
                  <SelectItem value="gasoline">Gasoline</SelectItem>
                  <SelectItem value="diesel">Diesel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Idle Cost ($/hr)</Label>
              <Input type="number" className="h-8" value={form.idle_running_cost_per_hour || 0} onChange={(e) => set("idle_running_cost_per_hour", parseFloat(e.target.value) || 0)} />
            </div>
          </div>
        </div>
      )}

      {/* Foundation-specific attachment-tree controls (only when supports_attachments) */}
      {source === "foundation_equipment" && (
        <>
          {kind === "equipment" && (
            <>
              <div className="space-y-2 pt-1">
                <Toggle label="Used for Pillar Excavation" checked={form.is_pillar_excavation} onChange={(v) => set("is_pillar_excavation", v)} />
                <Toggle label="Used for Spread Foot Excavation" checked={form.is_spread_foot_excavation} onChange={(v) => set("is_spread_foot_excavation", v)} />
                <Toggle label="Is Non-Excavation Equipment" checked={form.is_non_excavation_equipment} onChange={(v) => set("is_non_excavation_equipment", v)} />
              </div>
              <MultiSelectDropdown label="Compatible Attachments" options={allFoundationAttachments} selectedIds={form.compatible_attachment_ids || []} onChange={(v) => set("compatible_attachment_ids", v)} />
            </>
          )}
          {kind === "attachment" && (
            <>
              <div className="space-y-2 pt-1">
                <Toggle label="Is Miscellaneous Attachment" checked={form.is_miscellaneous_attachment} onChange={(v) => set("is_miscellaneous_attachment", v)} />
                <Toggle label="Allow user to select multiple instances" checked={form.allow_multiple} onChange={(v) => set("allow_multiple", v)} />
              </div>
              <MultiSelectDropdown label="Belongs to Equipment (reverse link)" options={allFoundationEquipment} selectedIds={linkedEquipmentIds} onChange={setLinkedEquipmentIds} />
              <MultiSelectDropdown label="Compatible Sub-Attachments" options={allFoundationSubAttachments} selectedIds={form.compatible_sub_attachment_ids || []} onChange={(v) => set("compatible_sub_attachment_ids", v)} />
            </>
          )}
          {kind === "sub_attachment" && (
            <>
              <Toggle label="Allow user to select multiple instances" checked={form.allow_multiple} onChange={(v) => set("allow_multiple", v)} />
              <MultiSelectDropdown label="Belongs to Attachments (reverse link)" options={allFoundationAttachments} selectedIds={linkedAttachmentIdsForSub} onChange={setLinkedAttachmentIdsForSub} />
            </>
          )}
        </>
      )}

      {/* Visibility toggles — only on top-level Equipment.
          Attachments/Sub-Attachments inherit from their parent Equipment. */}
      {kind === "equipment" && (
        <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-700">Show in which estimator(s)?</p>
          <Toggle label="Channel & Dimensional Letters" checked={form.show_in_channel_letters}  onChange={(v) => set("show_in_channel_letters", v)} />
          <Toggle label="Concrete | Masonry | Poles"    checked={form.show_in_foundation}        onChange={(v) => set("show_in_foundation", v)} />
          <Toggle label="Sign Maintenance"               checked={form.show_in_sign_maintenance} onChange={(v) => set("show_in_sign_maintenance", v)} />
        </div>
      )}

      <div>
        <Label className="text-xs">Notes</Label>
        <Input className="h-8" value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={!isValid}>Save</Button>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <Switch checked={!!checked} onCheckedChange={onChange} />
      <Label className="text-xs">{label}</Label>
    </div>
  );
}