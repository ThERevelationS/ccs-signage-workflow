// Estimate/proof ready triggers — ESTIMATOR_MASTERPLAN WS-H / item H-10.
// Pure TS, ZERO imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike, same contract as
// followUpMachine / proofFollowUpModel / paymentReminderModel / delivery.
//
// Two business events each emit notification payloads this module composes:
//
//   estimate_ready  — quote-send. ONE customer-facing notification row
//                     {to, subject, body, kind, deep_link, template_key, …}
//                     built for the H-01 delivery adapter (email lane when
//                     emailDelivery.enabled, Smartsheet activity row
//                     otherwise, plus the always-on internal Notification
//                     row the adapter synthesizes).
//   proof_ready     — proof-upload. TWO rows: the same customer-facing
//                     shape PLUS an internal Notification-entity row for
//                     the assigned designer — the customer gets "your proof
//                     is ready" while design/production sees the work
//                     appear on their side.
//
// Deep links follow the D-12 convention (src/components/jobs/deepLinks.js):
//   estimate detail  → /EstimateDetail?id=<id>
//   job workspace    → /JobWorkspace?wo=<id>
// Customer-facing rows prefer the portal link when the portal-enabled flag
// resolves ON and a portal URL can be resolved (explicit arg → settings
// paths); the staff D-12 route is the fallback whenever the flag is off OR
// no portal link exists (a flag alone can never fabricate a URL).
//
// Render context is the H-03 templateRender vocabulary used by the seeded
// NotificationTemplate rows (H-02 seedNotificationTemplates):
//   estimate_ready → {estimate:{number,title,total,approval_url},
//                     customer:{company_name}, contact:{name},
//                     company:{name}, location:{name,phone},
//                     user:{display_name}}
//   proof_ready    → {order:{number,title},
//                     proof:{approval_url,version,file_name,product_name},
//                     customer:{company_name}, contact:{name},
//                     company:{name}, user:{display_name}}
// The emitted subject/body are the same strings the seeded templates render
// to — a wiring layer that finds a staff-edited NotificationTemplate row
// re-renders it against `context`; when none exists these defaults are
// already the correct text (mirrors followUpSweepAction's
// TEMPLATE_DEFAULTS pattern).
//
// Dedupe scheme (triggerDedupeKey):
//   ready:<kind>:<entity_id>[:v<version>]
//   estimate_ready → ready:estimate_ready:<estimate_id>[:v<quote_version>]
//       quote_version is included only when present — a revised/re-sent
//       quote SHOULD re-notify, and a versionless estimate keys on the bare
//       id so a repeated send of the same quote dedupes.
//   proof_ready    → ready:proof_ready:<product_id|wo:id-index>[:v<proof_version>]
//       proof_version rides the key so uploading a NEW proof file (v1→v2)
//       re-notifies the customer and designer — that is CORRECT, not a
//       duplicate: each version is a distinct artifact needing review.
//       A missing/0 version omits the suffix (versionless rows dedupe on
//       the bare id — fail-closed against spam when the version can't be
//       read). Writers namespace the key per recipient before persisting
//       (followUpSweepAction's `${recipient}:${dedupe}` convention).
//
// Kill-switches (shouldNotify) — default ON; only the literal boolean
// false disables, so a missing block can never silence notifications:
//   settings.notifications.enabled === false            → master off
//   settings.notifications.<kind>_enabled === false     → per-kind off
//     (estimate_ready_enabled / proof_ready_enabled)
// The KV-blob mirror settings.setting_value.notifications is honored too
// (GlobalSettings rows arrive either flat or wrapped — delivery.ts's
// DELIVERY_SETTING_PATHS convention).
//
// API:
//   READY_EVENT_KINDS / READY_TEMPLATE_KEYS / NOTIFY_KILL_SWITCHES
//   PORTAL_FLAG_PATHS / PORTAL_LINK_PATHS / PORTAL_DEFAULT_ENABLED
//   settingsBlock(settings)                    — notifications{} (KV-aware)
//   shouldNotify(kind, {settings})             — kill-switch gate, default ON
//   resolvePortalEnabled(settings)             — portal flag, default ON
//   resolvePortalLink({settings, ...})         — portal URL chain
//   estimateDeepLink(id) / jobWorkspaceDeepLink(id)
//   triggerDedupeKey(kind, entity_id, version?)
//   resolveCustomerEmail(primary, customer)    — contact→billing→contacts[]
//   estimateReadyNotifications({estimate, customer, settings, ...})
//   proofReadyNotifications({workOrder, product, customer, settings, ...})
//   productReadyLabel(product, index?)         — 'Proof ready — <label>' text
//   proofEntityRef(workOrder, product, index?) — dedupe entity id resolver

export const READY_EVENT_KINDS = ['estimate_ready', 'proof_ready'] as const;

export type ReadyEventKind = (typeof READY_EVENT_KINDS)[number];

// NotificationTemplate.key each kind renders through (the H-02 seeded slots;
// staff overrides keep the same keys).
export const READY_TEMPLATE_KEYS: Record<ReadyEventKind, string> = {
  estimate_ready: 'estimate_ready',
  proof_ready: 'proof_ready',
};

// Per-kind kill-switch key inside settings.notifications — `false` disables.
export const NOTIFY_KILL_SWITCHES: Record<ReadyEventKind, string> = {
  estimate_ready: 'estimate_ready_enabled',
  proof_ready: 'proof_ready_enabled',
};

// Master switch inside the same notifications block — false silences ALL
// ready kinds at once.
export const NOTIFY_MASTER_SWITCH = 'enabled';

// Portal-enabled flag paths checked in precedence order (first defined
// non-null wins), each mirrored inside the KV blob — same convention as
// delivery.ts DELIVERY_SETTING_PATHS.
export const PORTAL_FLAG_PATHS = [
  'customerPortal.enabled',
  'customer_portal_enabled',
  'portal_enabled',
  'setting_value.customerPortal.enabled',
  'setting_value.customer_portal_enabled',
  'setting_value.portal_enabled',
];

// The portal is a live shop feature (CustomerPortal page + per-customer
// token links) — unlike the email lane it defaults ON; only an explicit
// false on a checked path turns the portal lane off.
export const PORTAL_DEFAULT_ENABLED = true;

// Settings paths checked for a portal URL when the caller didn't supply one
// (arg.portal_link/portalLink/portal_url/portal_base win first — the wiring
// layer usually resolves the token-bearing CustomerPortalLink URL itself).
// Tail of the list mirrors notifyModel.buildNotifyContext's company chain.
export const PORTAL_LINK_PATHS = [
  'customerPortal.url',
  'customerPortal.base_url',
  'customerPortal.portal_url',
  'customer_portal_url',
  'portal_url',
  'portal_base',
  'company_website',
  'setting_value.customerPortal.url',
  'setting_value.customerPortal.base_url',
  'setting_value.customerPortal.portal_url',
  'setting_value.customer_portal_url',
  'setting_value.portal_url',
  'setting_value.portal_base',
  'setting_value.company_website',
];

const clean = (v: any): string => String(v ?? '').trim();
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const lower = (v: any): string => clean(v).toLowerCase();

// Walk a dotted settings path ('customerPortal.enabled'); missing/odd hops
// resolve to undefined — same resolver as delivery.ts settingAt.
function settingAt(root: any, path: string) {
  let cur = root;
  for (const key of path.split('.')) {
    if (!isObj(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

// The notifications block: flat on the settings object first, then inside a
// GlobalSettings KV blob ({setting_key, setting_value:{…}}).
export function settingsBlock(settings: any) {
  const flat = settingAt(settings, 'notifications');
  if (isObj(flat)) return flat;
  const nested = settingAt(settings, 'setting_value.notifications');
  return isObj(nested) ? nested : {};
}

// Kill-switch gate for one ready kind. `arg` may be {settings} (spec form)
// or a bare settings object — both resolve, so a caller holding the
// GlobalSettings row can pass it straight through. Unknown kinds fail
// CLOSED (they are not ready events). Default ON: only the literal boolean
// false on the master switch or the kind's own key disables.
export function shouldNotify(kind: any, arg: any = {}): boolean {
  const k = clean(kind);
  if (!(READY_EVENT_KINDS as readonly string[]).includes(k)) return false;
  const settings = isObj(arg?.settings) ? arg.settings : arg;
  const block = settingsBlock(settings);
  if (block[NOTIFY_MASTER_SWITCH] === false) return false;
  const key = NOTIFY_KILL_SWITCHES[k as ReadyEventKind];
  if (key && block[key] === false) return false;
  return true;
}

// Portal-enabled flag: first defined non-null path wins; literal false
// disables; everything else (true, missing, odd values) resolves to the
// PORTAL_DEFAULT_ENABLED default.
export function resolvePortalEnabled(settings: any): boolean {
  for (const path of PORTAL_FLAG_PATHS) {
    const value = settingAt(settings, path);
    if (value === undefined || value === null) continue;
    return value !== false;
  }
  return PORTAL_DEFAULT_ENABLED;
}

// Portal URL resolution — explicit caller args win (the wiring layer passes
// the token-bearing CustomerPortalLink URL it already resolved), then the
// settings path chain. Trailing slashes are stripped so suffixing stays
// deterministic. '' when nothing resolves — callers MUST fall back to the
// D-12 staff link rather than emit a blank customer URL.
export function resolvePortalLink(arg: any = {}): string {
  const a = isObj(arg) ? arg : {};
  const explicit =
    clean(a.portal_link) ||
    clean(a.portalLink) ||
    clean(a.portal_url) ||
    clean(a.portalUrl) ||
    clean(a.portal_base) ||
    clean(a.portalBase);
  const raw = explicit || PORTAL_LINK_PATHS.map((p) => clean(settingAt(a.settings ?? a, p))).find(Boolean) || '';
  return raw.replace(/\/+$/, '');
}

// D-12 staff deep links — byte-identical to deepLinks.js deepLinkFor
// (encodeURIComponent on the id so external keys can never break the route).
export function estimateDeepLink(id: any): string {
  const v = clean(id);
  return v ? `/EstimateDetail?id=${encodeURIComponent(v)}` : '/EstimateDetail';
}
export function jobWorkspaceDeepLink(id: any): string {
  const v = clean(id);
  return v ? `/JobWorkspace?wo=${encodeURIComponent(v)}` : '/JobWorkspace';
}

// Deterministic dedupe identity for one trigger emission:
//   ready:<kind>:<entity_id>           — no version supplied
//   ready:<kind>:<entity_id>:v<version> — versioned artifact
// Version normalization: included when it is a positive number or a
// non-blank string that is not '0' — proof_version 0 means "no proof file"
// on the WorkOrder schema, so a zero/blank version collapses to the bare
// key (fail-closed dedupe — a versionless re-evaluation can never re-send).
// See the header for why proof_ready carries the version: a NEW proof file
// is a NEW artifact and MUST re-notify.
export function triggerDedupeKey(kind: any, entity_id: any, version?: any): string {
  const k = clean(kind) || 'unknown';
  const id = clean(entity_id) || 'unknown';
  let suffix = '';
  if (version !== undefined && version !== null) {
    const n = Number(version);
    const s = clean(version);
    if ((Number.isFinite(n) && n > 0) || (s !== '' && s !== '0' && !Number.isFinite(n))) {
      suffix = `:v${s}`;
    }
  }
  return `ready:${k}:${id}${suffix}`;
}

// Customer-facing recipient ladder — estimate/order contact email first,
// then the customer record's known addresses (notifyModel.resolveCustomerEmail
// / followUpSweepAction.resolveCustomerEmail convention). Lowercased; only
// values containing '@' qualify; '' when nothing resolves.
export function resolveCustomerEmail(primary: any, customer: any): string {
  const hint = lower(primary);
  if (hint.includes('@')) return hint;
  const c = isObj(customer) ? customer : {};
  const candidates = [
    c.contact_email,
    c.billing_contact_email,
    c.email,
    c.contact_office_email,
    c.billing_email,
    ...(Array.isArray(c.contacts) ? c.contacts.map((ct: any) => ct?.email) : []),
  ];
  return candidates.map(lower).find((v) => v.includes('@')) || '';
}

// The '<product>' label in 'Proof ready — <product>' — same fallback chain
// as proofFollowUpModel.productLabel, index-aware.
export function productReadyLabel(product: any, index?: any): string {
  const label =
    clean(product?.description) ||
    clean(product?.client_product_name) ||
    clean(product?.customer_description) ||
    clean(product?.product_type);
  if (label) return label;
  const n = Number(index);
  return Number.isFinite(n) && n >= 0 ? `Product ${Math.floor(n) + 1}` : 'Product';
}

// The entity id a proof_ready dedupe key anchors on: the product row's own
// id first (proof uploads are per-product), then '<wo_id>:<index>' for
// id-less embedded rows (proofFollowUpBatch convention), then the order id.
export function proofEntityRef(workOrder: any, product: any, index?: any): string {
  const pid = clean(product?.id);
  if (pid) return pid;
  const woId = clean(workOrder?.id);
  const n = Number(index);
  if (woId && Number.isFinite(n) && n >= 0) return `${woId}:${Math.floor(n)}`;
  return woId || 'unknown';
}

// Version the dedupe key embeds for one proof notification — the product's
// 1-based proof_version; 0/blank → undefined (no suffix).
function proofVersion(product: any): any {
  const n = Number(product?.proof_version);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

// Estimate dedupe version — a revised quote re-send SHOULD re-notify, so a
// stored quote_version rides the key exactly like proof_version does.
function estimateVersion(estimate: any): any {
  const n = Number(estimate?.quote_version);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

// Internal-designer recipient chain per spec:
//   product.designer → workOrder.assigned_to → settings.default_designer
// Values are cleaned but NOT validated as emails — a stored display name
// still resolves (the wiring layer maps names → directory emails the same
// way followUpSweepAction.resolveStaffEmail does).
export function resolveDesignerRecipient(product: any, workOrder: any, settings: any): string {
  return (
    clean(product?.designer) ||
    clean(workOrder?.assigned_to) ||
    clean(settingAt(settings, 'default_designer')) ||
    clean(settingAt(settings, 'notifications.default_designer')) ||
    clean(settingAt(settings, 'setting_value.default_designer')) ||
    clean(settingAt(settings, 'setting_value.notifications.default_designer'))
  );
}

// '$1,234.56' — same rendering the money formatter produces for dollars.
const money = (v: any): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  const body = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (n < 0 ? '-$' : '$') + body;
};

const companyName = (settings: any, fallback: any): string =>
  clean(settingAt(settings, 'company_name')) ||
  clean(settingAt(settings, 'setting_value.company_name')) ||
  clean(fallback) ||
  'CCS Signage';

// Shared context pieces — the H-03 vocabulary every seeded customer
// template can bind (contact/company/location/user around the spec'd core).
// companyFallback feeds company/location.name (the SHOP — e.g.
// estimate.company_name); customerFallback feeds customer.company_name
// (the CLIENT — e.g. estimate.client_name). The two are never conflated:
// estimate.company_name is the shop's own name on the estimate row.
function baseContext({ customer, settings, contactName, companyFallback, customerFallback, userName }: any) {
  const company = companyName(settings, companyFallback);
  return {
    customer: {
      company_name:
        clean(customer?.company_name) ||
        clean(customer?.name) ||
        clean(customerFallback) ||
        'Customer',
    },
    contact: { name: clean(contactName) },
    company: { name: company },
    location: {
      name: company,
      phone:
        clean(settingAt(settings, 'company_phone')) ||
        clean(settingAt(settings, 'setting_value.company_phone')),
    },
    user: { display_name: clean(userName) || 'The team' },
  };
}

const contactNameFor = (customer: any, fallback: any): string =>
  [clean(customer?.contact_first_name), clean(customer?.contact_last_name)]
    .filter(Boolean)
    .join(' ') ||
  clean(customer?.contact_name) ||
  clean(fallback);

// ---------------------------------------------------------------------------
// estimate_ready — quote-send trigger.
// ---------------------------------------------------------------------------

/**
 * Compose the customer-facing estimate-ready notification(s).
 *
 * @param arg.estimate  AllInOneEstimate row (estimate_number, project_name,
 *                      quote_total, hyperlink, contact_*, salesperson).
 * @param arg.customer  Customer row (company_name, contacts, emails).
 * @param arg.settings  GlobalSettings row / settings object (notifications
 *                      kill-switches, portal flag/link, company defaults).
 * @param arg.portal_link / portalLink / portal_url — caller-resolved portal
 *                      URL (token-bearing); wins over settings paths.
 * @returns [notification] or [] when no estimate is supplied. Row shape:
 *   {to, subject, body, kind:'estimate_ready', audience:'customer',
 *    entity_type:'estimate', entity_id, deep_link, template_key,
 *    dedupe_key, context, missing_email}
 * deep_link = portal link when the portal flag resolves ON and a URL
 * resolves; otherwise /EstimateDetail?id=<id> (D-12).
 */
export function estimateReadyNotifications(arg: any = {}) {
  const { estimate, customer, settings } = isObj(arg) ? arg : ({} as any);
  if (!isObj(estimate) || !clean(estimate.id)) return [];

  const portalOn = resolvePortalEnabled(settings);
  const portal = portalOn ? resolvePortalLink(arg) : '';
  const deepLink = portal || estimateDeepLink(estimate.id);
  // approval_url — the customer-facing review/approve URL the template
  // renders: the estimate's own hyperlink wins (followUpSweep convention),
  // then the resolved portal link. Never the staff route.
  const approvalUrl = clean(estimate.hyperlink) || portal;

  const to = resolveCustomerEmail(estimate.contact_email, customer);
  const context = {
    estimate: {
      number: clean(estimate.estimate_number) || clean(estimate.id),
      title: clean(estimate.project_name) || 'Signage project',
      total: estimate.quote_total ?? '',
      approval_url: approvalUrl,
    },
    ...baseContext({
      customer,
      settings,
      contactName: contactNameFor(customer, estimate.contact_name),
      companyFallback: estimate.company_name,
      customerFallback: estimate.client_name,
      userName: clean(estimate.salesperson) || clean(estimate.entered_by_display),
    }),
  };

  const num_ = context.estimate.number;
  const company = context.company.name;
  const total = money(context.estimate.total);
  const subject = `Your estimate ${num_} is ready — ${company}`;
  const body = [
    `Hi ${context.contact.name || 'there'},`,
    '',
    `Your estimate ${num_} for ${context.customer.company_name} is ready for review.`,
    '',
    `Estimate: ${num_} — ${context.estimate.title}`,
    `Total: ${total || 'see estimate'}`,
    '',
    `You can review and approve it online: ${approvalUrl || 'contact us for a review link'}`,
    '',
    `Questions? Reply to this message${context.location.phone ? ` or call ${context.location.name} at ${context.location.phone}` : ''}.`,
    '',
    'Thank you,',
    context.user.display_name,
    company,
  ].join('\n');

  return [
    {
      audience: 'customer',
      to,
      subject,
      body,
      kind: 'estimate_ready',
      entity_type: 'estimate',
      entity_id: clean(estimate.id),
      deep_link: deepLink,
      template_key: READY_TEMPLATE_KEYS.estimate_ready,
      dedupe_key: triggerDedupeKey('estimate_ready', estimate.id, estimateVersion(estimate)),
      context,
      missing_email: !to,
    },
  ];
}

// ---------------------------------------------------------------------------
// proof_ready — proof-upload trigger (customer + internal designer).
// ---------------------------------------------------------------------------

/**
 * Compose the proof-ready notification pair for one uploaded product proof.
 *
 * @param arg.workOrder  WorkOrder row (id, title, corbridge_invoice_number,
 *                       assigned_to, designer, products[]).
 * @param arg.product    The products[] row whose proof was uploaded
 *                       (designer, proof_version, proof_file_url/name).
 * @param arg.customer   Customer row (recipient + company_name context).
 * @param arg.settings   Settings object (kill-switches, portal, defaults).
 * @param arg.index / product_index — product position for label/id fallback.
 * @param arg.proof_link / proof_url — caller-resolved customer proof URL
 *                       (E-09 share link when it lands); wins over portal.
 * @returns [customerRow, internalRow] or [] when workOrder+product are not
 *          both supplied:
 *   customerRow — same shape as estimate_ready (kind 'proof_ready');
 *                 deep_link = proof_link → portal link → /JobWorkspace?wo=
 *                 (portal proof view when the flag is on; staff fallback).
 *   internalRow — {audience:'internal', type:'notification', kind,
 *                  recipient_email, title:'Proof ready — <product>',
 *                  message, link:'/JobWorkspace?wo=<id>', …} — the
 *                  delivery.ts internalRow vocabulary the writer maps into
 *                  Notification{recipient_email,title,body,deep_link}.
 */
export function proofReadyNotifications(arg: any = {}) {
  const { workOrder, product, customer, settings } = isObj(arg) ? arg : ({} as any);
  if (!isObj(workOrder) || !isObj(product)) return [];
  const woId = clean(workOrder.id);
  if (!woId) return [];

  const index = arg.index ?? arg.product_index;
  const portalOn = resolvePortalEnabled(settings);
  const portal = portalOn ? resolvePortalLink(arg) : '';
  const proofLink =
    clean(arg?.proof_link) ||
    clean(arg?.proof_url) ||
    clean(arg?.proofUrl) ||
    clean(product?.proof_link) ||
    clean(product?.proof_portal_url);
  const customerLink = proofLink || portal || jobWorkspaceDeepLink(woId);
  const approvalUrl = proofLink || portal || clean(product.proof_file_url);

  const version = proofVersion(product);
  const entityRef = proofEntityRef(workOrder, product, index);
  const dedupeKey = triggerDedupeKey('proof_ready', entityRef, version);
  const label = productReadyLabel(product, index);
  const orderNumber =
    clean(workOrder.corbridge_invoice_number) ||
    clean(workOrder.work_order_number) ||
    clean(workOrder.order_number) ||
    woId;
  const orderTitle = clean(workOrder.title) || orderNumber;

  const to = resolveCustomerEmail(
    clean(arg?.to) || clean(arg?.email) || clean(workOrder.contact_email),
    customer,
  );
  const context = {
    order: { number: orderNumber, title: orderTitle },
    proof: {
      approval_url: approvalUrl,
      version: version ?? '',
      file_name: clean(product.proof_file_name),
      product_name: label,
    },
    ...baseContext({
      customer,
      settings,
      contactName: contactNameFor(customer, workOrder.contact_name),
      companyFallback: workOrder.company_name,
      customerFallback: workOrder.client_name,
      userName: clean(workOrder.sales_rep) || clean(workOrder.designer) || clean(workOrder.assigned_to),
    }),
  };

  const company = context.company.name;
  const subject = `Your proof for ${orderTitle} is ready — ${company}`;
  const body = [
    `Hi ${context.contact.name || 'there'},`,
    '',
    `The proof for ${orderTitle} (order ${orderNumber}) is ready for your review.`,
    '',
    `Review and approve it here: ${approvalUrl || 'contact us for a review link'}`,
    '',
    'Once you approve, we head straight to production.',
    '',
    context.user.display_name,
    company,
  ].join('\n');

  const customerRow = {
    audience: 'customer',
    to,
    subject,
    body,
    kind: 'proof_ready',
    entity_type: 'work_order',
    entity_id: woId,
    product_id: clean(product.id) || entityRef,
    deep_link: customerLink,
    template_key: READY_TEMPLATE_KEYS.proof_ready,
    dedupe_key: dedupeKey,
    context,
    missing_email: !to,
  };

  const recipient = resolveDesignerRecipient(product, workOrder, settings);
  const versionText = version !== undefined ? ` v${version}` : '';
  const internalRow = {
    audience: 'internal',
    type: 'notification',
    kind: 'proof_ready',
    recipient_email: lower(recipient) || clean(recipient),
    title: `Proof ready — ${label}`,
    message:
      `Proof${versionText} for "${label}" on order ${orderNumber}` +
      ` (${context.customer.company_name}) was uploaded and is ready for customer review.`,
    link: jobWorkspaceDeepLink(woId),
    entity_type: 'work_order',
    entity_id: woId,
    product_id: clean(product.id) || entityRef,
    dedupe_key: dedupeKey,
    missing_recipient: !clean(recipient),
  };

  return [customerRow, internalRow];
}
