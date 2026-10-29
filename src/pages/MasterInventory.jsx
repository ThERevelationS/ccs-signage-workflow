import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { User } from "@/api/gatedEntities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Search, Boxes, Upload, ShieldAlert, Download } from "lucide-react";

import { INVENTORY_SOURCES, SOURCE_BY_KEY } from "@/components/masterInventory/inventorySources";
import InventoryFormModal from "@/components/masterInventory/InventoryFormModal";
import InventoryTable from "@/components/masterInventory/InventoryTable";
import MasterEquipmentTab from "@/components/masterInventory/MasterEquipmentTab";
import MasterSuppliesTab from "@/components/masterInventory/MasterSuppliesTab";
import MasterExtrudedMetalsPolesTab from "@/components/masterInventory/MasterExtrudedMetalsPolesTab";
import MasterConcreteStoneTab from "@/components/masterInventory/MasterConcreteStoneTab";
import VinylInventoryTab from "@/components/vinylInventory/VinylInventoryTab";
import ExcelImporterDialog from "@/components/masterInventory/ExcelImporterDialog";
import { deleteInventoryRecordIfUnchanged, findInventoryPartReferences } from "@/components/masterInventory/inventoryPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

export default function MasterInventory() {
  const [user, setUser] = useState(null);
  const [activeKey, setActiveKey] = useState(() => {
    try { const k = new URLSearchParams(window.location.search).get("src"); return k && INVENTORY_SOURCES.some((s) => s.key === k) ? k : INVENTORY_SOURCES[0].key; } catch { return INVENTORY_SOURCES[0].key; }
  });
  const writeParam = (key, value, defaultValue = "") => {
    try {
      const next = new URLSearchParams(window.location.search);
      if (value && value !== defaultValue) next.set(key, value); else next.delete(key);
      window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
    } catch {}
  };
  const [itemsBySource, setItemsBySource] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showImporter, setShowImporter] = useState(false);
  const [userLoaded, setUserLoaded] = useState(false);
  const [inventoryLoadError, setInventoryLoadError] = useState("");
  const deleteRef = useRef(new Set());

  const activeSource = SOURCE_BY_KEY[activeKey];
  const isAdmin = user?.role === "admin";
  const linkPartsRef = useRef(null);
  const [linkBusy, setLinkBusy] = useState(false);
  // Bulk-link inventory→parts (#470): a CSV of {part_id, inventory_item_id}
  // sets the part's inventory link via a per-part CAS update (id+updated_date).
  const linkPartsCsv = async (file) => {
    if (!file || linkBusy) return;
    setLinkBusy(true);
    try {
      const text = await file.text();
      const lines = text.split(/[
]+/).map((l) => l.trim()).filter(Boolean).slice(0, 500);
      let linked = 0, failed = 0;
      for (const line of lines) {
        const [partId, invId] = line.split(",").map((s) => s.trim());
        if (!partId || !invId || partId.toLowerCase() === "part_id") continue;
        try {
          const part = await staffEntities.BuilderPart.get(partId);
          if (!part?.id || !part?.updated_date) { failed += 1; continue; }
          await staffEntities.updateMany("BuilderPart", { id: part.id, updated_date: part.updated_date }, { $set: { inventory_item_id: invId } });
          linked += 1;
        } catch { failed += 1; }
      }
      window.alert(`Linked ${linked} part(s) to inventory.${failed ? ` ${failed} row(s) skipped.` : ""}`);
    } catch (e) { window.alert(e?.message || "Link failed."); } finally {
      setLinkBusy(false);
      if (linkPartsRef.current) linkPartsRef.current.value = "";
    }
  };
  const isCustomTab = !!activeSource?.custom;

  // Load current user once
  useEffect(() => {
    User.me()
      .then((u) => {
        setUser(u);
        setUserLoaded(true);
      })
      .catch(() => {
        setUser(null);
        setUserLoaded(true);
      });
  }, []);

  // Load items for the active declarative source (skip for custom tabs)
  const loadActive = useCallback(async () => {
    if (!activeSource || isCustomTab) return;
    setIsLoading(true);
    setInventoryLoadError("");
    try {
      const items = await loadAllEntityRows({
        entity: activeSource.entity,
        sort: null,
        label: `${activeSource.label} Master Inventory`,
      });
      setItemsBySource((prev) => ({ ...prev, [activeKey]: items }));
    } catch (err) {
      console.error("Failed to load inventory:", err);
      setInventoryLoadError(err?.message || `Could not verify ${activeSource.label} inventory.`);
    } finally {
      setIsLoading(false);
    }
  }, [activeKey, activeSource, isCustomTab]);

  useEffect(() => {
    loadActive();
  }, [loadActive]);

  const items = itemsBySource[activeKey] || [];

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((it) =>
      Object.values(it).some(
        (v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q)
      )
    );
  }, [items, search]);

  const exportCsvFor = (source) => {
    const cols = (source?.fields || []).filter((f) => f?.table && f?.name);
    if (!cols.length || !filteredItems.length) return;
    const esc = (v) => {
      const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = cols.map((c) => esc(c.label || c.name)).join(",");
    const rows = filteredItems.map((it) => cols.map((c) => esc(it[c.name])).join(","));
    const blob = new Blob([`${header}\n${rows.join("\n")}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${source.key}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEdit = (item) => {
    if (!isAdmin) return;
    setEditingItem(item);
    setShowForm(true);
  };

  const handleDelete = async (item) => {
    if (!isAdmin || deleteRef.current.has(item.id)) return;
    const label = item[activeSource.nameField] || "this item";
    deleteRef.current.add(item.id);
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) {
      deleteRef.current.delete(item.id);
      return;
    }
    try {
      const refs = await findInventoryPartReferences(item.id);
      if (refs.count > 0) {
        alert(`"${label}" is used by ${refs.count} estimate Part${refs.count === 1 ? "" : "s"} (${refs.names.join(", ")}${refs.count > 5 ? ", …" : ""}). Detach or remove those Parts before deleting this item.`);
        return;
      }
      await deleteInventoryRecordIfUnchanged({
        entity: activeSource.entity,
        record: item,
        nameField: activeSource.nameField,
        label: `${activeSource.label || "Inventory"} item “${label}”`,
      });
      await loadActive();
    } catch (err) {
      console.error("Delete failed:", err);
      alert(err?.message || "Failed to delete item.");
    } finally {
      deleteRef.current.delete(item.id);
    }
  };

  const handleAdd = () => {
    if (!isAdmin) return;
    setEditingItem(null);
    setShowForm(true);
  };

  const handleSaved = async () => {
    setShowForm(false);
    setEditingItem(null);
    await loadActive();
  };

  // Admin-only gate — non-admins (and unauthenticated users) cannot view this page.
  if (!userLoaded) {
    return (
      <div className="p-12 text-center text-slate-500">Loading…</div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="p-6 md:p-8 bg-slate-50 min-h-screen">
        <div className="max-w-2xl mx-auto mt-20">
          <Card className="bg-white border-amber-200 shadow-sm">
            <CardContent className="p-8 text-center space-y-3">
              <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto" />
              <h2 className="text-xl font-semibold text-slate-900">Admin Access Required</h2>
              <p className="text-sm text-slate-600">
                The Master Inventory page is restricted to administrators. Please contact your admin
                if you need access.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <Boxes className="w-8 h-8 text-slate-700" />
              Master Inventory
            </h1>
            <p className="text-slate-600 mt-1">
              Unified view of every inventory item.{" "}
              <span className="text-green-700 font-medium">You can add, edit, and delete items.</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => setShowImporter(true)}
              variant="outline"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              <Upload className="w-4 h-4 mr-2" />
              Import from Excel
            </Button>
            {isAdmin && (
              <>
                <Button onClick={() => linkPartsRef.current?.click()} disabled={linkBusy} variant="outline" className="border-violet-300 text-violet-700 hover:bg-violet-50" title="CSV: part_id,inventory_item_id — links parts to inventory rows (#470)">
                  {linkBusy ? "Linking…" : "Link parts (CSV)"}
                </Button>
                <input ref={linkPartsRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => linkPartsCsv(e.target.files?.[0])} />
              </>
            )}
            {!isCustomTab && (
              <Button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            )}
          </div>
        </div>

        {/* Importer banner */}
        <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <Upload className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-slate-700">
            <p className="font-semibold text-slate-900 mb-0.5">Bulk import from your external inventory system</p>
            <p className="text-xs text-slate-600">
              Drop in a Part Details Export — items are auto-routed to Vinyl, Substrates (incl. sheet metal),
              Sign Lighting, Hardware, Labor &amp; Services, or Sign Parts | Supplies. Existing items are
              updated by name (no duplicates).
            </p>
          </div>
        </div>

        {/* Source tabs */}
        <Tabs value={activeKey} onValueChange={(v) => { setActiveKey(v); writeParam("src", v, INVENTORY_SOURCES[0].key); }}>
          <div className="bg-white rounded-xl shadow-sm border p-2 mb-4 overflow-x-auto">
            <TabsList className="bg-transparent gap-1 flex-wrap h-auto">
              {INVENTORY_SOURCES.map((s) => {
                const Icon = s.icon;
                return (
                  <TabsTrigger
                    key={s.key}
                    value={s.key}
                    className="data-[state=active]:bg-slate-900 data-[state=active]:text-white gap-2"
                  >
                    <Icon className={`w-4 h-4 ${activeKey === s.key ? "text-white" : s.color}`} />
                    <span>{s.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {INVENTORY_SOURCES.map((s) => (
            <TabsContent key={s.key} value={s.key} className="mt-0">
              {/* Custom tabs own their own card / search / counts */}
              {s.custom === "equipment" && <MasterEquipmentTab isAdmin={isAdmin} />}
              {s.custom === "supplies"  && <MasterSuppliesTab isAdmin={isAdmin} />}
              {s.custom === "vinyl"     && <VinylInventoryTab scope="master" />}
              {s.custom === "extruded_metals_poles" && <MasterExtrudedMetalsPolesTab isAdmin={isAdmin} />}
              {s.custom === "concrete_stone" && <MasterConcreteStoneTab />}

              {/* Declarative tabs */}
              {!s.custom && (
                <Card className="bg-white border-0 shadow-sm">
                  <CardHeader className="border-b">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <CardTitle className="flex items-center gap-2">
                        <s.icon className={`w-5 h-5 ${s.color}`} />
                        {s.label}
                        <Badge variant="outline" className="ml-2 font-normal">
                          {filteredItems.length} of {items.length}
                        </Badge>
                      </CardTitle>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="relative w-full sm:w-64">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            placeholder="Search items..."
                            value={search}
                            onChange={(e) => { const v = e.target.value; setSearch(v); try { const next = new URLSearchParams(window.location.search); if (v) next.set("q", v); else next.delete("q"); window.history.replaceState(null, "", `${window.location.pathname}?${next}`); } catch {} }}
                            className="pl-9"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => exportCsvFor(s)}
                          disabled={!filteredItems.length}
                          className="h-9 whitespace-nowrap"
                          title="Export visible rows to CSV"
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Export
                        </Button>
                        {isAdmin && (
                          <Button
                            onClick={handleAdd}
                            className="bg-blue-600 hover:bg-blue-700 text-white h-9 whitespace-nowrap"
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Add {s.label.replace(/\s*\|.*$/, "")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {isLoading ? (
                      <div className="p-12 text-center text-slate-500">Loading…</div>
                    ) : inventoryLoadError ? (
                      <div className="p-8 text-center bg-red-50 border border-red-200 text-red-700">
                        <div className="font-semibold">Inventory could not be verified.</div>
                        <div className="mt-1 text-xs">{inventoryLoadError}</div>
                        <Button variant="outline" className="mt-3" onClick={loadActive}>Retry</Button>
                      </div>
                    ) : (
                      <InventoryTable
                        source={s}
                        items={filteredItems}
                        canEdit={isAdmin}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onInlineToggle={(itemId, fieldName, next) => {
                          setItemsBySource((prev) => {
                            const list = (prev[activeKey] || []).map((it) =>
                              it.id === itemId ? { ...it, [fieldName]: next } : it
                            );
                            return { ...prev, [activeKey]: list };
                          });
                        }}
                      />
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {showForm && activeSource && !isCustomTab && (
        <InventoryFormModal
          source={activeSource}
          editingItem={editingItem}
          onCancel={() => {
            setShowForm(false);
            setEditingItem(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {showImporter && (
        <ExcelImporterDialog
          onClose={() => setShowImporter(false)}
          onComplete={() => {
            // Refresh current tab so newly imported items appear
            loadActive();
          }}
        />
      )}
    </div>
  );
}