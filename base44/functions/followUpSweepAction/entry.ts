import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { nextStage } from '../../shared/followUpMachine.ts';
import {
  buildDeliveryPlan,
  resolveDeliveryChannel,
  resolveEmailDeliveryBlock,
} from '../../shared/delivery.ts';
import { renderTemplate } from '../../shared/templateRender.ts';

// Session-authenticated daily follow-up sweep (ESTIMATOR_MASTERPLAN H-05).
// Scans AllInOneEstimate rows, evaluates shared/followUpMachine.ts nextStage,
// and enqueues each due follow-up through the H-01 delivery adapter —
// GlobalSettings.emailDelivery.enabled === true sends the rendered message via
// Core.SendEmail; otherwise (the default) the event lands as an
// OpportunityActivity row on the staff activity surface. An internal
// Notification row is written on BOTH lanes so the notification center always
// shows the event.
//
// Action:
//   run_follow_up_sweep { dry_run?, limit? }
//     dry_run (any staff) returns the plan with zero writes. A real run is
//     admin-gated — it can email customers. `limit` bounds processed rows.
//
// Idempotency (automation_deadline_fired-style):
//   1. The machine itself is non-repeating — sends stamp stage + last_sent_at.
//   2. Belt: each acted-on row gets follow_up_state.sweep_date = today, and a
//      row whose sweep_date or last_sent_at is already today short-circuits
//      with reason 'sweep_ran_today' — two runs the same day send once.
//   3. The state claim is written BEFORE delivery (same philosophy as
//      claimDeadlineFire): a post-claim send failure leaves the claim standing,
//      trading a possible missed follow-up for a guarantee of no duplicates.
//   4. The claim itself is a CAS updateMany anchored on the loaded
//      updated_date — a concurrent editor owns the record and the row is
//      skipped, not overwritten.
//   5. Notification rows carry a deterministic dedupe_key +
//      creation_request_key; the pre-create dedupe lookup mirrors
//      notificationAction.record so a retried enqueue can never double-post.

const clean = (value: any) => String(value ?? '').trim();
const list = (value: any) => (Array.isArray(value) ? value : []);
const isObj = (value: any) => !!value && typeof value === 'object' && !Array.isArray(value);

const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { status, statusCode: status });

const isAdmin = (user: any) =>
  clean(user?.role).toLowerCase() === 'admin' || user?.is_full_admin === true;

const isoDay = (value: any) => clean(value).slice(0, 10);

// Projected reads keep entity-list volume under the app read cap — every
// field the machine/render context touches is named, including the
// undeclared stored fields the machine normalizes (flat follow_up_* legacy
// twins and the anchor-fallback chain from FOLLOW_UP_ANCHOR_FIELDS).
const ESTIMATE_FIELDS = [
  'id', 'updated_date', 'created_date', 'status', 'is_template',
  'estimate_number', 'project_name', 'client_name',
  'customer_id', 'opportunity_id', 'work_order_id',
  'contact_name', 'contact_email', 'salesperson', 'entered_by_display',
  'quote_total', 'hyperlink', 'quote_issue_date', 'quote_version', 'quote_expiration_date',
  'company_name', 'company_phone', 'company_email',
  'follow_up_state', 'follow_up_date',
  'follow_up_stage', 'follow_up_last_sent_at', 'follow_up_next_due_at',
  'follow_up_anchor_at', 'follow_up_fu1_sent_at', 'follow_up_fu2_sent_at',
  'follow_up_answered_at', 'follow_up_closed_reason',
  'sent_at', 'sent_date', 'quote_sent_at', 'issued_at',
  'proof_sent_at', 'awaiting_proof_approval_since',
];

const CUSTOMER_FIELDS = [
  'id', 'company_name', 'contact_first_name', 'contact_last_name',
  'contact_email', 'billing_contact_email',
];

const STAFF_FIELDS = ['id', 'email', 'full_name', 'is_deactivated'];

const TEMPLATE_FIELDS = [
  'id', 'key', 'kind', 'name', 'subject', 'body',
  'from_source', 'cc_billing', 'attach_pdf', 'status',
];

// GlobalSettings is a KV entity — the delivery flag can sit on the flat A-21
// block, inside a KV blob, or on a legacy alias. Projection covers every
// location delivery.ts DELIVERY_SETTING_PATHS inspects.
const SETTINGS_FIELDS = [
  'id', 'setting_key', 'setting_value',
  'emailDelivery', 'email_delivery_enabled', 'delivery',
];

// Terminal-status rows are scanned too so a still-open sequence (stage
// none/fu1_sent) closes exactly once when the estimate approves, archives,
// or cancels — followUpMachine returns 'close' for them.
const TERMINAL_SCAN_STATUSES = [
  'approved', 'archived', 'cancelled', 'canceled',
  'declined', 'converted', 'won', 'lost',
];

// Notification.category whitelist (mirrors notificationAction NOTIF_CATEGORIES —
// follow-ups ride 'estimate_sent', the closest declared bucket).
const NOTIF_CATEGORY = 'estimate_sent';

const MAX_ERRORS = 40;

// Hardcoded fallbacks when no NotificationTemplate row exists — mirrors the
// seeded estimate_follow_up_1 / estimate_follow_up_2 defaults (w-67 seed set).
const FOLLOW_UP_TEMPLATE_DEFAULTS: Record<string, { subject: string; body: string }> = {
  estimate_follow_up_1: {
    subject: 'Following up on estimate {{estimate.number}} — {{company.name}}',
    body: [
      'Hi {{contact.name|default:"there"}},',
      '',
      'Just checking in on estimate {{estimate.number}} for {{customer.company_name}} — have you had a chance to look it over?',
      '',
      'Estimate: {{estimate.number}} — {{estimate.title}}',
      'Total: {{estimate.total|money}}',
      '',
      'Review or approve it here: {{estimate.approval_url}}',
      '',
      'Happy to answer any questions.',
      '',
      '{{user.display_name}}',
      '{{company.name}}',
    ].join('\n'),
  },
  estimate_follow_up_2: {
    subject: 'One more nudge on estimate {{estimate.number}} — {{company.name}}',
    body: [
      'Hi {{contact.name|default:"there"}},',
      '',
      'Wanted to follow up one more time on estimate {{estimate.number}} for {{customer.company_name}}.',
      '',
      'If the scope or pricing needs adjusting, tell me and I will revise it. If you have already decided, a quick reply either way helps me close the loop.',
      '',
      'Review it here: {{estimate.approval_url}}',
      '',
      '{{user.display_name}}',
      '{{company.name}}',
    ].join('\n'),
  },
};

// The settings object handed to the delivery adapter — first row carrying the
// canonical flat block wins, then a KV-blob carrier, then any legacy alias.
// Rows that declare none of the paths resolve fail-closed to {}.
function resolveDeliverySettings(rows: any[]) {
  for (const row of list(rows)) {
    if (isObj(row?.emailDelivery)) return row;
  }
  for (const row of list(rows)) {
    if (isObj(row?.setting_value?.emailDelivery)) return row;
  }
  for (const row of list(rows)) {
    if (
      row?.email_delivery_enabled !== undefined ||
      row?.setting_value?.email_delivery_enabled !== undefined ||
      isObj(row?.delivery) ||
      isObj(row?.setting_value?.delivery)
    ) return row;
  }
  return {};
}

// Stored salespeople may be emails or display names — resolve to a directory
// email the same way notificationAction.resolveStaffEmail does.
function resolveStaffEmail(raw: any, directory: any[]) {
  const needle = clean(raw).toLowerCase();
  if (!needle) return '';
  if (needle.includes('@')) return needle;
  const match = list(directory).find((u: any) =>
    clean(u?.full_name).toLowerCase() === needle ||
    clean(u?.name).toLowerCase() === needle ||
    clean(u?.username).toLowerCase() === needle);
  return clean(match?.email).toLowerCase();
}

// Render context for the {{placeholder}} vocabulary the seeded templates use
// (estimate.number/title/total/approval_url, customer.company_name,
// contact.name, user.display_name, company.name, location.name/phone).
function buildRenderContext({ estimate, customer, salespersonName }: any) {
  const customerName = clean(estimate?.client_name) || clean(customer?.company_name);
  const contactName =
    clean(estimate?.contact_name) ||
    [clean(customer?.contact_first_name), clean(customer?.contact_last_name)]
      .filter(Boolean).join(' ');
  return {
    estimate: {
      number: clean(estimate?.estimate_number) || clean(estimate?.id),
      title: clean(estimate?.project_name) || 'Signage project',
      total: estimate?.quote_total ?? '',
      approval_url: clean(estimate?.hyperlink),
      due_date: clean(estimate?.quote_expiration_date),
    },
    customer: { company_name: customerName },
    contact: { name: contactName, email: clean(estimate?.contact_email) },
    user: { display_name: clean(salespersonName) || 'The team' },
    company: { name: clean(estimate?.company_name) || 'CCS Signage' },
    location: {
      name: clean(estimate?.company_name) || 'CCS Signage',
      phone: clean(estimate?.company_phone),
    },
  };
}

// Customer-facing recipient: the order contact email on the estimate first,
// then the linked customer's billing/contact email.
function resolveCustomerEmail(estimate: any, customer: any) {
  const direct = clean(estimate?.contact_email).toLowerCase();
  if (direct.includes('@')) return direct;
  for (const candidate of [customer?.contact_email, customer?.billing_contact_email]) {
    const email = clean(candidate).toLowerCase();
    if (email.includes('@')) return email;
  }
  return '';
}

// CAS persist of the machine patch + sweep belt on one row — anchored on the
// loaded updated_date. Returns 'claimed' | 'conflict' | 'claim_failed'.
// updateMany({id, updated_date}, {$set}) is the repo's conditional-write
// convention (same as checkDeadlineReminders claimRecordDeadlineFire).
async function claimFollowUpState({ Estimate, estimate, nextState }: any) {
  const version = clean(estimate?.updated_date);
  if (!version) return 'claim_failed';
  try {
    const result = await Estimate.updateMany(
      { id: estimate.id, updated_date: version },
      { $set: { follow_up_state: nextState } },
    );
    if (result && typeof result.updated === 'number' && result.updated === 1) {
      estimate.follow_up_state = nextState;
      return 'claimed';
    }
    // updated === 0 — a concurrent write owns the row.
    return 'conflict';
  } catch (error: any) {
    // Ambiguous write — verify before skipping so a landed claim is not
    // re-sent on a retry. A verify miss means we cannot prove the write.
    const saved = await Estimate.get(estimate.id).catch(() => null);
    if (saved?.id && isoDay(saved?.follow_up_state?.sweep_date) === isoDay(nextState?.sweep_date) &&
        clean(saved?.follow_up_state?.stage) === clean(nextState?.stage)) {
      estimate.follow_up_state = saved.follow_up_state;
      return 'claimed';
    }
    console.warn(`followUpSweepAction claim failed for estimate ${estimate.id}:`, error?.message || error);
    return 'claim_failed';
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email).toLowerCase() || clean(user?.id) || 'unknown';
    const actorName = clean(user?.full_name) || clean(user?.name) || actor;
    const action = clean(body?.action);
    if (!action) throw bad('An action is required.');

    if (action !== 'run_follow_up_sweep') throw bad('Unknown follow-up sweep action.');

    const dryRun = body?.dry_run === true;
    // A real sweep writes state and can email customers — admin only. A
    // dry-run plan is read-only and safe for any signed-in staff member.
    if (!dryRun && !isAdmin(user)) {
      throw bad('Only administrators can run the follow-up sweep.', 403);
    }
    const limit = Math.min(Math.max(Number(body?.limit) || 0, 0), 500);

    const Estimate = base44.asServiceRole.entities.AllInOneEstimate;
    const Customer = base44.asServiceRole.entities.Customer;
    const Staff = base44.asServiceRole.entities.AuthorizedEmail;
    const GlobalSettings = base44.asServiceRole.entities.GlobalSettings;
    const Notification = base44.asServiceRole.entities.Notification;
    const Activity = base44.asServiceRole.entities.OpportunityActivity;
    const Template = base44.asServiceRole.entities.NotificationTemplate;

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // ---- Reads ----------------------------------------------------------------
    // 'sent' rows feed the send path; terminal-status rows feed the close
    // path. Sequential reads keep the shared entity_list budget calm.
    const sentRows = await loadAllEntityRows({
      entity: Estimate,
      query: { status: 'sent' },
      sort: 'created_date',
      fields: ESTIMATE_FIELDS,
      label: 'Follow-up sweep sent estimates',
    });
    if (!Array.isArray(sentRows)) throw bad('Estimate lookup failed.', 500);

    const terminalRows: any[] = [];
    for (const status of TERMINAL_SCAN_STATUSES) {
      const rows = await loadAllEntityRows({
        entity: Estimate,
        query: { status },
        sort: 'created_date',
        fields: ESTIMATE_FIELDS,
        label: `Follow-up sweep ${status} estimates`,
      }).catch(() => []);
      if (Array.isArray(rows)) terminalRows.push(...rows);
    }

    const [settingsRows, customerRows, staffRows, templateRows] = await Promise.all([
      loadAllEntityRows({ entity: GlobalSettings, query: {}, sort: 'created_date', fields: SETTINGS_FIELDS, label: 'Follow-up sweep settings' }).catch(() => []),
      loadAllEntityRows({ entity: Customer, query: {}, sort: 'created_date', fields: CUSTOMER_FIELDS, label: 'Follow-up sweep customers' }).catch(() => []),
      loadAllEntityRows({ entity: Staff, query: {}, sort: 'created_date', fields: STAFF_FIELDS, label: 'Follow-up sweep staff directory' }).catch(() => []),
      // NotificationTemplate is backend-only and may not exist in older
      // deployments — every failure falls back to the hardcoded defaults.
      loadAllEntityRows({ entity: Template, query: {}, sort: 'created_date', fields: TEMPLATE_FIELDS, label: 'Follow-up sweep templates' }).catch(() => []),
    ]);

    const settings = resolveDeliverySettings(settingsRows);
    const channel = resolveDeliveryChannel(settings);
    // Machine cfg comes from the GlobalSettings emailDelivery block (admins
    // can tune fu1_delay_days/fu2_delay_days/fu2_after_fu1_days there); a
    // nested follow_up/followUp sub-block wins when present.
    const deliveryBlock = resolveEmailDeliveryBlock(settings);
    const cfg = {
      ...deliveryBlock,
      ...(isObj(deliveryBlock?.follow_up) ? deliveryBlock.follow_up : {}),
      ...(isObj(deliveryBlock?.followUp) ? deliveryBlock.followUp : {}),
    };

    const customerById = new Map(list(customerRows).map((c: any) => [clean(c?.id), c]));
    const templateFor = (key: string) => {
      const row = list(templateRows).find((t: any) =>
        clean(t?.key) === key && clean(t?.status) !== 'inactive' &&
        (clean(t?.subject) || clean(t?.body)));
      return row || null;
    };

    const candidates = [...list(sentRows), ...terminalRows].slice(0, limit || undefined);

    const details: any[] = [];
    const errors: any[] = [];
    let sentFu1 = 0;
    let sentFu2 = 0;
    let closed = 0;
    let skipped = 0;
    let detailsTruncated = false;
    const MAX_DETAILS = 600;
    const pushDetail = (entry: any) => {
      if (details.length < MAX_DETAILS) details.push(entry);
      else detailsTruncated = true;
    };
    const pushError = (entry: any) => {
      if (errors.length < MAX_ERRORS) errors.push(entry);
    };

    for (const est of candidates) {
      const estimateId = clean(est?.id);
      if (!estimateId) continue;
      if (est?.is_template === true) {
        skipped += 1;
        pushDetail({ estimate_id: estimateId, skipped: 'is_template' });
        continue;
      }

      const storedState = isObj(est?.follow_up_state) ? est.follow_up_state : {};
      // Belt-level dedupe — the row already had sweep work today (send OR
      // close). last_sent_at today is the machine-level equivalent.
      if (isoDay(storedState?.sweep_date) === today ||
          isoDay(storedState?.details?.sweep_ran_today) === today ||
          isoDay(storedState?.last_sent_at) === today ||
          isoDay(est?.follow_up_last_sent_at) === today) {
        skipped += 1;
        pushDetail({ estimate_id: estimateId, skipped: 'sweep_ran_today' });
        continue;
      }

      const evaluated = nextStage({ record: est, now, cfg });
      if (!evaluated || evaluated.action === 'none' || !evaluated.patch) {
        skipped += 1;
        pushDetail({ estimate_id: estimateId, skipped: clean(evaluated?.reason) || 'no_action' });
        continue;
      }

      const nextState = {
        ...evaluated.patch,
        sweep_date: today,
        details: { sweep_ran_today: today, sweep_action: evaluated.action },
      };

      // ---- close: state-only transition, no customer notification ----------
      if (evaluated.action === 'close') {
        if (dryRun) {
          closed += 1;
          pushDetail({ estimate_id: estimateId, action: 'close', reason: evaluated.reason, dry_run: true });
          continue;
        }
        const claim = await claimFollowUpState({ Estimate, estimate: est, nextState });
        if (claim !== 'claimed') {
          skipped += 1;
          pushDetail({ estimate_id: estimateId, skipped: `claim_${claim}` });
          continue;
        }
        closed += 1;
        pushDetail({ estimate_id: estimateId, action: 'close', reason: evaluated.reason });
        continue;
      }

      // ---- send_fu1 / send_fu2 ----------------------------------------------
      const stage = evaluated.action === 'send_fu1' ? 'fu1' : 'fu2';
      const templateKey = stage === 'fu1' ? 'estimate_follow_up_1' : 'estimate_follow_up_2';
      const tplRow = templateFor(templateKey);
      const tpl = tplRow
        ? { subject: clean(tplRow.subject), body: clean(tplRow.body), from_source: clean(tplRow.from_source), cc_billing: tplRow.cc_billing === true }
        : { ...FOLLOW_UP_TEMPLATE_DEFAULTS[templateKey], from_source: '', cc_billing: false };

      const customer = customerById.get(clean(est?.customer_id)) || null;
      const salespersonName = clean(est?.salesperson) || clean(est?.entered_by_display);
      const salespersonEmail = resolveStaffEmail(salespersonName, staffRows);
      const renderCtx = buildRenderContext({ estimate: est, customer, salespersonName });
      const subject = renderTemplate(tpl.subject, renderCtx).text;
      const renderedBody = renderTemplate(tpl.body, renderCtx).text;
      const to = resolveCustomerEmail(est, customer);

      const dedupeBase = `fu-sweep:${estimateId}:${stage}`;
      const notification = {
        to,
        subject,
        body: renderedBody,
        kind: 'estimate_follow_up',
        entity_type: 'estimate',
        entity_id: estimateId,
        deep_link: `/EstimateDetail?id=${estimateId}`,
        dedupe_key: dedupeBase,
        ...(tpl.from_source === 'salesperson' && salespersonEmail ? { from: salespersonEmail } : {}),
        ...(tpl.cc_billing && clean(customer?.billing_contact_email).includes('@')
          ? { cc: [clean(customer?.billing_contact_email).toLowerCase()] }
          : {}),
      };
      const plan = buildDeliveryPlan({
        settings,
        notification,
        context: { customer_id: clean(est?.customer_id), work_order_id: clean(est?.work_order_id), entity_type: 'estimate', entity_id: estimateId },
      });

      if (plan.channel === 'email' && !to) {
        // Nothing deliverable on the email lane — do NOT claim so the row
        // resurfaces in tomorrow's sweep/errors instead of silently advancing.
        pushError({ estimate_id: estimateId, stage, error: 'no_recipient' });
        skipped += 1;
        pushDetail({ estimate_id: estimateId, skipped: 'no_recipient', stage });
        continue;
      }

      if (dryRun) {
        if (stage === 'fu1') sentFu1 += 1; else sentFu2 += 1;
        pushDetail({
          estimate_id: estimateId, action: evaluated.action, reason: evaluated.reason,
          dry_run: true, channel: plan.channel, to, template: tplRow ? templateKey : `${templateKey}:default`,
        });
        continue;
      }

      // Claim BEFORE delivery — a post-claim send failure leaves the marker
      // standing, trading a possible missed follow-up for no duplicate sends.
      const claim = await claimFollowUpState({ Estimate, estimate: est, nextState });
      if (claim !== 'claimed') {
        skipped += 1;
        pushDetail({ estimate_id: estimateId, skipped: `claim_${claim}`, stage });
        continue;
      }

      const rowErrors: string[] = [];

      if (plan.channel === 'email' && plan.email) {
        try {
          await base44.integrations.Core.SendEmail(plan.email);
        } catch (error: any) {
          rowErrors.push(`email:${clean(error?.message) || 'send failed'}`);
        }
      } else if (plan.smartsheetRow) {
        // Activity-surface row — same shape convention as
        // notifySend.writeNotificationLog so the CRM stream + follow-up
        // dedupe readers see one vocabulary.
        try {
          await Activity.create({
            event_type: 'E-Mail: Follow Up',
            summary: plan.smartsheetRow.summary || subject,
            subject,
            notes: plan.smartsheetRow.detail || renderedBody,
            contact_name: clean(est?.contact_name),
            contact_id: '',
            company_name: clean(est?.client_name) || clean(customer?.company_name),
            customer_id: clean(plan.smartsheetRow.customer_id) || clean(est?.customer_id),
            opportunity_id: clean(est?.opportunity_id),
            work_order_id: clean(plan.smartsheetRow.work_order_id) || clean(est?.work_order_id),
            assigned_to: salespersonName,
            due_at: '',
            completed_at: now.toISOString(),
            outcome: 'completed',
            source: 'auto_followup',
            actor,
            details: {
              notify_kind: 'estimate_follow_up',
              notify_target_id: estimateId,
              notify_target_ref: clean(est?.estimate_number),
              notify_disposition: 'queued',
              notify_source: 'follow_up_sweep',
              sweep_date: today,
              sweep_ran_today: today,
              stage,
              sent_to: to,
            },
            creation_request_key: `fu-sweep:${estimateId}:${stage}`,
          });
        } catch (error: any) {
          rowErrors.push(`activity:${clean(error?.message) || 'write failed'}`);
        }
      }

      // Internal Notification row — written on BOTH lanes (alwaysInternal).
      // Recipient prefers the assigned salesperson's directory email (the
      // feed is staff-facing), then the actor, then the adapter's recipient.
      const internalRecipient =
        salespersonEmail ||
        (actor.includes('@') ? actor : '') ||
        clean(plan?.internalRow?.recipient_email).toLowerCase();
      if (internalRecipient) {
        const dedupeKey = `${internalRecipient}:${dedupeBase}`.slice(0, 256);
        try {
          const dupes = await Notification.filter({ dedupe_key: dedupeKey }, '-created_date', 1).catch(() => []);
          if (!Array.isArray(dupes) || !dupes.length) {
            await Notification.create({
              recipient_email: internalRecipient,
              category: NOTIF_CATEGORY,
              severity: clean(plan?.internalRow?.severity) || 'info',
              title: (plan?.internalRow?.title || subject).slice(0, 300),
              body: clean(plan?.internalRow?.message || renderedBody).slice(0, 1000),
              deep_link: clean(plan?.internalRow?.link || `/EstimateDetail?id=${estimateId}`).slice(0, 500),
              source_event: 'follow_up_sweep',
              source_id: estimateId,
              meta: { stage, channel: plan.channel, to, sweep_date: today, template: templateKey },
              dedupe_key: dedupeKey,
              creation_request_key: `notif:${dedupeKey}`.slice(0, 256),
              created_by: actorName || actor,
            });
          }
        } catch (error: any) {
          rowErrors.push(`internal:${clean(error?.message) || 'write failed'}`);
        }
      }

      if (stage === 'fu1') sentFu1 += 1; else sentFu2 += 1;
      const entry: any = {
        estimate_id: estimateId,
        estimate_number: clean(est?.estimate_number),
        action: evaluated.action,
        reason: evaluated.reason,
        channel: plan.channel,
        to,
        template: tplRow ? templateKey : `${templateKey}:default`,
      };
      if (rowErrors.length) {
        entry.delivery_errors = rowErrors;
        pushError({ estimate_id: estimateId, stage, error: rowErrors.join('; ') });
      }
      pushDetail(entry);
    }

    return Response.json({
      success: true,
      action,
      dry_run: dryRun,
      sweep_date: today,
      channel,
      scanned: candidates.length,
      sent_fu1: sentFu1,
      sent_fu2: sentFu2,
      closed,
      skipped,
      errors,
      details,
      details_truncated: detailsTruncated,
      actor,
    });
  } catch (error: any) {
    const status = Number(error?.statusCode || error?.status || 500);
    if ([400, 401, 403, 404, 409, 429].includes(status)) {
      return Response.json({ error: error?.message || 'Follow-up sweep request failed.' }, { status });
    }
    console.error('followUpSweepAction error:', error);
    return Response.json({ error: 'The follow-up sweep could not be completed. Try again.' }, { status });
  }
});
