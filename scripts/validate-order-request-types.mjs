import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const spreadsheet = readFileSync("src/components/orders/OrderSpreadsheet.jsx", "utf8");
const backend = readFileSync("base44/functions/smartsheetSyncAction/entry.ts", "utf8");
const readiness = readFileSync("src/components/admin/smartsheetCreationReadinessModel.js", "utf8");
const fields = readFileSync("base44/shared/smartsheetSyncFields.ts", "utf8");

assert.match(spreadsheet, /ORDER_REQUEST_TYPES_SETTING_KEY = "orderRequestTypes"/);
assert.match(spreadsheet, /GlobalSettings\.filter\(\{ setting_key: ORDER_REQUEST_TYPES_SETTING_KEY \}\)/);
assert.match(spreadsheet, /currentUser\?\.role === "admin"/);
assert.match(spreadsheet, /action: "order_request_types_save"/);
assert.match(spreadsheet, /expected_setting_id: requestTypeSetting\?\.id \|\| ""/);
assert.match(spreadsheet, /expected_setting_updated_date: requestTypeSetting\?\.updated_date \|\| ""/);
assert.match(spreadsheet, /Manage Order Item Types/);
assert.match(spreadsheet, /Smartsheet Request Type dropdown/);
assert.doesNotMatch(spreadsheet, /localStorage\.setItem\('orderRequestTypes'/);
console.log("PASS Order Form item types are shared, admin-managed and no longer browser-only");

assert.match(backend, /if \(action === 'order_request_types_save'\)/);
assert.match(backend, /adminActor\?\.role !== 'admin'/);
assert.match(backend, /orderProfile\?\.smartsheet_sheet_id/);
assert.match(backend, /orderProfile\?\.column_bindings\?\.request_type/);
assert.match(backend, /const columnPath = `\/sheets\/\$\{sheetId\}\/columns\/\$\{columnId\}`/);
assert.match(backend, /String\(beforeColumn\?\.type \|\| ''\) !== 'PICKLIST'/);
assert.match(backend, /normalizeOrderRequestTypes\(\[\.\.\.requestTypes, \.\.\.existingOptions\]\)/);
assert.match(backend, /smartsheetWriteNoTimeoutRetry\('PUT', columnPath, token/);
assert.match(backend, /const verifiedColumn = \(await smartsheetGet\(columnPath, token\)\)\.body/);
assert.match(backend, /setting_key: ORDER_REQUEST_TYPES_SETTING_KEY, updated_date: currentSetting\.updated_date/);
assert.match(backend, /retained_historical_smartsheet_options/);
console.log("PASS Order item-type save uses permanent Smartsheet IDs, verified PICKLIST update and CAS shared setting");

assert.match(fields, /\{ key: "request_type", label: "Request Type", type: "text" \}/);
assert.doesNotMatch(readiness, /ORDER_REQUEST_TYPES/);
assert.doesNotMatch(readiness, /invalid_request_type/);
assert.match(readiness, /if \(!cleanText\(values\.request_type\)\)/);
console.log("PASS arbitrary nonblank Order item types remain valid through Smartsheet mapping and review");
