import { useState, useEffect, useMemo, useRef } from "react";
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
import { deleteEntityIfUnchanged, expectedEntityFields, replaceEntityFieldsIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";
import { loadSingleGlobalSetting, saveGlobalSettingValueIfUnchanged } from "./permitGlobalSettingsPersistence";
import { createPermitLocalityIfAbsent } from "./permitLocalityPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const PermitLocality = base44.entities.PermitLocality;
const GlobalSettings = base44.entities.GlobalSettings;

export default function PermitSettingsDialog({ isOpen, onClose, localities: initialLocalities, officeTypes: initialOfficeTypes }) {
  const [activeTab, setActiveTab] = useState("localities");
  const [localities, setLocalities] = useState(initialLocalities || []);
  const [officeTypes, setOfficeTypes] = useState(initialOfficeTypes || []);
  const [officeCatalog, setOfficeCatalog] = useState([]);
  const [catalogSettingRecord, setCatalogSettingRecord] = useState(null);
  const [officeTypesSettingRecord, setOfficeTypesSettingRecord] = useState(null);
  const [selectedLocality, setSelectedLocality] = useState(null);
  const [editingLocality, setEditingLocality] = useState(null);
  const [newOfficeType, setNewOfficeType] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [localitySaveError, setLocalitySaveError] = useState("");
  const localitySaveInFlightRef = useRef(false);
  const localityDeleteInFlightRef = useRef(new Set());

  // Load the exact GlobalSettings rows that become the concurrency baselines for
  // Office Catalog and Office Type saves in this dialog.
  useEffect(() => {
    const load = async () => {
      try {
        const [catalogSetting, typesSetting] = await Promise.all([
          loadSingleGlobalSetting({ entity: GlobalSettings, settingKey: 'permitOfficeCatalog', label: 'Permit Office Catalog' }),
          loadSingleGlobalSetting({ entity: GlobalSettings, settingKey: 'permitOfficeTypes', label: 'Permit Office Types' }),
        ]);
        setCatalogSettingRecord(catalogSetting);
        setOfficeTypesSettingRecord(typesSetting);
        if (catalogSetting?.id) setOfficeCatalog(catalogSetting.setting_value?.items || []);
        if (typesSetting?.id) setOfficeTypes(typesSetting.setting_value?.items || []);
      } catch (error) {
        console.error("Could not load Permitting GlobalSettings safely:", error);
        setLocalitySaveError(error?.message || "Permitting settings could not be loaded safely. Close and reopen before editing them.");
      }
    };
    load();
  }, []);

  const [form, setForm] = useState({
    name: "", state: "", zip: "",
    offices: []
  });

  // Permanent office types that cannot be edited or deleted
  const PERMANENT_OFFICE_TYPES = ["Zoning", "Building", "Electrical Inspectors"];

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
      state: loc.state || "",
      zip: loc.zip || "",
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
      name: "", state: "", zip: "",
      offices: []
    };
    setForm(blank);
    cleanSnapshot.current = JSON.stringify(blank);
    setIsDirty(false);
    setCatalogSearch("");
  };

  const saveLocality = async () => {
    if (!form.name.trim() || localitySaveInFlightRef.current) return false;
    localitySaveInFlightRef.current = true;
    setLocalitySaveError("");
    const payload = { ...form };

    try {
      if (editingLocality === "new") {
        const normalizedName = form.name.trim().toLowerCase();
        const normalizedState = (form.state || "").trim().toLowerCase();
        const existing = localities.find(loc =>
          (loc.name || "").trim().toLowerCase() === normalizedName &&
          (loc.state || "").trim().toLowerCase() === normalizedState
        );
        if (existing) {
          setSelectedLocality(existing.id);
          setEditingLocality(existing.id);
          loadFormFromLocality(existing);
          setLocalitySaveError("A locality with this name and state already exists. The existing locality was opened instead of creating a duplicate.");
          return false;
        }

        const createResult = await createPermitLocalityIfAbsent({
          entity: PermitLocality,
          data: payload,
          readCurrentLocalities: () => loadAllEntityRows({
            entity: PermitLocality,
            sort: "name",
            label: "Permit locality create identity",
          }),
          label: `Permit locality ${payload.name}`,
        });
        const created = createResult.record;
        if (createResult.status === "existing") {
          setLocalitySaveError("A locality with this name and state appeared in another session. The existing locality was opened instead of creating a duplicate.");
        } else if (createResult.status === "recovered") {
          setLocalitySaveError("The create response was unavailable, but the locality was found on re-read and recovered safely.");
        }
        setLocalities(prev => prev.some(loc => loc.id === created.id) ? prev.map(loc => loc.id === created.id ? created : loc) : [...prev, created]);
        setSelectedLocality(created.id);
        setEditingLocality(created.id);
        loadFormFromLocality(created);
      } else {
        const loaded = localities.find(loc => loc.id === editingLocality);
        if (!loaded?.id) throw new Error("The locality being edited is no longer loaded. Reopen it before saving.");
        const saved = await replaceEntityFieldsIfUnchanged({
          entity: PermitLocality,
          id: loaded.id,
          expectedFields: expectedEntityFields(loaded, payload),
          nextFields: payload,
          label: `Permit locality ${loaded.name || loaded.id}`,
        });
        setLocalities(prev => prev.map(l => l.id === saved.id ? saved : l));
      }
      cleanSnapshot.current = JSON.stringify(form);
      setIsDirty(false);
      return true;
    } catch (error) {
      console.error("Permit locality save blocked:", error);
      const latest = editingLocality && editingLocality !== "new"
        ? await PermitLocality.get(editingLocality).catch(() => null)
        : null;
      if (latest?.id) {
        setLocalities(prev => prev.map(loc => loc.id === latest.id ? latest : loc));
        loadFormFromLocality(latest);
      }
      setLocalitySaveError(error?.message || "This locality changed in another session. Reload it before saving.");
      return false;
    } finally {
      localitySaveInFlightRef.current = false;
    }
  };

  const saveAndExit = async () => {
    const ok = await saveLocality();
    if (ok) onClose();
  };

  const deleteLocality = async (id) => {
    if (!confirm("Delete this locality?") || localityDeleteInFlightRef.current.has(id)) return;
    const loaded = localities.find(loc => loc.id === id);
    if (!loaded?.id) {
      setLocalitySaveError("The locality selected for deletion is no longer loaded. Reload settings before deleting it.");
      return;
    }

    localityDeleteInFlightRef.current.add(id);
    setLocalitySaveError("");
    try {
      await deleteEntityIfUnchanged({
        entity: PermitLocality,
        record: loaded,
        guardFields: { name: loaded.name },
        label: `Permit locality ${loaded.name || loaded.id} deletion`,
      });
      setLocalities(prev => prev.filter(l => l.id !== id));
      if (selectedLocality === id) {
        setSelectedLocality(null);
        setEditingLocality(null);
      }
    } catch (error) {
      console.error("Permit locality deletion blocked:", error);
      const latest = await PermitLocality.get(id).catch(() => null);
      if (latest?.id) setLocalities(prev => prev.map(loc => loc.id === id ? latest : loc));
      setLocalitySaveError(error?.message || "This locality changed in another session. Reload settings before deleting it.");
    } finally {
      localityDeleteInFlightRef.current.delete(id);
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
  // Ensure permanent types are always present at the top of the list
  const ensurePermanentTypes = (types) => {
    const custom = (types || []).filter(t => !PERMANENT_OFFICE_TYPES.includes(t));
    return [...PERMANENT_OFFICE_TYPES, ...custom];
  };

  // On load, make sure permanent types exist in saved settings
  useEffect(() => {
    const enriched = ensurePermanentTypes(initialOfficeTypes || []);
    if (JSON.stringify(enriched) !== JSON.stringify(initialOfficeTypes || [])) {
      setOfficeTypes(enriched);
    }
  }, [initialOfficeTypes]);

  const saveOfficeTypes = async (types) => {
    const finalTypes = ensurePermanentTypes(types);
    setLocalitySaveError("");
    try {
      const saved = await saveGlobalSettingValueIfUnchanged({
        entity: GlobalSettings,
        loadedRecord: officeTypesSettingRecord,
        settingKey: 'permitOfficeTypes',
        nextValue: { items: finalTypes },
        label: 'Permit Office Types',
      });
      setOfficeTypes(finalTypes);
      setOfficeTypesSettingRecord(saved);
      setTypesDirty(false);
      return true;
    } catch (error) {
      console.error("Permit Office Types save blocked:", error);
      setLocalitySaveError(error?.message || "Permit Office Types changed in another session. Close and reopen settings before retrying.");
      return false;
    }
  };

  const addOfficeType = () => {
    const trimmed = newOfficeType.trim();
    if (!trimmed || officeTypes.includes(trimmed)) return;
    saveOfficeTypes([...officeTypes, trimmed]);
    setNewOfficeType("");
  };

  // Office Catalog save
  const saveOfficeCatalog = async (newCatalog) => {
    setLocalitySaveError("");
    try {
      const saved = await saveGlobalSettingValueIfUnchanged({
        entity: GlobalSettings,
        loadedRecord: catalogSettingRecord,
        settingKey: 'permitOfficeCatalog',
        nextValue: { items: newCatalog },
        label: 'Permit Office Catalog',
      });
      setOfficeCatalog(newCatalog);
      setCatalogSettingRecord(saved);
      setCatalogDirty(false);
      return true;
    } catch (error) {
      console.error("Permit Office Catalog save blocked:", error);
      setLocalitySaveError(error?.message || "Permit Office Catalog changed in another session. Close and reopen settings before retrying.");
      return false;
    }
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

        {localitySaveError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800 flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">Permitting settings update blocked</div>
              <div className="mt-1">{localitySaveError}</div>
            </div>
            <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 border-red-300 bg-white text-red-800" onClick={() => setLocalitySaveError("")}>Dismiss</Button>
          </div>
        )}

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
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Locality Name *</Label>
                        <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">State</Label>
                        <Input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} className="h-8 text-sm" placeholder="e.g. OH" />
                      </div>
                      <div>
                        <Label className="text-xs">Zip Code</Label>
                        <Input value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} className="h-8 text-sm" placeholder="e.g. 45040" />
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
                {officeTypes.map((type, idx) => {
                  const isPermanent = PERMANENT_OFFICE_TYPES.includes(type);
                  return (
                    <div
                      key={type}
                      className={`flex items-center gap-2 p-2 border rounded text-sm ${isPermanent ? 'bg-purple-50 border-purple-200' : 'bg-white'}`}
                    >
                      <span className="flex-1 font-medium">{type}</span>
                      {isPermanent ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-200 text-purple-800 font-semibold uppercase tracking-wide">
                          Permanent
                        </span>
                      ) : (
                        <button
                          onClick={() => saveOfficeTypes(officeTypes.filter((_, i) => i !== idx))}
                          className="p-1 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </button>
                      )}
                    </div>
                  );
                })}
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