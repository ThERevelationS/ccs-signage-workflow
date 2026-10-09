import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";
import { opportunityBridgeReceiptKey } from "../../shared/opportunityBridgeExecutionPlan.mjs";
import { verifyOpportunityBridgePilotOutcome } from "../../shared/opportunityBridgePilotVerification.mjs";

const clean = (value: any) => String(value ?? "").trim();

function dedupeById(rows: any[] = []) {
  const map = new Map<string, any>();
  for (const row of rows) {
    const id = clean(row?.id);
    if (id) map.set(id, row);
  }
  return [...map.values()];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me().catch(() => null);
    if (!actor || actor.role !== "admin") {
      return Response.json({ success:false, read_only:true, error:"Admin access required." }, { status:403 });
    }

    const body = await req.json().catch(() => ({}));
    const workOrderId = clean(body?.work_order_id);
    const expectedReviewFingerprint = clean(body?.review_fingerprint);
    if (!workOrderId || !expectedReviewFingerprint) {
      return Response.json({
        success:false,
        read_only:true,
        error:"work_order_id and exact review_fingerprint are required.",
      }, { status:400 });
    }

    const operationKey = opportunityBridgeReceiptKey(workOrderId);
    if (!operationKey) {
      return Response.json({ success:false, read_only:true, error:"Invalid WorkOrder bridge identity." }, { status:400 });
    }

    const WorkOrder = base44.asServiceRole.entities.WorkOrder;
    const Opportunity = base44.asServiceRole.entities.Opportunity;
    const Receipt = base44.asServiceRole.entities.OpportunityBridgeOperationReceipt;

    const [workOrder, byCreationKey, byWorkOrder, receipts] = await Promise.all([
      WorkOrder.get(workOrderId).catch(() => null),
      Opportunity.filter({ creation_request_key:operationKey }, "-created_date", 10),
      Opportunity.filter({ compatibility_work_order_id:workOrderId }, "-created_date", 10),
      Receipt.filter({ operation_key:operationKey }, "-created_date", 10),
    ]);

    const opportunities = dedupeById([
      ...(Array.isArray(byCreationKey) ? byCreationKey : []),
      ...(Array.isArray(byWorkOrder) ? byWorkOrder : []),
    ]);

    const verification = verifyOpportunityBridgePilotOutcome({
      workOrderId,
      expectedReviewFingerprint,
      workOrder,
      opportunities,
      receipts:Array.isArray(receipts) ? receipts : [],
    });

    return Response.json({
      success:true,
      read_only:true,
      write_capability:false,
      actor:{ id:clean(actor.id), email:clean(actor.email), role:clean(actor.role) },
      verification,
      checked_at:new Date().toISOString(),
    });
  } catch (error) {
    console.error("opportunityBridgePilotVerification error", error);
    const errorMessage = error instanceof Error
      ? error.message
      : String(error || "Opportunity bridge pilot verification failed.");
    return Response.json({
      success:false,
      read_only:true,
      write_capability:false,
      error:clean(errorMessage || "Opportunity bridge pilot verification failed."),
    }, { status:500 });
  }
});
