try {
  const res = await base44.functions.invoke("smartsheetSyncAction", { action: "status" });
  console.log(JSON.stringify(res?.data ?? res).slice(0, 1500));
} catch(e) { console.log("ERR", e?.response?.status, JSON.stringify(e?.response?.data||e.message).slice(0,300)); }
