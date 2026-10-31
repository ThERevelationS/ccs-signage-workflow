import { allocateDocNumber } from '../../shared/docNumberAllocation.ts';
import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";
import { authenticateSignShopSession } from "../../shared/signShopSession.ts";
import {
  createFoundationRecordWithRecovery,
  expectedFoundationFields,
  replaceFoundationFieldsIfUnchanged,
} from "../../shared/opportunityFoundationPersistence.mjs";
import { loadAllEntityRows } from "../../shared/pagedEntityRows.ts";

const clean = (value: any) => String(value ?? "").trim();
const num = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const money = (value: number) => Math.round(value * 100) / 100;

const CO_STATUSES = ["proposed", "approved", "rejected", "applied", "cancelled"];

const EDITABLE_FIELDS = [
  "title", "description", "reason", "customer_id", "customer_display_name",
  "opportunity_id", "estimate_id", "work_order_id", "invoice_id",
  "line_items", "schedule_impact_days", "notes", "internal_notes",
];

const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { statusCode: status });

async function findByCreationKey(entity: any, key: string) {
  const rows = await entity.filter({ creation_request_key: clean(key) });
  if (!Array.isArray(rows)) throw bad("Creation receipt lookup did not return a record list.", 409);
  return rows;
}

function sanitizeLineItems(raw: any) {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) throw bad("line_items must be a list.");
  return raw.map((row: any, i: number) => {
    const description = clean(row?.description);
    const quantity = num(row?.quantity, NaN);
    const unit_price = num(row?.unit_price, NaN);
    if (!description) throw bad(`Line ${i + 1} needs a description.`);
    if (!(quantity !== 0)) throw bad(`Line ${i + 1} needs a non-zero quantity.`);
    if (!Number.isFinite(unit_price)) throw bad(`Line ${i + 1} needs a unit price (negative for credits).`);
    return {
      description,
      quantity: money(quantity),
      unit_price: money(unit_price),
      line_total: money(quantity * unit_price),
    };
  });
}

const amountDelta = (items: any[]) =>
  money((Array.isArray(items) ? items : []).reduce((s, r) => s + money(num(r.quantity) * num(r.unit_price)), 0));

async function nextChangeOrderNumber(ChangeOrder: any, svc: any) {
  return allocateDocNumber({ svc, configName: 'change_order', prefix: 'CO-', seedEntity: ChangeOrder, seedField: 'change_order_number' });
}

function coSnapshot(row: any) {
  return {
    id: clean(row?.id),
    change_order_number: clean(row?.change_order_number),
    status: clean(row?.status),
    title: clean(row?.title),
    customer_display_name: clean(row?.customer_display_name),
    customer_id: clean(row?.customer_id),
    opportunity_id: clean(row?.opportunity_id),
    estimate_id: clean(row?.estimate_id),
    work_order_id: clean(row?.work_order_id),
    invoice_id: clean(row?.invoice_id),
    amount_delta: num(row?.amount_delta),
    schedule_impact_days: num(row?.schedule_impact_days),
    proposed_at: clean(row?.proposed_at || row?.created_date),
    approved_at: clean(row?.approved_at),
    updated_date: clean(row?.updated_date),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email) || clean(user?.id) || "unknown";
    const action = clean(body?.action);
    if (!action) throw bad("An action is required.");

    const ChangeOrder = base44.asServiceRole.entities.ChangeOrder;
    const Customer = base44.asServiceRole.entities.Customer;
    const Estimate = base44.asServiceRole.entities.AllInOneEstimate;
    const WorkOrder = base44.asServiceRole.entities.WorkOrder;
    const Opportunity = base44.asServiceRole.entities.Opportunity;
    const Invoice = base44.asServiceRole.entities.Invoice;

    if (action === "list_change_orders") {
      const status = clean(body?.status);
      if (status && !CO_STATUSES.includes(status)) throw bad("Unknown change order status filter.");
      const query: any = status ? { status } : {};
      for (const key of ["estimate_id", "work_order_id", "opportunity_id", "customer_id"]) {
        const v = clean(body?.[key]);
        if (v) query[key] = v;
      }
      const rows = await loadAllEntityRows({
        entity: ChangeOrder,
        query,
        sort: "-created_date",
        label: "Change order rows",
      });
      if (!Array.isArray(rows)) throw bad("Change order lookup failed.", 500);
      const search = clean(body?.query).toLowerCase();
      const matched = rows
        .filter((r: any) => !search
          || clean(r?.change_order_number).toLowerCase().includes(search)
          || clean(r?.title).toLowerCase().includes(search)
          || clean(r?.customer_display_name).toLowerCase().includes(search))
        .sort((a: any, b: any) => clean(b?.created_date).localeCompare(clean(a?.created_date)));
      const changeOrders = matched.slice(0, 250).map(coSnapshot);
      return Response.json({
        success: true,
        action,
        change_orders: changeOrders,
        total_count: matched.length,
        returned: changeOrders.length,
        truncated: changeOrders.length < matched.length,
      });
    }

    if (action === "get_change_order") {
      const id = clean(body?.change_order_id);
      const changeOrder = await ChangeOrder.get(id).catch(() => null);
      if (!changeOrder?.id) throw bad("Change order not found.", 404);
      const [customer, estimate, workOrder, opportunity, invoice] = await Promise.all([
        clean(changeOrder.customer_id) ? Customer.get(clean(changeOrder.customer_id)).catch(() => null) : null,
        clean(changeOrder.estimate_id) ? Estimate.get(clean(changeOrder.estimate_id)).catch(() => null) : null,
        clean(changeOrder.work_order_id) ? WorkOrder.get(clean(changeOrder.work_order_id)).catch(() => null) : null,
        clean(changeOrder.opportunity_id) ? Opportunity.get(clean(changeOrder.opportunity_id)).catch(() => null) : null,
        clean(changeOrder.invoice_id) ? Invoice.get(clean(changeOrder.invoice_id)).catch(() => null) : null,
      ]);
      return Response.json({
        success: true, action,
        change_order: changeOrder,
        customer: customer || null,
        estimate: estimate || null,
        work_order: workOrder || null,
        opportunity: opportunity || null,
        invoice: invoice || null,
      });
    }

    if (action === "create_change_order") {
      const fields = body?.fields && typeof body.fields === "object" ? body.fields : {};
      const title = clean(fields.title);
      if (!title) throw bad("A change order title is required.");
      if (!clean(fields.estimate_id) && !clean(fields.work_order_id) && !clean(fields.opportunity_id)) {
        throw bad("Link the change order to an estimate, work order, or opportunity.");
      }
      const linkChecks: Array<[string, any, string]> = [
        ["estimate_id", Estimate, "estimate"],
        ["work_order_id", WorkOrder, "work order"],
        ["opportunity_id", Opportunity, "opportunity"],
        ["invoice_id", Invoice, "invoice"],
      ];
      for (const [key, entity, label] of linkChecks) {
        const id = clean((fields as any)[key]);
        if (id) {
          const linked = await entity.get(id).catch(() => null);
          if (!linked?.id) throw bad(`The linked ${label} no longer exists.`, 409);
        }
      }
      const customerId = clean(fields.customer_id);
      let customerName = clean(fields.customer_display_name);
      if (customerId) {
        const customer = await Customer.get(customerId).catch(() => null);
        if (!customer?.id) throw bad("The selected Customer no longer exists.", 409);
        customerName = customerName || clean(customer.company_name);
      }
      const lineItems = sanitizeLineItems(fields.line_items) || [];
      const key = clean(body?.creation_request_key) || `co:${Date.now()}`;
      const result = await createFoundationRecordWithRecovery({
        entity: ChangeOrder,
        data: {
          creation_request_key: key,
          change_order_number: await nextChangeOrderNumber(ChangeOrder, base44.asServiceRole),
          status: "proposed",
          title,
          description: clean(fields.description),
          reason: clean(fields.reason),
          customer_id: customerId,
          customer_display_name: customerName,
          opportunity_id: clean(fields.opportunity_id),
          estimate_id: clean(fields.estimate_id),
          work_order_id: clean(fields.work_order_id),
          invoice_id: clean(fields.invoice_id),
          line_items: lineItems,
          amount_delta: amountDelta(lineItems),
          schedule_impact_days: num(fields.schedule_impact_days),
          proposed_by: actor,
          proposed_at: new Date().toISOString(),
          notes: clean(fields.notes),
          internal_notes: clean(fields.internal_notes),
          source_summary: fields.source_summary && typeof fields.source_summary === "object" ? fields.source_summary : {},
        },
        readMatches: () => findByCreationKey(ChangeOrder, key),
        label: "Change Order",
      });
      return Response.json({ success: true, action, change_order: result.record });
    }

    if (action === "update_change_order") {
      const id = clean(body?.change_order_id);
      const current = await ChangeOrder.get(id).catch(() => null);
      if (!current?.id) throw bad("Change order not found.", 404);
      if (clean(current.status) !== "proposed") throw bad("Only proposed change orders can be edited.", 409);
      const incoming = body?.fields && typeof body.fields === "object" ? body.fields : {};
      const desired: any = {};
      // Record links are set at creation and are not rewritable on update —
      // silently moving a change order onto another customer/work order/invoice
      // would let a staff session falsify financial linkage. To relink, cancel
      // and create a new change order.
      const LINK_FIELDS = new Set(["customer_id", "customer_display_name", "opportunity_id", "estimate_id", "work_order_id", "invoice_id"]);
      for (const key of EDITABLE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(incoming, key)) {
          if (LINK_FIELDS.has(key) && String(incoming[key] ?? '') !== String(current?.[key] ?? '')) {
            throw bad(`Record link "${key}" cannot be changed on an existing change order.`, 409);
          }
          desired[key] = incoming[key];
        }
      }
      if (Object.keys(desired).length === 0) throw bad("No editable fields supplied.");
      if (Object.prototype.hasOwnProperty.call(desired, "line_items")) {
        desired.line_items = sanitizeLineItems(desired.line_items) || [];
        desired.amount_delta = amountDelta(desired.line_items);
      }
      const baseline = body?.baseline && typeof body.baseline === "object" ? body.baseline : current;
      const expected = expectedFoundationFields({ ...current, ...baseline }, desired);
      const updated = await replaceFoundationFieldsIfUnchanged({
        entity: ChangeOrder, recordId: id, expectedFields: expected, nextFields: desired, label: "Change Order fields",
      });
      return Response.json({ success: true, action, change_order: updated });
    }

    if (action === "approve_change_order") {
      const id = clean(body?.change_order_id);
      const current = await ChangeOrder.get(id).catch(() => null);
      if (!current?.id) throw bad("Change order not found.", 404);
      if (clean(current.status) !== "proposed") throw bad("Only proposed change orders can be approved.", 409);
      const desired = { status: "approved", approved_by: actor, approved_at: new Date().toISOString() };
      const expected = expectedFoundationFields(current, desired);
      const updated = await replaceFoundationFieldsIfUnchanged({
        entity: ChangeOrder, recordId: id, expectedFields: expected, nextFields: desired, label: "Change Order approval",
      });
      return Response.json({ success: true, action, change_order: updated });
    }

    if (action === "reject_change_order") {
      const id = clean(body?.change_order_id);
      const current = await ChangeOrder.get(id).catch(() => null);
      if (!current?.id) throw bad("Change order not found.", 404);
      if (clean(current.status) !== "proposed") throw bad("Only proposed change orders can be rejected.", 409);
      const desired = {
        status: "rejected",
        rejected_by: actor,
        rejected_at: new Date().toISOString(),
        rejection_reason: clean(body?.rejection_reason),
      };
      const expected = expectedFoundationFields(current, desired);
      const updated = await replaceFoundationFieldsIfUnchanged({
        entity: ChangeOrder, recordId: id, expectedFields: expected, nextFields: desired, label: "Change Order rejection",
      });
      return Response.json({ success: true, action, change_order: updated });
    }

    if (action === "apply_change_order") {
      const id = clean(body?.change_order_id);
      const current = await ChangeOrder.get(id).catch(() => null);
      if (!current?.id) throw bad("Change order not found.", 404);
      if (clean(current.status) !== "approved") throw bad("Only approved change orders can be applied.", 409);
      const desired = {
        status: "applied",
        applied_at: new Date().toISOString(),
        applied_note: clean(body?.applied_note),
      };
      const expected = expectedFoundationFields(current, desired);
      const updated = await replaceFoundationFieldsIfUnchanged({
        entity: ChangeOrder, recordId: id, expectedFields: expected, nextFields: desired, label: "Change Order apply",
      });
      return Response.json({ success: true, action, change_order: updated });
    }

    if (action === "cancel_change_order") {
      const id = clean(body?.change_order_id);
      const current = await ChangeOrder.get(id).catch(() => null);
      if (!current?.id) throw bad("Change order not found.", 404);
      if (!["proposed", "approved"].includes(clean(current.status))) {
        throw bad("Only proposed or approved change orders can be cancelled.", 409);
      }
      const desired = { status: "cancelled", cancelled_at: new Date().toISOString() };
      const expected = expectedFoundationFields(current, desired);
      const updated = await replaceFoundationFieldsIfUnchanged({
        entity: ChangeOrder, recordId: id, expectedFields: expected, nextFields: desired, label: "Change Order cancel",
      });
      return Response.json({ success: true, action, change_order: updated });
    }

    throw bad(`Unsupported action "${action}".`);
  } catch (error: any) {
    const status = error?.statusCode || error?.status || 500;
    return Response.json(
      { success: false, error: error?.message || "Request failed." },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
});