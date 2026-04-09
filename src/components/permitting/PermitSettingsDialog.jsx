import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Plus, Trash2, Pencil, Save, X, GripVertical, Phone, Mail, Globe, MapPin } from "lucide-react";

const PermitLocality = base44.entities.PermitLocality;
const GlobalSettings = base44.entities.GlobalSettings;

export default function PermitSettingsDialog({ isOpen, onClose, localities: initialLocalities, officeTypes: initialOfficeTypes }) {
  const [activeTab, setActiveTab] = useState("localities");
  const [localities, setLocalities] = useState(initialLocalities || []);
  const [officeTypes, setOfficeTypes] = useState(initialOfficeTypes || []);
  const [selectedLocality, setSelectedLocality] = useState(null);
  const [editingLocality, setEditingLocality] = useState(null);
  const [newOfficeType, setNewOfficeType] = useState("");

  // Locality form
  const [form, setForm] = useState({
    name: "", governing_body: "", office_type: "", state: "",
    contact_phone: "", contact_email: "", contact_website: "", contact_address: "",
    contact_department: "", contact_notes: "", categories: [], workflow_steps: []
  });

  const [newStepName, setNewStepName] = useState("");
  const [newStepType, setNewStepType] = useState("checkbox");

  const loadLocalities = async () => {
    const data = await PermitLocality.list();
    setLocalities(data);
  };

  const selectLocality = (loc) => {
    setSelectedLocality(loc.id);
    setEditingLocality(loc.id);
    setForm({
      name: loc.name || "",
      governing_body: loc.governing_body || "",
      office_type: loc.office_type || "",
      state: loc.state || "",
      contact_phone: loc.contact_phone || "",
      contact_email: loc.contact_email || "",
      contact_website: loc.contact_website || "",
      contact_address: loc.contact_address || "",
      contact_department: loc.contact_department || "",
      contact_notes: loc.contact_notes || "",
      categories: loc.categories || [],
      workflow_steps: loc.workflow_steps || []
    });
  };

  const newLocality = () => {
    setSelectedLocality(null);
    setEditingLocality("new");
    setForm({
      name: "", governing_body: "", office_type: "", state: "",
      contact_phone: "", contact_email: "", contact_website: "", contact_address: "",
      contact_department: "", contact_notes: "", categories: [], workflow_steps: []
    });
  };

  const saveLocality = async () => {
    if (!form.name.trim()) return;
    if (editingLocality === "new") {
      const created = await PermitLocality.create(form);
      setLocalities(prev => [...prev, created]);
      setSelectedLocality(created.id);
      setEditingLocality(created.id);
    } else {
      await PermitLocality.update(editingLocality, form);
      setLocalities(prev => prev.map(l => l.id === editingLocality ? { ...l, ...form } : l));
    }
  };

  const deleteLocality = async (id) => {
    if (!confirm("Delete this locality?")) return;
    await PermitLocality.delete(id);
    setLocalities(prev => prev.filter(l => l.id !== id));
    if (selectedLocality === id) {
      setSelectedLocality(null);
      setEditingLocality(null);
    }
  };

  const addStep = () => {
    if (!newStepName.trim()) return;
    const step = {
      id: Date.now().toString(),
      name: newStepName.trim(),
      type: newStepType,
      followup_interval_days: newStepType === 'followup_date' ? 14 : undefined,
      order: form.workflow_steps.length
    };
    setForm(prev => ({ ...prev, workflow_steps: [...prev.workflow_steps, step] }));
    setNewStepName("");
  };

  const removeStep = (stepId) => {
    setForm(prev => ({ ...prev, workflow_steps: prev.workflow_steps.filter(s => s.id !== stepId) }));
  };

  const handleStepDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(form.workflow_steps);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    setForm(prev => ({ ...prev, workflow_steps: reordered.map((s, i) => ({ ...s, order: i })) }));
  };

  const toggleCategory = (cat) => {
    setForm(prev => ({
      ...prev,
      categories: prev.categories.includes(cat) ? prev.categories.filter(c => c !== cat) : [...prev.categories, cat]
    }));
  };

  // Office Types
  const saveOfficeTypes = async (types) => {
    setOfficeTypes(types);
    const settings = await GlobalSettings.filter({ setting_key: 'permitOfficeTypes' });
    if (settings.length > 0) await GlobalSettings.update(settings[0].id, { setting_value: { items: types } });
    else await GlobalSettings.create({ setting_key: 'permitOfficeTypes', setting_value: { items: types } });
  };

  const addOfficeType = () => {
    if (!newOfficeType.trim() || officeTypes.includes(newOfficeType.trim())) return;
    saveOfficeTypes([...officeTypes, newOfficeType.trim()]);
    setNewOfficeType("");
  };

  const stepTypeLabels = {
    checkbox: '☑ Checkbox',
    submitted_date: '📅 Submitted Date',
    followup_date: '🔔 Follow-up Date',
    permit_received_date: '✅ Permit Received',
    text: '📝 Text'
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-5xl max-h-[85vh] overflow-hidden flex flex-col [&>button]:hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Permitting Settings</DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2 bg-gray-200 h-9">
            <TabsTrigger value="localities" className="text-sm">Locality Manager</TabsTrigger>
            <TabsTrigger value="categories" className="text-sm">Office Types</TabsTrigger>
          </TabsList>

          {/* Localities */}
          <TabsContent value="localities" className="flex-1 overflow-hidden" style={{ marginTop: 0 }}>
            <div className="grid grid-cols-[220px_1fr] gap-4 h-full pt-3">
              {/* Locality List */}
              <div className="flex flex-col">
                <Button onClick={newLocality} size="sm" className="w-full mb-2 bg-purple-600 hover:bg-purple-700 gap-1">
                  <Plus className="w-3 h-3" /> New Locality
                </Button>
                <div className="flex-1 overflow-y-auto space-y-1">
                  {localities.map(loc => (
                    <div
                      key={loc.id}
                      onClick={() => selectLocality(loc)}
                      className={`p-2 rounded border cursor-pointer text-sm ${selectedLocality === loc.id ? 'bg-purple-100 border-purple-300' : 'bg-white hover:bg-gray-50'}`}
                    >
                      <div className="font-medium text-xs truncate">{loc.name}</div>
                      <div className="text-[10px] text-gray-500">{loc.state || ''} · {loc.workflow_steps?.length || 0} steps</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Locality Editor */}
              <div className="overflow-y-auto bg-gray-50 border rounded-lg p-4">
                {editingLocality ? (
                  <div className="space-y-4">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Locality Name *</Label>
                        <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">State</Label>
                        <Input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} className="h-8 text-sm" placeholder="e.g. KY" />
                      </div>
                      <div>
                        <Label className="text-xs">Governing Body</Label>
                        <Input value={form.governing_body} onChange={e => setForm(f => ({ ...f, governing_body: e.target.value }))} className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Default Office Type</Label>
                        <Select value={form.office_type} onValueChange={v => setForm(f => ({ ...f, office_type: v }))}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            {officeTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="border-t pt-3">
                      <h4 className="text-sm font-semibold mb-2">Contact Information</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Department</Label>
                          <Input value={form.contact_department} onChange={e => setForm(f => ({ ...f, contact_department: e.target.value }))} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Phone</Label>
                          <Input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Email</Label>
                          <Input value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Website</Label>
                          <Input value={form.contact_website} onChange={e => setForm(f => ({ ...f, contact_website: e.target.value }))} className="h-8 text-sm" />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">Address</Label>
                          <Input value={form.contact_address} onChange={e => setForm(f => ({ ...f, contact_address: e.target.value }))} className="h-8 text-sm" />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">Notes</Label>
                          <Input value={form.contact_notes} onChange={e => setForm(f => ({ ...f, contact_notes: e.target.value }))} className="h-8 text-sm" />
                        </div>
                      </div>
                    </div>

                    {/* Categories */}
                    <div className="border-t pt-3">
                      <h4 className="text-sm font-semibold mb-2">Categories</h4>
                      <div className="flex flex-wrap gap-2">
                        {officeTypes.map(cat => (
                          <button
                            key={cat}
                            onClick={() => toggleCategory(cat)}
                            className={`text-xs px-2 py-1 rounded border ${form.categories.includes(cat) ? 'bg-purple-100 border-purple-400 font-medium' : 'bg-white border-gray-300 hover:border-purple-300'}`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Workflow Steps */}
                    <div className="border-t pt-3">
                      <h4 className="text-sm font-semibold mb-2">Workflow Steps (applied when locality is selected)</h4>
                      <div className="flex gap-2 mb-3">
                        <Input value={newStepName} onChange={e => setNewStepName(e.target.value)} placeholder="Step name..." className="h-8 text-sm flex-1"
                          onKeyDown={e => e.key === 'Enter' && addStep()} />
                        <Select value={newStepType} onValueChange={setNewStepType}>
                          <SelectTrigger className="h-8 text-sm w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="checkbox">☑ Checkbox</SelectItem>
                            <SelectItem value="submitted_date">📅 Submitted Date</SelectItem>
                            <SelectItem value="followup_date">🔔 Follow-up Date</SelectItem>
                            <SelectItem value="permit_received_date">✅ Permit Received</SelectItem>
                            <SelectItem value="text">📝 Text</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button onClick={addStep} size="sm" className="h-8"><Plus className="w-3 h-3" /></Button>
                      </div>

                      <DragDropContext onDragEnd={handleStepDragEnd}>
                        <Droppable droppableId="steps">
                          {(provided) => (
                            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1 max-h-52 overflow-y-auto">
                              {form.workflow_steps.map((step, idx) => (
                                <Draggable key={step.id} draggableId={step.id} index={idx}>
                                  {(provided) => (
                                    <div ref={provided.innerRef} {...provided.draggableProps}
                                      className="flex items-center gap-2 p-2 bg-white border rounded text-sm">
                                      <div {...provided.dragHandleProps}><GripVertical className="w-3 h-3 text-gray-400 cursor-grab" /></div>
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{stepTypeLabels[step.type] || step.type}</span>
                                      <span className="flex-1 font-medium text-xs">{step.name}</span>
                                      {step.type === 'followup_date' && (
                                        <div className="flex items-center gap-1">
                                          <Input
                                            type="number"
                                            value={step.followup_interval_days || 14}
                                            onChange={e => {
                                              const val = parseInt(e.target.value) || 14;
                                              setForm(prev => ({
                                                ...prev,
                                                workflow_steps: prev.workflow_steps.map(s => s.id === step.id ? { ...s, followup_interval_days: val } : s)
                                              }));
                                            }}
                                            className="h-6 w-14 text-xs"
                                          />
                                          <span className="text-[10px] text-gray-500">days</span>
                                        </div>
                                      )}
                                      <button onClick={() => removeStep(step.id)} className="p-0.5 hover:bg-red-50 rounded">
                                        <Trash2 className="w-3 h-3 text-red-500" />
                                      </button>
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </DragDropContext>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-3 border-t">
                      <Button onClick={saveLocality} className="bg-purple-600 hover:bg-purple-700 gap-1">
                        <Save className="w-4 h-4" /> Save Locality
                      </Button>
                      {editingLocality !== "new" && (
                        <Button variant="destructive" onClick={() => deleteLocality(editingLocality)}>
                          <Trash2 className="w-4 h-4 mr-1" /> Delete
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                    Select a locality or create a new one
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Office Types */}
          <TabsContent value="categories" className="flex-1 overflow-y-auto p-3" style={{ marginTop: 0 }}>
            <div className="max-w-lg">
              <h3 className="font-semibold text-sm mb-3">Office / Category Types</h3>
              <p className="text-xs text-gray-500 mb-4">These types can be assigned to localities and permit line items.</p>

              <div className="flex gap-2 mb-4">
                <Input value={newOfficeType} onChange={e => setNewOfficeType(e.target.value)} placeholder="New type..." className="h-8 text-sm"
                  onKeyDown={e => e.key === 'Enter' && addOfficeType()} />
                <Button size="sm" onClick={addOfficeType} className="h-8"><Plus className="w-3 h-3 mr-1" /> Add</Button>
              </div>

              <div className="space-y-1">
                {officeTypes.map((type, idx) => (
                  <div key={type} className="flex items-center gap-2 p-2 bg-white border rounded text-sm">
                    <span className="flex-1 font-medium">{type}</span>
                    <button
                      onClick={() => saveOfficeTypes(officeTypes.filter((_, i) => i !== idx))}
                      className="p-1 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}