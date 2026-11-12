import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Briefcase, CheckCircle2 } from "lucide-react";
import { convertEstimateToWorkOrder } from "./estimateConversionService";

// Turns an approved estimate into a job in the main workflow, carrying the
// shared Customer link, the estimate link and the section list across. The
// conversion pipeline itself lives in estimateConversionService so the
// queue-level bulk actions reuse the exact same guarded steps; this
// component only owns the interactive confirms and the linked-Job card.
export default function ConvertToWorkOrder({ estimate, pricing, onConverted, disabled = false, disabledReason = "", persistedStatus = "draft", sessionToken = "" }) {
  const [busy, setBusy] = useState(false);
  const { currentUser } = useAuth();
  const [workOrderId, setWorkOrderId] = useState(estimate.work_order_id || "");
  const [woLinkFailed, setWoLinkFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const linkedId = String(estimate.work_order_id || "").trim();
    if (!linkedId) {
      setWorkOrderId("");
      return () => { active = false; };
    }
    base44.entities.WorkOrder.get(linkedId)
      .then((row) => {
        if (!active) return;
        setWorkOrderId(row?.id && row.deleted !== true ? row.id : "");
      })
      .catch(() => {
        // A failed link check is NOT "unlinked" — keep the authored id and
        // flag the read failure so the card does not falsely show unlinked.
        if (active) setWoLinkFailed(true);
      });
    return () => { active = false; };
  }, [estimate.work_order_id]);

  const handleConvert = async () => {
    if (disabled) return;
    setBusy(true);
    try {
      const result = await convertEstimateToWorkOrder({
        estimate,
        pricing,
        sessionToken,
        currentUser,
        hooks: {
          // Credit gate — CoreBridge semantics: an explicit credit_hold
          // blocks staff outright (admins may override); credit_limit warns
          // when projected account exposure would exceed it.
          decideCredit: async ({ message, isAdmin }) => {
            if (!isAdmin) {
              window.alert(message);
              return false;
            }
            return window.confirm(`${message}\n\nOverride and convert anyway?`);
          },
          // Pre-commit gate: conversion writes the Work Order before the
          // estimate link, so confirm intent up front rather than alerting
          // on a partial state afterwards. Preview shows the expected WO
          // number/stage when updating an existing record.
          confirmBeforeCommit: async ({ existing }) => {
            const preview = existing?.id
              ? `WO ${existing.work_order_number || existing.id.slice(0, 8)} · stage ${existing.current_stage || "estimating"}`
              : "new record · stage estimating";
            const sectionNames = (Array.isArray(estimate.line_items) ? estimate.line_items : [])
              .map((l) => l?.client_product_name || l?.builder_name || l?.module_key).filter(Boolean);
            const sectionsPreview = sectionNames.length
              ? `\n\nSections → WO checklist (${sectionNames.length}): ${sectionNames.slice(0, 6).join(", ")}${sectionNames.length > 6 ? ` +${sectionNames.length - 6} more` : ""}`
              : "";
            return window.confirm(`Create a Work Order for "${estimate.project_name || "this estimate"}" and link it to the sales pipeline? (${preview})${sectionsPreview}`);
          },
        },
      });
      if (result.status !== "converted") {
        if (result.status === "blocked" && result.reason) window.alert(result.reason);
        return;
      }
      setWorkOrderId(result.workOrder.id);
      onConverted?.(result.workOrder.id);
    } catch (error) {
      // The Work Order may already be committed (a later step failed after
      // the link). Re-read so the alert reflects real state instead of
      // claiming nothing was created.
      const post = await base44.entities.AllInOneEstimate.get(estimate.id).catch(() => null);
      const suffix = post?.work_order_id ? "\n\nA Work Order may already be linked to this estimate — reload before retrying." : "";
      window.alert(`${error?.message || "The Work Order could not be created."}${suffix}`);
    } finally {
      setBusy(false);
    }
  };

  if (workOrderId) {
    return (
      <div className="bg-white border border-gray-200 rounded-md p-4 border-l-4 border-l-emerald-400">
        <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm mb-1">
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Job created
        </div>
        <p className="text-xs text-gray-500 mb-3">
          This estimate is linked to a job in the main workflow.
        </p>
        <Link
          to="/SalesPipeline"
          className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          Open Sales Pipeline →
        </Link>
      </div>
    );
  }

  const approved = persistedStatus === "approved";

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <h3 className="font-semibold text-gray-800 text-sm mb-1">Convert to Job</h3>
      <p className="text-xs text-gray-500 mb-3">
        {approved
          ? "Creates a Work Order in the sales pipeline linked to this approved estimate and customer."
          : "Approve the estimate first. Customer acceptance can approve it automatically, or the shop can use the existing manual approval workflow."}
      </p>
      {woLinkFailed && (
        <div role="alert" className="mb-2 rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
          The linked job record could not be verified — the link may exist even though it is not shown. Reload before converting to avoid a duplicate.
        </div>
      )}
      <Button
        onClick={handleConvert}
        disabled={disabled || busy || !approved || !(estimate.line_items || []).length}
        className="w-full rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold disabled:opacity-50"
      >
        <Briefcase className="w-4 h-4" aria-hidden="true" /> {disabled ? (disabledReason || "Save Revision First") : !approved ? "Approve Estimate Before Converting" : busy ? "Creating job…" : "Create Work Order"}
      </Button>
    </div>
  );
}