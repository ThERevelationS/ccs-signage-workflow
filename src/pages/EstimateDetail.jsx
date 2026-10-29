import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ClipboardPaste, Clock, Eye, FileMinus, LockKeyhole, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import AioEstimateHeader from "@/components/estimator/aio/AioEstimateHeader";
import AioStepRail from "@/components/estimator/aio/AioStepRail";
import AddProductGrid from "@/components/estimator/aio/AddProductGrid";
import EstimateProductsList from "@/components/estimator/aio/EstimateProductsList";
import InlineProductEditor from "@/components/estimator/aio/InlineProductEditor";
import EstimateHeaderForm from "@/components/estimator/EstimateHeaderForm";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import PricingSummary from "@/components/estimator/PricingSummary";
import CustomerQuotePanel from "@/components/estimator/CustomerQuotePanel";
import ConvertToWorkOrder from "@/components/estimator/ConvertToWorkOrder";
import CancelEstimateModal from "@/components/estimator/aio/CancelEstimateModal";
import ClipboardManagerModal from "@/components/estimator/aio/ClipboardManagerModal";
import { computePricing } from "@/components/estimator/aioPricing";
import { acceptedInternalEstimateCost } from "@/components/estimator/customerPricing";
import { refreshSectionSnapshots } from "@/components/estimator/useSectionSync";
import {
  acceptBuilderPrice,
  ensureEstimateBuilderProducts,
} from "@/components/estimator/builder/builderService";
import { refreshManualProductPricing } from "@/components/estimator/parts/customProductService";
import { cloneProductInEstimate, saveProductNotes, saveProductSettings } from "@/components/estimator/products/productOperations";
import { instantiateQuickProduct, resumeQuickProductInsertion, saveProductAsQuickProduct } from "@/components/estimator/products/quickProductService";
import { addBlankProduct, resumeBlankProductInsertion } from "@/components/estimator/products/blankProductService";
import { removeProductFromEstimate, resumeProductRemoval } from "@/components/estimator/products/productRemovalService";
import { resumeIndependentPartGroupMove } from "@/components/estimator/parts/partGroupService";
import { estimateCustomerChangedKeys, syncEstimateEverywhere } from "@/components/estimator/customerSync";
import EstimateRevisionPanel from "@/components/estimator/EstimateRevisionPanel";
import EstimateAcceptancePanel from "@/components/estimator/EstimateAcceptancePanel";
import EstimateActivityPanel from "@/components/estimator/EstimateActivityPanel";
import EstimateQuoteDeliveryPanel from "@/components/estimator/EstimateQuoteDeliveryPanel";
import { isEstimateProtected, requiresEstimateLifecycleReason } from "@/components/estimator/estimateLifecycle";
import { isEstimateStatusTransitionAllowed } from "@/components/estimator/estimateStatusTransitions";
import { attachQuoteDeliveryEvidenceToIssuanceRevision, completeEstimateRevision, ensureEstimateLifecycleRevision, getOpenEstimateRevision, startEstimateRevision } from "@/components/estimator/estimateRevisionService";
import { formatQuoteIssueDate, localDateStamp, quoteExpirationDate, quoteIssueKey, resolveQuoteIssueMetadata } from "@/components/estimator/quoteLifecycle";
import { hasEstimateVersionConflict } from "@/components/estimator/estimateConcurrency";
import { estimateServerMatchesIntendedSave, intendedQuoteIssueMetadata } from "@/components/estimator/estimateSaveRecovery";
import { assertEstimateProductMutationAllowed, getPendingEstimatePriceAcceptance } from "@/components/estimator/estimateMutationGuard";
import { expectedEstimateFields, replaceEstimateFieldsIfUnchanged, softDeleteEstimateFromLoadedSnapshot, restoreEstimateFromLoadedTrashSnapshot } from "@/components/estimator/estimatePersistence";
import { duplicateEstimate, splitEstimate, newEstimateCreationKey, estimateLineSelectionKey } from "@/components/estimator/estimateCreationService";
import MergeEstimateDialog from "@/components/estimator/aio/MergeEstimateDialog";
import EstimateNotesTimeline from "@/components/estimator/aio/EstimateNotesTimeline";
import { staffEntities } from "@/components/staff/staffEntities";

const WORKSPACE_TITLES = {
  1: "Estimate Details",
  2: "Products & Parts",
  3: "Pricing, Quote & Finalize",
};

const WORKSPACE_TABS = [
  { n: 1, label: "Details" },
  { n: 2, label: "Products & Parts" },
  { n: 3, label: "Pricing & Finalize" },
];

function assertNoPendingPriceAcceptance(record, action = "continuing") {
  const entry = getPendingEstimatePriceAcceptance(record);
  if (!entry) return;
  const name = entry.line?.client_product_name || entry.line?.project_name || "Product";
  const resumeLabel = entry.pending?.kind === "builder_initial_freeze"
    ? "Resume Initial Price"
    : entry.pending?.kind === "builder_detach_override"
      ? "Resume Part Detach"
      : entry.pending?.kind === "builder_detached_override_update"
        ? "Resume Part Change"
        : entry.pending?.kind === "builder_reattach_parts"
          ? "Resume Reattach"
          : entry.pending?.kind === "builder_manual_part_add"
            ? "Resume Part Add"
            : entry.pending?.kind === "builder_manual_part_edit"
              ? "Resume Part Edit"
              : entry.pending?.kind === "builder_manual_part_switch"
                ? "Resume Part Switch"
                : entry.pending?.kind === "builder_manual_part_remove"
                  ? "Resume Part Remove"
                  : entry.pending?.kind === "builder_part_package_add"
                    ? "Resume Part Insert"
                    : entry.pending?.kind === "builder_manual_product_price"
                      ? "Resume Product Price"
                      : entry.pending?.kind === "builder_part_group_clone"
                        ? "Resume Group Clone"
                        : entry.pending?.kind === "builder_part_group_move"
                          ? "Resume Group Move"
                          : entry.pending?.kind === "builder_part_group_create"
                            ? "Resume Group Create"
                            : entry.pending?.kind === "builder_part_group_dissolve"
                              ? "Resume Group Dissolve"
                              : entry.pending?.kind === "builder_blank_product_insert"
                                ? "Resume Product Add"
                                : entry.pending?.kind === "builder_product_remove"
                                  ? "Resume Product Remove"
                                  : entry.pending?.kind === "builder_quick_product_insert"
                        ? entry.pending?.source_type === "product_clone" ? "Resume Product Clone" : "Resume Quick Product"
                        : "Resume Price Update";
  throw new Error(`â€œ${name}â€� has a Builder mutation recovery pending. Use ${resumeLabel} before ${action}.`);
}

export default function EstimateDetail() {
  const navigate = useNavigate();
  const { sessionToken, isRegistered, currentUser } = useAuth();
  const _params = new URLSearchParams(window.location.search);
  const id = _params.get("id") || _params.get("estimate");
  const [estimate, setEstimate] = useState(null);
  const [persistedEstimate, setPersistedEstimate] = useState(null);
  const [celebration, setCelebration] = useState("");
  const prevApprovedStatusRef = useRef("");
  const [openRevision, setOpenRevision] = useState(null);
  const [revisionRefreshKey, setRevisionRefreshKey] = useState(0);
  const [deliveryRefreshKey, setDeliveryRefreshKey] = useState(0);
  const [repairingConversionTracking, setRepairingConversionTracking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [watchNote, setWatchNote] = useState("");
  const [step, setStep] = useState(() => {
    // Deep link: ?section=details|products|pricing (or ?step=1|2|3) opens that
    // workspace section on load; unknown/missing values keep the default.
    try {
      const raw = (new URLSearchParams(window.location.search).get("section")
        || new URLSearchParams(window.location.search).get("step") || "").toLowerCase();
      const map = { "1": 1, details: 1, "2": 2, products: 2, "3": 3, pricing: 3 };
      return map[raw] || 2;
    } catch { return 2; }
  });
  const [showCancel, setShowCancel] = useState(false);
  const [activeProduct, setActiveProduct] = useState(null);
  const [clipboardOpen, setClipboardOpen] = useState(false);
  const [reconciliationWarnings, setReconciliationWarnings] = useState([]);
  const [trashing, setTrashing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateChoiceOpen, setDuplicateChoiceOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const copyingRef = useRef(false);
  const copyAttemptRef = useRef(null);
  const copyCreationKey = (kind, lineIds = [], variant = "") => {
    const signature = JSON.stringify([kind, variant, estimate, [...lineIds].sort()]);
    if (copyAttemptRef.current?.signature !== signature) {
      copyAttemptRef.current = { signature, key: newEstimateCreationKey() };
    }
    return copyAttemptRef.current.key;
  };
  // Tracks the exact server version this browser session last read or wrote.
  // Keep it separate from persistedEstimate because Product operations may save
  // immediately while the lifecycle baseline intentionally remains older.
  const serverUpdatedAtRef = useRef("");
  // Same-page recovery anchor for a lifecycle transition whose estimate write
  // succeeds but audit/pipeline work fails afterward. This preserves the true
  // pre-transition snapshot and a stable idempotency key across retries.
  const pendingLifecycleBaselineRef = useRef(null);

  const handleMoveToTrash = async () => {
    if (!estimate?.id || trashing) return;
    if (openRevision) {
      window.alert("Save the open estimate revision before moving this estimate to Trash.");
      return;
    }
    if (estimate.work_order_id) {
      window.alert("This estimate is linked to a Work Order. Close or manage the job from the workflow before trashing the source estimate.");
      return;
    }
    if (!window.confirm("Move this estimate to Trash? It will be hidden from all estimate lists until it is restored.")) return;
    setTrashing(true);
    try {
      const saved = await softDeleteEstimateFromLoadedSnapshot({
        entity: staffEntities.AllInOneEstimate,
        estimate: persistedEstimate || estimate,
        deletedBy: currentUser?.email || "unknown",
        label: "Estimate trash",
      });
      setEstimate(saved);
      setPersistedEstimate(saved);
    } catch (error) {
      window.alert(error?.message || "The estimate could not be moved to Trash.");
    } finally {
      setTrashing(false);
    }
  };

  const handleDuplicate = () => {
    if (copyingRef.current || saving || trashing || !estimate?.id || estimate.deleted === true) return;
    if (openRevision) {
      window.alert("Save the open estimate revision before duplicating this estimate.");
      return;
    }
    setDuplicateChoiceOpen(true);
  };

  const runDuplicate = async (keepEstimateNumber) => {
    setDuplicateChoiceOpen(false);
    copyingRef.current = true;
    setDuplicating(true);
    try {
      const created = await duplicateEstimate({ source: estimate, sessionToken, creationKey: copyCreationKey("duplicate", [], keepEstimateNumber ? "same" : "new"), keepEstimateNumber });
      navigate(`/EstimateDetail?id=${created.id}`);
    } catch (error) {
      window.alert(error?.message || "The estimate could not be duplicated.");
    } finally {
      copyingRef.current = false;
      setDuplicating(false);
    }
  };

  const handleSplit = async (lineIds) => {
    if (!estimate?.id || !lineIds?.length) return false;
    if (copyingRef.current) throw new Error("An estimate copy is already being created. Please wait.");
    if (saving || trashing) throw new Error("Wait for the current estimate operation to finish before splitting.");
    if (estimate.deleted === true) throw new Error("Restore this estimate from Trash before splitting it.");
    if (openRevision) throw new Error("Save the open estimate revision before splitting this estimate.");
    copyingRef.current = true;
    setDuplicating(true);
    try {
      const created = await splitEstimate({ source: estimate, lineItemIds: lineIds, sessionToken, creationKey: copyCreationKey("split", lineIds) });
      navigate(`/EstimateDetail?id=${created.id}`);
      return true;
    } finally {
      copyingRef.current = false;
      setDuplicating(false);
    }
  };

  const handleMerge = async ({ secondary, lineItemIds }) => {
    if (!estimate?.id || estimate.deleted === true) throw new Error("This estimate is in Trash — restore it before merging.");
    if (isEstimateProtected(estimate.status)) throw new Error("This estimate is protected — merge is only allowed on Draft or Calculated estimates.");
    if (openRevision) throw new Error("Save the open estimate revision before merging.");
    if (saving || duplicating || trashing) throw new Error("Wait for the current operation to finish before merging.");

    const keep = new Set(lineItemIds || []);
    const secondaryLines = Array.isArray(secondary?.line_items) ? secondary.line_items : [];
    const secondaryKeys = secondaryLines.map(estimateLineSelectionKey);
    if (!keep.size || [...keep].some((key) => secondaryKeys.filter((k) => k === key).length !== 1)) {
      throw new Error("The selected sections changed or have ambiguous identifiers. Reload the merge dialog and select them again.");
    }
    const picked = secondaryLines.filter((_, index) => keep.has(secondaryKeys[index]));

    // Section keys must stay unique on the merged estimate — a merged section
    // that collides with an existing key gets a fresh line_id.
    const existingKeys = new Set((estimate.line_items || []).map(estimateLineSelectionKey));
    const mergedLines = [...(estimate.line_items || [])];
    for (const line of picked) {
      const copy = { ...line };
      if (existingKeys.has(estimateLineSelectionKey(copy, mergedLines.length))) {
        copy.line_id = globalThis.crypto?.randomUUID
          ? globalThis.crypto.randomUUID()
          : `merged-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      mergedLines.push(copy);
      existingKeys.add(estimateLineSelectionKey(copy, mergedLines.length));
    }

    const mergedEstimate = { ...estimate, line_items: mergedLines };
    const mergedPricing = computePricing(mergedEstimate);
    setSaving(true);
    try {
      const before = await staffEntities.AllInOneEstimate.get(estimate.id);
      assertNoPendingPriceAcceptance(before, "merging sections into the estimate");
      const nextFields = {
        line_items: mergedLines,
        total_cost: acceptedInternalEstimateCost(mergedLines),
        quote_total: mergedPricing.quoteTotal,
      };
      const saved = await saveEstimateFieldsSafely({
        baseline: before,
        nextFields,
        label: "Estimate merge",
        guardWholeVersion: true,
      });
      const after = { ...mergedEstimate, ...(saved || {}), id: estimate.id };
      setEstimate(after);
      setPersistedEstimate(saved || after);
      await rememberServerVersion(saved);

      const secondaryLabel = secondary.estimate_number ? `#${secondary.estimate_number}` : (secondary.project_name || "the other estimate");
      const primaryLabel = estimate.estimate_number ? `#${estimate.estimate_number}` : (estimate.project_name || "this estimate");
      const secondaryAfter = {
        ...secondary,
        status: "archived",
        archived_at: new Date().toISOString(),
        archived_reason: `Merged into ${primaryLabel} (${picked.length} section${picked.length === 1 ? "" : "s"} moved)`,
      };
      try {
        await staffEntities.AllInOneEstimate.update(secondary.id, {
          status: secondaryAfter.status,
          archived_at: secondaryAfter.archived_at,
          archived_reason: secondaryAfter.archived_reason,
        });
        await ensureEstimateLifecycleRevision({
          idempotencyKey: `estimate_merge:${secondary.id}:${estimate.id}:${picked.length}`,
          sessionToken,
          estimateBefore: secondary,
          estimateAfter: secondaryAfter,
          reason: `Merged into ${primaryLabel}`,
          revisionType: "status_transition",
          quoteTotalBefore: secondary.quote_total,
          quoteTotalAfter: secondary.quote_total,
          internalCostBefore: secondary.total_cost,
          internalCostAfter: secondary.total_cost,
        });
      } catch {
        window.alert(`The sections were merged, but ${secondaryLabel} could not be archived. Archive it manually so it is not edited twice.`);
      }
      setMergeOpen(false);
      window.alert(`${picked.length} section${picked.length === 1 ? "" : "s"} merged from ${secondaryLabel}. The other estimate was archived.`);
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreFromTrash = async () => {
    if (!estimate?.id || trashing) return;
    setTrashing(true);
    try {
      const saved = await restoreEstimateFromLoadedTrashSnapshot({
        entity: staffEntities.AllInOneEstimate,
        estimate: persistedEstimate || estimate,
        label: "Estimate restore",
      });
      setEstimate(saved);
      setPersistedEstimate(saved);
    } catch (error) {
      window.alert(error?.message || "The estimate could not be restored. Reload before retrying.");
    } finally {
      setTrashing(false);
    }
  };

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    staffEntities.AllInOneEstimate.get(id).then(async (res) => {
      const warnings = [];
      const withBuilders = await ensureEstimateBuilderProducts(res, {
        strictReconciliation: true,
        onWarning: (warning) => warnings.push(warning),
      });
      for (const line of withBuilders.line_items || []) {
        if (line.module_key === "custom" && line.builder_product_id && line.price_acceptance_pending?.kind !== "builder_product_remove") {
          try {
            await refreshManualProductPricing(line.builder_product_id);
          } catch (error) {
            warnings.push({
              builder_product_id: line.builder_product_id,
              product_name: line.client_product_name || line.project_name || "Custom Product",
              message: error?.message || "Custom Product live pricing could not be verified. The saved Product snapshot was retained.",
            });
          }
        }
      }
      const current = await staffEntities.AllInOneEstimate.get(id);
      const line_items = await refreshSectionSnapshots(current.line_items);
      const loaded = { ...current, line_items };
      const revision = await getOpenEstimateRevision(id);
      serverUpdatedAtRef.current = current.updated_date || "";
      setEstimate(loaded);
      setPersistedEstimate(loaded);
      setOpenRevision(revision);
      setReconciliationWarnings(warnings);
      const wantOpen = _params.get("open");
      if (wantOpen) {
        const match = (loaded?.line_items || []).find((l) => l.project_id === wantOpen || l.id === wantOpen);
        if (match) setActiveProduct({ ...match, estimate_id: loaded.id });
      }
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="p-10 text-center text-gray-400">Loading estimateâ€¦</div>;
  if (!estimate) return <div className="p-10 text-center text-gray-500">Estimate not found.</div>;

  if (estimate.deleted === true) {
    return (
      <div className="min-h-full bg-gray-50 flex items-start justify-center p-8">
        <div className="w-full max-w-lg rounded border border-red-300 bg-red-50 px-4 py-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-red-800">
            <Trash2 className="w-4 h-4" /> In Trash â€” {estimate.project_name || "Estimate"}
          </div>
          <div className="text-xs text-red-700">
            {estimate.deleted_at ? `Deleted ${new Date(estimate.deleted_at).toLocaleString()}` : "Deleted"}
            {estimate.deleted_by ? ` by ${estimate.deleted_by}` : ""}
          </div>
          <div className="text-[11px] text-red-700">
            This estimate is hidden from all estimate lists and cannot be edited until it is restored.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRestoreFromTrash}
              disabled={trashing}
              className="h-[32px] px-3 inline-flex items-center gap-1.5 rounded-sm border border-emerald-300 bg-white text-emerald-700 text-[12px] font-semibold hover:bg-emerald-50 disabled:opacity-40"
            >
              <RotateCcw className="w-3.5 h-3.5" /> {trashing ? "Restoringâ€¦" : "Restore Estimate"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/EstimatorQueues?status=trash")}
              className="h-[32px] px-3 rounded-sm border border-gray-300 bg-white text-gray-600 text-[12px] font-semibold hover:bg-gray-100"
            >
              Open Estimate Trash
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pricing = computePricing(estimate);
  const lines = estimate.line_items || [];
  const persistedStatus = persistedEstimate?.status || estimate.status || "draft";
  const readOnly = isEstimateProtected(persistedStatus) && !openRevision;

  // Stale-quote guardrail: quote validity only applies once the estimate is
  // sent and both the issue date and validity window exist.
  const validDays = estimate.quote_valid_days ?? estimate.valid_days;
  const expiresOn =
    estimate.status === "sent" && estimate.quote_issue_date && Number(validDays) > 0
      ? quoteExpirationDate(estimate.quote_issue_date, validDays)
      : "";
  const quoteDaysLeft = expiresOn
    ? Math.round((new Date(`${expiresOn}T00:00:00`) - new Date(`${localDateStamp()}T00:00:00`)) / 86400000)
    : null;

  const patch = (changes) => setEstimate((prev) => ({ ...prev, ...changes }));

  const patchLine = (index, changes) =>
    setEstimate((prev) => ({
      ...prev,
      line_items: prev.line_items.map((l, i) => (i === index ? { ...l, ...changes } : l)),
    }));

  const rememberServerVersion = async (record = null) => {
    let current = record;
    if (!current?.updated_date) current = await staffEntities.AllInOneEstimate.get(estimate.id);
    if (current?.updated_date) serverUpdatedAtRef.current = current.updated_date;
    return current;
  };

  const hasServerConflict = (current) => hasEstimateVersionConflict(
    serverUpdatedAtRef.current,
    current?.updated_date
  );

  const saveEstimateFieldsSafely = ({ baseline, nextFields, label, guardWholeVersion = false }) =>
    replaceEstimateFieldsIfUnchanged({
      entity: staffEntities.AllInOneEstimate,
      estimateId: estimate.id,
      expectedFields: expectedEstimateFields(baseline, nextFields),
      guardFields: guardWholeVersion ? { updated_date: baseline?.updated_date } : {},
      nextFields,
      label,
    });

  const loadCurrentProductMutationEstimate = async () => {
    const current = await staffEntities.AllInOneEstimate.get(estimate.id);
    if (!current) throw new Error("This estimate no longer exists.");
    await assertEstimateProductMutationAllowed(current, { expectedUpdatedAt: serverUpdatedAtRef.current });
    return current;
  };

  const refreshProducts = async () => {
    const current = await staffEntities.AllInOneEstimate.get(estimate.id);
    const warnings = [];
    const withBuilders = await ensureEstimateBuilderProducts(current, {
      strictReconciliation: true,
      onWarning: (warning) => warnings.push(warning),
    });
    for (const line of withBuilders.line_items || []) {
      if (line.module_key === "custom" && line.builder_product_id && line.price_acceptance_pending?.kind !== "builder_product_remove") {
        try {
          await refreshManualProductPricing(line.builder_product_id);
        } catch (error) {
          warnings.push({
            builder_product_id: line.builder_product_id,
            product_name: line.client_product_name || line.project_name || "Custom Product",
            message: error?.message || "Custom Product live pricing could not be verified. The saved Product snapshot was retained.",
          });
        }
      }
    }
    const refreshed = await staffEntities.AllInOneEstimate.get(estimate.id);
    const line_items = await refreshSectionSnapshots(refreshed.line_items);
    serverUpdatedAtRef.current = refreshed.updated_date || serverUpdatedAtRef.current;
    setEstimate((prev) => ({ ...prev, ...refreshed, line_items }));
    setReconciliationWarnings(warnings);
  };

  const repriceAllProducts = async () => {
    if (readOnly || saving || trashing || duplicating || copyingRef.current || refreshing) return;
    setRefreshing(true);
    try {
      await refreshProducts();
    } catch (error) {
      window.alert(error?.message || "Products could not be repriced. Reload the estimate before trying again.");
    } finally {
      setRefreshing(false);
    }
  };

  const removeLine = async (index) => {
    if (readOnly) return;
    const loadedLine = estimate.line_items[index];
    if (!loadedLine) return;
    try {
      await removeProductFromEstimate({
        estimateId: estimate.id,
        line: loadedLine,
        expectedEstimateUpdatedAt: serverUpdatedAtRef.current,
      });
      await refreshProducts();
    } catch (error) {
      await refreshProducts().catch(() => null);
      window.alert(`${error?.message || "Product could not be removed."}\n\nThe estimate was refreshed. If removal had already started, use Resume Product Remove to safely continue it.`);
    }
  };

  const addSection = async (mod) => {
    if (readOnly) return;
    const current = await loadCurrentProductMutationEstimate();
    const sectionName = `${current.project_name} â€” ${mod.label}`;
    try {
      const result = await addBlankProduct({
        estimateId: estimate.id,
        moduleKey: mod.key,
        sourceEntity: mod.entity,
        productName: sectionName,
        builderName: mod.label,
        isCustom: false,
        expectedEstimateUpdatedAt: current.updated_date || serverUpdatedAtRef.current,
      });
      await refreshProducts();
      if (result?.line) setActiveProduct({ ...result.line, estimate_id: estimate.id });
      return result;
    } catch (error) {
      await refreshProducts().catch(() => null);
      throw new Error(`${error?.message || "Product could not be added."}\n\nThe estimate was refreshed. If Product creation had already started, use Resume Product Add to safely continue it.`);
    }
  };

  const addCustomSection = async (name = "Custom Product") => {
    if (readOnly) return;
    const current = await loadCurrentProductMutationEstimate();
    try {
      const result = await addBlankProduct({
        estimateId: estimate.id,
        moduleKey: "custom",
        sourceEntity: "",
        productName: name,
        builderName: "Custom Product",
        isCustom: true,
        expectedEstimateUpdatedAt: current.updated_date || serverUpdatedAtRef.current,
      });
      await refreshProducts();
      return result;
    } catch (error) {
      await refreshProducts().catch(() => null);
      throw new Error(`${error?.message || "Custom Product could not be created."}\n\nThe estimate was refreshed. If Product creation had already started, use Resume Product Add to safely continue it.`);
    }
  };

  const cloneProduct = async (line) => {
    if (readOnly) return;
    try {
      await cloneProductInEstimate({ estimateId: estimate.id, line, expectedEstimateUpdatedAt: serverUpdatedAtRef.current });
      await refreshProducts();
    } catch (error) {
      await refreshProducts().catch(() => null);
      window.alert(`${error?.message || "Product could not be cloned."}\n\nThe estimate was refreshed. If the clone had already started, use Resume Product Clone to safely continue it.`);
    }
  };

  const updateProductNotes = async (line, notes) => {
    if (readOnly) return;
    await saveProductNotes({ estimateId: estimate.id, line, notes, expectedEstimateUpdatedAt: serverUpdatedAtRef.current });
    await refreshProducts();
  };

  const persistProductSettings = async (line, index, patch) => {
    if (readOnly) return;
    try {
      const savedLine = await saveProductSettings({
        estimateId: estimate.id,
        line,
        patch,
        expectedEstimateUpdatedAt: serverUpdatedAtRef.current,
      });
      await rememberServerVersion();
      if (savedLine) patchLine(index, savedLine);
    } catch (error) {
      await refreshProducts().catch(() => null);
      const isPriceAdjustment = patch?.customer_price_snapshot !== undefined;
      window.alert(`${error?.message || "Product settings could not be saved."}${isPriceAdjustment ? "\n\nThe estimate was refreshed. If the price adjustment had already started, use Resume Product Price to safely continue it." : ""}`);
    }
  };

  const createQuickProduct = async (line, options) => {
    const current = await staffEntities.AllInOneEstimate.get(estimate.id);
    if (!current) throw new Error("This estimate no longer exists.");
    if (hasServerConflict(current)) {
      throw new Error("This estimate changed in another session. Reload it before saving a Quick Product so the reusable snapshot cannot mix old and new Product state.");
    }
    await saveProductAsQuickProduct({
      estimateId: estimate.id,
      line,
      name: options?.name,
      productGroup: options?.productGroup,
      categories: options?.categories,
    });
  };

  const addQuickProduct = async (quickProduct) => {
    if (readOnly) return;
    try {
      await instantiateQuickProduct({ estimateId: estimate.id, quickProduct, expectedEstimateUpdatedAt: serverUpdatedAtRef.current });
      await refreshProducts();
    } catch (error) {
      await refreshProducts().catch(() => null);
      window.alert(`${error?.message || "Quick Product could not be added."}\n\nThe estimate was refreshed. If insertion had already started, use Resume Quick Product to safely continue it.`);
    }
  };

  const updateProductPrice = async (line) => {
    if (readOnly) return;
    try {
      const result = line?.price_acceptance_pending?.kind === "builder_quick_product_insert"
        ? await resumeQuickProductInsertion({ estimateId: estimate.id, lineId: line.line_id || "" })
        : line?.price_acceptance_pending?.kind === "builder_blank_product_insert"
          ? await resumeBlankProductInsertion({ estimateId: estimate.id, lineId: line.line_id || "" })
          : line?.price_acceptance_pending?.kind === "builder_product_remove"
            ? await resumeProductRemoval({ estimateId: estimate.id, lineId: line.line_id || "" })
            : line?.price_acceptance_pending?.kind === "builder_part_group_move"
            ? await resumeIndependentPartGroupMove({ estimateId: estimate.id, lineId: line.line_id || "" })
            : await acceptBuilderPrice({ estimateId: estimate.id, line, expectedEstimateUpdatedAt: serverUpdatedAtRef.current });
      if (result?.blocked && result.reason === "detached_parts") {
        const names = (result.detachedParts || [])
          .map((part) => part.part_name || part.inventory_item_name)
          .filter(Boolean);
        window.alert(
          `Price update blocked. ${result.detachedCount} Part${result.detachedCount === 1 ? "" : "s"} must be reattached or resolved first.${names.length ? `\n\n${names.map((name) => `â€¢ ${name}`).join("\n")}` : ""}\n\nThe frozen product price has not changed.`
        );
      } else if (result?.blocked && result.reason === "recalc_required") {
        window.alert(
          `${result.recalcReason || "This Builder must be recalculated with current Master Inventory before its price can be updated."}\n\nOpen the Builder, review the current pricing, and save it. The frozen Product price has not changed.`
        );
      }
      await refreshProducts();
    } catch (error) {
      // A mid-write failure may have persisted the durable recovery marker. Reload
      // immediately so the row exposes Resume Price Update instead of stale state.
      await refreshProducts().catch(() => null);
      const recoveryLabel = line?.price_acceptance_pending?.kind === "builder_manual_product_price"
        ? "Resume Product Price"
        : line?.price_acceptance_pending?.kind === "builder_part_group_clone"
          ? "Resume Group Clone"
          : line?.price_acceptance_pending?.kind === "builder_part_group_move"
            ? "Resume Group Move"
            : line?.price_acceptance_pending?.kind === "builder_part_group_create"
              ? "Resume Group Create"
              : line?.price_acceptance_pending?.kind === "builder_part_group_dissolve"
                ? "Resume Group Dissolve"
                : line?.price_acceptance_pending?.kind === "builder_blank_product_insert"
                  ? "Resume Product Add"
                  : line?.price_acceptance_pending?.kind === "builder_product_remove"
                    ? "Resume Product Remove"
                    : line?.price_acceptance_pending?.kind === "builder_quick_product_insert"
          ? line?.price_acceptance_pending?.source_type === "product_clone" ? "Resume Product Clone" : "Resume Quick Product"
          : "Resume Price Update";
      window.alert(`${error?.message || "Product pricing/recovery could not be completed."}\n\nThe estimate was refreshed. If this operation had already started, use ${recoveryLabel} to safely continue it.`);
    }
  };

  const handleStartRevision = async (reason) => {
    const current = await staffEntities.AllInOneEstimate.get(estimate.id);
    assertNoPendingPriceAcceptance(current, "starting an Estimate Revision");
    if (hasServerConflict(current)) {
      throw new Error("This estimate changed in another session. Reload before starting a revision so the revision snapshot does not overwrite or omit newer work.");
    }
    if (current.pipeline_sync_pending) {
      throw new Error("Sales Pipeline synchronization is still pending. Retry that synchronization before starting another estimate revision.");
    }
    const currentPricing = computePricing(current);
    const internalCost = acceptedInternalEstimateCost(current.line_items || []);
    const revision = await startEstimateRevision({
      estimate: current,
      reason,
      quoteTotal: currentPricing.quoteTotal,
      internalCost,
      sessionToken,
    });
    setOpenRevision(revision);
    setRevisionRefreshKey((value) => value + 1);
  };

  const handleSave = async () => {
    if (readOnly) {
      setStep(3);
      window.alert("This estimate is protected. Open Finalize Estimate and start a revision before making changes.");
      return;
    }

    const lifecycleReasonRequired = !openRevision && requiresEstimateLifecycleReason(persistedStatus, estimate.status);
    const lifecycleReason = String(estimate.edit_reason || "").trim();
    if (lifecycleReasonRequired && !lifecycleReason) {
      setStep(3);
      window.alert("A reason is required before saving this estimate status change. Enter it in Estimate Revision History on Finalize Estimate.");
      return;
    }

    setSaving(true);
    try {
      const before = await staffEntities.AllInOneEstimate.get(estimate.id);
      assertNoPendingPriceAcceptance(before, "saving the estimate");
      if (!isEstimateStatusTransitionAllowed(before.status, estimate.status)) {
        window.alert(`An estimate cannot go from ${before.status || "draft"} to ${estimate.status || "draft"} directly. Send it first — approval is only allowed after the quote has been sent.`);
        return;
      }
      const { id: _id, created_date: _created_date, updated_date: _updated_date, created_by_id: _created_by_id, created_by: _created_by, ...data } = estimate;
      // A save recomputes pricing — clear the tier-change stale flag (#145).
      data.pricing_stale = false;
      data.pricing_stale_reason = "";
      const internalCost = acceptedInternalEstimateCost(estimate.line_items || []);
      const pendingTransition = pendingLifecycleBaselineRef.current;
      const matchingPendingTransition = lifecycleReasonRequired &&
        pendingTransition?.nextStatus === estimate.status &&
        pendingTransition?.reason === lifecycleReason
        ? pendingTransition
        : null;
      const quoteIssueMetadata = intendedQuoteIssueMetadata({
        resolveQuoteIssueMetadata,
        serverRecord: before,
        localEstimate: estimate,
        openRevision,
        pendingTransition: matchingPendingTransition,
        today: localDateStamp(),
      });
      const persistedData = {
        ...data,
        ...quoteIssueMetadata,
        edit_reason: lifecycleReasonRequired ? lifecycleReason : "",
        total_cost: internalCost,
        quote_total: pricing.quoteTotal,
      };
      const intendedSavedState = { ...estimate, ...persistedData, id: estimate.id };
      const serverConflict = hasServerConflict(before);
      const priorEstimateWriteAlreadyApplied = serverConflict && estimateServerMatchesIntendedSave(before, intendedSavedState);
      if (serverConflict && !priorEstimateWriteAlreadyApplied) {
        window.alert("This estimate changed in another session after this page last read or saved it. Your local changes were not written. Reload the estimate and reconcile the newer server changes before saving.");
        return;
      }
      if (lifecycleReasonRequired && !matchingPendingTransition) {
        pendingLifecycleBaselineRef.current = {
          estimateBefore: before,
          nextStatus: estimate.status,
          reason: lifecycleReason,
          quoteIssueMetadata: { ...quoteIssueMetadata },
          key: `status_transition:${estimate.id}:${before.updated_date || "unknown"}:${before.status || "draft"}:${estimate.status}:${Number(quoteIssueMetadata.quote_version ?? before.quote_version ?? 0)}`,
        };
      }

      let saved;
      if (priorEstimateWriteAlreadyApplied) {
        saved = before;
      } else {
        const refreshed = await saveEstimateFieldsSafely({
          baseline: before,
          nextFields: persistedData,
          label: "Estimate save",
          guardWholeVersion: true,
        });
        saved = { ...estimate, ...persistedData, ...(refreshed || {}), id: estimate.id };
      }
      await rememberServerVersion(saved);

      let syncPreviousStatus = before.status || "";
      let transitionBefore = null;
      let transitionIdempotencyKey = "";
      if (openRevision) {
        syncPreviousStatus = openRevision.estimate_snapshot_before?.status || syncPreviousStatus;
      } else if (lifecycleReasonRequired) {
        const pending = pendingLifecycleBaselineRef.current;
        transitionBefore = pending?.estimateBefore || before;
        syncPreviousStatus = transitionBefore.status || syncPreviousStatus;
        transitionIdempotencyKey = pending?.key || `status_transition:${estimate.id}:${transitionBefore.updated_date || "unknown"}:${transitionBefore.status || "draft"}:${saved.status || "draft"}:${Number(saved.quote_version || 0)}`;
      }

      // First make the estimate/lifecycle audit authoritative. Quote issuance is
      // anchored to the original revision version and lifecycle rows are retry-safe,
      // so a later downstream retry cannot issue another customer quote version.
      if (openRevision) {
        await completeEstimateRevision({
          revision: openRevision,
          estimate: saved,
          sessionToken,
          quoteTotal: pricing.quoteTotal,
          internalCost,
          workOrderId: saved.work_order_id || "",
        });
      } else if (lifecycleReasonRequired) {
        await ensureEstimateLifecycleRevision({
          idempotencyKey: transitionIdempotencyKey,
          sessionToken,
          estimateBefore: transitionBefore || before,
          estimateAfter: saved,
          reason: lifecycleReason,
          revisionType: "status_transition",
          quoteTotalBefore: (transitionBefore || before).quote_total,
          quoteTotalAfter: pricing.quoteTotal,
          internalCostBefore: (transitionBefore || before).total_cost,
          internalCostAfter: internalCost,
          workOrderId: saved.work_order_id || "",
        });
      }

      try {
        // Customer/WorkOrder sync resolves existing records and is safe to retry.
        const customerSyncBaseline = priorEstimateWriteAlreadyApplied ? (persistedEstimate || before) : before;
        const customerChangedKeys = estimateCustomerChangedKeys(customerSyncBaseline, saved);
        await syncEstimateEverywhere(saved, {
          previousEstimateStatus: syncPreviousStatus,
          syncCustomer: customerChangedKeys.length > 0,
          customerChangedKeys,
          sessionToken,
        });
        const cleanup = {};
        if (lifecycleReasonRequired && saved.edit_reason) cleanup.edit_reason = "";
        if (saved.pipeline_sync_pending) cleanup.pipeline_sync_pending = false;
        if (saved.pipeline_sync_error) cleanup.pipeline_sync_error = "";
        if (Object.keys(cleanup).length) {
          const cleared = await saveEstimateFieldsSafely({
            baseline: saved,
            nextFields: cleanup,
            label: "Estimate pipeline synchronization cleanup",
          });
          saved = { ...saved, ...(cleared || {}), ...cleanup };
          await rememberServerVersion(saved);
        }
      } catch (syncError) {
        const message = String(syncError?.message || "Customer/Sales Pipeline synchronization failed.");
        const recoveryPatch = {
          pipeline_sync_pending: true,
          pipeline_sync_error: message,
          ...(lifecycleReasonRequired ? { edit_reason: "" } : {}),
        };
        try {
          const recovered = await saveEstimateFieldsSafely({
            baseline: saved,
            nextFields: recoveryPatch,
            label: "Estimate pipeline synchronization recovery marker",
          });
          saved = { ...saved, ...(recovered || {}), ...recoveryPatch };
          await rememberServerVersion(saved);
        } catch (markerError) {
          saved = { ...saved, ...recoveryPatch };
          window.alert(`Estimate saved and lifecycle history recorded, but Sales Pipeline sync failed and the durable retry marker could not be saved.\n\nPipeline error: ${message}\nMarker error: ${markerError?.message || "unknown error"}`);
        }
        pendingLifecycleBaselineRef.current = null;
        if (openRevision) setOpenRevision(null);
        if (openRevision || lifecycleReasonRequired) setRevisionRefreshKey((value) => value + 1);
        setEstimate(saved);
        setPersistedEstimate(saved);
        window.alert(`Estimate saved successfully, but Sales Pipeline synchronization is pending.\n\n${message}\n\nOpen Finalize Estimate and use Retry Pipeline Sync.`);
        return;
      }

      pendingLifecycleBaselineRef.current = null;
      if (openRevision) setOpenRevision(null);
      if (openRevision || lifecycleReasonRequired) setRevisionRefreshKey((value) => value + 1);

      setEstimate(saved);
      setPersistedEstimate(saved);
    } catch (error) {
      window.alert(error?.message || "The estimate could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const handleRetryPipelineSync = async () => {
    if (!estimate?.pipeline_sync_pending || saving) return;
    setSaving(true);
    try {
      const current = await staffEntities.AllInOneEstimate.get(estimate.id);
      if (hasServerConflict(current)) {
        window.alert("This estimate changed in another session. Reload before retrying Sales Pipeline synchronization.");
        return;
      }

      try {
        // No historical transition guess is needed here. Versioned quotes recover
        // their first-sent date from quote_issue_date; legacy Quote Version 0 data
        // is intentionally left untouched.
        await syncEstimateEverywhere(current, { previousEstimateStatus: "", syncCustomer: false, sessionToken });
      } catch (syncError) {
        const message = String(syncError?.message || "Customer/Sales Pipeline synchronization failed.");
        const failed = await saveEstimateFieldsSafely({
          baseline: current,
          nextFields: {
            pipeline_sync_pending: true,
            pipeline_sync_error: message,
          },
          label: "Estimate pipeline retry failure marker",
        }).catch(() => null) || await staffEntities.AllInOneEstimate.get(estimate.id).catch(() => current);
        const failedState = { ...current, ...(failed || {}), pipeline_sync_pending: true, pipeline_sync_error: message };
        await rememberServerVersion(failedState);
        setEstimate(failedState);
        setPersistedEstimate(failedState);
        window.alert(`Sales Pipeline synchronization is still pending.\n\n${message}`);
        return;
      }

      const cleared = await saveEstimateFieldsSafely({
        baseline: current,
        nextFields: {
          pipeline_sync_pending: false,
          pipeline_sync_error: "",
        },
        label: "Estimate pipeline retry success cleanup",
      });
      const saved = { ...current, ...(cleared || {}), pipeline_sync_pending: false, pipeline_sync_error: "" };
      await rememberServerVersion(saved);
      setEstimate(saved);
      setPersistedEstimate(saved);
      window.alert("Sales Pipeline synchronization completed successfully.");
    } finally {
      setSaving(false);
    }
  };

  const handleRepairConversionTracking = async () => {
    if (!estimate?.work_order_id || repairingConversionTracking) return;
    setRepairingConversionTracking(true);
    try {
      const current = await staffEntities.AllInOneEstimate.get(estimate.id);
      if (!current?.work_order_id) throw new Error("This estimate is no longer linked to a Work Order. Reload the estimate before repairing conversion tracking.");
      if (current.work_order_id !== estimate.work_order_id) throw new Error("The linked Work Order changed in another session. Reload before repairing conversion tracking.");
      const workOrder = await staffEntities.WorkOrder.get(current.work_order_id).catch(() => null);
      if (!workOrder?.id) throw new Error("The linked Work Order could not be found. Conversion tracking was not changed.");

      const internalCost = Number.isFinite(Number(current.total_cost))
        ? Number(current.total_cost)
        : acceptedInternalEstimateCost(current.line_items || []);
      const quoteTotal = Number(current.quote_total || 0);
      const conversionAfter = { ...current, status: "approved", work_order_id: workOrder.id, edit_reason: "" };
      const conversionBefore = { ...conversionAfter, work_order_id: "" };
      await ensureEstimateLifecycleRevision({
        idempotencyKey: `work_order_conversion:${workOrder.id}`,
        sessionToken,
        estimateBefore: conversionBefore,
        estimateAfter: conversionAfter,
        reason: "Converted approved estimate to Work Order",
        revisionType: "conversion",
        quoteTotalBefore: quoteTotal,
        quoteTotalAfter: quoteTotal,
        internalCostBefore: internalCost,
        internalCostAfter: internalCost,
        workOrderId: workOrder.id,
      });
      setRevisionRefreshKey((value) => value + 1);
      window.alert("Work Order conversion tracking repaired. The estimate and Work Order were not modified.");
    } catch (error) {
      window.alert(error?.message || "Work Order conversion tracking could not be repaired.");
    } finally {
      setRepairingConversionTracking(false);
    }
  };

  const handleQuoteDelivered = async ({ recipientEmail, issueMetadata, quoteVersion, gmailMessageId, sentAt, deliveryId, archive }) => {
    // Re-read after Gmail accepts the message so a concurrent lifecycle change
    // cannot silently be overwritten by the delivery finalization.
    const before = await staffEntities.AllInOneEstimate.get(estimate.id);
    assertNoPendingPriceAcceptance(before, "finalizing quote delivery");
    const sourceStatus = before.status || "draft";
    const issuingNewQuote = ["draft", "calculated"].includes(sourceStatus);
    if (!issuingNewQuote) {
      throw new Error("The quote email was sent, but this estimate changed lifecycle status during delivery. The delivery was logged, but the estimate was not auto-finalized.");
    }
    if (hasServerConflict(before)) {
      throw new Error("The quote email was sent, but this estimate was edited by another session during delivery. The delivery was logged, but the estimate was not overwritten or auto-finalized.");
    }
    if (openRevision || isEstimateProtected(sourceStatus)) {
      throw new Error("The quote email was sent, but this estimate is no longer eligible for an automatic Sent transition. Review the estimate status and delivery history before changing it manually.");
    }

    const expectedMetadata = resolveQuoteIssueMetadata({
      previousStatus: sourceStatus,
      nextStatus: "sent",
      currentVersion: before.quote_version || 0,
      today: issueMetadata?.quote_issue_date || localDateStamp(),
    });
    if (
      Number(expectedMetadata.quote_version || 0) !== Number(issueMetadata?.quote_version || 0) ||
      Number(expectedMetadata.quote_version || 0) !== Number(quoteVersion || 0) ||
      expectedMetadata.quote_issue_date !== issueMetadata?.quote_issue_date
    ) {
      throw new Error("The estimate changed while the quote was being sent. The email was delivered, but the estimate was not auto-finalized to avoid recording the wrong quote version.");
    }

    const { id: _id, created_date: _created_date, updated_date: _updated_date, created_by_id: _created_by_id, created_by: _created_by, ...data } = estimate;
    const internalCost = acceptedInternalEstimateCost(estimate.line_items || []);
    const persistedData = {
      ...data,
      status: "sent",
      ...expectedMetadata,
      edit_reason: "",
      total_cost: internalCost,
      quote_total: pricing.quoteTotal,
    };
    const refreshed = await saveEstimateFieldsSafely({
      baseline: before,
      nextFields: persistedData,
      label: "Quote delivery Estimate finalization",
      guardWholeVersion: true,
    });
    let saved = { ...estimate, ...persistedData, ...(refreshed || {}), id: estimate.id };
    await rememberServerVersion(saved);

    const warnings = [];
    const deliveryIdentity = deliveryId || gmailMessageId || quoteIssueKey(estimate.id, quoteVersion);
    try {
      await ensureEstimateLifecycleRevision({
        idempotencyKey: `quote_issuance:${deliveryIdentity}`,
        sessionToken,
        estimateBefore: before,
        estimateAfter: saved,
        reason: `Quote emailed to ${recipientEmail}`,
        revisionType: "status_transition",
        quoteTotalBefore: before.quote_total,
        quoteTotalAfter: pricing.quoteTotal,
        internalCostBefore: before.total_cost,
        internalCostAfter: internalCost,
        workOrderId: saved.work_order_id || "",
        deliveryEvidence: {
          delivery_id: deliveryId || "",
          gmail_message_id: gmailMessageId || "",
          recipient_email: recipientEmail,
          sent_at: sentAt || new Date().toISOString(),
          attachment_file_url: archive?.fileUrl || "",
          attachment_sha256: archive?.sha256 || "",
          attachment_size_bytes: Number(archive?.sizeBytes || 0),
        },
      });
    } catch (revisionError) {
      warnings.push(`The quote is issued and the delivery is recorded, but its lifecycle revision could not be saved: ${revisionError?.message || "unknown error"}`);
    }

    try {
      await syncEstimateEverywhere(saved, { previousEstimateStatus: sourceStatus, syncCustomer: false, sessionToken });
      if (saved.pipeline_sync_pending || saved.pipeline_sync_error) {
        const cleared = await saveEstimateFieldsSafely({
          baseline: saved,
          nextFields: {
            pipeline_sync_pending: false,
            pipeline_sync_error: "",
          },
          label: "Quote delivery pipeline cleanup",
        });
        saved = { ...saved, ...(cleared || {}), pipeline_sync_pending: false, pipeline_sync_error: "" };
        await rememberServerVersion(saved);
      }
    } catch (syncError) {
      const message = String(syncError?.message || "Customer/Sales Pipeline synchronization failed.");
      const recovered = await saveEstimateFieldsSafely({
        baseline: saved,
        nextFields: {
          pipeline_sync_pending: true,
          pipeline_sync_error: message,
        },
        label: "Quote delivery pipeline recovery marker",
      }).catch(() => null) || await staffEntities.AllInOneEstimate.get(estimate.id).catch(() => saved);
      saved = { ...saved, ...(recovered || {}), pipeline_sync_pending: true, pipeline_sync_error: message };
      await rememberServerVersion(saved);
      warnings.push(`The quote is issued, but Sales Pipeline synchronization is pending: ${message}`);
    }

    setEstimate(saved);
    setPersistedEstimate(saved);
    setRevisionRefreshKey((value) => value + 1);
    return { warning: warnings.join("\n") };
  };

  const handleDeliveryEvidenceReady = async ({ quoteVersion, deliveryId, gmailMessageId, recipientEmail, sentAt, archive }) => {
    try {
      const result = await attachQuoteDeliveryEvidenceToIssuanceRevision({
        estimateId: estimate.id,
        quoteVersion,
        sessionToken,
        evidence: {
          deliveryId,
          gmailMessageId,
          recipientEmail,
          sentAt,
          archive,
        },
      });
      setRevisionRefreshKey((value) => value + 1);
      setDeliveryRefreshKey((value) => value + 1);
      return { warning: result?.warning || "" };
    } catch (error) {
      return { warning: `Quote delivery evidence could not be attached to the issuance revision: ${error?.message || "unknown error"}` };
    }
  };

  const handleRecordAcceptance = async ({
    quoteVersion,
    acceptedByName,
    acceptedByEmail,
    acceptanceMethod,
    acceptedAt,
    evidenceReference,
    notes,
    deliveryId,
  }) => {
    const before = await staffEntities.AllInOneEstimate.get(estimate.id);
    assertNoPendingPriceAcceptance(before, "recording customer acceptance");
    if (hasServerConflict(before)) {
      throw new Error("This estimate changed in another session. Reload before recording customer acceptance.");
    }
    const currentVersion = Math.max(0, Math.floor(Number(before.quote_version || 0)));
    if (!["sent", "approved"].includes(before.status)) {
      throw new Error("Customer acceptance can only be finalized from a Sent estimate or repaired on an already Approved estimate.");
    }
    if (!currentVersion || currentVersion !== Number(quoteVersion || 0)) {
      throw new Error("The issued quote version changed. Reload the estimate before recording acceptance.");
    }

    // Acceptance creation is centralized server-side so the immutable quote
    // totals/dates come from the persisted estimate and simultaneous estimator
    // sessions converge on one canonical acceptance record.
    let acceptanceResponse;
    try {
      const response = await base44.functions.invoke("recordEstimateAcceptance", {
        estimate_id: estimate.id,
        quote_version: currentVersion,
        accepted_at: acceptedAt,
        accepted_by_name: acceptedByName,
        accepted_by_email: acceptedByEmail || "",
        acceptance_method: acceptanceMethod,
        delivery_id: deliveryId || "",
        evidence_reference: evidenceReference || "",
        notes: notes || "",
        session_token: sessionToken,
      });
      acceptanceResponse = response?.data || response;
    } catch (error) {
      const message = error?.response?.data?.error || error?.data?.error || error?.message || "Customer acceptance could not be recorded.";
      throw new Error(message);
    }
    if (acceptanceResponse?.error) throw new Error(acceptanceResponse.error);
    const acceptance = acceptanceResponse?.acceptance;
    if (!acceptance?.id) throw new Error("Customer acceptance could not be verified after recording.");

    const transitionBefore = before.status === "approved" ? { ...before, status: "sent" } : before;
    let after = { ...before, status: "approved", edit_reason: "" };
    const acceptedName = acceptance?.accepted_by_name || acceptedByName;
    const acceptedMethod = acceptance?.acceptance_method || acceptanceMethod;
    const methodLabel = String(acceptedMethod || "other").replace(/_/g, " ");
    try {
      if (before.status === "sent") {
        const approved = await saveEstimateFieldsSafely({
          baseline: before,
          nextFields: { status: "approved", edit_reason: "" },
          label: "Customer acceptance Estimate approval",
          guardWholeVersion: true,
        });
        after = { ...after, ...(approved || {}), status: "approved", edit_reason: "" };
        await rememberServerVersion(after);
      }

      // The immutable acceptance is the idempotency anchor for exactly one
      // Sent â†’ Approved lifecycle revision.
      await ensureEstimateLifecycleRevision({
        idempotencyKey: `customer_acceptance:${acceptance.id}`,
        sessionToken,
        estimateBefore: transitionBefore,
        estimateAfter: after,
        reason: `${acceptedName} accepted Quote Version ${currentVersion} via ${methodLabel}`,
        revisionType: "status_transition",
        quoteTotalBefore: transitionBefore.quote_total,
        quoteTotalAfter: after.quote_total,
        internalCostBefore: transitionBefore.total_cost,
        internalCostAfter: after.total_cost,
        workOrderId: after.work_order_id || "",
      });
    } catch (error) {
      const reflected = await staffEntities.AllInOneEstimate.get(estimate.id).catch(() => after);
      const reflectedState = { ...after, ...(reflected || {}) };
      await rememberServerVersion(reflectedState);
      setEstimate(reflectedState);
      setPersistedEstimate(reflectedState);
      setRevisionRefreshKey((value) => value + 1);
      throw new Error(`Customer acceptance is recorded, but approval lifecycle tracking could not be finalized: ${error?.message || "unknown error"}`);
    }

    let syncWarning = "";
    try {
      await syncEstimateEverywhere(after, { previousEstimateStatus: "sent", syncCustomer: false, sessionToken });
      if (after.pipeline_sync_pending || after.pipeline_sync_error) {
        const cleared = await saveEstimateFieldsSafely({
          baseline: after,
          nextFields: {
            pipeline_sync_pending: false,
            pipeline_sync_error: "",
          },
          label: "Customer acceptance pipeline cleanup",
        });
        after = { ...after, ...(cleared || {}), pipeline_sync_pending: false, pipeline_sync_error: "" };
        await rememberServerVersion(after);
      }
    } catch (syncError) {
      const message = String(syncError?.message || "Customer/Sales Pipeline synchronization failed.");
      const recovered = await saveEstimateFieldsSafely({
        baseline: after,
        nextFields: {
          pipeline_sync_pending: true,
          pipeline_sync_error: message,
        },
        label: "Customer acceptance pipeline recovery marker",
      }).catch(() => null) || await staffEntities.AllInOneEstimate.get(estimate.id).catch(() => after);
      after = { ...after, ...(recovered || {}), pipeline_sync_pending: true, pipeline_sync_error: message };
      await rememberServerVersion(after);
      syncWarning = `Customer acceptance and approval are saved, but Sales Pipeline synchronization is pending: ${message}`;
    }

    const refreshed = await staffEntities.AllInOneEstimate.get(estimate.id).catch(() => after);
    const savedAfter = { ...after, ...(refreshed || {}), status: "approved", edit_reason: "" };
    if (savedAfter.updated_date) serverUpdatedAtRef.current = savedAfter.updated_date;
    setEstimate(savedAfter);
    setPersistedEstimate(savedAfter);
    setRevisionRefreshKey((value) => value + 1);
    if (syncWarning) window.alert(syncWarning);
    return savedAfter;
  };

  const handleCancel = async (reason) => {
    if (openRevision) {
      window.alert("Save the open estimate revision before cancelling the estimate.");
      return;
    }
    const before = await staffEntities.AllInOneEstimate.get(estimate.id);
    assertNoPendingPriceAcceptance(before, "cancelling the estimate");
    if (hasServerConflict(before)) {
      window.alert("This estimate changed in another session. Reload before cancelling so newer work is not cancelled from a stale page.");
      return;
    }
    if (before.pipeline_sync_pending) {
      window.alert("Sales Pipeline synchronization is still pending. Retry that synchronization before cancelling this estimate.");
      return;
    }
    if (before.work_order_id) {
      throw new Error("This estimate is already linked to a Work Order. Cancel or close the job from the workflow instead of cancelling the source estimate.");
    }
    const cancelled = await saveEstimateFieldsSafely({
      baseline: before,
      nextFields: {
        status: "cancelled",
        cancel_reason: reason,
        cancelled_at: new Date().toISOString(),
        edit_reason: "",
      },
      label: "Estimate cancellation",
      guardWholeVersion: true,
    });
    let after = { ...before, ...(cancelled || {}), status: "cancelled", cancel_reason: reason, cancelled_at: new Date().toISOString(), edit_reason: "" };
    await rememberServerVersion(after);

    try {
      await ensureEstimateLifecycleRevision({
        idempotencyKey: `cancel:${estimate.id}:${before.updated_date || "unknown"}`,
        sessionToken,
        estimateBefore: before,
        estimateAfter: after,
        reason,
        revisionType: "cancel",
        quoteTotalBefore: before.quote_total,
        quoteTotalAfter: before.quote_total,
        internalCostBefore: before.total_cost,
        internalCostAfter: before.total_cost,
        workOrderId: "",
      });
    } catch (revisionError) {
      setEstimate(after);
      setPersistedEstimate(after);
      setShowCancel(false);
      setRevisionRefreshKey((value) => value + 1);
      throw new Error(`The estimate is cancelled, but its cancellation lifecycle revision could not be saved: ${revisionError?.message || "unknown error"}`);
    }

    try {
      await syncEstimateEverywhere(after, { previousEstimateStatus: before.status || "", syncCustomer: false, sessionToken });
    } catch (syncError) {
      const message = String(syncError?.message || "Customer/Sales Pipeline synchronization failed.");
      const recovered = await saveEstimateFieldsSafely({
        baseline: after,
        nextFields: {
          pipeline_sync_pending: true,
          pipeline_sync_error: message,
        },
        label: "Estimate cancellation pipeline recovery marker",
      }).catch(() => null) || await staffEntities.AllInOneEstimate.get(estimate.id).catch(() => after);
      after = { ...after, ...(recovered || {}), pipeline_sync_pending: true, pipeline_sync_error: message };
      await rememberServerVersion(after);
      setEstimate(after);
      setPersistedEstimate(after);
      setShowCancel(false);
      setRevisionRefreshKey((value) => value + 1);
      window.alert(`The estimate is cancelled and its lifecycle history is saved, but Sales Pipeline synchronization is pending.\n\n${message}\n\nUse Retry Pipeline Sync in Finalize Estimate.`);
      return;
    }

    setShowCancel(false);
    navigate("/Estimator");
  };

  const counts = lines.reduce((acc, l) => {
    acc[l.module_key] = (acc[l.module_key] || 0) + 1;
    return acc;
  }, {});

  const WorkspaceNav = ({ compact = false }) => (
    <div className={`${compact ? "pt-1" : "sticky top-0 z-20 -mx-1 px-1 py-1.5 bg-gray-50/95 backdrop-blur-sm"}`}>
      <div className="bg-white border border-gray-300 rounded-sm shadow-sm flex items-center justify-between gap-3 px-2.5 py-2">
        <div className="min-w-0">
          <div className="text-[10px] font-bold tracking-wider uppercase text-gray-400">Estimate Workspace</div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[14px] font-bold text-gray-900 truncate">{WORKSPACE_TITLES[step]}</span>
            {step === 2 && (
              <span className="text-[10px] px-2 py-0.5 rounded-sm bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap">
                {lines.length} product{lines.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <div className="inline-flex items-stretch rounded-sm border border-gray-300 overflow-hidden bg-gray-50 flex-shrink-0">
          {WORKSPACE_TABS.map((tab) => {
            const active = tab.n === step;
            return (
              <button
                key={tab.n}
                type="button"
                onClick={() => setStep(tab.n)}
                aria-current={active ? "page" : undefined}
                className={`h-[32px] px-3 text-[11px] font-bold border-r border-gray-300 last:border-r-0 transition-colors ${
                  active
                    ? "bg-lime-200 text-gray-950 shadow-inner"
                    : "bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  // Fire the approval celebration whenever the persisted status transitions
  // to "approved" — covers the staff approve button, the conversion path, and
  // a customer portal acceptance reflected on reload.
  useEffect(() => {
    const status = String(persistedEstimate?.status || "").trim();
    if (prevApprovedStatusRef.current && status === "approved" && prevApprovedStatusRef.current !== "approved") {
      setCelebration("Quote approved — the customer signed off. Great work.");
      const t = setTimeout(() => setCelebration(""), 4500);
      return () => clearTimeout(t);
    }
    if (status) prevApprovedStatusRef.current = status;
    return undefined;
  }, [persistedEstimate?.status]);

  return (
    <div className="min-h-full bg-gray-50">
      {celebration ? <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-emerald-300 bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-xl">&#10003; {celebration}</div> : null}
      <AioEstimateHeader
        title={estimate.project_name || "Estimate"}
        subtitle={`One page, one set of project info, every estimator. Â· Totals synced ${new Date().toLocaleTimeString()}`}
        status={estimate.status || "draft"}
        quoteTotal={pricing.quoteTotal}
        onSave={handleSave}
        saving={saving}
        readOnly={readOnly}
        onDuplicate={handleDuplicate}
        duplicating={duplicating}
        onMerge={() => setMergeOpen(true)}
      />

      {estimate.opportunity_id && (
        <div className="px-3 pb-2">
          <a href={`/Opportunities?open=${estimate.opportunity_id}`}
            className="inline-flex items-center gap-1.5 rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100">
            From opportunity{estimate.estimating_request_id ? " via estimating request" : ""} — open pipeline record
          </a>
        </div>
      )}

      {/* Watch rule (#349): "tell me when this estimate is approved" — the
          rule persists in GlobalSettings and `check_watches` surfaces hits. */}
      {/* Bulk re-markup flag (#145): when the admin changes this estimate's
          pricing tier, open estimates get pricing_stale — recompute + re-save
          clears it. */}
      {estimate.pricing_stale && (
        <div className="mx-3 mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
          {estimate.pricing_stale_reason || "The pricing tier changed — recompute and re-save this estimate before sending."}
        </div>
      )}
      {estimate.id && persistedStatus !== "approved" && (
        <div className="px-3 pb-2">
          <button type="button" disabled={watchBusy} onClick={async () => {
            if (watchBusy) return;
            setWatchBusy(true);
            try {
              const sessionToken = localStorage.getItem("signShopSessionToken") || sessionStorage.getItem("signShopSessionToken") || "";
              const res = await base44.functions.invoke("opportunityWorkspaceAction", { session_token: sessionToken, action: "set_watch", entity: "AllInOneEstimate", record_id: estimate.id, field: "status", value: "approved", label: estimate.project_name || estimate.estimate_number || "this estimate" });
              if ((res?.data || res)?.success) setWatchNote("Watching — you'll see a notice when it's approved.");
            } catch (e) { setWatchNote(e?.message || "Couldn't set the watch."); } finally { setWatchBusy(false); }
          }}
            className="inline-flex items-center gap-1.5 rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50">
            <Eye className="w-3.5 h-3.5" /> Watch for approval
          </button>
          {watchNote ? <span className="ml-2 text-[10px] text-violet-600">{watchNote}</span> : null}
          <button type="button" onClick={async () => {
            try {
              const sessionToken = localStorage.getItem("signShopSessionToken") || sessionStorage.getItem("signShopSessionToken") || "";
              const res = await base44.functions.invoke("opportunityWorkspaceAction", { session_token: sessionToken, action: "export_estimate", estimate_id: estimate.id });
              const d = res?.data || res;
              if (!d?.success || !d?.bundle) throw new Error(d?.error || "Export failed.");
              const blob = new Blob([JSON.stringify(d.bundle, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `estimate-${estimate.estimate_number || estimate.id}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 5000);
            } catch (e) { window.alert(e?.message || "Export failed."); }
          }}
            className="ml-2 inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50" title="Export this estimate + parts + audit as re-importable JSON (#451)">
            Export JSON
          </button>
        </div>
      )}

      <div className="flex gap-3 px-3 pb-6">
        <AioStepRail
          activeStep={step}
          onStepClick={setStep}
          estimateNumber={estimate.estimate_number}
          stepDone={{
            details: !!(estimate.project_name && estimate.client_name),
            build: lines.length > 0,
            customer: estimate.status === "sent" || estimate.status === "approved",
          }}
          clientName={estimate.client_name}
          description={estimate.project_name}
          taxPercent={estimate.tax_percent}
          summary={{
            subtotal: pricing.subtotal,
            discount: pricing.discount,
            contingency: pricing.contingency,
            contingencyPct: estimate.contingency_percent,
            shipping: estimate.shipping_fee,
            permits: estimate.permit_fee,
            newSubtotal: pricing.subtotal - pricing.discount + pricing.contingency + pricing.fees,
            tax: pricing.tax,
            total: pricing.quoteTotal,
            deposit: pricing.deposit,
            depositPct: estimate.deposit_percent,
          }}
          onSaveProgress={handleSave}
          saving={saving}
          readOnly={readOnly}
        />

        <div className="flex-1 min-w-0 space-y-3">
          <WorkspaceNav />

          {reconciliationWarnings.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] text-amber-900">
              <div className="font-bold">Live Product pricing could not be fully verified.</div>
              <div className="mt-0.5">Saved estimate pricing was retained for {reconciliationWarnings.length} Product{reconciliationWarnings.length === 1 ? "" : "s"}. Reload to retry before accepting new pricing.</div>
              <div className="mt-1 text-[9px] text-amber-700 truncate" title={reconciliationWarnings.map((item) => `${item.product_name}: ${item.message}`).join("\n")}>
                {reconciliationWarnings.map((item) => item.product_name).join(" Â· ")}
              </div>
            </div>
          )}

          {readOnly && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[11px] text-amber-800"><LockKeyhole className="w-4 h-4" /><span><strong>Protected {persistedStatus} estimate.</strong> Viewing is available, but editing requires a recorded revision.</span></div>
              <button type="button" onClick={() => setStep(3)} className="h-[28px] px-3 rounded border border-amber-300 bg-white text-[10px] font-bold text-amber-800 hover:bg-amber-100">Open Finalize / Revise</button>
            </div>
          )}

          {quoteDaysLeft !== null && quoteDaysLeft < 0 && (
            <div className="rounded border border-red-300 bg-red-50 px-3 py-2 flex items-center gap-2 text-[11px] text-red-800">
              <AlertTriangle className="w-4 h-4" /><span><strong>Quote EXPIRED {formatQuoteIssueDate(expiresOn)}</strong> â€” re-issue or request a revision.</span>
            </div>
          )}

          {quoteDaysLeft !== null && quoteDaysLeft >= 0 && quoteDaysLeft <= 7 && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 flex items-center gap-2 text-[11px] text-amber-800">
              <Clock className="w-4 h-4" /><span><strong>Quote expires {formatQuoteIssueDate(expiresOn)}</strong> ({quoteDaysLeft} days left)</span>
            </div>
          )}

          {step === 1 && <EstimateHeaderForm estimate={estimate} onChange={patch} readOnly={readOnly} />}
          {step === 1 && <div className="mt-3"><EstimateNotesTimeline estimate={estimate} onChange={patch} readOnly={readOnly} /></div>}

          {step === 2 && (
            activeProduct ? (
              <InlineProductEditor
                line={activeProduct}
                lines={lines}
                estimateId={estimate.id}
                expectedEstimateUpdatedAt={serverUpdatedAtRef.current}
                onClose={async () => {
                  await refreshProducts();
                  setActiveProduct(null);
                }}
                onSaved={refreshProducts}
                onSwitchLine={(next) => setActiveProduct(next)}
              />
            ) : (
              <>
                {!readOnly && <div className="flex justify-end">
                  <AddProductGrid counts={counts} onAdd={addSection} onAddCustom={addCustomSection} onAddQuickProduct={addQuickProduct} />
                </div>}
                <EstimateProductsList
                  lines={lines.map((l) => ({ ...l, estimate_id: estimate.id, estimate_updated_date: serverUpdatedAtRef.current }))}
                  rawTotal={pricing.rawTotal}
                  onChange={patchLine}
                  onRemove={removeLine}
                  onEdit={(line) => setActiveProduct(line)}
                  onUpdatePrice={updateProductPrice}
                  onProductRefresh={refreshProducts}
                  onClone={cloneProduct}
                  onSaveNotes={updateProductNotes}
                  onCreateQuickProduct={createQuickProduct}
                  onPersistSettings={persistProductSettings}
                  onSplit={handleSplit}
                  readOnly={readOnly}
                />
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setClipboardOpen(true)}
                    disabled={readOnly}
                    className="h-[32px] px-3 inline-flex items-center gap-1.5 rounded-sm border border-gray-300 bg-white text-gray-700 text-[12px] font-semibold shadow-sm hover:bg-gray-100 disabled:opacity-40"
                    title="Open 30-day estimator clipboard"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5 text-gray-500" /> Clipboard
                  </button>
                  <button
                    type="button"
                    onClick={repriceAllProducts}
                    disabled={readOnly || saving || trashing || duplicating || refreshing}
                    aria-label="Reprice all products against current Master Inventory"
                    title="Re-run current live pricing across every Product in this estimate"
                    className="h-[32px] px-3 inline-flex items-center gap-1.5 rounded-sm border border-gray-300 bg-white text-gray-700 text-[12px] font-semibold shadow-sm hover:bg-gray-100 disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "Repricing…" : "Reprice products"}
                  </button>
                  {!readOnly && <AddProductGrid counts={counts} onAdd={addSection} onAddCustom={addCustomSection} onAddQuickProduct={addQuickProduct} />}
                </div>
              </>
            )
          )}

          {step === 3 && (
            <>
              {estimate.status !== "cancelled" && !estimate.work_order_id && (
                <button
                  onClick={() => setShowCancel(true)}
                  disabled={!!openRevision}
                  className="w-full flex items-center gap-2 px-3 py-2 mb-3 bg-white border border-gray-300 rounded-sm hover:bg-gray-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  title={openRevision ? "Save the open revision before cancelling this estimate." : "Cancel Estimate"}
                >
                  <FileMinus className="w-4 h-4" style={{ color: "#8b1e1e" }} />
                  <span className="text-sm font-medium text-gray-800">{openRevision ? "Save Revision Before Cancelling" : "Cancel Estimate"}</span>
                </button>
              )}
              {estimate.status !== "cancelled" && !estimate.work_order_id && (
                <button
                  onClick={handleMoveToTrash}
                  disabled={!!openRevision || trashing}
                  className="w-full flex items-center gap-2 px-3 py-2 mb-3 bg-white border border-red-200 rounded-sm hover:bg-red-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  title={openRevision ? "Save the open revision before moving this estimate to Trash." : "Move to Trash"}
                >
                  <Trash2 className="w-4 h-4" style={{ color: "#8b1e1e" }} />
                  <span className="text-sm font-medium text-gray-800">{trashing ? "Moving to Trashâ€¦" : "Move to Trash"}</span>
                </button>
              )}
              {estimate.status !== "cancelled" && estimate.work_order_id && (
                <div className="w-full flex items-start gap-2 px-3 py-2 mb-3 bg-gray-50 border border-gray-200 rounded-sm text-left">
                  <LockKeyhole className="w-4 h-4 mt-0.5 text-gray-500 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-gray-800">Cancellation managed from the Work Order</div>
                    <div className="mt-0.5 text-[10px] text-gray-500">This estimate has already been converted. Cancel or close the linked job in the workflow so the production record is not left active while its source estimate is cancelled.</div>
                  </div>
                </div>
              )}
              <EstimateRevisionPanel
                estimate={estimate}
                persistedEstimate={persistedEstimate}
                openRevision={openRevision}
                onStartRevision={handleStartRevision}
                onChange={patch}
                onRetryPipelineSync={handleRetryPipelineSync}
                retryingPipelineSync={saving}
                onRepairConversionTracking={handleRepairConversionTracking}
                repairingConversionTracking={repairingConversionTracking}
                refreshKey={revisionRefreshKey}
              />
              <EstimateQuoteDeliveryPanel estimate={estimate} refreshKey={deliveryRefreshKey + revisionRefreshKey} />
              <EstimateAcceptancePanel
                estimate={estimate}
                persistedEstimate={persistedEstimate}
                onRecordAcceptance={handleRecordAcceptance}
                refreshKey={revisionRefreshKey + deliveryRefreshKey}
                isRegistered={isRegistered}
              />
              <EstimateActivityPanel estimate={estimate} refreshKey={revisionRefreshKey + deliveryRefreshKey} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <PricingSummary estimate={estimate} pricing={pricing} onChange={patch} readOnly={readOnly} />
                <ConvertToWorkOrder
                  estimate={estimate}
                  pricing={pricing}
                  onConverted={(woId) => {
                    const converted = { ...estimate, work_order_id: woId, status: "approved", edit_reason: "" };
                    setEstimate(converted);
                    setPersistedEstimate(converted);
                    setRevisionRefreshKey((value) => value + 1);
                  }}
                  disabled={!!openRevision || !!estimate.pipeline_sync_pending}
                  disabledReason={estimate.pipeline_sync_pending ? "Retry Pipeline Sync Before Converting" : "Save Revision First"}
                  persistedStatus={persistedStatus}
                  sessionToken={sessionToken}
                />
              </div>
              <CustomerQuotePanel
                estimate={estimate}
                pricing={pricing}
                onChange={patch}
                readOnly={readOnly}
                revisionInProgress={!!openRevision}
                persistedStatus={persistedStatus}
                sessionToken={sessionToken}
                onQuoteDelivered={handleQuoteDelivered}
                onDeliveryLogged={() => setDeliveryRefreshKey((value) => value + 1)}
                onDeliveryEvidenceReady={handleDeliveryEvidenceReady}
              />
            </>
          )}

          <WorkspaceNav compact />
        </div>
      </div>

      <ClipboardManagerModal
        open={clipboardOpen}
        estimateId={estimate.id}
        expectedEstimateUpdatedAt={serverUpdatedAtRef.current}
        lines={lines}
        onClose={() => setClipboardOpen(false)}
        onPasted={refreshProducts}
      />

      <CancelEstimateModal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={handleCancel}
        estimateName={estimate.project_name}
      />

      <MergeEstimateDialog
        open={mergeOpen}
        currentEstimateId={estimate.id}
        onClose={() => setMergeOpen(false)}
        onMerge={handleMerge}
      />

      <AlertDialog open={duplicateChoiceOpen} onOpenChange={setDuplicateChoiceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate this estimate?</AlertDialogTitle>
            <AlertDialogDescription>
              Choose whether the copy gets a new estimate number or keeps {estimate.estimate_number ? `#${estimate.estimate_number}` : "the same number"} (useful when reworking the same quote). Either way it starts as a new draft and the original is unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => runDuplicate(true)}>Keep same number</AlertDialogAction>
            <AlertDialogAction onClick={() => runDuplicate(false)}>New number</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}