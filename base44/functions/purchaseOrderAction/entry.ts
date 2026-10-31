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
const today = () => new Date().toISOString().slice(0, 10);

const PO_STATUSES = ["draft", "sent", "partially_received", "received", "cancelled"];

const EDITABLE_FIELDS = [
  "vendor_name", "vendor_contact", "vendor_email", "vendor_phone",
  "work_order_id", "estimate_id", "opportunity_id",
  "line_items", "shipping_fee", "order_date", "expected_date",
  "ship_to", "vendor_reference", "notes", "internal_notes",
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
    const unit_cost = num(row?.unit_cost, NaN);
    if (!description) throw bad(`Line ${i + 1} needs a description.`);
    if (!(quantity > 0)) throw bad(`Line ${i + 1} needs a positive quantity.`);
    if (!(unit_cost >= 0)) throw bad(`Line ${i + 1} needs a non-negative unit cost.`);
    return {
      description,
      quantity: money(quantity),
      unit_cost: money(unit_cost),
      quantity_received: Math.max(0, money(num(row?.quantity_received))),
      inventory_item_id: clean(row?.inventory_item_id),
      line_total: money(quantity * unit_cost),
    };
  });
}

function computeTotals(fields: any) {
  const items = Array.isArray(fields.line_items) ? fields.line_items : [];
  const subtotal = money(items.reduce((s: number, r: any) => s + money(num(r.quantity) * num(r.unit_cost)), 0));
  const shipping = Math.max(0, money(num(fields.shipping_fee)));
  return { subtotal, shipping_fee: shipping, total: money(subtotal + shipping) };
}

async function nextPoNumber(PurchaseOrder: any, svc: any) {
  return allocateDocNumber({ svc, configName: 'purchase_order', prefix: 'PO-', seedEntity: PurchaseOrder, seedField: 'po_number' });
}

function poSnapshot(row: any) {
  return {
    id: clean(row?.id),
    po_number: clean(row?.po_number),
    status: clean(row?.status),
    payment_status: clean(row?.payment_status) || "unpaid",
    vendor_name: clean(row?.vendor_name),
    work_order_id: clean(row?.work_order_id),
    estimate_id: clean(row?.estimate_id),
    order_date: clean(row?.order_date),
    expected_date: clean(row?.expected_date),
    subtotal: num(row?.subtotal),
    shipping_fee: num(row?.shipping_fee),
    total: num(row?.total),
    updated_date: clean(row?.updated_date),
  };
}

function receiveStatus(items: any[]) {
  const anyReceived = items.some((r: any) => num(r.quantity_received) > 0);
  const allReceived = items.length > 0 && items.every((r: any) => num(r.quantity_received) >= num(r.quantity) - 0.005);
  if (allReceived) return "received";
  if (anyReceived) return "partially_received";
  return "sent";
}

async function applyStockReceipt({ Inventory, Movement, itemId, qty, poNumber, actor, workOrderId, key }: any) {
  const item = await Inventory.get(itemId).catch(() => null);
  if (!item?.id) return "The linked stock item no longer exists.";
  const next = Math.round((num(item.quantity_on_hand) + qty) * 1000) / 1000;
  const desired = { quantity_on_hand: next };
  const expected = expectedFoundationFields(item, desired);
  await replaceFoundationFieldsIfUnchanged({
    entity: Inventory,
    recordId: clean(item.id),
    expectedFields: expected,
    nextFields: desired,
    label: `Stock for ${clean(item.material_type) || itemId}`,
  });
  await createFoundationRecordWithRecovery({
    entity: Movement,
    data: {
      creation_request_key: key,
      item_id: clean(item.id),
      item_label: [clean(item.material_type), clean(item.product_type), clean(item.size)].filter(Boolean).join(" Â· ") || "Item",
      reason: "receive",
      delta: qty,
      unit_cost: num(item?.cost_per_unit),
      resulting_qty: next,
      work_order_id: workOrderId,
      note: `Received on ${poNumber}`,
      created_by: actor,
    },
    readMatches: async () => Movement.filter({ creation_request_key: key }),
    label: "Inventory movement",
  });
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email) || clean(user?.id) || "unknown";
    const action = clean(body?.action);
    if (!action) throw bad("An action is required.");

    const PurchaseOrder = base44.asServiceRole.entities.PurchaseOrder;
    const Estimate = base44.asServiceRole.entities.AllInOneEstimate;
    const WorkOrder = base44.asServiceRole.entities.WorkOrder;
    const Opportunity = base44.asServiceRole.entities.Opportunity;
    const Inventory = base44.asServiceRole.entities.Inventory;
    const InventoryMovement = base44.asServiceRole.entities.InventoryMovement;

    if (action === "list_purchase_orders") {
      const status = clean(body?.status);
      if (status && !PO_STATUSES.includes(status)) throw bad("Unknown PO status filter.");
      const query: any = status ? { status } : {};
      for (const key of ["work_order_id", "estimate_id", "opportunity_id"]) {
        const v = clean(body?.[key]);
        if (v) query[key] = v;
      }
      const rows = await loadAllEntityRows({
        entity: PurchaseOrder,
        query,
        sort: "-created_date",
        label: "Purchase order rows",
      });
      if (!Array.isArray(rows)) throw bad("Purchase order lookup failed.", 500);
      const search = clean(body?.query).toLowerCase();
      const matched = rows
        .filter((r: any) => !search
          || clean(r?.po_number).toLowerCase().includes(search)
          || clean(r?.vendor_name).toLowerCase().includes(search))
        .sort((a: any, b: any) => clean(b?.created_date).localeCompare(clean(a?.created_date)));
      const purchaseOrders = matched.slice(0, 250).map(poSnapshot);
      return Response.json({
        success: true,
        action,
        purchase_orders: purchaseOrders,
        total_count: matched.length,
        returned: purchaseOrders.length,
        truncated: purchaseOrders.length < matched.length,
      });
    }

    if (action === "get_purchase_order") {
      const id = clean(body?.purchase_order_id);
      const po = await PurchaseOrder.get(id).catch(() => null);
      if (!po?.id) throw bad("Purchase order not found.", 404);
      const [estimate, workOrder, opportunity] = await Promise.all([
        clean(po.estimate_id) ? Estimate.get(clean(po.estimate_id)).catch(() => null) : null,
        clean(po.work_order_id) ? WorkOrder.get(clean(po.work_order_id)).catch(() => null) : null,
        clean(po.opportunity_id) ? Opportunity.get(clean(po.opportunity_id)).catch(() => null) : null,
      ]);
      return Response.json({
        success: true, action,
        purchase_order: po,
        estimate: estimate || null,
        work_order: workOrder || null,
        opportunity: opportunity || null,
      });
    }

    if (action === "create_purchase_order") {
      const fields = body?.fields && typeof body.fields === "object" ? body.fields : {};
      const vendorName = clean(fields.vendor_name);
      if (!vendorName) throw bad("A vendor name is required.");
      const linkChecks: Array<[string, any, string]> = [
        ["estimate_id", Estimate, "estimate"],
        ["work_order_id", WorkOrder, "work order"],
        ["opportunity_id", Opportunity, "opportunity"],
      ];
      for (const [key, entity, label] of linkChecks) {
        const id = clean((fields as any)[key]);
        if (id) {
          const linked = await entity.get(id).catch(() => null);
          if (!linked?.id) throw bad(`The linked ${label} no longer exists.`, 409);
        }
      }
      const lineItems = sanitizeLineItems(fields.line_items) || [];
      const totals = computeTotals({ ...fields, line_items: lineItems });
      const key = clean(body?.creation_request_key) || `po:${Date.now()}`;
      const result = await createFoundationRecordWithRecovery({
        entity: PurchaseOrder,
        data: {
          creation_request_key: key,
          po_number: clean(fields.po_number) || await nextPoNumber(PurchaseOrder, base44.asServiceRole),
          status: "draft",
          vendor_name: vendorName,
          vendor_contact: clean(fields.vendor_contact),
          vendor_email: clean(fields.vendor_email),
          vendor_phone: clean(fields.vendor_phone),
          work_order_id: clean(fields.work_order_id),
          estimate_id: clean(fields.estimate_id),
          opportunity_id: clean(fields.opportunity_id),
          line_items: lineItems,
          ...totals,
          order_date: clean(fields.order_date),
          expected_date: clean(fields.expected_date),
          ship_to: clean(fields.ship_to),
          vendor_reference: clean(fields.vendor_reference),
          notes: clean(fields.notes),
          internal_notes: clean(fields.internal_notes),
          created_by: actor,
          updated_by: actor,
          source_summary: fields.source_summary && typeof fields.source_summary === "object" ? fields.source_summary : {},
        },
        readMatches: () => findByCreationKey(PurchaseOrder, key),
        label: "Purchase Order",
      });
      return Response.json({ success: true, action, purchase_order: result.record });
    }

    if (action === "update_purchase_order") {
      const id = clean(body?.purchase_order_id);
      const current = await PurchaseOrder.get(id).catch(() => null);
      if (!current?.id) throw bad("Purchase order not found.", 404);
      if (clean(current.status) !== "draft") throw bad("Only draft purchase orders can be edited.", 409);
      const incoming = body?.fields && typeof body.fields === "object" ? body.fields : {};
      const desired: any = {};
      for (const key of EDITABLE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(incoming, key)) desired[key] = incoming[key];
      }
      if (Object.keys(desired).length === 0) throw bad("No editable fields supplied.");
      if (Object.prototype.hasOwnProperty.call(desired, "line_items")) {
        desired.line_items = sanitizeLineItems(desired.line_items) || [];
      }
      const merged = { ...current, ...desired };
      Object.assign(desired, computeTotals(merged), { updated_by: actor });
      const baseline = body?.baseline && typeof body.baseline === "object" ? body.baseline : current;
      const expected = expectedFoundationFields({ ...current, ...baseline }, desired);
      const updated = await replaceFoundationFieldsIfUnchanged({
        entity: PurchaseOrder, recordId: id, expectedFields: expected, nextFields: desired, label: "Purchase Order fields",
      });
      return Response.json({ success: true, action, purchase_order: updated });
    }

    if (action === "mark_sent") {
      const id = clean(body?.purchase_order_id);
      const current = await PurchaseOrder.get(id).catch(() => null);
      if (!current?.id) throw bad("Purchase order not found.", 404);
      if (clean(current.status) !== "draft") throw bad("Only draft purchase orders can be marked sent.", 409);
      const desired = {
        status: "sent",
        sent_date: today(),
        order_date: clean(current.order_date) || today(),
        updated_by: actor,
      };
      const expected = expectedFoundationFields(current, desired);
      const updated = await replaceFoundationFieldsIfUnchanged({
        entity: PurchaseOrder, recordId: id, expectedFields: expected, nextFields: desired, label: "Purchase Order send",
      });
      return Response.json({ success: true, action, purchase_order: updated });
    }

    if (action === "receive_items") {
      const id = clean(body?.purchase_order_id);
      const current = await PurchaseOrder.get(id).catch(() => null);
      if (!current?.id) throw bad("Purchase order not found.", 404);
      if (!["sent", "partially_received"].includes(clean(current.status))) {
        throw bad("Only sent or partially received purchase orders can receive items.", 409);
      }
      const receipts = Array.isArray(body?.lines) ? body.lines : [];
      if (receipts.length === 0) throw bad("No receipt lines supplied.");
      const items = Array.isArray(current.line_items) ? [...current.line_items] : [];
      for (const rec of receipts) {
        const idx = Math.trunc(num(rec?.index, -1));
        const qty = num(rec?.quantity, NaN);
        if (idx < 0 || idx >= items.length) throw bad(`Receipt references a missing line (${idx + 1}).`);
        if (!(qty > 0)) throw bad(`Receipt quantity for line ${idx + 1} must be positive.`);
        const line = items[idx];
        const already = num(line.quantity_received);
        if (already + qty - num(line.quantity) > 0.005) {
          throw bad(`Receiving ${qty} exceeds the open quantity on line ${idx + 1}.`, 409);
        }
        items[idx] = { ...line, quantity_received: money(already + qty) };
      }
      const status = receiveStatus(items);
      const desired: any = {
        line_items: items,
        status,
        received_date: status === "received" ? today() : clean(current.received_date),
        updated_by: actor,
      };
      const expected = expectedFoundationFields(current, desired);
      const updated = await replaceFoundationFieldsIfUnchanged({
        entity: PurchaseOrder, recordId: id, expectedFields: expected, nextFields: desired, label: "Purchase Order receipt",
      });
      const stockWarnings: string[] = [];
      let stockReceived = 0;
      for (const rec of receipts) {
        const idx = Math.trunc(num(rec?.index, -1));
        const line = items[idx];
        const itemId = clean(line?.inventory_item_id);
        if (!itemId) continue;
        const qty = num(rec?.quantity);
        const key = `po-receive:${id}:${idx}:${num(line.quantity_received) - qty}:${qty}`;
        try {
          const warn = await applyStockReceipt({
            Inventory, Movement: InventoryMovement, itemId, qty,
            poNumber: clean(current.po_number) || id,
            actor, workOrderId: clean(current.work_order_id), key,
          });
          if (warn) stockWarnings.push(`Line ${idx + 1}: ${warn}`);
          else stockReceived += 1;
        } catch (e: any) {
          stockWarnings.push(`Line ${idx + 1} stock update failed: ${e?.message || "error"}`);
        }
      }
      return Response.json({ success: true, action, purchase_order: updated, stock_received: stockReceived, stock_warnings: stockWarnings });
    }

    if (action === "mark_invoiced") {
      const id = clean(body?.purchase_order_id);
      const current = await PurchaseOrder.get(id).catch(() => null);
      if (!current?.id) throw bad("Purchase order not found.", 404);
      if (!["sent", "partially_received", "received"].includes(clean(current.status))) {
        throw bad("A vendor bill can only be recorded on a sent or received purchase order.", 409);
      }
      if (clean(current.payment_status) === "paid") throw bad("This purchase order is already paid.", 409);
      if (clean(current.payment_status) === "invoiced") throw bad("A vendor bill is already recorded on this purchase order.", 409);
      const desired = {
        payment_status: "invoiced",
        vendor_invoice_number: clean(body?.vendor_invoice_number),
        updated_by: actor,
      };
      const expected = expectedFoundationFields(current, desired);
      const updated = await replaceFoundationFieldsIfUnchanged({
        entity: PurchaseOrder, recordId: id, expectedFields: expected, nextFields: desired, label: "Purchase Order vendor bill",
      });
      return Response.json({ success: true, action, purchase_order: updated });
    }

    if (action === "mark_paid") {
      const id = clean(body?.purchase_order_id);
      const current = await PurchaseOrder.get(id).catch(() => null);
      if (!current?.id) throw bad("Purchase order not found.", 404);
      if (clean(current.payment_status) !== "invoiced") {
        throw bad("Record the vendor bill before marking the purchase order paid.", 409);
      }
      const amount = num(body?.paid_amount, NaN);
      const desired = {
        payment_status: "paid",
        paid_date: clean(body?.paid_date) || today(),
        paid_amount: Number.isFinite(amount) && amount > 0 ? money(amount) : num(current.total),
        updated_by: actor,
      };
      const expected = expectedFoundationFields(current, desired);
      const updated = await replaceFoundationFieldsIfUnchanged({
        entity: PurchaseOrder, recordId: id, expectedFields: expected, nextFields: desired, label: "Purchase Order payment",
      });
      return Response.json({ success: true, action, purchase_order: updated });
    }

    if (action === "cancel_purchase_order") {
      const id = clean(body?.purchase_order_id);
      const current = await PurchaseOrder.get(id).catch(() => null);
      if (!current?.id) throw bad("Purchase order not found.", 404);
      if (clean(current.status) === "received") throw bad("Received purchase orders cannot be cancelled.", 409);
      if (clean(current.status) === "cancelled") throw bad("Purchase order is already cancelled.", 409);
      if (clean(current.payment_status) === "paid") throw bad("Paid purchase orders cannot be cancelled.", 409);
      const desired = { status: "cancelled", updated_by: actor };
      const expected = expectedFoundationFields(current, desired);
      const updated = await replaceFoundationFieldsIfUnchanged({
        entity: PurchaseOrder, recordId: id, expectedFields: expected, nextFields: desired, label: "Purchase Order cancel",
      });
      return Response.json({ success: true, action, purchase_order: updated });
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