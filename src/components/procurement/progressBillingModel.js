// Progress (milestone) billing math — pure and deterministic.
// CoreBridge-style AIA-lite: a job's contract value is split into percentage
// milestones; already-invoiced dollars walk the schedule in order, so the next
// billable milestone is always derivable from amounts alone. Hard caps: no
// milestone may push cumulative pct over 100 or billed dollars over job total.

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const clean = (v) => String(v ?? "").trim();
export const money = (v) => Math.round(num(v) * 100) / 100;
const EPS = 0.005;

export const MILESTONE_STATUS = { OPEN: "open", PARTIAL: "partial", BILLED: "billed" };
export const MILESTONE_STATUS_LABELS = { open: "Open", partial: "Partial", billed: "Billed" };

export const DEFAULT_SCHEDULE = [
  { label: "Deposit", pct: 50 },
  { label: "Completion", pct: 50 },
];

// Sanitize a user-entered schedule: trim labels, auto-label blanks, clamp pct to
// (0, 100], and trim the tail so cumulative pct never exceeds 100.
export function normalizeSchedule(schedule) {
  const rows = Array.isArray(schedule) ? schedule : [];
  const out = [];
  let cumulative = 0;
  rows.forEach((row, i) => {
    if (cumulative >= 100 - EPS) return;
    let pct = num(row?.pct, NaN);
    if (!Number.isFinite(pct) || pct <= 0) return;
    pct = Math.min(100, Math.round(pct * 100) / 100);
    if (cumulative + pct > 100 + EPS) pct = money(100 - cumulative);
    cumulative = money(cumulative + pct);
    out.push({ label: clean(row?.label) || `Milestone ${out.length + 1}`, pct });
  });
  return out;
}

// Allocate dollar amounts onto a normalized schedule. Penny-safe: when the
// schedule totals 100%, the LAST milestone takes total minus prior cumulative
// so amounts always sum exactly to the job total.
export function milestoneAmounts(schedule, jobTotal) {
  const total = Math.max(0, money(jobTotal));
  const norm = normalizeSchedule(schedule);
  let cumulativePct = 0;
  let cumulativeAmount = 0;
  return norm.map((m, i) => {
    cumulativePct = money(cumulativePct + m.pct);
    // Penny-safe: each milestone gets (cumulative pct of total) minus what was
    // already allocated, so when the schedule reaches 100% the last milestone
    // takes the exact remainder and amounts sum exactly to the job total.
    const amount = money(money(total * (cumulativePct / 100)) - cumulativeAmount);
    cumulativeAmount = money(cumulativeAmount + amount);
    return { ...m, index: i, amount, cumulative_pct: cumulativePct, cumulative_amount: cumulativeAmount };
  });
}

// Billing state for one job: which milestones are covered by invoiced dollars,
// what the next billable milestone is, and the unscheduled remainder (when the
// schedule sums to less than 100%).
export function deriveBillingState({ jobTotal, schedule, invoiced } = {}) {
  const total = Math.max(0, money(jobTotal));
  const billed = Math.max(0, money(invoiced));
  const milestones = milestoneAmounts(schedule, total);
  const coveredTotal = Math.min(billed, total);
  let cursor = 0;
  const withStatus = milestones.map((m) => {
    const covered = Math.min(m.amount, Math.max(0, money(coveredTotal - cursor)));
    cursor = money(cursor + m.amount);
    const status = covered >= m.amount - EPS && m.amount > EPS
      ? MILESTONE_STATUS.BILLED
      : covered > EPS
        ? MILESTONE_STATUS.PARTIAL
        : MILESTONE_STATUS.OPEN;
    return { ...m, covered: money(covered), open_amount: money(m.amount - covered), status };
  });
  const scheduledAmount = milestones.length ? milestones[milestones.length - 1].cumulative_amount : 0;
  const scheduledPct = milestones.length ? milestones[milestones.length - 1].cumulative_pct : 0;
  const unscheduledAmount = money(total - scheduledAmount);

  const nextMilestone = withStatus.find((m) => m.status !== MILESTONE_STATUS.BILLED) || null;
  const remaining = money(total - billed);
  const next = nextMilestone && remaining > EPS
    ? {
        index: nextMilestone.index,
        label: nextMilestone.label,
        pct: nextMilestone.pct,
        amount: money(Math.min(nextMilestone.open_amount, remaining)),
        cumulative_pct_after: nextMilestone.cumulative_pct,
        is_final: nextMilestone.index === withStatus.length - 1 && unscheduledAmount <= EPS,
      }
    : null;

  return {
    job_total: total,
    invoiced: billed,
    collected_coverage: money(Math.min(billed, total)),
    billed_pct: total > EPS ? Math.round((coveredTotal / total) * 1000) / 10 : 0,
    remaining,
    over_billed: billed > total + EPS ? money(billed - total) : 0,
    milestones: withStatus,
    scheduled_pct: scheduledPct,
    unscheduled_pct: money(100 - scheduledPct),
    unscheduled_amount: unscheduledAmount,
    next,
    complete: remaining <= EPS && total > EPS,
  };
}

// Exact invoicingAction create_invoice payload for one milestone bill.
// Backend: {action:'create_invoice', creation_request_key, fields:{customer_id,
// work_order_id, estimate_id, opportunity_id, line_items:[{description,quantity,
// unit_price,taxable}], notes, source_summary}} — creates a DRAFT invoice.
export function buildMilestoneInvoicePayload({ workOrder, milestone, jobTotal, schedule, requestKey }) {
  const wo = workOrder || {};
  const title = clean(wo.title) || "Work order";
  const description = `${milestone.label} (${milestone.pct}%) — progress billing — ${title}`;
  return {
    action: "create_invoice",
    creation_request_key: clean(requestKey) || `progress-billing:${clean(wo.id)}:${milestone.index}:${Date.now()}`,
    fields: {
      customer_id: clean(wo.customer_id),
      customer_display_name: clean(wo.client_name),
      work_order_id: clean(wo.id),
      estimate_id: clean(wo.estimate_id),
      opportunity_id: clean(wo.opportunity_id),
      line_items: [{ description, quantity: 1, unit_price: money(milestone.amount), taxable: false }],
      notes: `Progress billing milestone "${milestone.label}" — ${milestone.pct}% of ${money(jobTotal)} contract value.`,
      source_summary: {
        kind: "progress_billing",
        milestone_index: milestone.index,
        milestone_label: milestone.label,
        milestone_pct: milestone.pct,
        job_total: money(jobTotal),
        schedule: normalizeSchedule(schedule),
      },
    },
  };
}

// Fallback payload when the work order has no customer_id but does link an
// approved estimate — routes through invoicingAction create_from_estimate,
// which enforces its own remaining-billable cap server-side.
// Backend: {action:'create_from_estimate', estimate_id, billing_mode,
// deposit_amount, notes}.
export function buildEstimateBillingPayload({ estimateId, milestone, isFinal }) {
  return {
    action: "create_from_estimate",
    estimate_id: clean(estimateId),
    billing_mode: isFinal ? "final" : "deposit",
    ...(isFinal ? {} : { deposit_amount: money(milestone.amount) }),
    notes: `Progress billing milestone "${milestone.label}" (${milestone.pct}%).`,
  };
}
