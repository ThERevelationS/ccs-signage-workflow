const all = await base44.entities.SyncConflict.filter({});
const today = all.filter(c => c.created_date > "2026-10-27T00:00:00");
console.log("conflicts created today:", today.length);
for (const c of today) console.log(c.status, c.dataset, c.field_name, c.created_date, `local="${String(c.local_value).slice(0,40)}" remote="${String(c.remote_value).slice(0,40)}"`);
