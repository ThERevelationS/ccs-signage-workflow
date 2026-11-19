import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";
import { authenticateSignShopSession } from "../../shared/signShopSession.ts";
import { loadAllEntityRows } from "../../shared/pagedEntityRows.ts";

const clean = (value: any) => String(value ?? "").trim();
const num = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const money = (value: number) => Math.round(value * 100) / 100;

const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { statusCode: status });

const groupSum = (rows: any[], keyFn: (r: any) => string, valFn: (r: any) => number) => {
  const out = new Map<string, number>();
  for (const row of rows || []) {
    const key = keyFn(row);
    if (!key) continue;
    out.set(key, money((out.get(key) || 0) + valFn(row)));
  }
  return out;
};

async function loadCostInputs({ Invoice, Payment, PurchaseOrder, ChangeOrder, LaborSegment, Movement }: any) {
  const [invoices, payments, purchaseOrders, changeOrders, segments, movements] = await Promise.all([
    loadAllEntityRows({ entity: Invoice, label: "Invoice cost inputs" }),
    loadAllEntityRows({ entity: Payment, label: "Payment cost inputs" }),
    loadAllEntityRows({ entity: PurchaseOrder, label: "Purchase order cost inputs" }),
    loadAllEntityRows({ entity: ChangeOrder, label: "Change order cost inputs" }),
    loadAllEntityRows({ entity: LaborSegment, label: "Labor segment cost inputs" }),
    loadAllEntityRows({ entity: Movement, label: "Inventory movement cost inputs" }),
  ]);
  for (const [label, rows] of [["Invoice", invoices], ["Payment", payments], ["PurchaseOrder", purchaseOrders], ["ChangeOrder", changeOrders], ["TimeClockLaborSegment", segments], ["InventoryMovement", movements]] as const) {
    if (!Array.isArray(rows)) throw bad(`${label} lookup failed.`, 500);
  }
  return {
    invoiced: groupSum(invoices.filter((i: any) => clean(i?.status) !== "void" && clean(i?.status) !== "draft"),
      (i: any) => clean(i?.work_order_id), (i: any) => num(i?.total)),
    collected: groupSum(payments.filter((p: any) => clean(p?.status) === "recorded"),
      (p: any) => clean(p?.work_order_id), (p: any) => num(p?.amount)),
    poCommitted: groupSum(purchaseOrders.filter((p: any) => clean(p?.status) !== "cancelled"),
      (p: any) => clean(p?.work_order_id), (p: any) => num(p?.total)),
    coDelta: groupSum(changeOrders.filter((c: any) => ["approved", "applied"].includes(clean(c?.status))),
      (c: any) => clean(c?.work_order_id), (c: any) => num(c?.amount_delta)),
    laborMinutes: groupSum(segments,
      (s: any) => clean(s?.work_order_id), (s: any) => num(s?.duration_minutes)),
    stockIssued: groupSum(
      movements.filter((m: any) => ["issue", "return"].includes(clean(m?.reason))),
      (m: any) => clean(m?.work_order_id), (m: any) => -num(m?.delta) * num(m?.unit_cost)),
  };
}

function rollup(workOrder: any, inputs: any) {
  const id = clean(workOrder?.id);
  const estimated = num(workOrder?.estimate_amount);
  const poCommitted = inputs.poCommitted.get(id) || 0;
  const stockIssued = money(inputs.stockIssued.get(id) || 0);
  const coDelta = inputs.coDelta.get(id) || 0;
  const invoiced = inputs.invoiced.get(id) || 0;
  const collected = inputs.collected.get(id) || 0;
  const laborHours = money((inputs.laborMinutes.get(id) || 0) / 60);
  const contractValue = money(estimated + coDelta);
  return {
    work_order_id: id,
    title: clean(workOrder?.title),
    client_name: clean(workOrder?.client_name),
    sales_status: clean(workOrder?.sales_status),
    current_stage: clean(workOrder?.current_stage),
    estimate_id: clean(workOrder?.estimate_id),
    estimated_amount: estimated,
    co_delta: coDelta,
    contract_value: contractValue,
    po_committed: poCommitted,
    stock_issued: stockIssued,
    labor_hours: laborHours,
    invoiced,
    collected,
    open_ar: money(invoiced - collected),
    margin_vs_materials: money(contractValue - poCommitted),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    await authenticateSignShopSession(base44, body?.session_token);
    const action = clean(body?.action);
    if (!action) throw bad("An action is required.");

    const WorkOrder = base44.asServiceRole.entities.WorkOrder;
    const Invoice = base44.asServiceRole.entities.Invoice;
    const Payment = base44.asServiceRole.entities.Payment;
    const PurchaseOrder = base44.asServiceRole.entities.PurchaseOrder;
    const ChangeOrder = base44.asServiceRole.entities.ChangeOrder;
    const LaborSegment = base44.asServiceRole.entities.TimeClockLaborSegment;
    const Movement = base44.asServiceRole.entities.InventoryMovement;
    const deps = { Invoice, Payment, PurchaseOrder, ChangeOrder, LaborSegment, Movement };

    if (action === "list_job_costs") {
      const rows = await loadAllEntityRows({
        entity: WorkOrder,
        sort: "-created_date",
        label: "Work order cost rows",
      });
      if (!Array.isArray(rows)) throw bad("Work order lookup failed.", 500);
      const inputs = await loadCostInputs(deps);
      const search = clean(body?.query).toLowerCase();
      const matched = rows
        .filter((w: any) => w?.deleted !== true)
        .map((w: any) => rollup(w, inputs))
        .filter((j: any) => !search
          || j.title.toLowerCase().includes(search)
          || j.client_name.toLowerCase().includes(search));
      const jobs = matched.slice(0, 300);
      // Totals roll up every matching job, not just the displayed window — a
      // capped read used to make the whole summary under-report.
      const totals = {
        jobs: matched.length,
        contract_value: money(matched.reduce((s: number, j: any) => s + j.contract_value, 0)),
        po_committed: money(matched.reduce((s: number, j: any) => s + j.po_committed, 0)),
        stock_issued: money(matched.reduce((s: number, j: any) => s + j.stock_issued, 0)),
        labor_hours: money(matched.reduce((s: number, j: any) => s + j.labor_hours, 0)),
        invoiced: money(matched.reduce((s: number, j: any) => s + j.invoiced, 0)),
        collected: money(matched.reduce((s: number, j: any) => s + j.collected, 0)),
        open_ar: money(matched.reduce((s: number, j: any) => s + j.open_ar, 0)),
      };
      return Response.json({
        success: true,
        action,
        jobs,
        totals,
        total_count: matched.length,
        returned: jobs.length,
        truncated: jobs.length < matched.length,
      });
    }

    if (action === "get_job_cost") {
      const workOrderId = clean(body?.work_order_id);
      const workOrder = await WorkOrder.get(workOrderId).catch(() => null);
      if (!workOrder?.id) throw bad("Work order not found.", 404);
      const inputs = await loadCostInputs(deps);
      const [invoices, purchaseOrders, changeOrders, segments, movements] = await Promise.all([
        loadAllEntityRows({ entity: Invoice, query: { work_order_id: workOrderId }, label: "Job cost invoices" }),
        loadAllEntityRows({ entity: PurchaseOrder, query: { work_order_id: workOrderId }, label: "Job cost purchase orders" }),
        loadAllEntityRows({ entity: ChangeOrder, query: { work_order_id: workOrderId }, label: "Job cost change orders" }),
        loadAllEntityRows({ entity: LaborSegment, query: { work_order_id: workOrderId }, label: "Job cost labor segments" }),
        loadAllEntityRows({ entity: Movement, query: { work_order_id: workOrderId }, label: "Job cost stock movements" }),
      ]);
      const laborByUser = new Map<string, number>();
      for (const s of (Array.isArray(segments) ? segments : [])) {
        const who = clean(s?.user_name || s?.user_email) || "Unknown";
        laborByUser.set(who, (laborByUser.get(who) || 0) + num(s?.duration_minutes));
      }
      return Response.json({
        success: true,
        action,
        job: rollup(workOrder, inputs),
        work_order: workOrder,
        invoices: (Array.isArray(invoices) ? invoices : []).map((i: any) => ({
          id: clean(i?.id), invoice_number: clean(i?.invoice_number), status: clean(i?.status),
          total: num(i?.total), amount_paid: num(i?.amount_paid), balance_due: num(i?.balance_due),
        })),
        purchase_orders: (Array.isArray(purchaseOrders) ? purchaseOrders : []).map((p: any) => ({
          id: clean(p?.id), po_number: clean(p?.po_number), status: clean(p?.status),
          vendor_name: clean(p?.vendor_name), total: num(p?.total),
        })),
        change_orders: (Array.isArray(changeOrders) ? changeOrders : []).map((c: any) => ({
          id: clean(c?.id), change_order_number: clean(c?.change_order_number), status: clean(c?.status),
          title: clean(c?.title), amount_delta: num(c?.amount_delta),
        })),
        labor_by_user: [...laborByUser.entries()].map(([user, minutes]) => ({ user, hours: money(minutes / 60) })),
        stock_movements: (Array.isArray(movements) ? movements : [])
          .filter((m: any) => ["issue", "return"].includes(clean(m?.reason)))
          .map((m: any) => ({
            id: clean(m?.id), item_label: clean(m?.item_label), reason: clean(m?.reason),
            delta: num(m?.delta), unit_cost: num(m?.unit_cost),
            issued_cost: money(-num(m?.delta) * num(m?.unit_cost)),
            note: clean(m?.note), created_by: clean(m?.created_by), created_date: clean(m?.created_date),
          })),
      });
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