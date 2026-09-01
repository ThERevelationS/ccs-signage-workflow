import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Copy, Trash2, Sliders } from "lucide-react";
import MaterialsList from "./MaterialsList";
import InstallTypePicker from "./InstallTypePicker";
import LetterSizePicker from "./LetterSizePicker";
import ConditionPicker from "./ConditionPicker";
import WallMaterialPicker from "./WallMaterialPicker";
import CostBreakdownBar from "./CostBreakdownBar";
import InstallHeightSlider from "./InstallHeightSlider";
import { TYPE_LABELS } from "./installCalculator";
import { WALL_MATERIAL_MAP } from "./wallMaterials";

const fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;

const TYPE_BADGE_COLOR = {
  flush_mount: "bg-blue-50 text-blue-700 border-blue-200",
  halo_lit: "bg-amber-50 text-amber-700 border-amber-200",
  raceway: "bg-purple-50 text-purple-700 border-purple-200",
  dimensional_lettering: "bg-teal-50 text-teal-700 border-teal-200",
};

export default function InstallLineItem({ item, index, inventory, settings = {}, onUpdate, onRemove, onDuplicate, compact = false }) {
  const [expanded, setExpanded] = useState(!compact);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const isRaceway = item.installation_type === "raceway";

  // Count active "advanced" toggles to show on the collapsed header
  const activeConditionsCount = [
    item.thick_hollow_walls, item.parapet, item.poor_electrical_access,
    item.escort_required, item.badging_checkin, item.after_hours_weekend,
    item.set_hours_installation, item.poor_site_access
  ].filter(Boolean).length;

  // Sync expanded state when parent toggles compact mode globally
  useEffect(() => {
    setExpanded(!compact);
  }, [compact]);

  const update = (patch) => onUpdate({ ...item, ...patch });

  const wallMat = WALL_MATERIAL_MAP[item.wall_material];

  const conditionBadges = [];
  if (wallMat) conditionBadges.push({ label: wallMat.label, color: "bg-purple-50 text-purple-700 border-purple-200" });
  if (item.thick_hollow_walls) conditionBadges.push({ label: "Thick Walls", color: "bg-orange-50 text-orange-700 border-orange-200" });
  if (item.parapet) conditionBadges.push({ label: "Parapet", color: "bg-red-50 text-red-700 border-red-200" });
  if (item.poor_electrical_access) conditionBadges.push({ label: "Poor Electrical", color: "bg-yellow-50 text-yellow-800 border-yellow-200" });
  if (item.escort_required) conditionBadges.push({ label: "Escort Req'd", color: "bg-sky-50 text-sky-700 border-sky-200" });
  if (item.badging_checkin) conditionBadges.push({ label: "Badging/Check-in", color: "bg-indigo-50 text-indigo-700 border-indigo-200" });
  if (item.after_hours_weekend) conditionBadges.push({ label: "After-Hours", color: "bg-violet-50 text-violet-700 border-violet-200" });
  if (item.set_hours_installation) conditionBadges.push({ label: "Set-Hours", color: "bg-teal-50 text-teal-700 border-teal-200" });
  if (item.poor_site_access) conditionBadges.push({ label: "Poor Site Access", color: "bg-rose-50 text-rose-700 border-rose-200" });

  return (
    <Card className="border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100 flex-wrap">
        <button onClick={() => setExpanded(e => !e)} className="text-slate-500 hover:text-slate-900">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <span className="text-xs font-semibold text-slate-500 w-6">#{index + 1}</span>
        <Input
          value={item.description || ""}
          onChange={(e) => update({ description: e.target.value })}
          placeholder={`${TYPE_LABELS[item.installation_type]} — describe this line...`}
          className="h-8 text-sm flex-1 bg-white min-w-[160px]"
          onClick={(e) => e.stopPropagation()}
        />
        <Badge variant="outline" className={`capitalize ${TYPE_BADGE_COLOR[item.installation_type]}`}>
          {TYPE_LABELS[item.installation_type]}
        </Badge>
        {conditionBadges.map((b, i) => (
          <Badge key={i} variant="outline" className={`text-[10px] ${b.color}`}>
            {b.label}
          </Badge>
        ))}
        <Badge variant="outline" className="bg-slate-100 text-slate-700 font-semibold tabular-nums">
          {fmt(item.item_total_cost)}
        </Badge>
        <Button variant="ghost" size="sm" onClick={onDuplicate} className="h-7 w-7 p-0 text-slate-500 hover:bg-slate-200" title="Duplicate">
          <Copy className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onRemove} className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" title="Remove">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Cost breakdown bar — always visible */}
      <div className="px-4 py-2 border-b border-slate-100 bg-white">
        <CostBreakdownBar
          labor={item.labor_cost || 0}
          materials={item.materials_cost || 0}
        />
      </div>

      {expanded && (
        <CardContent className="p-4 space-y-4">
          {/* Quick summary */}
          <div className="text-xs text-slate-500">
            {isRaceway
              ? `${item.qty_letters} letters · ${item.raceway_length_feet} ft raceway · ${item.installation_height_feet} ft high`
              : `${item.qty_letters} letters · ${item.installation_height_feet} ft high`
            }
          </div>

          {/* Interior / Exterior override — defaults to project setting */}
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-xs font-semibold text-slate-700">Installation Environment</Label>
              <span className="text-[10px] text-slate-400">(overrides project default for this line item)</span>
            </div>
            <div className="grid grid-cols-3 gap-1 max-w-md">
              {[
                { value: "", label: "Project Default" },
                { value: "exterior", label: "Exterior" },
                { value: "interior", label: "Interior" },
              ].map(opt => {
                const active = (item.install_environment || "") === opt.value;
                return (
                  <button
                    key={opt.value || "default"}
                    type="button"
                    onClick={() => update({ install_environment: opt.value || undefined })}
                    className={`text-xs px-2 py-1.5 rounded-md border transition-all ${
                      active
                        ? "border-purple-500 bg-purple-50 text-purple-900 font-semibold shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Qty Letters + Installation Height — at the very top */}
          <div className="grid md:grid-cols-2 gap-4 bg-slate-50 rounded-lg p-3 border border-slate-200">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Qty Letters</Label>
              <Input
                type="number"
                value={item.qty_letters}
                onFocus={(e) => e.target.select()}
                onChange={(e) => update({ qty_letters: parseFloat(e.target.value) || 0 })}
                className="h-9 mt-1.5"
              />
              {isRaceway && (
                <div className="mt-3">
                  <Label className="text-xs font-semibold text-slate-700">Raceway Length (ft)</Label>
                  <Input
                    type="number"
                    value={item.raceway_length_feet}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => update({ raceway_length_feet: parseFloat(e.target.value) || 0 })}
                    className="h-9 mt-1.5"
                  />
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700">Installation Height (ft)</Label>
              <div className="mt-1.5">
                <InstallHeightSlider
                  value={item.installation_height_feet}
                  onChange={(v) => update({ installation_height_feet: v })}
                />
              </div>
            </div>
          </div>

          {/* Install Type Picker */}
          <div>
            <Label className="text-xs text-slate-600">Installation Type</Label>
            <div className="mt-1.5">
              <InstallTypePicker value={item.installation_type} onChange={(v) => update({ installation_type: v })} />
            </div>
          </div>

          {/* Letter Size Picker (not for raceway) */}
          {!isRaceway && (
            <div>
              <Label className="text-xs text-slate-600">Letter Size</Label>
              <div className="mt-1.5">
                <LetterSizePicker value={item.letter_size} onChange={(v) => update({ letter_size: v })} />
              </div>
            </div>
          )}

          {/* Wall material + Site conditions */}
          <div className="space-y-3 border-t pt-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <Sliders className="w-3.5 h-3.5" />
              Wall & Site Conditions
              {activeConditionsCount > 0 && (
                <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] h-4 px-1.5">
                  {activeConditionsCount} active
                </Badge>
              )}
            </div>
            <div>
              <Label className="text-xs text-slate-600">Wall Material <span className="text-slate-400 font-normal">(what we're installing into)</span></Label>
              <div className="mt-1.5">
                <WallMaterialPicker value={item.wall_material || "eifs"} onChange={(v) => update({ wall_material: v })} />
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-600">Site Conditions <span className="text-slate-400 font-normal">(toggle if applicable)</span></Label>
              <div className="mt-1.5">
                <ConditionPicker
                  settings={settings}
                  values={{
                    thick_hollow_walls: item.thick_hollow_walls,
                    parapet: item.parapet,
                    parapet_electrical_routing: item.parapet_electrical_routing || "roof",
                    poor_electrical_access: item.poor_electrical_access,
                    poor_electrical_severity: item.poor_electrical_severity || 1,
                    escort_required: item.escort_required,
                    badging_checkin: item.badging_checkin,
                    after_hours_weekend: item.after_hours_weekend,
                    set_hours_installation: item.set_hours_installation,
                    poor_site_access: item.poor_site_access,
                    poor_site_access_severity: item.poor_site_access_severity || 1,
                  }}
                  onChange={(v) => update(v)}
                />
              </div>
            </div>
          </div>

          {/* Materials */}
          <div className="border-t pt-3">
            <MaterialsList item={item} inventory={inventory} onChange={(materials) => update({ materials })} />
          </div>

          {/* Per-item summary strip */}
          <div className="border-t pt-3 grid grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-50 rounded p-2">
              <div className="text-slate-500">Labor</div>
              <div className="font-semibold tabular-nums">{(item.labor_hours || 0).toFixed(2)} hrs · {fmt(item.labor_cost)}</div>
            </div>
            <div className="bg-slate-50 rounded p-2">
              <div className="text-slate-500">Materials</div>
              <div className="font-semibold tabular-nums">{fmt(item.materials_cost)}</div>
            </div>
            <div className="bg-purple-50 rounded p-2 border border-purple-100">
              <div className="text-purple-700">Item Total</div>
              <div className="font-bold text-purple-900 tabular-nums">{fmt(item.item_total_cost)}</div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}