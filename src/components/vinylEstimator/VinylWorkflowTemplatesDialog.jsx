// Save & apply workflow templates. Feature #16.
// "3M IJ180 + 8508 on HP360+Graphtec" → one click to populate a new workflow.

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { VinylWorkflowTemplate } from "@/entities/all";
import { Bookmark, Plus, Trash2 } from "lucide-react";

export default function VinylWorkflowTemplatesDialog({
  open, onClose, mode = "apply", currentWorkflow, onApply,
}) {
  const [templates, setTemplates] = useState([]);
  const [newName, setNewName] = useState("");

  const load = async () => setTemplates(await VinylWorkflowTemplate.list("sort_order"));
  useEffect(() => { if (open) load(); }, [open]);

  const handleSave = async () => {
    if (!newName.trim()) return;
    await VinylWorkflowTemplate.create({
      name: newName.trim(),
      vinyl_id:     currentWorkflow.vinyl_id     || "",
      laminate_id:  currentWorkflow.laminate_id  || "",
      printer_id:   currentWorkflow.printer_id   || "",
      cutter_id:    currentWorkflow.cutter_id    || "",
      laminator_id: currentWorkflow.laminator_id || "",
      apply_print:    currentWorkflow.apply_print,
      apply_cut:      currentWorkflow.apply_cut,
      apply_laminate: currentWorkflow.apply_laminate,
      preset_key:     currentWorkflow.preset_key || "",
      color_tag:      currentWorkflow.color_tag  || "",
    });
    setNewName("");
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this template?")) return;
    await VinylWorkflowTemplate.delete(id);
    load();
  };

  const handleApply = (t) => {
    onApply({
      vinyl_id:     t.vinyl_id     || "",
      laminate_id:  t.laminate_id  || "",
      printer_id:   t.printer_id   || "",
      cutter_id:    t.cutter_id    || "",
      laminator_id: t.laminator_id || "",
      apply_print:    !!t.apply_print,
      apply_cut:      !!t.apply_cut,
      apply_laminate: !!t.apply_laminate,
      preset_key:     t.preset_key || "",
      color_tag:      t.color_tag  || "",
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-blue-600" /> Workflow Templates
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {templates.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-4">No templates saved yet.</div>
          ) : (
            <div className="border border-slate-200 rounded divide-y divide-slate-100 max-h-64 overflow-auto">
              {templates.map(t => (
                <div key={t.id} className="flex items-center gap-2 p-2 hover:bg-slate-50">
                  {t.color_tag && <span className="w-3 h-3 rounded-full" style={{ background: t.color_tag }} />}
                  <button onClick={() => handleApply(t)} className="flex-1 text-left text-sm">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-[10px] text-slate-500">
                      {t.preset_key || "custom"} · {[t.apply_print && "print", t.apply_cut && "cut", t.apply_laminate && "lam"].filter(Boolean).join(" + ")}
                    </div>
                  </button>
                  <Button size="icon" variant="ghost" onClick={() => handleApply(t)} className="h-7 w-7 text-blue-600" title="Apply">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(t.id)} className="h-7 w-7 text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {mode === "save" && currentWorkflow && (
            <div className="border-t border-slate-200 pt-3 space-y-2">
              <Label className="text-xs">Save current workflow as template</Label>
              <div className="flex gap-2">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. 3M IJ180 + 8508 on HP360" className="h-8 text-sm" />
                <Button size="sm" onClick={handleSave} disabled={!newName.trim()} className="h-8">Save</Button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}