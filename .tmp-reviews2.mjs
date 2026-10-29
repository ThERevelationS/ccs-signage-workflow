const ids = ["6ab4448306a95eb474d068f1","6ab4448306a95eb474d0692f","6ab44487de80f1e43484b7e1","6ab44487de80f1e43484b7c3","6ab444b49d2ceaa41dfc15a3","6ab444b49d2ceaa41dfc15a8","6adabff1d8bdac6656452cbd","6adabff1d8bdac6656452cad"];
const all = await base44.entities.SyncConflict.filter({dataset:"sales"}).catch(e=>{console.log("ERR",e.message);return []});
console.log("total sales conflicts:", all.length);
const open = all.filter(r=>r.status==="open");
console.log("by status:", JSON.stringify(all.reduce((m,r)=>{m[r.status]=(m[r.status]||0)+1;return m},{})));
for (const id of ids) {
  const mine = all.filter(r=>r.entity_id===id);
  console.log("---", id, mine.length, "rows");
  for (const r of mine) console.log("   ", r.status, r.field_name, "| local:", JSON.stringify(r.local_value).slice(0,70), "| remote:", JSON.stringify(r.remote_value).slice(0,70), "| created:", String(r.created_date).slice(0,16));
}
