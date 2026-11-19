// Shared frozen-source + stub machinery for the sign-maintenance hardening
// page/browser harnesses. Every import inside the bundled page resolves to
// either frozen remote source, a local candidate, an explicit boundary/visual
// leaf stub, or an allowlisted real package — anything else throws at build
// time.
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";

export const E = ".audit-work/maintenance-hardening/";
export const hash = (t) => createHash("sha256").update(t).digest("hex");
const readText = (p) => fs.readFileSync(p, "utf8");
const remoteSrc = (p) => readText(E + "remote/" + p);
const candidate = (n) => readText(E + n);
export const SM = "/app/src/components/signMaintenance/";

// Candidate targets (remote path → candidate file in this audit dir).
export const CANDIDATES = {
  "src/components/signMaintenance/maintenancePricingAvailability.js": "maintenance-pricing-candidate-maintenancePricingAvailability.js",
  "src/components/signMaintenance/ServiceItemRow.jsx": "maintenance-pricing-candidate-ServiceItemRow.jsx",
  "src/components/signMaintenance/RepaintMonumentPanel.jsx": "maintenance-pricing-candidate-RepaintMonumentPanel.jsx",
  "src/components/signMaintenance/DimLetterPaintSubPanel.jsx": "maintenance-pricing-candidate-DimLetterPaintSubPanel.jsx",
  "src/pages/MaintenanceEstimator.jsx": "maintenance-pricing-candidate-MaintenanceEstimator.jsx",
};

// Remote files that must resolve inside the page bundle.
// SignTypePicker/ActionPicker are stubbed — visual leaves outside the
// hardening surface (and the remote SignTypePicker carries a pre-existing
// duplicate-`type` JSX defect that must not poison the zero-warning budget).
const REMOTE_FILES = [
  "src/components/signMaintenance/constants.jsx",
  "src/components/signMaintenance/defaults.jsx",
  "src/components/signMaintenance/repaintCalculator.jsx",
  "src/components/signMaintenance/repaintDefaults.jsx",
  "src/components/signMaintenance/dimLetterPaintCalculator.jsx",
  "src/components/signMaintenance/maintenanceCalculator.jsx",
  "src/components/signMaintenance/maintenanceMaterialRules.js",
];

export function frozenSources() {
  const sources = new Map();
  for (const f of REMOTE_FILES) sources.set("/app/" + f, remoteSrc(f));
  for (const [target, file] of Object.entries(CANDIDATES))
    sources.set("/app/" + target, candidate(file));
  return sources;
}

export function makeStubs(sources) {
  const STUBS = {
    "@/api/gatedEntities": `
      export const MaintenanceProject = {
        get: async (id) => { globalThis.__spies.push(['projectGet', id]); return globalThis.__project ?? null; },
      };
      export const MaintenanceActionRate = (globalThis.__entRates ||= {__ent:'rates'});
      export const Settings = (globalThis.__entSettings ||= {__ent:'settings'});
      export const MaintenanceInventory = (globalThis.__entMaintInv ||= {__ent:'maintInv'});`,
    "@/components/staff/staffEntities": `
      export const staffEntities = {
        AllInOneEstimate: { get: async (id) => { globalThis.__spies.push(['estimateGet', id]); return globalThis.__estimate ?? null; } },
        ChannelLetterInstallEquipment: (globalThis.__entEquip ||= {__ent:'equip'}),
      };`,
    "@/api/base44Client": `const fail=()=>{globalThis.__unexpectedSdk++;throw Error("Unexpected SDK access in the maintenance page proof");};
      const entity=new Proxy({},{get:()=>fail});
      export const base44={functions:{invoke:fail},entities:new Proxy({},{get:()=>entity})};`,
    "@/components/estimator/loadAllEntityRows": `
      export async function loadAllEntityRows(a){
        globalThis.__catalogReads.push(a.label);
        if(a.entity===globalThis.__entSettings) return globalThis.__settingRows||[];
        if(a.entity===globalThis.__entRates) return globalThis.__rateRows||[];
        if(a.entity===globalThis.__entEquip) return globalThis.__equipRows||[];
        if(a.entity===globalThis.__entMaintInv) return globalThis.__materialRuleRows||[];
        return [];
      }
      export const primeEntityRowsCache=()=>{};`,
    "@/components/estimator/parts/partCatalog": `
      export const loadMasterPartCatalog = async () => globalThis.__masterCatalog || [];`,
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
    "@/components/markup/projectCategorizer": `
      export const categorizeMaintenanceProject = () => ({ categories: [] });`,
    "@/components/markup/CustomerPricingTab": `export default ()=><div data-stub="CustomerPricingTab"/>;`,
    "@/components/estimator/moduleShared/ModuleActionBar": `export default (p)=><button type="button" data-stub="copy" onClick={p.onSaveAsCopy}>copy</button>;`,
    "@/components/estimator/moduleShared/ModuleTemplateDialog": `export default ()=>null;`,
    // channelLetterInstall leaves — out of scope, visual stubs.
    "@/components/channelLetterInstall/EquipmentSelector": `export default ()=><div data-stub="EquipmentSelector"/>;`,
    "@/components/channelLetterInstall/LadderSelector": `export default ()=><div data-stub="LadderSelector"/>;`,
    "@/components/channelLetterInstall/PersonnelSelector": `export default ()=><div data-stub="PersonnelSelector"/>;`,
    "@/components/channelLetterInstall/TravelCostCard": `export default ()=><div data-stub="TravelCostCard"/>;`,
    "@/components/channelLetterInstall/AddressAutocomplete": `export default (p)=><input value={p.value||""} onChange={(e)=>p.onChange?.(e.target.value)} data-stub="AddressAutocomplete"/>;`,
    // signMaintenance visual leaves — pickers not under test.
    "./SignTypePicker": `export default (p)=><div data-stub="SignTypePicker"/>;`,
    "./ActionPicker": `export default (p)=><div data-stub="ActionPicker"/>`,
    // ui primitives — minimal passthroughs.
    "@/components/ui/card": `export const Card=(p)=><div {...p}/>;export const CardContent=(p)=><div {...p}/>;export const CardHeader=(p)=><div {...p}/>;export const CardTitle=(p)=><div {...p}/>;`,
    "@/components/ui/input": `export const Input=(p)=><input {...p}/>;`,
    "@/components/ui/label": `export const Label=(p)=><label {...p}>{p.children}</label>;`,
    "@/components/ui/textarea": `export const Textarea=(p)=><textarea {...p}/>;`,
    "@/components/ui/select": `export const Select=(p)=><div>{p.children}</div>;export const SelectTrigger=(p)=><div data-trigger {...p}>{p.children}</div>;export const SelectValue=()=><span/>;export const SelectContent=(p)=><div>{p.children}</div>;export const SelectItem=(p)=><div>{p.children}</div>;`,
    "@/components/ui/button": `export const Button=(p)=><button type="button" {...p}>{p.children}</button>;`,
    "@/components/ui/tabs": `export const Tabs=(p)=><div>{p.children}</div>;export const TabsList=(p)=><div>{p.children}</div>;export const TabsTrigger=(p)=><button type="button" onClick={()=>p.onClick?.()}>{p.children}</button>;export const TabsContent=(p)=><div>{p.children}</div>;`,
    "@/components/ui/checkbox": `export const Checkbox=(p)=><input type="checkbox" {...p}/>;`,
    "@/components/ui/slider": `export const Slider=(p)=><div data-stub="slider" role="slider" {...p}/>;`,
    "@/components/ui/badge": `export const Badge=(p)=><span {...p}>{p.children}</span>;`,
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
