// Order Form customer picker only. A won job may still be in production;
// exclude terminal job states, not every closed sales opportunity.
const TERMINAL = new Set(["lost", "completed", "closed"]);
const normalized = (value) => String(value ?? "").trim().toLowerCase();
const LEGACY_CLOSED_TASK = /^(lost\b|completed sale\b|closed\b)/i;

export function isActiveOrderCustomerJob(job) {
  if (!job?.id || job.deleted === true || job.completed === true || job.is_rider === true || job.closed === true) return false;
  // Historical non-pipeline WorkOrders may store a terminal outcome in their
  // current-task text rather than a structured status. Do not alter those jobs.
  if (job.in_pipeline !== true && LEGACY_CLOSED_TASK.test(String(job.current_task_description ?? "").trim())) return false;
  return !TERMINAL.has(normalized(job.current_stage)) &&
    !TERMINAL.has(normalized(job.sales_status)) &&
    !TERMINAL.has(normalized(job.status));
}

export function filterOrderCustomerJobs(jobs, searchTerm, limit = 10) {
  const terms = normalized(searchTerm).split(/\s+/).filter(Boolean);
  return (Array.isArray(jobs) ? jobs : [])
    .filter(isActiveOrderCustomerJob)
    .filter(job => {
      if (!terms.length) return true;
      const searchable = [job.client_name, job.title, job.description]
        .filter(Boolean).join(" ").toLowerCase();
      return terms.every(term => searchable.includes(term));
    })
    .slice(0, limit);
}
