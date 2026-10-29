const ids = ["6ab4448306a95eb474d068f1","6ab4448306a95eb474d0692f","6ab44487de80f1e43484b7e1","6ab44487de80f1e43484b7c3","6ab444b49d2ceaa41dfc15a3","6ab444b49d2ceaa41dfc15a8","6adabff1d8bdac6656452cbd","6adabff1d8bdac6656452cad"];
for (const id of ids) {
  const w = await base44.entities.WorkOrder.get(id).catch(()=>null);
  if (!w) { console.log(id, "NOT FOUND"); continue; }
  console.log(JSON.stringify({id, title:w.title, client:w.client_name, task:w.current_task_description, assignee:w.current_task_assigned_to, stage:w.current_stage, status:w.sales_status, deleted:w.deleted, row:w.smartsheet_row_id, updated:w.updated_date}));
}
