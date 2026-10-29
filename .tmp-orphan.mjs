const open = await base44.entities.SyncConflict.filter({ status: "open" });
console.log("open conflicts:", open.length);
for (const c of open) console.log(c.id, c.status, c.entity_id, `"${c.local_value}"`, "→", `"${c.remote_value}"`);
const r = await base44.entities.WorkOrder.get("6ab444b0321a02eebe9472ee").catch(e => null);
console.log("record exists:", !!r);
// check trash/deleted view if any
const all = await base44.entities.SyncConflict.filter({ entity_id: "6ab444b0321a02eebe9472ee" });
for (const c of all) console.log("conflict row:", c.id, c.status, c.created_date);
