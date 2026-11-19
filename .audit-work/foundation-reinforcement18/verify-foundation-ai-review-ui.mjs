import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const DIR = ".audit-work/foundation-reinforcement18/";
const output = DIR + "foundation-ai-review-ui-bundle.mjs";
const result = await build({
  entryPoints: ["src/components/estimator/foundation/AiEngineeringAssistant.jsx"],
  bundle: true, format: "esm", platform: "node", jsx: "automatic", outfile: output, metafile: true,
  external: ["react", "react-dom", "react-test-renderer"],
  plugins: [{ name: "no-real-paid-ai", setup(builder) {
    builder.onResolve({ filter: /^@\/api\/base44Client$/ }, args => ({ path: args.path, namespace: "offline" }));
    builder.onLoad({ filter: /.*/, namespace: "offline" }, () => ({
      contents: `export const base44={integrations:{Core:{InvokeLLM:request=>globalThis.__foundationAiReviewUI.invoke(request)}}};`,
      loader: "js",
    }));
  } }],
});
assert.ok(Object.keys(result.metafile.inputs).includes("src/components/estimator/foundation/foundationAiReview.js"));
assert.ok(!Object.keys(result.metafile.inputs).some(file => /base44Client\.js|node_modules\/@base44/.test(file)));
fs.writeFileSync(DIR + "foundation-ai-review-ui-meta.json", JSON.stringify(result.metafile, null, 2) + "\n");
const { default: Component } = await import(pathToFileURL(path.resolve(output)));
const prepared = await build({
  entryPoints: ["src/components/estimator/foundation/foundationAiReview.js"], bundle: true,
  platform: "node", format: "esm", write: false,
});
const { prepareFoundationAiReview, foundationAiReviewPatch } = await import("data:text/javascript;base64,"
  + Buffer.from(prepared.outputFiles[0].text).toString("base64"));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.fetch = () => { throw Error("No external network or paid model calls in this fixture"); };
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const project = freeze({ id: "synthetic-ai-project", updated_date: "saved-version", project_concrete_type: "Synthetic mix",
  items: [{ foundation_type: "spread_foot", quantity: 1, length_inches: 36, width_inches: 36,
    depth_inches: 36, include_rebar: false, rebar_cost: 0, custom_rebar_qty: 0 }], poles: [],
  engineering_approved: false, procurement_ready: false });
const response = freeze({ recommendation_markdown: "Preliminary review: verify missing site criteria with a qualified engineer.",
  information_gaps: ["Verify site-specific wind criteria."] });
const deferred = () => {
  let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const allText = node => !node ? "" : typeof node === "string" ? node
  : (Array.isArray(node) ? node : node.children || []).map(allText).join(" ");
async function mount(initial = project) {
  const env = { calls: [], patches: [], outcome: response, callback: null };
  env.invoke = request => { env.calls.push(structuredClone(request)); return Promise.resolve(env.outcome); };
  const onResult = patch => env.callback ? env.callback(patch) : env.patches.push(structuredClone(patch));
  globalThis.__foundationAiReviewUI = env;
  let renderer, current = initial, mounted = true;
  await act(async () => { renderer = TestRenderer.create(React.createElement(Component, { project: current, onResult })); });
  const button = () => renderer.root.findAllByType("button").find(node => /Review Foundation Inputs|Reviewing/.test(allText(node)));
  return {
    env, button, text: () => allText(renderer.toJSON()),
    async run() { await act(async () => { await button().props.onClick(); }); },
    async update(next, callback = onResult) { current = next; await act(async () => { renderer.update(React.createElement(Component, { project: current, onResult: callback })); }); },
    async unmount() { if (mounted) { mounted = false; await act(async () => { renderer.unmount(); }); } },
    async start() { let pending; await act(async () => { pending = button().props.onClick(); }); return { pending }; },
  };
}
const results = [];
async function check(name, fn, initial = project) {
  const m = await mount(initial), original = JSON.stringify(initial);
  try { await fn(m); assert.equal(JSON.stringify(initial), original); results.push({ name, ok: true }); console.log("ok", name); }
  catch (error) { results.push({ name, ok: false, error: error.stack }); console.error("FAIL", name, error.message); }
  finally { await m.unmount(); }
}
await check("manual review invokes only flagship Base44 request and emits advisory-only fields with no approval", async m => {
  assert.ok(m.button()); assert.match(m.text(), /AI Preliminary Review/);
  assert.match(m.text(), /not structural calculations or approval/i);
  await m.run(); assert.equal(m.env.calls.length, 1); assert.equal(m.env.calls[0].model, "gpt_6_sol");
  assert.equal(m.env.patches.length, 1);
  const patch = m.env.patches[0];
  assert.deepEqual(Object.keys(patch).sort(), ["ai_engineering_data", "ai_engineering_recommendation"]);
  assert.equal(patch.ai_engineering_data.engineering_approved, false);
  assert.equal(patch.ai_engineering_data.review_status, "preliminary_only");
  assert.ok(!m.env.calls[0].prompt.includes('"rebar_cost"'));
});
await check("synchronous duplicate callbacks share one paid-call boundary rather than relying only on disabled render state", async m => {
  const wait = deferred(); m.env.outcome = wait.promise;
  const invoke = m.button().props.onClick; let first, second;
  await act(async () => { first = invoke(); second = invoke(); });
  assert.equal(m.env.calls.length, 1); assert.equal(m.button().props.disabled, true);
  await act(async () => { wait.resolve(response); await Promise.all([first, second]); });
  assert.equal(m.env.patches.length, 1); assert.equal(m.button().props.disabled, false);
});
await check("geometry edited during review discards stale response and asks for a fresh explicit run", async m => {
  const wait = deferred(); m.env.outcome = wait.promise; const { pending } = await m.start();
  await m.update(freeze({ ...project, items: [{ ...project.items[0], depth_inches: 48 }] }));
  await act(async () => { wait.resolve(response); await pending; });
  assert.equal(m.env.patches.length, 0); assert.match(m.text(), /design changed/i);
  assert.equal(m.env.calls.length, 1);
});
await check("same geometry under another project identity cannot receive the previous project review", async m => {
  const wait = deferred(); m.env.outcome = wait.promise; const { pending } = await m.start();
  await m.update(freeze({ ...project, id: "other-project" }));
  await act(async () => { wait.resolve(response); await pending; });
  assert.equal(m.env.patches.length, 0); assert.match(m.text(), /design changed/i);
});
await check("unmount invalidates in-flight response without callback or silent backend write", async m => {
  const wait = deferred(); m.env.outcome = wait.promise; const { pending } = await m.start();
  await m.unmount(); await act(async () => { wait.resolve(response); await pending; });
  assert.equal(m.env.patches.length, 0); assert.equal(m.env.calls.length, 1);
});
await check("unexpected AI money or adequacy fields reject the response without touching the estimate", async m => {
  for (const extra of [{ rebar_cost: 999 }, { adequate: true }, { engineering_approved: true }]) {
    m.env.outcome = { ...response, ...extra }; await m.run();
    assert.equal(m.env.patches.length, 0); assert.match(m.text(), /unexpected fields/i);
  }
});
await check("transport failure surfaces an error and never retries the model automatically", async m => {
  m.env.invoke = request => { m.env.calls.push(request); return Promise.reject(Error("Synthetic AI unavailable")); };
  await m.run(); assert.equal(m.env.calls.length, 1); assert.equal(m.env.patches.length, 0);
  assert.match(m.text(), /Synthetic AI unavailable/); assert.equal(m.button().props.disabled, false);
});
await check("malformed or empty design inputs disable paid invocation and show an actionable reason", async m => {
  assert.equal(m.button().props.disabled, true); await m.run();
  assert.equal(m.env.calls.length, 0); assert.equal(m.env.patches.length, 0);
  assert.match(m.text(), /Add a foundation or pole/);
}, freeze({ id: "empty-design", items: [], poles: [] }));
await check("a parent refusing the advisory patch does not look like a successful review attachment", async m => {
  m.env.callback = () => false; await m.run();
  assert.equal(m.env.patches.length, 0); assert.match(m.text(), /could not be attached|not applied/i);
});
await check("historical note stays readable but is explicitly unverified regardless of old adequate true metadata", async m => {
  assert.match(m.text(), /Legacy recommendation/); assert.match(m.text(), /historical.*unverified|unverified.*historical/i);
  assert.match(m.text(), /not structural calculations or approval/i); assert.equal(m.env.calls.length, 0);
}, freeze({ ...project, ai_engineering_recommendation: "Legacy recommendation", ai_engineering_data: { adequate: true, assumed_wind_speed_mph: 115 } }));
const receipt = foundationAiReviewPatch(response, { sourceKey: prepareFoundationAiReview(project).key, generatedAt: "2026-11-07T12:00:00Z" });
await check("recorded advisory note is visibly stale after physical edits with no automatic reanalysis", async m => {
  assert.match(m.text(), /Preliminary review/); assert.ok(!/design changed since/i.test(m.text()));
  await m.update(freeze({ ...project, ...receipt, items: [{ ...project.items[0], width_inches: 48 }] }));
  assert.match(m.text(), /design changed since/i); assert.equal(m.env.calls.length, 0);
}, freeze({ ...project, ...receipt }));
await check("manual retry after a failure makes exactly one new request and clears the previous error", async m => {
  let attempts = 0;
  m.env.invoke = request => { m.env.calls.push(request); return ++attempts === 1
    ? Promise.reject(Error("Synthetic temporary failure")) : Promise.resolve(response); };
  await m.run(); assert.match(m.text(), /Synthetic temporary failure/);
  await m.run(); assert.equal(m.env.calls.length, 2); assert.equal(m.env.patches.length, 1);
  assert.ok(!m.text().includes("Synthetic temporary failure"));
});
await check("pending response calls the latest allowed callback rather than an obsolete parent closure", async m => {
  const wait = deferred(); m.env.outcome = wait.promise; const { pending } = await m.start();
  let accepted = 0;
  await m.update(project, () => { accepted += 1; return false; });
  await act(async () => { wait.resolve(response); await pending; });
  assert.equal(accepted, 1); assert.equal(m.env.patches.length, 0); assert.match(m.text(), /could not be attached|not applied/i);
});
await check("input diagnostics follow the current invalid collection instead of retaining a previous render error", async m => {
  assert.match(m.text(), /Add a foundation or pole/);
  await m.update(freeze({ id: "bad-poles", items: [], poles: {} }));
  assert.match(m.text(), /Poles must contain/); assert.ok(!m.text().includes("Add a foundation or pole"));
  assert.equal(m.button().props.disabled, true); assert.equal(m.env.calls.length, 0);
  await m.update(project); assert.equal(m.button().props.disabled, false);
  assert.ok(!m.text().includes("Poles must contain"));
}, freeze({ id: "empty", items: [], poles: [] }));
await check("saved note cannot appear current when the active design is malformed or unavailable", async m => {
  await m.update(freeze({ ...project, ...receipt, items: {} }));
  assert.match(m.text(), /design changed since/i);
  assert.equal(m.button().props.disabled, true); assert.equal(m.env.calls.length, 0);
}, freeze({ ...project, ...receipt }));
fs.writeFileSync(DIR + "foundation-ai-review-ui-verification.json", JSON.stringify({
  results, syntheticOnly: true, actualModelCalled: false, engineeringApproved: false, financialValuesApplied: false,
}, null, 2) + "\n");
if (results.some(result => !result.ok)) process.exitCode = 1;
