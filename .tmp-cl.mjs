try {
  const cnt = await base44.functions.invoke("smartsheetSyncAction", { action: "conflict_count" });
  console.log("count:", JSON.stringify(cnt?.data ?? cnt).slice(0,300));
  const res = await base44.functions.invoke("smartsheetSyncAction", { action: "conflict_list" });
  const d = res?.data ?? res;
  const items = d?.page?.items || d?.page || [];
  console.log("open rows:", d?.count, "| page items:", items.length);
  for (const c of items.slice(0,10)) console.log(` ${c.status} | ${c.created_date} | ${c.dataset}/${c.field_name} | rec=${String(c.entity_id).slice(-6)} | "${String(c.local_value).slice(0,35)}" → "${String(c.remote_value).slice(0,35)}"`);
} catch(e) { console.log("ERR", JSON.stringify(e?.response?.data||e.message).slice(0,400)); }
