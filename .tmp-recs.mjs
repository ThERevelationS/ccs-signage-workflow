const ids = ["6ab4448306a95eb474d068f1","6ab4448306a95eb474d0692f","6ab44487de80f1e43484b7e1","6ab44487de80f1e43484b7c3","6ab444b49d2ceaa41dfc15a3","6ab444b49d2ceaa41dfc15a8","6adabff1d8bdac6656452cbd","6adabff1d8bdac6656452cad"];
for (const id of ids) {
  const r = await base44.entities.WorkOrder.get(id).catch(()=>null);
  if (!r) { console.log(id, "NOT FOUND"); continue; }
  const snap = r.smartsheet_sync_snapshot || {};
  const taskCol = Object.entries(snap).find(([k,v])=>typeof v==="string"&&v===v) || [];
  console.log(id, "| stage:", r.sales_status, "| task:", JSON.stringify(r.current_task_description),
    "| stage_at:", String(r.sales_stage_changed_at||"").slice(0,16), "| last_sync:", String(r.smartsheet_last_synced_at||"").slice(0,16),
    "| in_pipeline:", r.in_pipeline, "| upd:", String(r.updated_date).slice(0,16));
}
