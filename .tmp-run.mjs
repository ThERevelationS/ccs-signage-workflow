const rows = await base44.entities.GlobalSettings.filter({ setting_key: "smartsheetSalesSyncStatus" });
const v = rows?.[0]?.setting_value;
const r = v?.results?.[0] || {};
console.log("status:", v?.status, "| run:", v?.started_at, "→", v?.completed_at);
console.log(JSON.stringify({needs_review: v?.needs_review, rows: r.rows_examined, updated: r.updated, unchanged: r.unchanged_skipped, errors: r.errors, pending: r.local_pending_preserved, newly: r.local_pending_newly_reported, localWins: r.local_wins_silent, write_failures: r.business_field_write_failures, snapshot_review: r.snapshot_review_required, error_details: r.error_details}, null, 1));
const open = await base44.entities.SyncConflict.filter({ status: "open" });
console.log("open conflicts:", open.length);
