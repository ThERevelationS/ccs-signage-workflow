import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Trash2, ChevronDown, ChevronRight, Zap, Copy, History, Clock,
  Type, Ruler, MoveHorizontal, Hash, Activity, AlertCircle,
} from "lucide-react";
import AppliesToMultiSelect from "./AppliesToMultiSelect";
import QuantityTiersEditor from "./QuantityTiersEditor";
import {
  CRITERIA_OPTIONS, CRITERIA_MAP,
  APPLIES_TO_LABEL, summarizeCost,
} from "./materialsConstants";
import { formatRelative, isStale } from "./materialsHelpers";

const SIZE_FIELDS = [
  { key: "cost_extra_small", label: "XS", sub: '2"-8"' },
  { key: "cost_small", label: "S", sub: '8"-12"' },
  { key: "cost_medium", label: "M", sub: '12"-24"' },
  { key: "cost_large", label: "L", sub: '24"-48"' },
  { key: "cost_extra_large", label: "XL", sub: '48"-60"' },
  { key: "cost_extra_extra_large", label: "XXL", sub: '60"+' },
];

const ICON_MAP = { Type, Ruler, MoveHorizontal, Hash };

export default function MaterialItemCard({
  item, isDirty, isNew, defaultExpanded,
  selected, onSelectChange,
  usageCount = 0,
  readOnly = false,
  onChange, onRemove, onDuplicate, onCollapse, onViewHistory,
}) {
  const [expanded, setExpanded] = useState(!!defaultExpanded || !!isNew);
  const wasExpanded = useRef(expanded);

  // Auto-save trigger when a card collapses while dirty
  useEffect(() => {
    if (wasExpanded.current && !expanded && isDirty && !readOnly) {
      onCollapse && onCollapse();
    }
    wasExpanded.current = expanded;
  }, [expanded, isDirty, readOnly, onCollapse]);

  const update = (patch) => { if (!readOnly) onChange(patch); };
  const crit = CRITERIA_MAP[item.pricing_mode];
  const CritIcon = ICON_MAP[crit?.icon] || Type;
  const appliesList = Array.isArray(item.applies_to_list) && item.applies_to_list.length > 0
    ? item.applies_to_list
    : (item.applies_to && item.applies_to !== "all" ? [item.applies_to] : []);

  const stale = isStale(item.updated_date);

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-shadow ${
      selected ? "border-purple-400 ring-2 ring-purple-100"
        : isDirty ? "border-amber-300 shadow-sm ring-1 ring-amber-100"
        : "border-slate-200"
    }`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
        {!readOnly && (
          <Checkbox
            checked={selected}
            onCheckedChange={(c) => onSelectChange(!!c)}
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0"
          />
        )}

        <button
          type="button"
          className="text-slate-400 hover:text-slate-700 flex-shrink-0"
          onClick={() => setExpanded(x => !x)}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(x => !x)}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 truncate">
              {item.item_name || <span className="text-slate-400 italic">Unnamed item</span>}
            </span>
            {crit && (
              <Badge variant="outline" className={`text-[10px] gap-1 ${crit.color}`}>
                <CritIcon className="w-2.5 h-2.5" />
                {crit.short}
              </Badge>
            )}
            {item.is_default && (
              <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 gap-1">
                <Zap className="w-2.5 h-2.5" /> Auto
              </Badge>
            )}
            {usageCount > 0 && (
              <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-700 border-slate-200 gap-1">
                <Activity className="w-2.5 h-2.5" />
                Used in {usageCount} project{usageCount !== 1 ? "s" : ""}
              </Badge>
            )}
            {isDirty && (
              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                Unsaved
              </Badge>
            )}
            {isNew && (
              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                New
              </Badge>
            )}
            {stale && !isNew && (
              <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200 gap-1">
                <AlertCircle className="w-2.5 h-2.5" /> Review pricing
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
            <span className="font-medium text-slate-700">{summarizeCost(item)}</span>
            {appliesList.length > 0 ? (
              <span className="truncate">
                Applies to: {appliesList.map(v => APPLIES_TO_LABEL[v] || v).join(", ")}
              </span>
            ) : (
              <span>Applies to: All types</span>
            )}
            {item.updated_date && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Updated {formatRelative(item.updated_date)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {item.id && (
            <Button
              size="sm" variant="ghost"
              onClick={(e) => { e.stopPropagation(); onViewHistory(); }}
              className="text-slate-500 hover:bg-slate-100 h-8 w-8 p-0"
              title="View price history"
            >
              <History className="w-4 h-4" />
            </Button>
          )}
          {!readOnly && (
            <Button
              size="sm" variant="ghost"
              onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
              className="text-slate-500 hover:bg-slate-100 h-8 w-8 p-0"
              title="Duplicate item"
            >
              <Copy className="w-4 h-4" />
            </Button>
          )}
          {!readOnly && (
            <Button
              size="sm" variant="ghost"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="text-red-500 hover:bg-red-50 h-8 w-8 p-0"
              title="Delete item"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-slate-200 px-4 py-4 bg-slate-50/40 space-y-5">
          <section>
            <h5 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Identity</h5>
            <div className="grid md:grid-cols-12 gap-3">
              <div className="md:col-span-9">
                <Label className="text-xs">Item Name</Label>
                <Input
                  value={item.item_name}
                  onChange={(e) => update({ item_name: e.target.value })}
                  placeholder="e.g. 1/4 inch threaded studs"
                  disabled={readOnly}
                  className="h-9 mt-1"
                />
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs">Unit</Label>
                <Input
                  value={item.unit || ""}
                  onChange={(e) => update({ unit: e.target.value })}
                  placeholder="ea, ft, box"
                  disabled={readOnly}
                  className="h-9 mt-1"
                />
              </div>
            </div>
          </section>

          <section>
            <h5 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Applicability</h5>
            <div className="grid md:grid-cols-12 gap-3 items-start">
              <div className="md:col-span-6">
                <Label className="text-xs">Applies To (Installation Types)</Label>
                <AppliesToMultiSelect
                  value={appliesList}
                  onChange={(list) => update({
                    applies_to_list: list,
                    applies_to: list.length === 0 ? "all" : list[0],
                  })}
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Leave empty to apply to all installation types.
                </p>
              </div>
              <div className="md:col-span-6 flex items-center gap-2 pt-5">
                <Checkbox
                  id={`auto-${item.id || "new"}`}
                  checked={item.is_default}
                  onCheckedChange={(c) => update({ is_default: !!c })}
                  disabled={readOnly}
                />
                <Label htmlFor={`auto-${item.id || "new"}`} className="text-sm cursor-pointer flex-1">
                  <div className="font-medium">Auto-attach to new line items</div>
                  <div className="text-[11px] text-slate-500">
                    When enabled, this material is automatically added to matching line items.
                  </div>
                </Label>
              </div>
            </div>
          </section>

          <section>
            <h5 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Pricing</h5>
            <div className="grid md:grid-cols-12 gap-3">
              <div className="md:col-span-4">
                <Label className="text-xs">Pricing Method</Label>
                <Select value={item.pricing_mode} onValueChange={(v) => update({ pricing_mode: v })} disabled={readOnly}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CRITERIA_OPTIONS.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-8">
                {item.pricing_mode === "per_letter_flat" && (
                  <div>
                    <Label className="text-xs">Cost per Letter ($)</Label>
                    <Input
                      type="number" step="0.01" value={item.cost_per_letter}
                      onFocus={e => e.target.select()}
                      onChange={(e) => update({ cost_per_letter: parseFloat(e.target.value) || 0 })}
                      disabled={readOnly}
                      className="h-9 mt-1 max-w-[200px]"
                    />
                  </div>
                )}

                {item.pricing_mode === "per_letter_by_size" && (
                  <div>
                    <Label className="text-xs">Cost per Letter by Size ($)</Label>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-1">
                      {SIZE_FIELDS.map(s => (
                        <div key={s.key}>
                          <div className="text-[10px] text-slate-500 mb-0.5">
                            <span className="font-semibold">{s.label}</span> <span className="opacity-70">{s.sub}</span>
                          </div>
                          <Input
                            type="number" step="0.01" value={item[s.key]}
                            onFocus={e => e.target.select()}
                            onChange={(e) => update({ [s.key]: parseFloat(e.target.value) || 0 })}
                            disabled={readOnly}
                            className="h-9 text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {item.pricing_mode === "per_raceway_foot" && (
                  <div>
                    <Label className="text-xs">Cost per Linear Foot of Raceway ($)</Label>
                    <Input
                      type="number" step="0.01" value={item.cost_per_foot}
                      onFocus={e => e.target.select()}
                      onChange={(e) => update({ cost_per_foot: parseFloat(e.target.value) || 0 })}
                      disabled={readOnly}
                      className="h-9 mt-1 max-w-[200px]"
                    />
                  </div>
                )}

                {item.pricing_mode === "per_project_flat" && (
                  <div>
                    <Label className="text-xs">Flat Cost per Sign ($)</Label>
                    <Input
                      type="number" step="0.01" value={item.cost_flat}
                      onFocus={e => e.target.select()}
                      onChange={(e) => update({ cost_flat: parseFloat(e.target.value) || 0 })}
                      disabled={readOnly}
                      className="h-9 mt-1 max-w-[200px]"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3">
              <QuantityTiersEditor
                tiers={item.quantity_tiers}
                onChange={(tiers) => update({ quantity_tiers: tiers })}
                disabled={readOnly}
              />
            </div>
          </section>

          <section>
            <h5 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Details</h5>
            <div className="grid md:grid-cols-12 gap-3">
              <div className="md:col-span-4">
                <Label className="text-xs">Supplier</Label>
                <Input
                  value={item.supplier || ""}
                  onChange={(e) => update({ supplier: e.target.value })}
                  placeholder="Vendor name"
                  disabled={readOnly}
                  className="h-9 mt-1"
                />
              </div>
              <div className="md:col-span-8">
                <Label className="text-xs">Notes</Label>
                <Input
                  value={item.notes || ""}
                  onChange={(e) => update({ notes: e.target.value })}
                  placeholder="Internal notes, SKU, alt sources..."
                  disabled={readOnly}
                  className="h-9 mt-1"
                />
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}