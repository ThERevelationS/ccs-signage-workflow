const open = await base44.entities.SyncConflict.filter({ status: "open" });
console.log("open:", open.length);
for (const c of open) {
  const r = await base44.entities.WorkOrder.get(c.entity_id).catch(()=>null);
  console.log("\nconflict:", c.id.slice(-6), "| created:", c.created_date, "| dataset:", c.dataset, "| field:", c.field_name);
  console.log("  record:", c.entity_id, r ? `status=${r.sales_status} | task="${r.current_task_description}" | in_pipeline=${r.in_pipeline} | stage_at=${r.sales_stage_changed_at} | synced=${r.smartsheet_last_synced_at} | updated=${r.updated_date} | close=${r.close_date} | neutral=${r.sales_neutral_closed_at} | opp=${r.opportunity_id} | prob=${r.probability}` : "MISSING");
  console.log("  values: local=\"" + c.local_value + "\" remote=\"" + c.remote_value + "\" | lver=" + c.local_version + " rver=" + c.remote_version);
}
