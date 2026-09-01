import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2, Copy } from "lucide-react";
import SignTypePicker from "./SignTypePicker";
import ActionPicker from "./ActionPicker";
import RepaintMonumentPanel from "./RepaintMonumentPanel";
import { defaultMonumentRepaintConfig } from "./repaintCalculator";
import { SIGN_TYPES_BY_ID, LETTER_SIZES, CABINET_SIZES, sizeAxisFor, ACTIONS } from "./constants";

export default function ServiceItemRow({ item, index, onUpdate, onRemove, onDuplicate, settings = {}, rates = [] }) {
  const update = (patch) => onUpdate(index, { ...item, ...patch });

  // Actions enabled for the current sign type, driven by the user's Settings
  // toggles (MaintenanceActionRate.is_enabled). If no rate row exists yet for
  // a (sign_type, action) pair, we treat it as enabled (default).
  const enabledActionsForSign = React.useMemo(() => {
    if (!item.sign_type) return [];
    return ACTIONS
      .map(a => a.id)
      .filter(actionId => {
        const r = rates.find(x => x.sign_type === item.sign_type && x.action === actionId);
        return !r || r.is_enabled !== false;
      });
  }, [item.sign_type, rates]);

  const handleSignTypeChange = (id) => {
    // Reset size and prune actions that are not enabled for this sign type.
    const allowed = ACTIONS
      .map(a => a.id)
      .filter(actionId => {
        const r = rates.find(x => x.sign_type === id && x.action === actionId);
        return !r || r.is_enabled !== false;
      });
    const filteredActions = (item.actions || []).filter(a => allowed.includes(a));
    const axis = sizeAxisFor(id);
    const defaultSize = axis === "cabinet" ? "cab_medium" : "medium";
    update({ sign_type: id, actions: filteredActions, size: defaultSize });
  };

  const toggleAction = (actionId) => {
    const cur = item.actions || [];
    const next = cur.includes(actionId) ? cur.filter(a => a !== actionId) : [...cur, actionId];
    const patch = { actions: next };
    // Seed default monument repaint config the first time both are selected.
    if (actionId === "repaint" && next.includes("repaint") && item.sign_type === "monument_sign" && !item.repaint_config) {
      patch.repaint_config = defaultMonumentRepaintConfig();
    }
    update(patch);
  };

  const isMonumentRepaint = item.sign_type === "monument_sign" && (item.actions || []).includes("repaint");

  const axis = sizeAxisFor(item.sign_type);
  const sizes = axis === "cabinet" ? CABINET_SIZES : LETTER_SIZES;
  const sizeLabel = axis === "cabinet" ? "Cabinet Size" : "Letter Size";
  const qtyLabel = axis === "cabinet" ? "# of Cabinets" : "# of Letters";

  const meta = SIGN_TYPES_BY_ID[item.sign_type];

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <Label className="text-[11px] uppercase tracking-wide text-slate-500">Description (optional)</Label>
            <Input
              value={item.description || ""}
              onChange={(e) => update({ description: e.target.value })}
              placeholder={meta ? `e.g. Front ${meta.label} — north elevation` : "e.g. Front Channel Letters — north elevation"}
              className="h-9 text-sm mt-1"
            />
          </div>
          <div className="flex gap-1 pt-5">
            <Button size="icon" variant="ghost" onClick={() => onDuplicate(index)} title="Duplicate"><Copy className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => onRemove(index)} title="Remove"><Trash2 className="w-4 h-4" /></Button>
          </div>
        </div>

        <div>
          <Label className="text-[11px] uppercase tracking-wide text-slate-500 block mb-1.5">Sign Type</Label>
          <SignTypePicker value={item.sign_type} onChange={handleSignTypeChange} />
        </div>

        {item.sign_type && (
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-slate-500">{sizeLabel}</Label>
              <select
                className="h-9 w-full rounded-md border border-slate-200 text-sm bg-white px-2 mt-1"
                value={item.size || sizes[1].id}
                onChange={(e) => update({ size: e.target.value })}
              >
                {sizes.map(s => <option key={s.id} value={s.id}>{s.label} {s.range ? `— ${s.range}` : ""}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-slate-500">{qtyLabel}</Label>
              <Input
                type="number" min="0" step="1"
                value={item.qty ?? (axis === "cabinet" ? 1 : 10)}
                onChange={(e) => update({ qty: parseFloat(e.target.value) || 0 })}
                className="h-9 text-sm tabular-nums mt-1"
              />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-slate-500">Install Height (ft)</Label>
              <Input
                type="number" min="0" step="1"
                value={item.installation_height_feet ?? 12}
                onChange={(e) => update({ installation_height_feet: parseFloat(e.target.value) || 0 })}
                className="h-9 text-sm tabular-nums mt-1"
              />
            </div>
          </div>
        )}

        {item.sign_type && (
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-slate-500 block mb-1.5">Work to be Performed</Label>
            <ActionPicker
              signType={item.sign_type}
              selected={item.actions || []}
              onToggle={toggleAction}
              enabledActions={enabledActionsForSign}
            />
          </div>
        )}

        {/* Specialized estimator panels per (sign_type × action) */}
        {isMonumentRepaint && (
          <RepaintMonumentPanel item={item} settings={settings} onChange={update} />
        )}
      </CardContent>
    </Card>
  );
}