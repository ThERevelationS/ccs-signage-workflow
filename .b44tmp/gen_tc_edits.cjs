const fs = require('fs');
const E = [];
const add = (oldText, newText) => E.push({ old_text: oldText, new_text: newText });

const RANGE_30D = `      const from = typeof body.from === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(body.from) ? body.from : dateKeyInCompanyTime(new Date(Date.now() - 30 * 86400000).toISOString());
      const to = typeof body.to === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(body.to) ? body.to : dateKeyInCompanyTime(new Date().toISOString());`;

const RANGE_OPT = `      const from = typeof body.from === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(body.from) ? body.from : '';
      const to = typeof body.to === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(body.to) ? body.to : '';`;

// 1. import loadAllEntityRows
add(
  `import { processWorkflowTriggerEvent } from '../../shared/workflowTriggerEngine.ts';`,
  `import { processWorkflowTriggerEvent } from '../../shared/workflowTriggerEngine.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';`);

// 2. range helpers (module scope, next to dateKeyInCompanyTime)
add(
  `function payrollMembershipEnvelope(clockIn: any) {`,
  `// Company-local [from, to] date keys padded into a conservative UTC window
// for a server-side range filter on a date-time field. New York sits 4-5h
// behind UTC; the one-day pad on each side covers every real timezone
// offset, so the database pre-filters while dateKeyInCompanyTime stays the
// exact judge of company-day membership.
function shiftCompanyDateKey(dateKey: string, days: number) {
  return new Date(Date.parse(\`\${dateKey}T00:00:00.000Z\`) + days * 86400000).toISOString().slice(0, 10);
}
function companyRangeQuery(field: string, from: string, to: string) {
  return { [field]: { $gte: \`\${shiftCompanyDateKey(from, -1)}T00:00:00.000Z\`, $lt: \`\${shiftCompanyDateKey(to, 2)}T00:00:00.000Z\` } };
}

function payrollMembershipEnvelope(clockIn: any) {`);

// 3. payroll_export
add(
  `      if (!from || !to) return Response.json({ success: false, error: 'from and to dates (YYYY-MM-DD) are required.' }, { status: 400 });
      const rows = await entryEntity.filter({}, '-clock_in', 4000).catch(() => []);`,
  `      if (!from || !to) return Response.json({ success: false, error: 'from and to dates (YYYY-MM-DD) are required.' }, { status: 400 });
      const rows = await loadAllEntityRows({
        entity: entryEntity,
        query: companyRangeQuery('clock_in', from, to),
        sort: '-clock_in',
        label: 'Payroll export entries',
      }).catch(() => null);`);

// 4. labor_vs_estimate
add(
  `      const rows = await entryEntity.filter({}, '-clock_in', 3000).catch(() => []);
      const rollup = new Map();`,
  `${RANGE_OPT}
      const rows = await loadAllEntityRows({
        entity: entryEntity,
        query: from && to ? companyRangeQuery('clock_in', from, to) : {},
        sort: '-clock_in',
        label: 'Labor vs estimate entries',
      }).catch(() => []);
      const rollup = new Map();`);

// 5. overtime_cost_report (from/to already defined above)
add(
  `      const rows = await entryEntity.filter({}, '-clock_in', 3000).catch(() => []);
      const byEmp = new Map();
      for (const e of (Array.isArray(rows) ? rows : [])) {
        const dk = dateKeyInCompanyTime(e.clock_in);
        if (!dk || dk < from || dk > to || e.archived_test_data === true || e.archived_admin === true) continue;`,
  `      const rows = await loadAllEntityRows({
        entity: entryEntity,
        query: companyRangeQuery('clock_in', from, to),
        sort: '-clock_in',
        label: 'Overtime report entries',
      }).catch(() => []);
      const byEmp = new Map();
      for (const e of (Array.isArray(rows) ? rows : [])) {
        const dk = dateKeyInCompanyTime(e.clock_in);
        if (!dk || dk < from || dk > to || e.archived_test_data === true || e.archived_admin === true) continue;`);

// 6. differential_hours_report
add(
  `      const rows = await entryEntity.filter({}, '-clock_in', 3000).catch(() => []);
      // cur.getHours() is UTC on the server; the differential window is a`,
  `${RANGE_30D}
      const rows = await loadAllEntityRows({
        entity: entryEntity,
        query: companyRangeQuery('clock_in', from, to),
        sort: '-clock_in',
        label: 'Differential hours entries',
      }).catch(() => []);
      // cur.getHours() is UTC on the server; the differential window is a`);

// 7. buddy_punch_report
add(
  `      const rows = await entryEntity.filter({}, '-clock_in', 2000).catch(() => []);
      const clean = (Array.isArray(rows) ? rows : []).filter((e: any) => e.clock_in && e.archived_test_data !== true && e.archived_admin !== true);`,
  `${RANGE_30D}
      const rows = await loadAllEntityRows({
        entity: entryEntity,
        query: companyRangeQuery('clock_in', from, to),
        sort: '-clock_in',
        label: 'Buddy punch entries',
      }).catch(() => []);
      const clean = (Array.isArray(rows) ? rows : []).filter((e: any) => e.clock_in && e.archived_test_data !== true && e.archived_admin !== true);`);

// 8. crew_view (today's rows only; explicit bound + truncated flag)
add(
  `      const rows = await entryEntity.filter({}, '-clock_in', 1000).catch(() => []);
      const roster = await authorized.filter({}).catch(() => []);`,
  `      const rows = await entryEntity.filter(companyRangeQuery('clock_in', todayKey, todayKey), '-clock_in', 500).catch(() => []);
      const roster = await loadAllEntityRows({ entity: authorized, label: 'Crew view roster' }).catch(() => []);`);

// 9. device_usage_report
add(
  `      const rows = await entryEntity.filter({}, '-clock_in', 3000).catch(() => []);
      const counts = new Map();`,
  `${RANGE_30D}
      const rows = await loadAllEntityRows({
        entity: entryEntity,
        query: companyRangeQuery('clock_in', from, to),
        sort: '-clock_in',
        label: 'Device usage entries',
      }).catch(() => []);
      const counts = new Map();`);

// 10. break_compliance_report (from/to already defined above)
add(
  `      const to = typeof body.to === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(body.to) ? body.to : dateKeyInCompanyTime(new Date().toISOString());
      const rows = await entryEntity.filter({}, '-clock_in', 4000).catch(() => []);`,
  `      const to = typeof body.to === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(body.to) ? body.to : dateKeyInCompanyTime(new Date().toISOString());
      const rows = await loadAllEntityRows({
        entity: entryEntity,
        query: companyRangeQuery('clock_in', from, to),
        sort: '-clock_in',
        label: 'Break compliance entries',
      }).catch(() => []);`);

// 11. pause_reason_rollup (WorkPause.started_at window)
add(
  `      const rows = await workPauseEntity.filter({}, '-started_at', 1000).catch(() => []);`,
  `${RANGE_30D}
      const rows = await loadAllEntityRows({
        entity: workPauseEntity,
        query: companyRangeQuery('started_at', from, to),
        sort: '-started_at',
        label: 'Work pause rollup rows',
      }).catch(() => []);`);

// 12. list_timeclock_audit — unordered default-50 sorted client-side meant
// the "latest 60" was whatever a random 50-row window held. Server-side
// -created_date sort makes the slice(0,60) deterministic and correct.
add(
  `      const rows = await auditEntity.filter({});`,
  `      const rows = await auditEntity.filter({}, '-created_date', 500);`);

const out = E.map((e) => ({
  old_text: e.old_text.replace(/\n/g, '\r\n'),
  new_text: e.new_text.replace(/\n/g, '\r\n'),
}));
fs.writeFileSync('tc_edits.json', JSON.stringify(out));
console.log('edits:', out.length, 'bytes:', fs.statSync('tc_edits.json').size);
