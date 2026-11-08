import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Anchor as AnchorIcon,
  Wrench as WrenchIcon,
  LayoutGrid,
  Layers,
  ClipboardList,
  TrendingUp,
  Trees,
  Tag
} from "lucide-react";
import FoundationItemCard from "@/components/estimator/foundation/FoundationItemCard";
import FoundationRatesPanel from "@/components/estimator/foundation/FoundationRatesPanel";
import FoundationEquipmentTab from "@/components/estimator/foundation/FoundationEquipmentTab";
import FoundationTotals from "@/components/estimator/foundation/FoundationTotals";
import ConcreteDeliveryPanel from "@/components/estimator/foundation/ConcreteDeliveryPanel";
import FoundationBOM from "@/components/estimator/foundation/FoundationBOM";
import FoundationWallsPanel from "@/components/estimator/foundation/FoundationWallsPanel";
import FoundationWallCapsPanel from "@/components/estimator/foundation/FoundationWallCapsPanel";
import FoundationPolesPanel from "@/components/estimator/foundation/FoundationPolesPanel";
import FoundationToolbar from "@/components/estimator/foundation/FoundationToolbar";
import FoundationSectionBanner from "@/components/estimator/foundation/FoundationSectionBanner";
import AiEngineeringAssistant from "@/components/estimator/foundation/AiEngineeringAssistant";
import Foundation3DPreview from "@/components/estimator/foundation/Foundation3DPreview";
import FoundationTemplateDialog from "@/components/estimator/foundation/FoundationTemplateDialog";
import FoundationLayoutCanvas from "@/components/estimator/foundation/FoundationLayoutCanvas";
import SignageCabinetsPanel from "@/components/estimator/foundation/SignageCabinetsPanel";
import LandscapeDesigner from "@/components/estimator/foundation/LandscapeDesigner";
import CustomerPricingPanel from "@/components/estimator/foundation/CustomerPricingPanel";
import CustomerPricingTab from "@/components/markup/CustomerPricingTab";
import { categorizeFoundationProject } from "@/components/markup/projectCategorizer";
import { calculateSavedCustomerPricing } from "@/components/markup/savedCustomerPricing";
import { hasFoundationCostSnapshot } from "@/components/estimator/foundation/foundationCatalogIntegrity";
import { calcProject, money, captureConcreteDeliverySnapshot } from "@/components/estimator/foundation/foundationCalc";
import { normalizeConcreteSupplier } from "@/components/estimator/foundation/legacyFoundationCalc";
import { recordBuilderSave } from "@/components/estimator/builder/builderService";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { updateBuilderSourceProject, sourcePatchMatches } from "@/components/estimator/builder/sourceProjectPersistence";
import { loadFoundationBuilderRecovery, verifyFoundationRecoverySource } from "@/components/estimator/foundation/foundationBuilderRecovery";
import { createFoundationSaveSession } from "@/components/estimator/foundation/foundationSaveSession";
import { createFoundationDraftStore } from "@/components/estimator/foundation/foundationDraftRecovery";
import { useAuth } from "@/components/auth/EmailGate";
import { createFoundationSyncAttempt, foundationSyncRecoveryState, assertFoundationBuilderAcknowledgment, validateFoundationSyncAttempt } from "@/components/estimator/foundation/foundationSyncRecovery";
import { normalizeFoundationAssembly, foundationAssemblyIssues, cloneFoundationComponents } from "@/components/estimator/foundation/foundationAssemblyModel";
import { prepareFoundationTemplatePatch } from "@/components/estimator/foundation/foundationTemplateModel";
import { ensureIdempotentEntityCreate, newCreationRequestKey } from "@/components/estimator/idempotentEntityCreate";
import { convertFoundationToBrickStone } from "@/components/estimator/foundation/convertToBrickStone";
import { createEstimateReadOnlyShareLink } from "@/components/estimator/moduleShared/moduleProjectActions";
import { staffEntities } from "@/components/staff/staffEntities";
const blankItem = (type) => ({
  // Defaults mirror SignEstimate Pro `newItem()` exactly. CCS still lets the
  // user choose Spread Foot or Pillar at add-time; only the type is overridden.
  foundation_type: type || "spread_foot",
  description: "",
  quantity: 1,
  length_inches: 48,
  width_inches: 48,
  diameter: 24,
  depth_inches: 36,
  grade_offset_inches: 0,
  include_rebar: false,
  include_forming: false,
  include_finishing: false,
  rebar_size: "#4",
  rebar_spacing_length: 12,
  rebar_spacing_width: 12,
  rebar_layers: 1,
  rebar_layer_separation_inches: 12,
  pillar_rebar_size: "#4",
  pillar_rebar_hoop_diameter: 20,
  pillar_rebar_layer_separation_inches: 12,
  pillar_rebar_layers: 1,
  pillar_vertical_rebar_count: 4,
  selected_pole_id: "",
  pole_offset_from_bottom_inches: 0,
  pole_total_height_inches: 0,
  include_pole_painting: false,
  custom_concrete_cost_per_cy: null,
  custom_rebar_cost_per_ft: null,
  excavation_method: "hand_dig",
  selected_concrete_id: "",
  is_new_sign_location: false,
  mortar_gap_inches: 0.375,
  wall_width_inches: 8
});
const TAB_CLASS = "gap-1.5 text-[12px] data-[state=active]:bg-red-600 data-[state=active]:text-white rounded-sm";
export default function FoundationEstimator({ embedded = false, embeddedProjectId, embeddedEstimateId, onClose, onSaved }) {
  const params = new URLSearchParams(window.location.search);
  const id = embeddedProjectId || params.get("id") || params.get("edit");
  const estimateId = embeddedEstimateId || params.get("estimateId");
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const ownerId = currentUser?.id || null;
  const [project, setProject] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [autoSave, setAutoSave] = useState(false);
  const [history, setHistory] = useState({ past: [], future: [] });
  const [templateMode, setTemplateMode] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const saveRef = useRef(null);
  const saveSessionRef = useRef(null);
  if (!saveSessionRef.current) saveSessionRef.current = createFoundationSaveSession();
  const editRevisionRef = useRef(0);
  const acknowledgedVersionRef = useRef(null);
  const currentEditorRef = useRef({ sourceId: null, editRevision: 0, loaded: false });
  const contextKeyRef = useRef(null);
  const contextGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const saveAttemptRef = useRef(null);
  const exitGenerationRef = useRef(-1);
  const loadedOwnerRef = useRef(null);
  const [saveError, setSaveError] = useState("");
  const [reloadRevision, setReloadRevision] = useState(0);
  const [linkedEstimate, setLinkedEstimate] = useState(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const contextKey = JSON.stringify([ownerId, id, estimateId, project?.id, reloadRevision]);
  if (contextKeyRef.current !== contextKey) {
    contextKeyRef.current = contextKey;
    editRevisionRef.current += 1;
    contextGenerationRef.current += 1;
    const previousAcknowledgment = acknowledgedVersionRef.current;
    acknowledgedVersionRef.current = project?.id ? {
      sourceId: project.id,
      updated_date: project.updated_date,
      ownerId,
      sourceSnapshot: previousAcknowledgment?.sourceId === project.id && previousAcknowledgment?.ownerId === ownerId ? previousAcknowledgment.sourceSnapshot : null
    } : null;
  }
  const contextLoaded = mountedRef.current && !loading && !loadError && !!project && project.id === id && (!estimateId || linkedEstimate?.id === estimateId) && loadedOwnerRef.current === ownerId;
  currentEditorRef.current = {
    sourceId: contextLoaded ? project.id : null,
    estimateId: estimateId || null,
    generation: contextGenerationRef.current,
    editRevision: editRevisionRef.current,
    loaded: contextLoaded
  };
  const bumpEdit = () => {
    editRevisionRef.current += 1;
    currentEditorRef.current = { ...currentEditorRef.current, editRevision: editRevisionRef.current };
  };
  const copyAttemptRef = useRef({ signature: "", key: "" });
  const copyFlightRef = useRef(null);
  const sourceRefreshRef = useRef(null);
  const sourceWriteEpochRef = useRef(/* @__PURE__ */ new Map());
  const projectRef = useRef(null);
  const swapAttemptRef = useRef({ signature: "", key: "" });
  projectRef.current = contextLoaded ? project : null;
  const draftStore = useMemo(
    () => createFoundationDraftStore({ getStorage: () => window.sessionStorage, ownerId, sourceId: id, estimateId: estimateId || null }),
    [ownerId, id, estimateId]
  );
  const draftSessionRef = useRef({ store: null, revision: null, pending: false });
  if (draftSessionRef.current.store !== draftStore) draftSessionRef.current = { store: draftStore, revision: null, pending: false };
  const [draftOffer, setDraftOffer] = useState(null);
  const draftVisible = draftOffer?.store === draftStore ? draftOffer : null;
  useEffect(() => {
    copyAttemptRef.current = { signature: "", key: "" };
    swapAttemptRef.current = { signature: "", key: "" };
  }, [id]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (!id) {
      setLoading(false);
      setProject(null);
      setLinkedEstimate(null);
      setRecoveryRequired(false);
      setDirty(false);
      setHistory({ past: [], future: [] });
      setSaveError("");
      return;
    }
    let active = true;
    const epochAtStart = sourceWriteEpochRef.current.get(id)?.epoch || 0;
    setLoading(true);
    setLoadError("");
    setSaveError("");
    setDirty(false);
    setHistory({ past: [], future: [] });
    Promise.all([
      staffEntities.FoundationProject.get(id),
      loadAllEntityRows({ entity: staffEntities.FoundationInventory, query: { show_in_foundation: true }, sort: "material_name", label: "Foundation inventory" }),
      loadAllEntityRows({ entity: staffEntities.LaborServiceInventory, query: { service_category: "concrete_service", is_active: true }, sort: "service_name", label: "Concrete labor/services" }),
      loadAllEntityRows({ entity: staffEntities.Settings, sort: "created_date", label: "Estimator Settings" }),
      estimateId ? staffEntities.AllInOneEstimate.get(estimateId) : Promise.resolve(null)
    ]).then(([proj, inv, concreteServices, settingRows, est]) => {
      if (!active) return;
      if (proj?.id !== id || estimateId && est?.id !== estimateId) {
        setProject(proj?.id === id ? proj : null);
        if (estimateId && est?.id !== estimateId) setLoadError("Linked estimate could not be verified.");
        return;
      }
      const epochNow = sourceWriteEpochRef.current.get(proj.id);
      if (epochNow && epochNow.epoch > epochAtStart && proj.updated_date !== epochNow.lastSavedVersion) {
        setReloadRevision((r) => r + 1);
        return;
      }
      setLinkedEstimate(est || null);
      const merged = {
        ...proj,
        excavation_method: proj.excavation_method || "hand_dig",
        project_concrete_type: proj.project_concrete_type || "4000_ae",
        project_concrete_admixtures: proj.project_concrete_admixtures || [],
        items: proj.items || [],
        walls: proj.walls || [],
        poles: proj.poles || [],
        wall_caps: proj.wall_caps || [],
        signage_cabinets: proj.signage_cabinets || [],
        landscape: proj.landscape || { cell_size_inches: 12, cells: {} },
        selected_equipment: proj.selected_equipment || []
      };
      let normalized;
      try {
        normalized = normalizeFoundationAssembly(merged, {
          createId: (kind) => newCreationRequestKey(`foundation_${kind}`)
        }).project;
      } catch (e) {
        setLoadError(e?.message || "Foundation assembly could not be normalized.");
        return;
      }
      if (sourceRefreshRef.current?.sourceId === proj.id) sourceRefreshRef.current = null;
      acknowledgedVersionRef.current = { sourceId: proj.id, updated_date: proj.updated_date, ownerId, sourceSnapshot: normalized };
      loadedOwnerRef.current = ownerId;
      const found = draftStore.read();
      if (found.status === "found" || found.status === "invalid") {
        draftSessionRef.current.revision = found.revision ?? null;
        draftSessionRef.current.pending = true;
        setAutoSave(false);
        setDraftOffer(found.status === "found" ? { store: draftStore, revision: found.revision, draft: found.draft, savedAt: found.savedAt, baseUpdatedAt: found.baseUpdatedAt } : { store: draftStore, revision: found.revision, message: found.message });
      } else if (found.status === "unavailable") {
        draftSessionRef.current.revision = null;
        draftSessionRef.current.pending = false;
        setDraftOffer({ store: draftStore, warning: found.message });
      } else {
        draftSessionRef.current.revision = null;
        draftSessionRef.current.pending = false;
        setDraftOffer(null);
      }
      setProject(normalized);
      projectRef.current = normalized;
      const rec = foundationSyncRecoveryState({ project: merged, estimateId, estimate: est });
      if (["pending", "unsupported", "mismatch"].includes(rec.status)) {
        setRecoveryRequired(true);
        setDirty(true);
      } else {
        setRecoveryRequired(false);
      }
      setInventory([...inv || [], ...(concreteServices || []).map(normalizeConcreteSupplier)]);
      setSettings(
        Object.fromEntries((settingRows || []).map((s) => [s.setting_name, s.setting_value]))
      );
    }).catch((error) => {
      if (!active) return;
      console.error("Foundation Builder prerequisites could not be loaded:", error);
      setLoadError(error?.message || "Foundation Builder prerequisites could not be verified.");
    }).finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, estimateId, reloadRevision, ownerId, draftStore]);
  const savedSourceProject = acknowledgedVersionRef.current?.sourceId === project?.id && acknowledgedVersionRef.current?.ownerId === ownerId ? acknowledgedVersionRef.current?.sourceSnapshot ?? null : null;
  const calc = useMemo(
    () => project ? calcProject(project, inventory, settings, { savedProject: savedSourceProject }) : null,
    [project, inventory, settings, savedSourceProject]
  );
  const catalogBlocked = Boolean(calc?.catalogIssues?.length);
  const inputIssues = calc?.inputIssues || [];
  const inputBlocked = inputIssues.length > 0;
  const pricingBlocked = catalogBlocked || inputBlocked;
  const constructionWarnings = calc?.constructionWarnings || [];
  const [catalogReloading, setCatalogReloading] = useState(false);
  const catalogReloadRef = useRef(null);
  const handleCatalogReload = async () => {
    if (draftSessionRef.current.pending) return;
    const live = currentEditorRef.current;
    const generation = live.generation;
    const sourceId = live.sourceId;
    const estimateKey = live.estimateId;
    if (!mountedRef.current || !live.loaded || saveAttemptRef.current || copyFlightRef.current || saveSessionRef.current?.isSaving() || catalogReloadRef.current) return;
    const isCurrentFlight = (flight2) => {
      const l = currentEditorRef.current;
      return mountedRef.current && catalogReloadRef.current === flight2 && l.loaded && l.sourceId === sourceId && l.estimateId === estimateKey && l.generation === generation;
    };
    const flight = (async () => {
      const [inv, concreteServices, settingRows] = await Promise.all([
        loadAllEntityRows({ entity: staffEntities.FoundationInventory, query: { show_in_foundation: true }, sort: "material_name", label: "Foundation inventory" }),
        loadAllEntityRows({ entity: staffEntities.LaborServiceInventory, query: { service_category: "concrete_service", is_active: true }, sort: "service_name", label: "Concrete labor/services" }),
        loadAllEntityRows({ entity: staffEntities.Settings, sort: "created_date", label: "Estimator Settings" })
      ]);
      if (!isCurrentFlight(flight)) return;
      bumpEdit();
      setInventory([...inv || [], ...(concreteServices || []).map(normalizeConcreteSupplier)]);
      setSettings(Object.fromEntries((settingRows || []).map((r) => [r.setting_name, r.setting_value])));
      setAutoSave(false);
      setDirty(true);
      setSaveError("");
    })();
    catalogReloadRef.current = flight;
    setCatalogReloading(true);
    try {
      await flight;
    } catch (e) {
      if (isCurrentFlight(flight)) setSaveError("Catalog reload failed: " + (e?.message || "unknown error") + " Last known catalog retained; retry.");
    } finally {
      if (catalogReloadRef.current === flight) {
        const current = isCurrentFlight(flight);
        catalogReloadRef.current = null;
        if (current) setCatalogReloading(false);
      }
    }
  };
  useEffect(() => {
    catalogReloadRef.current = null;
    setCatalogReloading(false);
  }, [id, estimateId, reloadRevision, ownerId]);
  const assemblyIssues = useMemo(() => project ? foundationAssemblyIssues(project) : [], [project]);
  const catalog = useMemo(
    () => ({
      concrete: inventory.filter(
        (i) => ["concrete_service", "bagged_concrete"].includes(i.material_type) && i.show_in_foundation !== false
      ),
      poles: inventory.filter((i) => i.material_type === "pole"),
      walls: inventory.filter((i) => ["brick_stone", "wall_material"].includes(i.material_type)),
      fill: inventory.filter((i) => i.material_type === "fill_material"),
      forming: inventory.filter((i) => ["forming", "forming_material"].includes(i.material_type)),
      caps: inventory.filter((i) => i.material_type === "wall_cap"),
      equipment: inventory.filter((i) => i.material_type === "excavation_equipment")
    }),
    [inventory]
  );
  useEffect(() => {
    if (!autoSave || !dirty || recoveryRequired || pricingBlocked || catalogReloading || catalogReloadRef.current || draftSessionRef.current.pending) return;
    const t = setTimeout(() => saveRef.current?.(), 2e3);
    return () => clearTimeout(t);
  }, [autoSave, dirty, project, recoveryRequired, pricingBlocked, catalogReloading]);
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saving) saveRef.current?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saving]);
  useEffect(() => {
    if (!saving && !dirty && !recoveryRequired && !draftSessionRef.current.pending) return void 0;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving, dirty, recoveryRequired, draftOffer]);
  const navGuardArmedRef = useRef(false);
  useEffect(() => {
    const needsGuard = () => saving || dirty || recoveryRequired || draftSessionRef.current.pending;
    const confirmLeave = () => window.confirm(
      "You have unsaved changes or an unacknowledged Builder sync. Leave without saving?" + (draftSessionRef.current.revision ? " Unsent edits stay backed up in this browser tab only." : "")
    );
    const onClickCapture = (e) => {
      if (!needsGuard() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target?.closest?.("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!confirmLeave()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    if (!embedded && !navGuardArmedRef.current && needsGuard()) {
      try {
        window.history.pushState({ ccsFoundationLeaveGuard: true }, "", window.location.href);
        navGuardArmedRef.current = true;
      } catch {
      }
    }
    const onPop = (e) => {
      if (!navGuardArmedRef.current) return;
      if (e.state?.ccsFoundationLeaveGuard === true) return;
      if (!needsGuard()) {
        navGuardArmedRef.current = false;
        window.history.back();
        return;
      }
      if (confirmLeave()) {
        navGuardArmedRef.current = false;
        window.history.back();
      } else {
        try {
          window.history.forward();
        } catch {
        }
      }
    };
    document.addEventListener("click", onClickCapture, true);
    if (navGuardArmedRef.current) window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("popstate", onPop);
    };
  }, [embedded, saving, dirty, recoveryRequired, draftOffer]);
  if (loading) return /* @__PURE__ */ jsx("div", { className: "p-10 text-center text-gray-400", children: "Loading section\u2026" });
  if (loadError) return /* @__PURE__ */ jsxs("div", { className: "p-10 text-center text-red-700 bg-red-50 border border-red-200 rounded", children: [
    "Foundation Builder unavailable. Required project data, foundation inventory, concrete services, or Settings could not be verified. ",
    loadError
  ] });
  if (!project) return /* @__PURE__ */ jsx("div", { className: "p-10 text-center text-gray-500", children: "Foundation section not found." });
  const persistBrowserDraft = (next) => {
    const session = draftSessionRef.current;
    if (!session.store || session.store !== draftStore || !mountedRef.current) return;
    const ack = acknowledgedVersionRef.current;
    const base = ack?.sourceId === id && ack?.ownerId === ownerId ? ack.updated_date : null;
    if (!base) {
      setDraftOffer({ store: draftStore, warning: "Latest edits could not be backed up; no saved source to anchor the browser draft." });
      return;
    }
    const result = session.store.write({
      project: next,
      baseUpdatedAt: base,
      token: newCreationRequestKey("foundation_draft"),
      savedAt: (/* @__PURE__ */ new Date()).toISOString(),
      expectedRevision: session.revision
    });
    if (result.status === "stored") {
      session.revision = result.revision;
      session.pending = false;
      setDraftOffer({ store: draftStore, backedUp: true, message: "Design and customer-pricing edits backed up in this browser tab only \u2014 closing the tab loses them; save to keep all changes." });
    } else if (result.status === "conflict") {
      const latest = session.store.read();
      session.revision = latest.status !== "unavailable" ? latest.revision ?? null : result.revision ?? session.revision;
      session.pending = true;
      if (latest.status === "found") setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt, conflict: true });
      else if (latest.status === "empty") {
        session.pending = false;
        setDraftOffer({ store: draftStore, warning: "Browser draft was removed elsewhere; nothing to merge." });
      } else if (latest.status === "unavailable") setDraftOffer({ store: draftStore, revision: session.revision, message: latest.message || "Draft changed in another tab; could not re-read." });
      else setDraftOffer({ store: draftStore, revision: latest.revision ?? null, message: latest.message || "Draft changed in another tab; review before continuing." });
    } else {
      setDraftOffer({ store: draftStore, warning: `Latest edits could not be backed up; save before leaving. ${result.message || ""}` });
    }
  };
  const commit = (updater, opts = {}) => {
    const live = currentEditorRef.current;
    if (!mountedRef.current || !saveContext.loaded || !live.loaded || live.generation !== saveContext.generation || live.sourceId !== saveContext.sourceId) return false;
    if (draftSessionRef.current.pending && !opts.restoreDraft) return false;
    const prev = projectRef.current ?? project;
    let next;
    try {
      next = normalizeFoundationAssembly(
        { ...prev, ...updater(prev) },
        { previous: prev, createId: (kind) => newCreationRequestKey(`foundation_${kind}`) }
      ).project;
    } catch (e) {
      setSaveError(e?.message || "Foundation assembly update was rejected.");
      return false;
    }
    bumpEdit();
    setHistory((h) => ({ past: [...h.past.slice(-40), prev], future: [] }));
    projectRef.current = next;
    setProject(next);
    setDirty(true);
    if (opts.restoreDraft) draftSessionRef.current.pending = false;
    persistBrowserDraft(next);
    return true;
  };
  const patch = (changes) => commit(() => changes);
  const patchItem = (index, changes) => commit((prev) => ({
    items: prev.items.map((it, i) => i === index ? { ...it, ...changes } : it)
  }));
  const removeItem = (index) => {
    const label = project.items?.[index]?.description || `item ${index + 1}`;
    if (!window.confirm(`Delete "${label}"? Dependent placements are retained for review.`)) return;
    commit((prev) => ({ items: prev.items.filter((_, i) => i !== index) }));
  };
  const duplicateItem = (index) => commit((prev) => {
    const items = [...prev.items];
    items.splice(index + 1, 0, { ...JSON.parse(JSON.stringify(items[index])), component_id: newCreationRequestKey("foundation_item") });
    return { items };
  });
  const addItem = (type) => commit((prev) => ({ items: [...prev.items || [], blankItem(type)] }));
  const restoreBrowserDraft = () => {
    const session = draftSessionRef.current;
    const offer = draftVisible;
    if (!session.store || session.store !== draftStore || !offer?.revision) return;
    const latest = session.store.read();
    if (latest.status !== "found" || latest.revision !== offer.revision) {
      if (latest.status !== "unavailable") session.revision = latest.revision ?? null;
      if (latest.status === "found") setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt });
      else if (latest.status === "empty") {
        session.pending = false;
        setDraftOffer({ store: draftStore, warning: "Browser draft was removed elsewhere; nothing to restore." });
      } else if (latest.status === "unavailable") setDraftOffer({ ...offer, warning: `Browser draft could not be read; try again. ${latest.message || ""}` });
      else setDraftOffer({ store: draftStore, revision: latest.revision ?? null, message: latest.message || "Browser draft changed; nothing restored." });
      return;
    }
    session.revision = latest.revision;
    const baseChanged = latest.baseUpdatedAt && acknowledgedVersionRef.current?.updated_date !== latest.baseUpdatedAt;
    if ((dirty || baseChanged) && !window.confirm("Restoring the browser draft replaces the current design edits in this editor. Continue?")) return;
    setAutoSave(false);
    if (!commit(() => latest.draft, { restoreDraft: true })) setSaveError("Browser draft could not be applied; offer retained.");
  };
  const discardBrowserDraft = () => {
    const session = draftSessionRef.current;
    const offer = draftVisible;
    if (!session.store || session.store !== draftStore) return;
    if (!window.confirm("Discard the unsent browser draft for this project?")) return;
    const result = session.store.clear(offer?.revision ?? null);
    if (result.status === "removed") {
      session.revision = null;
      session.pending = false;
      setDraftOffer(null);
      if (dirty) persistBrowserDraft(projectRef.current ?? project);
    } else if (result.status === "retained") {
      const latest = session.store.read();
      if (latest.status !== "unavailable") session.revision = latest.revision ?? null;
      if (latest.status === "found") setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt });
      else if (latest.status === "empty") {
        session.pending = false;
        setDraftOffer({ store: draftStore, warning: "Browser draft was removed elsewhere; nothing kept." });
      } else if (latest.status === "unavailable") setDraftOffer({ ...offer, warning: `Browser draft could not be re-read; try again. ${latest.message || ""}` });
      else setDraftOffer({ store: draftStore, revision: latest.revision ?? null, message: latest.message || "Browser draft changed; kept." });
    } else {
      setDraftOffer({ ...offer, warning: `Browser draft could not be cleared. ${result.message || ""}` });
    }
  };
  const cabinetCost = calc.totals.total_signage_cabinet_cost;
  const landscapeCost = calc.totals.total_landscape_cost;
  const sectionTotal = calc.totals.grand_total === null || cabinetCost === null || landscapeCost === null ? null : calc.totals.grand_total + cabinetCost + landscapeCost;
  const undo = () => {
    const live = currentEditorRef.current;
    if (!history.past.length || !live.loaded || live.generation !== saveContext.generation || draftSessionRef.current.pending) return;
    bumpEdit();
    const prevState = history.past[history.past.length - 1];
    setHistory((h) => ({ past: h.past.slice(0, -1), future: [project, ...h.future] }));
    projectRef.current = prevState;
    setProject(prevState);
    setDirty(true);
    persistBrowserDraft(prevState);
  };
  const redo = () => {
    const live = currentEditorRef.current;
    if (!history.future.length || !live.loaded || live.generation !== saveContext.generation || draftSessionRef.current.pending) return;
    bumpEdit();
    const nextState = history.future[0];
    setHistory((h) => ({ past: [...h.past, project], future: h.future.slice(1) }));
    projectRef.current = nextState;
    setProject(nextState);
    setDirty(true);
    persistBrowserDraft(nextState);
  };
  const payload = () => ({
    project_name: project.project_name,
    notes: project.notes,
    status: "calculated",
    assembly_schema_version: project.assembly_schema_version ?? 1,
    items: calc.items,
    selected_equipment: calc.equipment,
    walls: calc.walls,
    // Persist the calculated snapshots too. SignEstimate Pro stored raw pole/cap
    // placement; CCS keeps those original fields plus their calculated values so
    // a later Builder/BOM sync can preserve the exact accepted cost without
    // requiring a live catalog recalc.
    wall_caps: calc.wallCaps,
    poles: calc.poles,
    signage_cabinets: project.signage_cabinets || [],
    landscape: project.landscape || { cell_size_inches: 12, cells: {} },
    total_signage_cabinet_cost: cabinetCost,
    total_landscape_cost: landscapeCost,
    customer_markup_percent: project.customer_markup_percent || 0,
    customer_price_override: project.customer_price_override,
    customer_pricing: project.customer_pricing,
    excavation_method: project.excavation_method,
    selected_concrete_id: project.selected_concrete_id,
    project_concrete_type: project.project_concrete_type,
    project_concrete_admixtures: project.project_concrete_admixtures || [],
    concrete_cost_per_cy: project.concrete_cost_per_cy,
    rebar_cost_per_ft: project.rebar_cost_per_ft,
    forming_materials_cost_spread_foot: project.forming_materials_cost_spread_foot,
    forming_materials_cost_pillar: project.forming_materials_cost_pillar,
    min_excavation_time_hours: project.min_excavation_time_hours,
    hand_dig_excavation_cost_per_cy: project.hand_dig_excavation_cost_per_cy,
    equipment_excavation_cost_per_cy: project.equipment_excavation_cost_per_cy,
    forming_labor_rate: project.forming_labor_rate,
    pouring_labor_rate: project.pouring_labor_rate,
    finishing_labor_rate: project.finishing_labor_rate,
    hand_dig_labor_rate: project.hand_dig_labor_rate,
    equipment_excavation_labor_rate: project.equipment_excavation_labor_rate,
    ai_engineering_recommendation: project.ai_engineering_recommendation,
    ai_engineering_data: project.ai_engineering_data,
    concrete_delivery_snapshot: captureConcreteDeliverySnapshot(calc.delivery),
    total_concrete_cost: calc.totals.total_concrete_cost,
    total_rebar_cost: calc.totals.total_rebar_cost,
    total_excavation_cost: calc.totals.total_excavation_cost,
    total_labor_cost: calc.totals.total_labor_cost,
    total_equipment_cost: calc.totals.total_equipment_cost,
    total_forming_materials_cost: calc.totals.total_forming_materials_cost,
    total_pole_cost: calc.totals.total_pole_cost,
    total_pole_painting_cost: calc.totals.total_pole_painting_cost,
    total_brick_cost: calc.totals.total_brick_cost,
    total_fill_cost: calc.totals.total_fill_cost,
    total_wall_cost: calc.totals.total_wall_cost,
    total_wall_cap_cost: calc.totals.total_wall_cap_cost
  });
  const saveContext = { ...currentEditorRef.current };
  const runSave = (intent) => {
    const attemptKey = `${saveContext.generation}|${saveContext.editRevision}|${intent}`;
    const liveNow = currentEditorRef.current;
    const staleOutcome = { status: "superseded", sourceId: saveContext.sourceId, sourceVersion: null, savedEditRevision: saveContext.editRevision, sourceSaved: false, builderSync: "not_required", error: null, warnings: [] };
    if (!(mountedRef.current && saveContext.loaded && liveNow.loaded && liveNow.sourceId === saveContext.sourceId && liveNow.generation === saveContext.generation && liveNow.editRevision === saveContext.editRevision)) {
      return Promise.resolve(staleOutcome);
    }
    if (copyFlightRef.current) return Promise.resolve(staleOutcome);
    if (draftSessionRef.current.pending) return Promise.resolve({ ...staleOutcome, status: "conflict", error: new Error("Resolve the unsent browser draft offer before saving.") });
    {
      const marker = sourceRefreshRef.current;
      if (marker && liveNow.loaded && liveNow.sourceId === marker.sourceId && liveNow.generation === marker.generation) {
        return Promise.resolve({ ...staleOutcome, status: "conflict", error: new Error("The project must be reloaded after the earlier save finished.") });
      }
    }
    const existing = saveAttemptRef.current;
    if (existing) return existing.promise;
    if (catalogReloadRef.current) {
      setSaveError("Pricing unavailable: fix highlighted design inputs or catalog selections before saving.");
      setDirty(true);
      return Promise.resolve({ ...staleOutcome, status: "failed", error: new Error("Save paused: fix highlighted design inputs or catalog selections.") });
    }
    const captured = {
      project,
      estimateId,
      basePayload: payload(),
      draftStoreRef: draftStore,
      draftOwner: ownerId,
      draftRevision: draftSessionRef.current.revision,
      items: calc.items,
      equipment: calc.equipment,
      walls: calc.walls,
      poles: calc.poles,
      wallCaps: calc.wallCaps,
      delivery: calc.delivery,
      totals: calc.totals,
      sectionTotal,
      cabinetCost,
      landscapeCost,
      computedPricing: void 0
    };
    if (!saveContext.loaded) {
      return Promise.resolve(staleOutcome);
    }
    setSaveError("");
    setSaving(true);
    const promise = saveSessionRef.current.run({
      sourceId: saveContext.sourceId,
      editRevision: saveContext.editRevision,
      getCurrent: () => ({ ...currentEditorRef.current, loaded: mountedRef.current && currentEditorRef.current.loaded }),
      saveSource: async () => {
        const recoveryAck = acknowledgedVersionRef.current;
        const recovery = await loadFoundationBuilderRecovery({
          sourceId: saveContext.sourceId,
          estimateId: captured.estimateId,
          expectedSourceVersion: recoveryAck?.sourceId === saveContext.sourceId ? recoveryAck.updated_date : captured.project.updated_date
        });
        if (recovery) {
          captured.builderRecovery = recovery;
          captured.recoveryMatchesCurrent = sourcePatchMatches(recovery.sourceProject, captured.basePayload);
          return recovery.sourceProject;
        }
        if (pricingBlocked) {
          throw Object.assign(new Error("Save paused: fix highlighted design inputs or catalog selections."), { pricingUnavailable: true });
        }
        let customerPricing = captured.project.customer_pricing;
        if (captured.project.customer_pricing?.applied === true) {
          customerPricing = await calculateSavedCustomerPricing({
            project: { ...captured.project, ...captured.basePayload },
            categorize: categorizeFoundationProject,
            tierNumber: captured.project.customer_pricing?.tier_number
          });
          captured.computedPricing = customerPricing;
          const live = currentEditorRef.current;
          if (!(mountedRef.current && live.sourceId === saveContext.sourceId && live.generation === saveContext.generation && live.editRevision === saveContext.editRevision && live.loaded)) {
            throw Object.assign(new Error("Save superseded by a newer edit or route change."), { superseded: true });
          }
        }
        {
          const prior = captured.project.builder_sync_attempt;
          if (prior != null) {
            const ok = validateFoundationSyncAttempt(prior) && prior.source_project_id === captured.project.id && (!!captured.estimateId && prior.estimate_id === captured.estimateId);
            if (!ok) throw new Error("An unrecognised Builder sync receipt blocks saving. Reload and retry.");
          }
        }
        if (captured.estimateId) {
          captured.syncAttempt = createFoundationSyncAttempt({
            sourceId: captured.project.id,
            estimateId: captured.estimateId,
            key: newCreationRequestKey("foundation_sync"),
            requestedAt: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
        const ack = acknowledgedVersionRef.current;
        const expectedUpdatedAt = ack?.sourceId === saveContext.sourceId ? ack.updated_date : captured.project.updated_date;
        return updateBuilderSourceProject({
          entity: staffEntities.FoundationProject,
          sourceId: saveContext.sourceId,
          expectedUpdatedAt,
          data: { ...captured.basePayload, customer_pricing: customerPricing, ...captured.syncAttempt ? { builder_sync_attempt: captured.syncAttempt } : {} },
          estimateId: captured.estimateId,
          label: "Foundation project"
        });
      },
      syncBuilder: captured.estimateId ? async (savedProject) => recordBuilderSave({
        estimateId: captured.estimateId,
        line: { project_id: saveContext.sourceId, module_key: "foundation" },
        sourceProject: captured.builderRecovery ? savedProject : {
          ...savedProject,
          items: captured.items,
          selected_equipment: captured.equipment,
          walls: captured.walls,
          poles: captured.poles,
          wall_caps: captured.wallCaps,
          builder_calculation: { totals: captured.totals, delivery: captured.delivery, cabinet_cost: captured.cabinetCost, landscape_cost: captured.landscapeCost, section_total: captured.sectionTotal }
        },
        liveTotal: captured.builderRecovery ? void 0 : captured.sectionTotal,
        ...captured.builderRecovery ? { expectedPendingKey: captured.builderRecovery.pendingKey } : {}
      }).then(async (result) => {
        if (captured.builderRecovery) {
          await verifyFoundationRecoverySource({ sourceId: savedProject.id, expectedSourceVersion: savedProject.updated_date });
        }
        const ackLine = result?.line || result;
        assertFoundationBuilderAcknowledgment({ sourceProject: savedProject, estimateId: captured.estimateId, line: ackLine });
        captured.ackLine = ackLine;
        return result;
      }) : null
    }).then((outcome) => {
      if (!mountedRef.current) return outcome;
      const live = currentEditorRef.current;
      const sameContext = live.generation === saveContext.generation && live.sourceId === saveContext.sourceId;
      const fullyCurrent = sameContext && live.editRevision === saveContext.editRevision && live.loaded;
      if (outcome.sourceSaved && live.generation !== saveContext.generation) {
        const prevEpoch = sourceWriteEpochRef.current.get(outcome.sourceId) || { epoch: 0 };
        sourceWriteEpochRef.current.set(outcome.sourceId, { epoch: prevEpoch.epoch + 1, lastSavedVersion: outcome.sourceVersion });
      }
      if (outcome.sourceSaved && live.loaded && live.sourceId === outcome.sourceId && live.generation !== saveContext.generation && projectRef.current?.updated_date !== outcome.sourceVersion) {
        sourceRefreshRef.current = { sourceId: live.sourceId, generation: live.generation, sourceVersion: outcome.sourceVersion };
        setDirty(true);
        setSaveError("An earlier save finished after you navigated away. Reload the saved project before saving again.");
      }
      if (outcome.sourceSaved && outcome.sourceVersion && sameContext) {
        acknowledgedVersionRef.current = {
          sourceId: outcome.sourceId,
          updated_date: outcome.sourceVersion,
          ownerId,
          sourceSnapshot: captured.builderRecovery ? captured.builderRecovery.sourceProject : {
            ...captured.project,
            ...captured.basePayload,
            id: outcome.sourceId,
            updated_date: outcome.sourceVersion
          }
        };
      }
      if (captured.builderRecovery && outcome.builderSync === "synced" && sameContext) {
        setRecoveryRequired(false);
        setProject((prev) => prev?.id === outcome.sourceId ? { ...prev, updated_date: outcome.sourceVersion, builder_sync_attempt: captured.builderRecovery.sourceProject.builder_sync_attempt } : prev);
        if (!fullyCurrent || !captured.recoveryMatchesCurrent) {
          if (captured.ackLine) {
            setLinkedEstimate((prev) => prev?.id === captured.estimateId ? { ...prev, line_items: (prev.line_items || []).map((it) => it.module_key === "foundation" && it.project_id === outcome.sourceId ? captured.ackLine : it) } : prev);
          }
          setAutoSave(false);
          setDirty(true);
          setSaveError("Previous Builder synchronization recovered. Review and save your unsent changes separately.");
          outcome.status = "superseded";
          outcome.warnings.push("previous_sync_recovered_unsent_changes_remain");
          return outcome;
        }
      }
      if (outcome.status === "saved" && fullyCurrent) {
        setRecoveryRequired(false);
        setProject((prev) => prev && prev.id === outcome.sourceId ? { ...prev, updated_date: outcome.sourceVersion, ...captured.computedPricing !== void 0 ? { customer_pricing: captured.computedPricing } : {}, ...captured.syncAttempt ? { builder_sync_attempt: captured.syncAttempt } : {} } : prev);
        if (captured.ackLine) {
          setLinkedEstimate((prev) => prev && prev.id === captured.estimateId ? { ...prev, line_items: (prev.line_items || []).map((it) => it.module_key === "foundation" && it.project_id === outcome.sourceId ? captured.ackLine : it) } : prev);
        }
        setDirty(false);
        setSaveError("");
        if (draftSessionRef.current.store === captured.draftStoreRef && captured.draftOwner === ownerId && captured.draftRevision) {
          const cleared = captured.draftStoreRef.clear(captured.draftRevision);
          if (cleared.status === "removed") {
            draftSessionRef.current.revision = null;
            setDraftOffer((o) => o?.store === draftStore ? { store: draftStore } : o);
          } else if (cleared.status === "unavailable") setDraftOffer((o) => o?.store === draftStore ? { store: draftStore, warning: `Saved, but the browser draft backup could not be cleared. ${cleared.message || ""}` } : o);
          else if (cleared.status === "retained") setDraftOffer((o) => o?.store === draftStore ? { store: draftStore, warning: "Saved; a newer browser draft remains - review it before leaving." } : o);
        }
        try {
          onSaved?.();
        } catch (e) {
          console.error(e);
          outcome.warnings.push("observer_error");
        }
      } else if (sameContext && outcome.status === "superseded" && outcome.builderSync === "pending") {
        setRecoveryRequired(true);
        setSaveError("Source saved; estimate/Builder sync incomplete. Retry save.");
        setDirty(true);
      } else if (sameContext && outcome.status === "partial") {
        setRecoveryRequired(true);
        setSaveError("Source saved; estimate/Builder sync incomplete. Retry save.");
        setDirty(true);
      } else if (sameContext && (outcome.status === "conflict" || outcome.status === "failed")) {
        setSaveError(outcome.error?.pricingUnavailable ? "Pricing unavailable: fix highlighted design inputs or catalog selections before saving." : "Save failed: " + (outcome.error?.message || outcome.status));
        setDirty(true);
      }
      return outcome;
    }).finally(() => {
      if (saveAttemptRef.current?.promise === promise) {
        saveAttemptRef.current = null;
        if (mountedRef.current) setSaving(saveSessionRef.current.isSaving());
      }
    });
    saveAttemptRef.current = { key: attemptKey, promise };
    return promise;
  };
  const handleSave = () => runSave("save");
  saveRef.current = handleSave;
  const handleReloadSaved = () => {
    const marker = sourceRefreshRef.current;
    const live = currentEditorRef.current;
    if (!marker || !mountedRef.current || !live.loaded || live.sourceId !== marker.sourceId || live.generation !== marker.generation) return;
    if (dirty && !window.confirm("Reload the saved project and discard current unsaved changes?")) return;
    currentEditorRef.current = { ...currentEditorRef.current, loaded: false };
    setReloadRevision((r) => r + 1);
  };
  const backTo = estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator";
  const handleSaveAndExit = async () => {
    const outcome = await runSave("save_exit");
    const c = currentEditorRef.current;
    if (outcome?.status === "saved" && mountedRef.current && c.generation === saveContext.generation && c.sourceId === saveContext.sourceId && outcome.sourceId === c.sourceId && outcome.savedEditRevision === c.editRevision && c.editRevision === saveContext.editRevision && c.loaded === true && exitGenerationRef.current !== c.generation) {
      exitGenerationRef.current = c.generation;
      if (embedded) onClose?.();
      else navigate(backTo);
    }
    return outcome;
  };
  const handleSaveAsCopy = () => {
    if (draftSessionRef.current.pending) return;
    if (copyFlightRef.current) return copyFlightRef.current;
    const live0 = currentEditorRef.current;
    if (!mountedRef.current || !saveContext.loaded || !live0.loaded || live0.generation !== saveContext.generation || live0.sourceId !== saveContext.sourceId || live0.estimateId !== saveContext.estimateId || live0.editRevision !== saveContext.editRevision) return null;
    if (saveAttemptRef.current || saveSessionRef.current?.isSaving()) return null;
    if (pricingBlocked || catalogReloadRef.current) {
      setSaveError("Pricing unavailable: fix highlighted design inputs or catalog selections before copying.");
      return null;
    }
    const gen = saveContext.generation;
    const sourceId = saveContext.sourceId;
    const estimateKey = saveContext.estimateId;
    const editRev = saveContext.editRevision;
    let attempt;
    try {
      const baseData = {
        ...payload(),
        project_name: `${project.project_name || "Foundation"} (Copy)`,
        client_name: project.client_name,
        customer_id: project.customer_id,
        // Same-job metadata payload() does not own — a copy keeps the
        // document link, the saved estimate-number lineage (mirroring
        // convertFoundationToBrickStone), the persisted beautify brief
        // image, and any externally-set pricing-engine context.
        estimate_number: project.estimate_number,
        hyperlink: project.hyperlink,
        beautify_data_url: project.beautify_data_url,
        pricing_engine: project.pricing_engine
      };
      const signature = JSON.stringify(baseData);
      if (copyAttemptRef.current.signature !== signature) {
        const { components } = cloneFoundationComponents(
          {
            items: calc.items || [],
            walls: calc.walls || [],
            poles: calc.poles || [],
            wall_caps: calc.wallCaps || [],
            signage_cabinets: project.signage_cabinets || []
          },
          { createId: (kind) => newCreationRequestKey(`foundation_${kind}`) }
        );
        const data = { ...baseData, ...components, status: "draft" };
        delete data.builder_sync_attempt;
        copyAttemptRef.current = { signature, key: newCreationRequestKey("foundation_project_copy"), data };
      }
      attempt = copyAttemptRef.current;
    } catch (e) {
      setSaveError(e?.message || "Foundation project copy could not be prepared.");
      return null;
    }
    const run = Promise.resolve().then(async () => {
      const live = currentEditorRef.current;
      if (!mountedRef.current || !live.loaded || live.generation !== gen || live.sourceId !== sourceId || live.estimateId !== estimateKey || live.editRevision !== editRev) return;
      setSaving(true);
      try {
        const copy = await ensureIdempotentEntityCreate({
          entity: staffEntities.FoundationProject,
          keyField: "creation_request_key",
          key: attempt.key,
          data: attempt.data,
          label: "Foundation project copy"
        });
        if (!copy?.id) throw new Error("Foundation project copy could not be verified.");
        const live2 = currentEditorRef.current;
        if (!mountedRef.current || !live2.loaded || live2.generation !== gen || live2.sourceId !== sourceId || live2.estimateId !== estimateKey || live2.editRevision !== editRev) return;
        navigate(`/FoundationEstimator?id=${encodeURIComponent(copy.id)}`);
      } catch (e) {
        if (mountedRef.current && currentEditorRef.current.loaded && currentEditorRef.current.generation === gen && currentEditorRef.current.sourceId === sourceId) {
          console.error(e);
          alert("Save failed: " + e.message);
        }
      }
    });
    const wrapped = run.finally(() => {
      if (copyFlightRef.current !== wrapped) return;
      copyFlightRef.current = null;
      if (mountedRef.current) setSaving(Boolean(saveSessionRef.current?.isSaving()) || Boolean(saveAttemptRef.current));
    });
    copyFlightRef.current = wrapped;
    return wrapped;
  };
  const handleSwapToBrickStone = async () => {
    if (draftSessionRef.current.pending) return;
    const live = currentEditorRef.current;
    if (!mountedRef.current || !saveContext.loaded || !live.loaded || live.generation !== saveContext.generation || live.sourceId !== saveContext.sourceId || live.estimateId !== saveContext.estimateId || live.editRevision !== saveContext.editRevision) return null;
    if (pricingBlocked || catalogReloadRef.current) {
      setSaveError("Pricing unavailable: fix highlighted design inputs or catalog selections before swapping.");
      return null;
    }
    setSaving(true);
    try {
      const draft = await convertFoundationToBrickStone({ project, attemptRef: swapAttemptRef });
      navigate(`/BrickStoneEstimator?id=${draft.id}`);
    } catch (e) {
      console.error(e);
      alert("Swap failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };
  const handleShareLink = async () => {
    if (draftSessionRef.current.pending) return;
    try {
      const url = await createEstimateReadOnlyShareLink({ estimateId });
      await navigator.clipboard.writeText(url);
      alert("Read-only link copied to clipboard:\n" + url);
    } catch (e) {
      console.error(e);
      alert("Share link failed: " + e.message);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "clay-scope min-h-full bg-gray-50", children: [
    /* @__PURE__ */ jsxs("div", { className: "max-w-[1500px] mx-auto p-4", children: [
      /* @__PURE__ */ jsx(FoundationSectionBanner, { sectionName: project.project_name }),
      saveError && /* @__PURE__ */ jsx("div", { role: "alert", className: "mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-800", children: saveError }),
      catalogBlocked && /* @__PURE__ */ jsxs("div", { role: "alert", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900", children: [
        /* @__PURE__ */ jsx("div", { className: "font-semibold", children: "Pricing unavailable: selected materials or rental items need attention. Unavailable items show saved amounts only; other amounts may be recalculated. Save and estimate handoff are paused." }),
        /* @__PURE__ */ jsx("ul", { className: "mt-1 list-disc pl-5", children: calc.catalogIssues.map((i, idx) => /* @__PURE__ */ jsx("li", { children: i.message }, idx)) }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: handleCatalogReload,
            disabled: catalogReloading || loading || saving,
            className: "mt-2 rounded-sm border border-amber-400 bg-white px-2 py-1 text-[12px] font-semibold text-amber-800 disabled:opacity-50",
            children: catalogReloading ? "Reloading catalogs\u2026" : "Reload catalogs"
          }
        )
      ] }),
      inputBlocked && /* @__PURE__ */ jsxs("div", { role: "alert", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900", children: [
        /* @__PURE__ */ jsx("div", { className: "font-semibold", children: "Design input required: fix highlighted design inputs below. Save and estimate handoff are paused." }),
        /* @__PURE__ */ jsx("ul", { className: "mt-1 list-disc pl-5", children: inputIssues.map((i, idx) => /* @__PURE__ */ jsx("li", { children: i.message }, idx)) })
      ] }),
      (() => {
        const marker = sourceRefreshRef.current;
        const live = currentEditorRef.current;
        if (!marker || !live.loaded || live.sourceId !== marker.sourceId || live.generation !== marker.generation) return null;
        return /* @__PURE__ */ jsxs("div", { role: "alert", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800", children: [
          "An earlier save finished after this view changed. Reload the saved project before saving again.",
          /* @__PURE__ */ jsx("button", { type: "button", onClick: handleReloadSaved, className: "ml-2 font-semibold underline", children: "Reload saved project" })
        ] });
      })(),
      (() => {
        const recovery = foundationSyncRecoveryState({ project, estimateId, estimate: linkedEstimate });
        if (!["pending", "unsupported", "mismatch"].includes(recovery.status) && !recoveryRequired) return null;
        const detail = recovery.status === "mismatch" && recovery.attempt?.estimate_id ? "Open the linked estimate to review." : recovery.message || "A saved Builder sync attempt is still unacknowledged.";
        return /* @__PURE__ */ jsxs("div", { role: "status", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 flex items-center gap-3", children: [
          /* @__PURE__ */ jsxs("span", { children: [
            detail,
            " Current displayed totals will be synchronized; accepted quote prices remain under the platform workflow. ",
            dirty ? "You also have unsaved local edits." : ""
          ] }),
          recovery.status === "mismatch" && recovery.attempt?.estimate_id && /* @__PURE__ */ jsx("a", { className: "underline", href: `/EstimateDetail?id=${encodeURIComponent(recovery.attempt.estimate_id)}`, children: "Open estimate" }),
          /* @__PURE__ */ jsx("button", { type: "button", disabled: saving || recovery.status === "unsupported" || recovery.status === "mismatch", className: "px-2 py-1 rounded bg-amber-600 text-white disabled:opacity-50", onClick: () => saveRef.current?.(), children: "Review and retry Save" })
        ] });
      })(),
      assemblyIssues.length > 0 && /* @__PURE__ */ jsxs("div", { role: "status", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900", children: [
        /* @__PURE__ */ jsx("span", { className: "font-semibold", children: "Unresolved placements" }),
        /* @__PURE__ */ jsx("ul", { className: "list-disc pl-5 mt-1 space-y-0.5", children: assemblyIssues.map((issue, i) => /* @__PURE__ */ jsx("li", { children: issue.message }, `${issue.code}-${issue.kind}-${issue.componentId || ""}-${issue.parentId || ""}-${i}`)) })
      ] }),
      constructionWarnings.length > 0 && /* @__PURE__ */ jsxs("div", { role: "status", className: "mb-3 rounded border border-blue-300 bg-blue-50 px-3 py-2 text-[12px] text-blue-900", children: [
        /* @__PURE__ */ jsx("span", { className: "font-semibold", children: "Construction checks \u2014 verify before build" }),
        /* @__PURE__ */ jsx("ul", { className: "list-disc pl-5 mt-1 space-y-0.5", children: constructionWarnings.map((warning, i) => /* @__PURE__ */ jsx("li", { children: warning.message }, `${warning.code}-${warning.kind}-${warning.index ?? ""}-${i}`)) })
      ] }),
      draftVisible?.backedUp && !draftVisible?.warning && /* @__PURE__ */ jsx("div", { role: "status", className: "mb-3 rounded border border-blue-300 bg-blue-50 px-3 py-2 text-[13px] text-blue-900", children: draftVisible.message }),
      draftVisible?.warning && /* @__PURE__ */ jsx("div", { role: "alert", className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900", children: draftVisible.warning }),
      (draftVisible?.draft || draftVisible?.message) && draftSessionRef.current.pending && /* @__PURE__ */ jsx("div", { role: "alert", className: "mb-3 rounded border border-indigo-300 bg-indigo-50 px-3 py-2 text-[13px] text-indigo-900", children: draftVisible.draft ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "font-semibold", children: [
          "Unsent browser-tab draft found. Nothing restored or sent. ",
          draftVisible.savedAt ? `Saved ${draftVisible.savedAt}.` : "",
          " Recovery covers design and customer-pricing fields; customer links and saved receipts stay as stored."
        ] }),
        draftVisible.baseUpdatedAt && acknowledgedVersionRef.current?.updated_date !== draftVisible.baseUpdatedAt && /* @__PURE__ */ jsx("div", { className: "mt-1", children: "Saved project changed since these edits." }),
        /* @__PURE__ */ jsxs("div", { className: "mt-2 flex gap-2", children: [
          /* @__PURE__ */ jsx("button", { type: "button", onClick: restoreBrowserDraft, className: "rounded-sm border border-indigo-400 bg-white px-2 py-1 text-[12px] font-semibold text-indigo-800", children: "Restore browser draft" }),
          /* @__PURE__ */ jsx("button", { type: "button", onClick: discardBrowserDraft, className: "rounded-sm border border-gray-400 bg-white px-2 py-1 text-[12px] font-semibold text-gray-700", children: "Discard browser draft" })
        ] })
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "font-semibold", children: [
          "A browser draft exists but cannot be restored. ",
          draftVisible.message || "",
          " Recovery covers design and customer-pricing fields; customer links and saved receipts stay as stored."
        ] }),
        /* @__PURE__ */ jsx("div", { className: "mt-2", children: /* @__PURE__ */ jsx("button", { type: "button", onClick: discardBrowserDraft, className: "rounded-sm border border-gray-400 bg-white px-2 py-1 text-[12px] font-semibold text-gray-700", children: "Discard browser draft" }) })
      ] }) }),
      /* @__PURE__ */ jsxs("fieldset", { disabled: draftSessionRef.current.pending, className: "contents min-w-0", children: [
        /* @__PURE__ */ jsx(
          FoundationToolbar,
          {
            title: "Edit Concrete | Masonry | Poles Estimate",
            subtitle: "Engineering, foundation, excavation, wall & pole estimating",
            backTo,
            total: sectionTotal,
            saving,
            dirty: dirty || draftSessionRef.current.pending,
            lastSavedAt: project?.updated_date,
            autoSave,
            pricingUnavailable: pricingBlocked,
            onToggleAutoSave: () => {
              if (!draftSessionRef.current.pending) setAutoSave((v) => !v);
            },
            canUndo: history.past.length > 0,
            canRedo: history.future.length > 0,
            onUndo: undo,
            onRedo: redo,
            onSave: handleSave,
            onSaveAndExit: handleSaveAndExit,
            onSaveAsCopy: handleSaveAsCopy,
            onSaveAsTemplate: () => {
              if (!draftSessionRef.current.pending) setTemplateMode("save");
            },
            onTemplates: () => {
              if (!draftSessionRef.current.pending) setTemplateMode("load");
            },
            onSwapToBrickStone: handleSwapToBrickStone,
            onShareLink: estimateId ? handleShareLink : void 0,
            onHelp: () => setShowHelp((v) => !v),
            onBack: embedded ? () => {
              if (saving) return;
              if ((dirty || recoveryRequired) && !window.confirm("You have unsaved changes or an unacknowledged Builder sync. Leave without saving?")) return;
              onClose?.();
            } : () => {
              if (saving) return;
              if ((dirty || recoveryRequired) && !window.confirm("You have unsaved changes or an unacknowledged Builder sync. Leave without saving?")) return;
              navigate(backTo);
            }
          }
        ),
        showHelp && /* @__PURE__ */ jsxs("div", { className: "bg-blue-50 border border-blue-200 rounded-sm p-3 mb-3 text-[12px] text-blue-900", children: [
          "Add each footing or pillar under ",
          /* @__PURE__ */ jsx("b", { children: "Foundation" }),
          ", then place poles, masonry walls and caps in the other tabs. Concrete, rebar, excavation and labor rates come from your settings and supplier inventory. The 3D preview on the right updates as you type \u2014 left drag orbits, right drag pans, scroll zooms. Save & Exit pushes the total back to the combined estimate."
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_560px] gap-4 items-start", children: [
          /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsxs(Tabs, { defaultValue: "foundations", children: [
            /* @__PURE__ */ jsxs(TabsList, { className: "flex flex-wrap h-auto bg-white border border-gray-200 p-1 mb-3 rounded-sm justify-start", children: [
              /* @__PURE__ */ jsxs(TabsTrigger, { value: "foundations", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx(AnchorIcon, { className: "w-3.5 h-3.5" }),
                " Foundation (",
                calc.items.length,
                ")"
              ] }),
              /* @__PURE__ */ jsxs(TabsTrigger, { value: "landscape", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx(LayoutGrid, { className: "w-3.5 h-3.5" }),
                " Walls & Poles (",
                (calc.walls?.length || 0) + (calc.poles?.length || 0),
                ")"
              ] }),
              /* @__PURE__ */ jsxs(TabsTrigger, { value: "caps", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx(Layers, { className: "w-3.5 h-3.5" }),
                " Wall Caps"
              ] }),
              /* @__PURE__ */ jsxs(TabsTrigger, { value: "signage", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx(Trees, { className: "w-3.5 h-3.5" }),
                " Signage & Landscape"
              ] }),
              /* @__PURE__ */ jsxs(TabsTrigger, { value: "equipment", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx(WrenchIcon, { className: "w-3.5 h-3.5" }),
                " Equipment"
              ] }),
              /* @__PURE__ */ jsxs(TabsTrigger, { value: "summary", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx(TrendingUp, { className: "w-3.5 h-3.5" }),
                " Cost Summary"
              ] }),
              /* @__PURE__ */ jsxs(TabsTrigger, { value: "bom", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx(ClipboardList, { className: "w-3.5 h-3.5" }),
                " Bill of Materials"
              ] }),
              /* @__PURE__ */ jsxs(TabsTrigger, { value: "pricing", className: TAB_CLASS, children: [
                /* @__PURE__ */ jsx(Tag, { className: "w-3.5 h-3.5" }),
                " Customer Pricing"
              ] })
            ] }),
            /* @__PURE__ */ jsxs(TabsContent, { value: "foundations", className: "space-y-3", children: [
              /* @__PURE__ */ jsx(AiEngineeringAssistant, { project, onResult: patch }),
              calc.items.length === 0 ? /* @__PURE__ */ jsx("div", { className: "text-center py-12 bg-white rounded-sm border border-dashed border-gray-300 text-[12px] text-gray-500", children: "No foundations yet \u2014 add a spread footing or pillar to start." }) : /* @__PURE__ */ jsx("div", { className: "space-y-3", children: calc.items.map((item, index) => /* @__PURE__ */ jsx(
                FoundationItemCard,
                {
                  item,
                  pricing: calc.itemPricing[index],
                  index,
                  catalog,
                  onChange: patchItem,
                  onRemove: removeItem,
                  onDuplicate: duplicateItem
                },
                item.component_id || index
              )) }),
              /* @__PURE__ */ jsxs(
                "button",
                {
                  type: "button",
                  onClick: () => addItem("spread_foot"),
                  className: "h-[30px] px-3 flex items-center gap-1.5 rounded-sm border border-gray-300 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50",
                  children: [
                    /* @__PURE__ */ jsx(Plus, { className: "w-3.5 h-3.5" }),
                    " Add Foundation Item"
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxs(TabsContent, { value: "landscape", className: "space-y-4", children: [
              /* @__PURE__ */ jsx(
                FoundationWallsPanel,
                {
                  walls: calc.walls,
                  options: catalog.walls,
                  wallPricing: calc.wallPricing,
                  onChange: (walls) => patch({ walls })
                }
              ),
              /* @__PURE__ */ jsx(
                FoundationPolesPanel,
                {
                  poles: calc.poles,
                  options: catalog.poles,
                  items: calc.items,
                  polePricing: calc.polePricing,
                  onChange: (poles) => patch({ poles })
                }
              ),
              /* @__PURE__ */ jsx(
                FoundationLayoutCanvas,
                {
                  items: project.items || [],
                  poles: project.poles || [],
                  onMoveItem: patchItem
                }
              )
            ] }),
            /* @__PURE__ */ jsxs(TabsContent, { value: "signage", className: "space-y-4", children: [
              /* @__PURE__ */ jsx(
                SignageCabinetsPanel,
                {
                  cabinets: project.signage_cabinets || [],
                  items: project.items || [],
                  poles: project.poles || [],
                  onChange: (signage_cabinets) => patch({ signage_cabinets })
                }
              ),
              /* @__PURE__ */ jsx(
                LandscapeDesigner,
                {
                  landscape: project.landscape,
                  onChange: (landscape) => patch({ landscape })
                }
              )
            ] }),
            /* @__PURE__ */ jsx(TabsContent, { value: "caps", children: /* @__PURE__ */ jsx(
              FoundationWallCapsPanel,
              {
                caps: calc.wallCaps,
                walls: calc.walls,
                options: catalog.caps,
                onChange: (wall_caps) => patch({ wall_caps })
              }
            ) }),
            /* @__PURE__ */ jsx(TabsContent, { value: "equipment", children: /* @__PURE__ */ jsx(
              FoundationEquipmentTab,
              {
                foundationItems: project.items || [],
                inventory,
                selectedEquipmentList: project.selected_equipment || [],
                onUpdate: (rows) => patch({ selected_equipment: rows }),
                markDirty: () => setDirty(true)
              }
            ) }),
            /* @__PURE__ */ jsxs(TabsContent, { value: "summary", className: "space-y-3", children: [
              /* @__PURE__ */ jsxs("label", { className: "block bg-white rounded-sm border border-gray-200 p-3 text-[11px] text-gray-500", children: [
                "Section name",
                /* @__PURE__ */ jsx(
                  Input,
                  {
                    value: project.project_name || "",
                    onChange: (e) => patch({ project_name: e.target.value })
                  }
                )
              ] }),
              /* @__PURE__ */ jsx(ConcreteDeliveryPanel, { project, delivery: calc.delivery, onChange: patch }),
              /* @__PURE__ */ jsx(FoundationRatesPanel, { settings, project, onChange: patch }),
              /* @__PURE__ */ jsxs("div", { className: "max-w-xl", children: [
                /* @__PURE__ */ jsx(FoundationTotals, { totals: calc.totals, pricingUnavailable: pricingBlocked }),
                /* @__PURE__ */ jsxs("div", { className: "mt-3 space-y-1 text-[12px] text-gray-600", children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx("span", { children: "Signage cabinets" }),
                    /* @__PURE__ */ jsx("span", { children: hasFoundationCostSnapshot(cabinetCost) ? money(cabinetCost) : "Not saved" })
                  ] }),
                  /* @__PURE__ */ jsxs("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx("span", { children: "Site landscaping" }),
                    /* @__PURE__ */ jsx("span", { children: hasFoundationCostSnapshot(landscapeCost) ? money(landscapeCost) : "Not saved" })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "mt-2 text-right text-[12px] text-gray-500", children: [
                  "Section total flowing to estimate: ",
                  pricingBlocked ? /* @__PURE__ */ jsx("b", { className: "text-amber-700", children: "Estimate handoff paused" }) : /* @__PURE__ */ jsx("b", { className: "text-red-700", children: money(sectionTotal) })
                ] }),
                /* @__PURE__ */ jsx(
                  Link,
                  {
                    to: "/FoundationCatalog",
                    className: "inline-block mt-3 text-[12px] text-gray-600 hover:text-red-600",
                    children: "Manage foundation catalog \u2192"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsx(TabsContent, { value: "bom", children: /* @__PURE__ */ jsx(
              FoundationBOM,
              {
                items: calc.items,
                poles: calc.poles,
                walls: calc.walls,
                delivery: calc.delivery,
                totals: calc.totals,
                inventory,
                itemPricing: calc.itemPricing,
                polePricing: calc.polePricing,
                wallPricing: calc.wallPricing,
                cabinets: project.signage_cabinets || [],
                landscape: project.landscape,
                landscapePricing: calc.landscapePricing,
                pricingUnavailable: pricingBlocked
              }
            ) }),
            /* @__PURE__ */ jsx(TabsContent, { value: "pricing", className: "space-y-4", children: pricingBlocked ? /* @__PURE__ */ jsx("div", { className: "rounded-sm border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800", children: "Customer pricing unavailable: fix highlighted design inputs or catalog selections." }) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx(
                CustomerPricingPanel,
                {
                  cost: sectionTotal,
                  project,
                  onChange: (changes) => patch({
                    ...changes,
                    customer_pricing: { ...project.customer_pricing || {}, applied: false }
                  })
                }
              ),
              /* @__PURE__ */ jsx(
                CustomerPricingTab,
                {
                  project: { ...project, ...payload() },
                  categorize: categorizeFoundationProject,
                  accentColor: "red",
                  onApplyTier: (tier) => patch({
                    customer_pricing: { ...project.customer_pricing || {}, applied: true, tier_number: tier }
                  })
                }
              )
            ] }) })
          ] }) }),
          /* @__PURE__ */ jsx("div", { className: "xl:sticky xl:top-4", children: inputBlocked ? /* @__PURE__ */ jsx("div", { className: "rounded-sm border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800", children: "3D preview hidden until the highlighted design inputs are corrected." }) : /* @__PURE__ */ jsx(Foundation3DPreview, { project }) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(
      FoundationTemplateDialog,
      {
        open: !!templateMode && !draftSessionRef.current.pending,
        mode: templateMode,
        onClose: () => setTemplateMode(null),
        project,
        saveDisabled: pricingBlocked || catalogReloading,
        saveDisabledReason: "Pricing unavailable: fix highlighted design inputs or catalog selections before saving a template.",
        onApply: (data) => {
          let patchData;
          try {
            patchData = prepareFoundationTemplatePatch(data, {
              createId: (kind) => newCreationRequestKey(`foundation_${kind}`)
            });
          } catch (e) {
            setSaveError(e?.message || "Template assembly could not be applied.");
            return false;
          }
          return commit(() => patchData);
        }
      }
    )
  ] });
}
