import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Trash2, Check, Loader2, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { softDeleteWorkOrderFromLoadedSnapshot } from "@/components/workflow/workOrderPersistence";

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
  const [actionError, setActionError] = useState("");

  // Sort by score descending - best record first
  const sorted = [...group].sort((a, b) => scoreRecord(b) - scoreRecord(a));
  const best = sorted[0];

  const handleDeleteOne = async (wo) => {
    setDeleting(wo.id);
    setActionError("");
    try {
      await softDeleteWorkOrderFromLoadedSnapshot({
        workOrder: wo,
        deletedBy: "bulk_dedup",
        label: "Duplicate cleanup delete",
      });
      onResolved(wo.id);
    } catch (error) {
      console.error("Duplicate cleanup delete blocked:", error);
      setActionError(error?.message || "This duplicate Work Order changed after the group was loaded. Refresh duplicate cleanup before deleting it.");
    } finally {
      setDeleting(null);
    }
  };

  const handleKeepOne = async (keepWo) => {
    setKeeping(keepWo.id);
    setActionError("");
    const toDelete = group.filter(w => w.id !== keepWo.id);
    const deletedIds = [];
    try {
      // Verify the complete loaded duplicate group before deleting any record.
      for (const wo of group) {
        const latest = await WorkOrder.get(wo.id);
        if (!latest?.id || latest.deleted === true || latest.updated_date !== wo.updated_date) {
          throw new Error(`Duplicate cleanup was blocked because ${wo.client_name || wo.title || wo.id} changed after this duplicate group was loaded.`);
        }
      }
      for (const wo of toDelete) {
        await softDeleteWorkOrderFromLoadedSnapshot({
          workOrder: wo,
          deletedBy: "bulk_dedup",
          label: "Duplicate cleanup keep-best",
        });
        deletedIds.push(wo.id);
      }
      onResolved(...deletedIds);
    } catch (error) {
      console.error("Duplicate cleanup keep-best stopped:", error);
      if (deletedIds.length > 0) onResolved(...deletedIds);
      const progress = deletedIds.length > 0
        ? ` ${deletedIds.length} duplicate record${deletedIds.length === 1 ? " was" : "s were"} already moved to Project Trash and can be recovered there.`
        : " No duplicate records were deleted.";
      setActionError(`${error?.message || "Duplicate cleanup could not be completed."}${progress}`);
    } finally {
      setKeeping(null);
    }
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
  const [readError, setReadError] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);

  const loadAndGroup = async () => {
    setLoading(true);
    setReadError("");
    try {
      const all = await loadAllEntityRows({
        entity: WorkOrder,
        query: { deleted: { $ne: true }, completed: { $ne: true }, is_rider: { $ne: true } },
        sort: "created_date",
        label: "Duplicate Cleanup Work Orders",
      });

    // Normalize: strip punctuation, collapse whitespace
    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    
    // Group by normalized client name
    const byName = {};
    for (const wo of all) {
      const key = normalize(wo.client_name);
      if (!key) continue;
      if (!byName[key]) byName[key] = [];
      byName[key].push(wo);
    }

    // Within each client group, identify TRUE duplicates:
    // - Same est_inv_at number = definite duplicate
    // - Both have NO est_inv_at and same/similar title = likely duplicate
    // - Both have NO est_inv_at and no meaningful title = likely duplicate
    // Different est_inv_at numbers = different jobs, NOT duplicates
    const dupGroups = [];
    for (const [clientKey, records] of Object.entries(byName)) {
      if (records.length <= 1) continue;
      
      // Sub-group by est_inv_at — records sharing the same doc number are true duplicates
      const byDoc = {};
      const noDoc = [];
      for (const wo of records) {
        const doc = (wo.est_inv_at || '').trim();
        if (doc) {
          if (!byDoc[doc]) byDoc[doc] = [];
          byDoc[doc].push(wo);
        } else {
          noDoc.push(wo);
        }
      }
      
      // Add groups with duplicate doc numbers
      for (const docRecords of Object.values(byDoc)) {
        if (docRecords.length > 1) dupGroups.push(docRecords);
      }
      
      // For records with no doc number, sub-group by normalized title
      if (noDoc.length > 1) {
        const byTitle = {};
        for (const wo of noDoc) {
          const normTitle = normalize(wo.title);
          // If title is just the client name or empty, use a special key
          const titleKey = (!normTitle || normTitle === clientKey) ? '__bare__' : normTitle;
          if (!byTitle[titleKey]) byTitle[titleKey] = [];
          byTitle[titleKey].push(wo);
        }
        for (const titleRecords of Object.values(byTitle)) {
          if (titleRecords.length > 1) dupGroups.push(titleRecords);
        }
      }
    }

    // Sort by most duplicates first
      dupGroups.sort((a, b) => b.length - a.length);
      setGroups(dupGroups);
    } catch (error) {
      console.error("Error verifying duplicate cleanup data:", error);
      setGroups([]);
      setReadError(error?.message || "Duplicate Cleanup Work Orders could not be verified completely.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAndGroup(); }, []);

  const handleResolved = (...deletedIds) => {
    setGroups(prev => {
      const updated = prev.map(g => g.filter(w => !deletedIds.includes(w.id))).filter(g => g.length > 1);
      return updated;
    });
  };

  const handleDeleteAllExtras = async () => {
    if (readError) return;
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

  if (readError) {
    return (
      <div className="text-center py-10">
        <AlertTriangle className="w-9 h-9 mx-auto mb-2 text-red-500" />
        <p className="text-sm font-bold text-red-700">Duplicate cleanup data could not be verified.</p>
        <p className="text-xs text-red-600 mt-1">{readError}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={loadAndGroup}>Retry</Button>
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