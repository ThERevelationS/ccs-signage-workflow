// Shared frozen-source + stub machinery for the laser hardening page/browser
// harnesses. Every import inside the bundled page resolves to either frozen
// remote source, a local candidate, an explicit boundary/visual leaf stub, or
// an allowlisted real package — anything else throws at build time.
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";

export const E = ".audit-work/laser-hardening/";
export const hash = (t) => createHash("sha256").update(t).digest("hex");
const readText = (p) => fs.readFileSync(p, "utf8");
const remoteSrc = (p) => readText(E + "remote/" + p);
const candidate = (n) => readText(E + n);

// Candidate targets (remote path → candidate file in this audit dir).
export const CANDIDATES = {
  "src/components/estimator/laser/laserPricingAvailability.js": "laser-pricing-candidate-laserPricingAvailability.js",
  "src/pages/LaserEstimator.jsx": "laser-pricing-candidate-LaserEstimator.jsx",
};

// Remote files that must resolve inside the page bundle. Laser's live page
// has no in-module leaf sources besides the new availability module —
// everything else is a shared boundary (stubbed) or an out-of-scope leaf.
// The dead divergent laserCalc.js is deliberately NOT bundled (never imported).
const REMOTE_FILES = [];

export function frozenSources() {
  const sources = new Map();
  for (const f of REMOTE_FILES) sources.set("/app/" + f, remoteSrc(f));
  for (const [target, file] of Object.entries(CANDIDATES))
    sources.set("/app/" + target, candidate(file));
  return sources;
}

// Remote (non-candidate) sources only — used by the RED harness so the
// unmodified remote page renders against frozen stubs. The availability
// module does not exist remotely; the remote page never imports it.
export function remoteOnlySources() {
  const sources = new Map();
  for (const f of REMOTE_FILES) sources.set("/app/" + f, remoteSrc(f));
  sources.set("/app/src/pages/LaserEstimator.jsx", remoteSrc("src/pages/LaserEstimator.jsx"));
  return sources;
}

export function makeStubs(sources) {
  const STUBS = {
    "@/api/gatedEntities": `
      export const LaserProject = {
        get: async (id) => { globalThis.__spies.push(['projectGet', id]); return globalThis.__project ?? null; },
      };
      export const Settings = (globalThis.__entSettings ||= {__ent:'settings'});`,
    "@/components/staff/staffEntities": `
      export const staffEntities = {
        AllInOneEstimate: { get: async (id) => { globalThis.__spies.push(['estimateGet', id]); return globalThis.__estimate ?? null; } },
      };`,
    "@/api/base44Client": `const fail=()=>{globalThis.__unexpectedSdk++;throw Error("Unexpected SDK access in the laser page proof");};
      const entity=new Proxy({},{get:()=>fail});
      export const base44={functions:{invoke:fail},entities:new Proxy({},{get:()=>entity})};`,
    "@/components/estimator/loadAllEntityRows": `
      export async function loadAllEntityRows(a){
        globalThis.__catalogReads.push(a.label);
        if(a.entity===globalThis.__entSettings) return globalThis.__settingRows||[];
        return [];
      }
      export const primeEntityRowsCache=()=>{};`,
    "@/components/estimator/builder/sourceProjectPersistence": `
      export const updateBuilderSourceProject = async (a) => { globalThis.__spies.push(['saveSource', a]); return { ...a.data, id: a.sourceId, updated_date: 'v2' }; };
      export const preflightBuilderSourceMutation = async (a) => { globalThis.__spies.push(['preflight', a]); };`,
    "@/components/estimator/builder/itemIdentity": `
      export const newBuilderItemId = (p) => p + '-' + (globalThis.__bseq = (globalThis.__bseq || 0) + 1);
      export const seedBuilderItemIds = (items) => (items || []).map((it, i) => ({ builder_item_id: it.builder_item_id || 'bitem-' + i, ...it }));`,
    "@/components/estimator/idempotentEntityCreate": `
      export const ensureIdempotentEntityCreate = async (a) => { globalThis.__spies.push(['ensureIdempotent', a]); return { ...a.data, id: 'new-1', updated_date: 'v1' }; };
      export const newCreationRequestKey = (k) => 'key-' + k + '-' + (globalThis.__kseq = (globalThis.__kseq || 0) + 1);`,
    "@/components/estimator/builder/builderService": `
      export const recordBuilderSave = async (a) => { globalThis.__spies.push(['recordBuilderSave', a]); return { ok: true }; };`,
    "@/components/estimator/moduleShared/moduleProjectActions": `
      export const saveModuleProjectCopy = async (a) => { globalThis.__spies.push(['saveCopy', a]); return { id: 'copy-1' }; };`,
    "@/components/markup/savedCustomerPricing": `
      export async function calculateSavedCustomerPricing(a){ globalThis.__spies.push(['pricing', a]); return null; }`,
    "@/components/markup/projectCategorizer": `
      export const categorizeLaserProject = () => ({ categories: [] });`,
    "@/components/markup/CustomerPricingTab": `export default ()=><div data-stub="CustomerPricingTab"/>;`,
    "@/components/estimator/moduleShared/ModuleActionBar": `export default (p)=><button type="button" data-stub="copy" onClick={p.onSaveAsCopy}>copy</button>;`,
    "@/components/estimator/moduleShared/ModuleTemplateDialog": `export default ()=>null;`,
    "@/components/channelLetterInstall/TabBadgeTrigger": `export default (p)=><button type="button" data-tab={p.value}>{p.label}{p.count!==undefined?" ("+p.count+")":""}</button>;`,
    // ui primitives — minimal passthroughs.
    "@/components/ui/card": `export const Card=(p)=><div {...p}/>;export const CardContent=(p)=><div {...p}/>;export const CardHeader=(p)=><div {...p}/>;export const CardTitle=(p)=><div {...p}/>;`,
    "@/components/ui/input": `export const Input=(p)=><input {...p}/>;`,
    "@/components/ui/label": `export const Label=(p)=><label {...p}>{p.children}</label>;`,
    "@/components/ui/textarea": `export const Textarea=(p)=><textarea {...p}/>;`,
    "@/components/ui/select": `export const Select=(p)=><div>{p.children}</div>;export const SelectTrigger=(p)=><div data-trigger {...p}>{p.children}</div>;export const SelectValue=()=><span/>;export const SelectContent=(p)=><div>{p.children}</div>;export const SelectItem=(p)=><div>{p.children}</div>;`,
    "@/components/ui/button": `export const Button=(p)=><button type="button" {...p}>{p.children}</button>;`,
    "@/components/ui/tabs": `export const Tabs=(p)=><div>{p.children}</div>;export const TabsList=(p)=><div>{p.children}</div>;export const TabsTrigger=(p)=><button type="button" onClick={()=>p.onClick?.()}>{p.children}</button>;export const TabsContent=(p)=><div>{p.children}</div>;`,
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
