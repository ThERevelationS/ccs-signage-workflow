import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";
import { buildOpportunityBridgeDryRunPlan, bridgeSourceSnapshotsEqual } from "../../shared/opportunityBridgeDryRunPlanner.mjs";
import {
  OPPORTUNITY_BRIDGE_PRODUCTION_POLICY,
  selectOpportunityBridgeFirstBatch,
} from "../../shared/opportunityBridgeProductionReadiness.mjs";
import {
  createBase44OpportunityBridgeReceiptAdapter,
  summarizeOpportunityBridgeReceiptLedger,
} from "../../shared/opportunityBridgeReceiptPersistence.mjs";
import {
  buildOpportunityBridgeSecondaryConfirmationBinding,
  describeOpportunityBridgeSecondaryConfirmationContract,
} from "../../shared/opportunityBridgeSecondaryConfirmation.mjs";
import {
  OPPORTUNITY_BRIDGE_PRODUCTION_EXECUTOR,
  executeGuardedOpportunityBridgePilot,
} from "../../shared/opportunityBridgeProductionExecutor.mjs";

const PAGE_SIZE = 500;
const MAX_READ_ROWS = 10000;

const clean = (value: any) => String(value ?? "").trim();

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
  throw new Error("Opportunity bridge production preflight exceeded its read safety ceiling.");
}

function dedupeById(rows: any[] = []) {
  const map = new Map<string, any>();
  for (const row of rows) {
    const id = clean(row?.id);
    if (id) map.set(id, row);
  }
  return [...map.values()];
}

function makeApplyAdapter(WorkOrder: any, Opportunity: any) {
  return {
    async getWorkOrder(id: string) {
      return WorkOrder.get(clean(id)).catch(() => null);
    },
    async findOpportunities({ workOrderId, receiptKey }: any) {
      const [byReceipt, byWorkOrder] = await Promise.all([
        Opportunity.filter({ creation_request_key:clean(receiptKey) }, "-created_date", 10),
        Opportunity.filter({ compatibility_work_order_id:clean(workOrderId) }, "-created_date", 10),
      ]);
      return dedupeById([
        ...(Array.isArray(byReceipt) ? byReceipt : []),
        ...(Array.isArray(byWorkOrder) ? byWorkOrder : []),
      ]);
    },
    async createOpportunity(payload: any) {
      return Opportunity.create(payload);
    },
    async getOpportunity(id: string) {
      return Opportunity.get(clean(id)).catch(() => null);
    },
    async linkWorkOrderIfUnchanged({ workOrderId, opportunityId, expectedSnapshot }: any) {
      const current = await WorkOrder.get(clean(workOrderId)).catch(() => null);
      if (!current?.id || !bridgeSourceSnapshotsEqual(expectedSnapshot || {}, current)) {
        throw Object.assign(new Error("WorkOrder changed after pilot authorization."), { status:409 });
      }
      const expectedUpdatedDate = clean(expectedSnapshot?.updated_date);
      if (!expectedUpdatedDate) {
        throw Object.assign(new Error("WorkOrder version is unavailable; pilot link is blocked."), { status:409 });
      }
      const result = await WorkOrder.updateMany(
        { id:clean(workOrderId), updated_date:expectedUpdatedDate },
        { $set:{ opportunity_id:clean(opportunityId) } },
      );
      if (!result || result.updated !== 1) {
        throw Object.assign(new Error("WorkOrder changed while the Opportunity link was being saved."), { status:409 });
      }
      const saved = await WorkOrder.get(clean(workOrderId)).catch(() => null);
      if (!saved?.id || clean(saved?.opportunity_id) !== clean(opportunityId)) {
        throw new Error("WorkOrder Opportunity link could not be verified.");
      }
      return saved;
    },
  };
}

function publicCandidate(row: any) {
  if (!row) return null;
  return {
    work_order_id:clean(row?.work_order_id),
    receipt_key:clean(row?.receipt_key),
    action:clean(row?.action),
    sales_scope:clean(row?.sales_scope),
    evidence_strength:clean(row?.evidence_strength),
    customer_id:clean(row?.anchors?.customer_id),
    source_snapshot:row?.source_snapshot || {},
    proposed_opportunity:row?.proposed_opportunity || null,
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
    const action = clean(body?.action) || "prepare_pilot";
    if (!["prepare_pilot","apply_pilot"].includes(action)) {
      return Response.json({ success:false, error:"Unsupported Opportunity bridge production action." }, { status:400 });
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

    const plan = buildOpportunityBridgeDryRunPlan({ workOrders, customers, estimates, opportunities });
    const now = new Date().toISOString();
    const receiptLedger = summarizeOpportunityBridgeReceiptLedger(receipts);
    const firstBatch = selectOpportunityBridgeFirstBatch(plan.rows);
    const candidate = firstBatch[0] || null;
    const confirmationContract = describeOpportunityBridgeSecondaryConfirmationContract();

    if (action === "prepare_pilot") {
      const rolloutRunId = crypto.randomUUID();
      const binding = candidate
        ? await buildOpportunityBridgeSecondaryConfirmationBinding({
            runId:rolloutRunId,
            planGeneratedAt:now,
            batchRows:[candidate],
            actor,
          })
        : null;

      return Response.json({
        success:true,
        action,
        executor_version:OPPORTUNITY_BRIDGE_PRODUCTION_EXECUTOR.VERSION,
        production_apply_enabled:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.APPLY_ENABLED,
        apply_path_status:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.APPLY_ENABLED ? "enabled" : "locked",
        write_attempted:false,
        generated_at:now,
        rollout_run_id:rolloutRunId,
        candidate:publicCandidate(candidate),
        receipt_ledger:receiptLedger,
        secondary_confirmation_contract:confirmationContract,
        secondary_confirmation_binding:binding ? {
          version:binding.version,
          mode:binding.mode,
          run_id:binding.run_id,
          plan_generated_at:binding.plan_generated_at,
          batch_fingerprint:binding.batch_fingerprint,
          confirmation_fingerprint:binding.confirmation_fingerprint,
          actor:binding.actor,
          batch_size:binding.batch_size,
          expires_at:binding.expires_at,
        } : null,
        confirmation_phrase:binding?.required_phrase || "",
        live_counts:{
          workorders_examined:workOrders.length,
          customers:customers.length,
          estimates:estimates.length,
          opportunities:opportunities.length,
          opportunity_bridge_receipts:receipts.length,
        },
      });
    }

    const requestedWorkOrderId = clean(body?.work_order_id);
    const suppliedBinding = body?.secondary_confirmation_binding && typeof body.secondary_confirmation_binding === "object"
      ? body.secondary_confirmation_binding
      : null;
    const suppliedPhrase = clean(body?.confirmation_phrase);
    const planGeneratedAt = clean(suppliedBinding?.plan_generated_at);

    const result = await executeGuardedOpportunityBridgePilot({
      plan,
      planGeneratedAt,
      requestedWorkOrderId,
      actor,
      confirmationBinding:suppliedBinding,
      confirmationPhrase:suppliedPhrase,
      receiptLedgerSummary:receiptLedger,
      applyEnabled:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.APPLY_ENABLED,
      applyAdapter:makeApplyAdapter(WorkOrder, Opportunity),
      receiptAdapter:createBase44OpportunityBridgeReceiptAdapter(Receipt),
      now,
    });

    return Response.json({
      ...result,
      action,
      executor_version:OPPORTUNITY_BRIDGE_PRODUCTION_EXECUTOR.VERSION,
      production_apply_enabled:OPPORTUNITY_BRIDGE_PRODUCTION_POLICY.APPLY_ENABLED,
    }, { status:result?.authorization?.authorized ? 200 : 423 });
  } catch (error) {
    console.error("opportunityBridgeProductionApply error", error);
    return Response.json({
      success:false,
      production_apply_enabled:false,
      write_attempted:false,
      error:clean(error?.message || "Opportunity bridge production preflight failed."),
    }, { status:500 });
  }
});
