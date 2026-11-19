// Vinyl + Laminate picker.
// Upgrades:
//   #25 Use-case filter (auto-recommend cast for wraps, etc.)
//   #27 Lifetime / indoor-only warning (bundled with #25 since it's cheap)

import React, { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Layers, AlertTriangle, ChevronDown } from "lucide-react";
import { computeLifetimeWarning } from "./vinylCostHelpers";
import VinylSearchPickerDialog from "./VinylSearchPickerDialog";

// Map preset key → preferred vinyl categories (used to filter the base vinyl dropdown).
const PRESET_CATEGORY_HINT = {
  wrap: ["cast", "wrap_film"],
  print_only: ["calendered", "intermediate", "print_media"],
  print_and_cut: ["calendered", "intermediate", "cast", "print_media"],
  cut_only: ["calendered", "intermediate", "cast", "reflective", "translucent", "fluorescent", "metallic"],
  laminated_decal: ["cast", "calendered", "intermediate"],
};

export default function VinylMaterialPicker({
  vinyls, vinylId, laminateId, applyLaminate, onChange,
  presetKey,          // current workflow preset, used for #25 recommendations
  installEnvironment, // "interior" | "exterior" → drives lifetime warning
  recommendOnly = false,
}) {
  const recommendedCategories = presetKey ? PRESET_CATEGORY_HINT[presetKey] : null;

  const baseOptions = useMemo(() => {
    const base = vinyls.filter(v => v.is_active !== false && !v.is_laminate && v.show_in_vinyl_estimator !== false);
    if (!recommendOnly || !recommendedCategories) return base;
    return base.filter(v => recommendedCategories.includes(v.vinyl_category));
  }, [vinyls, recommendOnly, recommendedCategories]);

  const lamOptions = useMemo(
    () => vinyls.filter(v => v.is_active !== false && v.is_laminate && v.show_in_vinyl_estimator !== false),
    [vinyls]
  );
  const selectedVinyl = vinyls.find(v => v.id === vinylId) || null;
  const selectedLaminate = vinyls.find(v => v.id === laminateId) || null;
  const lifetimeWarning = computeLifetimeWarning(selectedVinyl, installEnvironment);

  const [vinylPickerOpen, setVinylPickerOpen] = useState(false);
  const [lamPickerOpen, setLamPickerOpen] = useState(false);

  const handleVinylChange = (newId) => {
    const v = vinyls.find(x => x.id === newId);
    const nextLam = v?.default_laminate_id || laminateId || "";
    const nextApply = !!(v?.requires_lamination || (applyLaminate && nextLam));
    onChange({ vinylId: newId, laminateId: nextLam, applyLaminate: nextApply });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600" /> Vinyl & Laminate
          </CardTitle>
          {recommendedCategories && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-slate-500">Recommend only</span>
              <Switch checked={recommendOnly} onCheckedChange={(v) => onChange({ vinylId, laminateId, applyLaminate, recommendOnly: !!v })} />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid md:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Base Vinyl</Label>
          <button
            type="button"
            onClick={() => setVinylPickerOpen(true)}
            className="h-9 mt-1 w-full flex items-center justify-between rounded-md border border-input bg-transparent px-3 text-sm shadow-sm hover:bg-slate-50 transition-colors"
          >
            <span className={`truncate ${selectedVinyl ? "text-slate-900" : "text-muted-foreground"}`}>
              {selectedVinyl
                ? `${selectedVinyl.vinyl_name}${selectedVinyl.roll_width_inches ? ` · ${selectedVinyl.roll_width_inches}″` : ""}`
                : "Choose vinyl…"}
            </span>
            <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0 ml-2" />
          </button>
          <VinylSearchPickerDialog
            open={vinylPickerOpen}
            onOpenChange={setVinylPickerOpen}
            options={baseOptions}
            selectedId={vinylId || ""}
            onSelect={handleVinylChange}
            title="Select Base Vinyl"
          />
          {selectedVinyl && (
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedVinyl.vinyl_category && <Badge variant="outline" className="text-[10px]">{selectedVinyl.vinyl_category}</Badge>}
              {selectedVinyl.finish && <Badge variant="outline" className="text-[10px]">{selectedVinyl.finish}</Badge>}
              {selectedVinyl.expected_life_years_outdoor && (
                <Badge variant="outline" className="text-[10px]">{selectedVinyl.expected_life_years_outdoor}y outdoor</Badge>
              )}
              {selectedVinyl.requires_lamination && <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700">recommends laminate</Badge>}
            </div>
          )}
          {/* Lifetime warning — Feature #27 */}
          {lifetimeWarning && (
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{lifetimeWarning.message}</span>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Laminate</Label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">Apply</span>
              <Switch checked={!!applyLaminate} onCheckedChange={(v) => onChange({ vinylId, laminateId, applyLaminate: !!v })} />
            </div>
          </div>
          <button
            type="button"
            disabled={!applyLaminate}
            onClick={() => setLamPickerOpen(true)}
            className="h-9 mt-1 w-full flex items-center justify-between rounded-md border border-input bg-transparent px-3 text-sm shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <span className={`truncate ${selectedLaminate ? "text-slate-900" : "text-muted-foreground"}`}>
              {selectedLaminate ? selectedLaminate.vinyl_name : "None"}
            </span>
            <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0 ml-2" />
          </button>
          <VinylSearchPickerDialog
            open={lamPickerOpen}
            onOpenChange={setLamPickerOpen}
            options={lamOptions}
            selectedId={laminateId || ""}
            onSelect={(id) => onChange({ vinylId, laminateId: id, applyLaminate: !!applyLaminate })}
            title="Select Laminate"
            allowNone
          />
          {applyLaminate && lamOptions.length === 0 && (
            <p className="text-[11px] text-amber-600 mt-1">No laminate rolls tagged yet. Tag one in Master Inventory → Vinyl.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}