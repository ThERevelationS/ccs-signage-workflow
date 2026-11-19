// Cutting-extras panel — only shown when "apply_cut" is on.
// Has: Transfer Tape picker, Weeding Difficulty (drives min/part labor),
// and Application/Install minutes per part.

import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Scissors } from "lucide-react";
import {
  WEEDING_DIFFICULTY, WEEDING_DIFFICULTY_LABELS, WEEDING_LABOR_MINUTES_PER_PART,
} from "@/components/vinylInventory/vinylConstants";

export default function VinylCuttingExtrasCard({
  vinyls,
  transferTapeId,
  applyTransferTape,
  weedingDifficulty,
  weedingMinutesPerPartOverride,
  installMinutesPerPart,
  partsPlaced = 0,
  onChange,
}) {
  const ttOptions = useMemo(
    () => vinyls.filter(
      (v) => v.is_active !== false
        && v.show_in_vinyl_estimator !== false
        && (v.vinyl_category === "transfer_tape" || v.vinyl_category === "application_tape")
    ),
    [vinyls]
  );

  const wd = weedingDifficulty || "moderate";
  const weedMinDefault = WEEDING_LABOR_MINUTES_PER_PART[wd] ?? 0.6;
  const weedMin = Number.isFinite(parseFloat(weedingMinutesPerPartOverride))
    ? parseFloat(weedingMinutesPerPartOverride) : weedMinDefault;
  const installMin = Math.max(0, parseFloat(installMinutesPerPart) || 0);
  const totalWeedMin = (weedMin * partsPlaced) || 0;
  const totalInstallMin = (installMin * partsPlaced) || 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Scissors className="w-4 h-4 text-rose-600" /> Cutting Extras
        </CardTitle>
      </CardHeader>
      <CardContent className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Transfer Tape</Label>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">Apply</span>
              <Switch checked={!!applyTransferTape}
                onCheckedChange={(v) => onChange({ applyTransferTape: !!v })} />
            </div>
          </div>
          <Select
            value={transferTapeId || "__none__"}
            onValueChange={(id) => onChange({ transferTapeId: id === "__none__" ? "" : id })}
            disabled={!applyTransferTape}
          >
            <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Choose transfer tape…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {ttOptions.map(v => (
                <SelectItem key={v.id} value={v.id}>
                  {v.vinyl_name}{v.roll_width_inches ? ` · ${v.roll_width_inches}″` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {applyTransferTape && ttOptions.length === 0 && (
            <p className="text-[11px] text-amber-600 mt-1">
              No transfer tape rolls yet. Add one in Vinyl Inventory with category "Transfer / Application Tape".
            </p>
          )}
        </div>

        <div>
          <Label className="text-xs">Weeding Difficulty</Label>
          <Select value={wd}
            onValueChange={(v) => onChange({ weedingDifficulty: v, weedingMinutesPerPartOverride: "" })}>
            <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WEEDING_DIFFICULTY.map(w => (
                <SelectItem key={w} value={w}>
                  {WEEDING_DIFFICULTY_LABELS[w] || w} · {WEEDING_LABOR_MINUTES_PER_PART[w]} min/part
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-slate-500">Override (min/part)</Label>
              <Input
                type="number" step="0.1"
                placeholder={String(weedMinDefault)}
                value={weedingMinutesPerPartOverride ?? ""}
                onChange={(e) => onChange({ weedingMinutesPerPartOverride: e.target.value })}
                className="h-8 text-xs tabular-nums"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-slate-500">Weeding labor</Label>
              <div className="h-8 flex items-center text-xs tabular-nums text-slate-700">
                {totalWeedMin.toFixed(1)} min · {partsPlaced} parts
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
          <div>
            <Label className="text-xs">Application / Install Labor</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number" step="0.1"
                value={installMinutesPerPart ?? ""}
                placeholder="0"
                onChange={(e) => onChange({ installMinutesPerPart: e.target.value })}
                className="h-8 text-xs tabular-nums w-24"
              />
              <span className="text-xs text-slate-500">min / part on-site</span>
            </div>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-slate-500">Total install labor</Label>
            <div className="h-8 flex items-center text-xs tabular-nums text-slate-700">
              {totalInstallMin.toFixed(1)} min · {partsPlaced} parts
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}