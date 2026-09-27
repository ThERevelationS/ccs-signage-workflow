// Read-only WorkOrder provenance audit. A matching client/title is a review hint,
// never evidence that records should be deleted or merged.
const text = (value, max = 200) => String(value ?? "").trim().slice(0, max);
const normalize = value => text(value).replace(/\s+/g, " ").toLowerCase();
const sorted = map => [...map.entries()]
  .map(([name, count]) => ({ name, count }))
  .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

export function buildWorkOrderReconciliation(records, sampleLimit = 12) {
  if (!Array.isArray(records)) throw new Error("WorkOrder audit needs a verified complete array.");
  const limit = Math.max(0, Math.min(25, Number(sampleLimit) || 0));
  const ids = new Set();
  const sheetLinks = new Map();
  const clientTitles = new Map();
  const cohorts = new Map();
  const sheetCounts = new Map();
  const metrics = {
    total: 0, active: 0, deleted: 0, linked_sheet_rows: 0,
    missing_sheet_links: 0, invalid_sheet_links: 0,
    linked_estimates: 0, with_invoice_number: 0, sales_pipeline: 0,
  };
  for (const job of records) {
    const id = text(job?.id, 100);
    if (!id || ids.has(id)) throw new Error("Missing or repeated CCS WorkOrder ID. Audit aborted.");
    ids.add(id);
    metrics.total++;
    if (job.deleted === true) metrics.deleted++;
    else metrics.active++;
    if (job.estimate_id) metrics.linked_estimates++;
    if (text(job.corbridge_invoice_number)) metrics.with_invoice_number++;
    if (job.in_pipeline === true) metrics.sales_pipeline++;

    const day = /^\d{4}-\d{2}-\d{2}/.exec(text(job.created_date, 40))?.[0] || "(missing)";
    cohorts.set(day, (cohorts.get(day) || 0) + 1);
    const sheet = text(job.smartsheet_sheet_id, 60);
    const row = text(job.smartsheet_row_id, 60);
    if (!sheet && !row) metrics.missing_sheet_links++;
    else if (!/^\d+$/.test(sheet) || !/^\d+$/.test(row)) metrics.invalid_sheet_links++;
    else {
      metrics.linked_sheet_rows++;
      sheetCounts.set(sheet, (sheetCounts.get(sheet) || 0) + 1);
      const key = sheet + ":" + row;
      if (!sheetLinks.has(key)) sheetLinks.set(key, []);
      sheetLinks.get(key).push(id);
    }

    const client = normalize(job.client_name);
    const title = normalize(job.title);
    if (client && title) {
      const key = JSON.stringify([client, title]);
      if (!clientTitles.has(key)) clientTitles.set(key, []);
      clientTitles.get(key).push({ id, sheet_row_id: row, client: text(job.client_name), title: text(job.title) });
    }
  }
  const duplicateLinks = [...sheetLinks.entries()]
    .filter(([, members]) => members.length > 1)
    .sort((a,b) => b[1].length-a[1].length || a[0].localeCompare(b[0]));
  const similarNames = [...clientTitles.values()]
    .filter(members => members.length > 1)
    .sort((a,b) => b.length-a.length || a[0].id.localeCompare(b[0].id));
  return {
    ...metrics,
    unique_workorder_ids: ids.size,
    distinct_sheet_links: sheetLinks.size,
    duplicate_sheet_link_groups: duplicateLinks.length,
    duplicate_sheet_link_records: duplicateLinks.reduce((count,[,members])=>count+members.length,0),
    same_customer_title_groups: similarNames.length,
    same_customer_title_records: similarNames.reduce((count,members)=>count+members.length,0),
    creation_days: sorted(cohorts),
    sheet_groups: sorted(sheetCounts),
    duplicate_sheet_link_samples: duplicateLinks.slice(0,limit).map(([link,ids])=>({ link, ids })),
    review_only_name_samples: similarNames.slice(0,limit).map(members=>({
      client: members[0].client, title: members[0].title,
      count: members.length, jobs: members.slice(0, 20).map(({id,sheet_row_id})=>({id,sheet_row_id})),
    })),
  };
}
