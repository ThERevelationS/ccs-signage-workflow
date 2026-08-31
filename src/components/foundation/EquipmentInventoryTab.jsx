import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Edit, Plus, Wrench, Link2, Settings2, GripVertical } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const FoundationInventoryEntity = base44.entities.FoundationInventory;

// MultiSelect dropdown component for linking items
function MultiSelectDropdown({ label, options, selectedIds, onChange }) {
  const toggle = (id) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter(i => i !== id));
    else onChange([...selectedIds, id]);
  };
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="border rounded-md p-2 space-y-1 max-h-40 overflow-y-auto bg-slate-50">
        {options.length === 0 ? <p className="text-xs text-slate-400 italic">No items available</p> : null}
        {options.map(opt => (
          <div key={opt.id} className="flex items-center gap-2">
            <Checkbox 
                id={`ms-${opt.id}`} 
                checked={selectedIds.includes(opt.id)} 
                onCheckedChange={() => toggle(opt.id)} 
            />
            <Label htmlFor={`ms-${opt.id}`} className="text-xs cursor-pointer">{opt.material_name}</Label>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EquipmentInventoryTab({ allItems, loadItems, isAdmin }) {
  const [activeSubTab, setActiveSubTab] = useState('excavation_equipment');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const equipment = allItems.filter(i => i.material_type === 'excavation_equipment');
  const attachments = allItems.filter(i => i.material_type === 'attachment');
  const subAttachments = allItems.filter(i => i.material_type === 'sub_attachment');

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this item?')) return;
    await FoundationInventoryEntity.delete(id);
    loadItems();
  };

  const handleDragEnd = async (result, type) => {
    if (!result.destination) return;
    
    const itemsList = 
        type === 'excavation_equipment' ? equipment :
        type === 'attachment' ? attachments : subAttachments;
        
    const sorted = [...itemsList].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    
    const [reorderedItem] = sorted.splice(result.source.index, 1);
    sorted.splice(result.destination.index, 0, reorderedItem);

    const updates = sorted.map((item, index) => {
        if (item.sort_order !== index) {
            return FoundationInventoryEntity.update(item.id, { sort_order: index });
        }
        return null;
    }).filter(Boolean);

    if (updates.length > 0) {
        await Promise.all(updates);
        loadItems();
    }
  };

  const openAdd = (type) => {
      setEditItem({ material_type: type, material_name: '', cost_per_day: 0, cost_per_week: 0, cost_per_month: 0, pickup_delivery_cost: 0, allow_multiple: false, compatible_attachment_ids: [], compatible_sub_attachment_ids: [], is_pillar_excavation: false, is_spread_foot_excavation: false, is_non_excavation_equipment: false, is_miscellaneous_attachment: false, sort_order: 0 });
      setShowForm(true);
  };

  const openEdit = (item) => {
    setEditItem({ ...item, compatible_attachment_ids: item.compatible_attachment_ids || [], compatible_sub_attachment_ids: item.compatible_sub_attachment_ids || [] });
    setShowForm(true);
  };

  return (
    <div className="space-y-4 mt-4 border rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-slate-600">Manage excavation equipment, attachments, and sub-attachments. Link them together to create a dependency tree.</p>
        {isAdmin && (
          <Button size="sm" onClick={() => openAdd(activeSubTab)}>
              <Plus className="w-4 h-4 mr-1" /> Add New
          </Button>
        )}
      </div>

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="excavation_equipment"><Wrench className="w-3.5 h-3.5 mr-1" /> Equipment</TabsTrigger>
          <TabsTrigger value="attachment"><Link2 className="w-3.5 h-3.5 mr-1" /> Attachments</TabsTrigger>
          <TabsTrigger value="sub_attachment"><Settings2 className="w-3.5 h-3.5 mr-1" /> Sub-Attachments</TabsTrigger>
        </TabsList>

        <TabsContent value="excavation_equipment">
            <EquipmentList items={equipment} attachments={attachments} onEdit={openEdit} onDelete={handleDelete} onDragEnd={(res) => handleDragEnd(res, 'excavation_equipment')} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="attachment">
            <EquipmentList items={attachments} subAttachments={subAttachments} equipment={equipment} onEdit={openEdit} onDelete={handleDelete} isAttachment onDragEnd={(res) => handleDragEnd(res, 'attachment')} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="sub_attachment">
            <EquipmentList items={subAttachments} attachments={attachments} onEdit={openEdit} onDelete={handleDelete} isSubAttachment onDragEnd={(res) => handleDragEnd(res, 'sub_attachment')} isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editItem?.id ? 'Edit' : 'Add'} Item</DialogTitle></DialogHeader>
            {editItem && (
                <EquipmentForm 
                    item={editItem} 
                    equipment={equipment} 
                    attachments={attachments} 
                    subAttachments={subAttachments} 
                    onSave={async (data) => {
                        if (data.id) await FoundationInventoryEntity.update(data.id, data);
                        else await FoundationInventoryEntity.create(data);
                        setShowForm(false);
                        loadItems();
                    }}
                    onCancel={() => setShowForm(false)}
                />
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EquipmentList({ items, equipment = [], attachments = [], subAttachments = [], onEdit, onDelete, isAttachment, isSubAttachment, onDragEnd, isAdmin }) {
    if (items.length === 0) return <div className="text-center py-8 text-slate-400 text-sm italic border rounded bg-slate-50">No items found in this category.</div>;
    
    const sortedItems = [...items].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="equipment-list">
                {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                        {sortedItems.map((item, index) => (
                            <Draggable key={item.id} draggableId={item.id} index={index}>
                                {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        className={snapshot.isDragging ? "opacity-90 z-50" : ""}
                                    >
                                        <Card className="hover:shadow-sm">
                                            <CardHeader className="py-3 px-4 flex flex-row items-start justify-between">
                                                <div className="flex items-center gap-3">
                                                    {isAdmin && (
                                                      <div {...provided.dragHandleProps} className="cursor-grab hover:text-indigo-600 text-slate-400">
                                                          <GripVertical className="w-5 h-5" />
                                                      </div>
                                                    )}
                                                    <div>
                                                        <CardTitle className="text-sm">{item.material_name}</CardTitle>
                                                        {item.allow_multiple && <Badge variant="outline" className="text-[10px] mt-1 bg-blue-50 text-blue-700">Allows Multiple</Badge>}
                                                    </div>
                                                </div>
                                                {isAdmin && (
                                                  <div className="flex gap-1">
                                                      <Button size="icon" variant="ghost" onClick={() => onEdit(item)} className="h-6 w-6"><Edit className="w-3 h-3" /></Button>
                                                      <Button size="icon" variant="ghost" onClick={() => onDelete(item.id)} className="h-6 w-6 text-red-500"><Trash2 className="w-3 h-3" /></Button>
                                                  </div>
                                                )}
                                            </CardHeader>
                                            <CardContent className="px-4 pb-3 space-y-2 pl-12">
                                                <div className="flex gap-4 text-xs text-slate-600">
                                                    <div>Day: <span className="font-semibold">${item.cost_per_day || 0}</span></div>
                                                    <div>Wk: <span className="font-semibold">${item.cost_per_week || 0}</span></div>
                                                    <div>Mo: <span className="font-semibold">${item.cost_per_month || 0}</span></div>
                                                </div>
                                                
                                                {/* Show dependencies */}
                                                {!isAttachment && !isSubAttachment && (
                                                    <div className="text-xs text-slate-500">
                                                        <strong>Linked Attachments:</strong> {item.compatible_attachment_ids?.length ? attachments.filter(a => item.compatible_attachment_ids.includes(a.id)).map(a => a.material_name).join(', ') : 'None'}
                                                    </div>
                                                )}
                                                {isAttachment && (
                                                    <div className="text-xs text-slate-500 space-y-1">
                                                        <div><strong>Compatible Equipment:</strong> {equipment.filter(e => e.compatible_attachment_ids?.includes(item.id)).map(e => e.material_name).join(', ') || 'None'}</div>
                                                        <div><strong>Linked Sub-Attachments:</strong> {item.compatible_sub_attachment_ids?.length ? subAttachments.filter(s => item.compatible_sub_attachment_ids.includes(s.id)).map(s => s.material_name).join(', ') : 'None'}</div>
                                                    </div>
                                                )}
                                                {isSubAttachment && (
                                                    <div className="text-xs text-slate-500">
                                                        <strong>Compatible Attachments:</strong> {attachments.filter(a => a.compatible_sub_attachment_ids?.includes(item.id)).map(a => a.material_name).join(', ') || 'None'}
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </div>
                                )}
                            </Draggable>
                        ))}
                        {provided.placeholder}
                    </div>
                )}
            </Droppable>
        </DragDropContext>
    );
}

function EquipmentForm({ item, equipment, attachments, subAttachments, onSave, onCancel }) {
    const [form, setForm] = useState(item);
    
    // For bidirectional links. If this is an attachment, we can select which equipment it belongs to.
    const [linkedEquipmentIds, setLinkedEquipmentIds] = useState(
        item.material_type === 'attachment' ? equipment.filter(e => e.compatible_attachment_ids?.includes(item.id)).map(e => e.id) : []
    );

    const [linkedAttachmentIdsForSub, setLinkedAttachmentIdsForSub] = useState(
        item.material_type === 'sub_attachment' ? attachments.filter(a => a.compatible_sub_attachment_ids?.includes(item.id)).map(a => a.id) : []
    );

    const update = (f, v) => setForm(prev => ({ ...prev, [f]: v }));

    const handleSave = async () => {
        // We save the main item first.
        // The tricky part: we need to update the parent entities if linked parents changed.
        // We'll pass the complex saving logic up, or do it here. 
        // For simplicity, let's just save the current item, and then issue updates for the parents.
        
        // 1. Save current item
        let savedItem;
        if (form.id) {
            savedItem = await FoundationInventoryEntity.update(form.id, form);
        } else {
            savedItem = await FoundationInventoryEntity.create(form);
        }

        // 2. Bidirectional sync
        if (form.material_type === 'attachment') {
            // Update all equipment to include/exclude this attachment
            for (const eq of equipment) {
                const isSelected = linkedEquipmentIds.includes(eq.id);
                const currentArr = eq.compatible_attachment_ids || [];
                const alreadyHas = currentArr.includes(savedItem.id);
                
                if (isSelected && !alreadyHas) {
                    await FoundationInventoryEntity.update(eq.id, { compatible_attachment_ids: [...currentArr, savedItem.id] });
                } else if (!isSelected && alreadyHas) {
                    await FoundationInventoryEntity.update(eq.id, { compatible_attachment_ids: currentArr.filter(id => id !== savedItem.id) });
                }
            }
        } else if (form.material_type === 'sub_attachment') {
            // Update all attachments to include/exclude this sub_attachment
            for (const att of attachments) {
                const isSelected = linkedAttachmentIdsForSub.includes(att.id);
                const currentArr = att.compatible_sub_attachment_ids || [];
                const alreadyHas = currentArr.includes(savedItem.id);
                
                if (isSelected && !alreadyHas) {
                    await FoundationInventoryEntity.update(att.id, { compatible_sub_attachment_ids: [...currentArr, savedItem.id] });
                } else if (!isSelected && alreadyHas) {
                    await FoundationInventoryEntity.update(att.id, { compatible_sub_attachment_ids: currentArr.filter(id => id !== savedItem.id) });
                }
            }
        }

        onSave(savedItem);
    };

    return (
        <div className="space-y-4">
            <div>
                <Label className="text-xs">Name *</Label>
                <Input className="h-8" value={form.material_name} onChange={e => update('material_name', e.target.value)} />
            </div>

            <div className="grid grid-cols-3 gap-3">
                <div>
                    <Label className="text-xs">Cost/Day</Label>
                    <Input type="number" className="h-8" value={form.cost_per_day} onChange={e => update('cost_per_day', parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                    <Label className="text-xs">Cost/Week</Label>
                    <Input type="number" className="h-8" value={form.cost_per_week} onChange={e => update('cost_per_week', parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                    <Label className="text-xs">Cost/Month</Label>
                    <Input type="number" className="h-8" value={form.cost_per_month} onChange={e => update('cost_per_month', parseFloat(e.target.value) || 0)} />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {form.material_type === 'excavation_equipment' && (
                    <div>
                        <Label className="text-xs">Delivery/Pickup Cost</Label>
                        <Input type="number" className="h-8" value={form.pickup_delivery_cost} onChange={e => update('pickup_delivery_cost', parseFloat(e.target.value) || 0)} />
                    </div>
                )}
            </div>

            <div className="space-y-2 pt-2">
                {form.material_type === 'excavation_equipment' && (
                    <>
                        <div className="flex items-center gap-2">
                            <Checkbox id="is_pillar_excavation" checked={form.is_pillar_excavation} onCheckedChange={v => update('is_pillar_excavation', v)} />
                            <Label htmlFor="is_pillar_excavation" className="text-sm cursor-pointer">Used for Pillar Excavation</Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox id="is_spread_foot_excavation" checked={form.is_spread_foot_excavation} onCheckedChange={v => update('is_spread_foot_excavation', v)} />
                            <Label htmlFor="is_spread_foot_excavation" className="text-sm cursor-pointer">Used for Spread Foot Excavation</Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox id="is_non_excavation_equipment" checked={form.is_non_excavation_equipment} onCheckedChange={v => update('is_non_excavation_equipment', v)} />
                            <Label htmlFor="is_non_excavation_equipment" className="text-sm cursor-pointer">Is Non-Excavation Equipment</Label>
                        </div>
                    </>
                )}

                {form.material_type === 'attachment' && (
                    <div className="flex items-center gap-2">
                        <Checkbox id="is_miscellaneous_attachment" checked={form.is_miscellaneous_attachment} onCheckedChange={v => update('is_miscellaneous_attachment', v)} />
                        <Label htmlFor="is_miscellaneous_attachment" className="text-sm cursor-pointer">Is Miscellaneous Attachment</Label>
                    </div>
                )}

                {(form.material_type === 'attachment' || form.material_type === 'sub_attachment') && (
                    <div className="flex items-center gap-2">
                        <Checkbox id="allow_multiple" checked={form.allow_multiple} onCheckedChange={v => update('allow_multiple', v)} />
                        <Label htmlFor="allow_multiple" className="text-sm cursor-pointer">Allow user to select multiple instances of this item</Label>
                    </div>
                )}
            </div>

            <hr />

            {/* Dependency Linking */}
            {form.material_type === 'excavation_equipment' && (
                <MultiSelectDropdown 
                    label="Select Compatible Attachments" 
                    options={attachments} 
                    selectedIds={form.compatible_attachment_ids || []} 
                    onChange={v => update('compatible_attachment_ids', v)} 
                />
            )}
            
            {form.material_type === 'attachment' && (
                <div className="space-y-4">
                    <MultiSelectDropdown 
                        label="Belongs to Equipment (Reverse Link)" 
                        options={equipment} 
                        selectedIds={linkedEquipmentIds} 
                        onChange={setLinkedEquipmentIds} 
                    />
                    <MultiSelectDropdown 
                        label="Select Compatible Sub-Attachments" 
                        options={subAttachments} 
                        selectedIds={form.compatible_sub_attachment_ids || []} 
                        onChange={v => update('compatible_sub_attachment_ids', v)} 
                    />
                </div>
            )}

            {form.material_type === 'sub_attachment' && (
                <MultiSelectDropdown 
                    label="Belongs to Attachments (Reverse Link)" 
                    options={attachments} 
                    selectedIds={linkedAttachmentIdsForSub} 
                    onChange={setLinkedAttachmentIdsForSub} 
                />
            )}

            <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={!form.material_name}>Save Item</Button>
            </div>
        </div>
    );
}