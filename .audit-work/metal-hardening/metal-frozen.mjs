// Shared frozen-source + stub machinery for the metal page/browser harnesses.
// Every import inside the bundled page resolves to either frozen remote source,
// a local candidate, an explicit boundary/visual-leaf stub, or an allowlisted
// real package — anything else throws at build time. Mirrors the landed
// painting-hardening harness exactly.
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";

export const E = ".audit-work/metal-hardening/";
export const hash = (t) => createHash("sha256").update(t).digest("hex");
const readText = (p) => fs.readFileSync(p, "utf8");
const remoteSrc = (p) => readText(E + "remote/" + p);
const M = "/app/src/components/estimator/metal/";

export function frozenSources({ remotePage = false } = {}) {
  const sources = new Map();
  const REMOTE_FILES = [
    "src/components/markup/projectCategorizer.jsx",
    "src/components/estimator/builder/itemIdentity.js",
    "src/components/channelLetterInstall/TabBadgeTrigger.jsx",
  ];
  for (const f of REMOTE_FILES) sources.set("/app/" + f, remoteSrc(f));
  sources.set(M + "metalPricingAvailability.js",
    readText(E + "candidates/src/components/estimator/metal/metalPricingAvailability.js"));
  sources.set("/app/src/pages/MetalEstimator.jsx",
    remotePage
      ? remoteSrc("src/pages/MetalEstimator.jsx") // RED: the REAL remote page, defects intact
      : readText(E + "candidates/src/pages/MetalEstimator.jsx"));
  return sources;
}

export function makeStubs(sources) {
  const STUBS = {
    "@/api/gatedEntities": `
      export const MetalProject = {
        get: async (id) => { globalThis.__spies.push(['projectGet', id]); return globalThis.__project ?? null; },
      };
      export const Settings = (globalThis.__entSettings ||= {__ent:'settings'});
      export const Inventory = (globalThis.__entInventory ||= {__ent:'inventory'});`,
    "@/components/staff/staffEntities": `
      export const staffEntities = {
        AllInOneEstimate: { get: async (id) => globalThis.__estimate ?? null },
      };`,
    "@/api/base44Client": `const fail=()=>{globalThis.__unexpectedSdk++;throw Error("Unexpected SDK access in the metal page proof");};
      const entity=new Proxy({},{get:()=>fail});
      export const base44={functions:{invoke:fail},entities:new Proxy({},{get:()=>entity})};`,
    "@/components/estimator/loadAllEntityRows": `
      export async function loadAllEntityRows(a){
        globalThis.__catalogReads.push(a.label);
        if(a.entity===globalThis.__entSettings) return globalThis.__settingRows||[];
        if(a.entity===globalThis.__entInventory) return globalThis.__inventoryRows||[];
        return [];
      }
      export const primeEntityRowsCache=()=>{};`,
    "@/components/estimator/builder/sourceProjectPersistence": `
      export const updateBuilderSourceProject = async (a) => { globalThis.__spies.push(['saveSource', a]); return { ...a.data, id: a.sourceId, updated_date: 'v2' }; };
      export const preflightBuilderSourceMutation = async (a) => { globalThis.__spies.push(['preflight', a]); };`,
    "@/components/estimator/idempotentEntityCreate": `
      export const ensureIdempotentEntityCreate = async (a) => { globalThis.__spies.push(['ensureIdempotent', a]); return { ...a.data, id: 'new-1', updated_date: 'v1' }; };
      export const newCreationRequestKey = (k) => 'key-' + k + '-' + (globalThis.__kseq = (globalThis.__kseq || 0) + 1);`,
    "@/components/estimator/builder/builderService": `
      export const recordBuilderSave = async (a) => { globalThis.__spies.push(['recordBuilderSave', a]); return { ok: true }; };`,
    "@/components/estimator/moduleShared/moduleProjectActions": `
      export const saveModuleProjectCopy = async (a) => { globalThis.__spies.push(['saveCopy', a]); return { id: 'copy-1' }; };`,
    "@/components/markup/savedCustomerPricing": `
      export async function calculateSavedCustomerPricing(a){ globalThis.__spies.push(['pricing', a]); return null; }`,
    "@/components/markup/CustomerPricingTab": `export default ()=><div data-stub="CustomerPricingTab"/>;`,
    "@/components/estimator/moduleShared/ModuleActionBar": `export default (p)=><button type="button" data-stub="copy" onClick={p.onSaveAsCopy}>copy</button>;`,
    "@/components/estimator/moduleShared/ModuleTemplateDialog": `export default ()=>null;`,
    "@/components/ui/input": `export const Input=(p)=><input {...p}/>;`,
    "@/components/ui/textarea": `export const Textarea=(p)=><textarea {...p}/>;`,
    "@/components/ui/label": `export const Label=(p)=><label {...p}>{p.children}</label>;`,
    "@/components/ui/card": `export const Card=(p)=><div {...p}>{p.children}</div>;export const CardContent=(p)=><div {...p}>{p.children}</div>;export const CardHeader=(p)=><div {...p}>{p.children}</div>;export const CardTitle=(p)=><div {...p}>{p.children}</div>;`,
    "@/components/ui/select": `export const Select=(p)=><div>{p.children}</div>;export const SelectTrigger=(p)=><div data-trigger {...p}>{p.children}</div>;export const SelectValue=()=><span/>;export const SelectContent=(p)=><div>{p.children}</div>;export const SelectItem=(p)=><div>{p.children}</div>;`,
    "@/components/ui/button": `export const Button=(p)=><button type="button" {...p}>{p.children}</button>;`,
    "@/components/ui/tabs": `export const Tabs=(p)=><div>{p.children}</div>;export const TabsList=(p)=><div>{p.children}</div>;export const TabsContent=(p)=><div>{p.children}</div>;export const TabsTrigger=(p)=><button type="button" {...p}>{p.children}</button>;`,
  };
  const names = new Set();
  for (const text of sources.values())
    for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/g))
      for (const raw of m[1].split(",")) {
        const n = raw.trim().split(/\s+as\s+/)[0].trim();
        if (n) names.add(n);
      }
  STUBS["lucide-react"] = [...names].map((n) => `export const ${n}=()=>null;`).join("\n");
  return STUBS;
}

export function makeFrozenPlugin(sources, STUBS, loaded, opts = {}) {
  return { name: "frozen", setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => {
      if (STUBS[a.path]) return { path: "s://" + a.path, namespace: "s" };
      let base;
      const inTree = a.importer === "" || a.importer.startsWith("/app/") || a.importer.startsWith("s://");
      if (a.path.startsWith("/app/") && inTree) base = a.path;
      else if (a.path.startsWith("@/") && inTree) base = "/app/src/" + a.path.slice(2);
      else if (a.path.startsWith(".") && inTree) base = path.posix.resolve(path.posix.dirname(a.importer), a.path);
      else if (opts.realPackages) return undefined; // real package + its internals → default resolution
      else return { external: true };
      const resolved = [base, base + ".js", base + ".jsx"].find((p) => sources.has(p));
      if (!resolved) throw Error("Missing frozen source; held local work forbidden: " + a.path + " (imported by " + a.importer + ")");
      return { path: resolved, namespace: "frozen" };
    });
    b.onLoad({ filter: /.*/, namespace: "s" }, (a) => ({ contents: STUBS[a.path.slice(4)], loader: "jsx", resolveDir: path.resolve(".") }));
    b.onLoad({ filter: /.*/, namespace: "frozen" }, (a) => {
      const contents = sources.get(a.path);
      loaded[a.path] = hash(contents);
      return { contents, loader: a.path.endsWith(".jsx") ? "jsx" : "js", resolveDir: path.resolve(".") };
    });
  }};
}
