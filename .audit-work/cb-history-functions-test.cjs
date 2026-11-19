const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const esbuild = require("esbuild");

let role = "admin";
let seq = 0;
const db = {};
for (const name of ["LegacyMigrationMap", "Invoice", "Payment", "ReconciliationBatch", "AllInOneEstimate", "WorkOrder", "Customer"]) db[name] = [];
const entities = Object.fromEntries(Object.entries(db).map(([name, rows]) => [name, {
  async filter(query, sort, limit = 50, skip = 0) {
    assert.equal(typeof sort === "object" && sort !== null, false, "positional filter required");
    return rows.filter((row) => Object.entries(query).every(([k, v]) => v && typeof v === "object" && "$in" in v ? v.$in.includes(row[k]) : row[k] === v))
      .slice(skip, skip + limit);
  },
  async get(id) { return rows.find((row) => row.id === id) || null; },
  async create(data) { const row = { ...data, id: `${name}-${++seq}` }; rows.push(row); return row; },
  async update(id, data) { const row = rows.find((item) => item.id === id); Object.assign(row, data); return row; },
}]));
const client = { asServiceRole: { entities } };
function load(path) {
  let handler;
  const source = fs.readFileSync(path, "utf8").replace(/^import .*;\s*$/gm, "");
  const js = esbuild.transformSync(source, { loader: "ts", target: "es2022" }).code;
  vm.runInNewContext(js, {
    Deno: { serve: (fn) => { handler = fn; } },
    createClientFromRequest: () => client,
    withEntityRateLimitRetry: (value) => value,
    authenticateSignShopSession: async () => ({ role }),
    Response, Object, Set, Map,
  });
  return async (body) => {
    const response = await handler({ json: async () => body });
    return { status: response.status, data: await response.json() };
  };
}
const writer = load("../ccs-cb-import/base44/functions/corebridgeHistoryImport/entry.ts");
const history = load("../ccs-cb-import/base44/functions/customerHistoryList/entry.ts");
const feed = load("../ccs-cb-import/base44/functions/customerHistoryFeed/entry.ts");
(async () => {
  const row = { source_entity: "invoices", source_id: "1", data: { creation_request_key: "cb:invoice:1", customer_id: "customer-1" } };
  const payload = { action: "write_rows", entity: "Invoice", batch_id: "synthetic", rows: [row] };
  let result = await writer(payload);
  assert.equal(result.data.results[0].status, "created");
  result = await writer(payload);
  assert.equal(result.data.results[0].status, "existing");
  assert.equal(db.Invoice.length, 1);
  assert.equal(db.LegacyMigrationMap.length, 1);
  result = await writer({ action: "find_by_keys", entity: "Invoice", keys: ["cb:invoice:1", "cb:invoice:missing"] });
  assert.deepEqual(result.data.results.map((x) => x.matches.length), [1, 0]);
  db.Invoice.push({ id: "adopted", creation_request_key: "cb:invoice:2", customer_id: "customer-1" });
  const adopt = { ...payload, adopt: true, rows: [{ source_entity: "invoices", source_id: "2", data: { creation_request_key: "cb:invoice:2" } }] };
  result = await writer(adopt);
  assert.equal(result.data.results[0].status, "existing");
  result = await writer({ ...adopt, rows: [{ source_entity: "invoices", source_id: "3", data: { creation_request_key: "cb:invoice:3" } }] });
  assert.equal(result.data.results[0].status, "error");
  assert.equal(db.Invoice.length, 2);
  result = await writer({ action: "update_rows", entity: "Invoice", rows: [{ id: "adopted", set: { creation_request_key: "other" } }] });
  assert.equal(result.data.results[0].status, "error");
  db.AllInOneEstimate.push({ id: "est-1", customer_id: "customer-1" }, { id: "est-2", customer_id: "customer-2" });
  db.WorkOrder.push({ id: "job-1", customer_id: "customer-1", estimate_id: "est-1" });
  result = await writer({ action: "lookup_links", estimate_ids: ["est-1", "est-2", "est-missing"] });
  assert.deepEqual(result.data.links.map((x) => x.work_order_ids.length), [1, 0, 0]);
  assert.equal(result.data.links[2].customer_id, "");
  role = "staff";
  assert.equal((await writer(payload)).status, 403);
  db.Customer.push({ id: "customer-1" });
  db.AllInOneEstimate.push({ id: "deleted", customer_id: "customer-1", deleted: true });
  db.Payment.push({ id: "pay-1", customer_id: "customer-1", amount: 5, secret: "must not leak" });
  result = await history({ customer_id: "customer-1" });
  assert.equal(result.status, 200);
  assert.equal(result.data.estimates.length, 1);
  assert.equal(result.data.jobs.length, 1);
  assert.equal(result.data.invoices.length, 2);
  assert.equal(result.data.payments.length, 1);
  assert.equal("secret" in result.data.payments[0], false);
  result = await feed({ action: "get", customer_id: "customer-1" });
  assert.equal(result.status, 200);
  assert.equal(result.data.totals.estimates, 1);
  assert.equal(result.data.totals.jobs, 1);
  assert.equal(result.data.totals.invoices, 2);
  assert.equal("payments" in result.data, false);
  assert.equal((await feed({ customer_id: "customer-1" })).status, 400);
  db.Customer.push({ id: "customer-2" });
  for (let i = 0; i < 1001; i++) db.AllInOneEstimate.push({ id: `many-${i}`, customer_id: "customer-2", quote_issue_date: `2020-${String((i % 12) + 1).padStart(2, '0')}-01` });
  result = await feed({ action: "get", customer_id: "customer-2" });
  assert.equal(result.data.estimates.length, 1000);
  assert.equal(result.data.truncated.estimates, true);
  assert.equal(result.data.totals.estimates, 1000);
  assert.ok(result.data.estimates[0].quote_issue_date >= result.data.estimates.at(-1).quote_issue_date);
  console.log("PASS history functions: auth, idempotent sequential writes, adoption, projections, links, feed cap");
})().catch((error) => { console.error(error); process.exitCode = 1; });
