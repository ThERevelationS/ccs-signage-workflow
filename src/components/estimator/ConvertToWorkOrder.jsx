import { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Briefcase, CheckCircle2 } from "lucide-react";
import { getModuleLabel } from "./moduleRegistry";
import { acceptedInternalEstimateCost } from "./customerPricing";
import { recordEstimateLifecycleRevision } from "./estimateRevisionService";
import { localDateStamp } from "./quoteLifecycle";
import {
  buildConvertedWorkOrderFields,
  buildEstimateWorkOrderProducts,
  mergeWorkOrderProducts,
  selectExistingEstimateWorkOrder,
} from "./workOrderConversion";

// Turns an approved estimate into a job in the main workflow, carrying the
// shared Customer link, the estimate link and the section list across.
export default function ConvertToWorkOrder({ estimate, pricing, onConverted, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [workOrderId, setWorkOrderId] = useState(estimate.work_order_id || "");

  const handleConvert = async () => {
    if (disabled) return;
    setBusy(true);
    try {
      const sections = (estimate.line_items || [])
        .map((l) => `• ${getModuleLabel(l.module_key)} — ${l.project_name}`)
        .join("\n");

      const estimateBefore = await base44.entities.AllInOneEstimate.get(estimate.id);
      const matches = await base44.entities.WorkOrder.filter({ estimate_id: estimate.id });
      const existing = selectExistingEstimateWorkOrder(matches, estimate.work_order_id);
      const estimateProducts = buildEstimateWorkOrderProducts(estimate, pricing);
      const products = mergeWorkOrderProducts(existing?.products || [], estimateProducts);
      const generatedDescription = [estimate.notes, sections].filter(Boolean).join("\n\n");
      const workOrderFields = buildConvertedWorkOrderFields({
        estimate,
        pricing,
        existing,
        products,
        generatedDescription,
        conversionDate: localDateStamp(),
      });

      let workOrder;
      if (existing?.id) {
        await base44.entities.WorkOrder.update(existing.id, workOrderFields);
        workOrder = { ...existing, ...workOrderFields };
      } else {
        workOrder = await base44.entities.WorkOrder.create(workOrderFields);
      }

      const internalCost = acceptedInternalEstimateCost(estimate.line_items || []);
      const { id: _id, created_date: _created_date, updated_date: _updated_date, created_by_id: _created_by_id, created_by: _created_by, ...estimateData } = estimate;
      const estimateAfter = {
        ...estimateBefore,
        ...estimateData,
        work_order_id: workOrder.id,
        status: "approved",
        edit_reason: "",
        total_cost: internalCost,
        quote_total: pricing.quoteTotal,
      };
      await base44.entities.AllInOneEstimate.update(estimate.id, {
        ...estimateData,
        work_order_id: workOrder.id,
        status: "approved",
        edit_reason: "",
        total_cost: internalCost,
        quote_total: pricing.quoteTotal,
      });
      await recordEstimateLifecycleRevision({
        estimateBefore,
        estimateAfter,
        reason: "Converted estimate to Work Order",
        revisionType: "conversion",
        quoteTotalBefore: estimateBefore.quote_total,
        quoteTotalAfter: pricing.quoteTotal,
        internalCostBefore: estimateBefore.total_cost,
        internalCostAfter: internalCost,
        workOrderId: workOrder.id,
      });

      setWorkOrderId(workOrder.id);
      onConverted?.(workOrder.id);
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

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4">
      <h3 className="font-semibold text-gray-800 text-sm mb-1">Convert to Job</h3>
      <p className="text-xs text-gray-500 mb-3">
        Creates a work order in the sales pipeline linked to this estimate and customer.
      </p>
      <Button
        onClick={handleConvert}
        disabled={disabled || busy || !(estimate.line_items || []).length}
        className="w-full rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold"
      >
        <Briefcase className="w-4 h-4" /> {disabled ? "Save Revision First" : busy ? "Creating job…" : "Create Work Order"}
      </Button>
    </div>
  );
}