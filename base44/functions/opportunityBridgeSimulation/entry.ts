import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";
import { buildOpportunityBridgeDryRunPlan } from "../../shared/opportunityBridgeDryRunPlanner.mjs";
import {
  evaluateOpportunityBridgeProductionReadiness,
  selectOpportunityBridgeFirstBatch,
} from "../../shared/opportunityBridgeProductionReadiness.mjs";
import { summarizeOpportunityBridgeReceiptLedger } from "../../shared/opportunityBridgeReceiptPersistence.mjs";
import {
  buildOpportunityBridgeSecondaryConfirmationBinding,
  describeOpportunityBridgeSecondaryConfirmationContract,
} from "../../shared/opportunityBridgeSecondaryConfirmation.mjs";
import {
  OpportunityBridgeSimulationRequestError,
  OPPORTUNITY_BRIDGE_SIMULATION,
  parseOpportunityBridgeSimulationRequest,
  selectOpportunityBridgeSimulationRows,
} from "../../shared/opportunityBridgeSimulationPolicy.mjs";

const PAGE_SIZE = 500;
const MAX_READ_ROWS = 10000;

async function loadAll(entity: any, query: any = {}, sort = "created_date") {
  const rows: any[] = [];
  let skip = 0;
  while (rows.length < MAX_READ_ROWS) {
    const page = await entity.filter(query, sort, PAGE_SIZE, skip);
    if (!Array.isArray(page)) throw new Error("Paged Base44 entity read failed.");
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    skip += PAGE_SIZE;
  }
  throw new Error("Opportunity bridge simulation exceeded its read-only safety ceiling.");
}

function responseRow(row: any) {
  return {
    work_order_id: String(row?.work_order_id || ""),
    action: String(row?.action || ""),
    reasons: Array.isArray(row?.reasons) ? row.reasons : [],
    receipt_key: String(row?.receipt_key || ""),
    receipt_state: String(row?.receipt_state || ""),
    sales_scope: String(row?.sales_scope || ""),
    evidence_strength: String(row?.evidence_strength || ""),
    source_snapshot: row?.source_snapshot || {},
    historical_reconciliation: row?.historical_reconciliation || null,
    proposed_opportunity: row?.proposed_opportunity || null,
    existing_opportunity_id: String(row?.existing_opportunity_id || ""),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me().catch(() => null);
    if (!actor || actor.role !== "admin") {
      return Response.json({ success:false, error:"Admin access required." }, { status:403 });
    }

    const body = await req.json().catch(() => ({}));
    let request;
    try {
      request = parseOpportunityBridgeSimulationRequest(body);
    } catch (error) {
      if (error instanceof OpportunityBridgeSimulationRequestError) {
        return Response.json({
          success:false,
          simulation_only:true,
          write_capability:false,
          error:error.message,
          code:error.code,
        }, { status:400 });
      }
      throw error;
    }

    const WorkOrder = base44.asServiceRole.entities.WorkOrder;
    const Customer = base44.asServiceRole.entities.Customer;
    const Estimate = base44.asServiceRole.entities.AllInOneEstimate;
    const Opportunity = base44.asServiceRole.entities.Opportunity;
    const Receipt = base44.asServiceRole.entities.OpportunityBridgeOperationReceipt;

    const [workOrders, customers, estimates, opportunities, receipts] = await Promise.all([
      loadAll(WorkOrder, { is_rider:false, deleted:{ $ne:true } }),
      loadAll(Customer, {}),
      loadAll(Estimate, {}),
      loadAll(Opportunity, {}),
      loadAll(Receipt, {}),
    ]);

    const plan = buildOpportunityBridgeDryRunPlan({
      workOrders,
      customers,
      estimates,
      opportunities,
    });

    const generatedAt = new Date().toISOString();
    const rolloutRunId = crypto.randomUUID();
    const receiptLedger = summarizeOpportunityBridgeReceiptLedger(receipts);
    const confirmationContract = describeOpportunityBridgeSecondaryConfirmationContract();
    const firstBatchRows = selectOpportunityBridgeFirstBatch(plan.rows);
    const confirmationBinding = firstBatchRows.length
      ? await buildOpportunityBridgeSecondaryConfirmationBinding({
          runId:rolloutRunId,
          planGeneratedAt:generatedAt,
          batchRows:firstBatchRows,
          actor,
        })
      : null;
    const readiness = evaluateOpportunityBridgeProductionReadiness({
      plan,
      generatedAt,
      now:generatedAt,
      receiptSchemaActivated:true,
      receiptLedgerSummary:receiptLedger,
      secondaryConfirmationConfigured:confirmationContract.configured === true,
      secondaryConfirmationContract:confirmationContract,
    });
    const selected = selectOpportunityBridgeSimulationRows(plan.rows, request).map(responseRow);
    return Response.json({
      success:true,
      mode:OPPORTUNITY_BRIDGE_SIMULATION.MODE,
      simulation_only:true,
      write_capability:false,
      apply_path_enabled:false,
      actor:{ id:String(actor.id || ""), email:String(actor.email || ""), role:String(actor.role || "") },
      request,
      live_counts:{
        workorders_examined:workOrders.length,
        customers:customers.length,
        estimates:estimates.length,
        opportunities:opportunities.length,
        opportunity_bridge_receipts:receipts.length,
      },
      summary:plan.summary,
      source_audit:plan.source_audit,
      receipt_ledger:receiptLedger,
      secondary_confirmation_contract:confirmationContract,
      secondary_confirmation_binding:confirmationBinding ? {
        run_id:confirmationBinding.run_id,
        plan_generated_at:confirmationBinding.plan_generated_at,
        batch_fingerprint:confirmationBinding.batch_fingerprint,
        confirmation_fingerprint:confirmationBinding.confirmation_fingerprint,
        batch_size:confirmationBinding.batch_size,
        expires_at:confirmationBinding.expires_at,
      } : null,
      rollout_run_id:rolloutRunId,
      readiness,
      generated_at:generatedAt,
      selected_count:selected.length,
      selected_rows:selected,
    });
  } catch (error) {
    console.error("opportunityBridgeSimulation error", error);
    return Response.json({
      success:false,
      simulation_only:true,
      write_capability:false,
      error:String(error?.message || "Opportunity bridge simulation failed."),
    }, { status:500 });
  }
});
