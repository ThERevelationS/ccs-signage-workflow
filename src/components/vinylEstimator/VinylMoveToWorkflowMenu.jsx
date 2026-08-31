// Tiny menu to move a part from one workflow to another. Feature #15.

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function VinylMoveToWorkflowMenu({ open, onClose, workflows, currentWorkflowIdx, onMove }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Move part to…</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          {workflows.map((wf, i) => (
            <Button
              key={wf.id}
              variant="outline"
              disabled={i === currentWorkflowIdx}
              onClick={() => onMove(i)}
              className="w-full justify-start h-9 text-sm"
            >
              <span className="w-3 h-3 rounded-full mr-2" style={{ background: wf.color_tag || "#3b82f6" }} />
              {wf.name || `Workflow ${i + 1}`}
              {i === currentWorkflowIdx && <span className="ml-auto text-[10px] text-slate-400">(current)</span>}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}