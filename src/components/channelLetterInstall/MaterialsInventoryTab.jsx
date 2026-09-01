import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ChannelLetterInstallInventory, ChannelLetterInstallation } from "@/entities/all";
import { User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Save, Search, Package2, X, Lock } from "lucide-react";
import MaterialItemCard from "./MaterialItemCard";
import BulkActionsBar from "./BulkActionsBar";
import BulkPriceAdjustDialog from "./BulkPriceAdjustDialog";
import PriceHistoryDialog from "./PriceHistoryDialog";
import { APPLIES_TO_GROUPS, ALL_INSTALL_TYPES, emptyMaterialItem } from "./materialsConstants";
import {
  extractPriceSnapshot, buildPriceHistoryUpdate,
  countInventoryUsage, adjustItemPricing,
} from "./materialsHelpers";

const APPLIES_TO_FILTER = [
  { value: "any", label: "All Groups" },
  ...APPLIES_TO_GROUPS,
];

// Resolve which "applies to" groups an item belongs to.
// Items with no specific applies_to_list (or legacy "all") show in EVERY type section.
const groupsForItem = (it) => {
  const list = Array.isArray(it.applies_to_list) && it.applies_to_list.length > 0
    ? it.applies_to_list
    : (it.applies_to && it.applies_to !== "all" ? [it.applies_to] : []);
  return list.length > 0 ? list : ALL_INSTALL_TYPES;
};

export default function MaterialsInventoryTab() {
  const [items, setItems] = useState([]);
  const [savedSnapshots, setSavedSnapshots] = useState({}); // id -> last saved price snapshot
  const [usageCounts, setUsageCounts] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [appliesFilter, setAppliesFilter] = useState("any");

  // State tracking
  const [dirtyIds, setDirtyIds] = useState(new Set());
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  // Dialogs
  const [historyItem, setHistoryItem] = useState(null);
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);

  const isAdmin = currentUser?.role === "admin";
  const readOnly = currentUser && !isAdmin;

  const keyFor = (it) => it.id || it._localKey;

  const load = useCallback(async () => {
    setLoading(true);
    const [data, user, projects] = await Promise.all([
      ChannelLetterInstallInventory.list("sort_order"),
      User.me().catch(() => null),
      ChannelLetterInstallation.list().catch(() => []),
    ]);
    setItems(data);
    setCurrentUser(user);
    setUsageCounts(countInventoryUsage(projects));
    // Snapshot current pricing on load (baseline for change detection)
    const snaps = {};
    for (const it of data) {
      if (it.id) snaps[it.id] = extractPriceSnapshot(it);
    }
    setSavedSnapshots(snaps);
    setDirtyIds(new Set());
    setSelectedKeys(new Set());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const markDirty = (idx) => {
    setDirtyIds(prev => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  };

  const update = (idx, patch) => {
    if (readOnly) return;
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    setItems(next);
    markDirty(idx);
  };

  const addItem = () => {
    if (readOnly) return;
    const newItem = { ...emptyMaterialItem(), _new: true, _localKey: `new-${Date.now()}` };
    const next = [...items, newItem];
    setItems(next);
    markDirty(next.length - 1);
  };

  const duplicateItem = (idx) => {
    if (readOnly) return;
    const original = items[idx];
    const { id, _new, _localKey, price_history, ...rest } = original;
    const copy = {
      ...rest,
      item_name: `${original.item_name || "Item"} (Copy)`,
      _new: true,
      _localKey: `new-${Date.now()}`,
      price_history: [],
    };
    const next = [...items, copy];
    setItems(next);
    markDirty(next.length - 1);
  };

  const removeItem = async (idx) => {
    if (readOnly) return;
    const item = items[idx];
    if (item.id) {
      if (!confirm(`Delete "${item.item_name || "this item"}"?`)) return;
      await ChannelLetterInstallInventory.delete(item.id);
    }
    const next = [...items];
    next.splice(idx, 1);
    setItems(next);
    // re-index dirty set
    const newDirty = new Set();
    dirtyIds.forEach(i => {
      if (i < idx) newDirty.add(i);
      else if (i > idx) newDirty.add(i - 1);
    });
    setDirtyIds(newDirty);
    // remove from selection
    const newSel = new Set(selectedKeys);
    newSel.delete(keyFor(item));
    setSelectedKeys(newSel);
  };

  const saveOne = async (idx) => {
    if (readOnly) return;
    const it = items[idx];
    const { _new, _localKey, id, ...payload } = it;
    // Append price history if pricing changed
    const prevSnap = id ? savedSnapshots[id] : null;
    const updatedHistory = buildPriceHistoryUpdate(payload, prevSnap, currentUser?.email);
    if (updatedHistory) payload.price_history = updatedHistory;

    let saved;
    if (id) saved = await ChannelLetterInstallInventory.update(id, payload);
    else saved = await ChannelLetterInstallInventory.create(payload);

    // Update local row with returned id and clear dirty flag
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...saved };
      return next;
    });
    setSavedSnapshots(prev => ({
      ...prev,
      [saved.id]: extractPriceSnapshot(saved),
    }));
    setDirtyIds(prev => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
  };

  const saveAll = async () => {
    if (readOnly) return;
    setSaving(true);
    const toSave = [...dirtyIds];
    for (const idx of toSave) {
      // eslint-disable-next-line no-await-in-loop
      await saveOne(idx);
    }
    setSaving(false);
  };

  // Bulk actions ----------------------------------------------------
  const toggleSelect = (it, on) => {
    const k = keyFor(it);
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (on) next.add(k); else next.delete(k);
      return next;
    });
  };

  const selectedIndices = useMemo(() => {
    const idxs = [];
    items.forEach((it, idx) => {
      if (selectedKeys.has(keyFor(it))) idxs.push(idx);
    });
    return idxs;
  }, [items, selectedKeys]);

  const clearSelection = () => setSelectedKeys(new Set());

  const bulkDuplicate = () => {
    if (readOnly || selectedIndices.length === 0) return;
    let next = [...items];
    const newDirty = new Set(dirtyIds);
    for (const idx of selectedIndices) {
      const original = next[idx];
      const { id, _new, _localKey, price_history, ...rest } = original;
      next.push({
        ...rest,
        item_name: `${original.item_name || "Item"} (Copy)`,
        _new: true,
        _localKey: `new-${Date.now()}-${idx}`,
        price_history: [],
      });
      newDirty.add(next.length - 1);
    }
    setItems(next);
    setDirtyIds(newDirty);
    clearSelection();
  };

  const bulkDelete = async () => {
    if (readOnly || selectedIndices.length === 0) return;
    if (!confirm(`Delete ${selectedIndices.length} item(s)? This cannot be undone.`)) return;
    const idsToDelete = selectedIndices.map(i => items[i].id).filter(Boolean);
    await Promise.all(idsToDelete.map(id => ChannelLetterInstallInventory.delete(id)));
    // Rebuild items array
    const next = items.filter((_, idx) => !selectedIndices.includes(idx));
    setItems(next);
    setDirtyIds(new Set());
    clearSelection();
  };

  const bulkToggleAuto = (value) => {
    if (readOnly || selectedIndices.length === 0) return;
    const next = [...items];
    const newDirty = new Set(dirtyIds);
    for (const idx of selectedIndices) {
      next[idx] = { ...next[idx], is_default: value };
      newDirty.add(idx);
    }
    setItems(next);
    setDirtyIds(newDirty);
  };

  const bulkAdjustPrices = (percent) => {
    if (readOnly || selectedIndices.length === 0) return;
    const next = [...items];
    const newDirty = new Set(dirtyIds);
    for (const idx of selectedIndices) {
      const patch = adjustItemPricing(next[idx], percent);
      next[idx] = { ...next[idx], ...patch };
      newDirty.add(idx);
    }
    setItems(next);
    setDirtyIds(newDirty);
  };

  // Auto-save when a card is collapsed
  const handleCardCollapse = (idx) => {
    if (dirtyIds.has(idx) && !readOnly) {
      saveOne(idx);
    }
  };

  // Filtering -------------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => {
        if (appliesFilter !== "any") {
          const groups = groupsForItem(it);
          if (!groups.includes(appliesFilter)) return false;
        }
        if (q) {
          const haystack = `${it.item_name || ""} ${it.supplier || ""} ${it.notes || ""}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      });
  }, [items, search, appliesFilter]);

  // Group items by APPLIES_TO_GROUPS — items can appear in multiple groups.
  const grouped = useMemo(() => {
    const map = new Map();
    for (const { it, idx } of filtered) {
      const groups = groupsForItem(it);
      for (const g of groups) {
        if (!map.has(g)) map.set(g, []);
        map.get(g).push({ it, idx });
      }
    }
    return APPLIES_TO_GROUPS
      .map(g => ({ group: g, rows: map.get(g.value) || [] }))
      .filter(g => g.rows.length > 0);
  }, [filtered]);

  const hasFilters = search || appliesFilter !== "any";
  const clearFilters = () => { setSearch(""); setAppliesFilter("any"); };

  // Count unique filtered items (filtered may contain duplicates if regrouped)
  const uniqueFiltered = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const row of filtered) {
      const k = keyFor(row.it);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(row);
    }
    return out;
  }, [filtered]);

  const allFilteredSelected = uniqueFiltered.length > 0 && uniqueFiltered.every(({ it }) => selectedKeys.has(keyFor(it)));
  const toggleSelectAll = (on) => {
    const next = new Set(selectedKeys);
    for (const { it } of uniqueFiltered) {
      if (on) next.add(keyFor(it));
      else next.delete(keyFor(it));
    }
    setSelectedKeys(next);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-purple-600 rounded-full animate-spin mr-3" />
        Loading materials...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {readOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-sm text-amber-800">
          <Lock className="w-4 h-4" />
          <span>
            <strong>View-only mode.</strong> Only administrators can edit the materials inventory.
          </span>
        </div>
      )}

      {/* Sticky toolbar */}
      <div className="sticky top-0 z-30 bg-slate-50 -mx-2 px-2 pt-2 pb-1">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, supplier, or notes..."
                className="pl-9 h-10"
              />
            </div>

            <Select value={appliesFilter} onValueChange={setAppliesFilter}>
              <SelectTrigger className="h-10 w-[220px]">
                <SelectValue placeholder="All Groups" />
              </SelectTrigger>
              <SelectContent>
                {APPLIES_TO_FILTER.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500">
                <X className="w-3.5 h-3.5 mr-1" /> Clear
              </Button>
            )}

            {!readOnly && (
              <div className="ml-auto flex items-center gap-2">
                <Button onClick={addItem} variant="outline" className="h-10">
                  <Plus className="w-4 h-4 mr-1" /> Add Material
                </Button>
                <Button
                  onClick={saveAll}
                  disabled={saving || dirtyIds.size === 0}
                  className="bg-purple-600 hover:bg-purple-700 text-white h-10"
                >
                  <Save className="w-4 h-4 mr-1" />
                  {saving ? "Saving..." : dirtyIds.size > 0 ? `Save ${dirtyIds.size} Change${dirtyIds.size !== 1 ? "s" : ""}` : "Saved"}
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
            {uniqueFiltered.length > 0 && !readOnly && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={(c) => toggleSelectAll(!!c)}
                />
                <span>Select all visible</span>
              </label>
            )}
            <span><strong className="text-slate-700">{items.length}</strong> total materials</span>
            {hasFilters && (
              <span>· Showing <strong className="text-slate-700">{uniqueFiltered.length}</strong> filtered</span>
            )}
            {dirtyIds.size > 0 && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                {dirtyIds.size} unsaved — auto-saves when card is collapsed
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-2">
          <BulkActionsBar
            selectedCount={selectedIndices.length}
            onClear={clearSelection}
            onDuplicate={bulkDuplicate}
            onDelete={bulkDelete}
            onToggleAuto={bulkToggleAuto}
            onAdjustPrices={() => setShowAdjustDialog(true)}
            disabled={readOnly}
          />
        </div>
      </div>

      {/* Content */}
      {items.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl py-16 text-center">
          <Package2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-700 mb-1">No materials yet</h3>
          <p className="text-sm text-slate-500 mb-4">
            Add your first material to start building your installation inventory.
          </p>
          {!readOnly && (
            <Button onClick={addItem} className="bg-purple-600 hover:bg-purple-700 text-white">
              <Plus className="w-4 h-4 mr-1" /> Add Your First Material
            </Button>
          )}
        </div>
      ) : uniqueFiltered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl py-12 text-center">
          <p className="text-slate-500 mb-3">No materials match your filters.</p>
          <Button variant="outline" onClick={clearFilters}>
            <X className="w-3.5 h-3.5 mr-1" /> Clear Filters
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ group, rows }) => (
            <div key={group.value}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <Badge variant="outline" className={`${group.color} text-xs`}>
                  {group.label}
                </Badge>
                <span className="text-xs text-slate-400">
                  {rows.length} item{rows.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="space-y-2">
                {rows.map(({ it, idx }) => (
                  <MaterialItemCard
                    key={`${group.value}-${keyFor(it)}`}
                    item={it}
                    isDirty={dirtyIds.has(idx)}
                    isNew={!!it._new}
                    defaultExpanded={!!it._new}
                    selected={selectedKeys.has(keyFor(it))}
                    onSelectChange={(on) => toggleSelect(it, on)}
                    usageCount={it.id ? (usageCounts[it.id] || 0) : 0}
                    readOnly={readOnly}
                    onChange={(patch) => update(idx, patch)}
                    onRemove={() => removeItem(idx)}
                    onDuplicate={() => duplicateItem(idx)}
                    onCollapse={() => handleCardCollapse(idx)}
                    onViewHistory={() => setHistoryItem(it)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <PriceHistoryDialog
        open={!!historyItem}
        onOpenChange={(o) => !o && setHistoryItem(null)}
        item={historyItem}
      />

      <BulkPriceAdjustDialog
        open={showAdjustDialog}
        onOpenChange={setShowAdjustDialog}
        selectedCount={selectedIndices.length}
        onApply={bulkAdjustPrices}
      />
    </div>
  );
}