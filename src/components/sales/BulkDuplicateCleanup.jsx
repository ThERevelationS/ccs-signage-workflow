import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Trash2, Check, Loader2, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

const WorkOrder = base44.entities.WorkOrder;

function scoreRecord(wo) {
  // Higher score = more data = better to keep
  let score = 0;
  if (wo.est_inv_at) score += 10;
  if (wo.corbridge_invoice_number) score += 10;
  if (wo.title && wo.title !== wo.client_name) score += 5;
  if (wo.description) score += 3;
  if (wo.quoted_amount) score += 4;
  if (wo.estimate_amount) score += 4;
  if (wo.contact_name) score += 3;
  if (wo.contact_email) score += 3;
  if (wo.contact_phone) score += 2;
  if (wo.current_task_description) score += 2;
  if (wo.work_notes?.length > 0) score += 5;
  if (wo.notes?.length > 0) score += 5;
  if (wo.current_task_assigned_to) score += 2;
  if (wo.designer) score += 1;
  if (wo.date_estimate_sent) score += 2;
  return score;
}

function DuplicateGroup({ group, onResolved }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [keeping, setKeeping] = useState(null);

  // Sort by score descending - best record first
  const sorted = [...group].sort((a, b) => scoreRecord(b) - scoreRecord(a));
  const best = sorted[0];

  const handleDeleteOne = async (wo) => {
    setDeleting(wo.id);
    await WorkOrder.update(wo.id, { deleted: true, deleted_at: new Date().toISOString(), deleted_by: 'bulk_dedup' });
    setDeleting(null);
    onResolved(wo.id);
  };

  const handleKeepOne = async (keepWo) => {
    setKeeping(keepWo.id);
    const toDelete = group.filter(w => w.id !== keepWo.id);
    await Promise.all(toDelete.map(wo =>
      WorkOrder.update(wo.id, { deleted: true, deleted_at: new Date().toISOString(), deleted_by: 'bulk_dedup' })
    ));
    setKeeping(null);
    onResolved(...toDelete.map(w => w.id));
  };

  return (
    <div className="border-2 border-orange-200 rounded-xl bg-orange-50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <span className="font-bold text-gray-900 truncate">{group[0].client_name}</span>
          <Badge className="bg-orange-100 text-orange-800 flex-shrink-0">{group.length} duplicates</Badge>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
            onClick={() => handleKeepOne(best)}
            disabled={!!keeping}
          >
            {keeping ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
            Keep Best, Delete Rest
          </Button>
          <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2 mt-2">
          {sorted.map((wo, idx) => {
            const score = scoreRecord(wo);
            const isBest = idx === 0;
            return (
              <div key={wo.id} className={`bg-white rounded-lg border p-3 text-xs flex gap-3 items-start ${isBest ? 'border-green-300 ring-1 ring-green-200' : 'border-gray-200'}`}>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isBest && <Badge className="bg-green-100 text-green-800 text-[10px]">⭐ Best Record</Badge>}
                    <span className="text-gray-400">Score: {score}</span>
                    <span className="text-gray-400">Stage: {wo.current_stage}</span>
                    {wo.est_inv_at && <span className="text-blue-600">Est/Inv: {wo.est_inv_at}</span>}
                  </div>
                  {wo.title && wo.title !== wo.client_name && (
                    <p className="text-gray-600 truncate">{wo.title?.substring(0, 80)}</p>
                  )}
                  <div className="flex flex-wrap gap-3 text-gray-500">
                    {wo.estimate_amount && <span>${Number(wo.estimate_amount).toLocaleString()}</span>}
                    {wo.current_task_assigned_to && <span>→ {wo.current_task_assigned_to}</span>}
                    {wo.work_notes?.length > 0 && <span>{wo.work_notes.length} notes</span>}
                    {wo.notes?.length > 0 && <span>{wo.notes.length} tasks</span>}
                    <span className="text-gray-400">Created: {new Date(wo.created_date).toLocaleDateString()}</span>
                  </div>
                </div>
                {!isBest && (
                  <Button size="sm" variant="destructive" className="h-7 text-xs flex-shrink-0"
                    onClick={() => handleDeleteOne(wo)}
                    disabled={deleting === wo.id}
                  >
                    {deleting === wo.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
                    Delete
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BulkDuplicateCleanup() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingAll, setDeletingAll] = useState(false);

  const loadAndGroup = async () => {
    setLoading(true);
    const all = await WorkOrder.filter({ deleted: { $ne: true }, completed: { $ne: true }, is_rider: { $ne: true } });

    // Group by normalized client name
    const byName = {};
    for (const wo of all) {
      const key = (wo.client_name || '').toLowerCase().trim();
      if (!key) continue;
      if (!byName[key]) byName[key] = [];
      byName[key].push(wo);
    }

    // Only groups with more than 1
    const dupGroups = Object.values(byName).filter(g => g.length > 1);
    // Sort by most duplicates first
    dupGroups.sort((a, b) => b.length - a.length);
    setGroups(dupGroups);
    setLoading(false);
  };

  useEffect(() => { loadAndGroup(); }, []);

  const handleResolved = (...deletedIds) => {
    setGroups(prev => {
      const updated = prev.map(g => g.filter(w => !deletedIds.includes(w.id))).filter(g => g.length > 1);
      return updated;
    });
  };

  const handleDeleteAllExtras = async () => {
    setDeletingAll(true);
    const toDeleteAll = [];
    for (const group of groups) {
      const sorted = [...group].sort((a, b) => scoreRecord(b) - scoreRecord(a));
      toDeleteAll.push(...sorted.slice(1));
    }

    const BATCH_SIZE = 5;
    const DELAY_MS = 600;
    let count = 0;
    for (let i = 0; i < toDeleteAll.length; i += BATCH_SIZE) {
      const batch = toDeleteAll.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(wo =>
        WorkOrder.update(wo.id, { deleted: true, deleted_at: new Date().toISOString(), deleted_by: 'bulk_dedup_all' })
      ));
      count += batch.length;
      if (i + BATCH_SIZE < toDeleteAll.length) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    setDeletingAll(false);
    await loadAndGroup();
    alert(`Done! Deleted ${count} duplicate records.`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-orange-500 mr-2" />
        <span className="text-sm text-gray-500">Scanning for duplicates...</span>
      </div>
    );
  }

  const totalExtras = groups.reduce((sum, g) => sum + g.length - 1, 0);

  if (groups.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Check className="w-10 h-10 mx-auto mb-2 text-green-400" />
        <p className="text-sm font-medium">No exact-name duplicates found!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-semibold text-orange-700">
            {groups.length} duplicate groups · {totalExtras} extra records to remove
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Grouped by exact client name. "Best" = record with the most data.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={loadAndGroup} className="h-8 text-xs">
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
          <Button size="sm" variant="destructive" onClick={handleDeleteAllExtras} disabled={deletingAll} className="h-8 text-xs">
            {deletingAll ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}
            Auto-Clean All ({totalExtras} records)
          </Button>
        </div>
      </div>

      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {groups.map((group, idx) => (
          <DuplicateGroup key={group[0].client_name + idx} group={group} onResolved={handleResolved} />
        ))}
      </div>
    </div>
  );
}