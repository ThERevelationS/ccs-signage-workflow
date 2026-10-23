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
const money = (value: number) => Math.round(value * 100) / 100;

const bad = (message: string, status = 400) => {
  const error: any = new Error(message);
  error.status = status;
  return error;
};

const LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function linkIsUsable(link: any) {
  if (!link?.id || link.revoked === true) return false;
  const expiresAt = Date.parse(clean(link.expires_at));
  return !Number.isFinite(expiresAt) || expiresAt > Date.now();
}

function invoicePortalView(invoice: any) {
  const items = Array.isArray(invoice?.line_items) ? invoice.line_items : [];
  return {
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action);
    if (!action) throw bad("An action is required.");

    const PortalLink = base44.asServiceRole.entities.CustomerPortalLink;
    const Invoice = base44.asServiceRole.entities.Invoice;
    const Payment = base44.asServiceRole.entities.Payment;

    // Public path: the bearer token is the credential. It only ever returns a
    // sanitized view of the one record the link was issued for.
    if (action === "bootstrap") {
      const token = clean(body?.token);
      if (token.length < 16 || token.length > 128) throw bad("Portal link not recognized.", 404);
      const links = await PortalLink.filter({ token }).catch(() => []);
      const link = (Array.isArray(links) ? links : []).find(linkIsUsable);
      if (!link) throw bad("This portal link is invalid, expired, or revoked.", 404);
      if (clean(link.kind) !== "invoice") throw bad("This portal link is not available.", 404);
      const invoice = await Invoice.get(clean(link.record_id)).catch(() => null);
      if (!invoice?.id) throw bad("The linked record is no longer available.", 404);
      const payments = await Payment.filter({ invoice_id: clean(invoice.id) }).catch(() => []);
      replaceFoundationFieldsIfUnchanged({
        entity: PortalLink,
        recordId: clean(link.id),
        expectedFields: expectedFoundationFields(link, { open_count: link.open_count ?? 0 }),
        nextFields: { open_count: num(link.open_count) + 1, last_opened_at: new Date().toISOString() },
        label: "Portal link open tracking",
      }).catch(() => null);
      return Response.json({
        success: true,
        action,
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

    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email) || clean(user?.id) || "unknown";

    if (action === "create_link") {
      const invoiceId = clean(body?.invoice_id);
      if (!invoiceId) throw bad("invoice_id is required.");
      const invoice = await Invoice.get(invoiceId).catch(() => null);
      if (!invoice?.id) throw bad("Invoice not found.", 404);
      const existing = await PortalLink.filter({ kind: "invoice", record_id: invoiceId }).catch(() => []);
      const active = (Array.isArray(existing) ? existing : []).find(linkIsUsable);
      if (active) {
        return Response.json({ success: true, action, link: active, token: clean(active.token), reused: true });
      }
      const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
      const now = Date.now();
      const key = `portal-link:${invoiceId}:${clean(body?.creation_request_key) || String(now)}`.slice(0, 256);
      const result = await createFoundationRecordWithRecovery({
        entity: PortalLink,
        data: {
          creation_request_key: key,
          token,
          kind: "invoice",
          record_id: invoiceId,
          customer_id: clean(invoice.customer_id),
          label: clean(body?.label) || `Invoice ${clean(invoice.invoice_number) || invoiceId}`,
          created_by: actor,
          expires_at: new Date(now + LINK_TTL_MS).toISOString(),
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
      if (!invoiceId) throw bad("invoice_id is required.");
      const rows = await PortalLink.filter({ kind: "invoice", record_id: invoiceId }).catch(() => []);
      return Response.json({
        success: true,
        action,
        links: (Array.isArray(rows) ? rows : [])
          .sort((a: any, b: any) => clean(b?.created_date).localeCompare(clean(a?.created_date)))
          .map((l: any) => ({
            id: clean(l?.id),
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
