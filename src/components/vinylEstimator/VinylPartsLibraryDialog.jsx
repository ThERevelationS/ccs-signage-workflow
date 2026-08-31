// Saved Parts Library — pick reusable part templates to add to a workflow. Feature #31.

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { VinylPartTemplate } from "@/entities/all";
import { BookmarkPlus, Plus, Trash2, Search } from "lucide-react";

export default function VinylPartsLibraryDialog({ open, onClose, onPick }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  // Add-new fields
  const [newName, setNewName] = useState("");
  const [newW, setNewW] = useState(12);
  const [newH, setNewH] = useState(12);

  const load = async () => {
    setLoading(true);
    try { setTemplates(await VinylPartTemplate.list("sort_order")); }
    catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open]);

  const handleSaveNew = async () => {
    if (!newName.trim()) return;
    await VinylPartTemplate.create({
      name: newName.trim(),
      width_inches: parseFloat(newW) || 0,
      height_inches: parseFloat(newH) || 0,
      default_quantity: 1,
      allow_rotation: true,
    });
    setNewName(""); setNewW(12); setNewH(12);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this saved part?")) return;
    await VinylPartTemplate.delete(id);
    load();
  };

  const handlePick = (t) => {
    onPick({
      id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      description: t.name,
      width_inches: t.width_inches,
      height_inches: t.height_inches,
      quantity: t.default_quantity || 1,
      bleed_inches: t.bleed_inches || 0,
      allow_rotation: t.allow_rotation !== false,
    });
    onClose();
  };

  const filtered = templates.filter(t => !q || t.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkPlus className="w-5 h-5 text-blue-600" /> Saved Parts Library
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8 pl-8 text-sm" />
          </div>

          <div className="max-h-72 overflow-auto border border-slate-200 rounded">
            {loading ? (
              <div className="p-4 text-center text-xs text-slate-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                {templates.length === 0 ? "No saved parts yet. Add one below." : "No matches."}
              </div>
            ) : filtered.map(t => (
              <div key={t.id} className="flex items-center gap-2 p-2 border-b border-slate-100 hover:bg-slate-50 last:border-b-0">
                <button onClick={() => handlePick(t)} className="flex-1 text-left text-sm">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-[11px] text-slate-500 tabular-nums">{t.width_inches}″ × {t.height_inches}″</div>
                </button>
                <Button size="icon" variant="ghost" onClick={() => handlePick(t)} className="h-7 w-7 text-blue-600">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => handleDelete(t.id)} className="h-7 w-7 text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 pt-3 space-y-2">
            <Label className="text-xs">Save a new part</Label>
            <div className="grid grid-cols-[1fr_70px_70px_auto] gap-2">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. 12×12 cooler decal" className="h-8 text-sm" />
              <Input type="number" step="0.125" value={newW} onChange={(e) => setNewW(e.target.value)} className="h-8 text-sm tabular-nums" />
              <Input type="number" step="0.125" value={newH} onChange={(e) => setNewH(e.target.value)} className="h-8 text-sm tabular-nums" />
              <Button size="sm" onClick={handleSaveNew} disabled={!newName.trim()} className="h-8">Save</Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}