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
const money = (value: number) => Math.round(value * 1000) / 1000;

const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { statusCode: status });

const itemLabel = (row: any) =>
  [clean(row?.material_type), clean(row?.product_type), clean(row?.size)]
    .filter(Boolean).join(" · ") || "Item";

function stockSnapshot(row: any) {
  const onHand = num(row?.quantity_on_hand);
  const reorderPoint = num(row?.reorder_point, NaN);
  return {
    id: clean(row?.id),
    material_type: clean(row?.material_type),
    product_type: clean(row?.product_type),
    size: clean(row?.size),
    thickness_gauge: clean(row?.thickness_gauge),
    unit_type: clean(row?.unit_type),
    cost_per_unit: num(row?.cost_per_unit),
    supplier: clean(row?.supplier),
    quantity_on_hand: onHand,
    barcode: clean(row?.barcode),
    reorder_point: Number.isFinite(reorderPoint) ? reorderPoint : null,
    low_stock: Number.isFinite(reorderPoint) && onHand <= reorderPoint,
    updated_date: clean(row?.updated_date),
  };
}

async function nextPoNumber(PurchaseOrder: any) {
  const rows = await loadAllEntityRows({ entity: PurchaseOrder, label: "PO numbering rows" });
  if (!Array.isArray(rows)) throw bad("PO numbering lookup failed.", 500);
  let seq = rows.length + 1001;
  const existing = new Set(rows.map((r: any) => clean(r?.po_number)));
  while (existing.has(`PO-${seq}`)) seq += 1;
  return `PO-${seq}`;
}

async function applyMovement({ Inventory, Movement, item, delta, reason, workOrderId, note, actor, key }: any) {
  const current = num(item?.quantity_on_hand);
  const next = money(current + delta);
  if (next < -0.0005) {
    throw bad(`Cannot move ${Math.abs(delta)} — only ${current} on hand for ${itemLabel(item)}.`, 409);
  }
  const desired: any = { quantity_on_hand: Math.max(0, next) };
  const expected = expectedFoundationFields(item, desired);
  await replaceFoundationFieldsIfUnchanged({
    entity: Inventory,
    recordId: clean(item.id),
    expectedFields: expected,
    nextFields: desired,
    label: `Stock for ${itemLabel(item)}`,
  });
  const result = await createFoundationRecordWithRecovery({
    entity: Movement,
    data: {
      creation_request_key: key,
      item_id: clean(item.id),
      item_label: itemLabel(item),
      reason,
      delta: money(delta),
      unit_cost: num(item?.cost_per_unit),
      resulting_qty: Math.max(0, next),
      work_order_id: workOrderId,
      note,
      created_by: actor,
    },
    readMatches: async () => Movement.filter({ creation_request_key: key }),
    label: "Inventory movement",
  });
  return { movement: result.record, quantity_on_hand: Math.max(0, next) };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email) || clean(user?.id) || "unknown";
    const action = clean(body?.action);
    if (!action) throw bad("An action is required.");

    const Inventory = base44.asServiceRole.entities.Inventory;
    const Movement = base44.asServiceRole.entities.InventoryMovement;
    const WorkOrder = base44.asServiceRole.entities.WorkOrder;
    const PurchaseOrder = base44.asServiceRole.entities.PurchaseOrder;

    if (action === "list_stock") {
      const rows = await loadAllEntityRows({ entity: Inventory, label: "Inventory stock rows" });
      if (!Array.isArray(rows)) throw bad("Inventory lookup failed.", 500);
      const query = clean(body?.query).toLowerCase();
      const lowOnly = body?.low_only === true;
      const active = rows
        .filter((r: any) => r?.legacy_compatibility !== true && r?.deleted !== true);
      const matched = active
        .map(stockSnapshot)
        .filter((r: any) => !lowOnly || r.low_stock)
        .filter((r: any) => !query
          || [r.material_type, r.product_type, r.size, r.supplier].join(" ").toLowerCase().includes(query));
      const items = matched.slice(0, 400);
      return Response.json({
        success: true,
        action,
        items,
        total_count: matched.length,
        returned: items.length,
        truncated: items.length < matched.length,
        low_stock_count: active.filter((r: any) => {
          const rp = num(r?.reorder_point, NaN);
          return Number.isFinite(rp) && num(r?.quantity_on_hand) <= rp;
        }).length,
      });
    }

    if (action === "list_movements") {
      const query: any = {};
      const itemId = clean(body?.item_id);
      if (itemId) query.item_id = itemId;
      const rows = await Movement.filter(query, "-created_date", 200);
      if (!Array.isArray(rows)) throw bad("Movement lookup failed.", 500);
      const movements = rows.slice(0, 200);
      // The 200-row window is an intentional bounded history — total_count
      // tells the caller how deep the full movement log actually runs.
      const counted = await Movement.count(query).then((n: any) => num(n, NaN)).catch(() => NaN);
      const totalCount = Number.isFinite(counted) ? counted : movements.length;
      return Response.json({
        success: true,
        action,
        movements,
        returned: movements.length,
        total_count: totalCount,
        truncated: totalCount > movements.length,
      });
    }

    if (action === "create_reorder_po") {
      const itemIds = [...new Set(
        (Array.isArray(body?.item_ids) ? body.item_ids : []).map((v: any) => clean(v)).filter(Boolean),
      )];
      if (itemIds.length === 0) throw bad("Select at least one inventory item to reorder.");

      const lines: any[] = [];
      const skipped: string[] = [];
      const suppliers: string[] = [];
      for (const id of itemIds) {
        const item = await Inventory.get(id).catch(() => null);
        const reorderPoint = num(item?.reorder_point, NaN);
        if (!item?.id || item?.legacy_compatibility === true || item?.deleted === true
          || !Number.isFinite(reorderPoint)) {
          skipped.push(id);
          continue;
        }
        let suggested = Math.max(reorderPoint * 2 - num(item.quantity_on_hand), reorderPoint);
        if (clean(item.unit_type) === "per_piece") suggested = Math.ceil(suggested);
        suggested = money(suggested);
        if (!(suggested > 0)) { skipped.push(id); continue; }
        const unitCost = Math.max(0, money(num(item.cost_per_unit)));
        suppliers.push(clean(item.supplier));
        lines.push({
          description: itemLabel(item),
          quantity: suggested,
          unit_cost: unitCost,
          quantity_received: 0,
          inventory_item_id: clean(item.id),
          supplier: clean(item.supplier),
          line_total: money(suggested * unitCost),
        });
      }
      if (lines.length === 0) {
        throw bad("None of the selected items could be reordered (missing item or reorder point).", 409);
      }

      const sharedVendor = suppliers.every((s) => s && s === suppliers[0]) ? suppliers[0] : "";
      const vendorName = sharedVendor
        || (new Set(suppliers.filter(Boolean)).size > 1 ? "Multiple vendors" : "Unspecified vendor");
      const subtotal = money(lines.reduce((sum: number, r: any) => sum + num(r.line_total), 0));
      const key = `reorder-po:${clean(body?.creation_request_key) || Date.now()}`;

      const result = await createFoundationRecordWithRecovery({
        entity: PurchaseOrder,
        data: {
          creation_request_key: key,
          po_number: await nextPoNumber(PurchaseOrder),
          status: "draft",
          vendor_name: vendorName,
          line_items: lines,
          subtotal,
          shipping_fee: 0,
          total: subtotal,
          notes: "Auto-generated from low-stock reorder",
          created_by: actor,
          updated_by: actor,
          source_summary: { source: "low_stock_reorder", item_ids: itemIds },
        },
        readMatches: async () => PurchaseOrder.filter({ creation_request_key: key }),
        label: "Reorder purchase order",
      });
      const record = result?.record || {};
      return Response.json({
        success: true,
        action,
        purchase_order_id: clean(record?.id),
        po_number: clean(record?.po_number),
        line_count: lines.length,
        skipped_item_ids: skipped,
      });
    }

    if (["receive_stock", "issue_to_job", "adjust_stock", "return_stock"].includes(action)) {
      const itemId = clean(body?.item_id);
      const item = await Inventory.get(itemId).catch(() => null);
      if (!item?.id || item?.legacy_compatibility === true) throw bad("Inventory item not found.", 404);

      let delta = 0;
      let reason = "adjust";
      let workOrderId = "";
      if (action === "receive_stock" || action === "return_stock") {
        delta = num(body?.quantity, NaN);
        if (!(delta > 0)) throw bad("Quantity must be positive.");
        reason = action === "receive_stock" ? "receive" : "return";
        workOrderId = clean(body?.work_order_id);
      } else if (action === "issue_to_job") {
        const qty = num(body?.quantity, NaN);
        if (!(qty > 0)) throw bad("Issue quantity must be positive.");
        workOrderId = clean(body?.work_order_id);
        if (!workOrderId) throw bad("A work order is required to issue stock.");
        const wo = await WorkOrder.get(workOrderId).catch(() => null);
        if (!wo?.id) throw bad("The linked work order no longer exists.", 409);
        delta = -qty;
        reason = "issue";
      } else {
        delta = num(body?.delta, NaN);
        if (!Number.isFinite(delta) || delta === 0) throw bad("A non-zero delta is required.");
        reason = "adjust";
      }
      const key = clean(body?.creation_request_key) || `movement:${itemId}:${action}:${Date.now()}`;
      const result = await applyMovement({
        Inventory, Movement, item, delta, reason, workOrderId,
        note: clean(body?.note), actor, key,
      });
      return Response.json({ success: true, action, ...result });
    }

    if (action === "set_reorder_point") {
      const itemId = clean(body?.item_id);
      const item = await Inventory.get(itemId).catch(() => null);
      if (!item?.id || item?.legacy_compatibility === true) throw bad("Inventory item not found.", 404);
      const reorderPoint = num(body?.reorder_point, NaN);
      if (!Number.isFinite(reorderPoint) || reorderPoint < 0) throw bad("Reorder point must be a non-negative number.");
      const expectedUpdatedAt = clean(body?.expected_updated_date);
      if (expectedUpdatedAt && clean(item.updated_date) !== expectedUpdatedAt) {
        throw bad("This inventory item changed in another session. Reload before editing its reorder point.", 409);
      }
      const saved = await Inventory.update(item.id, { reorder_point: reorderPoint });
      return Response.json({
        success: true,
        action,
        item_id: clean(item.id),
        reorder_point: num(saved?.reorder_point, reorderPoint),
        updated_date: clean(saved?.updated_date),
      });
    }

    if (action === "set_archived") {
      const itemId = clean(body?.item_id);
      const item = await Inventory.get(itemId).catch(() => null);
      if (!item?.id || item?.legacy_compatibility === true) throw bad("Inventory item not found.", 404);
      const archived = body?.archived !== false;
      const expectedUpdatedAt = clean(body?.expected_updated_date);
      if (expectedUpdatedAt && clean(item.updated_date) !== expectedUpdatedAt) {
        throw bad("This inventory item changed in another session. Reload before archiving it.", 409);
      }
      const saved = await Inventory.update(item.id, { deleted: archived });
      return Response.json({
        success: true,
        action,
        item_id: clean(item.id),
        deleted: saved?.deleted === true,
        updated_date: clean(saved?.updated_date),
      });
    }

    // Master Inventory cost audit. Admin-only, matching the Master Inventory
    // page gate; changed_by always comes from the session, never the client.
    if (action === "record_cost_history") {
      if (user?.role !== "admin") throw bad("Recording cost history requires a CCS admin.", 403);
      const itemId = clean(body?.inventory_item_id);
      if (!itemId) throw bad("An inventory item id is required.");
      const changes = Array.isArray(body?.changes) ? body.changes : [];
      if (changes.length === 0) return Response.json({ success: true, action, written: 0 });
      if (changes.length > 50) throw bad("Too many cost changes in one request.");
      const CostHistory = base44.asServiceRole.entities.InventoryCostHistory;
      const entityKey = clean(body?.entity_key).slice(0, 100);
      const note = clean(body?.note).slice(0, 500);
      let written = 0;
      for (const change of changes) {
        const field = clean(change?.cost_field).slice(0, 100);
        const oldCost = Number(change?.old_cost);
        const newCost = Number(change?.new_cost);
        if (!field || !Number.isFinite(oldCost) || !Number.isFinite(newCost)) continue;
        await CostHistory.create({
          inventory_item_id: itemId,
          entity_key: entityKey,
          cost_field: field,
          old_cost: oldCost,
          new_cost: newCost,
          changed_by: actor,
          note,
        });
        written += 1;
      }
      return Response.json({ success: true, action, written });
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