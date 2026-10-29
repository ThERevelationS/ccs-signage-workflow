const rows = await base44.entities.GlobalSettings.filter({ setting_key: "smartsheetSalesSyncStatus" });
const v = rows?.[0]?.setting_value;
const r = v?.results?.[0] || {};
console.log("status:", v?.status, "| run:", v?.started_at, "| needs_review:", v?.needs_review,
  "| rows:", r.rows_examined, "| errors:", r.errors, "| pending:", r.local_pending_preserved, "| newly:", r.local_pending_newly_reported);
const open = await base44.entities.SyncConflict.filter({ status: "open" });
console.log("open conflicts:", open.length);
