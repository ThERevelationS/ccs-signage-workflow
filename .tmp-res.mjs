try {
  const res = await base44.functions.invoke("smartsheetSyncAction", {
    action: "resolve_conflict", conflict_id: null, decision: "smartsheet"
  });
} catch(e) {}
const cnt = await base44.functions.invoke("smartsheetSyncAction", { action: "conflict_count" });
const list = await base44.functions.invoke("smartsheetSyncAction", { action: "conflict_list" });
const items = (list?.data ?? list)?.page?.items || [];
for (const c of items) {
  try {
    const res = await base44.functions.invoke("smartsheetSyncAction", { action: "resolve_conflict", conflict_id: c.id, decision: "smartsheet" });
    console.log(c.id.slice(-6), JSON.stringify(res?.data ?? res).slice(0,300));
  } catch(e) { console.log(c.id.slice(-6), "ERR:", JSON.stringify(e?.response?.data||e.message).slice(0,300)); }
}
const after = await base44.functions.invoke("smartsheetSyncAction", { action: "conflict_count" });
console.log("open after:", JSON.stringify(after?.data ?? after));
