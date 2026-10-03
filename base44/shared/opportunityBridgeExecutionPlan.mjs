const clean = (value) => String(value ?? '').trim();

export function opportunityBridgeReceiptKey(workOrderId) {
  const id = clean(workOrderId);
  return id ? `workorder:${id}:opportunity:v1` : '';
}

export const OPPORTUNITY_BRIDGE_EXECUTION = Object.freeze({ CREATE: "proposed_create", HOLD: "hold", ALREADY_LINKED: "already_linked" });

export function bridgeSourceSnapshot(w = {}) {
  return {
    id: clean(w.id),
    opportunity_id: clean(w.opportunity_id),
    sales_status: clean(w.sales_status),
    in_pipeline: w.in_pipeline === true,
    current_task_description: clean(w.current_task_description),
    date_order_created: clean(w.date_order_created),
    updated_date: clean(w.updated_date),
  };
}
