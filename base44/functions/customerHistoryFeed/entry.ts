import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";
import { authenticateSignShopSession } from "../../shared/signShopSession.ts";
import { withEntityRateLimitRetry } from "../../shared/entityRateLimitRetry.ts";

const clean = (value: any) => String(value ?? "").trim();
const bad = (message: string, status = 400) => Object.assign(new Error(message), { statusCode: status });
const LIMIT = 1000;
const PAGE_SIZE = 500;

async function readHistory(entity: any, customerId: string, dateField: string, fields: string[]) {
  const rows: any[] = [];
  let skip = 0;
  let hasMore = false;
  while (skip < 50000) {
    const page = await entity.filter({ customer_id: customerId }, "-created_date", PAGE_SIZE, skip);
    if (!Array.isArray(page)) throw bad("Customer history lookup failed.", 500);
    rows.push(...page.filter((row: any) => row?.deleted !== true));
    skip += page.length;
    hasMore = page.length === PAGE_SIZE;
    if (!hasMore || rows.length > LIMIT) break;
  }
  rows.sort((a, b) => clean(b?.[dateField] || b?.created_date).localeCompare(clean(a?.[dateField] || a?.created_date)) || clean(b?.id).localeCompare(clean(a?.id)));
  const truncated = rows.length > LIMIT || hasMore;
  return {
    rows: rows.slice(0, LIMIT).map((row) => Object.fromEntries(fields.map((field) => [field, row?.[field] ?? null]))),
    count: Math.min(rows.length, LIMIT),
    truncated,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    await authenticateSignShopSession(base44, body?.session_token);
    if (clean(body?.action) !== "get") throw bad("Unsupported action.");
    const customerId = clean(body?.customer_id);
    if (!customerId) throw bad("customer_id is required.");
    const entities = base44.asServiceRole.entities;
    const customer = await entities.Customer.get(customerId).catch((error: any) => {
      if (Number(error?.status || error?.statusCode) === 404) return null;
      throw error;
    });
    if (!customer?.id) throw bad("Customer not found.", 404);
    const estimates = await readHistory(entities.AllInOneEstimate, customerId, "quote_issue_date", ["id", "estimate_number", "project_name", "status", "quote_total", "quote_issue_date", "created_date"]);
    const jobs = await readHistory(entities.WorkOrder, customerId, "created_date", ["id", "title", "current_stage", "sales_status", "est_inv_at", "estimate_id", "estimate_amount", "created_date"]);
    const invoices = await readHistory(entities.Invoice, customerId, "issue_date", ["id", "invoice_number", "status", "total", "balance_due", "amount_paid", "issue_date"]);
    return Response.json({
      success: true,
      estimates: estimates.rows,
      jobs: jobs.rows,
      invoices: invoices.rows,
      totals: { estimates: estimates.count, jobs: jobs.count, invoices: invoices.count },
      truncated: { estimates: estimates.truncated, jobs: jobs.truncated, invoices: invoices.truncated },
      limit: LIMIT,
    });
  } catch (error: any) {
    const status = Number(error?.status || error?.statusCode || 500);
    const safeStatus = [400, 401, 403, 404, 409, 423, 429, 503].includes(status) ? status : 500;
    return Response.json({ success: false, error: clean(error?.message || "Customer history could not be loaded.") }, { status: safeStatus });
  }
});
