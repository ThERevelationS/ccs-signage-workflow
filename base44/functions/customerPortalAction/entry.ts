import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";
import { authenticateSignShopSession } from "../../shared/signShopSession.ts";
import {
  createFoundationRecordWithRecovery,
  expectedFoundationFields,
  replaceFoundationFieldsIfUnchanged,
} from "../../shared/opportunityFoundationPersistence.mjs";

const clean = (value: any) => String(value ?? "").trim();
const num = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const whole = (value: any, fallback = 0) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bad = (message: string, status = 400) => {
  const error: any = new Error(message);
  error.status = status;
  return error;
};

const LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000;
// Configurable link expiry — a `link_days` body param (7–365, default 90)
// overrides the static TTL so admins can shorten links for sensitive customers
// or lengthen them for long-cycle B2B work without a code change.
const linkDays = (body: any) => Math.min(365, Math.max(7, whole(body?.link_days, 90)));
const linkExpiry = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
const MESSAGE_MAX = 4000;
const PORTAL_BASE = String(Deno.env.get("PUBLIC_APP_URL") || "https://clay-flow-signage-suite-387da97c.base44.app").replace(/\/+$/, "");

// Only the published app origin (plus any PORTAL_ALLOWED_ORIGINS) may receive
// emailed portal tokens; anything else falls back to the published origin.
function trustedPortalBase(requested: any) {
  const allowed = new Set([PORTAL_BASE, ...String(Deno.env.get("PORTAL_ALLOWED_ORIGINS") || "").split(",").map((o) => clean(o).replace(/\/+$/, ""))].filter(Boolean));
  const candidate = clean(requested).replace(/\/+$/, "");
  return allowed.has(candidate) ? candidate : PORTAL_BASE;
}

const escapeHtml = (value: any) => String(value ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>
)[c]);

const maskToken = (token: any) => (clean(token) ? "••••" + clean(token).slice(-6) : "");
const tokenForCaller = (user: any, token: any) => (user?.role === "admin" ? clean(token) : maskToken(token));
const linkForCaller = (user: any, link: any) => (link ? { ...link, token: tokenForCaller(user, link.token) } : link);

function customerEmailsOnFile(customer: any) {
  return [customer?.email, customer?.contact_email, customer?.billing_contact_email, customer?.billing_email]
    .map((e) => clean(e))
    .filter((e) => e.includes("@"));
}

async function auditPortalLink(base44: any, actor: string, action: string, link: any, detail: string) {
  try {
    await base44.asServiceRole.entities.AdminAuditLog.create({
      actor_email: actor,
      action,
      target_email: `CustomerPortalLink:${clean(link?.id)}`,
      detail: `${detail} kind=${clean(link?.kind)} record=${clean(link?.record_id)} customer=${clean(link?.customer_id)} token=${maskToken(link?.token)}`.slice(0, 1000),
      at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Portal link audit failed:", error?.message || error);
  }
}

function linkIsUsable(link: any) {
  if (!link?.id || link.revoked === true) return false;
  const expiresAt = Date.parse(clean(link.expires_at));
  return !Number.isFinite(expiresAt) || expiresAt > Date.now();
}

async function resolveLink(PortalLink: any, token: string) {
  if (token.length < 16 || token.length > 128) throw bad("Portal link not recognized.", 404);
  const links = await PortalLink.filter({ token }).catch(() => []);
  const link = (Array.isArray(links) ? links : []).find(linkIsUsable);
  if (!link) throw bad("This portal link is invalid, expired, or revoked.", 404);
  return link;
}

function bumpOpen(PortalLink: any, link: any) {
  replaceFoundationFieldsIfUnchanged({
    entity: PortalLink,
    recordId: clean(link.id),
    expectedFields: expectedFoundationFields(link, { open_count: link.open_count ?? 0 }),
    nextFields: { open_count: num(link.open_count) + 1, last_opened_at: new Date().toISOString() },
    label: "Portal link open tracking",
  }).catch(() => null);
}

function invoicePortalView(invoice: any) {
  const items = Array.isArray(invoice?.line_items) ? invoice.line_items : [];
  return {
    id: clean(invoice?.id),
    invoice_number: clean(invoice?.invoice_number),
    status: clean(invoice?.status),
    billing_type: clean(invoice?.billing_type),
    issue_date: clean(invoice?.issue_date),
    due_date: clean(invoice?.due_date),
    customer_display_name: clean(invoice?.customer_display_name),
    description: clean(invoice?.notes || invoice?.description),
    line_items: items.map((item: any) => ({
      description: clean(item?.description),
      quantity: num(item?.quantity),
      unit_price: num(item?.unit_price),
      amount: num(item?.line_total ?? item?.amount),
    })),
    subtotal: num(invoice?.subtotal),
    tax: num(invoice?.tax_amount ?? invoice?.tax),
    total: num(invoice?.total),
    amount_paid: num(invoice?.amount_paid),
    balance_due: num(invoice?.balance_due),
    pay_url: clean(invoice?.pay_url),
    can_pay_online: Boolean(clean(invoice?.pay_url)) && num(invoice?.balance_due) > 0,
  };
}

// Matches quoteExpirationDate() in src/components/estimator/quoteLifecycle.js:
// YYYY-MM-DD issue date + valid days (default 30) -> YYYY-MM-DD stamp, "" when no issue date.
function quoteValidUntil(estimate: any) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(estimate?.quote_issue_date));
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + Math.max(0, whole(estimate?.quote_valid_days, 30)));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function estimatePortalView(estimate: any) {
  // Customer-facing section price = unit snapshot x customer qty x (1 + adj%).
  // Sections flagged include_in_customer=false roll up into a single bundled line.
  const items = Array.isArray(estimate?.line_items) ? estimate.line_items : [];
  const priceOf = (i: any) => num(i?.total_snapshot) * (num(i?.customer_quantity) || 1) * (1 + num(i?.adjustment_percent) / 100);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const SectionAcceptance = base44.asServiceRole.entities.EstimateSectionAcceptance;
  const quoteVersion = Math.max(1, whole(estimate?.quote_version, 1));
  const decisionRows = await SectionAcceptance.filter({ estimate_id: clean(estimate?.id), quote_version: quoteVersion }).catch(() => []);
  const decisionBySection = {};
  (Array.isArray(decisionRows) ? decisionRows : []).sort((a: any, b: any) => new Date(clean(a?.decided_at)).getTime() - new Date(clean(b?.decided_at)).getTime()).forEach((r: any) => { decisionBySection[clean(r?.section_key)] = clean(r?.decision); });
  const sections = items
    .filter((i: any) => i?.include_in_customer !== false)
    .map((i: any) => {
      const sectionKey = clean(i?.key || i?.id);
      return {
        name: clean(i?.client_product_name) || clean(i?.project_name) || clean(i?.product_category) || "Item",
        description: clean(i?.customer_description),
        quantity: num(i?.customer_quantity) || 1,
        amount: round2(priceOf(i)),
        section_key: sectionKey,
        decision: decisionBySection[sectionKey] || "",
      };
    });
  const bundled = round2(items.filter((i: any) => i?.include_in_customer === false).reduce((s: number, i: any) => s + priceOf(i), 0));
  if (bundled > 0) sections.push({ name: "Additional project scope", description: "", quantity: 1, amount: bundled });
  return {
    id: clean(estimate?.id),
    estimate_number: clean(estimate?.estimate_number),
    quote_title: clean(estimate?.quote_title) || clean(estimate?.project_name),
    project_name: clean(estimate?.project_name),
    status: clean(estimate?.status),
    contact_name: clean(estimate?.contact_name),
    po_number: clean(estimate?.po_number),
    quote_total: num(estimate?.quote_total),
    company_name: clean(estimate?.company_name),
    company_logo_url: clean(estimate?.company_logo_url),
    quote_valid_days: num(estimate?.quote_valid_days),
    accepted_at: clean(estimate?.accepted_at),
    accepted_by_name: clean(estimate?.accepted_by_name),
    quote_issue_date: clean(estimate?.quote_issue_date),
    quote_valid_until: quoteValidUntil(estimate),
    updated_date: clean(estimate?.updated_date),
    can_respond: clean(estimate?.status) === "sent",
    section_acceptance_mode: estimate?.section_acceptance_mode === true,
    sections,
  };
}

function jobPortalView(order: any) {
  const tasks = Array.isArray(order?.sub_tasks) ? order.sub_tasks : [];
  const done = tasks.filter((t: any) => t?.completed === true || clean(t?.status) === "completed").length;
  return {
    id: clean(order?.id),
    work_order_number: clean(order?.est_inv_at || order?.work_order_number),
    title: clean(order?.title),
    status: order?.deleted === true ? "deleted" : order?.completed === true ? "completed" : clean(order?.current_stage || order?.status),
    due_date: clean(order?.due_date),
    install_date: clean(order?.project_install_date),
    install_location: clean(order?.install_location),
    task_progress: tasks.length ? { completed: done, total: tasks.length } : null,
    updated_date: clean(order?.updated_date),
  };
}

function logPortalOpportunityActivity(OpportunityActivity: any, input: {
  opportunityId: string; eventType: string; summary: string; details?: any; key: string;
}) {
  if (!clean(input.opportunityId)) return Promise.resolve(null);
  const key = input.key.slice(0, 256);
  return createFoundationRecordWithRecovery({
    entity: OpportunityActivity,
    data: {
      creation_request_key: key,
      opportunity_id: clean(input.opportunityId),
      event_type: clean(input.eventType) || "note",
      summary: clean(input.summary).slice(0, 500),
      details: input.details && typeof input.details === "object" ? input.details : {},
      actor: "customer_portal",
    },
    readMatches: () => OpportunityActivity.filter({ creation_request_key: key }),
    label: "Portal opportunity activity",
  }).catch(() => null);
}

function messageView(m: any) {
  return {
    id: clean(m?.id),
    author_side: clean(m?.author_side),
    author_name: clean(m?.author_name),
    kind: clean(m?.kind) || "message",
    body: clean(m?.body),
    related_kind: clean(m?.related_kind),
    related_id: clean(m?.related_id),
    related_label: clean(m?.related_label),
    attachment_name: clean(m?.attachment_name),
    attachment_url: clean(m?.attachment_url),
    attachment_mime: clean(m?.attachment_mime),
    created_date: clean(m?.created_date),
    read_by_staff: m?.read_by_staff === true,
    read_by_customer: m?.read_by_customer === true,
  };
}

async function loadCustomerThread(PortalMessage: any, customerId: string, markStaffRead = false) {
  const rows = await PortalMessage.filter({ customer_id: customerId }).catch(() => []);
  const list = (Array.isArray(rows) ? rows : [])
    .sort((a: any, b: any) => clean(a?.created_date).localeCompare(clean(b?.created_date)));
  if (markStaffRead) {
    for (const m of list) {
      if (clean(m?.author_side) === "staff" && m?.read_by_customer !== true) {
        replaceFoundationFieldsIfUnchanged({
          entity: PortalMessage,
          recordId: clean(m.id),
          expectedFields: expectedFoundationFields(m, { read_by_customer: true }),
          nextFields: { read_by_customer: true },
          label: "Portal message read receipt",
        }).catch(() => null);
        m.read_by_customer = true;
      }
    }
  }
  return list;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action);
    if (!action) throw bad("An action is required.");

    const PortalLink = base44.asServiceRole.entities.CustomerPortalLink;
    const PortalMessage = base44.asServiceRole.entities.PortalMessage;
    const Invoice = base44.asServiceRole.entities.Invoice;
    const Payment = base44.asServiceRole.entities.Payment;
    const Estimate = base44.asServiceRole.entities.AllInOneEstimate;
    const WorkOrder = base44.asServiceRole.entities.WorkOrder;
    const Customer = base44.asServiceRole.entities.Customer;
    const EstimatingRequest = base44.asServiceRole.entities.EstimatingRequest;
    const OpportunityActivity = base44.asServiceRole.entities.OpportunityActivity;
    const ChangeOrder = base44.asServiceRole.entities.ChangeOrder;
    const Announcement = base44.asServiceRole.entities.Announcement;

    // Announcements reach the portal only when staff explicitly targets the
    // "customerportal" display page — empty display_pages means "all staff app
    // pages", which must never leak into the customer-facing surface.
    const loadPortalAnnouncements = async (customerId = "") => {
      const rows = await Announcement.filter({ is_active: true }).catch(() => []);
      const rank: any = { urgent: 0, high: 1, normal: 2, low: 3 };
      return (Array.isArray(rows) ? rows : [])
        .filter((a: any) => Array.isArray(a?.display_pages) && a.display_pages.some((p: any) => clean(p).toLowerCase() === "customerportal"))
        // Customer targeting: an empty customer_ids list broadcasts to all;
        // a non-empty list restricts the announcement to those customers.
        .filter((a: any) => !Array.isArray(a?.customer_ids) || a.customer_ids.length === 0 || a.customer_ids.some((id: any) => clean(id) === customerId))
        .sort((a: any, b: any) => (rank[clean(a?.priority)] ?? 2) - (rank[clean(b?.priority)] ?? 2))
        .slice(0, 5)
        .map((a: any) => ({
          title: clean(a?.title),
          message: clean(a?.message),
          image_url: clean(a?.image_url),
          priority: clean(a?.priority) || "normal",
        }));
    };

    const opportunityIdForEstimate = async (estimateId: string) => {
      const requests = await EstimatingRequest.filter({ estimate_id: estimateId }).catch(() => []);
      return clean((Array.isArray(requests) ? requests : [])[0]?.opportunity_id);
    };

    // ---------- Public token actions (the bearer token IS the credential) ----------

    if (action === "bootstrap") {
      const link = await resolveLink(PortalLink, clean(body?.token));
      bumpOpen(PortalLink, link);

      if (clean(link.kind) === "invoice") {
        const invoice = await Invoice.get(clean(link.record_id)).catch(() => null);
        if (!invoice?.id) throw bad("The linked record is no longer available.", 404);
        const payments = await Payment.filter({ invoice_id: clean(invoice.id) }).catch(() => []);
        const announcements = await loadPortalAnnouncements(clean(link.customer_id) || clean(invoice.customer_id) || "");
        return Response.json({
          success: true,
          action,
          kind: "invoice",
          label: clean(link.label),
          expires_at: clean(link.expires_at),
          announcements,
          invoice: invoicePortalView(invoice),
          payments: (Array.isArray(payments) ? payments : [])
            .filter((p: any) => clean(p?.status) !== "void")
            .sort((a: any, b: any) => clean(b?.paid_date || b?.paid_at || b?.created_date).localeCompare(clean(a?.paid_date || a?.paid_at || a?.created_date)))
            .map((p: any) => ({
              paid_at: clean(p?.paid_date || p?.paid_at || p?.created_date).slice(0, 10),
              amount: num(p?.amount),
              method: clean(p?.method),
            })),
        });
      }

      // Staff read-only share link (#88): a 'staff_view' link opens exactly one
      // estimate's quote, read-only. Every mutation action below already fails
      // closed on kind !== 'customer', so nothing on this link can write.
      if (clean(link.kind) === "staff_view") {
        const estimate = await Estimate.get(clean(link.record_id)).catch(() => null);
        if (!estimate?.id) throw bad("The linked estimate is no longer available.", 404);
        return Response.json({
          success: true,
          action,
          kind: "staff_view",
          label: clean(link.label),
          expires_at: clean(link.expires_at),
          view_only: true,
          estimate: estimatePortalView(estimate),
        });
      }

      // Account-level link: one call returns the whole customer workspace.
      // Only 'customer' links reach here — an estimate-scoped link must never
      // escalate into the full customer workspace.
      if (clean(link.kind) !== "customer") throw bad("This portal link does not open the customer workspace.", 403);
      const customerId = clean(link.customer_id) || clean(link.record_id);
      const customer = await Customer.get(customerId).catch(() => null);
      const [estimates, orders, invoices, payments, thread, announcements] = await Promise.all([
        Estimate.filter({ customer_id: customerId }).catch(() => []),
        WorkOrder.filter({ customer_id: customerId }).catch(() => []),
        Invoice.filter({ customer_id: customerId }).catch(() => []),
        Payment.filter({ customer_id: customerId }).catch(() => []),
        loadCustomerThread(PortalMessage, customerId, true),
        loadPortalAnnouncements(customerId),
      ]);
      // Company branding from QuoteDefaults so portal quote/invoice views can
      // render the shop logo/name (estimate-level fields override per quote).
      const quoteDefaults = await base44.asServiceRole.entities.QuoteDefaults.filter({ config_name: "default" }).catch(() => []);
      const qd = (Array.isArray(quoteDefaults) ? quoteDefaults : [])[0] || {};
      const companyBranding = { name: clean(qd?.company_name) || "CCS Signage", logo_url: clean(qd?.company_logo_url) };
      const invoiceList = (Array.isArray(invoices) ? invoices : []).filter((i: any) => clean(i?.status) !== "void");
      const paidByInvoice = new Map();
      for (const p of Array.isArray(payments) ? payments : []) {
        if (clean(p?.status) === "void") continue;
        const key = clean(p?.invoice_id);
        if (!paidByInvoice.has(key)) paidByInvoice.set(key, []);
        paidByInvoice.get(key).push({ paid_at: clean(p?.paid_date || p?.paid_at || p?.created_date).slice(0, 10), amount: num(p?.amount), method: clean(p?.method) });
      }
      const viewEstimates = await Promise.all(
        (Array.isArray(estimates) ? estimates : [])
          .filter((e: any) => e?.deleted !== true)
          .map((e: any) => estimatePortalView(e))
      );
      return Response.json({
        success: true,
        action,
        kind: "customer",
        label: clean(link.label),
        expires_at: clean(link.expires_at),
        announcements,
        company: companyBranding,
        customer: {
          name: clean(customer?.name) || clean(customer?.company_name) || clean(link.label) || "Customer",
          contact_name: clean(customer?.contact_name) || [customer?.contact_first_name, customer?.contact_last_name].filter(Boolean).join(" "),
          email: clean(customer?.email) || clean(customer?.contact_email) || clean(customer?.billing_contact_email),
        },
        estimates: viewEstimates,
        jobs: (Array.isArray(orders) ? orders : [])
          .filter((o: any) => o?.deleted !== true)
          .sort((a: any, b: any) => clean(b?.updated_date).localeCompare(clean(a?.updated_date)))
          .slice(0, 50)
          .map(jobPortalView),
        invoices: invoiceList
          .sort((a: any, b: any) => clean(b?.issue_date).localeCompare(clean(a?.issue_date)))
          .map(invoicePortalView),
        payments_by_invoice: Object.fromEntries(paidByInvoice),
        messages: thread.slice(-100).map(messageView),
        unread_for_customer: thread.filter((m: any) => clean(m?.author_side) === "staff" && m?.read_by_customer !== true).length,
      });
    }

    if (action === "post_message") {
      const link = await resolveLink(PortalLink, clean(body?.token));
      if (clean(link.kind) !== "customer") throw bad("This portal link cannot send messages.", 403);
      const customerId = clean(link.customer_id) || clean(link.record_id);
      const text = clean(body?.body).slice(0, MESSAGE_MAX);
      if (!text) throw bad("A message is required.");
      const relatedKind = clean(body?.related_kind);
      const relatedId = clean(body?.related_id);
      const relatedLabel = clean(body?.related_label).slice(0, 200);
      // Related records must belong to this customer before they can be referenced.
      if (relatedId) {
        const owned = relatedKind === "invoice"
          ? await Invoice.get(relatedId).then((r: any) => clean(r?.customer_id) === customerId).catch(() => false)
          : relatedKind === "estimate"
            ? await Estimate.get(relatedId).then((r: any) => clean(r?.customer_id) === customerId).catch(() => false)
            : relatedKind === "work_order"
              ? await WorkOrder.get(relatedId).then((r: any) => clean(r?.customer_id) === customerId).catch(() => false)
              : false;
        if (!owned) throw bad("That record cannot be referenced from this portal.", 403);
      }
      // Optional file attachment — the customer uploads via the portal composer;
      // stored server-side via UploadFile so the staff thread shows a download link.
      let attachmentUrl = "";
      const attachmentName = clean(body?.attachment_name).slice(0, 255);
      const attachmentB64 = clean(body?.attachment_base64);
      if (attachmentB64) {
        if (!attachmentName) throw bad("An attached file needs a filename.");
        try {
          const file = new File([Uint8Array.from(atob(attachmentB64), (c) => c.charCodeAt(0))], attachmentName, { type: clean(body?.attachment_mime) || "application/octet-stream" });
          const upload = await base44.asServiceRole.integrations.Core.UploadFile({ file });
          attachmentUrl = clean(upload?.file_url || upload?.url);
        } catch (uploadError) {
          throw bad(`The attached file could not be uploaded: ${uploadError?.message || "upload failed"}`);
        }
      }
      const key = `portal-msg:${clean(body?.creation_request_key) || crypto.randomUUID()}`.slice(0, 256);
      const result = await createFoundationRecordWithRecovery({
        entity: PortalMessage,
        data: {
          creation_request_key: key,
          customer_id: customerId,
          portal_link_id: clean(link.id),
          author_side: "customer",
          author_name: clean(body?.author_name).slice(0, 120) || "Customer",
          kind: "message",
          body: text,
          attachment_name: attachmentName,
          attachment_url: attachmentUrl,
          attachment_mime: clean(body?.attachment_mime),
          related_kind: ["estimate", "invoice", "work_order"].includes(relatedKind) ? relatedKind : "none",
          related_id: relatedId,
          related_label: relatedLabel,
          read_by_staff: false,
          read_by_customer: true,
        },
        readMatches: () => PortalMessage.filter({ creation_request_key: key }),
        label: "Portal customer message",
      });
      return Response.json({ success: true, action, message: messageView(result.record) });
    }

    if (action === "estimate_respond") {
      const link = await resolveLink(PortalLink, clean(body?.token));
      if (clean(link.kind) !== "customer") throw bad("This portal link cannot respond to quotes.", 403);
      const customerId = clean(link.customer_id) || clean(link.record_id);
      const estimateId = clean(body?.estimate_id);
      const decision = clean(body?.decision);
      const sectionKey = clean(body?.section_key);
      const estimate = await Estimate.get(estimateId).catch(() => null);
      if (!estimate?.id || clean(estimate.customer_id) !== customerId) throw bad("Quote not found.", 404);
      if (sectionKey) {
        if (clean(estimate.status) !== "sent") throw bad(`This quote is ${clean(estimate.status) || "not awaiting response"} — only sent quotes can receive section responses.`, 409);
        if (!["accepted", "rejected", "question"].includes(decision)) throw bad("section decision must be accepted, rejected, or question.");
        const sectionNote = clean(body?.note).slice(0, MESSAGE_MAX);
        const sectionLabel = clean(body?.section_label).slice(0, 200);
        const quoteVersion = Math.max(1, whole(estimate?.quote_version, 1));
        const sectionItem = (Array.isArray(estimate.line_items) ? estimate.line_items : []).find((i: any) => clean(i?.key || i?.id) === sectionKey);
        const SectionAcceptance = base44.asServiceRole.entities.EstimateSectionAcceptance;
        const secKey = `portal-sec-resp:${estimateId}:${sectionKey}:${clean(body?.creation_request_key) || crypto.randomUUID()}`.slice(0, 256);
        await createFoundationRecordWithRecovery({
          entity: SectionAcceptance,
          data: {
            estimate_id: estimateId,
            quote_issue_key: `estimate:${estimateId}:quote:v${quoteVersion}`,
            quote_version: quoteVersion,
            section_key: sectionKey,
            section_label: sectionLabel || clean(sectionItem?.client_product_name) || clean(sectionItem?.project_name),
            section_module: clean(sectionItem?.module) || clean(sectionItem?.template_type),
            section_quote_total: num(sectionItem?.customer_price_total ?? sectionItem?.total_price),
            decision,
            note: sectionNote,
            decided_at: new Date().toISOString(),
            decided_by_name: clean(estimate?.order_contact) || clean(estimate?.contact_name),
            decided_by_email: clean(estimate?.contact_email),
            method: "portal",
            delivery_id: "",
            creation_request_key: secKey,
          },
          readMatches: () => SectionAcceptance.filter({ creation_request_key: secKey }),
          label: "Portal section decision",
        });
        const secMsgKey = `portal-sec-msg:${estimateId}:${sectionKey}:${clean(body?.creation_request_key) || crypto.randomUUID()}`.slice(0, 256);
        await createFoundationRecordWithRecovery({
          entity: PortalMessage,
          data: {
            creation_request_key: secMsgKey,
            customer_id: customerId,
            portal_link_id: clean(link.id),
            author_side: "customer",
            kind: decision === "accepted" ? "estimate_approved" : decision === "rejected" ? "estimate_revision" : "estimate_revision",
            body: sectionNote || `${decision === "accepted" ? "Accepted" : decision === "rejected" ? "Declined" : "Asked about"} section “${sectionLabel || sectionKey}”.`,
            related_kind: "estimate",
            related_id: estimateId,
            related_label: clean(estimate.estimate_number) || clean(estimate.quote_title) || "Quote",
            read_by_staff: false,
            read_by_customer: true,
          },
          readMatches: () => PortalMessage.filter({ creation_request_key: secMsgKey }),
          label: "Portal section message",
        });
        return ok({ responded: true, decision, section_key: sectionKey });
      }
      if (!["approve", "request_changes", "declined"].includes(decision)) throw bad("decision must be approve, request_changes, or declined.");
      const note = clean(body?.note).slice(0, MESSAGE_MAX);
      const quoteLabel = clean(estimate.estimate_number) || clean(estimate.quote_title) || "Quote";
      const key = `portal-est-resp:${estimateId}:${clean(body?.creation_request_key) || crypto.randomUUID()}`.slice(0, 256);

      if (decision === "approve") {
        // Expired-quote gate: portal approval is disabled past the quote's
        // validity window — the customer should request a revised quote.
        const quoteExp = quoteValidUntil(estimate);
        if (quoteExp && quoteExp < new Date().toISOString().slice(0, 10)) {
          throw bad("This quote has expired — please request an updated quote.", 409);
        }
        if (clean(estimate.status) !== "sent") {
          throw bad(`This quote is ${clean(estimate.status) || "not awaiting response"} — only sent quotes can be approved.`, 409);
        }
        const saved = await replaceFoundationFieldsIfUnchanged({
          entity: Estimate,
          recordId: estimateId,
          expectedFields: expectedFoundationFields(estimate, { status: "approved" }),
          nextFields: { status: "approved" },
          label: "Portal estimate approval",
        });
        const msg = await createFoundationRecordWithRecovery({
          entity: PortalMessage,
          data: {
            creation_request_key: key,
            customer_id: customerId,
            portal_link_id: clean(link.id),
            author_side: "customer",
            kind: "estimate_approved",
            body: note || `Approved ${quoteLabel}.`,
            related_kind: "estimate",
            related_id: estimateId,
            related_label: quoteLabel,
            read_by_staff: false,
            read_by_customer: true,
          },
          readMatches: () => PortalMessage.filter({ creation_request_key: key }),
          label: "Portal estimate approval message",
        });
        // Immutable acceptance audit so portal approvals carry the same
        // evidence trail as staff-recorded acceptances
        // (recordEstimateAcceptance). Deduped by estimate+version; an existing
        // canonical row is never modified or duplicated.
        const Acceptance = base44.asServiceRole.entities.EstimateAcceptance;
        const quoteVersion = Math.max(1, whole(saved?.quote_version ?? estimate?.quote_version, 1));
        const existingAcceptance = await Acceptance.filter({ estimate_id: estimateId, quote_version: quoteVersion }).catch(() => []);
        if (!Array.isArray(existingAcceptance) || existingAcceptance.length === 0) {
          try {
            await Acceptance.create({
              estimate_id: estimateId,
              work_order_id: clean(saved?.work_order_id || estimate?.work_order_id),
              delivery_id: "",
              quote_issue_key: `estimate:${estimateId}:quote:v${quoteVersion}`,
              quote_version: quoteVersion,
              quote_issue_date: clean(estimate?.quote_issue_date),
              quote_expiration_date: quoteValidUntil(estimate),
              quote_total: num(saved?.quote_total ?? estimate?.quote_total),
              accepted_at: new Date().toISOString(),
              accepted_by_name: clean(estimate?.order_contact) || clean(estimate?.contact_name),
              accepted_by_email: clean(estimate?.contact_email),
              acceptance_method: "portal",
              evidence_reference: "Customer portal approval",
              notes: note || `Customer approved ${quoteLabel} via the customer portal.`,
              recorded_by_email: "customer_portal",
              recorded_by_name: "Customer Portal",
            });
          } catch (acceptanceError: any) {
            console.error("Portal approval saved but its acceptance audit failed:", acceptanceError?.message || acceptanceError);
          }
        }
        logPortalOpportunityActivity(OpportunityActivity, {
          opportunityId: await opportunityIdForEstimate(estimateId),
          eventType: "note",
          summary: `Customer approved ${quoteLabel} via the portal`,
          details: { estimate_id: estimateId, quote_total: num(estimate.quote_total), source: "customer_portal" },
          key: `portal-act:approve:${estimateId}:${clean(msg.record?.id) || key}`,
        });
        return Response.json({ success: true, action, estimate: await estimatePortalView(saved), message: messageView(msg.record) });
      }

      if (decision === "declined") {
        // Customer declined the whole quote — CAS the estimate to cancelled
        // and leave the decline reason + a staff follow-up task so the loss is
        // never silent. Staff can still reopen via a new revision.
        const declineReason = clean(body?.note).slice(0, MESSAGE_MAX);
        if (!declineReason) throw bad("Please tell us why the quote was declined.");
        if (clean(estimate.status) !== "sent") {
          throw bad(`This quote is ${clean(estimate.status) || "not awaiting response"} — only sent quotes can be declined.`, 409);
        }
        const saved = await replaceFoundationFieldsIfUnchanged({
          entity: Estimate,
          recordId: estimateId,
          expectedFields: expectedFoundationFields(estimate, { status: "cancelled" }),
          nextFields: { status: "cancelled" },
          label: "Portal estimate decline",
        });
        const msg = await createFoundationRecordWithRecovery({
          entity: PortalMessage,
          data: {
            creation_request_key: key,
            customer_id: customerId,
            portal_link_id: clean(link.id),
            author_side: "customer",
            kind: "estimate_revision",
            body: `Declined ${quoteLabel}: ${declineReason}`,
            related_kind: "estimate",
            related_id: estimateId,
            related_label: quoteLabel,
            read_by_staff: false,
            read_by_customer: true,
          },
          readMatches: () => PortalMessage.filter({ creation_request_key: key }),
          label: "Portal decline message",
        });
        try {
          await createFoundationRecordWithRecovery({
            entity: EstimatingRequest,
            data: {
              creation_request_key: `portal-decline-request:${estimateId}:${clean(msg.record?.id) || key}`,
              estimate_id: estimateId,
              opportunity_id: await opportunityIdForEstimate(estimateId),
              status: "open",
              description: `Customer declined ${quoteLabel} via the portal: ${declineReason.slice(0, 500)}`,
            },
            readMatches: () => EstimatingRequest.filter({ creation_request_key: `portal-decline-request:${estimateId}:${clean(msg.record?.id) || key}` }),
            label: "Portal decline follow-up task",
          });
        } catch (reqError: any) {
          console.error("Portal decline message saved but its queue task failed:", reqError?.message || reqError);
        }
        logPortalOpportunityActivity(OpportunityActivity, {
          opportunityId: await opportunityIdForEstimate(estimateId),
          eventType: "note",
          summary: `Customer declined ${quoteLabel} via the portal`,
          details: { estimate_id: estimateId, note_preview: declineReason.slice(0, 240), source: "customer_portal" },
          key: `portal-act:decline:${estimateId}:${clean(msg.record?.id) || key}`,
        });
        return Response.json({ success: true, action, estimate: await estimatePortalView(saved), message: messageView(msg.record) });
      }

      if (!note) throw bad("Please describe the changes you'd like so we can revise the quote.");
      const msg = await createFoundationRecordWithRecovery({
        entity: PortalMessage,
        data: {
          creation_request_key: key,
          customer_id: customerId,
          portal_link_id: clean(link.id),
          author_side: "customer",
          kind: "estimate_revision_requested",
          body: note,
          related_kind: "estimate",
          related_id: estimateId,
          related_label: quoteLabel,
          read_by_staff: false,
          read_by_customer: true,
        },
        readMatches: () => PortalMessage.filter({ creation_request_key: key }),
        label: "Portal revision request",
      });
      // Revision request task: an open EstimatingRequest row puts the
      // customer's change request on the estimator queue (not just the message
      // thread), keyed idempotently on the portal message.
      try {
        await createFoundationRecordWithRecovery({
          entity: EstimatingRequest,
          data: {
            creation_request_key: `portal-rev-request:${estimateId}:${clean(msg.record?.id) || key}`,
            estimate_id: estimateId,
            opportunity_id: await opportunityIdForEstimate(estimateId),
            status: "open",
            description: `Customer requested revisions via the portal: ${note.slice(0, 500)}`,
          },
          readMatches: () => EstimatingRequest.filter({ creation_request_key: `portal-rev-request:${estimateId}:${clean(msg.record?.id) || key}` }),
          label: "Portal revision request task",
        });
      } catch (reqError: any) {
        console.error("Portal revision request message saved but its queue task failed:", reqError?.message || reqError);
      }
      logPortalOpportunityActivity(OpportunityActivity, {
        opportunityId: await opportunityIdForEstimate(estimateId),
        eventType: "note",
        summary: `Customer requested revisions on ${quoteLabel} via the portal`,
        details: { estimate_id: estimateId, note_preview: note.slice(0, 240), source: "customer_portal" },
        key: `portal-act:revise:${estimateId}:${clean(msg.record?.id) || key}`,
      });
      return Response.json({ success: true, action, estimate: await estimatePortalView(estimate), message: messageView(msg.record) });
    }

    if (action === "payment_notice") {
      const link = await resolveLink(PortalLink, clean(body?.token));
      if (clean(link.kind) !== "customer") throw bad("This portal link cannot send payment notices.", 403);
      const customerId = clean(link.customer_id) || clean(link.record_id);
      const invoiceId = clean(body?.invoice_id);
      const invoice = await Invoice.get(invoiceId).catch(() => null);
      if (!invoice?.id || clean(invoice.customer_id) !== customerId) throw bad("Invoice not found.", 404);
      const note = clean(body?.note).slice(0, MESSAGE_MAX);
      const method = clean(body?.method).slice(0, 60) || "payment";
      const invLabel = clean(invoice.invoice_number) || "Invoice";
      const key = `portal-pay-notice:${invoiceId}:${clean(body?.creation_request_key) || crypto.randomUUID()}`.slice(0, 256);
      const msg = await createFoundationRecordWithRecovery({
        entity: PortalMessage,
        data: {
          creation_request_key: key,
          customer_id: customerId,
          portal_link_id: clean(link.id),
          author_side: "customer",
          kind: "payment_notice",
          body: note || `Payment for ${invLabel} is on the way (${method}).`,
          related_kind: "invoice",
          related_id: invoiceId,
          related_label: invLabel,
          read_by_staff: false,
          read_by_customer: true,
        },
        readMatches: () => PortalMessage.filter({ creation_request_key: key }),
        label: "Portal payment notice",
      });
      logPortalOpportunityActivity(OpportunityActivity, {
        opportunityId: clean(invoice.opportunity_id),
        eventType: "note",
        summary: `Customer sent a payment notice for ${invLabel} via the portal`,
        details: { invoice_id: invoiceId, method_planned: method, source: "customer_portal" },
        key: `portal-act:paynotice:${invoiceId}:${clean(msg.record?.id) || key}`,
      });
      return Response.json({ success: true, action, message: messageView(msg.record) });
    }

    if (action === "request_job_revision") {
      const link = await resolveLink(PortalLink, clean(body?.token));
      if (clean(link.kind) !== "customer") throw bad("This portal link cannot request job changes.", 403);
      const customerId = clean(link.customer_id) || clean(link.record_id);
      const workOrderId = clean(body?.work_order_id);
      const note = clean(body?.note).slice(0, MESSAGE_MAX);
      if (!note) throw bad("Describe the change you'd like so the team can scope it.");
      const order = await WorkOrder.get(workOrderId).catch(() => null);
      if (!order?.id || clean(order.customer_id) !== customerId) throw bad("Job not found.", 404);
      if (order.deleted === true || ["cancelled", "completed"].includes(clean(order.current_stage)) || clean(order.sales_status) === "cancelled") throw bad("This job is no longer active.", 409);
      const woLabel = clean(order.est_inv_at || order.work_order_number) || clean(order.title) || "Job";

      // Draft a proposed change order so the request lands in the CO queue.
      const coRows = await ChangeOrder.filter({}).catch(() => []);
      let seq = (Array.isArray(coRows) ? coRows.length : 0) + 1001;
      const taken = new Set((Array.isArray(coRows) ? coRows : []).map((r: any) => clean(r?.change_order_number)));
      while (taken.has(`CO-${seq}`)) seq += 1;
      const coKey = `portal-co:${workOrderId}:${clean(body?.creation_request_key) || crypto.randomUUID()}`.slice(0, 256);
      const co = await createFoundationRecordWithRecovery({
        entity: ChangeOrder,
        data: {
          creation_request_key: coKey,
          change_order_number: `CO-${seq}`,
          status: "proposed",
          title: `Customer revision request — ${woLabel}`,
          description: note,
          reason: "Customer request via portal",
          customer_id: customerId,
          customer_display_name: clean(link.label),
          opportunity_id: clean(order.opportunity_id),
          estimate_id: clean(order.estimate_id),
          work_order_id: workOrderId,
          line_items: [],
          amount_delta: 0,
          proposed_by: "customer_portal",
          proposed_at: new Date().toISOString(),
          source_summary: { source: "customer_portal" },
        },
        readMatches: () => ChangeOrder.filter({ creation_request_key: coKey }),
        label: "Portal change order",
      });
      const coNumber = clean(co.record?.change_order_number) || `CO-${seq}`;

      const key = `portal-job-rev:${workOrderId}:${clean(body?.creation_request_key) || crypto.randomUUID()}`.slice(0, 256);
      const msg = await createFoundationRecordWithRecovery({
        entity: PortalMessage,
        data: {
          creation_request_key: key,
          customer_id: customerId,
          portal_link_id: clean(link.id),
          author_side: "customer",
          kind: "job_revision_requested",
          body: note,
          related_kind: "work_order",
          related_id: workOrderId,
          related_label: `${woLabel} · ${coNumber}`,
          read_by_staff: false,
          read_by_customer: true,
        },
        readMatches: () => PortalMessage.filter({ creation_request_key: key }),
        label: "Portal job revision request",
      });
      logPortalOpportunityActivity(OpportunityActivity, {
        opportunityId: clean(order.opportunity_id),
        eventType: "note",
        summary: `Customer requested changes on ${woLabel} via the portal (${coNumber} drafted)`,
        details: { work_order_id: workOrderId, change_order_id: clean(co.record?.id), note_preview: note.slice(0, 240), source: "customer_portal" },
        key: `portal-act:jobrev:${workOrderId}:${clean(msg.record?.id) || key}`,
      });
      return Response.json({ success: true, action, change_order_number: coNumber, message: messageView(msg.record) });
    }

    // ---------- Staff actions (session-authenticated) ----------

    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email) || clean(user?.id) || "unknown";
    const actorName = clean(user?.full_name) || clean(user?.name) || actor;

    if (action === "mark_all_read") {
      const rows = await PortalMessage.filter({ author_side: "customer", read_by_staff: false }).catch(() => []);
      const list = Array.isArray(rows) ? rows : [];
      let marked = 0;
      for (const m of list.slice(0, 500)) {
        const saved = await replaceFoundationFieldsIfUnchanged({
          entity: PortalMessage,
          recordId: clean(m?.id),
          expectedFields: expectedFoundationFields(m, { read_by_staff: true }),
          nextFields: { read_by_staff: true },
          label: "Portal staff mark-all-read",
        }).catch(() => null);
        if (saved) marked += 1;
      }      return Response.json({ success: true, action, marked });
    }

    if (action === "create_link") {
      const kind = clean(body?.kind) || "invoice";
      const recordId = kind === "customer" ? clean(body?.customer_id) : kind === "staff_view" ? clean(body?.estimate_id) : clean(body?.invoice_id);
      if (!["invoice", "customer", "staff_view"].includes(kind)) throw bad("kind must be invoice, customer, or staff_view.");
      if (!recordId) throw bad(`${kind === "customer" ? "customer_id" : kind === "staff_view" ? "estimate_id" : "invoice_id"} is required.`);
      let customerId = "";
      let label = clean(body?.label);
      if (kind === "staff_view") {
        const estimate = await Estimate.get(recordId).catch(() => null);
        if (!estimate?.id) throw bad("Estimate not found.", 404);
        customerId = clean(estimate.customer_id);
        label = label || `Shared view ${clean(estimate.estimate_number) || recordId}`;
      } else if (kind === "invoice") {
        const invoice = await Invoice.get(recordId).catch(() => null);
        if (!invoice?.id) throw bad("Invoice not found.", 404);
        customerId = clean(invoice.customer_id);
        label = label || `Invoice ${clean(invoice.invoice_number) || recordId}`;
      } else {
        const customer = await Customer.get(recordId).catch(() => null);
        if (!customer?.id) throw bad("Customer not found.", 404);
        customerId = recordId;
        label = label || (clean(customer.name) || clean(customer.company_name) || "Customer portal");
      }
      const existing = await PortalLink.filter({ kind, record_id: recordId }).catch(() => []);
      const active = (Array.isArray(existing) ? existing : []).find(linkIsUsable);
      if (active) {
        await auditPortalLink(base44, actor, "portal_link_reuse", active, "create_link returned existing link;");
        return Response.json({ success: true, action, link: linkForCaller(user, active), token: tokenForCaller(user, active.token), reused: true });
      }
      const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
      const key = `portal-link:${kind}:${recordId}:${clean(body?.creation_request_key) || String(Date.now())}`.slice(0, 256);
      const result = await createFoundationRecordWithRecovery({
        entity: PortalLink,
        data: {
          creation_request_key: key,
          token,
          kind,
          record_id: recordId,
          customer_id: customerId,
          label,
          created_by: actor,
          expires_at: linkExpiry(linkDays(body)),
          revoked: false,
          open_count: 0,
        },
        readMatches: () => PortalLink.filter({ creation_request_key: key }),
        label: "Customer portal link",
      });
      const link = result.record;
      await auditPortalLink(base44, actor, "portal_link_create", link, `create_link status=${result.status};`);
      return Response.json({
        success: true,
        action,
        link: linkForCaller(user, link),
        token: tokenForCaller(user, linkIsUsable(link) ? link.token : token),
        reused: result.status !== "created",
      });
    }

    if (action === "revoke_link") {
      const linkId = clean(body?.link_id);
      if (!linkId) throw bad("link_id is required.");
      const current = await PortalLink.get(linkId).catch(() => null);
      if (!current?.id) throw bad("Portal link not found.", 404);
      if (current.revoked === true) {
        return Response.json({ success: true, action, link: current, reused: true });
      }
      const saved = await replaceFoundationFieldsIfUnchanged({
        entity: PortalLink,
        recordId: linkId,
        expectedFields: expectedFoundationFields(current, { revoked: true }),
        nextFields: { revoked: true, revoked_at: new Date().toISOString() },
        label: "Portal link revocation",
      });
      return Response.json({ success: true, action, link: saved });
    }

    if (action === "list_links") {
      const invoiceId = clean(body?.invoice_id);
      const customerId = clean(body?.customer_id);
      const filter: any = {};
      if (invoiceId) { filter.kind = "invoice"; filter.record_id = invoiceId; }
      else if (customerId) { filter.customer_id = customerId; }
      else throw bad("invoice_id or customer_id is required.");
      const rows = await PortalLink.filter(filter).catch(() => []);
      return Response.json({
        success: true,
        action,
        links: (Array.isArray(rows) ? rows : [])
          .sort((a: any, b: any) => clean(b?.created_date).localeCompare(clean(a?.created_date)))
          .map((l: any) => ({
            id: clean(l?.id),
            kind: clean(l?.kind),
            record_id: clean(l?.record_id),
            label: clean(l?.label),
            token: tokenForCaller(user, l?.token),
            revoked: l?.revoked === true,
            usable: linkIsUsable(l),
            expires_at: clean(l?.expires_at),
            open_count: num(l?.open_count),
            last_opened_at: clean(l?.last_opened_at),
            created_by: clean(l?.created_by),
          })),
      });
    }

    if (action === "list_thread") {
      const customerId = clean(body?.customer_id);
      if (!customerId) throw bad("customer_id is required.");
      const thread = await loadCustomerThread(PortalMessage, customerId);
      // Mark inbound customer messages as read by staff on view.
      for (const m of thread) {
        if (clean(m?.author_side) === "customer" && m?.read_by_staff !== true) {
          replaceFoundationFieldsIfUnchanged({
            entity: PortalMessage,
            recordId: clean(m.id),
            expectedFields: expectedFoundationFields(m, { read_by_staff: true }),
            nextFields: { read_by_staff: true },
            label: "Portal staff read receipt",
          }).catch(() => null);
          m.read_by_staff = true;
        }
      }
      const links = await PortalLink.filter({ customer_id: customerId }).catch(() => []);
      return Response.json({
        success: true,
        action,
        messages: thread.slice(-200).map(messageView),
        links: (Array.isArray(links) ? links : []).map((l: any) => ({
          id: clean(l?.id), kind: clean(l?.kind), label: clean(l?.label), token: tokenForCaller(user, l?.token),
          usable: linkIsUsable(l), revoked: l?.revoked === true, open_count: num(l?.open_count),
          last_opened_at: clean(l?.last_opened_at), expires_at: clean(l?.expires_at),
        })),
      });
    }

    if (action === "reply_message") {
      const customerId = clean(body?.customer_id);
      const text = clean(body?.body).slice(0, MESSAGE_MAX);
      if (!customerId) throw bad("customer_id is required.");
      if (!text) throw bad("A message is required.");
      const relatedKind = clean(body?.related_kind);
      const key = `portal-staff-msg:${clean(body?.creation_request_key) || crypto.randomUUID()}`.slice(0, 256);
      const result = await createFoundationRecordWithRecovery({
        entity: PortalMessage,
        data: {
          creation_request_key: key,
          customer_id: customerId,
          author_side: "staff",
          author_name: actorName,
          author_email: actor,
          kind: "message",
          body: text,
          related_kind: ["estimate", "invoice", "work_order"].includes(relatedKind) ? relatedKind : "none",
          related_id: clean(body?.related_id),
          related_label: clean(body?.related_label).slice(0, 200),
          read_by_staff: true,
          read_by_customer: false,
        },
        readMatches: () => PortalMessage.filter({ creation_request_key: key }),
        label: "Portal staff reply",
      });
      return Response.json({ success: true, action, message: messageView(result.record) });
    }

    if (action === "email_link") {
      const customerId = clean(body?.customer_id);
      if (!customerId) throw bad("customer_id is required.");
      const customer = await Customer.get(customerId).catch(() => null);
      if (!customer?.id) throw bad("Customer not found.", 404);
      const onFile = customerEmailsOnFile(customer);
      if (!onFile.length) throw bad("This customer has no email address on file — add one to the customer record first.");
      const requested = clean(body?.email);
      const to = requested ? onFile.find((e) => e.toLowerCase() === requested.toLowerCase()) : onFile[0];
      if (!to) throw bad("Portal links can only be emailed to an address on the customer record.", 403);
      const portalBase = trustedPortalBase(body?.portal_base);

      const existing = await PortalLink.filter({ kind: "customer", record_id: customerId }).catch(() => []);
      let link = (Array.isArray(existing) ? existing : []).find(linkIsUsable);
      if (!link) {
        const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
        const key = `portal-link:customer:${customerId}:${clean(body?.creation_request_key) || String(Date.now())}`.slice(0, 256);
        const created = await createFoundationRecordWithRecovery({
          entity: PortalLink,
          data: {
            creation_request_key: key,
            token,
            kind: "customer",
            record_id: customerId,
            customer_id: customerId,
            label: clean(customer.name) || clean(customer.company_name) || "Customer portal",
            created_by: actor,
            expires_at: linkExpiry(linkDays(body)),
            revoked: false,
            open_count: 0,
          },
          readMatches: () => PortalLink.filter({ creation_request_key: key }),
          label: "Customer portal link",
        });
        link = created.record;
        await auditPortalLink(base44, actor, "portal_link_create", link, `email_link status=${created.status};`);
      }
      const portalToken = linkIsUsable(link) ? clean(link.token) : "";
      if (!portalToken) throw bad("A usable portal link could not be created.");
      const url = `${portalBase}/customerportal?token=${encodeURIComponent(portalToken)}`;
      const customerName = [clean(customer.contact_first_name), clean(customer.contact_last_name)].filter(Boolean).join(" ") || clean(customer.contact_name) || clean(customer.name) || clean(customer.company_name) || "there";
      const companyName = clean(body?.company_name).slice(0, 120) || "CCS Signage";
      const companyHtml = escapeHtml(companyName);
      const urlHtml = escapeHtml(url);
      const subject = `${companyName.replace(/[\r\n]+/g, " ")} — your customer portal link`;
      const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
        <h2 style="color:#1d4ed8;margin-bottom:4px">${companyHtml} Customer Portal</h2>
        <p style="margin-top:0;color:#64748b;font-size:13px">Quotes · job tracking · invoices · messages</p>
        <p>Hi ${escapeHtml(customerName)},</p>
        <p>You now have a secure portal where you can:</p>
        <ul style="line-height:1.7;padding-left:20px">
          <li>Review and <strong>approve quotes</strong>, or request changes</li>
          <li>Track your <strong>jobs</strong> and install dates</li>
          <li>View <strong>invoices</strong>, payments, and your open balance</li>
          <li>Message our team — replies land right in the portal</li>
        </ul>
        <p style="text-align:center;margin:28px 0">
          <a href="${urlHtml}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Open your portal</a>
        </p>
        <p style="font-size:12px;color:#64748b">No account or password needed — this link is yours alone and works for ${linkDays(body)} days. Bookmark it or keep this email.</p>
        <p style="font-size:12px;color:#94a3b8">If the button does not work, paste this into your browser:<br><span style="word-break:break-all">${urlHtml}</span></p>
      </div>`;
      const sent = await base44.asServiceRole.functions
        .invoke("sendGmail", { to, subject, body: html, _workflow_capability: "ccs-sendGmail-internal-svc-cap-791d5baab4d78cfc" })
        .catch((e: any) => ({ data: { error: e?.message || String(e) } }));
      const sendResult = sent?.data || sent;
      if (sendResult?.error || sendResult?.success === false) {
        throw bad(`Portal email could not be sent: ${sendResult?.error || "sendGmail failed"}`);
      }
      const msgKey = `portal-email-note:${customerId}:${crypto.randomUUID()}`.slice(0, 256);
      await createFoundationRecordWithRecovery({
        entity: PortalMessage,
        data: {
          creation_request_key: msgKey,
          customer_id: customerId,
          author_side: "staff",
          author_name: "System",
          author_email: actor,
          kind: "message",
          body: `Portal link emailed to ${to} by ${actorName}.`,
          related_kind: "none",
          related_id: "",
          related_label: "",
          read_by_staff: true,
          read_by_customer: true,
        },
        readMatches: () => PortalMessage.filter({ creation_request_key: msgKey }),
        label: "Portal email notice",
      }).catch(() => null);
      await auditPortalLink(base44, actor, "portal_link_email", link, `emailed to ${to};`);
      return Response.json({ success: true, action, sent_to: to, link: linkForCaller(user, link) });
    }

    if (action === "portal_inbox") {
      const rows = await PortalMessage.filter({ read_by_staff: false }).catch(() => []);
      const unread = (Array.isArray(rows) ? rows : []).filter((m: any) => clean(m?.author_side) === "customer");
      const byCustomer = new Map();
      for (const m of unread) {
        const key = clean(m?.customer_id);
        const entry = byCustomer.get(key) || { customer_id: key, unread: 0, latest: null };
        entry.unread += 1;
        if (!entry.latest || clean(m?.created_date) > clean(entry.latest?.created_date)) entry.latest = m;
        byCustomer.set(key, entry);
      }
      const customers = [];
      for (const entry of byCustomer.values()) {
        const customer = await Customer.get(entry.customer_id).catch(() => null);
        customers.push({
          customer_id: entry.customer_id,
          customer_name: clean(customer?.name) || clean(customer?.company_name) || entry.customer_id,
          unread: entry.unread,
          latest_kind: clean(entry.latest?.kind),
          latest_body: clean(entry.latest?.body).slice(0, 140),
          latest_at: clean(entry.latest?.created_date),
        });
      }
      customers.sort((a: any, b: any) => b.latest_at.localeCompare(a.latest_at));
      return Response.json({ success: true, action, customers });
    }

    throw bad(`Unsupported customer portal action: ${action}`);
  } catch (error: any) {
    const status = Number(error?.status || error?.statusCode || 500);
    const safeStatus = [400, 401, 403, 404, 409, 423, 503].includes(status) ? status : 500;
    console.error("customerPortalAction error:", error?.message || error);
    return Response.json({
      success: false,
      error: clean(error?.message || "Customer portal action failed."),
    }, { status: safeStatus });
  }
});