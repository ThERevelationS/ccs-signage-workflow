import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Save, X } from "lucide-react";
import LocalityOfficeEditor from "./LocalityOfficeEditor";

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
    name: "", governing_body: "", state: "",
    contact_phone: "", contact_email: "", contact_website: "", contact_address: "",
    contact_department: "", contact_notes: "",
    offices: []
  });

  // Migrate legacy workflow_steps → offices[] if needed
  const migrateLocality = (loc) => {
    const offices = loc.offices && loc.offices.length > 0
      ? loc.offices
      : (loc.workflow_steps && loc.workflow_steps.length > 0)
        ? [{
            id: `migrated-${loc.id}`,
            name: loc.office_type || "Default Office",
            office_type: loc.office_type || "",
            workflow_steps: loc.workflow_steps,
            order: 0
          }]
        : [];
    return offices;
  };

  const selectLocality = (loc) => {
    setSelectedLocality(loc.id);
    setEditingLocality(loc.id);
    setForm({
      name: loc.name || "",
      governing_body: loc.governing_body || "",
      state: loc.state || "",
      contact_phone: loc.contact_phone || "",
      contact_email: loc.contact_email || "",
      contact_website: loc.contact_website || "",
      contact_address: loc.contact_address || "",
      contact_department: loc.contact_department || "",
      contact_notes: loc.contact_notes || "",
      offices: migrateLocality(loc)
    });
  };

  const newLocality = () => {
    setSelectedLocality(null);
    setEditingLocality("new");
    setForm({
      name: "", governing_body: "", state: "",
      contact_phone: "", contact_email: "", contact_website: "", contact_address: "",
      contact_department: "", contact_notes: "",
      offices: []
    });
  };

  const saveLocality = async () => {
    if (!form.name.trim()) return;
    // Strip legacy fields
    const payload = { ...form };
    if (editingLocality === "new") {
      const created = await PermitLocality.create(payload);
      setLocalities(prev => [...prev, created]);
      setSelectedLocality(created.id);
      setEditingLocality(created.id);
    } else {
      await PermitLocality.update(editingLocality, payload);
      setLocalities(prev => prev.map(l => l.id === editingLocality ? { ...l, ...payload } : l));
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

  // Add an office to the locality from the catalog
  const addOfficeFromCatalog = (officeType) => {
    const newOffice = {
      id: `${Date.now()}-${Math.random()}`,
      name: officeType,
      office_type: officeType,
      workflow_steps: [],
      order: form.offices.length
    };
    setForm(prev => ({ ...prev, offices: [...prev.offices, newOffice] }));
  };

  const addBlankOffice = () => {
    const newOffice = {
      id: `${Date.now()}-${Math.random()}`,
      name: "",
      office_type: "",
      workflow_steps: [],
      order: form.offices.length
    };
    setForm(prev => ({ ...prev, offices: [...prev.offices, newOffice] }));
  };

  const updateOffice = (officeId, updated) => {
    setForm(prev => ({
      ...prev,
      offices: prev.offices.map(o => o.id === officeId ? updated : o)
    }));
  };

  const deleteOffice = (officeId) => {
    if (!confirm("Delete this office?")) return;
    setForm(prev => ({ ...prev, offices: prev.offices.filter(o => o.id !== officeId) }));
  };

  // Office Type Catalog
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-6xl max-h-[90vh] overflow-hidden flex flex-col [&>button]:hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Permitting Settings</DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2 bg-gray-200 h-9">
            <TabsTrigger value="localities" className="text-sm">Locality Manager</TabsTrigger>
            <TabsTrigger value="catalog" className="text-sm">Office Catalog</TabsTrigger>
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
                      <div className="text-[10px] text-gray-500">
                        {loc.state || ''} · {(loc.offices?.length || (loc.workflow_steps?.length > 0 ? 1 : 0))} office{(loc.offices?.length || 0) === 1 ? '' : 's'}
                      </div>
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
                      <div className="col-span-2">
                        <Label className="text-xs">Governing Body</Label>
                        <Input value={form.governing_body} onChange={e => setForm(f => ({ ...f, governing_body: e.target.value }))} className="h-8 text-sm" />
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="border-t pt-3">
                      <h4 className="text-sm font-semibold mb-2">Locality Contact Information</h4>
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
                      </div>
                    </div>

                    {/* Offices */}
                    <div className="border-t pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="text-sm font-semibold">Offices</h4>
                          <p className="text-[11px] text-gray-500">Each office becomes a separate line when this locality is selected on a work order.</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={addBlankOffice} className="h-7 text-xs gap-1">
                          <Plus className="w-3 h-3" /> Blank Office
                        </Button>
                      </div>

                      {/* Office catalog - click to add */}
                      {officeTypes.length > 0 && (
                        <div className="mb-3 p-2 bg-white border border-dashed rounded">
                          <p className="text-[10px] text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Add from catalog:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {officeTypes.map(type => (
                              <button
                                key={type}
                                onClick={() => addOfficeFromCatalog(type)}
                                className="text-xs px-2 py-1 rounded bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 transition-colors flex items-center gap-1"
                              >
                                <Plus className="w-2.5 h-2.5" /> {type}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Office list */}
                      <div className="space-y-2">
                        {form.offices.length === 0 && (
                          <div className="p-4 bg-white border border-dashed rounded text-center text-xs text-gray-400">
                            No offices added yet. Click a type from the catalog above to add one.
                          </div>
                        )}
                        {form.offices.map(office => (
                          <LocalityOfficeEditor
                            key={office.id}
                            office={office}
                            officeTypes={officeTypes}
                            onChange={(updated) => updateOffice(office.id, updated)}
                            onDelete={() => deleteOffice(office.id)}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-3 border-t sticky bottom-0 bg-gray-50">
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

          {/* Office Catalog */}
          <TabsContent value="catalog" className="flex-1 overflow-y-auto p-3" style={{ marginTop: 0 }}>
            <div className="max-w-lg">
              <h3 className="font-semibold text-sm mb-1">Office Catalog</h3>
              <p className="text-xs text-gray-500 mb-4">Define office types (e.g. Zoning, Building, Electrical). You can then click these types from the Locality Editor to quickly add offices to a locality.</p>

              <div className="flex gap-2 mb-4">
                <Input value={newOfficeType} onChange={e => setNewOfficeType(e.target.value)} placeholder="New office type..." className="h-8 text-sm"
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