import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { staffEntities } from "@/components/staff/staffEntities";
import { Button } from "@/components/ui/button";
import { Briefcase, CheckCircle2 } from "lucide-react";
import { getModuleLabel } from "./moduleRegistry";
import { acceptedInternalEstimateCost } from "./customerPricing";
import { hasVerifiedEstimateSalesActivity } from "./estimateSalesActivity.mjs";
import { ensureEstimateLifecycleRevision } from "./estimateRevisionService";
import { getPendingEstimatePriceAcceptance } from "./estimateMutationGuard";
import { localDateStamp } from "./quoteLifecycle";
import { convergeCreatedEstimateWorkOrder, loadAllCustomers, resolveCustomerForEstimate } from "./customerSync";
import { replaceWorkOrderFieldsIfUnchanged } from "@/components/workflow/workOrderPersistence";
import { createEstimateLinkedWorkOrderWithRecovery, expectedWorkOrderFields } from "./workOrderSyncPersistence";
import { expectedEstimateFields, replaceEstimateFieldsIfUnchanged } from "./estimatePersistence";
import {
  buildConvertedWorkOrderFields,
  buildEstimateWorkOrderProducts,
  mergeWorkOrderProducts,
  selectExistingEstimateWorkOrder,
} from "./workOrderConversion";

// Turns an approved estimate into a job in the main workflow, carrying the
// shared Customer link, the estimate link and the section list across.
export default function ConvertToWorkOrder({ estimate, pricing, onConverted, disabled = false, disabledReason = "", persistedStatus = "draft", sessionToken = "" }) {
  const [busy, setBusy] = useState(false);
  const [workOrderId, setWorkOrderId] = useState(estimate.work_order_id || "");

  useEffect(() => {
    let active = true;
    const linkedId = String(estimate.work_order_id || "").trim();
    if (!linkedId) {
      setWorkOrderId("");
      return () => { active = false; };
    }
    staffEntities.WorkOrder.get(linkedId)
      .then((row) => {
        if (!active) return;
        setWorkOrderId(row?.id && row.deleted !== true ? row.id : "");
      })
      .catch(() => {
        if (active) setWorkOrderId("");
      });
    return () => { active = false; };
  }, [estimate.work_order_id]);

  const handleConvert = async () => {
    if (disabled) return;
    setBusy(true);
    try {
      const sections = (estimate.line_items || [])
        .map((l) => `• ${getModuleLabel(l.module_key)} — ${l.project_name}`)
        .join("\n");

      const estimateBefore = await staffEntities.AllInOneEstimate.get(estimate.id);
      if (!estimateBefore?.id) {
        throw new Error("This estimate could not be loaded. Sign in again and reload before converting it to a Work Order.");
      }
      const pendingPrice = getPendingEstimatePriceAcceptance(estimateBefore);
      if (pendingPrice) {
        const name = pendingPrice.line?.client_product_name || pendingPrice.line?.project_name || "Product";
        const resumeLabel = pendingPrice.pending?.kind === "builder_initial_freeze"
          ? "Resume Initial Price"
          : pendingPrice.pending?.kind === "builder_detach_override"
            ? "Resume Part Detach"
            : pendingPrice.pending?.kind === "builder_detached_override_update"
              ? "Resume Part Change"
              : pendingPrice.pending?.kind === "builder_reattach_parts"
                ? "Resume Reattach"
                : pendingPrice.pending?.kind === "builder_manual_part_add"
                  ? "Resume Part Add"
                  : pendingPrice.pending?.kind === "builder_manual_part_edit"
                    ? "Resume Part Edit"
                    : pendingPrice.pending?.kind === "builder_manual_part_switch"
                      ? "Resume Part Switch"
                      : pendingPrice.pending?.kind === "builder_manual_part_remove"
                        ? "Resume Part Remove"
                        : pendingPrice.pending?.kind === "builder_part_package_add"
                          ? "Resume Part Insert"
                          : pendingPrice.pending?.kind === "builder_manual_product_price"
                            ? "Resume Product Price"
                            : pendingPrice.pending?.kind === "builder_part_group_clone"
                              ? "Resume Group Clone"
                              : pendingPrice.pending?.kind === "builder_part_group_move"
                                ? "Resume Group Move"
                                : pendingPrice.pending?.kind === "builder_part_group_create"
                                  ? "Resume Group Create"
                                  : pendingPrice.pending?.kind === "builder_part_group_dissolve"
                                    ? "Resume Group Dissolve"
                                    : pendingPrice.pending?.kind === "builder_blank_product_insert"
                                      ? "Resume Product Add"
                                      : pendingPrice.pending?.kind === "builder_product_remove"
                                        ? "Resume Product Remove"
                                        : pendingPrice.pending?.kind === "builder_quick_product_insert"
                              ? pendingPrice.pending?.source_type === "product_clone" ? "Resume Product Clone" : "Resume Quick Product"
                              : "Resume Price Update";
        throw new Error(`“${name}” has a Builder mutation recovery pending. Use ${resumeLabel} before converting this estimate to a Work Order.`);
      }
      if (estimateBefore.status !== "approved") {
        throw new Error("Only an Approved estimate can be converted to a Work Order. Record customer acceptance or approve the estimate first.");
      }
      if (estimateBefore.pipeline_sync_pending) {
        throw new Error("Sales Pipeline synchronization is still pending. Retry that synchronization from Finalize Estimate before converting this estimate to a Work Order.");
      }
      if (
        estimate.updated_date &&
        estimateBefore.updated_date &&
        estimate.updated_date !== estimateBefore.updated_date
      ) {
        throw new Error("This estimate changed in another session. Reload before converting so newer approved pricing/details are not overwritten.");
      }
      const matches = await staffEntities.WorkOrder.filter({ estimate_id: estimate.id });
      const activeMatches = (matches || []).filter((row) => row?.deleted !== true);
      const existing = selectExistingEstimateWorkOrder(activeMatches, estimate.work_order_id);
      if (!existing && (matches || []).some((row) => row?.deleted === true)) {
        throw new Error("This estimate's linked Work Order is in Trash. Restore that Work Order from Project Trash before converting the estimate again.");
      }
      const customers = await loadAllCustomers();
      const resolvedCustomer = await resolveCustomerForEstimate(
        { ...estimateBefore, customer_id: existing?.customer_id || estimateBefore.customer_id || "" },
        customers || []
      );
      const verifiedCustomerId = resolvedCustomer?.id || "";
      const estimateProducts = buildEstimateWorkOrderProducts(estimate, pricing);
      const products = mergeWorkOrderProducts(existing?.products || [], estimateProducts);
      const generatedDescription = [estimate.notes, sections].filter(Boolean).join("\n\n");
      const convertedFields = buildConvertedWorkOrderFields({
        estimate,
        pricing,
        existing,
        products,
        generatedDescription,
        conversionDate: localDateStamp(),
        verifiedCustomerId,
      });
      // Converting an already-Won job again must not manufacture Sales
      // activity. Only a changed approved estimate/Sales field is evidence.
      const hasConversionSalesActivity = !existing || hasVerifiedEstimateSalesActivity(existing, convertedFields, {
        includeProducts: true, // Approved quote products are part of the Sales conversion.
      });
      const conversionActivityStamp = new Date().toISOString();
      const workOrderFields = {
        ...convertedFields,
        ...(hasConversionSalesActivity ? { sales_last_activity_at: conversionActivityStamp } : {}),
        ...(existing?.sales_status !== "won" ? { sales_stage_changed_at: conversionActivityStamp } : {}),
      };

      // Pre-commit gate: conversion writes the Work Order before the estimate
      // link, so confirm intent up front rather than alerting on a partial
      // state afterwards. Preview shows the expected WO number/stage when
      // updating an existing record; new records are numbered by the pipeline.
      const preview = existing?.id
        ? `WO ${existing.work_order_number || existing.id.slice(0, 8)} · stage ${existing.current_stage || "estimating"}`
        : "new record · stage estimating";
      const sectionNames = (Array.isArray(estimate.line_items) ? estimate.line_items : [])
        .map((l) => l?.client_product_name || l?.builder_name || l?.module_key).filter(Boolean);
      const sectionsPreview = sectionNames.length
        ? `\n\nSections → WO checklist (${sectionNames.length}): ${sectionNames.slice(0, 6).join(", ")}${sectionNames.length > 6 ? ` +${sectionNames.length - 6} more` : ""}`
        : "";
      if (!window.confirm(`Create a Work Order for "${estimate.project_name || "this estimate"}" and link it to the sales pipeline? (${preview})${sectionsPreview}`)) return;

      let workOrder;
      if (existing?.id) {
        workOrder = await replaceWorkOrderFieldsIfUnchanged({
          workOrderId: existing.id,
          expectedFields: expectedWorkOrderFields(existing, workOrderFields),
          nextFields: workOrderFields,
          label: "Approved estimate Work Order conversion",
        });
      } else {
        workOrder = await createEstimateLinkedWorkOrderWithRecovery({
          entity: staffEntities.WorkOrder,
          estimateId: estimate.id,
          data: workOrderFields,
          label: "Approved estimate Work Order conversion",
          convergeCreated: (created) => convergeCreatedEstimateWorkOrder({
            estimateId: estimate.id,
            created,
            fields: workOrderFields,
            sessionToken,
            duplicateLabel: "Work Order during simultaneous conversion",
          }),
        });
      }

      const internalCost = acceptedInternalEstimateCost(estimate.line_items || []);
      const { id: _id, created_date: _created_date, updated_date: _updated_date, created_by_id: _created_by_id, created_by: _created_by, ...estimateData } = estimate;
      const conversionEstimateFields = {
        ...estimateData,
        work_order_id: workOrder.id,
        status: "approved",
        edit_reason: "",
        total_cost: internalCost,
        quote_total: pricing.quoteTotal,
      };
      const estimateAfter = {
        ...estimateBefore,
        ...conversionEstimateFields,
      };
      await replaceEstimateFieldsIfUnchanged({
        entity: staffEntities.AllInOneEstimate,
        estimateId: estimate.id,
        expectedFields: expectedEstimateFields(estimateBefore, conversionEstimateFields),
        guardFields: { updated_date: estimateBefore.updated_date },
        nextFields: conversionEstimateFields,
        label: "Approved Estimate Work Order conversion link",
      });
      await ensureEstimateLifecycleRevision({
        idempotencyKey: `work_order_conversion:${workOrder.id}`,
        sessionToken,
        estimateBefore,
        estimateAfter,
        reason: "Converted approved estimate to Work Order",
        revisionType: "conversion",
        quoteTotalBefore: estimateBefore.quote_total,
        quoteTotalAfter: pricing.quoteTotal,
        internalCostBefore: estimateBefore.total_cost,
        internalCostAfter: internalCost,
        workOrderId: workOrder.id,
      });

      setWorkOrderId(workOrder.id);
      onConverted?.(workOrder.id);
    } catch (error) {
      // The Work Order may already be committed (a later step failed after
      // the link). Re-read so the alert reflects real state instead of
      // claiming nothing was created.
      const post = await staffEntities.AllInOneEstimate.get(estimate.id).catch(() => null);
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
          <CheckCircle2 className="w-4 h-4" /> Job created
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
      <Button
        onClick={handleConvert}
        disabled={disabled || busy || !approved || !(estimate.line_items || []).length}
        className="w-full rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold disabled:opacity-50"
      >
        <Briefcase className="w-4 h-4" /> {disabled ? (disabledReason || "Save Revision First") : !approved ? "Approve Estimate Before Converting" : busy ? "Creating job…" : "Create Work Order"}
      </Button>
    </div>
  );
}