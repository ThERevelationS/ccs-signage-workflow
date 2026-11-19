const fs = require("fs");
const vm = require("vm");
const esbuild = require("esbuild");

let handler;
let maps = [];
let targets = [];
let waiting = 0;
let release;
const barrier = new Promise((resolve) => { release = resolve; });
const entities = {
  LegacyMigrationMap: {
    filter: async () => [...maps],
    create: async (data) => {
      const row = { ...data, id: `map-${maps.length + 1}` };
      maps.push(row);
      return row;
    },
  },
  Invoice: {
    filter: async () => {
      const snapshot = [...targets];
      if (++waiting === 2) release();
      await barrier;
      return snapshot;
    },
    create: async (data) => {
      const row = { ...data, id: `invoice-${targets.length + 1}` };
      targets.push(row);
      return row;
    },
  },
};
const client = { asServiceRole: { entities } };
const source = fs.readFileSync("../ccs-cb-import/base44/functions/corebridgeHistoryImport/entry.ts", "utf8")
  .replace(/^import .*;\s*$/gm, "");
const js = esbuild.transformSync(source, { loader: "ts", target: "es2022" }).code;
vm.runInNewContext(js, {
  Deno: { serve: (fn) => { handler = fn; } },
  createClientFromRequest: () => client,
  withEntityRateLimitRetry: (value) => value,
  authenticateSignShopSession: async () => ({ role: "admin" }),
  Response,
  Object,
  Set,
});
const body = {
  action: "write_rows",
  entity: "Invoice",
  batch_id: "synthetic",
  rows: [{ source_entity: "invoices", source_id: "1", data: { creation_request_key: "cb:invoice:1" } }],
};
const req = () => ({ json: async () => body });
(async () => {
  const responses = await Promise.all([handler(req()), handler(req())]);
  const results = await Promise.all(responses.map((response) => response.json()));
  console.log(JSON.stringify({
    resultStatuses: results.map((value) => value.results[0].status),
    invoiceCount: targets.length,
    ledgerCount: maps.length,
  }));
})();
