// One vinyl workflow card.
// Upgrades:
//   #1  Manual part order toggle (override NFDH height-sort)
//   #5  Workflow preset bar
//   #6  Stock usage warning
//   #14 Color tag in header
//   #16 Apply / save template button
//   #19 Per-part cost passed into the parts table
//   #20 + #21 Yield/margin badge in header
//   #22 Vinyl comparison panel
//   #33 Tab-level "issue" dot via _hasIssues

import React, { useState, useMemo, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sliders } from "lucide-react";

import VinylMaterialPicker from "./VinylMaterialPicker";
import VinylMachinePicker from "./VinylMachinePicker";
import VinylPartsTable from "./VinylPartsTable";
import VinylRollVisualizer from "./VinylRollVisualizer";
import VinylPresetBar from "./VinylPresetBar";
import VinylStockWarning from "./VinylStockWarning";
import VinylAlternativeCompare from "./VinylAlternativeCompare";
import VinylWorkflowTemplatesDialog from "./VinylWorkflowTemplatesDialog";
import VinylWorkflowCardHeader, { COLOR_SWATCHES } from "./VinylWorkflowCardHeader";
import VinylCuttingExtrasCard from "./VinylCuttingExtrasCard";
import VinylWorkflowPersonnel from "./VinylWorkflowPersonnel";
import VinylRollWidthRecommender from "./VinylRollWidthRecommender";
import { calculateVinylProject } from "./vinylNestingCalculator";
import { applyPresetToWorkflow } from "./vinylWorkflowPresets";
import {
  computePerPartCosts, computeWorkflowMetrics, computeStockUsage,
} from "./vinylCostHelpers";
import { loadVinylLaborRoles, MACHINE_AUTO_ROLES, suggestedHoursForRole } from "./vinylLaborRoles";

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export default function VinylWorkflowCard({
  workflow, index, vinyls, machines,
  onChange, onRemove, onDuplicate, onMovePartToWorkflow,
  installEnvironment = "exterior",
  defaultOpen = true,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templatesMode, setTemplatesMode] = useState("apply");
  const [recommendOnly, setRecommendOnly] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [roleOptions, setRoleOptions] = useState([]);

  // Respond to parent expand/collapse-all toggle
  useEffect(() => { setOpen(defaultOpen); }, [defaultOpen]);

  // Load vinyl labor roles (rates) from the Labor Inventory once.
  useEffect(() => { loadVinylLaborRoles().then(setRoleOptions); }, []);

  const set = (patch) => onChange({ ...workflow, ...patch });

  const printer   = useMemo(() => machines.find(m => m.id === workflow.printer_id)   || null, [machines, workflow.printer_id]);
  const cutter    = useMemo(() => machines.find(m => m.id === workflow.cutter_id)    || null, [machines, workflow.cutter_id]);
  const laminator = useMemo(() => machines.find(m => m.id === workflow.laminator_id) || null, [machines, workflow.laminator_id]);
  const vinyl        = useMemo(() => vinyls.find(v => v.id === workflow.vinyl_id)         || null, [vinyls, workflow.vinyl_id]);
  const laminate     = useMemo(() => vinyls.find(v => v.id === workflow.laminate_id)      || null, [vinyls, workflow.laminate_id]);
  const transferTape = useMemo(() => vinyls.find(v => v.id === workflow.transfer_tape_id) || null, [vinyls, workflow.transfer_tape_id]);

  const operatorRate = printer?.operator_hourly_rate ?? cutter?.operator_hourly_rate ?? laminator?.operator_hourly_rate ?? 45;

  const calc = useMemo(() => calculateVinylProject({
    items: workflow.items || [],
    printer, cutter, laminator,
    vinyl, laminate, transferTape,
    operatorHourlyRate: operatorRate,
    applyPrint: !!workflow.apply_print,
    applyCut: !!workflow.apply_cut,
    applyLaminate: !!workflow.apply_laminate,
    applyTransferTape: !!workflow.apply_transfer_tape,
    overrideGutterH: workflow.gutter_h_override === "" || workflow.gutter_h_override == null ? undefined : num(workflow.gutter_h_override),
    overrideGutterV: workflow.gutter_v_override === "" || workflow.gutter_v_override == null ? undefined : num(workflow.gutter_v_override),
    printQuality: workflow.print_quality || printer?.default_print_quality || "high_quality",
    weedingDifficulty: workflow.weeding_difficulty || "moderate",
    weedingMinutesPerPartOverride: workflow.weeding_minutes_per_part_override,
    installMinutesPerPart: workflow.install_minutes_per_part,
    personnel: workflow.personnel || [],
    spoilageBufferPercent: num(workflow.spoilage_buffer_percent),
    setupFeeFloor: num(workflow.setup_fee_floor),
  }), [
    workflow.items, workflow.apply_print, workflow.apply_cut, workflow.apply_laminate,
    workflow.apply_transfer_tape, workflow.transfer_tape_id,
    workflow.gutter_h_override, workflow.gutter_v_override,
    workflow.print_quality, workflow.weeding_difficulty,
    workflow.weeding_minutes_per_part_override, workflow.install_minutes_per_part,
    workflow.personnel, workflow.spoilage_buffer_percent, workflow.setup_fee_floor,
    printer, cutter, laminator, vinyl, laminate, transferTape, operatorRate,
  ]);

  // Drag-and-drop: a per-item manual x override that the calculator doesn't know about
  // but we apply on the placed shelves directly for visual rendering. Stored in a
  // workflow.items[].manual_layout = { x } map.
  const calcWithManualPositions = useMemo(() => {
    if (!workflow.manual_positions) return calc;
    const shelves = calc.shelves.map((sh, sIdx) => ({
      ...sh,
      items: sh.items.map((it, iIdx) => {
        const key = `${sIdx}-${iIdx}`;
        const override = workflow.manual_positions[key];
        return override !== undefined ? { ...it, x: override } : it;
      }),
    }));
    return { ...calc, shelves };
  }, [calc, workflow.manual_positions]);

  const handleItemMove = ({ shelfIdx, itemIdx, x }) => {
    const key = `${shelfIdx}-${itemIdx}`;
    set({
      manual_positions: { ...(workflow.manual_positions || {}), [key]: x },
    });
  };

  // Per-part cost rollup — Feature #19
  const perPartCosts = useMemo(() => computePerPartCosts(calc, workflow.items || []), [calc, workflow.items]);
  // Yield / cost metrics — Feature #20, #21
  const metrics    = useMemo(() => computeWorkflowMetrics(calc), [calc]);
  // Stock usage — Feature #6, #37
  const stockUsage = useMemo(() => computeStockUsage(calc, vinyl), [calc, vinyl]);

  // Surface calc back up so the project rollup can sum across workflows.
  useEffect(() => {
    const hasIssues = calc.partsUnplaced > 0 || !workflow.vinyl_id;
    if (workflow._calc?.totalCost !== calc.totalCost
     || workflow._calc?.materialCost !== calc.materialCost
     || workflow._hasIssues !== hasIssues) {
      onChange({ ...workflow, _calc: calc, _hasIssues: hasIssues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calc.totalCost, calc.materialCost, calc.machineCost, calc.laborCost, calc.partsUnplaced, workflow.vinyl_id]);

  // Auto-select operator roles when machines are applied. Adds any missing role
  // for the active machines and auto-fills its hours from the calculator. Runs
  // after roles are loaded and recomputes hours as the calc changes.
  useEffect(() => {
    if (roleOptions.length === 0) return;
    const wanted = new Set();
    if (workflow.apply_print && workflow.printer_id)      MACHINE_AUTO_ROLES.printer.forEach(r => wanted.add(r));
    if (workflow.apply_cut && workflow.cutter_id)         MACHINE_AUTO_ROLES.cutter.forEach(r => wanted.add(r));
    if (workflow.apply_laminate && workflow.laminator_id) MACHINE_AUTO_ROLES.laminator.forEach(r => wanted.add(r));
    if (wanted.size === 0) return;

    const current = workflow.personnel || [];
    let changed = false;
    const next = [...current];
    wanted.forEach((role) => {
      const opt = roleOptions.find(r => r.role === role);
      if (!opt) return;
      const existing = next.find(p => p.role === role);
      const hrs = suggestedHoursForRole(role, calc);
      if (!existing) {
        next.push({ role, hourly_rate: opt.hourly_rate, hours: hrs, total_cost: opt.hourly_rate * hrs, _auto: true });
        changed = true;
      } else if (existing._auto && Math.abs(num(existing.hours) - hrs) > 0.001) {
        // Keep auto-added rows in sync with the calculator until the user edits.
        existing.hours = hrs;
        existing.total_cost = num(existing.hourly_rate) * hrs;
        changed = true;
      }
    });
    if (changed) set({ personnel: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    roleOptions, workflow.apply_print, workflow.apply_cut, workflow.apply_laminate,
    workflow.printer_id, workflow.cutter_id, workflow.laminator_id,
    calc.printMinutes, calc.cutMinutes, calc.laminateMinutes, calc.weedingMinutes, calc.installMinutes,
  ]);

  const colorTag = workflow.color_tag || COLOR_SWATCHES[index % COLOR_SWATCHES.length];

  return (
    <Card
      className="bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
      style={{ borderLeft: `4px solid ${colorTag}` }}
    >
      <VinylWorkflowCardHeader
        workflow={workflow}
        index={index}
        vinyl={vinyl}
        calc={calc}
        metrics={metrics}
        colorTag={colorTag}
        open={open}
        onToggleOpen={() => setOpen(!open)}
        onChange={set}
        onSaveTemplate={() => { setTemplatesMode("save"); setTemplatesOpen(true); }}
        onDuplicate={onDuplicate}
        onRemove={onRemove}
      />

      {open && (
        <CardContent className="space-y-4 pt-2 border-t border-slate-100">
          {/* Preset bar — Feature #5 */}
          <VinylPresetBar
            activePresetKey={workflow.preset_key}
            onApply={(preset) => set({ ...applyPresetToWorkflow(preset) })}
          />

          <VinylMaterialPicker
            vinyls={vinyls}
            vinylId={workflow.vinyl_id}
            laminateId={workflow.laminate_id}
            applyLaminate={!!workflow.apply_laminate}
            presetKey={workflow.preset_key}
            installEnvironment={installEnvironment}
            recommendOnly={recommendOnly}
            onChange={({ vinylId, laminateId, applyLaminate, recommendOnly: ro }) => {
              if (ro !== undefined) setRecommendOnly(ro);
              if (vinylId !== undefined || laminateId !== undefined || applyLaminate !== undefined) {
                set({
                  vinyl_id: vinylId,
                  laminate_id: laminateId || "",
                  apply_laminate: !!applyLaminate,
                });
              }
            }}
          />

          {/* Stock check — Feature #6 & #37 */}
          {stockUsage && <VinylStockWarning stockUsage={stockUsage} vinyl={vinyl} />}

          {/* Compare to other vinyls — Feature #22 */}
          {vinyl && calc.vinylCost > 0 && (
            <div>
              <button onClick={() => setShowCompare(s => !s)} className="text-[11px] underline text-blue-600">
                {showCompare ? "Hide" : "Show"} cost comparison vs other vinyls
              </button>
              {showCompare && (
                <div className="mt-2">
                  <VinylAlternativeCompare calc={calc} currentVinyl={vinyl} vinyls={vinyls} />
                </div>
              )}
            </div>
          )}

          {/* Roll-width recommender (#10) */}
          <VinylRollWidthRecommender
            workflow={workflow}
            vinyl={vinyl}
            vinyls={vinyls}
            printer={printer}
            cutter={cutter}
            laminator={laminator}
            laminate={laminate}
            transferTape={transferTape}
            operatorRate={operatorRate}
            currentCalc={calc}
            onPick={(id) => set({ vinyl_id: id })}
          />

          <VinylMachinePicker
            machines={machines}
            value={{
              printer_id:   workflow.printer_id,
              cutter_id:    workflow.cutter_id,
              laminator_id: workflow.laminator_id,
              applyPrint:    !!workflow.apply_print,
              applyCut:      !!workflow.apply_cut,
              applyLaminate: !!workflow.apply_laminate,
              printQuality:  workflow.print_quality || printer?.default_print_quality || "high_quality",
            }}
            onChange={(v) => {
              const patch = {};
              if (v.printer_id   !== undefined) patch.printer_id   = v.printer_id;
              if (v.cutter_id    !== undefined) patch.cutter_id    = v.cutter_id;
              if (v.laminator_id !== undefined) patch.laminator_id = v.laminator_id;
              if (v.applyPrint    !== undefined) patch.apply_print    = v.applyPrint;
              if (v.applyCut      !== undefined) patch.apply_cut      = v.applyCut;
              if (v.applyLaminate !== undefined) patch.apply_laminate = v.applyLaminate;
              if (v.printQuality  !== undefined) patch.print_quality  = v.printQuality;
              set(patch);
            }}
          />

          {/* Workflow-level cost knobs: spoilage buffer + setup fee floor */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Workflow Cost Controls</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Spoilage / Reprint Buffer (%)</label>
                <Input
                  type="number" step="1" min="0"
                  value={workflow.spoilage_buffer_percent ?? ""}
                  placeholder="0"
                  onChange={(e) => set({ spoilage_buffer_percent: e.target.value })}
                  className="h-8 tabular-nums"
                />
                <p className="text-[10px] text-slate-500 mt-1">Adds N% extra qty to every part before nesting.</p>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Setup-Fee Floor ($)</label>
                <Input
                  type="number" step="1" min="0"
                  value={workflow.setup_fee_floor ?? ""}
                  placeholder="0"
                  onChange={(e) => set({ setup_fee_floor: e.target.value })}
                  className="h-8 tabular-nums"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  {calc.setupFeeApplied > 0
                    ? <span className="text-amber-700 font-medium">Floor adding ${calc.setupFeeApplied.toFixed(2)} to this workflow.</span>
                    : "Workflow minimum charge."}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Cutting-only extras: transfer tape + weeding difficulty + install labor */}
          {workflow.apply_cut && (
            <VinylCuttingExtrasCard
              vinyls={vinyls}
              transferTapeId={workflow.transfer_tape_id}
              applyTransferTape={!!workflow.apply_transfer_tape}
              weedingDifficulty={workflow.weeding_difficulty}
              weedingMinutesPerPartOverride={workflow.weeding_minutes_per_part_override}
              installMinutesPerPart={workflow.install_minutes_per_part}
              partsPlaced={calc.partsPlaced}
              onChange={(p) => {
                const patch = {};
                if (p.transferTapeId   !== undefined) patch.transfer_tape_id   = p.transferTapeId;
                if (p.applyTransferTape !== undefined) patch.apply_transfer_tape = p.applyTransferTape;
                if (p.weedingDifficulty !== undefined) patch.weeding_difficulty = p.weedingDifficulty;
                if (p.weedingMinutesPerPartOverride !== undefined) patch.weeding_minutes_per_part_override = p.weedingMinutesPerPartOverride;
                if (p.installMinutesPerPart !== undefined) patch.install_minutes_per_part = p.installMinutesPerPart;
                set(patch);
              }}
            />
          )}

          {/* Per-personnel labor rates */}
          <VinylWorkflowPersonnel
            personnel={workflow.personnel || []}
            roleOptions={roleOptions}
            onChange={(personnel) => set({ personnel })}
            suggestedHours={(calc.machineRunMinutes + calc.weedingMinutes + calc.installMinutes) / 60}
          />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Parts in this workflow</CardTitle>
            </CardHeader>
            <CardContent>
              <VinylPartsTable
                items={workflow.items || []}
                onChange={(items) => set({ items, manual_positions: {} })}
                perPartCosts={perPartCosts}
                usableWidth={calc.usableWidth}
                defaultBleed={workflow.apply_cut ? 0 : 0.125}
                onMoveToWorkflow={onMovePartToWorkflow ? (partIdx) => onMovePartToWorkflow(partIdx) : null}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm">Roll Layout</CardTitle>
                <div className="flex items-center gap-2 text-xs">
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-500">Gutter H</span>
                  <Input
                    type="number" step="0.0625"
                    placeholder={String(calc.gutterH)}
                    value={workflow.gutter_h_override ?? ""}
                    onChange={(e) => set({ gutter_h_override: e.target.value })}
                    className="h-7 w-16 text-xs tabular-nums"
                  />
                  <span className="text-slate-500">V</span>
                  <Input
                    type="number" step="0.0625"
                    placeholder={String(calc.gutterV)}
                    value={workflow.gutter_v_override ?? ""}
                    onChange={(e) => set({ gutter_v_override: e.target.value })}
                    className="h-7 w-16 text-xs tabular-nums"
                  />
                  {(workflow.gutter_h_override || workflow.gutter_v_override || workflow.manual_positions) && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => set({ gutter_h_override: "", gutter_v_override: "", manual_positions: {} })}>
                      Reset
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <VinylRollVisualizer
                calc={calcWithManualPositions}
                showRegistrationMarks={workflow.apply_print && workflow.apply_cut}
                onItemMove={handleItemMove}
              />
            </CardContent>
          </Card>
        </CardContent>
      )}

      <VinylWorkflowTemplatesDialog
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        mode={templatesMode}
        currentWorkflow={workflow}
        onApply={(patch) => set(patch)}
      />
    </Card>
  );
}