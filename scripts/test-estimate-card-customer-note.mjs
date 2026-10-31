import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { act, create } from "react-test-renderer";

const here = dirname(fileURLToPath(import.meta.url));
const temp = mkdtempSync(resolve(here, ".tmp-estimate-card-note-"));
const calls = [];
globalThis.__getCustomerForEstimateCard = async (id) => {
  calls.push(id);
  return { id, notes: "Synthetic service entrance is on the north side." };
};
const stubs = {
  "react-router-dom": 'import React from "react"; export const Link = ({to,children,...props}) => <a href={to} {...props}>{children}</a>;',
  "lucide-react": 'import React from "react"; export const FileText=()=>null; export const User=()=>null; export const Calendar=()=>null;',
  "date-fns": 'export const format = (value) => String(value);',
  "@/components/estimator/quoteLifecycle": 'export const isQuoteExpired=()=>false; export const localDateStamp=()=>""; export const quoteExpirationDate=()=>""; export const estimateQuoteExpiration=()=>""; export const formatQuoteIssueDate=()=>""; export const resolveQuoteIssueMetadata=()=>({});',
  "@/components/staff/staffEntities": "export const staffEntities = { Customer: { get: (...args) => globalThis.__getCustomerForEstimateCard(...args) } };",
};
const outfile = resolve(temp, "estimate-card.mjs");
await build({
  entryPoints: [resolve(here, "../src/components/estimator/EstimateCard.jsx")],
  bundle: true, format: "esm", platform: "node", outfile,
  external: ["react", "react-test-renderer"],
  jsx: "automatic", logLevel: "silent",
  plugins: [{
    name: "synthetic-customer-note-dependencies",
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => {
        if (Object.hasOwn(stubs, args.path)) return { path: args.path, namespace: "synthetic" };
      });
      builder.onLoad({ filter: /.*/, namespace: "synthetic" }, (args) => ({ contents: stubs[args.path], loader: "jsx" }));
    },
  }],
});
const { default: EstimateCard } = await import(pathToFileURL(outfile).href);

const failures = [];
let passed = 0;
async function test(name, run) {
  try {
    await run();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(error);
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

try {
  await test("customer notes load lazily on estimate-card hover/focus", async () => {
    calls.length = 0;
    let tree;
    await act(async () => { tree = create(React.createElement(EstimateCard, { estimate: { id: "estimate-a", customer_id: "customer-a", line_items: [] } })); });
    try {
      const card = tree.root.findByType("a");
      assert.equal(tree.root.findAllByProps({ role: "tooltip" }).length, 0);
      await act(async () => { card.props.onMouseEnter(); await new Promise((resolvePromise) => setTimeout(resolvePromise, 0)); });
      const tooltip = tree.root.findByProps({ role: "tooltip" });
      assert.equal(card.props["aria-describedby"], "estimate-estimate-a-customer-note");
      assert.equal(tooltip.props.id, "estimate-estimate-a-customer-note");
      assert.match(tooltip.children.join(""), /Synthetic service entrance is on the north side/);
      assert.deepEqual(calls, ["customer-a"]);
    } finally {
      await act(async () => { tree.unmount(); });
    }
  });

  await test("customer note requests are deduplicated and cached across estimate cards", async () => {
    calls.length = 0;
    let tree;
    await act(async () => {
      tree = create(React.createElement("div", null,
        React.createElement(EstimateCard, { estimate: { id: "estimate-b", customer_id: "shared-customer", line_items: [] } }),
        React.createElement(EstimateCard, { estimate: { id: "estimate-c", customer_id: "shared-customer", line_items: [] } }),
      ));
    });
    try {
      const cards = tree.root.findAllByType("a");
      await act(async () => {
        cards[0].props.onMouseEnter();
        cards[1].props.onFocus();
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
      });
      assert.deepEqual(calls, ["shared-customer"]);
      assert.equal(tree.root.findAllByProps({ role: "tooltip" }).length, 2);
    } finally {
      await act(async () => { tree.unmount(); });
    }
  });

  await test("estimates without a customer link do not make customer reads", async () => {
    calls.length = 0;
    let tree;
    await act(async () => { tree = create(React.createElement(EstimateCard, { estimate: { id: "estimate-no-customer", line_items: [] } })); });
    try {
      await act(async () => { tree.root.findByType("a").props.onMouseEnter(); });
      assert.deepEqual(calls, []);
      assert.equal(tree.root.findAllByProps({ role: "tooltip" }).length, 0);
    } finally {
      await act(async () => { tree.unmount(); });
    }
  });
} finally {
  delete globalThis.__getCustomerForEstimateCard;
  rmSync(temp, { recursive: true, force: true });
}
if (failures.length) process.exitCode = 1;
else console.log(`PASS estimate-card customer notes (${passed} regression groups)`);
