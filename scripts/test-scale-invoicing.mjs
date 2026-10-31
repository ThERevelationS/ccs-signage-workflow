import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Scale hardening for invoicingAction: financial reads must not silently
// truncate at the entity API's default page size. Unscoped/heavy reads go
// through the shared paged loader (loadAllEntityRows); remaining scoped
// lookups carry an explicit limit >= 500.

const src = readFileSync(new URL("../base44/functions/invoicingAction/entry.ts", import.meta.url), "utf8");
const paged = readFileSync(new URL("../base44/shared/pagedEntityRows.ts", import.meta.url), "utf8");

const block = (name) => {
  const start = src.indexOf(`if (action === "${name}")`);
  assert.ok(start >= 0, `${name} action exists`);
  const rest = src.slice(start);
  const end = rest.indexOf("\n    if (action ===");
  return end < 0 ? rest : rest.slice(0, end);
};

// --- Shared loader is the fail-closed paged read (dedupe + complete pages). --
assert.match(src, /import \{ loadAllEntityRows \} from "\.\.\/\.\.\/shared\/pagedEntityRows\.ts";/);
assert.match(paged, /entity\.filter\(query, sort \|\| undefined, safePageSize, skip\)/);
assert.match(paged, /could not be verified completely/);

// --- Every remaining entity .filter(...) call has an explicit limit >= 500. --
const calls = [];
const re = /(?:Invoice|Payment|Estimate|PortalLink|entity)\.filter\(/g;
let m;
while ((m = re.exec(src))) {
  const openIdx = src.indexOf("(", m.index);
  let depth = 0;
  for (let j = openIdx; j < src.length; j += 1) {
    if (src[j] === "(") depth += 1;
    else if (src[j] === ")") {
      depth -= 1;
      if (depth === 0) { calls.push(src.slice(m.index, j + 1)); break; }
    }
  }
}
assert.ok(calls.length > 0, "expected scoped entity filter calls to remain");
for (const call of calls) {
  const args = call.slice(call.indexOf("(") + 1, -1);
  const lim = args.match(/,\s*(?:undefined|null|['"][^'"]*['"])\s*,\s*(\d{3,})/);
  assert.ok(lim && Number(lim[1]) >= 500, `entity filter call needs an explicit limit >= 500: ${call}`);
}

// --- Retired default-page anti-patterns. ------------------------------------
assert.ok(!src.includes("Invoice.filter(status ? { status } : {})"), "list_invoices/export_ar unscoped default-page read removed");
assert.ok(!src.includes("Invoice.filter({})"), "unscoped Invoice.filter({}) removed");
assert.ok(!src.includes("Payment.filter({})"), "unscoped Payment.filter({}) removed");
assert.ok(!src.includes('Estimate.filter({ status: "approved" }, "-created_date", 100)'), "approved-estimate cap removed");
assert.ok(!src.includes("Invoice.filter({ customer_id: cid })"), "statement invoice read is paged");
assert.ok(!src.includes("Estimate.filter({ customer_id: cid })"), "statement estimate read is paged");
assert.ok(!src.includes(".slice(0, 250)") && !src.includes(".slice(0, 50)"), "hard display caps replaced by honored limits");

// --- list_invoices: paged read, aging over the full set, honest counts. -----
{
  const b = block("list_invoices");
  assert.match(b, /loadAllEntityRows\(\{[\s\S]*?entity: Invoice,[\s\S]*?query: status \? \{ status \} : \{\},[\s\S]*?\}\)/, "paged status-scoped invoice read");
  assert.ok(!b.includes("Invoice.filter("), "no direct Invoice.filter in list_invoices");
  assert.match(b, /Number\(body\?\.limit\) \|\| 250/, "requested limit honored (default 250)");
  assert.match(b, /matched\.slice\(0, limit\)/, "returned rows honor the limit");
  assert.match(b, /total_count: matched\.length/, "total_count reflects the full matched set");
  assert.match(b, /showing: invoices\.length/, "showing reflects the returned rows");
  assert.match(b, /truncated: matched\.length > invoices\.length/, "truncated flag present");
  assert.match(b, /aging: agingSummary\(rows\)/, "aging computed over the full paged set");
}

// --- export_ar: paged invoice + payment history for CSV export. -------------
{
  const b = block("export_ar");
  assert.equal((b.match(/loadAllEntityRows\(/g) || []).length, 2, "invoice + payment paged reads");
  assert.match(b, /entity: Payment,/);
  assert.ok(!b.includes("Invoice.filter(") && !b.includes("Payment.filter("), "no default-page reads in export_ar");
  assert.match(b, /payment_count:/, "payment_count exported for honesty");
}

// --- list_invoiceable_estimates: paged estimates + complete billed map. -----
{
  const b = block("list_invoiceable_estimates");
  assert.equal((b.match(/loadAllEntityRows\(/g) || []).length, 2, "estimate + invoice paged reads");
  assert.match(b, /entity: Estimate,[\s\S]*?query: \{ status: "approved" \}/);
  assert.match(b, /entity: Invoice,/);
  assert.ok(!b.includes("Estimate.filter(") && !b.includes("Invoice.filter("), "no default-page reads in list_invoiceable_estimates");
  assert.match(b, /total_count: matchedEstimates\.length/);
  assert.match(b, /truncated: matchedEstimates\.length > estimates\.length/);
}

// --- email_statement: paged per-customer invoice + estimate reads. ----------
{
  const b = block("email_statement");
  assert.equal((b.match(/loadAllEntityRows\(/g) || []).length, 2, "invoice + estimate paged reads");
  assert.match(b, /entity: Invoice,[\s\S]*?query: \{ customer_id: cid \}/, "statement invoices paged per customer");
  assert.match(b, /entity: Estimate,[\s\S]*?query: \{ customer_id: cid \}/, "statement estimates paged per customer");
  assert.ok(!b.includes("Invoice.filter(") && !b.includes("Estimate.filter("), "no default-page reads in email_statement");
}

// --- get_invoice / revenue_summary regression guards. -----------------------
assert.match(block("get_invoice"), /Payment\.filter\(\{ invoice_id: invoiceId \}, undefined, 500\)/);
{
  const b = block("revenue_summary");
  assert.equal((b.match(/loadAllEntityRows\(/g) || []).length, 2, "revenue_summary stays on the paged loader");
}

// --- Whole-file loader census: 7 new + 2 pre-existing revenue reads. --------
assert.ok((src.match(/loadAllEntityRows\(/g) || []).length >= 9, "all heavy reads use the paged loader");

// --- Syntax: parse the function source with esbuild's TS loader if present. -
try {
  const { transformSync } = await import("esbuild");
  transformSync(src, { loader: "ts" });
} catch (e) {
  assert.ok(/Cannot find (module|package)/.test(String(e?.message || e)), `esbuild parse failed: ${e?.message || e}`);
}

console.log("PASS invoicing scale hardening (paged AR reads + honest counts)");
