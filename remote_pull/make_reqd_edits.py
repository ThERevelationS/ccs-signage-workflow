import json

helpers = """const QUOTE_APPROVAL_THRESHOLD_KEY = 'quote_approval_threshold';
const DEFAULT_QUOTE_APPROVAL_THRESHOLD = 5000;
const QUOTE_APPROVAL_REQUIRED_MESSAGE = 'This quote exceeds the internal approval threshold — a manager must approve it before sending.';

const money = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

async function loadQuoteApprovalThreshold(Settings: any) {
  const rows = await Settings.filter({ setting_key: QUOTE_APPROVAL_THRESHOLD_KEY });
  if (!Array.isArray(rows)) throw new Error('Quote approval threshold setting could not be verified.');
  const raw = rows[0]?.setting_value;
  const parsed = Number(raw?.threshold ?? raw?.value ?? raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_QUOTE_APPROVAL_THRESHOLD;
}

function recordedQuoteApproval(estimate: any) {
  const approval = estimate?.internal_approval;
  if (!approval || typeof approval !== 'object' || Array.isArray(approval)) return null;
  if (!approval.approved_at && !approval.approved_by_email && !approval.approved_by_user_id) return null;
  return approval;
}

function quoteApprovalCovers(estimate: any, quoteTotal: number) {
  const approval = recordedQuoteApproval(estimate);
  if (!approval) return false;
  // An approval recorded at a lower total does not cover a larger quote; the
  // quote needs a fresh approval if its total grew past the approved amount.
  const approvedTotal = Number(approval?.quote_total_at_approval);
  if (Number.isFinite(approvedTotal) && approvedTotal > 0 && quoteTotal > approvedTotal + 0.005) return false;
  return true;
}

async function assertQuoteSendAuthorized({ Settings, estimate, quoteTotal, user }: any) {
  const threshold = await loadQuoteApprovalThreshold(Settings);
  if (!(quoteTotal > threshold)) return { threshold, required: false };
  if (user?.can_approve_quotes === true) return { threshold, required: true, manager_bypass: true };
  if (quoteApprovalCovers(estimate, quoteTotal)) {
    return { threshold, required: true, approval: estimate.internal_approval };
  }
  throw Object.assign(new Error(QUOTE_APPROVAL_REQUIRED_MESSAGE), { status: 403 });
}

async function approveEstimateQuote({ Estimate, Settings, user, body }: any) {
  if (user?.can_approve_quotes !== true) {
    return Response.json({ error: 'This account is not authorized to approve customer quotes.' }, { status: 403 });
  }
  const estimateId = cleanText(body?.estimate_id, 128);
  if (!estimateId) {
    return Response.json({ error: 'Estimate is required for quote approval.' }, { status: 400 });
  }
  const estimate = await Estimate.get(estimateId).catch(() => null);
  if (!estimate?.id) {
    return Response.json({ error: 'Estimate could not be verified for quote approval.' }, { status: 404 });
  }
  const threshold = await loadQuoteApprovalThreshold(Settings);
  const quoteTotal = Math.max(money(body?.quote_total), money(estimate.quote_total));
  if (quoteApprovalCovers(estimate, quoteTotal)) {
    return Response.json({ success: true, estimate_id: estimate.id, internal_approval: estimate.internal_approval, reused: true });
  }
  const approval = {
    approved_by_user_id: String(user.id || ''),
    approved_by_email: String(user.email || '').trim().toLowerCase(),
    approved_at: new Date().toISOString(),
    threshold_at_approval: threshold,
    quote_total_at_approval: quoteTotal,
    quote_version: Math.max(0, whole(estimate.quote_version)),
  };
  const expectedVersion = String(estimate.updated_date || '').trim();
  if (!expectedVersion) {
    return Response.json({ error: 'Estimate is missing version metadata and cannot be approved safely.' }, { status: 409 });
  }
  const result = await Estimate.updateMany(
    { id: estimate.id, updated_date: expectedVersion },
    { $set: { internal_approval: approval } },
  );
  if (!result || typeof result.updated !== 'number') {
    throw new Error('Quote approval conditional-update result could not be verified.');
  }
  if (result.updated !== 1) {
    // The estimate changed between the read and the CAS write. If a concurrent
    // manager already recorded a covering approval, adopt it; otherwise make
    // the conflict explicit so a stale session never silently double-approves.
    const after = await Estimate.get(estimate.id).catch(() => null);
    if (after?.id && quoteApprovalCovers(after, quoteTotal)) {
      return Response.json({ success: true, estimate_id: estimate.id, internal_approval: after.internal_approval, reused: true });
    }
    return Response.json({ error: 'Estimate changed while the approval was being recorded. Reload before approving again.' }, { status: 409 });
  }
  const saved = await Estimate.get(estimate.id).catch(() => null);
  if (String(saved?.internal_approval?.approved_at || '') !== approval.approved_at) {
    throw new Error('Quote approval was written but could not be verified.');
  }
  return Response.json({ success: true, estimate_id: estimate.id, internal_approval: approval });
}

Deno.serve(async (req) => {"""

dispatch_old = """    const body = await req.json().catch(() => ({}));
    await authenticateSignShopSession(base44, body?.session_token);

    const input = body?.delivery"""
dispatch_new = """    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);

    const Estimate = base44.asServiceRole.entities.AllInOneEstimate;
    const Settings = base44.asServiceRole.entities.GlobalSettings;
    const action = cleanText(body?.action, 64);

    if (action === 'approve_quote') {
      return await approveEstimateQuote({ Estimate, Settings, user, body });
    }
    if (action === 'authorize_send') {
      const authorizeEstimateId = cleanText(body?.estimate_id, 128);
      if (!authorizeEstimateId) {
        return Response.json({ error: 'Estimate is required for send authorization.' }, { status: 400 });
      }
      const authorizeEstimate = await Estimate.get(authorizeEstimateId).catch(() => null);
      if (!authorizeEstimate?.id) {
        return Response.json({ error: 'Estimate could not be verified for quote sending.' }, { status: 404 });
      }
      const authorizeTotal = Math.max(money(body?.quote_total), money(authorizeEstimate.quote_total));
      const gate = await assertQuoteSendAuthorized({ Settings, estimate: authorizeEstimate, quoteTotal: authorizeTotal, user });
      return Response.json({ success: true, allowed: true, ...gate, internal_approval: recordedQuoteApproval(authorizeEstimate) });
    }

    const input = body?.delivery"""

entities_old = """    const Estimate = base44.asServiceRole.entities.AllInOneEstimate;
    const Delivery = base44.asServiceRole.entities.EstimateQuoteDelivery;"""
entities_new = """    const Delivery = base44.asServiceRole.entities.EstimateQuoteDelivery;"""

gate_old = """    let created: any = null;
    let createError: any = null;
    try {
      created = await Delivery.create(normalized);"""
gate_new = """    // Internal approval gate: a quote above the configured threshold cannot be
    // recorded as sent until a manager approves it — either live (the session
    // user carries can_approve_quotes) or through a recorded internal_approval.
    // The pre-send authorize_send action runs the same check before Gmail is
    // invoked, so this write is the enforcement backstop.
    await assertQuoteSendAuthorized({
      Settings,
      estimate,
      quoteTotal: Math.max(normalized.quote_total, money(estimate.quote_total)),
      user,
    });

    let created: any = null;
    let createError: any = null;
    try {
      created = await Delivery.create(normalized);"""

status_old = "const safeStatus = [400, 401, 404, 409, 503].includes(status) ? status : 500;"
status_new = "const safeStatus = [400, 401, 403, 404, 409, 503].includes(status) ? status : 500;"

edits = [
    {"old_text": "Deno.serve(async (req) => {", "new_text": helpers},
    {"old_text": dispatch_old, "new_text": dispatch_new},
    {"old_text": entities_old, "new_text": entities_new},
    {"old_text": gate_old, "new_text": gate_new},
    {"old_text": status_old, "new_text": status_new},
]
with open('remote_pull/reqd_edits.json', 'w', encoding='utf-8') as f:
    json.dump(edits, f)
print('ok', len(edits))
