import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Plus, Trash2, GripVertical, Search, ChevronDown, ChevronRight } from "lucide-react";

const stepTypeLabels = {
  checkbox: '☑ Checkbox',
  submitted_date: '📅 Submitted Date',
  followup_date: '🔔 Follow-up Date',
  permit_received_date: '✅ Permit Received',
  text: '📝 Text'
};

const ADDON_DEFS = [
  { key: 'has_checkbox', label: '☑ Checkbox', color: 'bg-green-50 border-green-300 text-green-700' },
  { key: 'has_followup', label: '🔔 Follow-up', color: 'bg-amber-50 border-amber-300 text-amber-700' },
  { key: 'has_text', label: '📝 Text', color: 'bg-blue-50 border-blue-300 text-blue-700' },
];

function OfficeEditor({ office, officeTypes, onChange, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [newStepName, setNewStepName] = useState("");
  const [newStepType, setNewStepType] = useState("checkbox");

  const update = (patch) => onChange({ ...office, ...patch });

  const addStep = () => {
    if (!newStepName.trim()) return;
    const step = {
      id: `${Date.now()}-${Math.random()}`,
      name: newStepName.trim(),
      type: newStepType,
      followup_interval_days: newStepType === 'followup_date' ? 14 : undefined,
      order: (office.workflow_steps || []).length
    };
    update({ workflow_steps: [...(office.workflow_steps || []), step] });
    setNewStepName("");
  };

  const removeStep = (stepId) => {
    update({ workflow_steps: (office.workflow_steps || []).filter(s => s.id !== stepId) });
  };

  const handleStepDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(office.workflow_steps || []);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    update({ workflow_steps: reordered.map((s, i) => ({ ...s, order: i })) });
  };

  const updateStepField = (stepId, field, value) => {
    update({
      workflow_steps: (office.workflow_steps || []).map(s =>
        s.id === stepId ? { ...s, [field]: value } : s
      )
    });
  };

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-50 to-white border-b">
        <button onClick={() => setExpanded(!expanded)} className="p-0.5">
          {expanded ? <ChevronDown className="w-4 h-4 text-purple-600" /> : <ChevronRight className="w-4 h-4 text-purple-600" />}
        </button>
        <Input
          value={office.name || ""}
          onChange={e => update({ name: e.target.value })}
          placeholder="Office name (e.g. Hamilton County Zoning)"
          className="h-7 text-sm font-semibold flex-1 border-none shadow-none bg-transparent focus:bg-white"
        />
        <Select value={office.office_type || ""} onValueChange={v => update({ office_type: v })}>
          <SelectTrigger className="h-7 text-xs w-40">
            <SelectValue placeholder="Office type..." />
          </SelectTrigger>
          <SelectContent>
            {officeTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-[10px] text-gray-400">{(office.workflow_steps || []).length} steps</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDelete} title="Delete office">
          <Trash2 className="w-3 h-3 text-red-500" />
        </Button>
      </div>

      {expanded && (
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-gray-500">Phone</Label>
              <Input value={office.contact_phone || ""} onChange={e => update({ contact_phone: e.target.value })} className="h-7 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] text-gray-500">Email</Label>
              <Input value={office.contact_email || ""} onChange={e => update({ contact_email: e.target.value })} className="h-7 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] text-gray-500">Website</Label>
              <Input value={office.contact_website || ""} onChange={e => update({ contact_website: e.target.value })} className="h-7 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] text-gray-500">Address</Label>
              <Input value={office.contact_address || ""} onChange={e => update({ contact_address: e.target.value })} className="h-7 text-xs" />
            </div>
            <div className="col-span-2">
              <Label className="text-[10px] text-gray-500">Notes</Label>
              <Input value={office.contact_notes || ""} onChange={e => update({ contact_notes: e.target.value })} className="h-7 text-xs" />
            </div>
          </div>

          <div className="border-t pt-2">
            <h5 className="text-xs font-semibold mb-2">Workflow Steps</h5>
            <div className="flex gap-2 mb-2">
              <Input
                value={newStepName}
                onChange={e => setNewStepName(e.target.value)}
                placeholder="Step name..."
                className="h-7 text-xs flex-1"
                onKeyDown={e => e.key === 'Enter' && addStep()}
              />
              <Select value={newStepType} onValueChange={setNewStepType}>
                <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="checkbox">☑ Checkbox</SelectItem>
                  <SelectItem value="submitted_date">📅 Submitted Date</SelectItem>
                  <SelectItem value="followup_date">🔔 Follow-up Date</SelectItem>
                  <SelectItem value="permit_received_date">✅ Permit Received</SelectItem>
                  <SelectItem value="text">📝 Text</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={addStep} size="sm" className="h-7"><Plus className="w-3 h-3" /></Button>
            </div>

            <DragDropContext onDragEnd={handleStepDragEnd}>
              <Droppable droppableId={`steps-${office.id}`}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                    {(office.workflow_steps || []).map((step, idx) => (
                      <Draggable key={step.id} draggableId={step.id} index={idx}>
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.draggableProps}
                            className="p-1.5 bg-gray-50 border rounded text-xs space-y-1.5">
                            <div className="flex items-center gap-2">
                              <div {...provided.dragHandleProps}><GripVertical className="w-3 h-3 text-gray-400 cursor-grab" /></div>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{stepTypeLabels[step.type] || step.type}</span>
                              <span className="flex-1 font-medium">{step.name}</span>
                              {step.type === 'followup_date' && (
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    value={step.followup_interval_days || 14}
                                    onChange={e => updateStepField(step.id, 'followup_interval_days', parseInt(e.target.value) || 14)}
                                    className="h-5 w-12 text-xs"
                                  />
                                  <span className="text-[9px] text-gray-500">days</span>
                                </div>
                              )}
                              <button onClick={() => removeStep(step.id)} className="p-0.5 hover:bg-red-50 rounded">
                                <Trash2 className="w-3 h-3 text-red-500" />
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 pl-5">
                              <span className="text-[9px] text-gray-400 uppercase tracking-wide">Tie:</span>
                              {ADDON_DEFS.map(addon => {
                                const enabled = !!step[addon.key];
                                return (
                                  <label
                                    key={addon.key}
                                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${enabled ? addon.color : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                                  >
                                    <Checkbox
                                      checked={enabled}
                                      onCheckedChange={(v) => updateStepField(step.id, addon.key, !!v)}
                                      className="h-3 w-3"
                                    />
                                    <span className="text-[10px] font-medium">{addon.label}</span>
                                  </label>
                                );
                              })}
                              {step.has_followup && (
                                <div className="flex items-center gap-1 ml-1">
                                  <span className="text-[9px] text-gray-500">every</span>
                                  <Input
                                    type="number"
                                    value={step.followup_interval_days || 14}
                                    onChange={e => updateStepField(step.id, 'followup_interval_days', parseInt(e.target.value) || 14)}
                                    className="h-5 w-12 text-xs"
                                  />
                                  <span className="text-[9px] text-gray-500">days</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {(office.workflow_steps || []).length === 0 && (
                      <p className="text-[11px] text-gray-400 text-center py-2">No steps yet — add some above</p>
                    )}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Full Office Catalog manager — offices with workflow steps, contact info, etc.
 * These are reusable offices that can be added to any locality.
 */
export default function OfficeCatalogEditor({ catalog, officeTypes, onChange }) {
  const [search, setSearch] = useState("");

  const addBlank = () => {
    const newOffice = {
      id: `${Date.now()}-${Math.random()}`,
      name: "",
      office_type: "",
      workflow_steps: [],
    };
    onChange([newOffice, ...catalog]);
  };

  const updateOffice = (officeId, updated) => {
    onChange(catalog.map(o => o.id === officeId ? updated : o));
  };

  const deleteOffice = (officeId) => {
    if (!confirm("Delete this office from the catalog?")) return;
    onChange(catalog.filter(o => o.id !== officeId));
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return catalog;
    const q = search.toLowerCase();
    return catalog.filter(o =>
      (o.name || "").toLowerCase().includes(q) ||
      (o.office_type || "").toLowerCase().includes(q)
    );
  }, [catalog, search]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search offices..."
            className="h-8 text-sm pl-8"
          />
        </div>
        <Button size="sm" onClick={addBlank} className="h-8 gap-1 bg-purple-600 hover:bg-purple-700">
          <Plus className="w-3 h-3" /> New Office
        </Button>
      </div>

      <p className="text-[11px] text-gray-500">
        These are the full offices with workflow steps. You can add them to a locality from the Locality Editor.
      </p>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="p-6 bg-white border border-dashed rounded text-center text-xs text-gray-400">
            {catalog.length === 0 ? 'No offices in catalog yet. Click "New Office" to create one.' : 'No offices match your search.'}
          </div>
        )}
        {filtered.map(office => (
          <OfficeEditor
            key={office.id}
            office={office}
            officeTypes={officeTypes}
            onChange={(updated) => updateOffice(office.id, updated)}
            onDelete={() => deleteOffice(office.id)}
          />
        ))}
      </div>
    </div>
  );
}