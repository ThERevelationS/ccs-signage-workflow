import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
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
  Tag,
} from "lucide-react";
import FoundationItemCard from "@/components/estimator/foundation/FoundationItemCard";
import { hasPreliminaryNotice } from "@/components/estimator/foundation/foundationPreliminaryNotice";
import FoundationReinforcementProposalPanel from "@/components/estimator/foundation/FoundationReinforcementProposalPanel";
import { useFoundationReinforcementEditor } from "@/components/estimator/foundation/useFoundationReinforcementEditor";
import FoundationRatesPanel from "@/components/estimator/foundation/FoundationRatesPanel";
import FoundationEquipmentTab from "@/components/estimator/foundation/FoundationEquipmentTab";
import FoundationTotals from "@/components/estimator/foundation/FoundationTotals";
import ConcreteDeliveryPanel from "@/components/estimator/foundation/ConcreteDeliveryPanel";
import FoundationBOM from "@/components/estimator/foundation/FoundationBOM";
import FoundationFieldPackage from "@/components/estimator/foundation/FoundationFieldPackage";
import FoundationDesignBasis from "@/components/estimator/foundation/FoundationDesignBasis";
import FoundationBulkMaterialPanel from "@/components/estimator/foundation/FoundationBulkMaterialPanel";
import FoundationGuidedSteps from "@/components/estimator/foundation/FoundationGuidedSteps";
import { diffFoundationProjects, summarizeFoundationDiff } from "@/components/estimator/foundation/foundationRevisionDiff";
import FoundationWallsPanel from "@/components/estimator/foundation/FoundationWallsPanel";
import FoundationWallCapsPanel from "@/components/estimator/foundation/FoundationWallCapsPanel";
import FoundationPolesPanel from "@/components/estimator/foundation/FoundationPolesPanel";
import FoundationToolbar from "@/components/estimator/foundation/FoundationToolbar";
import FoundationSectionBanner from "@/components/estimator/foundation/FoundationSectionBanner";
import AiEngineeringAssistant from "@/components/estimator/foundation/AiEngineeringAssistant";
import FoundationPhotoIntake from "@/components/estimator/foundation/FoundationPhotoIntake";
import FoundationAiIntake from "@/components/estimator/foundation/FoundationAiIntake";
import Foundation3DPreview from "@/components/estimator/foundation/Foundation3DPreview";
import FoundationTemplateDialog from "@/components/estimator/foundation/FoundationTemplateDialog";
import FoundationSyncConflictDialog, { FoundationSyncRetryAction, useFoundationBuilderSyncRetry, useFoundationSyncConflict } from "@/components/estimator/foundation/FoundationSyncConflictDialog";
import FoundationLayoutCanvas from "@/components/estimator/foundation/FoundationLayoutCanvas";
import { createSceneHistory, sceneLayoutAnchor } from "@/components/estimator/foundation/foundationSceneHistory";
import { createSceneSelection, parseSceneNodeId, sceneNodeId } from "@/components/estimator/foundation/foundationSceneSelection";
import { duplicateFoundationAssembly } from "@/components/estimator/foundation/foundationDuplicateMirror";
import SignageCabinetsPanel from "@/components/estimator/foundation/SignageCabinetsPanel";
import LandscapeDesigner from "@/components/estimator/foundation/LandscapeDesigner";
import CustomerPricingPanel from "@/components/estimator/foundation/CustomerPricingPanel";
import CustomerPricingTab from "@/components/markup/CustomerPricingTab";
import { categorizeFoundationProject } from "@/components/markup/projectCategorizer";
import { calculateSavedCustomerPricing } from "@/components/markup/savedCustomerPricing";
import { hasFoundationCostSnapshot } from "@/components/estimator/foundation/foundationCatalogIntegrity";
import { calcProject, money, captureConcreteDeliverySnapshot } from "@/components/estimator/foundation/foundationCalc";
import { normalizeConcreteSupplier } from "@/components/estimator/foundation/legacyFoundationCalc";
import { normalizeFoundationInventoryRows } from "@/components/masterInventory/inventoryNormalization";
import { recordBuilderSave, foundationRecordSavedTotal } from "@/components/estimator/builder/builderService";
import { loadAllEntityRows } from "@/lib/loadAllEntityRows";
import { updateBuilderSourceProject, sourcePatchMatches } from "@/components/estimator/builder/sourceProjectPersistence";
import { loadFoundationBuilderRecovery, verifyFoundationRecoverySource } from "@/components/estimator/foundation/foundationBuilderRecovery";
import { createFoundationSaveSession } from "@/components/estimator/foundation/foundationSaveSession";
import { createFoundationDraftStore, foundationDraftRebaseProject, FOUNDATION_DRAFT_FIELDS } from "@/components/estimator/foundation/foundationDraftRecovery";
import { useAuth } from "@/components/auth/EmailGate";
import { createFoundationSyncAttempt, foundationSyncRecoveryState, assertFoundationBuilderAcknowledgment, resolveFoundationSyncReceiptForSave, classifyFoundationSyncRetry } from "@/components/estimator/foundation/foundationSyncRecovery";
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
  wall_width_inches: 8,
});

const TAB_CLASS =
  "gap-1.5 text-[12px] data-[state=active]:bg-red-600 data-[state=active]:text-white rounded-sm";

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
  const [mainTab, setMainTab] = useState("foundations");
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
  // O-040 scene history â€” stroke-level undo for canvas geometry edits. One
  // store per mounted editor; the canvas records every committed gesture
  // into it (foundationSceneHistory.js â€” see MOUNT-ANCHORS.md).
  const sceneHistoryRef = useRef(null);
  if (!sceneHistoryRef.current) sceneHistoryRef.current = createSceneHistory();
  const sceneHistory = sceneHistoryRef.current;
  // Re-render on history mutations so the undo UI state stays live.
  useSyncExternalStore(sceneHistory.subscribe, () => sceneHistory.stateVersion);
  // O-034 scene selection â€” object tree / properties / breadcrumb sync
  // store (foundationSceneSelection.js â€” see MOUNT-ANCHORS.md). Same mount
  // shape as sceneHistory: the page owns one instance the canvas drives,
  // and this subscription keeps selection mutations render-live for the
  // CMP-C03 panels that consume it.
  const sceneSelectionRef = useRef(null);
  if (!sceneSelectionRef.current) sceneSelectionRef.current = createSceneSelection();
  const sceneSelection = sceneSelectionRef.current;
  useSyncExternalStore(sceneSelection.subscribe, () => sceneSelection.stateVersion);
  // O-034 â€” selected component ids feed the 3D preview's highlight seam.
  const highlightComponentIds = sceneSelection.getState().ids
    .map((id) => parseSceneNodeId(id)?.componentId)
    .filter(Boolean);
  const [saveError, setSaveError] = useState("");
  const [reloadRevision, setReloadRevision] = useState(0);
  const [linkedEstimate, setLinkedEstimate] = useState(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);

  const contextKey = JSON.stringify([ownerId, id, estimateId, project?.id, reloadRevision]);
  if (contextKeyRef.current !== contextKey) {
    contextKeyRef.current = contextKey;
    editRevisionRef.current += 1;
    contextGenerationRef.current += 1;
    // O-040: project/source switch â€” reset the scene undo chain so recorded
    // gestures from the previous context can never apply to this one.
    // O-035: the scene CAS domain is {items, poles, walls} â€” the canvas
    // observes and records in the full domain now, so the reset anchor must
    // match or every later entry quarantines stale.
    sceneHistory.clear(sceneLayoutAnchor({ items: project?.items || [], poles: project?.poles || [], walls: project?.walls || [] }));
    const previousAcknowledgment = acknowledgedVersionRef.current;
    acknowledgedVersionRef.current = project?.id ? {
      sourceId: project.id, updated_date: project.updated_date, ownerId,
      sourceSnapshot: previousAcknowledgment?.sourceId === project.id && previousAcknowledgment?.ownerId === ownerId ? previousAcknowledgment.sourceSnapshot : null,
    } : null;
  }
  const contextLoaded = mountedRef.current && !loading && !loadError && !!project && project.id === id && (!estimateId || linkedEstimate?.id === estimateId) && loadedOwnerRef.current === ownerId;
  currentEditorRef.current = {
    sourceId: contextLoaded ? project.id : null,
    estimateId: estimateId || null,
    generation: contextGenerationRef.current,
    editRevision: editRevisionRef.current,
    loaded: contextLoaded,
  };

  const bumpEdit = () => {
    editRevisionRef.current += 1;
    currentEditorRef.current = { ...currentEditorRef.current, editRevision: editRevisionRef.current };
  };

  const copyAttemptRef = useRef({ signature: "", key: "" });
  const copyFlightRef = useRef(null);
  const sourceRefreshRef = useRef(null);
  const sourceWriteEpochRef = useRef(new Map()); // sourceId -> {epoch,lastSavedVersion}; own delayed writes only
  const projectRef = useRef(null);
  const swapAttemptRef = useRef({ signature: "", key: "" });
  projectRef.current = contextLoaded ? project : null;

  // Unsent browser-tab draft recovery (per owner/source/estimate context).
  const draftStore = useMemo(
    () => createFoundationDraftStore({ getStorage: () => window.sessionStorage, ownerId, sourceId: id, estimateId: estimateId || null }),
    [ownerId, id, estimateId],
  );
  const draftSessionRef = useRef({ store: null, revision: null, pending: false });
  if (draftSessionRef.current.store !== draftStore) draftSessionRef.current = { store: draftStore, revision: null, pending: false };
  const [draftOffer, setDraftOffer] = useState(null); // { store, revision, draft?, message?, warning? } scoped to current store
  const draftVisible = draftOffer?.store === draftStore ? draftOffer : null;
  // Merge-conflict dialog + partial Builder-sync retry state (CMP-A04 tail).
  const syncConflict = useFoundationSyncConflict();
  const lastSyncCaptureRef = useRef(null);
  const syncRetry = useFoundationBuilderSyncRetry(() => ({
    sourceId: id,
    estimateId,
    expectedSourceVersion: acknowledgedVersionRef.current?.updated_date,
    savedProject: acknowledgedVersionRef.current?.sourceSnapshot,
    builderCalculation: lastSyncCaptureRef.current?.builderCalculation ?? null,
    liveTotal: lastSyncCaptureRef.current?.liveTotal,
    expectedPendingKey: classifyFoundationSyncRetry({ project, estimateId, estimate: linkedEstimate }).pendingKey ?? undefined,
  }));

  useEffect(() => {
    copyAttemptRef.current = { signature: "", key: "" };
    swapAttemptRef.current = { signature: "", key: "" };
  }, [id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
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
      estimateId ? staffEntities.AllInOneEstimate.get(estimateId) : Promise.resolve(null),
    ])
      .then(([proj, inv, concreteServices, settingRows, est]) => {
        if (!active) return;
        if (proj?.id !== id || (estimateId && est?.id !== estimateId)) {
          setProject(proj?.id === id ? proj : null);
          if (estimateId && est?.id !== estimateId) setLoadError("Linked estimate could not be verified.");
          return;
        }
        const epochNow = sourceWriteEpochRef.current.get(proj.id);
        if (epochNow && epochNow.epoch > epochAtStart && proj.updated_date !== epochNow.lastSavedVersion) {
          // Our own delayed write landed during this read; the snapshot is
          // older than the known saved version â€” one bounded fresh read.
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
          selected_equipment: proj.selected_equipment || [],
        };
        let normalized;
        try {
          normalized = normalizeFoundationAssembly(merged, {
            createId: (kind) => newCreationRequestKey(`foundation_${kind}`),
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
        // Canonicalize once at state ingress (CMP-A08): every downstream read â€”
        // catalog memo, tab props, BOM, and calcProject â€” sees canonical rows.
        setInventory(normalizeFoundationInventoryRows([...(inv || []), ...(concreteServices || []).map(normalizeConcreteSupplier)]));
        setSettings(
          Object.fromEntries((settingRows || []).map((s) => [s.setting_name, s.setting_value]))
        );
      })
      .catch((error) => {
        if (!active) return;
        console.error("Foundation Builder prerequisites could not be loaded:", error);
        setLoadError(error?.message || "Foundation Builder prerequisites could not be verified.");
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id, estimateId, reloadRevision, ownerId, draftStore]);

  const savedSourceProject = acknowledgedVersionRef.current?.sourceId === project?.id && acknowledgedVersionRef.current?.ownerId === ownerId
    ? acknowledgedVersionRef.current?.sourceSnapshot ?? null : null;
  // O-099 — saved-vs-live revision comparison; the saved baseline is the
  // acknowledged snapshot, never a guessed earlier state.
  const diffRows = useMemo(
    () => (savedSourceProject && project ? diffFoundationProjects(savedSourceProject, project) : []),
    [savedSourceProject, project]
  );
  const diffCounts = useMemo(() => summarizeFoundationDiff(diffRows), [diffRows]);
  const calc = useMemo(
    () => (project ? calcProject(project, inventory, settings, { savedProject: savedSourceProject }) : null),
    [project, inventory, settings, savedSourceProject]
  );

  const catalogBlocked = Boolean(calc?.catalogIssues?.length);
  const inputIssues = calc?.inputIssues || [];
  const inputBlocked = inputIssues.length > 0;
  const pricingBlocked = catalogBlocked || inputBlocked;
  // Advisory construction checks (CMP-B16) â€” verify-style warnings only;
  // they render on the diagnostics surface but never block save or handoff.
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
    const isCurrentFlight = (flight) => {
      const l = currentEditorRef.current;
      return mountedRef.current && catalogReloadRef.current === flight && l.loaded
        && l.sourceId === sourceId && l.estimateId === estimateKey && l.generation === generation;
    };
    const flight = (async () => {
      const [inv, concreteServices, settingRows] = await Promise.all([
        loadAllEntityRows({ entity: staffEntities.FoundationInventory, query: { show_in_foundation: true }, sort: "material_name", label: "Foundation inventory" }),
        loadAllEntityRows({ entity: staffEntities.LaborServiceInventory, query: { service_category: "concrete_service", is_active: true }, sort: "service_name", label: "Concrete labor/services" }),
        loadAllEntityRows({ entity: staffEntities.Settings, sort: "created_date", label: "Estimator Settings" }),
      ]);
      if (!isCurrentFlight(flight)) return; // stale reply: never install into a newer context
      bumpEdit();
      setInventory(normalizeFoundationInventoryRows([...(inv || []), ...(concreteServices || []).map(normalizeConcreteSupplier)]));
      setSettings(Object.fromEntries((settingRows || []).map((r) => [r.setting_name, r.setting_value])));
      setAutoSave(false);
      setDirty(true);
      setSaveError("");
    })();
    catalogReloadRef.current = flight;
    setCatalogReloading(true);
    try { await flight; }
    catch (e) {
      if (isCurrentFlight(flight)) setSaveError("Catalog reload failed: " + (e?.message || "unknown error") + " Last known catalog retained; retry.");
    } finally {
      if (catalogReloadRef.current === flight) {
        const current = isCurrentFlight(flight);
        catalogReloadRef.current = null;
        if (current) setCatalogReloading(false);
      }
    }
  };

  // Invalidate an in-flight catalog reload on route/reload context change.
  useEffect(() => {
    catalogReloadRef.current = null;
    setCatalogReloading(false);
  }, [id, estimateId, reloadRevision, ownerId]);

  const assemblyIssues = useMemo(() => (project ? foundationAssemblyIssues(project) : []), [project]);

  const catalog = useMemo(
    () => ({
      concrete: inventory.filter((i) =>
        ["concrete_service", "bagged_concrete"].includes(i.material_type) &&
        i.show_in_foundation !== false
      ),
      poles: inventory.filter((i) => i.material_type === "pole"),
      walls: inventory.filter((i) => ["brick_stone", "wall_material"].includes(i.material_type)),
      fill: inventory.filter((i) => i.material_type === "fill_material"),
      forming: inventory.filter((i) => ["forming", "forming_material"].includes(i.material_type)),
      caps: inventory.filter((i) => i.material_type === "wall_cap"),
      equipment: inventory.filter((i) => i.material_type === "excavation_equipment"),
    }),
    [inventory]
  );

  // Auto-save (debounced)
  useEffect(() => {
    if (!autoSave || !dirty || recoveryRequired || pricingBlocked || catalogReloading || catalogReloadRef.current || draftSessionRef.current.pending) return;
    const t = setTimeout(() => saveRef.current?.(), 2000);
    return () => clearTimeout(t);
  }, [autoSave, dirty, project, recoveryRequired, pricingBlocked, catalogReloading]);

  // Ctrl+S / Cmd+S saves the section without leaving the editor.
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
  // Block accidental navigation while a save is in flight.
  useEffect(() => {
    if (!saving && !dirty && !recoveryRequired && !draftSessionRef.current.pending) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving, dirty, recoveryRequired, draftOffer]);

  // In-app dirty-route-leave guard. The app router is a declarative
  // BrowserRouter (no data-router blocker APIs), so a page-scoped guard covers
  // the two real leave paths: internal anchor clicks (shell nav, in-page links)
  // and browser Back/Forward. Unsent edits are already persisted to the tab
  // draft on every commit â€” the confirm makes an accidental leave a choice.
  const navGuardArmedRef = useRef(false);
  useEffect(() => {
    const needsGuard = () => saving || dirty || recoveryRequired || draftSessionRef.current.pending;
    const confirmLeave = () => window.confirm(
      "You have unsaved changes or an unacknowledged Builder sync. Leave without saving?" +
      (draftSessionRef.current.revision ? " Unsent edits stay backed up in this browser tab only." : ""));
    const onClickCapture = (e) => {
      if (!needsGuard() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target?.closest?.("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url;
      try { url = new URL(href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!confirmLeave()) { e.preventDefault(); e.stopPropagation(); }
    };
    // A same-URL sentinel history entry makes a Back press land on this page's
    // own URL first, where it can be confirmed before the app actually leaves.
    // Cancel steps back onto the sentinel via forward() (no new entry â€” stale
    // sentinels never accumulate); confirm disarms then really goes back. A
    // stale sentinel popped while clean passes straight through. Standalone
    // mode only â€” embedded, a route pop unmounts us before we could confirm,
    // so the sentinel would only leave a dead entry.
    if (!embedded && !navGuardArmedRef.current && needsGuard()) {
      try { window.history.pushState({ ccsFoundationLeaveGuard: true }, "", window.location.href); navGuardArmedRef.current = true; } catch { /* best effort */ }
    }
    const onPop = (e) => {
      if (!navGuardArmedRef.current) return;
      if (e.state?.ccsFoundationLeaveGuard === true) return; // landed on the armed sentinel itself (Forward / re-entry) â€” nothing to do
      if (!needsGuard()) { navGuardArmedRef.current = false; window.history.back(); return; }
      if (confirmLeave()) { navGuardArmedRef.current = false; window.history.back(); }
      else { try { window.history.forward(); } catch { /* best effort */ } }
    };
    document.addEventListener("click", onClickCapture, true);
    if (navGuardArmedRef.current) window.addEventListener("popstate", onPop);
    return () => { document.removeEventListener("click", onClickCapture, true); window.removeEventListener("popstate", onPop); };
  }, [embedded, saving, dirty, recoveryRequired, draftOffer]);

  // Versioned reinforcement proposal editor (CMP-B/O-031): the session owns
  // disposable previews and acknowledgments; every mutation goes through the
  // page's single `commit` (undo history, dirty marking, browser-draft
  // persistence, edit-revision bump) so an accepted proposal is an ordinary
  // undoable edit that reaches the entity only through the normal save path.
  // `blocked` mirrors the same busy/availability gates other edits honor;
  // pricingBlocked is intentionally NOT included â€” a held item can still be
  // drafted and previewed, and acceptance only lands through commit/save.
  const reinforcementEditor = useFoundationReinforcementEditor({
    getCurrent: () => {
      const live = currentEditorRef.current;
      const ack = acknowledgedVersionRef.current;
      return {
        project: projectRef.current,
        savedProject: ack?.sourceSnapshot ?? null,
        inventory,
        settings,
        context: {
          ...live,
          loaded: mountedRef.current && live.loaded,
          ownerId,
          sourceUpdatedAt: ack?.updated_date ?? null,
          estimateUpdatedAt: linkedEstimate?.updated_date ?? null,
        },
        blocked:
          saving || !!saveAttemptRef.current || !!copyFlightRef.current || !!catalogReloadRef.current ||
          catalogReloading || draftSessionRef.current.pending || recoveryRequired ||
          !!sourceRefreshRef.current || !ack?.sourceSnapshot || ack?.ownerId !== ownerId ||
          ack?.sourceId !== live.sourceId,
      };
    },
    commit: (updater) => commit(updater),
  });

  if (loading) return <div className="p-10 text-center text-gray-400">Loading sectionâ€¦</div>;
  if (loadError) return <div className="p-10 text-center text-red-700 bg-red-50 border border-red-200 rounded">Foundation Builder unavailable. Required project data, foundation inventory, concrete services, or Settings could not be verified. {loadError}</div>;
  if (!project) return <div className="p-10 text-center text-gray-500">Foundation section not found.</div>;

  const persistBrowserDraft = (next) => {
    const session = draftSessionRef.current;
    if (!session.store || session.store !== draftStore || !mountedRef.current) return;
    const ack = acknowledgedVersionRef.current;
    const base = ack?.sourceId === id && ack?.ownerId === ownerId ? ack.updated_date : null;
    if (!base) { setDraftOffer({ store: draftStore, warning: "Latest edits could not be backed up; no saved source to anchor the browser draft." }); return; }
    const result = session.store.write({
      project: next,
      baseUpdatedAt: base,
      token: newCreationRequestKey("foundation_draft"),
      savedAt: new Date().toISOString(),
      expectedRevision: session.revision,
    });
    if (result.status === "stored") {
      session.revision = result.revision;
      session.pending = false;
      setDraftOffer({ store: draftStore, backedUp: true, message: "Design and customer-pricing edits backed up in this browser tab only â€” closing the tab loses them; save to keep all changes." });
    } else if (result.status === "conflict") {
      // Never overwrite â€” re-read latest and surface a decision.
      const latest = session.store.read();
      session.revision = latest.status !== "unavailable" ? latest.revision ?? null : result.revision ?? session.revision;
      session.pending = true;
      if (latest.status === "found") setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt, conflict: true });
      else if (latest.status === "empty") { session.pending = false; setDraftOffer({ store: draftStore, warning: "Browser draft was removed elsewhere; nothing to merge." }); }
      else if (latest.status === "unavailable") setDraftOffer({ store: draftStore, revision: session.revision, message: latest.message || "Draft changed in another tab; could not re-read." });
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

  const patchItem = (index, changes) =>
    commit((prev) => ({
      items: prev.items.map((it, i) => (i === index ? { ...it, ...changes } : it)),
    }));

  // O-035 multi-row commit channel â€” patch lists that do not fit the
  // single-items channel (moves/resizes across poles or walls, align,
  // distribute, multi-row drags) route here through the SAME commit path
  // patchItem uses, so CAS guards + normalize + draft backup stay in force.
  // One commit for the whole list keeps the op atomic on the business side,
  // matching the single history entry the canvas records. Refusing (false)
  // means the canvas records nothing â€” no silent partial application.
  const patchScene = (patches) => {
    const list = (Array.isArray(patches) ? patches : []).filter(
      (p) => p && typeof p.collection === "string" && Number.isInteger(p.index) && p.index >= 0 && p.patch && typeof p.patch === "object",
    );
    const base = projectRef.current ?? project;
    const applicable = list.filter((p) => Array.isArray(base?.[p.collection]) && base[p.collection][p.index]);
    if (!applicable.length) return false;
    return commit((prev) => {
      const changes = {};
      for (const p of applicable) {
        const rows = prev?.[p.collection];
        if (!Array.isArray(rows) || !rows[p.index]) continue;
        const nextRows = changes[p.collection] || (changes[p.collection] = rows.slice());
        nextRows[p.index] = { ...nextRows[p.index], ...p.patch };
      }
      return changes;
    }) !== false;
  };

  // O-035 canvas snap prefs â€” optional Settings rows
  // (foundation_layout_object_snap=false disables object snap;
  // foundation_layout_snap_tolerance_inches and
  // foundation_layout_grid_snap_inches are inches). Absent or malformed
  // values fall through to the canvas defaults (object snap on, 3in
  // tolerance, grid off); Shift frees snapping per gesture in the canvas.
  const prefNumber = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : undefined; };
  const layoutPrefs = {
    objectSnap: `${settings?.foundation_layout_object_snap ?? "true"}`.trim().toLowerCase() !== "false",
    snapToleranceInches: prefNumber(settings?.foundation_layout_snap_tolerance_inches),
    gridSnapInches: prefNumber(settings?.foundation_layout_grid_snap_inches),
  };

  // O-040 scene undo/redo â€” revert canvas geometry edits through the same
  // commit channel the canvas already uses (patchItem â†’ commit: CAS guards,
  // normalize, draft backup all stay in force). The store returns
  // patch-shaped payloads; a refused commit reports 'rejected' and the
  // stacks stay untouched.
  // O-035: undo/redo/observe anchors span the full scene domain
  // ({items, poles, walls}) â€” the canvas records and observes there now, so
  // single-row and multi-row entries chain in ONE domain and an external
  // pole/wall write detaches recorded geometry just like an items write.
  const sceneAnchorOf = (p) =>
    sceneLayoutAnchor({ items: p?.items || [], poles: p?.poles || [], walls: p?.walls || [] });
  // Multi-row entries carry kind 'scene-multi', target:null (the honesty
  // guard â€” a single-row apply would throw on .index and report
  // 'rejected'), and patch {multi:[{collection,index,fields}]} where fields
  // is the before-side on undo and the after-side on redo. Branch BEFORE
  // touching rev.target so a real multi apply never trips the guard.
  const applySceneRev = (rev) => {
    if (rev?.kind === "scene-multi" || Array.isArray(rev?.patch?.multi)) {
      const multi = Array.isArray(rev?.patch?.multi) ? rev.patch.multi : [];
      return patchScene(multi.map((m) => ({ collection: m?.collection, index: m?.index, patch: m?.fields })));
    }
    return patchItem(rev.target.index, rev.patch) !== false;
  };
  const sceneUndo = () =>
    sceneHistory.undo(sceneAnchorOf(projectRef.current), applySceneRev);
  const sceneRedo = () =>
    sceneHistory.redo(sceneAnchorOf(projectRef.current), applySceneRev);

  const removeItem = (index) => {
    const label = project.items?.[index]?.description || `item ${index + 1}`;
    if (!window.confirm(`Delete "${label}"? Dependent placements are retained for review.`)) return;
    commit((prev) => ({ items: prev.items.filter((_, i) => i !== index) }));
  };

  // O-034 scene delete â€” the canvas reports Delete/Backspace as a
  // delete-request carrying resolved selection entries (id/kind/collection/
  // live index) and never mutates business data. Whole-row deletions route
  // through the same commit channel as removeItem and the panel onChange
  // patches (CAS guards, normalize, draft backup all stay in force); entry
  // indexes address the live project arrays the canvas is fed. Sub-object
  // entries (wall-segment, pole-sign) are intentionally not routed yet â€”
  // the CMP-C03 panel wiring owns sub-row semantics (MOUNT-ANCHORS.md).
  const deleteSceneSelection = (entries) => {
    const FIELD_OF_COLLECTION = {
      items: "items", walls: "walls", poles: "poles",
      wall_caps: "wall_caps", signage_cabinets: "signage_cabinets",
    };
    const rows = (Array.isArray(entries) ? entries : []).filter(
      (e) => e && FIELD_OF_COLLECTION[e.collection]
        && e.kind !== "wall-segment" && e.kind !== "pole-sign"
        && Number.isInteger(e.index) && e.index >= 0,
    );
    if (!rows.length) return;
    const drop = {};
    for (const e of rows) {
      const field = FIELD_OF_COLLECTION[e.collection];
      (drop[field] = drop[field] || new Set()).add(e.index);
    }
    const label = rows.length === 1
      ? `"${rows[0].label || `${rows[0].collection} row`}"`
      : `${rows.length} selected objects`;
    if (!window.confirm(`Delete ${label}? Dependent placements are retained for review.`)) return;
    commit((prev) => {
      const changes = {};
      for (const [field, idx] of Object.entries(drop)) {
        changes[field] = (Array.isArray(prev[field]) ? prev[field] : []).filter((_, i) => !idx.has(i));
      }
      return changes;
    });
  };

  const duplicateItem = (index) =>
    commit((prev) => {
      const items = [...prev.items];
      items.splice(index + 1, 0, { ...JSON.parse(JSON.stringify(items[index])), component_id: newCreationRequestKey("foundation_item") });
      return { items };
    });

  // O-035 scene duplicate â€” the canvas emits a pure plan
  // ({sources:[{collection,index,componentId}], offset_inches:{x,z}}) and
  // never mutates business data; foundationDuplicateMirror owns clone +
  // component-id minting + reference remap, and the resulting patch rides
  // the same commit channel as every other assembly edit (CAS guards,
  // normalize, draft backup all stay in force).
  const duplicateSceneSelection = (plan) => {
    try {
      const component_ids = (Array.isArray(plan?.sources) ? plan.sources : [])
        .map((s) => s?.componentId)
        .filter((v) => typeof v === "string" && v.length > 0);
      if (!component_ids.length) return;
      commit((prev) => duplicateFoundationAssembly(prev, {
        component_ids,
        include_dependents: true,
        offset_inches: plan?.offset_inches,
        createId: (kind) => newCreationRequestKey(`foundation_${kind}`),
      }).patch);
    } catch (e) {
      setSaveError(e?.message || "Selected objects could not be duplicated.");
    }
  };

  const addItem = (type) => commit((prev) => ({ items: [...(prev.items || []), blankItem(type)] }));

  const restoreBrowserDraft = () => {
    const session = draftSessionRef.current;
    const offer = draftVisible;
    if (!session.store || session.store !== draftStore || !offer?.revision) return;
    const latest = session.store.read();
    if (latest.status !== "found" || latest.revision !== offer.revision) {
      // Storage changed since the offer â€” surface the newest, never restore stale data.
      // Preserve the known revision on a failed read so a retry does not conflict falsely.
      if (latest.status !== "unavailable") session.revision = latest.revision ?? null;
      if (latest.status === "found") setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt });
      else if (latest.status === "empty") { session.pending = false; setDraftOffer({ store: draftStore, warning: "Browser draft was removed elsewhere; nothing to restore." }); }
      else if (latest.status === "unavailable") setDraftOffer({ ...offer, warning: `Browser draft could not be read; try again. ${latest.message || ""}` });
      else setDraftOffer({ store: draftStore, revision: latest.revision ?? null, message: latest.message || "Browser draft changed; nothing restored." });
      return;
    }
    session.revision = latest.revision;
    const baseChanged = latest.baseUpdatedAt && acknowledgedVersionRef.current?.updated_date !== latest.baseUpdatedAt;
    if ((dirty || baseChanged) && !window.confirm("Restoring the browser draft replaces the current design edits in this editor. Continue?")) return;
    setAutoSave(false);
    // Single undoable edit through the normal commit path (restores sanitized design keys only).
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
      // Keep unsent in-memory edits backed up â€” never lose local newer edits on navigation.
      if (dirty) persistBrowserDraft(projectRef.current ?? project);
    } else if (result.status === "retained") {
      const latest = session.store.read();
      if (latest.status !== "unavailable") session.revision = latest.revision ?? null;
      if (latest.status === "found") setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt });
      else if (latest.status === "empty") { session.pending = false; setDraftOffer({ store: draftStore, warning: "Browser draft was removed elsewhere; nothing kept." }); }
      else if (latest.status === "unavailable") setDraftOffer({ ...offer, warning: `Browser draft could not be re-read; try again. ${latest.message || ""}` });
      else setDraftOffer({ store: draftStore, revision: latest.revision ?? null, message: latest.message || "Browser draft changed; kept." });
    } else {
      setDraftOffer({ ...offer, warning: `Browser draft could not be cleared. ${result.message || ""}` });
    }
  };

  // Draftâ†”saved merge-conflict resolutions (CMP-A04 tail). Each choice routes
  // through syncConflict.choose â€” the dialog closes only on a true return, so
  // a resolution never silently half-applies.
  const conflictDraftFields = (draft) => {
    const out = {};
    const src = draft && typeof draft === "object" ? draft : {};
    for (const field of FOUNDATION_DRAFT_FIELDS) if (Object.hasOwn(src, field)) out[field] = src[field];
    return out;
  };
  const adoptFreshSavedForConflict = async () => {
    // Re-read the saved record at click time and normalize it exactly like the
    // load path â€” adopting anything else would land the editor on a stale or
    // differently-shaped base.
    let saved = null;
    try { saved = await staffEntities.FoundationProject.get(id); } catch { saved = null; }
    if (!saved || saved.id !== id || typeof saved.updated_date !== "string" || !saved.updated_date) return null;
    let normalizedSaved;
    try {
      normalizedSaved = normalizeFoundationAssembly({
        ...saved,
        excavation_method: saved.excavation_method || "hand_dig",
        project_concrete_type: saved.project_concrete_type || "4000_ae",
        project_concrete_admixtures: saved.project_concrete_admixtures || [],
        items: saved.items || [],
        walls: saved.walls || [],
        poles: saved.poles || [],
        wall_caps: saved.wall_caps || [],
        signage_cabinets: saved.signage_cabinets || [],
        landscape: saved.landscape || { cell_size_inches: 12, cells: {} },
        selected_equipment: saved.selected_equipment || [],
      }, { createId: (kind) => newCreationRequestKey(`foundation_${kind}`) }).project;
    } catch { return null; }
    return { saved, normalizedSaved };
  };
  const handleConflictKeepDraft = () => syncConflict.choose(async () => {
    const c = syncConflict.conflict;
    const session = draftSessionRef.current;
    if (!c?.draft || session.store !== draftStore) return false;
    if (c.kind === "draft_vs_saved") {
      // Same guarded path as restoreBrowserDraft: the stored draft must still
      // be the offered revision before it overlays the open editor.
      const latest = draftStore.read();
      if (latest.status !== "found") return false;
      if (draftVisible?.revision && latest.revision !== draftVisible.revision) {
        session.revision = latest.revision;
        setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt, conflict: true });
        return false;
      }
      session.revision = latest.revision;
      setAutoSave(false);
      return commit(() => latest.draft, { restoreDraft: true });
    }
    // save_conflict: the saved record moved under unsent edits. Adopt the fresh
    // record as the acknowledged base, then overlay the draft fields through
    // one undoable commit â€” the next save lands on that revision.
    const adopted = await adoptFreshSavedForConflict();
    if (!adopted) return false;
    const stored = draftStore.read();
    if (stored.status === "found" || stored.status === "invalid") draftStore.clear(stored.revision);
    session.revision = null;
    session.pending = false;
    acknowledgedVersionRef.current = { sourceId: id, updated_date: adopted.saved.updated_date, ownerId, sourceSnapshot: adopted.normalizedSaved };
    setAutoSave(false);
    return commit(() => ({ ...adopted.normalizedSaved, ...conflictDraftFields(c.draft) }), { restoreDraft: true });
  });
  const handleConflictKeepSaved = () => syncConflict.choose(async () => {
    const c = syncConflict.conflict;
    const session = draftSessionRef.current;
    if (!c || session.store !== draftStore) return false;
    if (c.kind === "draft_vs_saved") {
      // Explicit discard â€” same CAS clear as discardBrowserDraft (the dialog is
      // the explicit choice; no second confirm).
      const cleared = draftStore.clear(draftVisible?.revision ?? session.revision ?? null);
      if (cleared.status !== "removed") {
        const latest = draftStore.read();
        if (latest.status === "found") setDraftOffer({ store: draftStore, revision: latest.revision, draft: latest.draft, savedAt: latest.savedAt, baseUpdatedAt: latest.baseUpdatedAt, conflict: true });
        else if (latest.status !== "unavailable") session.revision = latest.revision ?? null;
        return false;
      }
      session.revision = null;
      session.pending = false;
      setDraftOffer(null);
      // Keep unsent in-memory edits backed up â€” same net as discardBrowserDraft.
      if (dirty) persistBrowserDraft(projectRef.current ?? project);
      return true;
    }
    // save_conflict: drop unsent edits â€” clear any stored draft, then reload
    // the newer saved record so the editor lands clean on that revision.
    const stored = draftStore.read();
    if (stored.status === "found" || stored.status === "invalid") draftStore.clear(stored.revision);
    session.revision = null;
    session.pending = false;
    setDraftOffer(null);
    setReloadRevision((r) => r + 1);
    return true;
  });
  const handleConflictKeepBoth = () => syncConflict.choose(async () => {
    const c = syncConflict.conflict;
    const session = draftSessionRef.current;
    if (!c?.draft || session.store !== draftStore) return false;
    // Re-anchor the same draft content to the CURRENT saved revision through
    // the store CAS write â€” nothing is dropped; the re-anchored draft stays
    // an ordinary restorable offer.
    const baseRev = c.summary?.savedUpdatedAt ?? acknowledgedVersionRef.current?.updated_date ?? null;
    const rebase = foundationDraftRebaseProject({ draft: c.draft, sourceId: id });
    if (!rebase || !baseRev) return false;
    const stored = draftStore.read();
    if (stored.status === "unavailable") return false;
    const expectedRevision = stored.status === "found" || stored.status === "invalid" ? stored.revision ?? null : null;
    const w = draftStore.write({ project: rebase, baseUpdatedAt: baseRev, token: newCreationRequestKey("foundation_draft"), savedAt: new Date().toISOString(), expectedRevision });
    if (w.status !== "stored") {
      const after = draftStore.read();
      if (after.status === "found") { session.revision = after.revision; setDraftOffer({ store: draftStore, revision: after.revision, draft: after.draft, savedAt: after.savedAt, baseUpdatedAt: after.baseUpdatedAt, conflict: true }); }
      return false;
    }
    session.revision = w.revision;
    if (c.kind === "save_conflict") {
      // Reload drops the editor onto the newer saved record; the re-anchored
      // draft offer resurfaces through the normal load read.
      setReloadRevision((r) => r + 1);
    } else {
      session.pending = true;
      setDraftOffer({ store: draftStore, revision: w.revision, draft: w.draft, savedAt: new Date().toISOString(), baseUpdatedAt: baseRev });
    }
    return true;
  });

  // Held extras: when a recorded cabinet row or the landscape grid cannot be
  // repriced the calc keeps the acknowledged project totals (or null), never a
  // silently guessed amount. Null propagation keeps the section total honest â€”
  // "Estimate handoff paused" is already gated on pricingBlocked.
  const cabinetCost = calc.totals.total_signage_cabinet_cost;
  const landscapeCost = calc.totals.total_landscape_cost;
  const sectionTotal = calc.totals.grand_total === null || cabinetCost === null || landscapeCost === null
    ? null
    : calc.totals.grand_total + cabinetCost + landscapeCost;

  // Saved-vs-current reconciliation (CMP-A10): the acknowledged record's
  // persisted 12-field split-total sum â€” the same number the linked estimate
  // stored as live_total_snapshot at the last Builder save (manual add-on
  // Product parts live only on the estimate side, so record-sum is the right
  // comparator for this module-scoped sectionTotal). Null for a never-priced
  // record; the totals panel renders the advisory delta, never blocking.
  const savedSectionTotal = foundationRecordSavedTotal(savedSourceProject);

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

  // O-040: route undo/redo through the scene store first â€” a committed
  // canvas gesture reverts with stroke-level fidelity ('applied').
  // Anything else falls back to the whole-project snapshot history.
  const handleUndo = () => {
    if (sceneUndo()?.status === "applied") return;
    undo();
  };
  const handleRedo = () => {
    if (sceneRedo()?.status === "applied") return;
    redo();
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
    // O-099 (CMP-H08) -- revision history: each save appends the prior
    // `updated_date` (the revision being superseded) to a capped 12-entry
    // list, so a revision-pair compare can diff any two stored revisions.
    revision_history: [
      ...(Array.isArray(project.revision_history) ? project.revision_history : []).slice(-11),
      ...(project.updated_date ? [{
        updated_date: project.updated_date,
        at: Date.now(),
        // Lane E -- revision_label/revision_approved_by: the superseded
        // revision's authored label + approver ride the row (never a
        // fabricated approver; blank = "not recorded").
        revision_label: typeof project.revision_label === "string" && project.revision_label ? project.revision_label : null,
        revision_approved_by: typeof project.revision_approved_by === "string" && project.revision_approved_by ? project.revision_approved_by : null,
        // O-099 (CMP-H08) -- lightweight snapshot: the superseded revision's
        // counts + dims ride the row so a pair-compare can diff any two
        // stored revisions without a full record copy (bounded — counts +
        // dims, not the whole scene).
        snapshot: {
          item_count: Array.isArray(project.items) ? project.items.length : 0,
          wall_count: Array.isArray(project.walls) ? project.walls.length : 0,
          pole_count: Array.isArray(project.poles) ? project.poles.length : 0,
          cap_count: Array.isArray(project.wall_caps) ? project.wall_caps.length : 0,
          cabinet_count: Array.isArray(project.signage_cabinets) ? project.signage_cabinets.length : 0,
          // O-099 (CMP-H08) -- cost-delta numbers: the superseded revision's
          // total cost rides the snapshot so a pair-compare surfaces the
          // cost delta per change (never an invented total; held = null).
          total_cost: Number.isFinite(calc?.totals?.total) ? calc.totals.total : null,
        },
      }] : []),
    ],
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
    design_basis: project.design_basis,
    site_hazard: project.site_hazard,
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
    total_wall_cap_cost: calc.totals.total_wall_cap_cost,
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
      project, estimateId, basePayload: payload(),
      draftStoreRef: draftStore, draftOwner: ownerId, draftRevision: draftSessionRef.current.revision,
      items: calc.items, equipment: calc.equipment, walls: calc.walls,
      poles: calc.poles, wallCaps: calc.wallCaps, delivery: calc.delivery,
      totals: calc.totals, sectionTotal, cabinetCost, landscapeCost,
      computedPricing: undefined,
    };
    // Retain the transient calc capture so a later Builder-sync retry can
    // rebuild byte-identical part descriptors (persisted-record fallbacks are coarser).
    lastSyncCaptureRef.current = {
      builderCalculation: { totals: captured.totals, delivery: captured.delivery, cabinet_cost: captured.cabinetCost, landscape_cost: captured.landscapeCost, section_total: captured.sectionTotal },
      liveTotal: captured.sectionTotal,
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
          expectedSourceVersion: recoveryAck?.sourceId === saveContext.sourceId
            ? recoveryAck.updated_date : captured.project.updated_date,
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
            tierNumber: captured.project.customer_pricing?.tier_number,
          });
          captured.computedPricing = customerPricing;
          const live = currentEditorRef.current;
          if (!(mountedRef.current && live.sourceId === saveContext.sourceId && live.generation === saveContext.generation && live.editRevision === saveContext.editRevision && live.loaded)) {
            throw Object.assign(new Error("Save superseded by a newer edit or route change."), { superseded: true });
          }
        }
        {
          // A persisted receipt naming another estimate context stays
          // authoritative while that estimate can still be read; when the named
          // estimate is definitively gone the orphaned receipt is retired with
          // this save instead of blocking the standalone editor forever.
          const receipt = await resolveFoundationSyncReceiptForSave({
            project: captured.project,
            estimateId: captured.estimateId,
            getEstimate: (id) => staffEntities.AllInOneEstimate.get(id),
          });
          if (!receipt.ok) throw new Error(receipt.error);
          captured.clearStaleSyncReceipt = receipt.clearStaleReceipt === true;
        }
        if (captured.estimateId) {
          captured.syncAttempt = createFoundationSyncAttempt({
            sourceId: captured.project.id,
            estimateId: captured.estimateId,
            key: newCreationRequestKey("foundation_sync"),
            requestedAt: new Date().toISOString(),
          });
        }
        const ack = acknowledgedVersionRef.current;
        const expectedUpdatedAt = ack?.sourceId === saveContext.sourceId ? ack.updated_date : captured.project.updated_date;
        return updateBuilderSourceProject({
          entity: staffEntities.FoundationProject,
          sourceId: saveContext.sourceId,
          expectedUpdatedAt,
          data: { ...captured.basePayload, customer_pricing: customerPricing, ...(captured.syncAttempt ? { builder_sync_attempt: captured.syncAttempt } : captured.clearStaleSyncReceipt ? { builder_sync_attempt: null } : {}) },
          estimateId: captured.estimateId,
          label: "Foundation project",
        });
      },
      syncBuilder: captured.estimateId
        ? async (savedProject) => recordBuilderSave({
            estimateId: captured.estimateId,
            line: { project_id: saveContext.sourceId, module_key: "foundation" },
            sourceProject: captured.builderRecovery ? savedProject : {
              ...savedProject, items: captured.items, selected_equipment: captured.equipment,
              walls: captured.walls, poles: captured.poles, wall_caps: captured.wallCaps,
              builder_calculation: { totals: captured.totals, delivery: captured.delivery, cabinet_cost: captured.cabinetCost, landscape_cost: captured.landscapeCost, section_total: captured.sectionTotal },
            },
            liveTotal: captured.builderRecovery ? undefined : captured.sectionTotal,
            ...(captured.builderRecovery ? { expectedPendingKey: captured.builderRecovery.pendingKey } : {}),
          }).then(async (result) => {
            if (captured.builderRecovery) {
              await verifyFoundationRecoverySource({ sourceId: savedProject.id, expectedSourceVersion: savedProject.updated_date });
            }
            const ackLine = result?.line || result;
            assertFoundationBuilderAcknowledgment({ sourceProject: savedProject, estimateId: captured.estimateId, line: ackLine });
            captured.ackLine = ackLine;
            return result;
          })
        : null,
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
          sourceId: outcome.sourceId, updated_date: outcome.sourceVersion, ownerId,
          sourceSnapshot: captured.builderRecovery ? captured.builderRecovery.sourceProject : {
            ...captured.project, ...captured.basePayload, id: outcome.sourceId, updated_date: outcome.sourceVersion,
          },
        };
      }
      if (captured.builderRecovery && outcome.builderSync === "synced" && sameContext) {
        setRecoveryRequired(false);
        setProject((prev) => prev?.id === outcome.sourceId
          ? { ...prev, updated_date: outcome.sourceVersion, builder_sync_attempt: captured.builderRecovery.sourceProject.builder_sync_attempt }
          : prev);
        if (!fullyCurrent || !captured.recoveryMatchesCurrent) {
          if (captured.ackLine) {
            setLinkedEstimate((prev) => prev?.id === captured.estimateId
              ? { ...prev, line_items: (prev.line_items || []).map((it) => it.module_key === "foundation" && it.project_id === outcome.sourceId ? captured.ackLine : it) }
              : prev);
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
        setProject((prev) => (prev && prev.id === outcome.sourceId ? { ...prev, updated_date: outcome.sourceVersion, ...(captured.computedPricing !== undefined ? { customer_pricing: captured.computedPricing } : {}), ...(captured.syncAttempt ? { builder_sync_attempt: captured.syncAttempt } : {}) } : prev));
        if (captured.ackLine) {
          setLinkedEstimate((prev) => (prev && prev.id === captured.estimateId ? { ...prev, line_items: (prev.line_items || []).map((it) => (it.module_key === "foundation" && it.project_id === outcome.sourceId ? captured.ackLine : it)) } : prev));
        }
        setDirty(false);
        setSaveError("");
        // Verified fully-current source save: clear the exact captured browser draft revision only.
        if (draftSessionRef.current.store === captured.draftStoreRef && captured.draftOwner === ownerId && captured.draftRevision) {
          const cleared = captured.draftStoreRef.clear(captured.draftRevision);
          if (cleared.status === "removed") { draftSessionRef.current.revision = null; setDraftOffer((o) => (o?.store === draftStore ? { store: draftStore } : o)); }
          else if (cleared.status === "unavailable") setDraftOffer((o) => (o?.store === draftStore ? { store: draftStore, warning: `Saved, but the browser draft backup could not be cleared. ${cleared.message || ""}` } : o));
          else if (cleared.status === "retained") setDraftOffer((o) => (o?.store === draftStore ? { store: draftStore, warning: "Saved; a newer browser draft remains - review it before leaving." } : o));
        }
        try { onSaved?.(); } catch (e) { console.error(e); outcome.warnings.push("observer_error"); }
      } else if (sameContext && outcome.status === "superseded" && outcome.builderSync === "pending") {
        setRecoveryRequired(true);
        setSaveError("Source saved; estimate/Builder sync incomplete. Retry save.");
        setDirty(true);
      } else if (sameContext && outcome.status === "partial") {
        setRecoveryRequired(true);
        setSaveError("Source saved; estimate/Builder sync incomplete. Retry save.");
        setDirty(true);
      } else if (sameContext && (outcome.status === "conflict" || outcome.status === "failed")) {
        if (outcome.status === "conflict" && outcome.conflictDetected) {
          // Genuine classified CAS concurrent-edit conflict â€” open the merge
          // dialog with the best available draft (stored backup, else live edits).
          const latestDraft = draftSessionRef.current.store === draftStore ? draftStore.read() : { status: "unavailable" };
          const draftBackedUp = latestDraft.status === "found";
          syncConflict.openSaveConflict({
            draft: draftBackedUp ? latestDraft.draft : (projectRef.current ?? project),
            draftSavedAt: draftBackedUp ? latestDraft.savedAt ?? null : null,
            baseUpdatedAt: draftBackedUp ? latestDraft.baseUpdatedAt ?? null : acknowledgedVersionRef.current?.updated_date ?? null,
            getSavedProject: () => staffEntities.FoundationProject.get(id),
            hasUnbackedEdits: !draftBackedUp,
          });
        }
        setSaveError(outcome.error?.pricingUnavailable
          ? "Pricing unavailable: fix highlighted design inputs or catalog selections before saving."
          : "Save failed: " + (outcome.error?.message || outcome.status));
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
        // Same-job metadata payload() does not own â€” a copy keeps the
        // document link, the saved estimate-number lineage (mirroring
        // convertFoundationToBrickStone), the persisted beautify brief
        // image, and any externally-set pricing-engine context.
        estimate_number: project.estimate_number,
        hyperlink: project.hyperlink,
        beautify_data_url: project.beautify_data_url,
        pricing_engine: project.pricing_engine,
      };
      const signature = JSON.stringify({
        ...baseData,
        // revision_history[*].at is minted per payload() call (Date.now()) and
        // would rotate the signature on every retry — defeating the held key.
        revision_history: (baseData.revision_history || []).map(({ at, ...entry }) => entry),
      });
      if (copyAttemptRef.current.signature !== signature) {
        const { components } = cloneFoundationComponents(
          {
            items: calc.items || [],
            walls: calc.walls || [],
            poles: calc.poles || [],
            wall_caps: calc.wallCaps || [],
            signage_cabinets: project.signage_cabinets || [],
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
          label: "Foundation project copy",
        });
        if (!copy?.id) throw new Error("Foundation project copy could not be verified.");
        const live2 = currentEditorRef.current;
        if (!mountedRef.current || !live2.loaded || live2.generation !== gen || live2.sourceId !== sourceId || live2.estimateId !== estimateKey || live2.editRevision !== editRev) return;
        navigate(`/FoundationEstimator?id=${encodeURIComponent(copy.id)}`);
      } catch (e) {
        if (mountedRef.current && currentEditorRef.current.loaded && currentEditorRef.current.generation === gen && currentEditorRef.current.sourceId === sourceId) {
          console.error(e); alert("Save failed: " + e.message);
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

  // #77 â€” create a fresh Brick & Stone draft carrying the shared identity
  // fields; the Foundation source is left untouched.
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
      console.error(e); alert("Swap failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // #88 â€” copy a read-only staff_view portal link for this estimate.
  const handleShareLink = async () => {
    if (draftSessionRef.current.pending) return;
    try {
      const url = await createEstimateReadOnlyShareLink({ estimateId });
      await navigator.clipboard.writeText(url);
      alert("Read-only link copied to clipboard:\n" + url);
    } catch (e) {
      console.error(e); alert("Share link failed: " + e.message);
    }
  };

  return (
    <div className="clay-scope min-h-full bg-gray-50">
      <div className="max-w-[1500px] mx-auto p-4">
        <FoundationSectionBanner sectionName={project.project_name} />

        {saveError && <div role="alert" className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-800">{saveError}</div>}

        {catalogBlocked && (
          <div role="alert" className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <div className="font-semibold">Pricing unavailable: selected materials or rental items need attention. Unavailable items show saved amounts only; other amounts may be recalculated. Save and estimate handoff are paused.</div>
            <ul className="mt-1 list-disc pl-5">
              {calc.catalogIssues.map((i, idx) => <li key={idx}>{i.message}</li>)}
            </ul>
            <button type="button" onClick={handleCatalogReload} disabled={catalogReloading || loading || saving}
              className="mt-2 rounded-sm border border-amber-400 bg-white px-2 py-1 text-[12px] font-semibold text-amber-800 disabled:opacity-50">
              {catalogReloading ? "Reloading catalogsâ€¦" : "Reload catalogs"}
            </button>
          </div>
        )}

        {inputBlocked && (
          <div role="alert" className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <div className="font-semibold">Design input required: fix highlighted design inputs below. Save and estimate handoff are paused.</div>
            <ul className="mt-1 list-disc pl-5">
              {inputIssues.map((i, idx) => <li key={idx}>{i.message}</li>)}
            </ul>
          </div>
        )}

        {(() => {
          const marker = sourceRefreshRef.current;
          const live = currentEditorRef.current;
          if (!marker || !live.loaded || live.sourceId !== marker.sourceId || live.generation !== marker.generation) return null;
          return (
            <div role="alert" className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              An earlier save finished after this view changed. Reload the saved project before saving again.
              <button type="button" onClick={handleReloadSaved} className="ml-2 font-semibold underline">Reload saved project</button>
            </div>
          );
        })()}

        {(() => {
          const recovery = foundationSyncRecoveryState({ project, estimateId, estimate: linkedEstimate });
          if (!["pending", "unsupported", "mismatch"].includes(recovery.status) && !recoveryRequired) return null;
          const detail = recovery.status === "mismatch" && recovery.attempt?.estimate_id
            ? "Open the linked estimate to review." : recovery.message || "A saved Builder sync attempt is still unacknowledged.";
          return (
            <>
            <div role="status" className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 flex items-center gap-3">
              <span>{detail} Current displayed totals will be synchronized; accepted quote prices remain under the platform workflow. {dirty ? "You also have unsaved local edits." : ""}</span>
              {recovery.status === "mismatch" && recovery.attempt?.estimate_id && (
                <a className="underline" href={`/EstimateDetail?id=${encodeURIComponent(recovery.attempt.estimate_id)}`}>Open estimate</a>
              )}
              <button type="button" disabled={saving || recovery.status === "unsupported" || recovery.status === "mismatch"} className="px-2 py-1 rounded bg-amber-600 text-white disabled:opacity-50" onClick={() => saveRef.current?.()}>Review and retry Save</button>
            </div>
            <div className="mb-3">
              <FoundationSyncRetryAction
                retryState={classifyFoundationSyncRetry({ project, estimateId, estimate: linkedEstimate })}
                retrying={syncRetry.retrying}
                lastOutcome={syncRetry.lastOutcome}
                estimateHref={estimateId ? `/EstimateDetail?id=${estimateId}` : null}
                onRetry={async () => {
                  const o = await syncRetry.retry();
                  if (o?.status === "synced" || o?.status === "already_synced") {
                    setRecoveryRequired(false);
                    if (o.line) setLinkedEstimate((prev) => (prev && prev.id === estimateId ? { ...prev, line_items: (prev.line_items || []).map((it) => (it.module_key === "foundation" && it.project_id === id ? o.line : it)) } : prev));
                  }
                }}
              />
            </div>
            </>
          );
        })()}

        {assemblyIssues.length > 0 && (
          <div role="status" className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            <span className="font-semibold">Unresolved placements</span>
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              {assemblyIssues.map((issue, i) => (
                <li key={`${issue.code}-${issue.kind}-${issue.componentId || ""}-${issue.parentId || ""}-${i}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}

        {constructionWarnings.length > 0 && (
          <div role="status" className="mb-3 rounded border border-blue-300 bg-blue-50 px-3 py-2 text-[12px] text-blue-900">
            <span className="font-semibold">Construction checks â€” verify before build</span>
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              {constructionWarnings.map((warning, i) => (
                <li key={`${warning.code}-${warning.kind}-${warning.index ?? ""}-${i}`}>{warning.message}</li>
              ))}
            </ul>
          </div>
        )}

        {draftVisible?.backedUp && !draftVisible?.warning && (
          <div role="status" className="mb-3 rounded border border-blue-300 bg-blue-50 px-3 py-2 text-[13px] text-blue-900">
            {draftVisible.message}
          </div>
        )}
        {draftVisible?.warning && (
          <div role="alert" className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">{draftVisible.warning}</div>
        )}
        {(draftVisible?.draft || draftVisible?.message) && draftSessionRef.current.pending && (
          <div role="alert" className="mb-3 rounded border border-indigo-300 bg-indigo-50 px-3 py-2 text-[13px] text-indigo-900">
            {draftVisible.draft ? (
              <>
                <div className="font-semibold">Unsent browser-tab draft found. Nothing restored or sent. {draftVisible.savedAt ? `Saved ${draftVisible.savedAt}.` : ""} Recovery covers design and customer-pricing fields; customer links and saved receipts stay as stored.</div>
                {draftVisible.baseUpdatedAt && acknowledgedVersionRef.current?.updated_date !== draftVisible.baseUpdatedAt && (
                  <div className="mt-1">Saved project changed since these edits.
                    <button
                      type="button"
                      className="ml-2 font-semibold underline"
                      onClick={() => syncConflict.openDraftConflict({
                        draft: draftVisible.draft,
                        draftSavedAt: draftVisible.savedAt ?? null,
                        baseUpdatedAt: draftVisible.baseUpdatedAt,
                        savedProject: acknowledgedVersionRef.current?.sourceSnapshot ?? null,
                        getSavedProject: () => staffEntities.FoundationProject.get(id),
                      })}
                    >Review changes</button>
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={restoreBrowserDraft} className="rounded-sm border border-indigo-400 bg-white px-2 py-1 text-[12px] font-semibold text-indigo-800">Restore browser draft</button>
                  <button type="button" onClick={discardBrowserDraft} className="rounded-sm border border-gray-400 bg-white px-2 py-1 text-[12px] font-semibold text-gray-700">Discard browser draft</button>
                </div>
              </>
            ) : (
              <>
                <div className="font-semibold">A browser draft exists but cannot be restored. {draftVisible.message || ""} Recovery covers design and customer-pricing fields; customer links and saved receipts stay as stored.</div>
                <div className="mt-2">
                  <button type="button" onClick={discardBrowserDraft} className="rounded-sm border border-gray-400 bg-white px-2 py-1 text-[12px] font-semibold text-gray-700">Discard browser draft</button>
                </div>
              </>
            )}
          </div>
        )}

        <fieldset disabled={draftSessionRef.current.pending} className="contents min-w-0">
        <FoundationToolbar
          title="Edit Concrete | Masonry | Poles Estimate"
          subtitle="Engineering, foundation, excavation, wall & pole estimating"
          backTo={backTo}
          total={sectionTotal}
          saving={saving}
          dirty={dirty || draftSessionRef.current.pending}
          lastSavedAt={project?.updated_date}
          autoSave={autoSave}
          pricingUnavailable={pricingBlocked}
          onToggleAutoSave={() => { if (!draftSessionRef.current.pending) setAutoSave((v) => !v); }}
          canUndo={history.past.length > 0 || sceneHistory.getState().canUndo}
          canRedo={history.future.length > 0 || sceneHistory.getState().canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onSave={handleSave}
          onSaveAndExit={handleSaveAndExit}
          onSaveAsCopy={handleSaveAsCopy}
          onSaveAsTemplate={() => { if (!draftSessionRef.current.pending) setTemplateMode("save"); }}
          onTemplates={() => { if (!draftSessionRef.current.pending) setTemplateMode("load"); }}
          onSwapToBrickStone={handleSwapToBrickStone}
          onShareLink={estimateId ? handleShareLink : undefined}
          onHelp={() => setShowHelp((v) => !v)}
          onBack={embedded
            ? () => {
                if (saving) return;
                if ((dirty || recoveryRequired) && !window.confirm("You have unsaved changes or an unacknowledged Builder sync. Leave without saving?")) return;
                onClose?.();
              }
            : () => {
                if (saving) return;
                if ((dirty || recoveryRequired) && !window.confirm("You have unsaved changes or an unacknowledged Builder sync. Leave without saving?")) return;
                navigate(backTo);
              }}
        />

        {showHelp && (
          <div className="bg-blue-50 border border-blue-200 rounded-sm p-3 mb-3 text-[12px] text-blue-900 space-y-2">
            <p>
              Add each footing or pillar under <b>Foundation</b>, then place poles, masonry walls and caps
              in the other tabs. Concrete, rebar, excavation and labor rates come from your settings and
              supplier inventory. Save & Exit pushes the total back to the combined estimate.
            </p>
            <ol className="list-decimal pl-5 space-y-0.5 text-blue-900/90">
              <li><b>Foundations</b> - add items, enter dimensions as feet/inches (4&apos; 0&quot;) or plain inches; malformed entries keep your draft and show a hint.</li>
              <li><b>Walls &amp; Poles</b> - draw wall outlines (rectangle, L, U or click-to-place), set a Foundation per wall, snap poles onto a footing.</li>
              <li><b>Wall Caps</b> - use Cap wall / Cap all walls for one row per segment; over-stock cuts split at the stock length.</li>
              <li><b>Signage &amp; Landscape</b> - mount cabinets on poles or foundations; paint landscape cells (Fill floods a region, strokes undo as one).</li>
              <li><b>Canvas tools</b> - click objects to select (tree + breadcrumb on the left), Mount to reparent, Diagnostics for clashes/unsupported spans, Layers to hide/lock/isolate, Fit zooms to selection.</li>
              <li><b>3D preview</b> - left drag orbits, right drag pans, scroll zooms; Exploded spreads the rebar, Section cuts at an elevation.</li>
              <li><b>Cost Summary + BOM</b> - check the changes-vs-saved list, then the field/production package on the BOM tab prints a labeled sheet.</li>
            </ol>
            {/* O-101 (CMP-H10) -- worked synthetic-project walkthrough: a
                concrete example walking the flow, so the walkthrough isn't a
                demo that only works for one screenshot. */}
            <p className="pt-1 border-t border-blue-200/60">
              <b>Worked example:</b> a 2-pole monument sign — add a 48&quot;x48&quot;x12&quot; spread footing under Foundation;
              two 12&apos; poles on Walls &amp; Poles (Mount each onto the footing); a 4&apos;x6&quot; wall cap under Wall Caps;
              the cabinet on Signage &amp; Landscape (Mount onto a pole at 8&apos;). The canvas selects the footing
              (tree + breadcrumb); Diagnostics flags the pole off its footing until you Mount it; the 3D preview
              shows the footing + poles + cap; Cost Summary prices concrete + rebar + labor; the BOM prints the
              labeled field sheet.
            </p>
          </div>
        )}

        <FoundationGuidedSteps project={project} calc={calc} savedSourceProject={savedSourceProject} onStepClick={setMainTab} />
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_560px] gap-4 items-start mt-3">
          <div>
            <Tabs value={mainTab} onValueChange={setMainTab}>
              <TabsList className="flex flex-wrap h-auto bg-white border border-gray-200 p-1 mb-3 rounded-sm justify-start">
                <TabsTrigger value="foundations" className={TAB_CLASS}>
                  <AnchorIcon className="w-3.5 h-3.5" /> Foundation ({calc.items.length})
                </TabsTrigger>
                <TabsTrigger value="landscape" className={TAB_CLASS}>
                  <LayoutGrid className="w-3.5 h-3.5" /> Walls &amp; Poles (
                  {(calc.walls?.length || 0) + (calc.poles?.length || 0)})
                </TabsTrigger>
                <TabsTrigger value="caps" className={TAB_CLASS}>
                  <Layers className="w-3.5 h-3.5" /> Wall Caps
                </TabsTrigger>
                <TabsTrigger value="signage" className={TAB_CLASS}>
                  <Trees className="w-3.5 h-3.5" /> Signage &amp; Landscape
                </TabsTrigger>
                <TabsTrigger value="equipment" className={TAB_CLASS}>
                  <WrenchIcon className="w-3.5 h-3.5" /> Equipment
                </TabsTrigger>
                <TabsTrigger value="summary" className={TAB_CLASS}>
                  <TrendingUp className="w-3.5 h-3.5" /> Cost Summary
                </TabsTrigger>
                <TabsTrigger value="bom" className={TAB_CLASS}>
                  <ClipboardList className="w-3.5 h-3.5" /> Bill of Materials
                </TabsTrigger>
                <TabsTrigger value="pricing" className={TAB_CLASS}>
                  <Tag className="w-3.5 h-3.5" /> Customer Pricing
                </TabsTrigger>
              </TabsList>

              <TabsContent value="foundations" className="space-y-3">
                <AiEngineeringAssistant project={project} onResult={patch} />
                <FoundationPhotoIntake project={project} onChange={patch} />
                <FoundationAiIntake project={project} catalog={catalog} onApply={({ foundations: newItems, poles: newPoles }) => commit((prev) => ({ items: [...(prev.items || []), ...newItems], poles: [...(prev.poles || []), ...newPoles] }))} />

                {calc.items.length === 0 ? (
                  <div className="bg-white rounded-sm border border-dashed border-gray-300 p-6">
                    <p className="text-[12px] font-semibold text-gray-700 mb-3">Start a foundation project</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setMainTab("foundations")} className="px-3 py-1.5 rounded-sm bg-violet-600 text-white text-[11px] font-semibold hover:bg-violet-700" data-mode="ai">Start with AI</button>
                      <button type="button" onClick={() => { if (!draftSessionRef.current.pending) setTemplateMode("load"); }} className="px-3 py-1.5 rounded-sm border border-gray-300 text-gray-700 text-[11px] font-semibold hover:bg-gray-50" data-mode="template">Use a template</button>
                      <button type="button" className="px-3 py-1.5 rounded-sm border border-gray-200 text-gray-500 text-[11px] font-semibold" data-mode="manual" aria-disabled="true" title="Author items directly below">Build manually</button>
                    </div>
                    No foundations yet â€” add a spread footing or pillar to start.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {calc.items.map((item, index) => {
                      const componentId = item.component_id;
                      const proposalState = reinforcementEditor.read(componentId);
                      return (
                        <div key={componentId || index} className="space-y-2">
                          <FoundationItemCard
                            item={item}
                            pricing={calc.itemPricing[index]}
                            index={index}
                            catalog={catalog}
                            onChange={patchItem}
                            onRemove={removeItem}
                            onDuplicate={duplicateItem}
                            supportCatalog={inventory.filter((row) => row.material_type === "rebar_support")}
                          />
                          <FoundationReinforcementProposalPanel
                            item={item}
                            catalog={inventory.filter((row) => row.material_type === "rebar")}
                            {...proposalState}
                            busy={saving || catalogReloading}
                            onStart={() => reinforcementEditor.start(componentId)}
                            onDraftChange={(draft) => reinforcementEditor.changeDraft(componentId, draft)}
                            onPreview={() => reinforcementEditor.preview(componentId)}
                            onAccept={(proposalId) => reinforcementEditor.accept(componentId, proposalId)}
                            onDiscard={() => reinforcementEditor.discard(componentId)}
                            onAcknowledgmentsChange={(value) => reinforcementEditor.acknowledge(componentId, value)}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                <button type="button"
                  onClick={() => addItem("spread_foot")}
                  className="h-[30px] px-3 flex items-center gap-1.5 rounded-sm border border-gray-300 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Foundation Item
                </button>
              </TabsContent>

              <TabsContent value="landscape" className="space-y-4">
                <FoundationWallsPanel
                  walls={calc.walls}
                  options={catalog.walls}
                  wallPricing={calc.wallPricing}
                  items={calc.items}
                  onChange={(walls) => patch({ walls })}
                />
                <FoundationPolesPanel
                  poles={calc.poles}
                  options={catalog.poles}
                  items={calc.items}
                  polePricing={calc.polePricing}
                  onChange={(poles) => patch({ poles })}
                />
                <FoundationLayoutCanvas
                  items={project.items || []}
                  poles={project.poles || []}
                  walls={project.walls || []}
                  wallCaps={project.wall_caps || []}
                  signageCabinets={project.signage_cabinets || []}
                  onMoveItem={patchItem}
                  onPatchScene={patchScene}
                  sceneHistory={sceneHistory}
                  sceneSelection={sceneSelection}
                  onDeleteSelection={deleteSceneSelection}
                  onDuplicateSelection={duplicateSceneSelection}
                  objectSnap={layoutPrefs.objectSnap}
                  snapToleranceInches={layoutPrefs.snapToleranceInches}
                  gridSnapInches={layoutPrefs.gridSnapInches}
                />
              </TabsContent>

              <TabsContent value="signage" className="space-y-4">
                <SignageCabinetsPanel
                  cabinets={project.signage_cabinets || []}
                  items={project.items || []}
                  poles={project.poles || []}
                  onChange={(signage_cabinets) => patch({ signage_cabinets })}
                />
                <LandscapeDesigner
                  landscape={project.landscape}
                  onChange={(landscape) => patch({ landscape })}
                />
              </TabsContent>

              <TabsContent value="caps">
                <FoundationWallCapsPanel
                  caps={calc.wallCaps}
                  walls={calc.walls}
                  options={catalog.caps}
                  onChange={(wall_caps) => patch({ wall_caps })}
                />
              </TabsContent>

              <TabsContent value="equipment">
                <FoundationEquipmentTab
                  foundationItems={project.items || []}
                  inventory={inventory}
                  selectedEquipmentList={project.selected_equipment || []}
                  onUpdate={(rows) => patch({ selected_equipment: rows })}
                  markDirty={() => setDirty(true)}
                />
              </TabsContent>

              <TabsContent value="summary" className="space-y-3">
                <label className="block bg-white rounded-sm border border-gray-200 p-3 text-[11px] text-gray-500">
                  Section name
                  <Input
                    value={project.project_name || ""}
                    onChange={(e) => patch({ project_name: e.target.value })}
                  />
                </label>
                {/* O-119 (CMP-I18) -- page notes UI: the authored `project.notes`
                    surface on the summary tab; the preliminary notice stamp
                    keeps "Preliminary estimating only - final engineering
                    required" attached to the authored note. */}
                <label className="block bg-white rounded-sm border border-gray-200 p-3 text-[11px] text-gray-500">
                  Notes <span className="text-[10px] text-gray-400">(carried to the estimate/handoff)</span>
                  <textarea
                    value={project.notes || ""}
                    onChange={(e) => patch({ notes: e.target.value })}
                    placeholder="Notes for the estimate -- the preliminary notice stays attached."
                    rows={3}
                    className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-[12px] text-gray-800"
                  />
                  {hasPreliminaryNotice(project.notes)
                    ? <p className="mt-1 text-[10px] text-amber-700">Preliminary notice attached.</p>
                    : <p className="mt-1 text-[10px] text-gray-400">The preliminary-engineering notice stamps on save.</p>}
                </label>
                <ConcreteDeliveryPanel project={project} delivery={calc.delivery} onChange={patch} />
                <FoundationRatesPanel settings={settings} project={project} onChange={patch} />
                <div className="max-w-xl">
                  <FoundationTotals totals={calc.totals} pricingUnavailable={pricingBlocked} savedSectionTotal={savedSectionTotal} sectionTotal={sectionTotal} project={project} calc={calc} />
                  <div className="mt-3 space-y-1 text-[12px] text-gray-600">
                    <div className="flex justify-between">
                      <span>Signage cabinets</span>
                      <span>{hasFoundationCostSnapshot(cabinetCost) ? money(cabinetCost) : "Not saved"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Site landscaping</span>
                      <span>{hasFoundationCostSnapshot(landscapeCost) ? money(landscapeCost) : "Not saved"}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-right text-[12px] text-gray-500">
                    Section total flowing to estimate: {pricingBlocked ? <b className="text-amber-700">Estimate handoff paused</b> : <b className="text-red-700">{money(sectionTotal)}</b>}
                  </div>
                  <Link
                    to="/FoundationCatalog"
                    className="inline-block mt-3 text-[12px] text-gray-600 hover:text-red-600"
                  >
                    Manage foundation catalog â†’
                  </Link>
                  {diffRows.length > 0 && (
                    <details className="mt-3 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2">
                      <summary className="cursor-pointer select-none text-[11px] font-semibold text-amber-800">
                        {diffCounts.added + diffCounts.removed + diffCounts.changed} change{diffCounts.added + diffCounts.removed + diffCounts.changed === 1 ? "" : "s"} vs saved
                        <span className="ml-2 font-normal text-amber-700">
                          {diffCounts.added ? `${diffCounts.added} added ` : ""}{diffCounts.removed ? `${diffCounts.removed} removed ` : ""}{diffCounts.changed ? `${diffCounts.changed} changed` : ""}
                        </span>
                      </summary>
                      <ul className="mt-2 space-y-0.5 text-[11px] text-amber-900">
                        {diffRows.slice(0, 40).map((r, i) => (
                          <li key={`${r.section}:${r.label}:${i}`}>
                            <span className="font-medium capitalize">{r.change}</span>
                            <span className="text-amber-700"> · {r.label}</span>
                            {r.detail ? <span className="text-amber-800"> — {r.detail}</span> : null}
                          </li>
                        ))}
                        {diffRows.length > 40 && <li className="text-amber-700">…{diffRows.length - 40} more</li>}
                      </ul>
                    </details>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="bom">
                <FoundationBulkMaterialPanel
                  project={project}
                  selectedComponentIds={null}
                  onApply={(patch) => setProject((prev) => (prev ? { ...prev, ...patch } : prev))}
                />
                <FoundationBOM
                  // O-097 -- click-to-fix: an issue's kind/componentId/index
                  // resolves to the scene node id, selects it, and navigates
                  // to the foundations (canvas) tab.
                  onSelectIssue={(issue) => {
                    const kindMap = { foundation: "item", item: "item", pole: "pole", wall: "wall", cabinet: "cabinet" };
                    const nodeKind = kindMap[issue?.kind] || null;
                    if (!nodeKind || typeof sceneNodeId[nodeKind] !== "function") return;
                    const key = issue.componentId != null ? `component:${issue.componentId}` : issue.index != null ? `index:${issue.index}` : null;
                    if (!key) return;
                    sceneSelection.select({ id: sceneNodeId[nodeKind](key) });
                    setMainTab("foundations");
                    // O-097 (CMP-H06) -- per-field focus/scroll: after the tab
                    // renders, focus + scroll the named field's input (the
                    // issue's `field` hint names the field to fix).
                    if (typeof issue.field === "string" && issue.field) {
                      setTimeout(() => {
                        const el = document.querySelector(`[data-field="${issue.field}"], #field-${issue.field}`);
                        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus?.(); }
                      }, 0);
                    }
                  }}
                  items={calc.items}
                  poles={calc.poles}
                  walls={calc.walls}
                  delivery={calc.delivery}
                  totals={calc.totals}
                  inventory={inventory}
                  itemPricing={calc.itemPricing}
                  polePricing={calc.polePricing}
                  wallPricing={calc.wallPricing}
                  cabinets={project.signage_cabinets || []}
                  landscape={project.landscape}
                  landscapePricing={calc.landscapePricing}
                  pricingUnavailable={pricingBlocked}
                  project={project}
                />
                <FoundationDesignBasis
                  project={project}
                  onChange={(patch) => setProject((prev) => prev ? { ...prev, ...patch } : prev)}
                />
                <FoundationFieldPackage
                  project={project}
                  calc={calc}
                  revision={acknowledgedVersionRef.current?.updated_date || null}
                  pricingUnavailable={pricingBlocked}
                />
              </TabsContent>

              <TabsContent value="pricing" className="space-y-4">
                {pricingBlocked ? (
                  <div className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800">Customer pricing unavailable: fix highlighted design inputs or catalog selections.</div>
                ) : (<>
                <CustomerPricingPanel
                  cost={sectionTotal}
                  project={project}
                  onChange={(changes) => patch({
                    ...changes,
                    customer_pricing: { ...(project.customer_pricing || {}), applied: false },
                  })}
                />
                <CustomerPricingTab
                  project={{ ...project, ...payload() }}
                  categorize={categorizeFoundationProject}
                  accentColor="red"
                  onApplyTier={(tier) => patch({
                    customer_pricing: { ...(project.customer_pricing || {}), applied: true, tier_number: tier },
                  })}
                />
                </>)}
              </TabsContent>
            </Tabs>
          </div>

          <div className="xl:sticky xl:top-4">
            {inputBlocked ? (
              <div className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800">3D preview hidden until the highlighted design inputs are corrected.</div>
            ) : (
              <Foundation3DPreview project={project} highlightComponentIds={highlightComponentIds} />
            )}
          </div>
        </div>
        </fieldset>
      </div>

      <FoundationSyncConflictDialog
        conflict={syncConflict.conflict}
        busy={saving || syncConflict.resolving}
        disabled={{
          keep_draft: sourceRefreshRef.current
            ? "The project must be reloaded after the earlier save finished â€” reload before applying draft edits."
            : null,
        }}
        onKeepDraft={handleConflictKeepDraft}
        onKeepSaved={handleConflictKeepSaved}
        onKeepBoth={handleConflictKeepBoth}
        onDismiss={syncConflict.dismiss}
      />
      <FoundationTemplateDialog
        open={!!templateMode && !draftSessionRef.current.pending}
        mode={templateMode}
        onClose={() => setTemplateMode(null)}
        project={project}
        saveDisabled={pricingBlocked || catalogReloading}
        saveDisabledReason="Pricing unavailable: fix highlighted design inputs or catalog selections before saving a template."
        onApply={(data) => {
          let patchData;
          try {
            patchData = prepareFoundationTemplatePatch(data, {
              createId: (kind) => newCreationRequestKey(`foundation_${kind}`),
            });
          } catch (e) {
            setSaveError(e?.message || "Template assembly could not be applied.");
            return false;
          }
          return commit(() => patchData);
        }}
      />
    </div>
  );
}