const all = await base44.entities.SyncConflict.filter({}, { limit: 500 });
console.log("total fetched:", all.length);
const today = all.filter(c => String(c.created_date||"") > "2026-10-27T00:00:00");
console.log("created today:", today.length);
for (const c of today.sort((a,b)=>String(b.created_date).localeCompare(String(a.created_date))).slice(0,15)) {
  console.log(`${c.status} | ${c.created_date} | ${c.dataset}/${c.field_name} | rec=${String(c.entity_id).slice(-6)} | "${String(c.local_value).slice(0,35)}" → "${String(c.remote_value).slice(0,35)}"`);
}
