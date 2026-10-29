const open = await base44.entities.SyncConflict.filter({ status: "open" });
console.log("OPEN:", open.length);
const byField = {};
for (const c of open) {
  const k = `${c.dataset}/${c.field_name}`;
  (byField[k] = byField[k] || []).push(c);
}
for (const [k, arr] of Object.entries(byField)) {
  console.log(`\n=== ${k} (${arr.length}) ===`);
  for (const c of arr.slice(0, 12)) {
    console.log(`${c.entity_id.slice(-6)} created=${c.created_date} local="${String(c.local_value).slice(0,45)}" remote="${String(c.remote_value).slice(0,45)}" lver=${c.local_version} rver=${c.remote_version}`);
  }
}
