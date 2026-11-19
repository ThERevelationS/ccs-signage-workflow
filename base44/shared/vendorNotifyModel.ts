// Vendor notification composer — ESTIMATOR_MASTERPLAN WS-H / item H-09.
// Pure TS, ZERO imports: safe to bundle into Deno functions
// (base44/functions/*) and frontend modules alike, same contract as
// delivery / templateRender / paymentReminderModel / statementBatchModel.
//
// Four vendor-facing event kinds (VENDOR_EVENT_KINDS):
//   po_created     — a purchase order is issued to the vendor. Wire point:
//                    purchaseOrderAction.mark_sent (draft → sent is the moment
//                    the PO actually leaves the shop; create_purchase_order
//                    only writes a draft — see wire notes below).
//   quote_request  — an RFQ goes to the vendor. No current action emits it;
//                    natural wire point is a future request_vendor_quote-style
//                    action (or a quote-mode create).
//   feedback_sent  — line-item feedback was sent to the vendor (receiving
//                    discrepancies, artwork/material corrections). Candidate
//                    wire points: a future send_line_feedback action, or
//                    receive_items when a receipt carries issue notes.
//   file_uploaded  — a vendor file landed (portal upload). No vendor portal
//                    exists yet; wire point is the future upload endpoint.
//
// vendorNotificationPlan({event, po, vendor, settings}) is PURE composition —
// no I/O, no sends. It returns the outbound-notification list the wiring
// layer feeds to buildDeliveryPlan (H-01 adapter) plus the internal
// notification rows every event always produces (alwaysInternal philosophy —
// staff see the event in the notification center whether or not outbound
// email is enabled). The model composes DEFAULT plaintext bodies itself
// (templateRender cannot be imported here); notification.template_key names
// the NotificationTemplate row a caller may render instead via
// poTemplateContext() when staff override the copy.
//
// Recipient chain (recipientsFor): vendor.contact_email → vendor.email →
// vendor.comm_prefs.email → first contacts[] email → vendor.statement_email →
// po.vendor_email → settings.purchase_contact_email. contact_email is not a
// declared Vendor.jsonc field but is the documented primary slot (extras are
// tolerated on stored rows); the schema-real email homes
// (comm_prefs/contacts/statement_email) follow it before the PO's
// denormalized copy and the shop purchasing mailbox. A vendor chain that
// resolves nothing yields notifications: [] — "internal-only + flag"
// (plan.flags gains 'missing_vendor_email') so the event still lands in the
// staff feed and the wiring layer can see why nothing went out.
//
// Portal link chain (portalLinkFor): vendor.portal_link →
// vendor.comm_prefs.portal_link → po.portal_link →
// `${appBaseUrl}/vendor?po=<id>` where appBaseUrl resolves from settings
// (app_url / app_base_url / base_url / public_url /
// vendor_portal_base_url / vendorNotify block / setting_value KV twins) and
// defaults to the published app origin (DEFAULT_APP_BASE_URL). portal_link is
// not a declared entity field — the chain honors stored extras first.
//
// Settings is a GlobalSettings-style object — flat keys, a {setting_key,
// setting_value} KV row, and a vendorNotify/vendor_notify sub-block are all
// accepted (settingAt walks plain paths + setting_value twins):
//   company identity : company_name | company.name | companyName
//   app base url     : app_url | app_base_url | base_url | public_url |
//                      vendor_portal_base_url
//   purchasing inbox : purchase_contact_email | purchasing_email |
//                      purchasing_contact_email | procurement_email |
//                      vendor_notify_email
//   extra internals  : vendor_notify_emails[] | internal_notify_emails[] |
//                      vendorNotify.internal_recipients[]
// po.created_by (when it looks like an email) is always appended to the
// internal recipient set — the buyer who wrote the PO should see the event.
//
// Dedupe (notifyDedupeKey): 'vnotif:<po_id>:<kind>' — po_id is po.id, falling
// back to po.po_number, else 'unknown'. Once per PO per kind by construction;
// the wiring layer stamps it as the Notification row's dedupe_key.
//
// Arrive-by: PurchaseOrder.expected_date is a free-form string (no date
// format declared), so formatArriveBy renders 'YYYY-MM-DD'/ISO inputs as
// 'M/D/YYYY' (UTC-anchored — the same convention templateRender's `| date`
// formatter uses so stored dates can't drift a day in western timezones),
// passes unparseable text through verbatim, and yields 'TBD' when empty.
//
// Money renders en-US '$1,234.56' — same convention as templateRender `| money`.
//
// API:
//   VENDOR_EVENT_KINDS / VENDOR_TEMPLATE_KEYS
//   DEFAULT_COMPANY_NAME / DEFAULT_APP_BASE_URL / VENDOR_PORTAL_PATH /
//     VENDOR_NOTIFY_CATEGORY
//   normalizeVendorEventKind(event)          — kind or '' (never throws)
//   formatMoney(value) / formatArriveBy(value)
//   companyNameFor(settings, po?) / appBaseUrlFor(settings)
//   purchaseContactFor(settings)
//   portalLinkFor(po, vendor, settings?)
//   poDeepLink(po)                           — '/PurchaseOrders?po=<id>'
//   recipientsFor(vendor, {settings?})       — vendor `to` chain (above)
//   internalRecipientsFor({po?, settings?})  — staff emails, deduped
//   poTemplateContext(po, vendor)            — render ctx for templateRender
//   notifyDedupeKey(po, kind)                — 'vnotif:<po_id>:<kind>'
//   vendorNotificationPlan({event, po, vendor, settings})
//     → { kind, dedupe_key, flags, notifications, internal }
//         notifications: [{to, subject, body, kind, deep_link, template_key,
//                          entity_type, entity_id, dedupe_key}]  (≤1 entry —
//                          vendor events have one external recipient)
//         internal:      [{recipient_email, title, message, link}] (always ≥1
//                          when a po exists; recipient_email '' = unresolved,
//                          the writer fans out to admins)
//         flags:         'unknown_event' | 'missing_po' | 'missing_vendor_email'

export const VENDOR_EVENT_KINDS = [
  'po_created',
  'quote_request',
  'feedback_sent',
  'file_uploaded',
] as const;

export type VendorEventKind = (typeof VENDOR_EVENT_KINDS)[number];

// NotificationTemplate.key each kind renders through when staff override the
// default copy (seed keys may be registered later — the model's inline
// subjects/bodies are the guaranteed fallback, like
// followUpSweepAction.FOLLOW_UP_TEMPLATE_DEFAULTS).
export const VENDOR_TEMPLATE_KEYS: Record<VendorEventKind, string> = {
  po_created: 'po_created',
  quote_request: 'quote_request',
  feedback_sent: 'feedback_sent',
  file_uploaded: 'file_uploaded',
};

// Published app origin — the portal-link fallback when no settings/vendor/po
// link exists (mirrors the live site host in AGENTS.md).
export const DEFAULT_APP_BASE_URL = 'https://clay-flow-signage-suite-387da97c.base44.app';
// Vendor-facing portal mount — `https://<app>/vendor?po=<id>` per the H-09 spec.
export const VENDOR_PORTAL_PATH = '/vendor';
export const DEFAULT_COMPANY_NAME = 'CCS Signage';
// Notification.category bucket vendor rows ride (Notification.jsonc has no
// vendor category — 'system' is the declared catch-all).
export const VENDOR_NOTIFY_CATEGORY = 'system';

const VENDOR_KIND_SET: ReadonlySet<string> = new Set(VENDOR_EVENT_KINDS);

const clean = (v: any): string => String(v ?? '').trim();
const isObj = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: any): any[] => (Array.isArray(v) ? v : []);
const lower = (v: any): string => clean(v).toLowerCase();
const asEmail = (v: any): string => {
  const e = lower(v);
  return e.includes('@') ? e : '';
};

// Walk a dotted path on flat settings rows AND {setting_key, setting_value}
// KV blobs — same convention as delivery.ts settingAt, extended so every
// lookup tries `setting_value.<path>` as a fallback hop.
function settingAt(root: any, path: string): any {
  const walk = (base: any): any => {
    let cur = base;
    for (const key of path.split('.')) {
      if (!isObj(cur)) return undefined;
      cur = cur[key];
    }
    return cur;
  };
  const direct = walk(root);
  if (direct !== undefined && direct !== null) return direct;
  return walk(isObj(root) ? root.setting_value : undefined);
}

// First non-empty string across a list of candidate paths on settings.
function settingString(settings: any, paths: string[]): string {
  for (const p of paths) {
    const v = clean(settingAt(settings, p));
    if (v) return v;
  }
  return '';
}

function settingStringList(settings: any, paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    const v = settingAt(settings, p);
    for (const item of list(v)) {
      const s = clean(item);
      if (s) out.push(s);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// normalization + small formatters
// ---------------------------------------------------------------------------

// Event accepts a bare kind string or {kind|type|event, ...payload}; anything
// outside VENDOR_EVENT_KINDS normalizes to '' — plans fail closed, never throw.
export function normalizeVendorEventKind(event: any): VendorEventKind | '' {
  const raw = isObj(event) ? (event.kind ?? event.type ?? event.event) : event;
  const k = lower(raw);
  return VENDOR_KIND_SET.has(k) ? (k as VendorEventKind) : '';
}

// '$1,234.56' / '-$7.25'; non-numeric → '' (same convention as templateRender
// `| money`).
export function formatMoney(value: any): string {
  const s = clean(value);
  if (s === '') return '';
  const n = Number(s);
  if (!Number.isFinite(n)) return '';
  const body = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (n < 0 ? '-$' : '$') + body;
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// 'YYYY-MM-DD' and ISO datetimes render as the UTC calendar date 'M/D/YYYY'
// (templateRender `| date` convention); unparseable free text passes through;
// empty → 'TBD' so the arrive-by line is always present and greppable.
export function formatArriveBy(value: any): string {
  const s = clean(value);
  if (!s) return 'TBD';
  let ms = NaN;
  const m = DATE_ONLY_RE.exec(s);
  if (m) ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  else {
    const t = Date.parse(s);
    if (Number.isFinite(t)) ms = t;
  }
  if (!Number.isFinite(ms)) return s; // 'Next Friday'-style free text survives
  return new Date(ms).toLocaleDateString('en-US', { timeZone: 'UTC' });
}

// ---------------------------------------------------------------------------
// settings resolution
// ---------------------------------------------------------------------------

const COMPANY_NAME_PATHS = ['company_name', 'company.name', 'companyName', 'location.name'];
const APP_BASE_URL_PATHS = [
  'app_url',
  'app_base_url',
  'base_url',
  'public_url',
  'vendor_portal_base_url',
  'vendorNotify.base_url',
  'vendorNotify.app_url',
  'vendor_notify.base_url',
  'vendor_notify.app_url',
];
const PURCHASE_CONTACT_PATHS = [
  'purchase_contact_email',
  'purchasing_email',
  'purchasing_contact_email',
  'procurement_email',
  'vendor_notify_email',
  'vendorNotify.purchase_contact_email',
  'vendor_notify.purchase_contact_email',
];
const INTERNAL_EXTRA_PATHS = [
  'vendor_notify_emails',
  'internal_notify_emails',
  'vendorNotify.internal_recipients',
  'vendor_notify.internal_recipients',
];

export function companyNameFor(settings: any, po?: any): string {
  return (
    settingString(settings, COMPANY_NAME_PATHS) ||
    clean(po?.company_name) ||
    DEFAULT_COMPANY_NAME
  );
}

export function appBaseUrlFor(settings: any): string {
  const raw = settingString(settings, APP_BASE_URL_PATHS);
  return raw ? raw.replace(/\/+$/, '') : DEFAULT_APP_BASE_URL;
}

// The shop's purchasing inbox — last hop of the vendor `to` chain AND the
// primary internal recipient (the desk that owns vendor comms).
export function purchaseContactFor(settings: any): string {
  return asEmail(settingString(settings, PURCHASE_CONTACT_PATHS));
}

// ---------------------------------------------------------------------------
// links
// ---------------------------------------------------------------------------

// vendor.portal_link → vendor.comm_prefs.portal_link → po.portal_link →
// `${base}/vendor?po=<id>`. comm_prefs is the declared Vendor.jsonc home for
// per-vendor comm extras; a stored flat portal_link still wins (spec order).
export function portalLinkFor(po: any, vendor: any, settings?: any): string {
  const direct =
    clean(vendor?.portal_link) ||
    clean(vendor?.comm_prefs?.portal_link) ||
    clean(po?.portal_link);
  if (direct) return direct;
  const id = clean(po?.id) || clean(po?.po_number);
  if (!id) return '';
  return `${appBaseUrlFor(settings)}${VENDOR_PORTAL_PATH}?po=${encodeURIComponent(id)}`;
}

// Staff-side route — the deep_link on outbound notifications (surfaces in the
// always-on internal row via buildDeliveryPlan) and link on internal rows.
export function poDeepLink(po: any): string {
  const id = clean(po?.id) || clean(po?.po_number);
  return id ? `/PurchaseOrders?po=${encodeURIComponent(id)}` : '/PurchaseOrders';
}

// ---------------------------------------------------------------------------
// recipients
// ---------------------------------------------------------------------------

interface VendorRecipient {
  to: string;
  emails: string[];
  source: string;
  missing_email: boolean;
}

// Vendor-facing `to` chain — spec order first (contact_email → email), then
// the declared Vendor.jsonc homes (comm_prefs.email, contacts[] emails,
// statement_email), the PO's denormalized vendor_email, and finally the
// shop purchasing mailbox so a deliverable address exists whenever anyone
// configured one. `source` records which hop won.
function resolveVendorRecipient(vendor: any, po: any, settings: any): VendorRecipient {
  const contactEmails = list(vendor?.contacts)
    .map((c: any) => asEmail(c?.email))
    .filter(Boolean);
  const chain: Array<[string, any]> = [
    ['contact_email', vendor?.contact_email],
    ['email', vendor?.email],
    ['comm_prefs_email', vendor?.comm_prefs?.email],
    ...contactEmails.map((e): [string, any] => ['contact', e]),
    ['statement_email', vendor?.statement_email],
    ['po_vendor_email', po?.vendor_email],
    ['purchase_contact_email', settingString(settings, PURCHASE_CONTACT_PATHS)],
  ];
  for (const [source, raw] of chain) {
    const email = asEmail(raw);
    if (email) return { to: email, emails: [email], source, missing_email: false };
  }
  return { to: '', emails: [], source: 'none', missing_email: true };
}

export function recipientsFor(vendor: any, { settings }: any = {}): VendorRecipient {
  return resolveVendorRecipient(vendor, null, settings);
}

// Internal staff recipients for an event: the purchasing inbox first, any
// configured extras, then the PO writer (created_by) — deduped, emails only.
export function internalRecipientsFor({ po, settings }: any = {}): string[] {
  const out: string[] = [];
  const push = (v: any) => {
    const e = asEmail(v);
    if (e && !out.includes(e)) out.push(e);
  };
  push(purchaseContactFor(settings));
  for (const e of settingStringList(settings, INTERNAL_EXTRA_PATHS)) push(e);
  push(po?.created_by);
  return out;
}

// ---------------------------------------------------------------------------
// template context — the {{path}} vocabulary poTemplateContext exposes for
// templateRender-driven NotificationTemplate overrides (key = template_key).
// Shape is exactly {po:{...}, vendor:{...}} per the H-09 spec.
// ---------------------------------------------------------------------------

export function poTemplateContext(po: any, vendor: any): any {
  const items = list(po?.line_items);
  const vendorContact =
    asEmail(vendor?.contact_email) ||
    asEmail(vendor?.email) ||
    asEmail(vendor?.comm_prefs?.email) ||
    list(vendor?.contacts).map((c: any) => asEmail(c?.email)).find(Boolean) ||
    asEmail(vendor?.statement_email) ||
    asEmail(po?.vendor_email) ||
    '';
  return {
    po: {
      number: clean(po?.po_number) || clean(po?.number) || clean(po?.id),
      arrive_by: clean(po?.arrive_by) || clean(po?.expected_date),
      total: clean(po?.total) !== '' && Number.isFinite(Number(po.total)) ? Number(po.total) : clean(po?.total),
      vendor_name: clean(po?.vendor_name) || clean(vendor?.name),
      portal_link: portalLinkFor(po, vendor),
      line_count: items.length,
    },
    vendor: {
      name: clean(vendor?.name) || clean(po?.vendor_name),
      contact_email: vendorContact,
    },
  };
}

// ---------------------------------------------------------------------------
// dedupe — once per PO per kind
// ---------------------------------------------------------------------------

export function notifyDedupeKey(po: any, kind: any): string {
  const id = clean(po?.id) || clean(po?.po_number) || 'unknown';
  const k = lower(kind) || 'unknown';
  return `vnotif:${id}:${k}`;
}

// ---------------------------------------------------------------------------
// plan composition
// ---------------------------------------------------------------------------

const poNumber = (po: any): string => clean(po?.po_number) || clean(po?.number) || clean(po?.id) || 'PO';
const vendorName = (po: any, vendor: any): string =>
  clean(vendor?.name) || clean(po?.vendor_name) || 'Vendor';
const lineCount = (po: any): number => list(po?.line_items).length;

// Event payload helpers — the wiring layer passes event extras (file name,
// feedback text, actor); every accessor tolerates missing/malformed input.
const eventText = (event: any, keys: string[]): string => {
  if (!isObj(event)) return '';
  for (const k of keys) {
    const v = clean(event[k]);
    if (v) return v;
  }
  return '';
};
const eventFileName = (event: any): string => {
  if (!isObj(event)) return '';
  const direct = eventText(event, ['file_name', 'filename', 'name']);
  if (direct) return direct;
  const f = event.file;
  return typeof f === 'string' ? clean(f) : clean(f?.name ?? f?.file_name);
};
const eventFeedback = (event: any): string =>
  eventText(event, ['feedback', 'message', 'note', 'notes', 'summary', 'text']);
const eventActor = (event: any): string =>
  eventText(event, ['actor', 'sent_by', 'uploaded_by', 'created_by']);

function pushLine(lines: string[], label: string, value: string): void {
  lines.push(`${label}: ${value}`);
}

interface Composed {
  subject: string;
  body: string;
  internalTitle: string;
  internalMessage: string;
}

// Default plaintext per kind — spec pins po_created subject to
// 'PO <number> from <company>' and requires arrive-by + portal link in-body.
function compose(
  kind: VendorEventKind,
  { po, vendor, settings, event }: any,
): Composed {
  const company = companyNameFor(settings, po);
  const vName = vendorName(po, vendor);
  const number = poNumber(po);
  const portal = portalLinkFor(po, vendor, settings);
  const arriveBy = formatArriveBy(clean(po?.arrive_by) || clean(po?.expected_date));
  const total = formatMoney(po?.total);
  const lines = lineCount(po);
  const greet = `Hello ${vName},`;

  let subject = '';
  const body: string[] = [];
  let internalTitle = '';
  let internalMessage = '';

  if (kind === 'po_created') {
    subject = `PO ${number} from ${company}`;
    body.push(
      greet,
      '',
      `You have a new purchase order from ${company}.`,
      '',
    );
    pushLine(body, 'PO number', number);
    pushLine(body, 'Line items', String(lines));
    if (total) pushLine(body, 'Total', total);
    pushLine(body, 'Arrive by', arriveBy);
    if (clean(po?.ship_to)) pushLine(body, 'Ship to', clean(po.ship_to));
    body.push('', `View or respond online: ${portal || '(link unavailable)'}`);
    internalTitle = `PO ${number} sent to ${vName}`;
    internalMessage = `Purchase order ${number} (${lines} line${lines === 1 ? '' : 's'}${total ? `, ${total}` : ''}) issued to ${vName}. Arrive by ${arriveBy}.`;
  } else if (kind === 'quote_request') {
    subject = `Quote request — ${number} from ${company}`;
    body.push(
      greet,
      '',
      `${company} is requesting a quote on the items below.`,
      '',
    );
    pushLine(body, 'Reference', number);
    pushLine(body, 'Line items', String(lines));
    pushLine(body, 'Needed by', arriveBy);
    body.push('', `Submit your quote online: ${portal || '(link unavailable)'}`);
    internalTitle = `Quote request sent to ${vName} — ${number}`;
    internalMessage = `Quote request ${number} (${lines} line${lines === 1 ? '' : 's'}) sent to ${vName}. Needed by ${arriveBy}.`;
  } else if (kind === 'feedback_sent') {
    const feedback = eventFeedback(event);
    const lineRefs = list(event?.lines).length;
    subject = `Feedback on ${number} — ${company}`;
    body.push(
      greet,
      '',
      `${company} sent feedback on purchase order ${number}.`,
      '',
    );
    if (feedback) body.push(feedback, '');
    else if (lineRefs > 0) body.push(`${lineRefs} line${lineRefs === 1 ? '' : 's'} carry notes.`, '');
    body.push(`Review the feedback online: ${portal || '(link unavailable)'}`);
    internalTitle = `Vendor feedback sent — ${number}`;
    internalMessage = `Feedback on ${number} sent to ${vName}${lineRefs ? ` (${lineRefs} line${lineRefs === 1 ? '' : 's'})` : ''}.`;
  } else {
    // file_uploaded
    const file = eventFileName(event);
    const actor = eventActor(event);
    subject = `File received — ${number} — ${company}`;
    body.push(
      greet,
      '',
      `${company} received your file${file ? ` "${file}"` : ''} on purchase order ${number}.`,
      '',
      `View it online: ${portal || '(link unavailable)'}`,
    );
    internalTitle = `Vendor file uploaded — ${number}`;
    internalMessage = `${vName} uploaded ${file ? `"${file}"` : 'a file'} on ${number}${actor ? ` (via ${actor})` : ''}.`;
  }

  body.push('', 'Thank you,', company);
  return { subject, body: body.join('\n'), internalTitle, internalMessage };
}

// Compose the full notification plan for one vendor event. Pure — the wiring
// layer owns delivery (buildDeliveryPlan + notificationAction.record) and
// stamps dedupe_key on the rows it writes.
export function vendorNotificationPlan({ event, po, vendor, settings }: any = {}) {
  const kind = normalizeVendorEventKind(event);
  const flags: string[] = [];
  const dedupeKey = notifyDedupeKey(po, kind || 'unknown');

  if (!isObj(po)) {
    flags.push('missing_po');
    return { kind, dedupe_key: dedupeKey, flags, notifications: [], internal: [] };
  }
  if (!kind) {
    flags.push('unknown_event');
    return { kind, dedupe_key: dedupeKey, flags, notifications: [], internal: [] };
  }

  const { subject, body, internalTitle, internalMessage } = compose(kind, {
    po, vendor, settings, event,
  });
  const link = poDeepLink(po);
  const recipient = resolveVendorRecipient(vendor, po, settings);
  if (recipient.missing_email) flags.push('missing_vendor_email');

  const notifications: any[] = [];
  if (!recipient.missing_email) {
    notifications.push({
      to: recipient.to,
      subject,
      body,
      kind,
      deep_link: link,
      template_key: VENDOR_TEMPLATE_KEYS[kind],
      entity_type: 'purchase_order',
      entity_id: clean(po.id) || clean(po.po_number),
      dedupe_key: dedupeKey,
    });
  }

  const note = recipient.missing_email
    ? `${internalMessage} No vendor email on file — notify ${vendorName(po, vendor)} manually.`
    : internalMessage;
  const internalTo = internalRecipientsFor({ po, settings });
  const internal = (internalTo.length ? internalTo : ['']).map((email) => ({
    recipient_email: email,
    title: internalTitle,
    message: note,
    link,
  }));

  return { kind, dedupe_key: dedupeKey, flags, notifications, internal };
}
