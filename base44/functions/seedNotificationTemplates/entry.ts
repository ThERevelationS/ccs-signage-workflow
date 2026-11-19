import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import {
  createFoundationRecordWithRecovery,
} from '../../shared/opportunityFoundationPersistence.mjs';

const clean = (value: any) => String(value ?? '').trim();

// Session-authenticated, admin-gated installer for the CoreBridge customer
// notification template set. NotificationTemplate carries backend-only RLS,
// so every read/write flows through base44.asServiceRole.entities.
//
// seed_notification_templates installs the 15 CoreBridge defaults
// idempotently — each row carries a stable creation_request_key
// (seed-tpl-<key>) written through createFoundationRecordWithRecovery, so a
// retried or re-run seed verifies the existing row and creates zero
// duplicates. Staff edits to a seeded row are never overwritten: a reused
// row is reported as 'existing' and left untouched.
const TEMPLATE_SEED_ROWS = [
  {
    key: 'estimate_ready',
    kind: 'estimate_ready',
    name: 'Estimate Ready',
    subject: 'Your estimate {{estimate.number}} is ready — {{company.name}}',
    body: [
      'Hi {{contact.name|default:"there"}},',
      '',
      'Your estimate {{estimate.number}} for {{customer.company_name}} is ready for review.',
      '',
      'Estimate: {{estimate.number}} — {{estimate.title}}',
      'Total: {{estimate.total|money}}',
      '',
      'You can review and approve it online: {{estimate.approval_url}}',
      '',
      'Questions? Reply to this message or call {{location.name}} at {{location.phone}}.',
      '',
      'Thank you,',
      '{{user.display_name}}',
      '{{company.name}}',
    ].join('\n'),
    from_source: 'salesperson',
    cc_billing: false,
    attach_pdf: true,
    placeholder_map: [
      { placeholder: 'contact.name', description: 'Primary contact name on the customer' },
      { placeholder: 'customer.company_name', description: 'Customer company name' },
      { placeholder: 'estimate.number', description: 'Estimate document number' },
      { placeholder: 'estimate.title', description: 'Estimate title' },
      { placeholder: 'estimate.total|money', description: 'Estimate grand total formatted as currency' },
      { placeholder: 'estimate.approval_url', description: 'Customer-portal review/approve link' },
      { placeholder: 'location.name', description: 'Store location name' },
      { placeholder: 'location.phone', description: 'Store location phone' },
      { placeholder: 'user.display_name', description: 'Sending staff member display name' },
      { placeholder: 'company.name', description: 'Company name' },
    ],
  },
  {
    key: 'new_order',
    kind: 'new_order',
    name: 'New Order Confirmation',
    subject: 'Order {{order.number}} confirmed — {{order.title}}',
    body: [
      'Hi {{contact.name|default:"there"}},',
      '',
      'Thanks {{customer.company_name}} — your order is confirmed and in production.',
      '',
      'Order: {{order.number}} — {{order.title}}',
      'Total: {{order.total|money}}',
      'Estimated completion: {{order.due_date|date}}',
      '',
      'We will let you know the moment it is ready.',
      '',
      '{{user.display_name}}',
      '{{company.name}}',
    ].join('\n'),
    from_source: 'location',
    cc_billing: false,
    attach_pdf: true,
    placeholder_map: [
      { placeholder: 'contact.name', description: 'Primary contact name on the customer' },
      { placeholder: 'customer.company_name', description: 'Customer company name' },
      { placeholder: 'order.number', description: 'Work order number' },
      { placeholder: 'order.title', description: 'Work order title' },
      { placeholder: 'order.total|money', description: 'Order grand total formatted as currency' },
      { placeholder: 'order.due_date|date', description: 'Estimated completion date' },
      { placeholder: 'user.display_name', description: 'Sending staff member display name' },
      { placeholder: 'company.name', description: 'Company name' },
    ],
  },
  {
    key: 'action_needed',
    kind: 'action_needed',
    name: 'Action Needed',
    subject: 'Action needed on {{order.title}} — {{company.name}}',
    body: [
      'Hi {{contact.name|default:"there"}},',
      '',
      'We need your input to keep {{order.title}} (order {{order.number}}) moving:',
      '',
      '{{action_needed.note}}',
      '',
      'Reply to this message or call {{location.name}} at {{location.phone}} and we will get it sorted.',
      '',
      '{{user.display_name}}',
      '{{company.name}}',
    ].join('\n'),
    from_source: 'location',
    cc_billing: false,
    attach_pdf: false,
    placeholder_map: [
      { placeholder: 'contact.name', description: 'Primary contact name on the customer' },
      { placeholder: 'order.title', description: 'Work order title' },
      { placeholder: 'order.number', description: 'Work order number' },
      { placeholder: 'action_needed.note', description: 'What the customer needs to do/provide' },
      { placeholder: 'location.name', description: 'Store location name' },
      { placeholder: 'location.phone', description: 'Store location phone' },
      { placeholder: 'user.display_name', description: 'Sending staff member display name' },
      { placeholder: 'company.name', description: 'Company name' },
    ],
  },
  {
    key: 'proof_ready',
    kind: 'proof_ready',
    name: 'Proof Ready',
    subject: 'Your proof for {{order.title}} is ready — {{company.name}}',
    body: [
      'Hi {{contact.name|default:"there"}},',
      '',
      'The proof for {{order.title}} (order {{order.number}}) is ready for your review.',
      '',
      'Review and approve it here: {{proof.approval_url}}',
      '',
      'Once you approve, we head straight to production.',
      '',
      '{{user.display_name}}',
      '{{company.name}}',
    ].join('\n'),
    from_source: 'salesperson',
    cc_billing: false,
    attach_pdf: true,
    placeholder_map: [
      { placeholder: 'contact.name', description: 'Primary contact name on the customer' },
      { placeholder: 'order.title', description: 'Work order title' },
      { placeholder: 'order.number', description: 'Work order number' },
      { placeholder: 'proof.approval_url', description: 'Customer-portal proof review/approve link' },
      { placeholder: 'user.display_name', description: 'Sending staff member display name' },
      { placeholder: 'company.name', description: 'Company name' },
    ],
  },
  {
    key: 'built',
    kind: 'built',
    name: 'Order Built',
    subject: '{{order.title}} is built — {{company.name}}',
    body: [
      'Hi {{contact.name|default:"there"}},',
      '',
      'Good news — {{order.title}} (order {{order.number}}) is built and moving to finishing.',
      '',
      'We will notify you when it is ready for pickup/delivery.',
      '',
      '{{user.display_name}}',
      '{{company.name}}',
    ].join('\n'),
    from_source: 'location',
    cc_billing: false,
    attach_pdf: false,
    placeholder_map: [
      { placeholder: 'contact.name', description: 'Primary contact name on the customer' },
      { placeholder: 'order.title', description: 'Work order title' },
      { placeholder: 'order.number', description: 'Work order number' },
      { placeholder: 'user.display_name', description: 'Sending staff member display name' },
      { placeholder: 'company.name', description: 'Company name' },
    ],
  },
  {
    key: 'completed',
    kind: 'completed',
    name: 'Order Completed',
    subject: '{{order.title}} is complete — {{company.name}}',
    body: [
      'Hi {{contact.name|default:"there"}},',
      '',
      '{{order.title}} (order {{order.number}}) is complete.',
      '',
      '{{order.completion_note|default:"It is ready for pickup — or already on its way to you."}}',
      '',
      'Thanks for choosing {{company.name}}!',
      '',
      '{{user.display_name}}',
      '{{location.name}} — {{location.phone}}',
    ].join('\n'),
    from_source: 'location',
    cc_billing: false,
    attach_pdf: false,
    placeholder_map: [
      { placeholder: 'contact.name', description: 'Primary contact name on the customer' },
      { placeholder: 'order.title', description: 'Work order title' },
      { placeholder: 'order.number', description: 'Work order number' },
      { placeholder: 'order.completion_note|default:"It is ready for pickup — or already on its way to you."', description: 'Delivery/pickup note with built-in fallback text' },
      { placeholder: 'user.display_name', description: 'Sending staff member display name' },
      { placeholder: 'location.name', description: 'Store location name' },
      { placeholder: 'location.phone', description: 'Store location phone' },
      { placeholder: 'company.name', description: 'Company name' },
    ],
  },
  {
    key: 'payment_due_5day',
    kind: 'payment_due_5day',
    name: 'Payment Due — 5 Day Reminder',
    subject: 'Reminder: invoice {{invoice.number}} is due {{invoice.due_date|date}}',
    body: [
      'Hi {{contact.name|default:"there"}},',
      '',
      'A friendly reminder that invoice {{invoice.number}} for {{customer.company_name}} is due in 5 days.',
      '',
      'Invoice: {{invoice.number}}',
      'Balance due: {{invoice.balance_due|money}}',
      'Due date: {{invoice.due_date|date}}',
      '',
      'Pay online: {{invoice.payment_url}}',
      '',
      'Questions? Call {{location.name}} at {{location.phone}}.',
      '',
      '{{company.name}}',
    ].join('\n'),
    from_source: 'location',
    cc_billing: true,
    attach_pdf: true,
    placeholder_map: [
      { placeholder: 'contact.name', description: 'Primary contact name on the customer' },
      { placeholder: 'customer.company_name', description: 'Customer company name' },
      { placeholder: 'invoice.number', description: 'Invoice number' },
      { placeholder: 'invoice.balance_due|money', description: 'Open balance formatted as currency' },
      { placeholder: 'invoice.due_date|date', description: 'Invoice due date' },
      { placeholder: 'invoice.payment_url', description: 'Online payment link' },
      { placeholder: 'location.name', description: 'Store location name' },
      { placeholder: 'location.phone', description: 'Store location phone' },
      { placeholder: 'company.name', description: 'Company name' },
    ],
  },
  {
    key: 'monthly_statement',
    kind: 'monthly_statement',
    name: 'Monthly Statement',
    subject: 'Your {{statement.period}} statement — {{company.name}}',
    body: [
      'Hi {{contact.name|default:"there"}},',
      '',
      'Your {{statement.period}} statement for {{customer.company_name}} is attached.',
      '',
      'Open balance: {{customer.balance_due|money}}',
      '',
      'Pay online: {{customer.payment_url}}',
      '',
      'Questions about your account? Call {{location.name}} at {{location.phone}}.',
      '',
      '{{company.name}}',
    ].join('\n'),
    from_source: 'company',
    cc_billing: true,
    attach_pdf: true,
    placeholder_map: [
      { placeholder: 'contact.name', description: 'Primary contact name on the customer' },
      { placeholder: 'statement.period', description: 'Statement period label (e.g. "November 2026")' },
      { placeholder: 'customer.company_name', description: 'Customer company name' },
      { placeholder: 'customer.balance_due|money', description: 'Total open balance formatted as currency' },
      { placeholder: 'customer.payment_url', description: 'Online payment link' },
      { placeholder: 'location.name', description: 'Store location name' },
      { placeholder: 'location.phone', description: 'Store location phone' },
      { placeholder: 'company.name', description: 'Company name' },
    ],
  },
  {
    key: 'estimate_follow_up_1',
    kind: 'estimate_follow_up_1',
    name: 'Estimate Follow Up #1',
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
    from_source: 'salesperson',
    cc_billing: false,
    attach_pdf: true,
    placeholder_map: [
      { placeholder: 'contact.name', description: 'Primary contact name on the customer' },
      { placeholder: 'estimate.number', description: 'Estimate document number' },
      { placeholder: 'customer.company_name', description: 'Customer company name' },
      { placeholder: 'estimate.title', description: 'Estimate title' },
      { placeholder: 'estimate.total|money', description: 'Estimate grand total formatted as currency' },
      { placeholder: 'estimate.approval_url', description: 'Customer-portal review/approve link' },
      { placeholder: 'user.display_name', description: 'Sending staff member display name' },
      { placeholder: 'company.name', description: 'Company name' },
    ],
  },
  {
    key: 'estimate_follow_up_2',
    kind: 'estimate_follow_up_2',
    name: 'Estimate Follow Up #2',
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
    from_source: 'salesperson',
    cc_billing: false,
    attach_pdf: true,
    placeholder_map: [
      { placeholder: 'contact.name', description: 'Primary contact name on the customer' },
      { placeholder: 'estimate.number', description: 'Estimate document number' },
      { placeholder: 'customer.company_name', description: 'Customer company name' },
      { placeholder: 'estimate.approval_url', description: 'Customer-portal review/approve link' },
      { placeholder: 'user.display_name', description: 'Sending staff member display name' },
      { placeholder: 'company.name', description: 'Company name' },
    ],
  },
  {
    key: 'proof_follow_up_1',
    kind: 'proof_follow_up_1',
    name: 'Proof Follow Up #1',
    subject: 'Proof for {{order.title}} is waiting on your approval',
    body: [
      'Hi {{contact.name|default:"there"}},',
      '',
      'The proof for {{order.title}} (order {{order.number}}) is still waiting on your approval.',
      '',
      'Review it here: {{proof.approval_url}}',
      '',
      'Production starts as soon as you approve — let me know if anything needs changing.',
      '',
      '{{user.display_name}}',
      '{{company.name}}',
    ].join('\n'),
    from_source: 'salesperson',
    cc_billing: false,
    attach_pdf: true,
    placeholder_map: [
      { placeholder: 'contact.name', description: 'Primary contact name on the customer' },
      { placeholder: 'order.title', description: 'Work order title' },
      { placeholder: 'order.number', description: 'Work order number' },
      { placeholder: 'proof.approval_url', description: 'Customer-portal proof review/approve link' },
      { placeholder: 'user.display_name', description: 'Sending staff member display name' },
      { placeholder: 'company.name', description: 'Company name' },
    ],
  },
  {
    key: 'proof_follow_up_2',
    kind: 'proof_follow_up_2',
    name: 'Proof Follow Up #2',
    subject: 'Still need your proof approval — {{order.title}}',
    body: [
      'Hi {{contact.name|default:"there"}},',
      '',
      'Following up again — the proof for {{order.title}} (order {{order.number}}) still needs your approval before we can produce it.',
      '',
      'Approve or request changes here: {{proof.approval_url}}',
      '',
      'If something looks off, reply and I will get it corrected.',
      '',
      '{{user.display_name}}',
      '{{company.name}}',
    ].join('\n'),
    from_source: 'salesperson',
    cc_billing: false,
    attach_pdf: true,
    placeholder_map: [
      { placeholder: 'contact.name', description: 'Primary contact name on the customer' },
      { placeholder: 'order.title', description: 'Work order title' },
      { placeholder: 'order.number', description: 'Work order number' },
      { placeholder: 'proof.approval_url', description: 'Customer-portal proof review/approve link' },
      { placeholder: 'user.display_name', description: 'Sending staff member display name' },
      { placeholder: 'company.name', description: 'Company name' },
    ],
  },
  {
    key: 'credit_memo',
    kind: 'credit_memo',
    name: 'Credit Memo',
    subject: 'Credit memo {{credit_memo.number}} — {{company.name}}',
    body: [
      'Hi {{contact.name|default:"there"}},',
      '',
      'A credit has been issued to {{customer.company_name}}.',
      '',
      'Credit memo: {{credit_memo.number}}',
      'Amount: {{credit_memo.amount|money}}',
      'Reason: {{credit_memo.reason}}',
      '',
      'The credit is on your account and will apply to your next invoice.',
      '',
      'Questions? Call {{location.name}} at {{location.phone}}.',
      '',
      '{{company.name}}',
    ].join('\n'),
    from_source: 'company',
    cc_billing: true,
    attach_pdf: true,
    placeholder_map: [
      { placeholder: 'contact.name', description: 'Primary contact name on the customer' },
      { placeholder: 'customer.company_name', description: 'Customer company name' },
      { placeholder: 'credit_memo.number', description: 'Credit memo document number' },
      { placeholder: 'credit_memo.amount|money', description: 'Credit amount formatted as currency' },
      { placeholder: 'credit_memo.reason', description: 'Why the credit was issued' },
      { placeholder: 'location.name', description: 'Store location name' },
      { placeholder: 'location.phone', description: 'Store location phone' },
      { placeholder: 'company.name', description: 'Company name' },
    ],
  },
  {
    key: 'multi_invoice',
    kind: 'multi_invoice',
    name: 'Multi-Invoice Notice',
    subject: '{{invoice.count}} invoices for {{customer.company_name}} — {{company.name}}',
    body: [
      'Hi {{contact.name|default:"there"}},',
      '',
      'Here is a summary of open invoices for {{customer.company_name}}:',
      '',
      '{{invoices.summary}}',
      '',
      'Total balance due: {{customer.balance_due|money}}',
      '',
      'Pay online: {{customer.payment_url}}',
      '',
      'Questions? Call {{location.name}} at {{location.phone}}.',
      '',
      '{{company.name}}',
    ].join('\n'),
    from_source: 'company',
    cc_billing: true,
    attach_pdf: true,
    placeholder_map: [
      { placeholder: 'contact.name', description: 'Primary contact name on the customer' },
      { placeholder: 'invoice.count', description: 'Number of open invoices in the batch' },
      { placeholder: 'customer.company_name', description: 'Customer company name' },
      { placeholder: 'invoices.summary', description: 'Pre-composed line-per-invoice summary text' },
      { placeholder: 'customer.balance_due|money', description: 'Total open balance formatted as currency' },
      { placeholder: 'customer.payment_url', description: 'Online payment link' },
      { placeholder: 'location.name', description: 'Store location name' },
      { placeholder: 'location.phone', description: 'Store location phone' },
      { placeholder: 'company.name', description: 'Company name' },
    ],
  },
  {
    key: 'login_info',
    kind: 'login_info',
    name: 'Customer Portal Login Info',
    subject: 'Your {{company.name}} customer portal login',
    body: [
      'Hi {{contact.name|default:"there"}},',
      '',
      'Here is your login for the {{company.name}} customer portal, where {{customer.company_name}} can review estimates, approve proofs, and pay invoices.',
      '',
      'Portal: {{portal.login_url}}',
      'Username: {{portal.username}}',
      'Temporary password: {{portal.temporary_password}}',
      '',
      'You will be asked to set a new password on first sign-in.',
      '',
      '{{user.display_name}}',
      '{{company.name}}',
    ].join('\n'),
    from_source: 'company',
    cc_billing: false,
    attach_pdf: false,
    placeholder_map: [
      { placeholder: 'contact.name', description: 'Primary contact name on the customer' },
      { placeholder: 'company.name', description: 'Company name' },
      { placeholder: 'customer.company_name', description: 'Customer company name' },
      { placeholder: 'portal.login_url', description: 'Customer portal sign-in URL' },
      { placeholder: 'portal.username', description: 'Portal username (usually the contact email)' },
      { placeholder: 'portal.temporary_password', description: 'One-time temporary password' },
      { placeholder: 'user.display_name', description: 'Sending staff member display name' },
    ],
  },
];

const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { statusCode: status });

async function seedTemplateRows({ entity, rows, actor }: any) {
  // Sequential creates keep the shared entity-read budget calm and make the
  // per-row outcome order deterministic for the response audit trail.
  const out: any[] = [];
  let created = 0;
  let existing = 0;
  for (const row of rows) {
    const key = clean(row?.key);
    const name = clean(row?.name);
    if (!key || !name) throw bad('NotificationTemplate seed row is missing a key or name.', 500);
    const creationKey = `seed-tpl-${key}`;
    const result = await createFoundationRecordWithRecovery({
      entity,
      data: {
        creation_request_key: creationKey,
        schema_version: 1,
        key,
        kind: row.kind,
        name,
        subject: row.subject,
        body: row.body,
        from_source: row.from_source,
        cc_billing: row.cc_billing === true,
        attach_pdf: row.attach_pdf === true,
        status: 'active',
        placeholder_map: Array.isArray(row.placeholder_map) ? row.placeholder_map : [],
        updated_by: actor,
      },
      readMatches: () => entity.filter({ creation_request_key: creationKey }),
      label: `NotificationTemplate seed ${key}`,
    });
    const wasCreated = result.status === 'created' || result.status === 'recovered';
    if (wasCreated) created += 1;
    else existing += 1;
    out.push({
      key,
      kind: row.kind,
      name,
      status: wasCreated ? 'created' : 'existing',
    });
  }
  return { created, existing, rows: out };
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin access is required.' }, { status: 403 });
    }
    const actor = clean(user?.email) || clean(user?.id) || 'unknown';
    const action = clean(body?.action);
    if (!action) throw bad('An action is required.');

    const NotificationTemplate = base44.asServiceRole.entities.NotificationTemplate;

    if (action === 'seed_notification_templates') {
      const seeded = await seedTemplateRows({
        entity: NotificationTemplate,
        rows: TEMPLATE_SEED_ROWS,
        actor,
      });
      return Response.json({
        success: true,
        action,
        templates_created: seeded.created,
        templates_existing: seeded.existing,
        rows: seeded.rows,
      });
    }

    throw bad('Unknown notification template action.');
  } catch (error: any) {
    const status = Number(error?.statusCode || error?.status || 500);
    if ([400, 401, 403, 404, 409, 429].includes(status)) {
      return Response.json({ error: error?.message || 'Notification template action failed.' }, { status });
    }
    console.error('seedNotificationTemplates error:', error);
    return Response.json({ error: 'The notification template action could not be completed. Try again.' }, { status });
  }
});
