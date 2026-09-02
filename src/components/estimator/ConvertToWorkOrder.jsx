import { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Briefcase, CheckCircle2 } from "lucide-react";
import { getModuleLabel } from "./moduleRegistry";
import {
  buildEstimateWorkOrderProducts,
  convertedWorkOrderStage,
  mergeWorkOrderProducts,
  selectExistingEstimateWorkOrder,
} from "./workOrderConversion";

// Turns an approved estimate into a job in the main workflow, carrying the
// shared Customer link, the estimate link and the section list across.
export default function ConvertToWorkOrder({ estimate, pricing, onConverted }) {
  const [busy, setBusy] = useState(false);
  const [workOrderId, setWorkOrderId] = useState(estimate.work_order_id || "");

  const handleConvert = async () => {
    setBusy(true);
    try {
      const sections = (estimate.line_items || [])
        .map((l) => `• ${getModuleLabel(l.module_key)} — ${l.project_name}`)
        .join("\n");

      const matches = await base44.entities.WorkOrder.filter({ estimate_id: estimate.id });
      const existing = selectExistingEstimateWorkOrder(matches, estimate.work_order_id);
      const estimateProducts = buildEstimateWorkOrderProducts(estimate, pricing);
      const products = mergeWorkOrderProducts(existing?.products || [], estimateProducts);
      const generatedDescription = [estimate.notes, sections].filter(Boolean).join("\n\n");
      const workOrderFields = {
        title: estimate.project_name,
        client_name: estimate.client_name,
        customer_id: estimate.customer_id,
        estimate_id: estimate.id,
        // A salesperson/production user may already have expanded the lead's
        // description before conversion. Never overwrite that work here.
        description: existing?.description || generatedDescription,
        current_stage: convertedWorkOrderStage(existing?.current_stage),
        // Conversion approves the estimate, so this is a won job rather than a
        // merely quoted lead. This also matches syncEstimateToPipeline's
        // approved -> won mapping.
        sales_status: "won",
        install_location: estimate.site_address,
        contact_name: estimate.contact_name,
        contact_email: estimate.contact_email,
        contact_phone: estimate.contact_phone,
        sales_rep: estimate.salesperson,
        estimator: estimate.salesperson,
        estimate_amount: pricing.quoteTotal,
        quoted_amount: pricing.quoteTotal,
        corbridge_invoice_number: estimate.estimate_number,
        project_install_date: estimate.target_install_date,
        in_pipeline: true,
        products,
      };

      let workOrder;
      if (existing?.id) {
        await base44.entities.WorkOrder.update(existing.id, workOrderFields);
        workOrder = { ...existing, ...workOrderFields };
      } else {
        workOrder = await base44.entities.WorkOrder.create(workOrderFields);
      }

      await base44.entities.AllInOneEstimate.update(estimate.id, {
        work_order_id: workOrder.id,
        status: "approved",
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
        disabled={busy || !(estimate.line_items || []).length}
        className="w-full rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold"
      >
        <Briefcase className="w-4 h-4" /> {busy ? "Creating job…" : "Create Work Order"}
      </Button>
    </div>
  );
}