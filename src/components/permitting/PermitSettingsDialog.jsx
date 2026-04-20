import React, { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Save, X, Search, LogOut, AlertTriangle } from "lucide-react";
import LocalityOfficeEditor from "./LocalityOfficeEditor";
import OfficeCatalogEditor from "./OfficeCatalogEditor";

const PermitLocality = base44.entities.PermitLocality;
const GlobalSettings = base44.entities.GlobalSettings;

export default function PermitSettingsDialog({ isOpen, onClose, localities: initialLocalities, officeTypes: initialOfficeTypes }) {
  const [activeTab, setActiveTab] = useState("localities");
  const [localities, setLocalities] = useState(initialLocalities || []);
  const [officeTypes, setOfficeTypes] = useState(initialOfficeTypes || []);
  const [officeCatalog, setOfficeCatalog] = useState([]);
  const [catalogSettingId, setCatalogSettingId] = useState(null);
  const [selectedLocality, setSelectedLocality] = useState(null);
  const [editingLocality, setEditingLocality] = useState(null);
  const [newOfficeType, setNewOfficeType] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");

  // Load office catalog from GlobalSettings
  useEffect(() => {
    const load = async () => {
      const settings = await GlobalSettings.filter({ setting_key: 'permitOfficeCatalog' });
      if (settings.length > 0) {
        setOfficeCatalog(settings[0].setting_value?.items || []);
        setCatalogSettingId(settings[0].id);
      }
    };
    load();
  }, []);

  const [form, setForm] = useState({
    name: "", governing_body: "", state: "",
    contact_phone: "", contact_email: "", contact_website: "", contact_address: "",
    contact_department: "", contact_notes: "",
    offices: []
  });

  // Unsaved-changes tracking
  const [isDirty, setIsDirty] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  // Snapshot of the form at the last "clean" point (load or save)
  const cleanSnapshot = useRef(null);
  // Also track catalog/officeTypes dirty state via separate booleans
  const [catalogDirty, setCatalogDirty] = useState(false);
  const [typesDirty, setTypesDirty] = useState(false);

  // Compare current form against last snapshot
  useEffect(() => {
    if (!editingLocality || !cleanSnapshot.current) {
      setIsDirty(false);
      return;
    }
    setIsDirty(JSON.stringify(form) !== cleanSnapshot.current);
  }, [form, editingLocality]);

  const anyDirty = isDirty || catalogDirty || typesDirty;

  const migrateLocality = (loc) => {
    return loc.offices && loc.offices.length > 0
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
  };

  const loadFormFromLocality = (loc) => {
    const next = {
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
    };
    setForm(next);
    cleanSnapshot.current = JSON.stringify(next);
    setIsDirty(false);
  };

  const selectLocality = (loc) => {
    if (isDirty && !confirm("You have unsaved changes. Discard them?")) return;
    setSelectedLocality(loc.id);
    setEditingLocality(loc.id);
    loadFormFromLocality(loc);
    setCatalogSearch("");
  };

  const newLocality = () => {
    if (isDirty && !confirm("You have unsaved changes. Discard them?")) return;
    setSelectedLocality(null);
    setEditingLocality("new");
    const blank = {
      name: "", governing_body: "", state: "",
      contact_phone: "", contact_email: "", contact_website: "", contact_address: "",
      contact_department: "", contact_notes: "",
      offices: []
    };
    setForm(blank);
    cleanSnapshot.current = JSON.stringify(blank);
    setIsDirty(false);
    setCatalogSearch("");
  };

  const saveLocality = async () => {
    if (!form.name.trim()) return false;
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
    cleanSnapshot.current = JSON.stringify(form);
    setIsDirty(false);
    return true;
  };

  const saveAndExit = async () => {
    const ok = await saveLocality();
    if (ok) onClose();
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

  // Add an office to the locality from the full office catalog (deep copy)
  const addOfficeFromCatalog = (catalogOffice) => {
    const copy = {
      id: `${Date.now()}-${Math.random()}`,
      name: catalogOffice.name || "",
      office_type: catalogOffice.office_type || "",
      contact_phone: catalogOffice.contact_phone || "",
      contact_email: catalogOffice.contact_email || "",
      contact_website: catalogOffice.contact_website || "",
      contact_address: catalogOffice.contact_address || "",
      contact_notes: catalogOffice.contact_notes || "",
      workflow_steps: (catalogOffice.workflow_steps || []).map(s => ({
        ...s,
        id: `${Date.now()}-${Math.random()}-${s.id}`
      })),
      order: form.offices.length
    };
    setForm(prev => ({ ...prev, offices: [...prev.offices, copy] }));
    setCatalogSearch("");
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
    if (!confirm("Delete this office from the locality?")) return;
    setForm(prev => ({ ...prev, offices: prev.offices.filter(o => o.id !== officeId) }));
  };

  // Office Types (simple labels used as categories)
  const saveOfficeTypes = async (types) => {
    setOfficeTypes(types);
    const settings = await GlobalSettings.filter({ setting_key: 'permitOfficeTypes' });
    if (settings.length > 0) await GlobalSettings.update(settings[0].id, { setting_value: { items: types } });
    else await GlobalSettings.create({ setting_key: 'permitOfficeTypes', setting_value: { items: types } });
    setTypesDirty(false);
  };

  const addOfficeType = () => {
    const trimmed = newOfficeType.trim();
    if (!trimmed || officeTypes.includes(trimmed)) return;
    saveOfficeTypes([...officeTypes, trimmed]);
    setNewOfficeType("");
  };

  // Office Catalog save
  const saveOfficeCatalog = async (newCatalog) => {
    setOfficeCatalog(newCatalog);
    if (catalogSettingId) {
      await GlobalSettings.update(catalogSettingId, { setting_value: { items: newCatalog } });
    } else {
      const created = await GlobalSettings.create({ setting_key: 'permitOfficeCatalog', setting_value: { items: newCatalog } });
      setCatalogSettingId(created.id);
    }
    setCatalogDirty(false);
  };

  // Close-guard handlers
  const attemptClose = () => {
    if (anyDirty) {
      setShowUnsavedConfirm(true);
    } else {
      onClose();
    }
  };

  const handleOpenChange = (open) => {
    if (!open) attemptClose();
  };

  const discardAndExit = () => {
    setIsDirty(false);
    setCatalogDirty(false);
    setTypesDirty(false);
    setShowUnsavedConfirm(false);
    onClose();
  };

  const saveDirtyAndExit = async () => {
    if (isDirty && editingLocality && form.name.trim()) {
      await saveLocality();
    }
    setShowUnsavedConfirm(false);
    onClose();
  };

  // Catalog search results for locality editor
  const catalogSearchResults = useMemo(() => {
    if (!catalogSearch.trim()) return [];
    const q = catalogSearch.toLowerCase();
    return officeCatalog.filter(o =>
      (o.name || "").toLowerCase().includes(q) ||
      (o.office_type || "").toLowerCase().includes(q)
    ).slice(0, 10);
  }, [officeCatalog, catalogSearch]);

  const handleTabChange = (val) => {
    if (isDirty && !confirm("You have unsaved locality changes. Discard them?")) return;
    setActiveTab(val);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="clay-card border-none max-w-6xl w-[95vw] h-[90vh] max-h-[90vh] overflow-hidden flex flex-col [&>button]:hidden"
        onPointerDownOutside={(e) => { if (anyDirty) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (anyDirty) { e.preventDefault(); attemptClose(); } }}
        onInteractOutside={(e) => { if (anyDirty) e.preventDefault(); }}
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <DialogTitle>Permitting Settings</DialogTitle>
              {anyDirty && (
                <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-medium border border-amber-300">
                  Unsaved changes
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={saveLocality}
                disabled={!editingLocality || !form.name.trim() || !isDirty}
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 gap-1"
                title={!editingLocality ? "Select a locality to save" : ""}
              >
                <Save className="w-3.5 h-3.5" /> Save
              </Button>
              <Button
                onClick={saveAndExit}
                disabled={!editingLocality || !form.name.trim()}
                size="sm"
                variant="outline"
                className="gap-1"
                title={!editingLocality ? "Select a locality to save" : ""}
              >
                <LogOut className="w-3.5 h-3.5" /> Save & Exit
              </Button>
              <Button variant="ghost" size="sm" onClick={attemptClose} title="Close">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3 bg-gray-200 h-9">
            <TabsTrigger value="localities" className="text-sm">Localities</TabsTrigger>
            <TabsTrigger value="catalog" className="text-sm">Office Catalog</TabsTrigger>
            <TabsTrigger value="types" className="text-sm">Office Type Catalog</TabsTrigger>
          </TabsList>

          {/* LOCALITIES */}
          <TabsContent value="localities" className="flex-1 overflow-hidden min-h-0" style={{ marginTop: 0 }}>
            <div className="grid grid-cols-[220px_1fr] gap-4 h-full pt-3 min-h-0">
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

              <div className="overflow-y-auto min-h-0 bg-gray-50 border rounded-lg p-4">
                {editingLocality ? (
                  <div className="space-y-4">
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

                      {/* Search office catalog to add */}
                      <div className="mb-3 p-2 bg-white border border-dashed rounded">
                        <p className="text-[10px] text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Add from Office Catalog:</p>
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                          <Input
                            value={catalogSearch}
                            onChange={e => setCatalogSearch(e.target.value)}
                            placeholder={officeCatalog.length === 0 ? "Office catalog is empty — add offices in the Office Catalog tab" : "Search offices by name or type..."}
                            className="h-7 text-xs pl-7"
                            disabled={officeCatalog.length === 0}
                          />
                          {catalogSearchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded shadow-lg z-10 max-h-56 overflow-y-auto">
                              {catalogSearchResults.map(o => (
                                <button
                                  key={o.id}
                                  onClick={() => addOfficeFromCatalog(o)}
                                  className="w-full text-left px-2.5 py-1.5 hover:bg-purple-50 border-b last:border-b-0 flex items-center justify-between gap-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium truncate">{o.name || '(unnamed)'}</div>
                                    <div className="text-[10px] text-gray-500">
                                      {o.office_type || '—'} · {(o.workflow_steps || []).length} step{(o.workflow_steps || []).length === 1 ? '' : 's'}
                                    </div>
                                  </div>
                                  <Plus className="w-3 h-3 text-purple-600 flex-shrink-0" />
                                </button>
                              ))}
                            </div>
                          )}
                          {catalogSearch.trim() && catalogSearchResults.length === 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded shadow-lg z-10 px-2.5 py-2 text-[11px] text-gray-400">
                              No offices match "{catalogSearch}"
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {form.offices.length === 0 && (
                          <div className="p-4 bg-white border border-dashed rounded text-center text-xs text-gray-400">
                            No offices added yet. Search the catalog above or add a blank office.
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

          {/* OFFICE CATALOG (full offices with workflow) */}
          <TabsContent value="catalog" className="flex-1 overflow-y-auto min-h-0 p-3" style={{ marginTop: 0 }}>
            <OfficeCatalogEditor
              catalog={officeCatalog}
              officeTypes={officeTypes}
              onChange={saveOfficeCatalog}
            />
          </TabsContent>

          {/* OFFICE TYPE CATALOG (simple labels) */}
          <TabsContent value="types" className="flex-1 overflow-y-auto min-h-0 p-3" style={{ marginTop: 0 }}>
            <div className="max-w-lg">
              <h3 className="font-semibold text-sm mb-1">Office Type Catalog</h3>
              <p className="text-xs text-gray-500 mb-4">
                Simple labels used to categorize offices (e.g. Zoning, Building, Electrical). These appear in the office type dropdown when configuring an office. No workflow steps are attached here.
              </p>

              <div className="flex gap-2 mb-4">
                <Input
                  value={newOfficeType}
                  onChange={e => setNewOfficeType(e.target.value)}
                  placeholder="New office type..."
                  className="h-8 text-sm"
                  onKeyDown={e => e.key === 'Enter' && addOfficeType()}
                />
                <Button size="sm" onClick={addOfficeType} className="h-8"><Plus className="w-3 h-3 mr-1" /> Add</Button>
              </div>

              <div className="space-y-1">
                {officeTypes.length === 0 && (
                  <div className="p-4 bg-white border border-dashed rounded text-center text-xs text-gray-400">
                    No office types yet.
                  </div>
                )}
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

      {/* Unsaved-changes confirmation */}
      <AlertDialog open={showUnsavedConfirm} onOpenChange={setShowUnsavedConfirm}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Unsaved Changes
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this locality. What would you like to do?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => setShowUnsavedConfirm(false)}>
              Keep Editing
            </AlertDialogCancel>
            <Button variant="outline" onClick={discardAndExit} className="border-red-300 text-red-700 hover:bg-red-50">
              Discard & Exit
            </Button>
            <AlertDialogAction
              onClick={saveDirtyAndExit}
              disabled={isDirty && !form.name.trim()}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Save & Exit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}