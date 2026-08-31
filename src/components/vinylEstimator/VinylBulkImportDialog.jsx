// Paste a CSV/Excel-style list of parts. Feature #17.
// Accepts tab or comma delimited: Description, Width, Height, Qty, [Bleed]
// One row per line.

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ClipboardPaste, AlertCircle } from "lucide-react";

const parseRows = (raw) => {
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  const items = [];
  const errors = [];
  lines.forEach((line, i) => {
    // Skip obvious header rows
    if (i === 0 && /description|width|height/i.test(line)) return;
    const cols = line.split(/\t|,(?![^"]*"\s*(?:,|$))/).map(c => c.replace(/^"|"$/g, "").trim());
    if (cols.length < 3) {
      errors.push(`Line ${i + 1}: need at least Description, Width, Height.`);
      return;
    }
    const [desc, w, h, qty, bleed] = cols;
    const wn = parseFloat(w), hn = parseFloat(h);
    if (!isFinite(wn) || wn <= 0 || !isFinite(hn) || hn <= 0) {
      errors.push(`Line ${i + 1}: invalid width/height.`);
      return;
    }
    items.push({
      id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${i}`,
      description: desc || `Imported ${i + 1}`,
      width_inches: wn,
      height_inches: hn,
      quantity: Math.max(1, parseInt(qty) || 1),
      bleed_inches: parseFloat(bleed) || 0,
      allow_rotation: true,
    });
  });
  return { items, errors };
};

export default function VinylBulkImportDialog({ open, onClose, onImport }) {
  const [raw, setRaw] = useState("");
  const { items, errors } = parseRows(raw);

  const handleImport = () => {
    if (items.length === 0) return;
    onImport(items);
    setRaw("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="w-5 h-5 text-blue-600" /> Bulk Import Parts
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Paste rows from Excel, Google Sheets, or a CSV. Columns: <b>Description, Width, Height, Qty, Bleed</b> (Bleed optional).
            Tab or comma-separated. Header row is auto-skipped.
          </p>
          <Label className="text-xs">Paste here</Label>
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={`Cooler decal\t12\t12\t10\nDoor logo\t24\t6\t2\t0.125`}
            className="h-48 font-mono text-xs"
          />
          {errors.length > 0 && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 space-y-1">
              <div className="flex items-center gap-1 font-semibold"><AlertCircle className="w-3.5 h-3.5" /> Skipped {errors.length} row(s)</div>
              {errors.slice(0, 5).map((e, i) => <div key={i}>• {e}</div>)}
              {errors.length > 5 && <div>… and {errors.length - 5} more.</div>}
            </div>
          )}
          {items.length > 0 && (
            <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800">
              ✓ Ready to import <b>{items.length}</b> part(s).
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleImport} disabled={items.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white">
            Import {items.length > 0 ? `${items.length} Part${items.length === 1 ? "" : "s"}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}