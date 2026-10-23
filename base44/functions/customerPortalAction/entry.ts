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

const bad = (message: string, status = 400) => {
  const error: any = new Error(message);
  error.status = status;
  return error;
};

const LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MESSAGE_MAX = 4000;

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
    description: clean(invoice?.description),
    line_items: items.map((item: any) => ({
      description: clean(item?.description),
      quantity: num(item?.quantity),
      unit_price: num(item?.unit_price),
      amount: num(item?.amount),
    })),
    subtotal: num(invoice?.subtotal),
    tax: num(invoice?.tax),
    total: num(invoice?.total),
    amount_paid: num(invoice?.amount_paid),
    balance_due: num(invoice?.balance_due),
  };
}

function estimatePortalView(estimate: any) {
  return {
    id: clean(estimate?.id),
    estimate_number: clean(estimate?.estimate_number),
    quote_title: clean(estimate?.quote_title) || clean(estimate?.project_name),
    project_name: clean(estimate?.project_name),
    status: clean(estimate?.status),
    contact_name: clean(estimate?.contact_name),
    po_number: clean(estimate?.po_number),
    quote_total: num(estimate?.quote_total),
    quote_valid_days: num(estimate?.quote_valid_days),
    updated_date: clean(estimate?.updated_date),
    can_respond: clean(estimate?.status) === "sent",
  };
}

function jobPortalView(order: any) {
  const tasks = Array.isArray(order?.tasks) ? order.tasks : [];
  const done = tasks.filter((t: any) => t?.completed === true || clean(t?.status) === "completed").length;
  return {
    id: clean(order?.id),
    work_order_number: clean(order?.work_order_number),
    title: clean(order?.title),
    status: clean(order?.status),
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
        return Response.json({
          success: true,
          action,
          kind: "invoice",
          label: clean(link.label),
          expires_at: clean(link.expires_at),
          invoice: invoicePortalView(invoice),
          payments: (Array.isArray(payments) ? payments : [])
            .filter((p: any) => clean(p?.status) !== "void")
            .sort((a: any, b: any) => clean(b?.paid_at || b?.created_date).localeCompare(clean(a?.paid_at || a?.created_date)))
            .map((p: any) => ({
              paid_at: clean(p?.paid_at || p?.created_date).slice(0, 10),
              amount: num(p?.amount),
              method: clean(p?.method),
            })),
        });
      }

      // Account-level link: one call returns the whole customer workspace.
      const customerId = clean(link.customer_id) || clean(link.record_id);
      const customer = await Customer.get(customerId).catch(() => null);
      const [estimates, orders, invoices, payments, thread] = await Promise.all([
        Estimate.filter({ customer_id: customerId }).catch(() => []),
        WorkOrder.filter({ customer_id: customerId }).catch(() => []),
        Invoice.filter({ customer_id: customerId }).catch(() => []),
        Payment.filter({ customer_id: customerId }).catch(() => []),
        loadCustomerThread(PortalMessage, customerId, true),
      ]);
      const invoiceList = (Array.isArray(invoices) ? invoices : []).filter((i: any) => clean(i?.status) !== "void");
      const paidByInvoice = new Map();
      for (const p of Array.isArray(payments) ? payments : []) {
        if (clean(p?.status) === "void") continue;
        const key = clean(p?.invoice_id);
        if (!paidByInvoice.has(key)) paidByInvoice.set(key, []);
        paidByInvoice.get(key).push({ paid_at: clean(p?.paid_at || p?.created_date).slice(0, 10), amount: num(p?.amount), method: clean(p?.method) });
      }
      return Response.json({
        success: true,
        action,
        kind: "customer",
        label: clean(link.label),
        expires_at: clean(link.expires_at),
        customer: {
          name: clean(customer?.name) || clean(customer?.company_name) || clean(link.label) || "Customer",
          contact_name: clean(customer?.contact_name),
          email: clean(customer?.email),
        },
        estimates: (Array.isArray(estimates) ? estimates : [])
          .filter((e: any) => ["sent", "approved"].includes(clean(e?.status)))
          .sort((a: any, b: any) => clean(b?.updated_date).localeCompare(clean(a?.updated_date)))
          .map(estimatePortalView),
        jobs: (Array.isArray(orders) ? orders : [])
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
      if (!["approve", "request_changes"].includes(decision)) throw bad("decision must be approve or request_changes.");
      const estimate = await Estimate.get(estimateId).catch(() => null);
      if (!estimate?.id || clean(estimate.customer_id) !== customerId) throw bad("Quote not found.", 404);
      const note = clean(body?.note).slice(0, MESSAGE_MAX);
      const quoteLabel = clean(estimate.estimate_number) || clean(estimate.quote_title) || "Quote";
      const key = `portal-est-resp:${estimateId}:${clean(body?.creation_request_key) || crypto.randomUUID()}`.slice(0, 256);

      if (decision === "approve") {
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
        logPortalOpportunityActivity(OpportunityActivity, {
          opportunityId: await opportunityIdForEstimate(estimateId),
          eventType: "note",
          summary: `Customer approved ${quoteLabel} via the portal`,
          details: { estimate_id: estimateId, quote_total: num(estimate.quote_total), source: "customer_portal" },
          key: `portal-act:approve:${estimateId}:${clean(msg.record?.id) || key}`,
        });
        return Response.json({ success: true, action, estimate: estimatePortalView(saved), message: messageView(msg.record) });
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
      logPortalOpportunityActivity(OpportunityActivity, {
        opportunityId: await opportunityIdForEstimate(estimateId),
        eventType: "note",
        summary: `Customer requested revisions on ${quoteLabel} via the portal`,
        details: { estimate_id: estimateId, note_preview: note.slice(0, 240), source: "customer_portal" },
        key: `portal-act:revise:${estimateId}:${clean(msg.record?.id) || key}`,
      });
      return Response.json({ success: true, action, estimate: estimatePortalView(estimate), message: messageView(msg.record) });
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

    // ---------- Staff actions (session-authenticated) ----------

    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email) || clean(user?.id) || "unknown";
    const actorName = clean(user?.full_name) || clean(user?.name) || actor;

    if (action === "create_link") {
      const kind = clean(body?.kind) || "invoice";
      const recordId = kind === "customer" ? clean(body?.customer_id) : clean(body?.invoice_id);
      if (!["invoice", "customer"].includes(kind)) throw bad("kind must be invoice or customer.");
      if (!recordId) throw bad(`${kind === "customer" ? "customer_id" : "invoice_id"} is required.`);
      let customerId = "";
      let label = clean(body?.label);
      if (kind === "invoice") {
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
        return Response.json({ success: true, action, link: active, token: clean(active.token), reused: true });
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
          expires_at: new Date(Date.now() + LINK_TTL_MS).toISOString(),
          revoked: false,
          open_count: 0,
        },
        readMatches: () => PortalLink.filter({ creation_request_key: key }),
        label: "Customer portal link",
      });
      const link = result.record;
      return Response.json({
        success: true,
        action,
        link,
        token: linkIsUsable(link) ? clean(link.token) : token,
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
            token: clean(l?.token),
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
          id: clean(l?.id), kind: clean(l?.kind), label: clean(l?.label), token: clean(l?.token),
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
