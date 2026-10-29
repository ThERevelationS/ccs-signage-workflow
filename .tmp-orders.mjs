for (const key of ["smartsheetOrderSyncStatus"]) {
  const rows = await base44.entities.GlobalSettings.filter({ setting_key: key });
  const v = rows?.[0]?.setting_value;
  const r = v?.results?.[0] || {};
  console.log("=== "+key+" ===");
  console.log("status:", v?.status, "| run:", v?.started_at, "→", v?.completed_at, "| needs_review:", v?.needs_review);
  console.log(JSON.stringify({rows: r.rows_examined, updated: r.updated, errors: r.errors, pending: r.local_pending_preserved, orphans: r.orphans_flagged_for_review, unresolved: r.unresolved_rows, error_details: (r.error_details||[]).slice(0,3)}, null, 1).slice(0,1200));
}
const openOrders = await base44.entities.SyncConflict.filter({ status: "open", dataset: "orders" });
console.log("open order conflicts:", openOrders.length);
