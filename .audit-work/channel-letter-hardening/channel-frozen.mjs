// Shared frozen-source + stub machinery for the channel-letter page/browser harnesses.
// Every import inside the bundled page resolves to either frozen remote source,
// a local candidate, an explicit boundary/visual-leaf stub, or an allowlisted
// real package — anything else throws at build time.
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";

export const E = ".audit-work/channel-letter-hardening/";
export const hash = (t) => createHash("sha256").update(t).digest("hex");
const readText = (p) => fs.readFileSync(p, "utf8");
const remoteSrc = (p) => readText(E + "remote/" + p);
const candidate = (p) => readText(E + "candidates/" + p);
export const C = "/app/src/components/channelLetterInstall/";

export function frozenSources() {
  const sources = new Map();
  const REMOTE_FILES = [
    // Pure calculators + rate catalogs (the formulas under test stay remote).
    "src/components/channelLetterInstall/installCalculator.jsx",
    "src/components/channelLetterInstall/lettersCalculator.jsx",
    "src/components/channelLetterInstall/installSizeRates.jsx",
    "src/components/channelLetterInstall/wallMaterials.jsx",
    "src/components/channelLetterInstall/equipmentSuggester.jsx",
    "src/components/channelLetterInstall/dimensionalFabCalculator.jsx",
    "src/components/channelLetterInstall/letterWidthCalculator.jsx",
    // Real mounted component tree (visual leaves the hardening wires into).
    "src/components/channelLetterInstall/ConditionPicker.jsx",
    "src/components/channelLetterInstall/CostBreakdownBar.jsx",
    "src/components/channelLetterInstall/InstallHeightSlider.jsx",
    "src/components/channelLetterInstall/InstallTypePicker.jsx",
    "src/components/channelLetterInstall/LetterSizePicker.jsx",
    "src/components/channelLetterInstall/WallMaterialPicker.jsx",
    "src/components/channelLetterInstall/CyclingImage.jsx",
    "src/components/channelLetterInstall/CuttingMethodSlider.jsx",
    "src/components/channelLetterInstall/PaintCoverageHelper.jsx",
    "src/components/channelLetterInstall/DimensionalMaterialPickerDialog.jsx",
    "src/components/channelLetterInstall/BackerFabModal.jsx",
    "src/components/channelLetterInstall/TabBadgeTrigger.jsx",
    "src/components/channelLetterInstall/CrewEquipmentHint.jsx",
    "src/components/channelLetterInstall/ConfirmModal.jsx",
    // Pure cross-module helpers.
    "src/components/markup/projectCategorizer.jsx",
  ];
  for (const f of REMOTE_FILES) sources.set("/app/" + f, remoteSrc(f));
  const CANDIDATE_FILES = [
    "src/components/channelLetterInstall/channelLetterPricingAvailability.js",
    "src/components/channelLetterInstall/BackerFabPanel.jsx",
    "src/components/channelLetterInstall/BackerSection.jsx",
    "src/components/channelLetterInstall/DimensionalFabPanel.jsx",
    "src/components/channelLetterInstall/EquipmentSelector.jsx",
    "src/components/channelLetterInstall/InstallLineItem.jsx",
    "src/components/channelLetterInstall/InstallSummaryCard.jsx",
    "src/components/channelLetterInstall/ItemsList.jsx",
    "src/components/channelLetterInstall/LadderSelector.jsx",
    "src/components/channelLetterInstall/LetterPurchaseRow.jsx",
    "src/components/channelLetterInstall/LettersPurchaseTab.jsx",
    "src/components/channelLetterInstall/MaterialsList.jsx",
    "src/components/channelLetterInstall/PersonnelSelector.jsx",
    "src/components/channelLetterInstall/SummaryDetailsCard.jsx",
    "src/components/channelLetterInstall/ValidationWarnings.jsx",
    "src/components/channelLetterInstall/installExport.jsx",
    "src/pages/ChannelLetterEstimator.jsx",
  ];
  for (const f of CANDIDATE_FILES) sources.set("/app/" + f, candidate(f));
  return sources;
}

export function makeStubs(sources) {
  const STUBS = {
    "@/api/gatedEntities": `
      export const Settings = (globalThis.__entSettings ||= {__ent:'settings'});
      export const ChannelLetterInstallInventory = (globalThis.__entInv ||= {__ent:'inv'});
      export const ChannelLetterInstallEquipment = (globalThis.__entEquip ||= {__ent:'equip'});
      export const DimensionalLetterMaterial = (globalThis.__entDim ||= {__ent:'dim'});
      export const ChannelLetterInstallation = {
        get: async (id) => { globalThis.__spies.push(['projectGet', id]); return globalThis.__project ?? null; },
      };`,
    "@/api/entities": `export const User = (globalThis.__entUser ||= {__ent:'user'});`,
    "@/entities/all": `export const User = (globalThis.__entUser ||= {__ent:'user'});`,
    "@/api/base44Client": `const fail=()=>{globalThis.__unexpectedSdk++;throw Error("Unexpected SDK access in the channel page proof");};
      const entity=new Proxy({},{get:()=>fail});
      export const base44={functions:{invoke:async()=>{throw Error("offline invoke blocked")}},entities:new Proxy({},{get:()=>entity})};`,
    "@/api/integrations": `
      export const GenerateImage = async () => { throw Error("offline GenerateImage blocked"); };
      export const Core = { InvokeLLM: async () => { throw Error("offline InvokeLLM blocked"); } };`,
    "@/utils": `export const createPageUrl=(p)=>"/"+p;`,
    "@/lib/utils": `export const cn=(...xs)=>xs.filter(Boolean).join(" ");`,
    "@/components/auth/EmailGate": `
      export const useAuth = () => ({ sessionToken: "tok", user: null });
      export const getSessionToken = () => "tok";`,
    "@/components/UnsavedChangesContext": `
      export const useUnsavedChanges = () => ({ setIsDirty: () => {}, isDirty: false });`,
    "@/components/ClientSearchInput": `export default (p)=><input value={p.value||""} onChange={e=>p.onChange?.(e.target.value)} placeholder={p.placeholder}/>;`,
    "@/components/estimator/loadAllEntityRows": `
      export async function loadAllEntityRows(a){
        globalThis.__catalogReads.push(a.label);
        if(a.entity===globalThis.__entSettings) return globalThis.__settingRows||[];
        if(a.entity===globalThis.__entInv) return globalThis.__invRows||[];
        if(a.entity===globalThis.__entEquip) return globalThis.__equipRows||[];
        if(a.entity===globalThis.__entDim) return globalThis.__dimRows||[];
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
    "@/components/customerSummary/upsertCustomerSummary": `
      export const upsertCustomerSummaryForEstimate = async (a) => { globalThis.__spies.push(['custSummary', a]); return { ok: true }; };`,
    "@/components/markup/CustomerPricingTab": `export default ()=><div data-stub="CustomerPricingTab"/>;`,
    "@/components/estimator/moduleShared/ModuleActionBar": `export default (p)=><span><button type="button" data-stub="copy" onClick={p.onSaveAsCopy}>copy</button></span>;`,
    "@/components/estimator/moduleShared/ModuleTemplateDialog": `export default ()=>null;`,
    // Visual-leaf / network-leaf components the page imports but the proof
    // does not exercise (AI modals, Google Maps distance card, help assistant,
    // reach chart). TravelCostCard is shared with Maintenance + Vinyl and is
    // deliberately untouched — its inputs are validated at the calc boundary,
    // which the availability layer covers.
    "@/components/channelLetterInstall/TravelCostCard": `export default ()=><div data-stub="TravelCostCard"/>;`,
    "@/components/channelLetterInstall/AddressAutocomplete": `export default (p)=><input value={p.value||""} onChange={e=>p.onChange?.(e.target.value)} placeholder={p.placeholder}/>;`,
    "@/components/channelLetterInstall/ChannelLetterHelpAssistant": `export default ()=>null;`,
    "@/components/channelLetterInstall/PhotoEstimateModal": `export default ()=>null;`,
    "@/components/channelLetterInstall/AIInstallScopeModal": `export default ()=>null;`,
    "@/components/channelLetterInstall/AIScopeWriterModal": `export default ()=>null;`,
    "@/components/channelLetterInstall/BoomLiftReachChart": `export default ()=>null;`,
    "@hello-pangea/dnd": `
      export const DragDropContext = (p) => p.children;
      export const Droppable = (p) => p.children({ droppableProps: {}, innerRef: () => {}, placeholder: null });
      export const Draggable = (p) => p.children({ draggableProps: {}, dragHandleProps: {}, innerRef: () => {} }, { isDragging: false });`,
    "@/components/ui/input": `export const Input=(p)=><input {...p}/>;`,
    "@/components/ui/textarea": `export const Textarea=(p)=><textarea {...p}/>;`,
    "@/components/ui/card": `export const Card=(p)=><div {...p}>{p.children}</div>;export const CardContent=(p)=><div {...p}>{p.children}</div>;export const CardHeader=(p)=><div {...p}>{p.children}</div>;export const CardTitle=(p)=><div {...p}>{p.children}</div>;`,
    "@/components/ui/tabs": `export const Tabs=(p)=><div>{p.children}</div>;export const TabsContent=(p)=><div>{p.children}</div>;export const TabsList=(p)=><div>{p.children}</div>;export const TabsTrigger=(p)=><button type="button" onClick={p.onClick}>{p.children}</button>;`,
    "@/components/ui/select": `export const Select=(p)=><div>{p.children}</div>;export const SelectTrigger=(p)=><div>{p.children}</div>;export const SelectValue=()=><span/>;export const SelectContent=(p)=><div>{p.children}</div>;export const SelectItem=(p)=><div>{p.children}</div>;`,
    "@/components/ui/dialog": `export const Dialog=(p)=>p.open?<div>{p.children}</div>:null;export const DialogContent=(p)=><div>{p.children}</div>;export const DialogHeader=(p)=><div>{p.children}</div>;export const DialogTitle=(p)=><div>{p.children}</div>;export const DialogFooter=(p)=><div>{p.children}</div>;export const DialogDescription=(p)=><div>{p.children}</div>;`,
    "@/components/ui/button": `export const Button=(p)=><button type="button" {...p}>{p.children}</button>;`,
    "@/components/ui/badge": `export const Badge=(p)=><span {...p}>{p.children}</span>;`,
    "@/components/ui/label": `export const Label=(p)=><label {...p}>{p.children}</label>;`,
    "@/components/ui/switch": `export const Switch=(p)=><input type="checkbox" checked={p.checked} onChange={e=>p.onCheckedChange?.(e.target.checked)}/>`,
    "@/components/ui/checkbox": `export const Checkbox=(p)=><input type="checkbox" checked={p.checked} onChange={e=>p.onCheckedChange?.(e.target.checked)}/>`,
    "@/components/ui/slider": `export const Slider=(p)=><input type="range" value={Array.isArray(p.value)?p.value[0]:p.value} onChange={e=>p.onValueChange?.([parseFloat(e.target.value)])}/>`,
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
      // Relative imports may resolve onto a stubbed leaf (e.g. ./AIScopeWriterModal
      // → /app/src/components/channelLetterInstall/AIScopeWriterModal). Stub keys
      // are written in @/-alias form, so translate the resolved base back.
      const aliasBase = base?.startsWith("/app/src/") ? "@/" + base.slice("/app/src/".length) : null;
      if (aliasBase && STUBS[aliasBase]) return { path: "s://" + aliasBase, namespace: "s" };
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
