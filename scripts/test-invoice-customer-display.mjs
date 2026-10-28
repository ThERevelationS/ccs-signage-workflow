import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = JSON.parse(readFileSync(new URL("../base44/entities/Invoice.jsonc", import.meta.url), "utf8"));
const service = readFileSync(new URL("../base44/functions/invoicingAction/entry.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/Invoices.jsx", import.meta.url), "utf8");

assert.ok(schema.properties.customer_display_name, "Invoice schema uses the canonical display field");
assert.equal(schema.properties.customer_name, undefined, "customer_name remains a read-time legacy alias only");
assert.match(service, /customer_display_name: clean\(row\?\.customer_display_name \|\| row\?\.customer_name\)/);
assert.match(service, /customer_display_name: clean\(invoice\.customer_display_name \|\| invoice\.customer_name \|\| customer\?\.company_name\)/);
assert.match(service, /clean\(r\?\.customer_display_name \|\| r\?\.customer_name\)\.toLowerCase\(\)\.includes\(query\)/);
assert.match(service, /inv\.customer_display_name \|\| inv\.customer_name/);
assert.match(page, /invoice\.customer_display_name \|\| invoice\.customer_name \|\| ""/);
assert.match(page, /inv\.customer_display_name \|\| inv\.customer_name \|\| inv\.customer_id/);

console.log("PASS legacy Invoice customer display compatibility (8 assertions)");
