// deliveryChannel adapter — ESTIMATOR_MASTERPLAN WS-H / item H-01.
// Pure TS, zero imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike.
//
// Every outbound customer/staff notification (H-02 templates, H-04/H-06
// follow-ups, H-07 reminders, H-08 statements, H-09 vendor notices, H-10
// triggers, H-13 digests) resolves a channel through this adapter instead of
// calling base44.integrations.Core.SendEmail directly:
//
//   - GlobalSettings.emailDelivery.enabled === true  → 'email'
//       plan.email is the exact payload for Core.SendEmail — the wiring layer
//       (H-05 scheduler et al.) performs the send; the adapter never does I/O.
//   - otherwise (the default — outbound email is off shop-wide) → 'smartsheet'
//       plan.smartsheetRow is an activity-columns row the writer syncs to the
//       Smartsheet activity/notes surface so the event is still visible.
//   - 'internal' is ALWAYS on (alwaysInternal: true): plan.internalRow feeds
//       notificationAction.record either way, so the notification center shows
//       every event whether or not external delivery is enabled.
//
// Flag resolution is fail-closed: only the literal boolean true enables
// 'email'; missing settings, absent keys, and non-boolean values all resolve
// 'smartsheet'. DELIVERY_SETTING_PATHS lists the checked keys in precedence
// order — the first path holding a defined (non-null) value decides, so the
// canonical A-21 block overrides stale legacy aliases.

export const DELIVERY_CHANNELS = ['email', 'smartsheet', 'internal'];

// Settings keys checked for the outbound-email master switch, in precedence
// order (first defined non-null value wins):
//   1. emailDelivery.enabled                — canonical A-21 block on the
//      GlobalSettings row / settings object (GlobalSettings.jsonc).
//   2. setting_value.emailDelivery.enabled  — same block nested inside the KV
//      blob when callers pass a raw {setting_key, setting_value} row.
//   3. email_delivery_enabled               — legacy flat alias.
//   4. setting_value.email_delivery_enabled — flat alias inside the KV blob.
//   5. delivery.emailEnabled                — legacy nested alias.
//   6. setting_value.delivery.emailEnabled  — nested alias inside the KV blob.
export const DELIVERY_SETTING_PATHS = [
  'emailDelivery.enabled',
  'setting_value.emailDelivery.enabled',
  'email_delivery_enabled',
  'setting_value.email_delivery_enabled',
  'delivery.emailEnabled',
  'setting_value.delivery.emailEnabled',
];

const clean = (v: any) => String(v ?? '').trim();
const isObj = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v);

// Walk a dotted settings path ('emailDelivery.enabled'); missing/odd hops
// resolve to undefined. Non-object hops (string/number/array) are dead ends.
function settingAt(root: any, path: string) {
  let cur = root;
  for (const key of path.split('.')) {
    if (!isObj(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

// The emailDelivery block itself (canonical location, then the KV-blob
// location) — used for send-side defaults like default_from.
export function resolveEmailDeliveryBlock(settings: any) {
  const block = settingAt(settings, 'emailDelivery') ?? settingAt(settings, 'setting_value.emailDelivery');
  return isObj(block) ? block : {};
}

// 'email' only when a checked path holds the literal boolean true; every
// other state — undefined, false, 'true', 1, missing settings — resolves
// 'smartsheet' (fail-closed, email stays off until deliberately enabled).
// Internal rows are always written regardless; this resolves the EXTERNAL lane.
export function resolveDeliveryChannel(settings: any): 'email' | 'smartsheet' {
  for (const path of DELIVERY_SETTING_PATHS) {
    const value = settingAt(settings, path);
    if (value === undefined || value === null) continue;
    return value === true ? 'email' : 'smartsheet';
  }
  return 'smartsheet';
}

// Entity types whose id feeds the activity row's customer_id column.
const CUSTOMER_ENTITY_TYPES = new Set(['customer', 'client']);
// Entity types whose id feeds work_order_id (orders are work orders here).
const WORK_ORDER_ENTITY_TYPES = new Set(['work_order', 'workorder', 'work-order', 'order']);

function linkedIds(notification: any, context: any) {
  const entityType = clean(notification?.entity_type ?? context?.entity_type).toLowerCase();
  const entityId = clean(notification?.entity_id ?? context?.entity_id);
  const customerId =
    clean(context?.customer_id ?? context?.customerId) ||
    (CUSTOMER_ENTITY_TYPES.has(entityType) ? entityId : '');
  const workOrderId =
    clean(context?.work_order_id ?? context?.workOrderId) ||
    (WORK_ORDER_ENTITY_TYPES.has(entityType) ? entityId : '');
  return { customerId, workOrderId };
}

// Compose the channel plan for one notification. notification shape:
//   { to, subject, body, kind, entity_type, entity_id, deep_link }
// plus optional pass-throughs: from, cc, reply_to, html, severity, dedupe_key.
// context carries delivery-side hints the notification itself may not hold:
//   { customer_id, work_order_id, entity_type, entity_id, from, dedupe_key }.
// Returns:
//   { channels: ['smartsheet','internal'] | ['email','internal'],
//     channel: 'smartsheet'|'email', alwaysInternal: true,
//     email?, smartsheetRow?, internalRow }
export function buildDeliveryPlan({ settings, notification, context }: any = {}) {
  const n = isObj(notification) ? notification : {};
  const ctx = isObj(context) ? context : {};
  const channel = resolveDeliveryChannel(settings);

  const to = clean(n.to);
  const subject = clean(n.subject);
  const body = clean(n.body);
  const kind = clean(n.kind) || 'system';
  const deepLink = clean(n.deep_link ?? n.deepLink);
  const dedupeKey = clean(n.dedupe_key ?? ctx.dedupe_key);
  const severity = clean(n.severity);

  const plan: any = {
    channels: channel === 'email' ? ['email', 'internal'] : ['smartsheet', 'internal'],
    channel,
    alwaysInternal: true,
    // Internal Notification row for notificationAction.record — written on
    // BOTH lanes so the in-app feed never depends on outbound config.
    internalRow: {
      type: 'notification',
      kind,
      title: subject,
      message: body,
      link: deepLink,
      recipient_email: to.toLowerCase(),
    },
  };
  // Optional extras ride along only when supplied — keeps the spec shape clean.
  if (severity) plan.internalRow.severity = severity;
  if (dedupeKey) plan.internalRow.dedupe_key = dedupeKey;

  if (channel === 'email') {
    // Payload mirrors base44.integrations.Core.SendEmail({to,subject,body});
    // `from` resolves notification → context → emailDelivery.default_from.
    const emailDelivery = resolveEmailDeliveryBlock(settings);
    const from = clean(n.from) || clean(ctx.from) || clean(emailDelivery?.default_from);
    plan.email = {
      to,
      subject,
      body,
      ...(from ? { from } : {}),
    };
    if (n.cc) plan.email.cc = n.cc;
    const replyTo = clean(n.reply_to ?? n.replyTo);
    if (replyTo) plan.email.reply_to = replyTo;
    if (n.html) plan.email.html = n.html;
  } else {
    // Smartsheet activity-columns row — synced by the wiring layer so the
    // event lands where staff already watch (record + sheet note).
    const { customerId, workOrderId } = linkedIds(n, ctx);
    plan.smartsheetRow = {
      type: 'notification',
      kind,
      summary: subject,
      detail: body,
      ...(customerId ? { customer_id: customerId } : {}),
      ...(workOrderId ? { work_order_id: workOrderId } : {}),
    };
  }
  return plan;
}
