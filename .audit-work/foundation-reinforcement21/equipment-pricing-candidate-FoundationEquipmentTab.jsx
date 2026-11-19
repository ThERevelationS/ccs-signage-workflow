import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Wrench } from 'lucide-react';
import { money, calcEquipmentPricing, equipmentCostTotal } from './foundationCalc';
import { hasFoundationCostSnapshot } from './foundationCatalogIntegrity';
import { setFoundationEquipmentCount } from './foundationEquipmentBindings';

const fin = (v) => Number.isFinite(v);
const intQty = (v) => fin(v) && Number.isInteger(v) && v >= 0;
// Blank-preserving draft coercion (same rule as the wall/pole panels): a blank
// draft stays blank, a numeric draft becomes a number, and a malformed draft
// is stored verbatim so the pricing diagnostics can flag it — never coerced.
const equipmentInputValue = (value) => value === "" ? "" : Number.isFinite(Number(value)) ? Number(value) : value;

function OverrideChip({ label, value, onClear, moneyVal = false, invalid = false }) {
  if (value === undefined || value === null) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${invalid ? 'bg-red-100 text-red-800 border border-red-300' : 'bg-amber-100 text-amber-800'}`}>
      {label}: {moneyVal && typeof value === 'number' ? money(value) : String(value)}
      <button type="button" aria-label={`Clear ${label}`} onClick={onClear} className={invalid ? 'text-red-900 hover:underline' : 'text-amber-900 hover:underline'}>Clear</button>
    </span>
  );
}

function EquipmentCard({ entry, detail, index, inventory, onUpdate, onRemove, showMiscAttachments }) {
  const [err, setErr] = useState('');
  useEffect(() => { setErr(''); }, [entry]);
  const eq = detail.equipment; // may be undefined when missing
  const issues = detail.issues || [];
  const broken = issues.length > 0;
  const fieldIssue = (field) => issues.some((i) => i.field === field);
  const describedBy = (field) => (fieldIssue(field) ? `equipment-${index}-pricing` : undefined);
  const update = (next) => onUpdate(index, next);
  const setQty = (kind, id, quantity) => {
    try {
      const next = setFoundationEquipmentCount(entry, { kind, id, quantity });
      setErr('');
      update(next);
    } catch (e) { setErr(e.message || 'Quantity change rejected.'); }
  };
  const changeQty = (kind, id, raw) => {
    // Valid input reaches the shared draft immediately, including keyboard saves.
    if (raw === '') return;
    const n = Number(raw);
    if (!intQty(n)) { setErr('Quantity must be a whole number 0 or greater.'); return; }
    setQty(kind, id, n);
  };

  const eqOptions = inventory.filter(i => i.material_type === 'excavation_equipment');
  const compatibleAtts = inventory.filter(a =>
    a.material_type === 'attachment'
    && (showMiscAttachments || !a.is_miscellaneous_attachment)
    && (eq?.compatible_attachment_ids || []).includes(a.id));
  const activeParents = detail.attachmentRows.filter(r => r.quantity > 0 && r.inventory);
  const compatibleSubs = inventory.filter(s =>
    s.material_type === 'sub_attachment'
    && (showMiscAttachments || !s.is_miscellaneous_attachment)
    && activeParents.some(r => (eq?.compatible_attachment_ids || []).includes(r.id)
      && (r.inventory.compatible_sub_attachment_ids || []).includes(s.id)));
  const selectedAttIds = new Set(detail.attachmentMode === 'normalized'
    ? detail.attachmentRows.map(r => r.id)
    : detail.attachmentRows.filter(r => r.quantity !== 0).map(r => r.id));
  const selectedSubIds = new Set(detail.subAttachmentRows.filter(r => r.quantity !== 0).map(r => r.id));

  // legacy_ids: group occurrence counts per lead recipe; normalized keeps each raw row.
  const attView = detail.attachmentMode === 'legacy_ids'
    ? [...new Set(detail.attachmentRows.map(r => r.id))].map(id => ({
        id,
        quantity: detail.attachmentRows.filter(r => r.id === id).length,
        inventory: detail.attachmentRows.find(r => r.id === id)?.inventory,
        row: detail.attachmentRows.find(r => r.id === id),
        group: detail.attachmentRows.filter(r => r.id === id).length > 1,
      }))
    : detail.attachmentRows.map(row => ({ id: row.id, quantity: row.quantity, inventory: row.inventory, row, group: false }));
  const dupNormIds = detail.attachmentMode === 'normalized'
    ? new Set(detail.attachmentRows.map(r => r.id).filter((id) => detail.attachmentRows.filter(r => r.id === id).length > 1))
    : new Set();

  const periodOptions = ['day', 'week', 'month'].filter(p => eq ? fin(eq[`cost_per_${p}`]) : true);
  const savedPeriod = detail.rentalPeriod;
  if (savedPeriod && !periodOptions.includes(savedPeriod)) periodOptions.push(savedPeriod);
  const customQtyActive = entry.custom_qty !== undefined && entry.custom_qty !== null;

  const cardTotal = !broken
    ? money(detail.totalCost)
    : hasFoundationCostSnapshot(detail.totalCost) ? money(detail.totalCost) : 'Not saved';
  const lineAmt = (v) => (broken ? 'Unavailable' : money(v));

  const attRow = (a, key) => {
    const inv = a.inventory;
    const missing = !inv;
    const dupNorm = detail.attachmentMode === 'normalized' && dupNormIds.has(a.id);
    const disabledQty = dupNorm;
    return (
      <div key={key} className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs ${a.quantity > 0 ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
        <div className="min-w-0">
          <div className="font-medium text-slate-800 truncate">{inv?.material_name || `Catalog item unavailable (${a.id})`}</div>
          <div className="text-[10px] text-slate-500">
            {missing && <span className="text-amber-700 font-semibold">Unavailable — review. </span>}
            {dupNorm && <span className="text-amber-700 font-semibold">Duplicate rows — quantity editing disabled. </span>}
            {detail.attachmentMode === 'normalized' && a.row.sourceRecord?.qty === 0 && <span>qty 0 priced as 1. </span>}
            {a.group && <span>legacy duplicate ids ×{a.quantity} — catalog per-unit rate only. </span>}
            {!missing && inv && !a.group && hasFoundationCostSnapshot(a.row.cost) && <span>{money(a.row.cost)}</span>}
            {!missing && a.group && fin(inv?.cost_per_day) && <span>rate {money(inv.cost_per_day)}/day</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {dupNorm ? (
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setQty('attachment', a.id, 0)}>Remove all duplicates</Button>
          ) : (
            <input
              type="number" min="0" disabled={disabledQty} aria-label={`Attachment qty ${inv?.material_name || a.id}`}
              className="h-7 w-14 rounded-md border border-input px-1 text-xs disabled:opacity-40"
              value={a.quantity}
              onChange={(e) => changeQty('attachment', a.id, e.target.value)}
            />
          )}
        </div>
      </div>
    );
  };

  const subRow = (s, key) => {
    const inv = s.inventory;
    const missing = !inv;
    const parentLinked = activeParents.some(r => (r.inventory.compatible_sub_attachment_ids || []).includes(s.id));
    return (
      <div key={key} className="flex items-center justify-between gap-2 p-2 rounded-lg border text-xs bg-slate-50 border-slate-200">
        <div className="min-w-0">
          <div className="font-medium text-slate-800 truncate">{inv?.material_name || `Catalog item unavailable (${s.id})`}</div>
          <div className="text-[10px] text-slate-500">
            {missing && <span className="text-amber-700 font-semibold">Unavailable — review. </span>}
            {!missing && !parentLinked && <span className="text-amber-700 font-semibold">No selected parent attachment links this item. </span>}
            {!missing && hasFoundationCostSnapshot(s.cost) && <span>{money(s.cost)}</span>}
          </div>
        </div>
        <input
          type="number" min="0" aria-label={`Sub attachment qty ${inv?.material_name || s.id}`}
          className="h-7 w-14 rounded-md border border-input px-1 text-xs"
          value={s.quantity}
          onChange={(e) => changeQty('sub_attachment', s.id, e.target.value)}
        />
      </div>
    );
  };

  return (
    <Card data-equipment-index={index} className="border border-indigo-200 shadow-sm overflow-hidden mb-4">
      <CardHeader className="py-3 px-4 bg-indigo-50/60 border-b border-indigo-100">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold">{eq?.material_name || `Equipment ${index + 1}`}</CardTitle>
              {eq?.equipment_type && <Badge variant="outline" className="text-xs">{eq.equipment_type}</Badge>}
              {eq?.rental_company && <span className="text-xs text-slate-500">{eq.rental_company}</span>}
              {broken && <Badge variant="secondary" className="text-xs text-amber-800">Saved amounts (not current pricing)</Badge>}
              <Badge variant="secondary" className="text-xs">Total: {cardTotal}</Badge>
            </div>
            {eq?.notes && <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">{eq.notes}</p>}
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="text-red-500" aria-label={`Remove equipment ${index + 1}`} onClick={onRemove}>
              <Trash2 className="w-3 h-3" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {broken && (
          <ul role="status" id={`equipment-${index}-pricing`} className="list-disc pl-5 text-[11px] text-amber-800">
            {issues.map((i, k) => <li key={k}>{i.message}</li>)}
          </ul>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Equipment</Label>
            <Select
              value={entry.equipment_id || ''}
              onValueChange={(v) => update({ ...entry, equipment_id: v })}
            >
              <SelectTrigger className="h-8"><SelectValue placeholder="Select equipment…" /></SelectTrigger>
              <SelectContent>
                {entry.equipment_id && !eqOptions.some(o => o.id === entry.equipment_id) && (
                  <SelectItem value={entry.equipment_id} disabled>{`Catalog equipment unavailable (${entry.equipment_id})`}</SelectItem>
                )}
                {eqOptions.map(o => <SelectItem key={o.id} value={o.id}>{o.material_name}</SelectItem>)}
              </SelectContent>
            </Select>
            {eq && (eq.compatible_attachment_ids?.length || eq.compatible_sub_attachment_ids?.length) === 0 ? null : null}
            {broken && <p className="text-[10px] text-amber-700 mt-0.5">Reassigning preserves selected attachments/overrides — review compatibility.</p>}
          </div>
          <div>
            <Label className="text-xs">Rental Period</Label>
            <Select value={detail.rentalPeriod} onValueChange={(v) => update({ ...entry, rental_period: v })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {periodOptions.map(p => (
                  <SelectItem key={p} value={p}>
                    {p === 'day' ? `Daily (${fin(eq?.cost_per_day) ? money(eq.cost_per_day) : '?'}/day)`
                      : p === 'week' ? `Weekly (${fin(eq?.cost_per_week) ? money(eq.cost_per_week) : '?'}/wk)`
                      : p === 'month' ? `Monthly (${fin(eq?.cost_per_month) ? money(eq.cost_per_month) : '?'}/mo)`
                      : `Review (${savedPeriod})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Duration {customQtyActive && <span className="text-amber-700">(custom qty override active — editing duration does not clear it)</span>}</Label>
            <input
              type="number" aria-label="Rental duration" min={1} step="any"
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={entry.rental_duration ?? ""}
              placeholder="1"
              aria-invalid={fieldIssue("rental_duration") || undefined}
              aria-describedby={describedBy("rental_duration")}
              onChange={(e) => update({ ...entry, rental_duration: equipmentInputValue(e.target.value) })}
            />
          </div>
          <div className="flex items-end pb-1">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={entry.include_delivery || false}
                onCheckedChange={(v) => update({ ...entry, include_delivery: v })}
                id={`delivery-${entry._id || index}`}
              />
              <Label htmlFor={`delivery-${entry._id || index}`} className="text-xs cursor-pointer">
                Include Delivery {fin(eq?.pickup_delivery_cost) ? `(${money(eq.pickup_delivery_cost)})` : ''}
              </Label>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <OverrideChip label="Custom rate" value={entry.custom_rate} moneyVal invalid={fieldIssue('custom_rate')} onClear={() => update({ ...entry, custom_rate: null })} />
          <OverrideChip label="Custom qty" value={entry.custom_qty} invalid={fieldIssue('custom_qty')} onClear={() => update({ ...entry, custom_qty: null })} />
          <OverrideChip label={`Custom delivery${entry.include_delivery ? '' : ' (inactive — delivery excluded)'}`} value={entry.custom_delivery_charge} moneyVal invalid={fieldIssue('custom_delivery_charge')} onClear={() => update({ ...entry, custom_delivery_charge: null })} />
        </div>
        {err && <p role="alert" className="text-[11px] text-red-700">{err}</p>}
        <div className="grid grid-cols-3 gap-2 text-xs text-slate-600">
          <div>Base: <span className="font-semibold text-slate-900">{lineAmt(detail.baseCost)}</span></div>
          <div>Delivery: <span className="font-semibold text-slate-900">{lineAmt(detail.deliveryCost)}</span></div>
          <div>Total: <span className="font-semibold text-slate-900">{cardTotal}</span></div>
        </div>

        <div>
          <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">
            <Wrench className="w-3 h-3 inline mr-1" aria-hidden="true" /> Attachments
          </Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {attView.filter(a => detail.attachmentMode === 'normalized' || a.quantity !== 0).map((a, k) => attRow(a, k))}
          </div>
          {compatibleAtts.filter(a => !selectedAttIds.has(a.id)).length > 0 && eq && (
            <div className="mt-2">
              <Select value="" onValueChange={(v) => v && setQty('attachment', v, 1)}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Add attachment…" /></SelectTrigger>
                <SelectContent>
                  {compatibleAtts.filter(a => !selectedAttIds.has(a.id)).map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.material_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {attView.some(a => a.inventory && !(eq?.compatible_attachment_ids || []).includes(a.id)) && (
            <p className="text-[10px] text-amber-700 mt-1">Selected item incompatible with this parent — review.</p>
          )}
        </div>

        {detail.subAttachmentRows.filter(s => s.quantity !== 0).length > 0 && (
          <div>
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">Sub-attachments</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {detail.subAttachmentRows.filter(s => s.quantity !== 0).map((s, k) => subRow(s, k))}
            </div>
          </div>
        )}
        {compatibleSubs.filter(s => !selectedSubIds.has(s.id)).length > 0 && eq && (
          <div>
            <Select value="" onValueChange={(v) => v && setQty('sub_attachment', v, 1)}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Add sub-attachment…" /></SelectTrigger>
              <SelectContent>
                {compatibleSubs.filter(s => !selectedSubIds.has(s.id)).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.material_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function EquipmentTab({ foundationItems = [], inventory = [], selectedEquipmentList = [], onUpdate, markDirty }) {
  const [showAllEquipment, setShowAllEquipment] = useState(false);
  const [showMiscAttachments, setShowMiscAttachments] = useState(false);

  const pricingRows = calcEquipmentPricing(selectedEquipmentList, inventory);
  const total = equipmentCostTotal(pricingRows.map(r => r.pricedEntry));
  const incomplete = pricingRows.some(r => r.issues.length);

  const sortByOrder = (rows) => [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const excavation = sortByOrder(inventory.filter(i => i.material_type === 'excavation_equipment' && !i.is_non_excavation_equipment));
  const nonExcavation = sortByOrder(inventory.filter(i => i.material_type === 'excavation_equipment' && i.is_non_excavation_equipment));
  const types = new Set((foundationItems || []).map(f => f.foundation_type));
  const hasPillar = types.has('pillar');
  const hasSpread = types.has('spread_foot');
  const filteredExcavation = showAllEquipment || (!hasPillar && !hasSpread) ? excavation
    : excavation.filter(e => (hasPillar && e.is_pillar_excavation) || (hasSpread && e.is_spread_foot_excavation));
  const filteredNonExcavation = nonExcavation;

  const addEquipment = (eqId) => {
    if (!eqId || eqId === '_none') return;
    const eqItem = inventory.find(i => i.id === eqId);
    const newEntry = {
      _id: `eq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      equipment_id: eqId,
      rental_period: 'day',
      rental_duration: 1,
      include_delivery: (eqItem?.pickup_delivery_cost || 0) > 0,
      attachment_counts: {},
      sub_attachment_counts: {},
    };
    onUpdate([...selectedEquipmentList, newEntry]);
    markDirty();
  };

  const removeEquipment = (idx) => {
    const eq = inventory.find(i => i.id === selectedEquipmentList[idx]?.equipment_id);
    if (!window.confirm(`Remove ${eq?.material_name || 'this equipment'}?`)) return;
    onUpdate(selectedEquipmentList.filter((_, i) => i !== idx));
    markDirty();
  };

  const updateEntry = (idx, updated) => {
    const arr = [...selectedEquipmentList];
    arr[idx] = updated;
    onUpdate(arr);
    markDirty();
  };

  const addSelect = (label, rows, placeholder) => (
    <div className="flex-1 min-w-[260px]">
      <Label className="text-xs font-semibold text-indigo-900 uppercase tracking-wide">{label}</Label>
      <Select value="" onValueChange={addEquipment}>
        <SelectTrigger className="h-9 mt-1"><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {rows.length === 0 ? <SelectItem value="_none" disabled>No equipment available</SelectItem>
            : rows.map(eq => <SelectItem key={eq.id} value={eq.id}>{eq.material_name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="border-indigo-200 bg-indigo-50/50 shadow-sm mb-4">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-6 mb-4 pb-4 border-b border-indigo-100">
            <div className="flex items-center gap-2">
              <Checkbox id="showAllEq" checked={showAllEquipment} onCheckedChange={setShowAllEquipment} />
              <Label htmlFor="showAllEq" className="text-sm cursor-pointer text-indigo-900 font-medium">Show all equipment</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="showMiscAtt" checked={showMiscAttachments} onCheckedChange={setShowMiscAttachments} />
              <Label htmlFor="showMiscAtt" className="text-sm cursor-pointer text-indigo-900 font-medium">Show Miscellaneous Attachments</Label>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            {addSelect('Add Excavation Equipment', filteredExcavation, 'Select excavation equipment to add…')}
            {addSelect('Add Non-Excavation Equipment', filteredNonExcavation, 'Select non-excavation equipment to add…')}
          </div>
        </CardContent>
      </Card>

      {incomplete && (
        <div role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800 font-semibold">
          Pricing unavailable: selected materials or rental items need attention. Saved/known amounts only.
        </div>
      )}

      {selectedEquipmentList.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-slate-400">
            <Wrench className="w-8 h-8 mx-auto mb-2" aria-hidden="true" />
            <p className="font-medium">No equipment added yet</p>
            <p className="text-sm mt-1">Select equipment from the dropdown above.</p>
          </CardContent>
        </Card>
      )}

      {selectedEquipmentList.map((entry, idx) => (
        <EquipmentCard
          key={entry.component_id || entry._id || idx}
          entry={entry}
          detail={pricingRows[idx]}
          index={idx}
          inventory={inventory}
          onUpdate={updateEntry}
          onRemove={() => removeEquipment(idx)}
          showMiscAttachments={showMiscAttachments}
        />
      ))}

      {selectedEquipmentList.length > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="py-3 px-4 flex items-center justify-between">
            <span className="font-medium text-amber-800">Total Equipment Cost</span>
            <span className="text-lg font-bold text-amber-700">{incomplete ? 'Pricing unavailable' : money(total)}</span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
