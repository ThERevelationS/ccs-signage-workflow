import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const DIR = ".audit-work/foundation-reinforcement18/";
const candidate = JSON.parse(fs.readFileSync(DIR + "cost-print-independent-candidate.json", "utf8"));
const denied = name => `(...args)=>{globalThis.__independentCostIO.push(${JSON.stringify(name)});throw Error("Offline proof forbids "+${JSON.stringify(name)});}`;
const entities = `new Proxy({},{get(_,name){return new Proxy({},{get(_,method){return (...args)=>{globalThis.__independentCostIO.push(String(name)+"."+String(method));throw Error("Offline proof forbids entity I/O");};}});}})`;
const stubs = {
  "@/api/base44Client": `export const base44={entities:${entities},functions:{invoke:${denied("function.invoke")}},
    integrations:new Proxy({},{get(){throw Error("Integrations forbidden");}})};export const isRetryableFunction=()=>false;`,
  "@/components/staff/staffEntities": `export const staffEntities=${entities};`,
  "@/components/auth/EmailGate": `export const getSessionToken=()=>"";export const useAuth=()=>({});`,
  "@/lib/workOrderCache": `export const fetchAllWorkOrders=${denied("board-cache")};`,
  "@/components/workflow/NotificationService": `export const NotificationTriggers=new Proxy({},{get(){return ${denied("notification")};}});`,
};
export async function costPrintCandidateModules(mode = "candidate") {
  assert.ok(["candidate", "baseline", "print-only"].includes(mode));
  globalThis.__independentCostIO ||= [];
  globalThis.fetch = denied("external.fetch");
  const files = mode === "baseline" ? candidate.source : { ...candidate.files };
  if (mode === "print-only") {
    const conversion = "src/components/estimator/workOrderConversion.js";
    files[conversion] = candidate.source[conversion];
  }
  const absoluteFiles = new Map(Object.entries(files).map(([file, contents]) => [path.resolve(file), contents]));
  const result = await build({
    stdin: {
      contents: `
        export {buildEstimateWorkOrderProducts} from "./src/components/estimator/workOrderConversion.js";
        export {buildWorkOrderPrintModel} from "./src/components/jobs/printTemplates/workOrderPrintModel.js";
        export {renderOriginalHtml} from "./src/components/jobs/printTemplates/templates/original.js";`,
      resolveDir: process.cwd(), sourcefile: "independent-cost-print-entry.js", loader: "js",
    },
    bundle: true, platform: "node", format: "esm", jsx: "automatic", write: false, metafile: true,
    external: ["react", "react-dom"],
    plugins: [{ name: "fresh-sandbox-snapshot-with-denied-sdk", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (stubs[args.path]) return { path: args.path, namespace: "offline" };
        if (args.path.startsWith("@/")) return builder.resolve(path.resolve("src", args.path.slice(2)), {
          kind: args.kind, resolveDir: process.cwd(),
        });
        return null;
      });
      builder.onLoad({ filter: /.*/, namespace: "offline" }, args => ({ contents: stubs[args.path], loader: "js" }));
      builder.onLoad({ filter: /\.[jt]sx?$/ }, args => {
        if (!absoluteFiles.has(args.path)) return null;
        return { contents: absoluteFiles.get(args.path), loader: "js" };
      });
    } }],
  });
  for (const file of candidate.targets) assert.ok(result.metafile.inputs[file], "Actual candidate required: " + file);
  for (const file of ["src/components/estimator/customerPricing.js", "src/components/jobs/printTemplates/templates/_shared.js"])
    assert.ok(result.metafile.inputs[file], "Fresh shared snapshot required: " + file);
  assert.ok(!Object.keys(result.metafile.inputs).some(file =>
    /src\/api\/base44Client\.js|node_modules\/@base44\/|foundationReinforcement|foundationCalc\.js|FoundationEstimator\.jsx/.test(file)),
  "No actual SDK or held reinforcement model may enter this proof");
  fs.writeFileSync(DIR + `independent-cost-print-${mode}-meta.json`, JSON.stringify(result.metafile, null, 2) + "\n");
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
}
