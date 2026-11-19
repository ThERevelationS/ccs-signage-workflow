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
  Tag,
} from "lucide-react";
import FoundationItemCard from "@/components/estimator/foundation/FoundationItemCard";
import FoundationReinforcementProposalPanel from "@/components/estimator/foundation/FoundationReinforcementProposalPanel";
import { useFoundationReinforcementEditor } from "@/components/estimator/foundation/useFoundationReinforcementEditor";
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
import { normalizeFoundationInventoryRows } from "@/components/masterInventory/inventoryNormalization";
import { recordBuilderSave, foundationRecordSavedTotal } from "@/components/estimator/builder/builderService";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { updateBuilderSourceProject, sourcePatchMatches } from "@/components/estimator/builder/sourceProjectPersistence";
import { loadFoundationBuilderRecovery, verifyFoundationRecoverySource } from "@/components/estimator/foundation/foundationBuilderRecovery";
import { createFoundationSaveSession } from "@/components/estimator/foundation/foundationSaveSession";
import { createFoundationDraftStore } from "@/components/estimator/foundation/foundationDraftRecovery";
import { useAuth } from "@/components/auth/EmailGate";
import { createFoundationSyncAttempt, foundationSyncRecoveryState, assertFoundationBuilderAcknowledgment, validateFoundationSyncAttempt, resolveFoundationSyncReceiptForSave } from "@/components/estimator/foundation/foundationSyncRecovery";
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