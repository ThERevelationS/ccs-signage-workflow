const page = await base44.entities.SyncConflict.filter({}, { sort: "-created_date", limit: 15 });
const rows = Array.isArray(page) ? page : (page?.items || page?.rows || page?.data || []);
console.log("returned:", rows.length);
for (const c of rows) {
  console.log(`${c.status} | ${c.created_date} | ${c.dataset}/${c.field_name} | rec=${String(c.entity_id).slice(-6)} | "${String(c.local_value).slice(0,35)}" → "${String(c.remote_value).slice(0,35)}"`);
}
