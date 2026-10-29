const all = await base44.entities.SyncConflict.filter({});
const recent = all.filter(c => c.created_date > "2026-10-27T12:00:00").sort((a,b)=>b.created_date.localeCompare(a.created_date));
console.log("conflicts since noon today:", recent.length);
for (const c of recent.slice(0,15)) {
  console.log(`${c.status} | ${c.created_date} | upd=${c.updated_date} | ${c.dataset}/${c.field_name} | rec=${c.entity_id.slice(-6)} | "${String(c.local_value).slice(0,35)}" → "${String(c.remote_value).slice(0,35)}" | key=${c.conflict_key||''}`);
}
