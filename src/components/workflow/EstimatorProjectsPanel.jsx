import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { syncEstimatorProject } from "@/functions/syncEstimatorProject";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ExternalLink, RefreshCw, Link2, Unlink, ChevronDown, ChevronRight,
  DollarSign, Hammer, Loader2, Building2, AlertCircle
} from "lucide-react";

const formatCurrency = (val) => {
  if (val == null || val === 0) return null;
  return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function ProjectCard({ project, onUnlink, expanded, onToggle }) {
  const totalCost = (project.total_labor_cost || 0) + (project.total_concrete_cost || 0) + 
    (project.total_rebar_cost || 0) + (project.total_pole_cost || 0) + 
    (project.total_brick_cost || 0) + (project.total_wall_cost || 0) +
    (project.total_forming_materials_cost || 0);

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <div 
        className="flex items-center gap-2 p-2 cursor-pointer hover:bg-gray-50"
        onClick={onToggle}
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        <Building2 className="w-4 h-4 text-blue-600" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{project.project_name || 'Untitled'}</div>
          <div className="text-xs text-gray-500">
            {project.estimate_number && <span>EST #{project.estimate_number} · </span>}
            {totalCost > 0 && <span className="font-medium text-green-700">{formatCurrency(totalCost)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {project.estimator_app_url && (
            <a
              href={project.estimator_app_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 hover:bg-blue-50 rounded text-blue-600"
              title="Open in Estimator App"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          {project.hyperlink && (
            <a
              href={project.hyperlink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 hover:bg-purple-50 rounded text-purple-600"
              title="Open in Corebridge"
            >
              <Link2 className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onUnlink(project.id); }}
            className="p-1 hover:bg-red-50 rounded text-red-400"
            title="Unlink from work order"
          >
            <Unlink className="w-3 h-3" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t bg-gray-50 space-y-2">
          {/* Cost Breakdown */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {formatCurrency(project.total_labor_cost) && (
              <div className="flex justify-between"><span className="text-gray-500">Labor:</span><span className="font-medium">{formatCurrency(project.total_labor_cost)}</span></div>
            )}
            {formatCurrency(project.total_concrete_cost) && (
              <div className="flex justify-between"><span className="text-gray-500">Concrete:</span><span className="font-medium">{formatCurrency(project.total_concrete_cost)}</span></div>
            )}
            {formatCurrency(project.total_rebar_cost) && (
              <div className="flex justify-between"><span className="text-gray-500">Rebar:</span><span className="font-medium">{formatCurrency(project.total_rebar_cost)}</span></div>
            )}
            {formatCurrency(project.total_brick_cost) && (
              <div className="flex justify-between"><span className="text-gray-500">Brick:</span><span className="font-medium">{formatCurrency(project.total_brick_cost)}</span></div>
            )}
            {formatCurrency(project.total_pole_cost) && (
              <div className="flex justify-between"><span className="text-gray-500">Pole:</span><span className="font-medium">{formatCurrency(project.total_pole_cost)}</span></div>
            )}
            {formatCurrency(project.total_wall_cost) && (
              <div className="flex justify-between"><span className="text-gray-500">Wall:</span><span className="font-medium">{formatCurrency(project.total_wall_cost)}</span></div>
            )}
            {formatCurrency(project.total_forming_materials_cost) && (
              <div className="flex justify-between"><span className="text-gray-500">Forming:</span><span className="font-medium">{formatCurrency(project.total_forming_materials_cost)}</span></div>
            )}
          </div>

          {/* Details */}
          <div className="text-xs space-y-1">
            {project.excavation_method && (
              <div className="flex items-center gap-1">
                <Hammer className="w-3 h-3 text-gray-400" />
                <span className="text-gray-500">Excavation:</span>
                <span>{project.excavation_method.replace(/_/g, ' ')}</span>
              </div>
            )}
            {project.walls?.length > 0 && (
              <div className="text-gray-500">{project.walls.length} wall/footing spec{project.walls.length !== 1 ? 's' : ''}</div>
            )}
            {project.selected_equipment?.length > 0 && (
              <div className="text-gray-500">{project.selected_equipment.length} equipment item{project.selected_equipment.length !== 1 ? 's' : ''}</div>
            )}
            {project.notes && (
              <div className="text-gray-600 italic mt-1">{project.notes}</div>
            )}
          </div>

          {/* Sync info */}
          <div className="text-xs text-gray-400 pt-1 border-t">
            Last synced: {project.last_synced ? new Date(project.last_synced).toLocaleString() : 'Never'}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EstimatorProjectsPanel({ workOrderId, clientName }) {
  const [linkedProjects, setLinkedProjects] = useState([]);
  const [unlinkedProjects, setUnlinkedProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showUnlinked, setShowUnlinked] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState(null);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await syncEstimatorProject({ action: 'getForWorkOrder', work_order_id: workOrderId });
      setLinkedProjects(res.data?.projects || []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const loadUnlinked = async () => {
    try {
      const res = await syncEstimatorProject({ action: 'getUnlinked' });
      setUnlinkedProjects(res.data?.projects || []);
    } catch (e) {
      console.error('Error loading unlinked:', e);
    }
  };

  useEffect(() => {
    if (workOrderId) loadProjects();
  }, [workOrderId]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncEstimatorProject({ action: 'syncAll' });
      await loadProjects();
    } catch (e) {
      console.error('Sync error:', e);
    }
    setSyncing(false);
  };

  const handleLink = async (estimatorProjectId) => {
    try {
      await syncEstimatorProject({ action: 'linkToWorkOrder', estimator_project_id: estimatorProjectId, work_order_id: workOrderId });
      await loadProjects();
      await loadUnlinked();
    } catch (e) {
      console.error('Link error:', e);
    }
  };

  const handleUnlink = async (estimatorProjectId) => {
    try {
      await syncEstimatorProject({ action: 'unlinkFromWorkOrder', estimator_project_id: estimatorProjectId });
      await loadProjects();
      if (showUnlinked) await loadUnlinked();
    } catch (e) {
      console.error('Unlink error:', e);
    }
  };

  const toggleShowUnlinked = () => {
    if (!showUnlinked) loadUnlinked();
    setShowUnlinked(!showUnlinked);
  };

  // Filter unlinked by client name match
  const matchingUnlinked = clientName 
    ? unlinkedProjects.filter(p => p.client_name?.toLowerCase().includes(clientName.toLowerCase()))
    : [];
  const otherUnlinked = clientName
    ? unlinkedProjects.filter(p => !p.client_name?.toLowerCase().includes(clientName.toLowerCase()))
    : unlinkedProjects;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold flex items-center gap-1.5">
          <DollarSign className="w-4 h-4 text-green-600" />
          Foundation Estimates
          {linkedProjects.length > 0 && (
            <Badge variant="secondary" className="text-xs">{linkedProjects.length}</Badge>
          )}
        </h4>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="h-7 text-xs"
            title="Sync from Estimator App"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${syncing ? 'animate-spin' : ''}`} />
            Sync
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleShowUnlinked}
            className="h-7 text-xs"
          >
            <Link2 className="w-3 h-3 mr-1" />
            {showUnlinked ? 'Hide' : 'Link'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <div className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {error}
        </div>
      ) : linkedProjects.length === 0 ? (
        <div className="text-xs text-gray-400 py-2 text-center border border-dashed rounded-lg">
          No foundation estimates linked yet
        </div>
      ) : (
        <div className="space-y-1.5">
          {linkedProjects.map(p => (
            <ProjectCard 
              key={p.id} 
              project={p} 
              onUnlink={handleUnlink}
              expanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
            />
          ))}
        </div>
      )}

      {/* Link Unlinked Projects */}
      {showUnlinked && (
        <div className="border-t pt-2 mt-2">
          <p className="text-xs font-medium text-gray-500 mb-1">Available to Link:</p>
          
          {matchingUnlinked.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-green-600 font-medium mb-1">Matching "{clientName}":</p>
              {matchingUnlinked.map(p => (
                <div key={p.id} className="flex items-center gap-2 p-1.5 rounded border bg-green-50 border-green-200 mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{p.project_name || 'Untitled'}</div>
                    <div className="text-xs text-gray-500">{p.client_name} {p.estimate_number && `· EST #${p.estimate_number}`}</div>
                  </div>
                  <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => handleLink(p.id)}>
                    <Link2 className="w-3 h-3 mr-1" /> Link
                  </Button>
                </div>
              ))}
            </div>
          )}
          
          {otherUnlinked.length > 0 && (
            <div>
              {matchingUnlinked.length > 0 && <p className="text-xs text-gray-400 font-medium mb-1">Other projects:</p>}
              {otherUnlinked.map(p => (
                <div key={p.id} className="flex items-center gap-2 p-1.5 rounded border bg-white mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{p.project_name || 'Untitled'}</div>
                    <div className="text-xs text-gray-500">{p.client_name} {p.estimate_number && `· EST #${p.estimate_number}`}</div>
                  </div>
                  <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => handleLink(p.id)}>
                    <Link2 className="w-3 h-3 mr-1" /> Link
                  </Button>
                </div>
              ))}
            </div>
          )}

          {unlinkedProjects.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-2">No unlinked projects. Try syncing first.</div>
          )}
        </div>
      )}
    </div>
  );
}