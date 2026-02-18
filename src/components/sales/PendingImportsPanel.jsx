import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, GitMerge, X, ChevronDown, ChevronUp, 
  AlertTriangle, FileText, Loader2, RefreshCw, User, 
  MapPin, DollarSign, Star, Package, AlignLeft, Sparkles, Info
} from "lucide-react";
import WorkOrderForm from "@/components/workflow/WorkOrderForm";
import { findPendingImportMatches } from "@/functions/findPendingImportMatches";

const PendingImport = base44.entities.PendingImport;
const WorkOrder = base44.entities.WorkOrder;

function MatchScoreBadge({ score }) {
  const color = score >= 75 ? "bg-green-100 text-green-800" : score >= 50 ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      <Star className="w-3 h-3" /> {score}%
    </span>
  );
}

// Convert extracted AI data into a WorkOrderForm-compatible initialData object
function buildInitialData(item) {
  const ed = item.extracted_data || {};
  const pw = item.proposed_work_order || {};
  const products = (ed.products || []).map((p, i) => ({
    id: `ai_${i}`,
    description: p,
    product_type: ""
  }));
  return {
    title: pw.title || ed.description || `${ed.client_name || ''} - Sign Project`,
    client_name: ed.client_name || pw.client_name || "",
    description: ed.description || pw.description || "",
    current_stage: pw.current_stage || "sales",
    sales_status: pw.sales_status || "quoted",
    in_pipeline: true,
    est_inv_at: item.doc_number,
    corbridge_invoice_number: item.doc_number,
    quoted_amount: ed.quoted_amount || pw.quoted_amount || "",
    estimate_amount: ed.quoted_amount || pw.estimate_amount || "",
    contact_name: ed.contact_name || pw.contact_name || "",
    contact_email: ed.contact_email || pw.contact_email || "",
    contact_phone: ed.contact_phone || pw.contact_phone || "",
    billing_address: ed.billing_address || pw.billing_address || "",
    install_location: ed.install_location || pw.install_location || "",
    representative: ed.contact_name || pw.representative || "",
    sales_rep: ed.sales_rep || pw.sales_rep || "",
    products: products,
    product_1: ed.products?.[0] || pw.product_1 || "",
    product_2: ed.products?.[1] || pw.product_2 || "",
    product_3: ed.products?.[2] || pw.product_3 || "",
    product_4: ed.products?.[3] || pw.product_4 || "",
    product_5: ed.products?.[4] || pw.product_5 || "",
    notes: [],
    follow_up: [],
    completed: false,
    deleted: false,
  };
}

function PendingImportCard({ item, onApprove, onMerge, onReject, allWorkOrders }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedMergeId, setSelectedMergeId] = useState(item.match_candidates?.[0]?.work_order_id || "");
  const [mergeLoading, setMergeLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [aiRecs, setAiRecs] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNoMatchReason, setAiNoMatchReason] = useState(null);
  const [aiConfidence, setAiConfidence] = useState(null);

  const ed = item.extracted_data || {};
  const hasMatches = item.match_candidates?.length > 0;

  const runAiMatch = async () => {
    setAiLoading(true);
    setAiRecs(null);
    setAiNoMatchReason(null);
    try {
      const res = await findPendingImportMatches({ pending_import_id: item.id, extracted_data: ed });
      setAiRecs(res.data?.recommendations || []);
      setAiNoMatchReason(res.data?.no_matches_reason || null);
      setAiConfidence(res.data?.confidence || null);
      // Auto-select top AI recommendation if available
      if (res.data?.recommendations?.length > 0) {
        setSelectedMergeId(res.data.recommendations[0].work_order_id);
      }
    } catch (e) {
      setAiRecs([]);
      setAiNoMatchReason("AI matching failed. Please try again.");
    }
    setAiLoading(false);
  };

  const handleMerge = async () => {
    if (!selectedMergeId) return;
    setMergeLoading(true);
    await onMerge(item, selectedMergeId);
    setMergeLoading(false);
  };

  const handleReject = async () => {
    setRejectLoading(true);
    await onReject(item);
    setRejectLoading(false);
  };

  const handleFormSave = async (formData) => {
    await onApprove(item, formData);
  };

  return (
    <>
      <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <FileText className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-gray-900 text-sm">{item.doc_number}</span>
                <Badge className={item.doc_type === 'estimate' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}>
                  {item.doc_type}
                </Badge>
                {hasMatches && <Badge className="bg-yellow-100 text-yellow-800"><AlertTriangle className="w-3 h-3 mr-1" />Possible Match</Badge>}
              </div>
              <p className="text-xs text-gray-500 truncate">{item.email_subject}</p>
            </div>
          </div>
          <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Summary row — always visible */}
        <div className="flex flex-wrap gap-3 text-xs text-gray-700">
          {ed.client_name && <span className="flex items-center gap-1"><User className="w-3 h-3 text-gray-400" /><strong>{ed.client_name}</strong></span>}
          {ed.quoted_amount && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3 text-gray-400" />${Number(ed.quoted_amount).toLocaleString()}</span>}
          {(ed.install_location || ed.billing_address) && (
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-gray-400" />{(ed.install_location || ed.billing_address)?.substring(0, 50)}</span>
          )}
        </div>

        {/* Project name / description — always visible */}
        {(ed.description || item.proposed_work_order?.title) && (
          <div className="flex items-start gap-1 text-xs text-gray-700">
            <AlignLeft className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
            <span className="font-medium">{ed.description || item.proposed_work_order?.title}</span>
          </div>
        )}

        {/* Products — always visible if present */}
        {ed.products?.length > 0 && (
          <div className="flex items-start gap-1 text-xs text-gray-700">
            <Package className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
            <span>{ed.products.join(' · ')}</span>
          </div>
        )}

        {/* Expanded detail */}
        {expanded && (
          <div className="bg-white rounded-lg p-3 border border-amber-100 text-xs space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {ed.contact_name && <div><span className="text-gray-500">Contact:</span> <span className="font-medium">{ed.contact_name}</span></div>}
              {ed.contact_email && <div><span className="text-gray-500">Email:</span> <span className="font-medium">{ed.contact_email}</span></div>}
              {ed.contact_phone && <div><span className="text-gray-500">Phone:</span> <span className="font-medium">{ed.contact_phone}</span></div>}
              {ed.sales_rep && <div><span className="text-gray-500">Sales Rep:</span> <span className="font-medium">{ed.sales_rep}</span></div>}
              {ed.billing_address && <div className="col-span-2"><span className="text-gray-500">Billing:</span> <span className="font-medium">{ed.billing_address}</span></div>}
            </div>
          </div>
        )}

        {/* AI Match Recommendations */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              AI Project Match
            </p>
            <button
              onClick={runAiMatch}
              disabled={aiLoading}
              className="text-xs flex items-center gap-1 px-2 py-1 rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 disabled:opacity-50"
            >
              {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {aiRecs === null ? "Find Matches" : "Re-run AI"}
            </button>
          </div>

          {aiLoading && (
            <div className="flex items-center gap-2 text-xs text-purple-600 bg-purple-50 rounded-lg p-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              AI is scanning all projects for possible matches…
            </div>
          )}

          {!aiLoading && aiRecs !== null && aiRecs.length === 0 && (
            <div className="flex items-start gap-2 text-xs bg-gray-50 border border-gray-200 rounded-lg p-3">
              <Info className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-gray-700">No matching projects found</p>
                {aiNoMatchReason && <p className="text-gray-500 mt-0.5">{aiNoMatchReason}</p>}
                <p className="text-gray-400 mt-1">Consider creating a new project for this import.</p>
              </div>
            </div>
          )}

          {!aiLoading && aiRecs !== null && aiRecs.length > 0 && (
            <div className="space-y-1">
              {aiConfidence && (
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  AI Confidence: <span className={`font-semibold ${aiConfidence === 'high' ? 'text-green-600' : aiConfidence === 'medium' ? 'text-yellow-600' : 'text-red-500'}`}>{aiConfidence}</span>
                </p>
              )}
              {aiRecs.map(c => (
                <label key={c.work_order_id} className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${selectedMergeId === c.work_order_id ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    name={`merge-${item.id}`}
                    value={c.work_order_id}
                    checked={selectedMergeId === c.work_order_id}
                    onChange={() => setSelectedMergeId(c.work_order_id)}
                    className="shrink-0 mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 truncate">{c.work_order_title}</span>
                      <MatchScoreBadge score={c.match_score} />
                      <span className="text-gray-400 capitalize">{c.current_stage}</span>
                    </div>
                    <p className="text-gray-500">{c.client_name}</p>
                    {c.ai_reasoning && (
                      <p className="text-purple-600 mt-0.5 flex items-start gap-1">
                        <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
                        {c.ai_reasoning}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Fallback: original fuzzy match candidates if AI hasn't run yet */}
          {aiRecs === null && hasMatches && (
            <div className="space-y-1">
              <p className="text-xs text-gray-500 italic">Initial fuzzy matches (run AI for smarter recommendations):</p>
              {item.match_candidates.map(c => (
                <label key={c.work_order_id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${selectedMergeId === c.work_order_id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    name={`merge-${item.id}`}
                    value={c.work_order_id}
                    checked={selectedMergeId === c.work_order_id}
                    onChange={() => setSelectedMergeId(c.work_order_id)}
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 truncate">{c.work_order_title}</span>
                      <MatchScoreBadge score={c.match_score} />
                      <span className="text-gray-400 capitalize">{c.current_stage}</span>
                    </div>
                    <p className="text-gray-500">{c.client_name} · {c.match_reasons?.join(' · ')}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {aiRecs === null && !hasMatches && (
            <p className="text-xs text-gray-400 italic">No initial matches found. Click "Find Matches" to let AI search all projects.</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={() => setShowCreateForm(true)}
            className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Create New Project
          </Button>
          {(hasMatches || (aiRecs && aiRecs.length > 0)) && selectedMergeId && (
            <Button size="sm" onClick={handleMerge} disabled={mergeLoading || !selectedMergeId}
              className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white">
              {mergeLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitMerge className="w-3 h-3 mr-1" />}
              Merge Into Selected
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={handleReject} disabled={rejectLoading}
            className="h-7 text-xs text-red-600 hover:bg-red-50">
            {rejectLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3 mr-1" />} Reject
          </Button>
        </div>
      </div>

      {/* Pre-populated WorkOrderForm */}
      {showCreateForm && (
        <WorkOrderForm
          isOpen={showCreateForm}
          onClose={() => setShowCreateForm(false)}
          initialData={buildInitialData(item)}
          onSave={handleFormSave}
        />
      )}
    </>
  );
}

export default function PendingImportsPanel({ onCountChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allWorkOrders, setAllWorkOrders] = useState([]);

  const load = async () => {
    setLoading(true);
    const [pending, wos] = await Promise.all([
      PendingImport.filter({ status: 'pending' }),
      WorkOrder.filter({ deleted: { $ne: true }, completed: { $ne: true } })
    ]);
    const pendingArr = Array.isArray(pending) ? pending : [];
    setItems(pendingArr);
    setAllWorkOrders(Array.isArray(wos) ? wos : []);
    if (onCountChange) onCountChange(pendingArr.length);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const removeItem = (id) => {
    setItems(prev => {
      const updated = prev.filter(i => i.id !== id);
      if (onCountChange) onCountChange(updated.length);
      return updated;
    });
  };

  const handleApprove = async (item, formData) => {
    // formData comes from WorkOrderForm save
    const wo = { ...formData };
    Object.keys(wo).forEach(k => { if (wo[k] === null || wo[k] === undefined || wo[k] === '') delete wo[k]; });
    const created = await WorkOrder.create(wo);
    await PendingImport.update(item.id, { status: 'approved', merged_into_id: created.id });
    removeItem(item.id);
  };

  const handleMerge = async (item, targetWoId) => {
    const target = allWorkOrders.find(w => w.id === targetWoId);
    if (!target) return;
    const ed = item.extracted_data || {};
    const updateData = {
      est_inv_at: item.doc_number,
      corbridge_invoice_number: item.doc_number,
    };
    if (ed.quoted_amount) { updateData.quoted_amount = ed.quoted_amount; updateData.estimate_amount = ed.quoted_amount; }
    if (ed.contact_email && !target.contact_email) updateData.contact_email = ed.contact_email;
    if (ed.contact_phone && !target.contact_phone) updateData.contact_phone = ed.contact_phone;
    if (ed.contact_name && !target.contact_name) updateData.contact_name = ed.contact_name;
    if (ed.billing_address && !target.billing_address) updateData.billing_address = ed.billing_address;
    if (ed.install_location && !target.install_location) updateData.install_location = ed.install_location;
    if (item.doc_type === 'invoice') updateData.sales_status = 'won';
    await WorkOrder.update(targetWoId, updateData);
    await PendingImport.update(item.id, { status: 'merged', merged_into_id: targetWoId });
    removeItem(item.id);
  };

  const handleReject = async (item) => {
    await PendingImport.update(item.id, { status: 'rejected' });
    removeItem(item.id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-amber-500 mr-2" />
        <span className="text-sm text-gray-500">Loading pending imports…</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-400" />
        <p className="text-sm font-medium">No pending imports</p>
        <p className="text-xs mt-1">All Corebridge emails have been processed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">{items.length} import{items.length !== 1 ? 's' : ''} awaiting review</p>
        <button onClick={load} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      {items.map(item => (
        <PendingImportCard
          key={item.id}
          item={item}
          onApprove={handleApprove}
          onMerge={handleMerge}
          onReject={handleReject}
          allWorkOrders={allWorkOrders}
        />
      ))}
    </div>
  );
}

// Exported hook for nav badge — fetches count only
export async function fetchPendingImportCount() {
  try {
    const pending = await base44.entities.PendingImport.filter({ status: 'pending' });
    return Array.isArray(pending) ? pending.length : 0;
  } catch {
    return 0;
  }
}