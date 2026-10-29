const open = await base44.entities.SyncConflict.filter({ status: "open" });
console.log("open:", open.length);
for (const c of open) {
  try {
    const res = await base44.functions.invoke("smartsheetSyncAction", { action: "resolve_conflict", conflict_id: c.id, decision: "smartsheet" });
    console.log(c.id.slice(-6), JSON.stringify(res?.data ?? res).slice(0, 300));
  } catch (e) {
    console.log(c.id.slice(-6), "ERR:", e?.response?.data ? JSON.stringify(e.response.data).slice(0,300) : e.message);
  }
}
const after = await base44.entities.SyncConflict.filter({ status: "open" });
console.log("open after:", after.length);
const r = await base44.entities.WorkOrder.get("6ab444b0321a02eebe9472ee");
console.log("record task:", r.current_task_description, "| status:", r.sales_status, "| in_pipeline:", r.in_pipeline);
