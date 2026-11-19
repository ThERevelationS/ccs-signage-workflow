import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "@babel/parser";

const DIR = ".audit-work/estimator-invokellm-policy";
const canonical = path.resolve("base44/shared/estimatorAiModelPolicy.js");
const policy = await import(pathToFileURL(canonical));
const baseline = JSON.parse(fs.readFileSync(`${DIR}/source-baseline.json`, "utf8")).files.filter(f => !f.error);
const expectedKeys = ["foundation", "channel_letters", "maintenance", "painting", "laser", "cnc", "metal", "vinyl"];
const results = [], observed = [];
const norm = text => text.replace(/\r\n/g, "\n");
const ast = text => parse(norm(text), { sourceType: "module", plugins: ["jsx"] });
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach(n => walk(n, visit)); return; }
  visit(node);
  for (const value of Object.values(node)) if (value && typeof value === "object") walk(value, visit);
}
function key(node) { return node?.name ?? node?.value; }
function invokes(program) {
  const calls = [];
  walk(program, node => {
    if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression") return;
    const method = node.callee;
    if (key(method.property) === "InvokeLLM") {
      assert.equal(key(method.object.property), "Core");
      assert.equal(key(method.object.object.property), "integrations");
      assert.equal(method.object.object.object.name, "base44");
      calls.push(node);
    }
  });
  return calls;
}
function strip(value) {
  if (Array.isArray(value)) return value.map(strip);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([k]) => !["start", "end", "loc", "extra", "comments", "leadingComments", "trailingComments", "innerComments"].includes(k))
    .map(([k, v]) => [k, strip(v)]));
}
function signature(program) {
  for (const call of invokes(program)) {
    call.arguments[0].properties = call.arguments[0].properties.filter(p => key(p.key) !== "model");
  }
  program.program.body = program.program.body.filter(node => {
    if (node.type !== "ImportDeclaration") return true;
    if (node.source.value.endsWith("/estimatorAiModelPolicy.js")) return false;
    if (node.source.value === "react") {
      node.specifiers = node.specifiers.filter(s => !(s.type === "ImportDefaultSpecifier" && s.local.name === "React"));
      return node.specifiers.length > 0;
    }
    return true;
  });
  return strip(program);
}
function safeSpread(node) {
  if (node.type === "ConditionalExpression") { safeSpread(node.consequent); safeSpread(node.alternate); return; }
  assert.equal(node.type, "ObjectExpression", "Unknown dynamic request spread could override model.");
  for (const prop of node.properties) {
    assert.equal(prop.type, "ObjectProperty");
    assert.equal(prop.computed, false);
    assert.equal(key(prop.key), "file_urls", "Only the existing bounded file-reference spread is allowed.");
  }
}
async function check(name, run) {
  try { await run(); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
}
for (const moduleKey of expectedKeys) await check(`module ${moduleKey}: shared flagship via InvokeLLM`, () => {
  assert.equal(policy.estimatorAiModelFor(moduleKey), "gpt_6_sol");
  assert.equal(policy.ESTIMATOR_AI_MODEL, "gpt_6_sol");
  assert.equal(policy.ESTIMATOR_AI_TRANSPORT, "base44.integrations.Core.InvokeLLM");
});
await check("exact module set, immutable list and no unknown-module fallback", () => {
  assert.deepEqual([...policy.ESTIMATOR_AI_MODULE_KEYS], expectedKeys);
  assert.ok(Object.isFrozen(policy.ESTIMATOR_AI_MODULE_KEYS));
  for (const value of [undefined, null, "", "foundation ", "other", {}, ["foundation"]]) {
    assert.throws(() => policy.estimatorAiModelFor(value), /Unsupported estimator AI module/);
  }
});
const originalFetch = globalThis.fetch;
let foreignCalls = 0;
globalThis.fetch = () => { foreignCalls++; throw new Error("No network or paid inference in this test."); };
try {
  for (const file of baseline) {
    const source = norm(fs.readFileSync(file.path, "utf8"));
    const program = ast(source), calls = invokes(program);
    await check(`${file.path}: one canonical model property, no behavior/schema/prompt drift`, () => {
      assert.equal(calls.length, 1);
      const arg = calls[0].arguments[0];
      assert.equal(arg.type, "ObjectExpression");
      const models = arg.properties.filter(p => key(p.key) === "model");
      assert.equal(models.length, 1);
      assert.equal(models[0].computed, false);
      assert.equal(models[0].value.type, "Identifier");
      assert.equal(models[0].value.name, "ESTIMATOR_AI_MODEL");
      for (const prop of arg.properties) if (prop.type === "SpreadElement") safeSpread(prop.argument);
      const imports = program.program.body.filter(n => n.type === "ImportDeclaration"
        && n.source.value.endsWith("/estimatorAiModelPolicy.js"));
      assert.equal(imports.length, 1);
      assert.equal(path.resolve(path.dirname(file.path), imports[0].source.value), canonical);
      assert.ok(imports[0].specifiers.some(s => s.imported?.name === "ESTIMATOR_AI_MODEL"
        && s.local.name === "ESTIMATOR_AI_MODEL"));
      assert.deepEqual(signature(ast(source)), signature(ast(file.content)));
    });
    await check(`${file.path}: synthetic SDK observes actual source request and unchanged payload`, async () => {
      assert.equal(calls.length, 1);
      let schema;
      walk(program, node => {
        if (node.type === "VariableDeclarator" && node.id.name === "SCHEMA") {
          assert.equal(node.init.type, "ObjectExpression");
          schema = new Function(`return (${source.slice(node.init.start, node.init.end)});`)();
        }
      });
      const fixture = {
        ESTIMATOR_AI_MODEL: policy.ESTIMATOR_AI_MODEL,
        summary: [{ n: 1, type: "spread_foot", quantity: 1, length_in: 36, width_in: 36, depth_in: 36 }],
        poles: [], project: { project_concrete_type: "synthetic" }, file_url: "https://synthetic.invalid/reference.svg",
        rawText: "Synthetic scope only", q: "123 Synthetic", SCHEMA: schema,
        imageInstructions: "Synthetic reference context", hasText: true, hasImages: false, mockups: [],
      };
      const paramsSeen = [];
      const sdk = { integrations: { Core: { InvokeLLM: async params => { paramsSeen.push(params); return { synthetic: true }; } } } };
      const evaluate = (text, arg) => new Function("sdk", ...Object.keys(fixture),
        `return sdk.integrations.Core.InvokeLLM(${text.slice(arg.start, arg.end)});`)(sdk, ...Object.values(fixture));
      const response = await evaluate(source, calls[0].arguments[0]);
      assert.deepEqual(response, { synthetic: true });
      assert.equal(paramsSeen.length, 1);
      assert.equal(paramsSeen[0].model, "gpt_6_sol");
      assert.equal(typeof paramsSeen[0].prompt, "string");
      assert.equal(typeof paramsSeen[0].response_json_schema, "object");
      assert.ok(!(paramsSeen[0].file_urls?.length && paramsSeen[0].add_context_from_internet));
      const oldSource = norm(file.content), oldArg = invokes(ast(oldSource))[0].arguments[0];
      await evaluate(oldSource, oldArg);
      const { model: _newModel, ...newParams } = paramsSeen[0];
      const { model: _oldModel, ...oldParams } = paramsSeen[1];
      assert.deepEqual(newParams, oldParams);
      if (file.path.endsWith("AIInstallScopeModal.jsx")) {
        fixture.hasImages = true; fixture.mockups = [{ url: "https://synthetic.invalid/image.png" }];
        await evaluate(source, calls[0].arguments[0]);
        assert.equal(paramsSeen[2].model, "gpt_6_sol");
        assert.deepEqual(paramsSeen[2].file_urls, ["https://synthetic.invalid/image.png"]);
      }
      observed.push({ file: file.path, requestedModel: paramsSeen[0].model, SDK: "synthetic", providerCalls: 0 });
    });
  }
  await check("no foreign requests or real provider invocations", () => {
    assert.equal(foreignCalls, 0);
    assert.equal(observed.length, 6);
  });
} finally { globalThis.fetch = originalFetch; }
fs.writeFileSync(`${DIR}/policy-verification.json`, JSON.stringify({
  synthetic: true, providerCalls: 0, foreignRequests: foreignCalls, observed, results,
}, null, 2) + "\n");
const failed = results.filter(r => !r.ok).length;
console.log(`InvokeLLM policy: ${results.length - failed}/${results.length} passed; failed=${failed}`);
process.exitCode = failed ? 1 : 0;
