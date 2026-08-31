// The full Vinyl Inventory tab. Used in three places:
//   - Master Inventory (scope="master")        → shows everything
//   - Channel & Dimensional Letters Inventory  → scope="channel_letters"
//   - Sign Maintenance Inventory               → scope="sign_maintenance"
//   - Dedicated Vinyl Inventory page (under Vinyl Estimator)
//
// Editing flow:
//   - "Add Vinyl"  → creates a blank record, immediately opens VinylEditDialog.
//   - Row "Edit"   → opens VinylEditDialog populated with that row.
//   - Save in dialog persists the full draft via VinylInventory.update(id, draft).

import React, { useEffect, useState, useMemo } from "react";
import { VinylInventory, User } from "@/entities/all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Droplets, Lock } from "lucide-react";
import VinylRowCard from "./VinylRowCard";
import VinylEditDialog from "./VinylEditDialog";
import { VINYL_CATEGORIES, VINYL_USE_CASES, filterVinylForScope } from "./vinylConstants";

const SCOPE_META = {
  master:           { label: "All Vinyl", color: "text-blue-600",    accent: "bg-blue-50 border-blue-200" },
  channel_letters:  { label: "Channel & Dimensional Letters", color: "text-purple-600", accent: "bg-purple-50 border-purple-200" },
  sign_maintenance: { label: "Sign Maintenance",  color: "text-cyan-600", accent: "bg-cyan-50 border-cyan-200" },
};

const blankVinyl = (scope) => ({
  vinyl_name: "New Vinyl",
  vinyl_category: "calendered",
  vinyl_use_case: "cut_graphics",
  finish: "gloss",
  roll_width_inches: 24,
  roll_length_yards: 50,
  thickness_mil: 2,
  pricing_mode: "per_roll",
  cost_per_roll: 0,
  waste_factor_percent: 15,
  yield_factor: 0.85,
  adhesive_type: "permanent",
  application_method: "either",
  indoor_outdoor: "both",
  weeding_difficulty: "moderate",
  is_active: true,
  show_in_channel_letters: scope !== "sign_maintenance",
  show_in_sign_maintenance: scope !== "channel_letters",
  show_in_vinyl_estimator: true,
});

export default function VinylInventoryTab({ scope = "master" }) {
  const meta = SCOPE_META[scope] || SCOPE_META.master;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [useCaseFilter, setUseCaseFilter] = useState("all");
  const [editingVinyl, setEditingVinyl] = useState(null);
  const isAdmin = user?.role === "admin";

  const load = async () => {
    setLoading(true);
    try {
      const all = await VinylInventory.list("sort_order");
      setItems(all);
    } catch (e) {
      console.error("Failed to load VinylInventory:", e);
      setItems([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    User.me().then(setUser).catch(() => setUser(null));
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = filterVinylForScope(items, scope);
    if (categoryFilter !== "all") list = list.filter(v => v.vinyl_category === categoryFilter);
    if (useCaseFilter !== "all")  list = list.filter(v => v.vinyl_use_case === useCaseFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        [v.vinyl_name, v.manufacturer, v.product_series, v.color_name, v.supplier, v.supplier_sku, v.notes]
          .filter(Boolean).some(s => String(s).toLowerCase().includes(q))
      );
    }
    return list;
  }, [items, scope, search, categoryFilter, useCaseFilter]);

  const handleAdd = async () => {
    if (!isAdmin) return;
    try {
      const created = await VinylInventory.create({ ...blankVinyl(scope), sort_order: items.length + 1 });
      setItems(prev => [created, ...prev]);
      setEditingVinyl(created);
    } catch (e) {
      console.error(e);
      alert("Failed to add vinyl: " + e.message);
    }
  };

  const handleDialogSave = async (draft) => {
    if (!draft?.id) return;
    try {
      const { id, created_date, updated_date, created_by_id, ...patch } = draft;
      const updated = await VinylInventory.update(id, patch);
      setItems(prev => prev.map(v => v.id === id ? { ...v, ...patch, ...(updated || {}) } : v));
      setEditingVinyl(null);
    } catch (e) {
      console.error(e);
      alert("Save failed: " + e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!isAdmin) return;
    if (!confirm("Delete this vinyl?")) return;
    try {
      await VinylInventory.delete(id);
      setItems(prev => prev.filter(v => v.id !== id));
    } catch (e) {
      console.error(e);
      alert("Delete failed: " + e.message);
    }
  };

  // #13 Quick-duplicate. Auto-links rows into a product group so the roll-width
  // recommender can find them. If the source has no product_group_key, we
  // generate one and stamp it on both rows.
  const handleDuplicate = async (source) => {
    if (!isAdmin || !source) return;
    try {
      // eslint-disable-next-line no-unused-vars
      const { id, created_date, updated_date, created_by_id, ...rest } = source;
      let groupKey = source.product_group_key;
      if (!groupKey) {
        groupKey = `grp-${id || Math.random().toString(36).slice(2, 9)}`;
        await VinylInventory.update(id, { product_group_key: groupKey });
      }
      const copy = {
        ...rest,
        product_group_key: groupKey,
        vinyl_name: `${source.vinyl_name || "Vinyl"} (copy)`,
        sort_order: (source.sort_order || 0) + 0.1,
      };
      const created = await VinylInventory.create(copy);
      setItems(prev => prev.map(v => v.id === id ? { ...v, product_group_key: groupKey } : v));
      setItems(prev => [created, ...prev]);
      setEditingVinyl(created);
    } catch (e) {
      console.error(e);
      alert("Duplicate failed: " + e.message);
    }
  };

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Droplets className={`w-5 h-5 ${meta.color}`} />
            Vinyl Inventory
            <Badge variant="outline" className={`ml-1 text-[10px] ${meta.accent}`}>{meta.label}</Badge>
            <Badge variant="outline" className="ml-1 font-normal">{filtered.length} of {items.length}</Badge>
          </CardTitle>

          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search vinyl…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 text-sm w-40"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {VINYL_CATEGORIES.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={useCaseFilter} onValueChange={setUseCaseFilter}>
              <SelectTrigger className="h-9 text-sm w-44"><SelectValue placeholder="Use Case" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Use Cases</SelectItem>
                {VINYL_USE_CASES.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {isAdmin ? (
              <Button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 text-white h-9">
                <Plus className="w-4 h-4 mr-1" /> Add Vinyl
              </Button>
            ) : (
              <Badge variant="outline" className="self-center text-[11px] inline-flex items-center gap-1">
                <Lock className="w-3 h-3" /> View only
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading vinyl inventory…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-lg">
            No vinyl in this view.
            {isAdmin && <div className="mt-3"><Button onClick={handleAdd} size="sm" className="bg-blue-600 text-white"><Plus className="w-4 h-4 mr-1" /> Add the first one</Button></div>}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(v => (
              <VinylRowCard
                key={v.id}
                vinyl={v}
                isAdmin={isAdmin}
                groupSiblings={items.filter(x => x.id !== v.id && v.product_group_key && x.product_group_key === v.product_group_key)}
                onEdit={() => setEditingVinyl(v)}
                onDelete={() => handleDelete(v.id)}
                onDuplicate={() => handleDuplicate(v)}
              />
            ))}
          </div>
        )}
      </CardContent>

      <VinylEditDialog
        open={!!editingVinyl}
        vinyl={editingVinyl}
        isAdmin={isAdmin}
        onSave={handleDialogSave}
        onClose={() => setEditingVinyl(null)}
      />
    </Card>
  );
}