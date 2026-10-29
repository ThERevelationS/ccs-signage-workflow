for (const st of ["open","approved","superseded","resolved"]) {
  const rows = await base44.entities.SyncConflict.filter({ status: st });
  const today = (rows||[]).filter(c => String(c.created_date||"") > "2026-10-27T00:00:00");
  console.log(`${st}: total=${rows.length} today=${today.length}`);
  for (const c of today.slice(0,8)) console.log(`   ${c.created_date} | ${c.dataset}/${c.field_name} | rec=${String(c.entity_id).slice(-6)} | "${String(c.local_value).slice(0,35)}" → "${String(c.remote_value).slice(0,35)}"`);
}
