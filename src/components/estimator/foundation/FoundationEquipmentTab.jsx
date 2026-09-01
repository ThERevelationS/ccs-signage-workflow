import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Info, Wrench } from 'lucide-react';

function EquipmentCard({ equipment, selectedEquipment, onUpdate, onRemove, allAttachments, allSubAttachments, showMiscAttachments }) {
  const eq = equipment; // the inventory item

  const compatibleAttachments = allAttachments.filter(a => {
    if (!showMiscAttachments && a.is_miscellaneous_attachment) return false;
    return eq.compatible_attachment_ids?.includes(a.id);
  });

  const attCounts = selectedEquipment.attachment_counts || {};
  
  // Convert legacy attachment_ids to attachment_counts if needed
  if (selectedEquipment.attachment_ids?.length && Object.keys(attCounts).length === 0) {
      selectedEquipment.attachment_ids.forEach(id => attCounts[id] = 1);
  }

  const subAttCounts = selectedEquipment.sub_attachment_counts || {};

  const handleAttChange = (id, change, allowMultiple) => {
    const current = attCounts[id] || 0;
    let next = Math.max(0, current + change);
    if (!allowMultiple && next > 1) next = 1;
    onUpdate({ ...selectedEquipment, attachment_counts: { ...attCounts, [id]: next } });
  };

  const handleSubAttChange = (id, change, allowMultiple) => {
    const current = subAttCounts[id] || 0;
    let next = Math.max(0, current + change);
    if (!allowMultiple && next > 1) next = 1;
    onUpdate({ ...selectedEquipment, sub_attachment_counts: { ...subAttCounts, [id]: next } });
  };

  const rentalPeriod = selectedEquipment.rental_period || 'day';
  const rentalDuration = selectedEquipment.rental_duration || 1;

  const getRentalCost = (item) => {
    if (rentalPeriod === 'day') return (item.cost_per_day || 0) * rentalDuration;
    if (rentalPeriod === 'week') return (item.cost_per_week || 0) * rentalDuration;
    if (rentalPeriod === 'month') return (item.cost_per_month || 0) * rentalDuration;
    return 0;
  };

  const attachmentCost = compatibleAttachments.reduce((sum, a) => sum + getRentalCost(a) * (attCounts[a.id] || 0), 0);

  const visibleSubAttachments = allSubAttachments.filter(s => {
    return compatibleAttachments.some(a => (attCounts[a.id] || 0) > 0 && a.compatible_sub_attachment_ids?.includes(s.id));
  });

  const subAttachmentCost = visibleSubAttachments.reduce((sum, s) => sum + getRentalCost(s) * (subAttCounts[s.id] || 0), 0);

  const baseRentalCost = getRentalCost(eq);
  const deliveryCost = selectedEquipment.include_delivery ? (eq.pickup_delivery_cost || 0) : 0;
  const totalCost = baseRentalCost + deliveryCost + attachmentCost + subAttachmentCost;

  return (
    <Card className="border border-indigo-200 shadow-sm overflow-hidden mb-4">
      <CardHeader className="py-3 px-4 bg-indigo-50/60 border-b border-indigo-100">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm font-semibold">{eq.material_name}</CardTitle>
              {eq.equipment_type && <Badge variant="outline" className="text-xs">{eq.equipment_type}</Badge>}
              {eq.rental_company && <span className="text-xs text-slate-500">{eq.rental_company}</span>}
              <Badge variant="secondary" className="text-xs">Total: ${totalCost.toFixed(2)}</Badge>
            </div>
            {eq.notes && <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">{eq.notes}</p>}
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="text-red-500" onClick={onRemove}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-4">

        {/* Rental config */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Rental Period</Label>
            <Select value={rentalPeriod} onValueChange={v => onUpdate({ ...selectedEquipment, rental_period: v })}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {eq.cost_per_day && <SelectItem value="day">Daily (${eq.cost_per_day}/day)</SelectItem>}
                {eq.cost_per_week && <SelectItem value="week">Weekly (${eq.cost_per_week}/wk)</SelectItem>}
                {eq.cost_per_month && <SelectItem value="month">Monthly (${eq.cost_per_month}/mo)</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Duration</Label>
            <input
              type="number"
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={rentalDuration}
              min={1}
              onChange={e => onUpdate({ ...selectedEquipment, rental_duration: parseFloat(e.target.value) || 1 })}
            />
          </div>
          {eq.pickup_delivery_cost > 0 && (
            <div className="flex items-end pb-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedEquipment.include_delivery || false}
                  onCheckedChange={v => onUpdate({ ...selectedEquipment, include_delivery: v })}
                  id={`delivery-${eq.id}`}
                />
                <Label htmlFor={`delivery-${eq.id}`} className="text-xs cursor-pointer">
                  Include Delivery (${eq.pickup_delivery_cost})
                </Label>
              </div>
            </div>
          )}
          <div className="bg-amber-50 rounded-lg p-2 flex flex-col justify-center">
            <p className="text-xs text-slate-500">Rental Cost</p>
            <p className="font-semibold text-sm">${baseRentalCost.toFixed(2)}</p>
          </div>
        </div>

        {/* Attachments */}
        {compatibleAttachments.length > 0 && (
          <div>
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">
              <Wrench className="w-3 h-3 inline mr-1" />
              Attachments
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {compatibleAttachments.map(att => {
                const count = attCounts[att.id] || 0;
                return (
                  <div
                    key={att.id}
                    className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs transition-colors ${
                      count > 0
                        ? 'bg-amber-50 border-amber-300'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex-1 cursor-pointer" onClick={() => handleAttChange(att.id, count > 0 ? -count : 1, att.allow_multiple)}>
                      <p className="font-medium text-slate-800">{att.material_name}</p>
                      <p className="text-amber-700 font-semibold mt-0.5">${getRentalCost(att).toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {att.allow_multiple ? (
                            <div className="flex items-center bg-white border rounded">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleAttChange(att.id, -1, true)}>-</Button>
                                <span className="w-4 text-center font-medium">{count}</span>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleAttChange(att.id, 1, true)}>+</Button>
                            </div>
                        ) : (
                            <Checkbox checked={count > 0} onCheckedChange={(v) => handleAttChange(att.id, v ? 1 : -1, false)} />
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sub-Attachments */}
        {visibleSubAttachments.length > 0 && (
          <div className="pt-2">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">
              <Plus className="w-3 h-3 inline mr-1" />
              Sub-Attachments
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {visibleSubAttachments.map(sub => {
                const count = subAttCounts[sub.id] || 0;
                return (
                  <div
                    key={sub.id}
                    className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs transition-colors ${
                      count > 0
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex-1 cursor-pointer" onClick={() => handleSubAttChange(sub.id, count > 0 ? -count : 1, sub.allow_multiple)}>
                      <p className="font-medium text-slate-800">{sub.material_name}</p>
                      <p className="text-blue-700 font-semibold mt-0.5">${getRentalCost(sub).toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {sub.allow_multiple ? (
                            <div className="flex items-center bg-white border rounded">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSubAttChange(sub.id, -1, true)}>-</Button>
                                <span className="w-4 text-center font-medium">{count}</span>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSubAttChange(sub.id, 1, true)}>+</Button>
                            </div>
                        ) : (
                            <Checkbox checked={count > 0} onCheckedChange={(v) => handleSubAttChange(sub.id, v ? 1 : -1, false)} />
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function EquipmentTab({ foundationItems = [], inventory, selectedEquipmentList, onUpdate, markDirty }) {
  const [showAllEquipment, setShowAllEquipment] = useState(false);
  const [showMiscAttachments, setShowMiscAttachments] = useState(false);

  const allEquipment = inventory.filter(i => i.material_type === 'excavation_equipment');
  const allAttachments = inventory.filter(i => i.material_type === 'attachment').sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const allSubAttachments = inventory.filter(i => i.material_type === 'sub_attachment').sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const hasPillar = foundationItems.some(i => i.foundation_type === 'pillar');
  const hasSpreadFoot = foundationItems.some(i => i.foundation_type === 'spread_foot');

  let filteredExcavationEquipment = allEquipment.filter(eq => !eq.is_non_excavation_equipment);
  if (!showAllEquipment) {
      if (hasPillar && !hasSpreadFoot) {
          filteredExcavationEquipment = filteredExcavationEquipment.filter(eq => eq.is_pillar_excavation);
      } else if (hasSpreadFoot && !hasPillar) {
          filteredExcavationEquipment = filteredExcavationEquipment.filter(eq => eq.is_spread_foot_excavation);
      } else if (hasPillar && hasSpreadFoot) {
          filteredExcavationEquipment = filteredExcavationEquipment.filter(eq => eq.is_pillar_excavation || eq.is_spread_foot_excavation);
      }
  }
  filteredExcavationEquipment.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const filteredNonExcavationEquipment = allEquipment
      .filter(eq => eq.is_non_excavation_equipment)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const addEquipment = (eqId) => {
    if (!eqId || eqId === '_none') return;
    const eqItem = inventory.find(i => i.id === eqId);
    const newEntry = {
      _id: Date.now() + Math.random(),
      equipment_id: eqId,
      rental_period: 'day',
      rental_duration: 1,
      include_delivery: (eqItem?.pickup_delivery_cost || 0) > 0,
      attachment_counts: {},
      sub_attachment_counts: {}
    };
    onUpdate([...selectedEquipmentList, newEntry]);
    markDirty();
  };

  const removeEquipment = (idx) => {
    onUpdate(selectedEquipmentList.filter((_, i) => i !== idx));
    markDirty();
  };

  const updateEntry = (idx, updated) => {
    const arr = [...selectedEquipmentList];
    arr[idx] = updated;
    onUpdate(arr);
    markDirty();
  };

  const totalEquipmentCost = selectedEquipmentList.reduce((sum, entry) => {
    const eq = inventory.find(i => i.id === entry.equipment_id);
    if (!eq) return sum;
    const rentalPeriod = entry.rental_period || 'day';
    const rentalDuration = entry.rental_duration || 1;
    
    const getRentalCost = (item) => {
      if (rentalPeriod === 'day') return (item.cost_per_day || 0) * rentalDuration;
      if (rentalPeriod === 'week') return (item.cost_per_week || 0) * rentalDuration;
      if (rentalPeriod === 'month') return (item.cost_per_month || 0) * rentalDuration;
      return 0;
    };
    
    const base = getRentalCost(eq);
    const delivery = entry.include_delivery ? (eq.pickup_delivery_cost || 0) : 0;
    
    // Att cost
    let attCost = 0;
    if (entry.attachment_counts) {
        Object.entries(entry.attachment_counts).forEach(([id, qty]) => {
            const a = allAttachments.find(att => att.id === id);
            if (a) attCost += getRentalCost(a) * qty;
        });
    } else if (entry.attachment_ids) {
        // legacy
        attCost = allAttachments.filter(a => entry.attachment_ids.includes(a.id)).reduce((s, a) => s + getRentalCost(a), 0);
    }
    
    // Sub-att cost
    let subAttCost = 0;
    if (entry.sub_attachment_counts) {
        Object.entries(entry.sub_attachment_counts).forEach(([id, qty]) => {
            const s = allSubAttachments.find(sub => sub.id === id);
            if (s) subAttCost += getRentalCost(s) * qty;
        });
    }

    return sum + base + delivery + attCost + subAttCost;
  }, 0);

  return (
    <div className="space-y-4">
      {/* Options and Add equipment */}
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
            <div className="flex-1 min-w-[260px]">
              <Label className="text-xs font-semibold text-indigo-900 uppercase tracking-wide">Add Excavation Equipment</Label>
              <Select value="" onValueChange={addEquipment}>
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="Select excavation equipment to add…" />
                </SelectTrigger>
                <SelectContent>
                  {filteredExcavationEquipment.length === 0 ? (
                    <SelectItem value="_none" disabled>No excavation equipment available</SelectItem>
                  ) : (
                    filteredExcavationEquipment.map(eq => (
                      <SelectItem key={eq.id} value={eq.id}>
                        <div className="flex flex-col py-1">
                          <span className="font-medium">{eq.material_name}</span>
                          {eq.notes && (
                            <span className="text-xs text-slate-500 whitespace-normal max-w-[450px] mt-0.5">{eq.notes}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[260px]">
              <Label className="text-xs font-semibold text-indigo-900 uppercase tracking-wide">Add Non-Excavation Equipment</Label>
              <Select value="" onValueChange={addEquipment}>
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue placeholder="Select non-excavation equipment to add…" />
                </SelectTrigger>
                <SelectContent>
                  {filteredNonExcavationEquipment.length === 0 ? (
                    <SelectItem value="_none" disabled>No non-excavation equipment available</SelectItem>
                  ) : (
                    filteredNonExcavationEquipment.map(eq => (
                      <SelectItem key={eq.id} value={eq.id}>
                        <div className="flex flex-col py-1">
                          <span className="font-medium">{eq.material_name}</span>
                          {eq.notes && (
                            <span className="text-xs text-slate-500 whitespace-normal max-w-[450px] mt-0.5">{eq.notes}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Equipment list */}
      {selectedEquipmentList.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-slate-400">
            <div className="text-4xl mb-2">🚜</div>
            <p className="font-medium">No equipment added yet</p>
            <p className="text-sm mt-1">Select equipment from the dropdown above.</p>
          </CardContent>
        </Card>
      )}

      {selectedEquipmentList.map((entry, idx) => {
        const eq = inventory.find(i => i.id === entry.equipment_id);
        if (!eq) return null;
        return (
          <EquipmentCard
            key={entry._id || idx}
            equipment={eq}
            selectedEquipment={entry}
            onUpdate={(updated) => updateEntry(idx, updated)}
            onRemove={() => removeEquipment(idx)}
            allAttachments={allAttachments}
            allSubAttachments={allSubAttachments}
            showMiscAttachments={showMiscAttachments}
          />
        );
      })}

      {selectedEquipmentList.length > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="py-3 px-4 flex items-center justify-between">
            <span className="font-medium text-amber-800">Total Equipment Cost</span>
            <span className="text-lg font-bold text-amber-700">${totalEquipmentCost.toFixed(2)}</span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}