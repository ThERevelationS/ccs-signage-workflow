// Metadata-only, read-only history summary. Never interprets a BackupLog as
// proof that a Google Drive file still exists or is a valid restoration source.
const safeText = (value, max = 200) => String(value ?? "").trim().slice(0, max);
const descending = (a,b) => b.created_date.localeCompare(a.created_date);

export function summarizeWorkOrderHistory(backupLogs, importJobs, workOrderAudit) {
  if (!Array.isArray(backupLogs) || !Array.isArray(importJobs) || !workOrderAudit || !Array.isArray(workOrderAudit.creation_days)) {
    throw new Error("Historical reconciliation requires complete, verified inputs.");
  }
  const backupIds = new Set();
  const importIds = new Set();
  const logRows = backupLogs.map(log => {
    const id = safeText(log?.id);
    if (!id || backupIds.has(id)) throw new Error("BackupLog identity is missing or duplicated.");
    backupIds.add(id);
    return log;
  });
  const jobs = importJobs.map(job => {
    const id = safeText(job?.id);
    if (!id || importIds.has(id)) throw new Error("ImportJob identity is missing or duplicated.");
    importIds.add(id);
    return job;
  });

  const workOrderEvents = logRows.flatMap(log => (Array.isArray(log.results) ? log.results : [])
    .filter(item => item?.type === "workorders")
    .map(item => ({
      created_date: safeText(log.created_date, 45),
      success: item.success === true && !item.skipped && !item.error,
      skipped: item.skipped === true,
      failed: Boolean(item.error) || (item.success === false && !item.skipped),
      filename: safeText(item.filename, 260),
    })));
  const successfulWorkOrder = workOrderEvents.filter(x => x.success).sort(descending);
  const salesEvents = logRows.flatMap(log => (Array.isArray(log.results) ? log.results : [])
    .filter(item => item?.type === "smartsheet_sales")
    .map(item => ({
      created_date: safeText(log.created_date, 45),
      logged_success: item.success === true && !item.error && !item.skipped,
    })));
  const successfulSales = salesEvents.filter(x => x.logged_success)
    .sort((a,b)=>a.created_date.localeCompare(b.created_date));
  const importStatus = {};
  const importTypes = {};
  for (const job of jobs) {
    const status = safeText(job.status, 60) || "(missing)";
    const type = safeText(job.import_type, 80) || "(missing)";
    importStatus[status] = (importStatus[status] || 0) + 1;
    importTypes[type] = (importTypes[type] || 0) + 1;
  }
  const lastBackup = successfulWorkOrder.find(x => /^\d{4}-\d{2}-\d{2}/.test(x.created_date)) || null;
  const cohort = workOrderAudit.creation_days
    .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.name))
    .sort((a,b)=>a.name.localeCompare(b.name));
  const afterLastBackup = lastBackup
    ? cohort.filter(x => x.name > lastBackup.created_date.slice(0,10))
      .reduce((n,x)=>n+Number(x.count||0),0)
    : null;
  return {
    backup_log_count: logRows.length,
    workorder_backup_attempts: workOrderEvents.length,
    workorder_backup_logged_success: successfulWorkOrder.length,
    workorder_backup_skipped: workOrderEvents.filter(x=>x.skipped).length,
    workorder_backup_failed: workOrderEvents.filter(x=>x.failed).length,
    last_logged_successful_workorder_backup: lastBackup
      ? { logged_at: lastBackup.created_date, filename: lastBackup.filename } : null,
    sales_presync_log_count: salesEvents.length,
    sales_presync_logged_success: successfulSales.length,
    first_sales_presync_log: successfulSales[0]?.created_date || null,
    latest_sales_presync_log: successfulSales.at(-1)?.created_date || null,
    import_job_count: jobs.length,
    import_statuses: importStatus,
    import_types: importTypes,
    import_jobs_on_first_creation_day: cohort[0]?.name
      ? jobs.filter(x=>safeText(x.created_date,45).startsWith(cohort[0].name)).length : 0,
    workorders_created_after_last_logged_backup_day: afterLastBackup,
    backup_files_verified: false,
    description: "Log metadata only. A successful BackupLog does not verify that the backup file is accessible or complete.",
  };
}
