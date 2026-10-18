import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const helperSource = readFileSync(path.join(root, "base44/functions/fleetRequestAction/requestValidation.ts"), "utf8");
const helperJs = ts.transpileModule(helperSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const helper = await import("data:text/javascript;base64," + Buffer.from(helperJs).toString("base64"));
const { validateOptionalFleetUnitCost } = helper;
const endpoint = readFileSync(path.join(root, "base44/functions/fleetRequestAction/entry.ts"), "utf8");

function blockBetween(start, end) {
  const startIndex = endpoint.indexOf(start);
  const endIndex = endpoint.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section: ${start}`);
  assert.notEqual(endIndex, -1, `missing end section: ${end}`);
  return endpoint.slice(startIndex, endIndex);
}

test("optional costs allow blank, zero, and non-negative finite amounts", () => {
  for (const value of [undefined, null, "", "  "]) {
    assert.deepEqual(validateOptionalFleetUnitCost(value), { valid: true, provided: false, value: undefined });
  }
  for (const [input, expected] of [[0, 0], ["0", 0], ["12.34", 12.34], [125.5, 125.5]]) {
    assert.deepEqual(validateOptionalFleetUnitCost(input), { valid: true, provided: true, value: expected });
  }
});

test("negative, malformed, non-finite, and non-scalar costs fail closed", () => {
  for (const value of [-0.01, "-1", "not a price", "Infinity", Infinity, NaN, true, {}]) {
    assert.equal(validateOptionalFleetUnitCost(value).valid, false, String(value));
  }
});

test("create, edit, and order validate unit cost before writing the request", () => {
  const create = blockBetween("if (action === 'create')", "if (action === 'update')");
  const update = blockBetween("if (action === 'update')", "if (action === 'cancel')");
  const order = blockBetween("if (action === 'order')", "if (action === 'receive')");
  for (const section of [create, update, order]) {
    assert.match(section, /validateOptionalFleetUnitCost\(/);
    assert.match(section, /Fleet request unit cost must be a finite non-negative amount/);
  }
  assert.match(order, /unit_cost: requestedCost\.provided \? requestedCost\.value : existing\.unit_cost/);
});

test("receive blocks invalid legacy costs before claiming or changing Fleet inventory", () => {
  const receiveStart = endpoint.indexOf("if (action === 'receive')");
  assert.ok(receiveStart >= 0);
  const receive = endpoint.slice(receiveStart);
  const validationIndex = receive.indexOf("const storedCost = validateOptionalFleetUnitCost(existing.unit_cost)");
  const claimIndex = receive.indexOf("const claim = await claimReceipt(Receipt");
  const inventoryIndex = receive.indexOf("Part.create({");
  assert.ok(validationIndex >= 0);
  assert.ok(claimIndex > validationIndex);
  assert.ok(inventoryIndex > validationIndex);
  assert.match(receive.slice(0, claimIndex), /invalid stored unit cost/);
});
