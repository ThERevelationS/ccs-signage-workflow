// Polished tabbed dialog for editing a single vinyl record.
// Used by both the dedicated Vinyl Inventory page and the Master Inventory tab.
// Replaces the old expand-card editor with a focused, fullscreen-feel popup.
//
// UX:
//   - Header shows live name, color swatch, $/sqft, and a Save button.
//   - Tabs: Identification · Classification · Roll & Pricing · Application · Printing · Visibility · Notes
//   - All edits stay LOCAL until user clicks Save (avoids the noisy optimistic save loop).
//   - Cancel/X discards local edits and closes.

import React, { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Droplets, Save, X, Tag, Sliders, Sun, Printer, Eye, FileText } from "lucide-react";
import {
  VINYL_CATEGORIES, VINYL_USE_CASES, VINYL_FINISHES, VINYL_ADHESIVES,
  VINYL_FINISH_LABELS, VINYL_ADHESIVE_LABELS,
  APPLICATION_SURFACES, PRINTER_CHEMISTRIES, PRICING_MODES,
  vinylCostPerSqft,
} from "./vinylConstants";

const num = (v, fb = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fb;
};

export default function VinylEditDialog({
  open, vinyl, isAdmin = true, onSave, onClose,
}) {
  const [draft, setDraft] = useState(vinyl || {});
  const [tab, setTab] = useState("identification");
  const [saving, setSaving] = useState(false);

  // Reset draft whenever a new vinyl is opened
  useEffect(() => {
    if (open) {
      setDraft(vinyl || {});
      setTab("identification");
    }
  }, [open, vinyl?.id]);

  if (!open) return null;

  const patch = (p) => setDraft(prev => ({ ...prev, ...p }));
  const toggleArr = (field, value) => {
    const cur = Array.isArray(draft[field]) ? draft[field] : [];
    patch({ [field]: cur.includes(value) ? cur.filter(x => x !== value) : [...cur, value] });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const dollarPerSqft = vinylCostPerSqft(draft);
  const categoryLabel = VINYL_CATEGORIES.find(c => c.id === draft.vinyl_category)?.label || "—";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] p-0 overflow-hidden gap-0 flex flex-col">
        {/* Header — gradient + key metrics */}
        <DialogHeader className="bg-gradient-to-r from-slate-900 to-slate-700 text-white px-6 py-4 space-y-3">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-xl border-2 border-white/30 flex items-center justify-center shadow-lg flex-shrink-0"
              style={{ background: draft.color_hex || "#fafafa" }}
              title={draft.color_name}
            >
              <Droplets className="w-6 h-6" style={{ color: draft.color_hex && draft.color_hex !== "#ffffff" ? "white" : "#94a3b8" }} />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-bold tracking-tight truncate">
                {draft.vinyl_name || "New Vinyl"}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <Badge className="bg-white/15 text-white border-white/20 hover:bg-white/15">{categoryLabel}</Badge>
                {draft.manufacturer && <span className="text-xs text-slate-300">{draft.manufacturer}</span>}
                {draft.product_series && <span className="text-xs text-slate-300">· {draft.product_series}</span>}
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-4 text-right text-xs">
              <Stat label="Width"  value={`${num(draft.roll_width_inches)}"`} />
              <Stat label="Length" value={`${num(draft.roll_length_yards)} yd`} />
              <Stat label="$/sqft" value={`$${dollarPerSqft.toFixed(2)}`} highlight />
            </div>
            <Button size="icon" variant="ghost" onClick={onClose} className="text-white hover:bg-white/10 flex-shrink-0">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-2">
            <TabsList className="bg-transparent h-auto p-0 flex-wrap gap-1">
              <TabPill value="identification" icon={Tag}     label="Identification" />
              <TabPill value="classification" icon={Sliders}  label="Classification" />
              <TabPill value="pricing"        icon={FileText} label="Roll & Pricing" />
              <TabPill value="application"    icon={Sun}      label="Application" />
              <TabPill value="printing"       icon={Printer}  label="Printing" />
              <TabPill value="visibility"     icon={Eye}      label="Visibility" />
              <TabPill value="notes"          icon={FileText} label="Notes" />
            </TabsList>
          </div>

          <div className="overflow-y-auto flex-1 px-6 py-5 bg-white">
            {/* IDENTIFICATION */}
            <TabsContent value="identification" className="mt-0 space-y-6">
              <Field label="Name" required>
                <Input value={draft.vinyl_name || ""} disabled={!isAdmin}
                       onChange={(e) => patch({ vinyl_name: e.target.value })}
                       placeholder='e.g. 3M IJ180Cv3 — White 48"' className="h-10 text-base font-medium" />
              </Field>
              <SectionGrid cols={4}>
                <Field label="Manufacturer">
                  <Input value={draft.manufacturer || ""} disabled={!isAdmin} onChange={(e) => patch({ manufacturer: e.target.value })} className="h-9" />
                </Field>
                <Field label="Product Series">
                  <Input value={draft.product_series || ""} disabled={!isAdmin} onChange={(e) => patch({ product_series: e.target.value })} className="h-9" />
                </Field>
                <Field label="Color Name">
                  <Input value={draft.color_name || ""} disabled={!isAdmin} onChange={(e) => patch({ color_name: e.target.value })} className="h-9" />
                </Field>
                <Field label="Color Hex">
                  <div className="flex gap-1.5">
                    <input type="color" value={draft.color_hex || "#ffffff"} disabled={!isAdmin}
                           onChange={(e) => patch({ color_hex: e.target.value })}
                           className="w-9 h-9 rounded border border-slate-200 bg-white cursor-pointer disabled:cursor-not-allowed" />
                    <Input value={draft.color_hex || ""} disabled={!isAdmin}
                           onChange={(e) => patch({ color_hex: e.target.value })}
                           placeholder="#ffffff" className="h-9 text-sm tabular-nums" />
                  </div>
                </Field>
              </SectionGrid>
              <SectionGrid cols={3}>
                <Field label="Supplier">
                  <Input value={draft.supplier || ""} disabled={!isAdmin} onChange={(e) => patch({ supplier: e.target.value })} className="h-9" />
                </Field>
                <Field label="Supplier SKU">
                  <Input value={draft.supplier_sku || ""} disabled={!isAdmin} onChange={(e) => patch({ supplier_sku: e.target.value })} className="h-9" />
                </Field>
                <Field label="Image URL">
                  <Input value={draft.image_url || ""} disabled={!isAdmin} onChange={(e) => patch({ image_url: e.target.value })} className="h-9" placeholder="https://…" />
                </Field>
              </SectionGrid>
            </TabsContent>

            {/* CLASSIFICATION */}
            <TabsContent value="classification" className="mt-0 space-y-4">
              <SectionGrid cols={2}>
                <SelectField label="Category" value={draft.vinyl_category} disabled={!isAdmin}
                  options={VINYL_CATEGORIES} onChange={(v) => patch({ vinyl_category: v })} />
                <SelectField label="Primary Use Case" value={draft.vinyl_use_case} disabled={!isAdmin}
                  options={VINYL_USE_CASES} onChange={(v) => patch({ vinyl_use_case: v })} />
                <SelectField label="Finish" value={draft.finish || "gloss"} disabled={!isAdmin}
                  options={VINYL_FINISHES.map(f => ({ id: f, label: VINYL_FINISH_LABELS[f] || f }))}
                  onChange={(v) => patch({ finish: v })} />
                <SelectField label="Adhesive Type" value={draft.adhesive_type || "permanent"} disabled={!isAdmin}
                  options={VINYL_ADHESIVES.map(a => ({ id: a, label: VINYL_ADHESIVE_LABELS[a] || a }))}
                  onChange={(v) => patch({ adhesive_type: v })} />
              </SectionGrid>
            </TabsContent>

            {/* PRICING */}
            <TabsContent value="pricing" className="mt-0 space-y-5">
              <SectionGrid cols={4}>
                <NumberField label="Roll Width (in)" value={draft.roll_width_inches} disabled={!isAdmin} onChange={(v) => patch({ roll_width_inches: v })} />
                <NumberField label="Roll Length (yd)" value={draft.roll_length_yards} disabled={!isAdmin} onChange={(v) => patch({ roll_length_yards: v })} />
                <NumberField label="Thickness (mil)" step="0.1" value={draft.thickness_mil} disabled={!isAdmin} onChange={(v) => patch({ thickness_mil: v })} />
                <SelectField label="Pricing Mode" value={draft.pricing_mode || "per_roll"} disabled={!isAdmin}
                  options={PRICING_MODES} onChange={(v) => patch({ pricing_mode: v })} />
              </SectionGrid>
              <SectionGrid cols={3}>
                <NumberField label="Cost per Roll ($)" step="0.01" value={draft.cost_per_roll}
                  disabled={!isAdmin || draft.pricing_mode !== "per_roll"}
                  onChange={(v) => patch({ cost_per_roll: v })} />
                <NumberField label="Cost per SqFt ($)" step="0.01" value={draft.cost_per_sqft}
                  disabled={!isAdmin || draft.pricing_mode !== "per_sqft"}
                  onChange={(v) => patch({ cost_per_sqft: v })} />
                <NumberField label="Cost per Linear Ft ($)" step="0.01" value={draft.cost_per_linear_foot}
                  disabled={!isAdmin || draft.pricing_mode !== "per_linear_foot"}
                  onChange={(v) => patch({ cost_per_linear_foot: v })} />
              </SectionGrid>
              <SectionGrid cols={2}>
                <NumberField label="Waste %" value={draft.waste_factor_percent} disabled={!isAdmin} onChange={(v) => patch({ waste_factor_percent: v })} />
              </SectionGrid>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex items-center justify-between">
                <div className="text-xs text-emerald-900">
                  <div className="font-medium">Effective Cost</div>
                  <div className="text-emerald-700">Auto-derived from pricing mode + roll dimensions</div>
                </div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">${dollarPerSqft.toFixed(2)}<span className="text-xs font-normal text-emerald-600">/sqft</span></div>
              </div>
            </TabsContent>

            {/* APPLICATION */}
            <TabsContent value="application" className="mt-0 space-y-5">
              <SectionGrid cols={3}>
                <SelectField label="Application Method" value={draft.application_method || "either"} disabled={!isAdmin}
                  options={[{id:"dry",label:"Dry"},{id:"wet",label:"Wet"},{id:"either",label:"Either"}]}
                  onChange={(v) => patch({ application_method: v })} />
                <SelectField label="Indoor / Outdoor" value={draft.indoor_outdoor || "both"} disabled={!isAdmin}
                  options={[{id:"indoor_only",label:"Indoor Only"},{id:"outdoor",label:"Outdoor"},{id:"both",label:"Both"}]}
                  onChange={(v) => patch({ indoor_outdoor: v })} />
                <NumberField label="Outdoor Life (yrs)" value={draft.expected_life_years_outdoor} disabled={!isAdmin} onChange={(v) => patch({ expected_life_years_outdoor: v })} />
              </SectionGrid>
              <SectionGrid cols={4}>
                <NumberField label="Min Letter Height (in)" step="0.25" value={draft.min_recommended_letter_height_inches} disabled={!isAdmin} onChange={(v) => patch({ min_recommended_letter_height_inches: v })} />
                <ToggleField label="Removable" value={!!draft.removable} disabled={!isAdmin} onChange={(v) => patch({ removable: v })} />
                <ToggleField label="Needs Lamination" value={!!draft.requires_lamination} disabled={!isAdmin} onChange={(v) => patch({ requires_lamination: v })} />
                <ToggleField label="Needs Transfer Tape" value={draft.requires_transfer_tape !== false} disabled={!isAdmin} onChange={(v) => patch({ requires_transfer_tape: v })} />
              </SectionGrid>

              <Field label="Application Surfaces (multi-select)">
                <ChipGroup
                  options={APPLICATION_SURFACES}
                  selected={draft.application_surface || []}
                  onToggle={(v) => toggleArr("application_surface", v)}
                  disabled={!isAdmin}
                  activeColor="blue"
                />
              </Field>
            </TabsContent>

            {/* PRINTING */}
            <TabsContent value="printing" className="mt-0 space-y-5">
              <ToggleField label="Printable Media" value={!!draft.supports_printing} disabled={!isAdmin}
                onChange={(v) => patch({ supports_printing: v })} />

              {draft.supports_printing ? (
                <Field label="Printer Compatibility">
                  <ChipGroup
                    options={PRINTER_CHEMISTRIES}
                    selected={draft.printer_compatibility || []}
                    onToggle={(v) => toggleArr("printer_compatibility", v)}
                    disabled={!isAdmin}
                    activeColor="purple"
                  />
                </Field>
              ) : (
                <div className="text-sm text-slate-400 italic bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                  Toggle "Printable Media" on to choose compatible printer chemistries.
                </div>
              )}
            </TabsContent>

            {/* VISIBILITY */}
            <TabsContent value="visibility" className="mt-0 space-y-3">
              <SectionGrid cols={2}>
                <ToggleField label="Show in Channel & Dim. Letters"
                  value={draft.show_in_channel_letters !== false} disabled={!isAdmin}
                  onChange={(v) => patch({ show_in_channel_letters: v })} />
                <ToggleField label="Show in Sign Maintenance"
                  value={draft.show_in_sign_maintenance !== false} disabled={!isAdmin}
                  onChange={(v) => patch({ show_in_sign_maintenance: v })} />
                <ToggleField label="Show in Vinyl Estimator"
                  value={draft.show_in_vinyl_estimator !== false} disabled={!isAdmin}
                  onChange={(v) => patch({ show_in_vinyl_estimator: v })} />
                <ToggleField label="Is Laminate / Overlam"
                  value={!!draft.is_laminate} disabled={!isAdmin}
                  onChange={(v) => patch({ is_laminate: v })} />
                <ToggleField label="Master-only (hide from modules)"
                  value={!!draft.show_in_master_only} disabled={!isAdmin}
                  onChange={(v) => patch({ show_in_master_only: v })} />
                <ToggleField label="Active"
                  value={draft.is_active !== false} disabled={!isAdmin}
                  onChange={(v) => patch({ is_active: v })} />
              </SectionGrid>
            </TabsContent>

            {/* NOTES */}
            <TabsContent value="notes" className="mt-0">
              <Field label="Notes">
                <Textarea
                  value={draft.notes || ""}
                  disabled={!isAdmin}
                  onChange={(e) => patch({ notes: e.target.value })}
                  className="min-h-40 text-sm"
                  placeholder="Color matching notes, edge sealing tips, ordering quirks, etc."
                />
              </Field>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer — Save / Cancel */}
        <DialogFooter className="border-t border-slate-200 bg-slate-50 px-6 py-3 flex-row justify-between sm:justify-between">
          <div className="text-xs text-slate-500">
            {!isAdmin ? "View only — only admins can edit." : "Changes are saved when you click Save."}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            {isAdmin && (
              <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Save className="w-4 h-4 mr-1.5" />
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- presentational helpers ----------

function TabPill({ value, icon: Icon, label }) {
  return (
    <TabsTrigger
      value={value}
      className="data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm
                 data-[state=inactive]:text-slate-500 data-[state=inactive]:hover:text-slate-700
                 gap-1.5 text-sm h-9 px-3 rounded-md"
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </TabsTrigger>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-slate-300">{label}</div>
      <div className={`font-semibold tabular-nums ${highlight ? "text-emerald-300" : "text-white"}`}>{value}</div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wider text-slate-600 font-medium">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function SectionGrid({ cols = 4, children }) {
  const gridClass = cols === 2 ? "md:grid-cols-2"
                  : cols === 3 ? "md:grid-cols-3"
                  : "md:grid-cols-4";
  return <div className={`grid grid-cols-1 ${gridClass} gap-4`}>{children}</div>;
}

function NumberField({ label, value, disabled, onChange, step = "1" }) {
  return (
    <Field label={label}>
      <Input type="number" step={step}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? 0 : parseFloat(e.target.value))}
        className="h-9 text-sm tabular-nums" />
    </Field>
  );
}

function SelectField({ label, value, disabled, onChange, options }) {
  return (
    <Field label={label}>
      <Select value={value || ""} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

function ToggleField({ label, value, disabled, onChange }) {
  return (
    <div className="flex items-center justify-between gap-2 bg-white rounded-md border border-slate-200 px-3 h-9">
      <span className="text-xs text-slate-700 truncate">{label}</span>
      <Switch checked={!!value} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function ChipGroup({ options, selected = [], onToggle, disabled, activeColor = "blue" }) {
  const onClass = activeColor === "purple"
    ? "bg-purple-600 border-purple-600 text-white"
    : "bg-blue-600 border-blue-600 text-white";
  const hoverClass = activeColor === "purple" ? "hover:border-purple-300" : "hover:border-blue-300";
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(s => {
        const on = selected.includes(s);
        return (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(s)}
            className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
              on ? onClass : `bg-white border-slate-200 text-slate-700 ${hoverClass}`
            } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {s.replace(/_/g, " ")}
          </button>
        );
      })}
    </div>
  );
}