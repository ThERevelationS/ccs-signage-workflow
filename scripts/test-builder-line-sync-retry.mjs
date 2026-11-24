import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const entry = path.resolve("src/components/estimator/builder/builderService.js");
const plugin = {
  name: "builder-retry-stubs",
  setup(builder) {
    builder.onResolve({ filter: /staffEntities$/ }, () => ({ path: "staff", namespace: "retry-stub" }));
    builder.onResolve({ filter: /^@\/api\/base44Client$/ }, () => ({ path: "client", namespace: "retry-stub" }));
    builder.onLoad({ filter: /.*/, namespace: "retry-stub" }, ({ path: name }) => ({
      contents: name === "staff"
        ? "export const staffEntities = { AllInOneEstimate: { get: (...args) => globalThis.__retryGet(...args) } };"
        : "export const base44 = { entities: {} }; export const isRetryableFunction = () => false;",
      loader: "js",
    }));
    builder.onLoad({ filter: /builderService\.js$/ }, () => {
      let source = readFileSync(entry, "utf8");
      for (const name of ["recordBuilderSaveOnce", "ensureEstimateBuilderProductsOnce"]) {
        const declaration = `async function ${name}(`;
        assert.ok(source.includes(declaration), `missing ${declaration}`);
        source = source.replace(declaration, `async function ${name}Original(`);
        source += `\nasync function ${name}(...args) { return globalThis.__retryStubs.${name}(...args); }\n`;
      }
      return { contents: source, loader: "js", resolveDir: path.dirname(entry) };
    });
  },
};

const dir = mkdtempSync(path.join(tmpdir(), "builder-line-retry-"));
const originalSetTimeout = globalThis.setTimeout;
try {
  const bundled = await build({
    entryPoints: [entry], bundle: true, platform: "node", format: "esm", write: false,
    define: { "import.meta.env": "{}" }, plugins: [plugin], logLevel: "silent",
  });
  const outfile = path.join(dir, "builder.mjs");
  writeFileSync(outfile, bundled.outputFiles[0].text);
  globalThis.window = { location: { href: "http://test.local" }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  globalThis.document = { title: "", createElement: () => ({}), querySelector: () => null };
  globalThis.localStorage = window.localStorage;
  const service = await import(pathToFileURL(outfile).href);
  const delays = [];
  globalThis.setTimeout = (fn, ms) => { delays.push(ms); queueMicrotask(fn); return 1; };
  const conflict = (label = "Builder save Estimate line synchronization") =>
    new Error(`${label} changed in another session (line_items). Reload before saving. No Estimate fields were overwritten.`);
  const args = { estimateId: "estimate", line: { line_id: "line" }, sourceProject: { id: "source" } };

  {
    const result = { line_id: "saved" }, calls = [];
    globalThis.__retryStubs = {
      recordBuilderSaveOnce: async (value) => {
        calls.push(value);
        if (calls.length === 1) throw conflict();
        return result;
      },
    };
    assert.equal(await service.recordBuilderSave(args), result);
    assert.deepEqual(calls, [args, args]);
    assert.deepEqual(delays.splice(0), [250]);
  }
  {
    const failures = [conflict(), conflict(), conflict()];
    let calls = 0;
    globalThis.__retryStubs.recordBuilderSaveOnce = async () => { throw failures[calls++]; };
    await assert.rejects(service.recordBuilderSave(args), (error) => error === failures[2]);
    assert.equal(calls, 3);
    assert.deepEqual(delays.splice(0), [250, 500]);
  }
  for (const failure of [
    new Error("offline"),
    new Error("Builder changed in another session (line_items). Reload before saving."),
    new Error("Builder changed in another session (status). Reload before saving. No Estimate fields were overwritten."),
  ]) {
    let calls = 0;
    globalThis.__retryStubs.recordBuilderSaveOnce = async () => { calls++; throw failure; };
    await assert.rejects(service.recordBuilderSave(args), (error) => error === failure);
    assert.equal(calls, 1);
    assert.deepEqual(delays.splice(0), []);
  }
  {
    const first = { id: "estimate", updated_date: "old", line_items: [{ line_id: "old" }] };
    const fresh = { id: "estimate", updated_date: "new", line_items: [{ line_id: "new" }] };
    const options = { strictReconciliation: true, onWarning: () => {}, onlyLineIds: ["line"] };
    const seen = [], gets = [];
    globalThis.__retryGet = async (id) => { gets.push(id); return fresh; };
    globalThis.__retryStubs.ensureEstimateBuilderProductsOnce = async (estimate, receivedOptions) => {
      seen.push([estimate, receivedOptions]);
      if (seen.length === 1) throw conflict("Builder estimate line synchronization");
      return estimate;
    };
    assert.equal(await service.ensureEstimateBuilderProducts(first, options), fresh);
    assert.deepEqual(gets, ["estimate"]);
    assert.deepEqual(seen, [[first, options], [fresh, options]]);
    assert.deepEqual(delays.splice(0), [250]);
  }
  {
    const initial = { id: "estimate" }, seen = [], failures = [conflict(), conflict(), conflict()];
    globalThis.__retryGet = async (id) => ({ id, version: seen.length });
    globalThis.__retryStubs.ensureEstimateBuilderProductsOnce = async (estimate) => {
      seen.push(estimate);
      throw failures[seen.length - 1];
    };
    await assert.rejects(service.ensureEstimateBuilderProducts(initial), (error) => error === failures[2]);
    assert.deepEqual(seen.map((item) => item.version), [undefined, 1, 2]);
    assert.deepEqual(delays.splice(0), [250, 500]);
  }
  {
    const readError = new Error("estimate read failed");
    let calls = 0;
    globalThis.__retryGet = async () => { throw readError; };
    globalThis.__retryStubs.ensureEstimateBuilderProductsOnce = async () => { calls++; throw conflict(); };
    await assert.rejects(service.ensureEstimateBuilderProducts({ id: "estimate" }), (error) => error === readError);
    assert.equal(calls, 1);
    assert.deepEqual(delays.splice(0), [250]);
  }
  console.log("PASS builder line-sync retry: both wrappers, bounded attempts, conflict discrimination and fresh estimate reload");
} finally {
  globalThis.setTimeout = originalSetTimeout;
  delete globalThis.__retryStubs;
  delete globalThis.__retryGet;
  rmSync(dir, { recursive: true, force: true });
}
