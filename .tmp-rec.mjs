const c = (await base44.entities.SyncConflict.filter({ status: "open" }))[0];
const r = await base44.entities.WorkOrder.get(c.entity_id);
console.log("id:", c.entity_id);
console.log("status:", r.sales_status, "| in_pipeline:", r.in_pipeline, "| task:", r.current_task_description);
console.log("stage_at:", r.sales_stage_changed_at, "| synced:", r.smartsheet_last_synced_at, "| updated:", r.updated_date);
console.log("neutral_closed:", r.sales_neutral_closed_at, "| close_date:", r.close_date, "| deleted:", r.deleted);
console.log("snapshot task col:", JSON.stringify(r.smartsheet_sync_snapshot?.[c.column_id]));
console.log("opp_id:", r.opportunity_id, "| customer:", r.customer_name);
