try {
  const res = await base44.functions.invoke("smartsheetSyncAction", { action: "status" });
  const d = res?.data ?? res;
  const s = d?.status_sales || {};
  const r = s?.results?.[0] || {};
  console.log("sales status:", s.status, "| needs_review:", s.needs_review, "| run:", s.started_at, "→", s.completed_at);
  console.log("rows:", r.rows_examined, "| errors:", r.errors, "| pending:", r.local_pending_preserved, "| newly:", r.local_pending_newly_reported, "| localWins:", r.local_wins_silent, "| write_fail:", r.business_field_write_failures, "| snap_review:", r.snapshot_review_required, "| err_details:", JSON.stringify(r.error_details||[]).slice(0,200));
} catch(e) { console.log("ERR", JSON.stringify(e?.response?.data||e.message).slice(0,300)); }
const open = await base44.entities.SyncConflict.filter({ status: "open" });
console.log("open conflicts:", open.length);
