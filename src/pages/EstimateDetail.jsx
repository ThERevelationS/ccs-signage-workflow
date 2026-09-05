import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardPaste, FileMinus, LockKeyhole } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AioEstimateHeader from "@/components/estimator/aio/AioEstimateHeader";
import AioStepRail from "@/components/estimator/aio/AioStepRail";
import AddProductGrid from "@/components/estimator/aio/AddProductGrid";
import EstimateProductsList from "@/components/estimator/aio/EstimateProductsList";
import InlineProductEditor from "@/components/estimator/aio/InlineProductEditor";
import EstimateHeaderForm from "@/components/estimator/EstimateHeaderForm";
import PricingSummary from "@/components/estimator/PricingSummary";
import CustomerQuotePanel from "@/components/estimator/CustomerQuotePanel";
import ConvertToWorkOrder from "@/components/estimator/ConvertToWorkOrder";
import CancelEstimateModal from "@/components/estimator/aio/CancelEstimateModal";
import ClipboardManagerModal from "@/components/estimator/aio/ClipboardManagerModal";
import { computePricing } from "@/components/estimator/aioPricing";
import { acceptedInternalEstimateCost } from "@/components/estimator/customerPricing";
import { refreshSectionSnapshots, deleteOwnedSection } from "@/components/estimator/useSectionSync";
import {
  acceptBuilderPrice,
  deleteBuilderProductCascade,
  ensureBuilderProductForLine,
  ensureEstimateBuilderProducts,
} from "@/components/estimator/builder/builderService";
import { refreshManualProductPricing } from "@/components/estimator/parts/customProductService";
import { cloneProductInEstimate, saveProductNotes, saveProductSettings } from "@/components/estimator/products/productOperations";
import { instantiateQuickProduct, resumeQuickProductInsertion, saveProductAsQuickProduct } from "@/components/estimator/products/quickProductService";
import { addBlankProduct, resumeBlankProductInsertion } from "@/components/estimator/products/blankProductService";
import { resumeIndependentPartGroupMove } from "@/components/estimator/parts/partGroupService";
import { estimateCustomerChangedKeys, syncEstimateEverywhere } from "@/components/estimator/customerSync";
import EstimateRevisionPanel from "@/components/estimator/EstimateRevisionPanel";
import EstimateAcceptancePanel from "@/components/estimator/EstimateAcceptancePanel";
import EstimateQuoteDeliveryPanel from "@/components/estimator/EstimateQuoteDeliveryPanel";
import { isEstimateProtected, requiresEstimateLifecycleReason } from "@/components/estimator/estimateLifecycle";
import { attachQuoteDeliveryEvidenceToIssuanceRevision, completeEstimateRevision, ensureEstimateLifecycleRevision, getOpenEstimateRevision, startEstimateRevision } from "@/components/estimator/estimateRevisionService";
import { localDateStamp, quoteIssueKey, resolveQuoteIssueMetadata } from "@/components/estimator/quoteLifecycle";
import { hasEstimateVersionConflict } from "@/components/estimator/estimateConcurrency";
import { assertEstimateProductMutationAllowed, getPendingEstimatePriceAcceptance } from "@/components/estimator/estimateMutationGuard";

const STEP_TITLES = {
  1: "Step 1: Estimate Details",
  2: "Step 2: Edit Products",
  3: "Step 3: Finalize Estimate",
};

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
                              : entry.pending?.kind === "builder_quick_product_insert"
                        ? entry.pending?.source_type === "product_clone" ? "Resume Product Clone" : "Resume Quick Product"
                        : "Resume Price Update";
  throw new Error(`“${name}” has a Builder mutation recovery pending. Use ${resumeLabel} before ${action}.`);
}

export default function EstimateDetail() {
  const navigate = useNavigate();
  const id = new URLSearchParams(window.location.search).get("id");
  const [estimate, setEstimate] = useState(null);
  const [persistedEstimate, setPersistedEstimate] = useState(null);
  const [openRevision, setOpenRevision] = useState(null);
  const [revisionRefreshKey, setRevisionRefreshKey] = useState(0);
  const [deliveryRefreshKey, setDeliveryRefreshKey] = useState(0);
  const [repairingConversionTracking, setRepairingConversionTracking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(2);
  const [showCancel, setShowCancel] = useState(false);
  const [activeProduct, setActiveProduct] = useState(null);
  const [clipboardOpen, setClipboardOpen] = useState(false);
  const [reconciliationWarnings, setReconciliationWarnings] = useState([]);
  // Tracks the exact server version this browser session last read or wrote.
  // Keep it separate from persistedEstimate because Product operations may save
  // immediately while the lifecycle baseline intentionally remains older.
  const serverUpdatedAtRef = useRef("");
  // Same-page recovery anchor for a lifecycle transition whose estimate write
  // succeeds but audit/pipeline work fails afterward. This preserves the true
  // pre-transition snapshot and a stable idempotency key across retries.
  const pendingLifecycleBaselineRef = useRef(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    base44.entities.AllInOneEstimate.get(id).then(async (res) => {
      const warnings = [];
      const withBuilders = await ensureEstimateBuilderProducts(res, {
        strictReconciliation: true,
        onWarning: (warning) => warnings.push(warning),
      });
      for (const line of withBuilders.line_items || []) {
        if (line.module_key === "custom" && line.builder_product_id) {
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
      const current = await base44.entities.AllInOneEstimate.get(id);
      const line_items = await refreshSectionSnapshots(current.line_items);
      const loaded = { ...current, line_items };
      const revision = await getOpenEstimateRevision(id);
      serverUpdatedAtRef.current = current.updated_date || "";
      setEstimate(loaded);
      setPersistedEstimate(loaded);
      setOpenRevision(revision);
      setReconciliationWarnings(warnings);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="p-10 text-center text-gray-400">Loading estimate…</div>;
  if (!estimate) return <div className="p-10 text-center text-gray-500">Estimate not found.</div>;

  const pricing = computePricing(estimate);
  const lines = estimate.line_items || [];
  const persistedStatus = persistedEstimate?.status || estimate.status || "draft";
  const readOnly = isEstimateProtected(persistedStatus) && !openRevision;

  const patch = (changes) => setEstimate((prev) => ({ ...prev, ...changes }));

  const patchLine = (index, changes) =>
    setEstimate((prev) => ({
      ...prev,
      line_items: prev.line_items.map((l, i) => (i === index ? { ...l, ...changes } : l)),
    }));

  const rememberServerVersion = async (record = null) => {
    let current = record;
    if (!current?.updated_date) current = await base44.entities.AllInOneEstimate.get(estimate.id);
    if (current?.updated_date) serverUpdatedAtRef.current = current.updated_date;
    return current;
  };

  const hasServerConflict = (current) => hasEstimateVersionConflict(
    serverUpdatedAtRef.current,
    current?.updated_date
  );

  const loadCurrentProductMutationEstimate = async () => {
    const current = await base44.entities.AllInOneEstimate.get(estimate.id);
    if (!current) throw new Error("This estimate no longer exists.");
    await assertEstimateProductMutationAllowed(current, { expectedUpdatedAt: serverUpdatedAtRef.current });
    return current;
  };

  const refreshProducts = async () => {
    const current = await base44.entities.AllInOneEstimate.get(estimate.id);
    const warnings = [];
    const withBuilders = await ensureEstimateBuilderProducts(current, {
      strictReconciliation: true,
      onWarning: (warning) => warnings.push(warning),
    });
    for (const line of withBuilders.line_items || []) {
      if (line.module_key === "custom" && line.builder_product_id) {
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
    const refreshed = await base44.entities.AllInOneEstimate.get(estimate.id);
    const line_items = await refreshSectionSnapshots(refreshed.line_items);
    serverUpdatedAtRef.current = refreshed.updated_date || serverUpdatedAtRef.current;
    setEstimate((prev) => ({ ...prev, ...refreshed, line_items }));
    setReconciliationWarnings(warnings);
  };

  const removeLine = async (index) => {
    if (readOnly) return;
    const loadedLine = estimate.line_items[index];
    if (!loadedLine) return;
    const current = await loadCurrentProductMutationEstimate();
    const matches = (line) =>
      (loadedLine.line_id && line.line_id === loadedLine.line_id) ||
      (loadedLine.builder_product_id && line.builder_product_id === loadedLine.builder_product_id) ||
      (loadedLine.project_id && line.project_id === loadedLine.project_id);
    const line = (current.line_items || []).find(matches);
    if (!line) throw new Error("This Product is no longer part of the estimate. Reload before removing it.");
    const line_items = (current.line_items || []).filter((item) => !matches(item));
    const updateResult = await base44.entities.AllInOneEstimate.update(estimate.id, { line_items });
    await rememberServerVersion(updateResult);
    setEstimate((prev) => ({ ...prev, line_items }));
    await deleteOwnedSection(line);
    if (line.builder_product_id) await deleteBuilderProductCascade(line.builder_product_id);
  };

  const addSection = async (mod) => {
    if (readOnly) return;
    const current = await loadCurrentProductMutationEstimate();
    const sectionName = `${current.project_name} — ${mod.label}`;
    let created = null;
    let builderResult = null;
    let linked = false;
    try {
      created = await base44.entities[mod.entity].create({
        project_name: sectionName,
        client_name: current.client_name,
        customer_id: current.customer_id,
        estimate_number: current.estimate_number,
      });
      const provisionalLine = {
        module_key: mod.key,
        project_id: created.id,
        project_name: sectionName,
        builder_name: mod.label,
        client_product_name: sectionName,
        client_name: current.client_name,
        total_snapshot: 0,
        live_total_snapshot: 0,
        customer_price_snapshot: 0,
        live_customer_price_snapshot: 0,
        price_state: "unchecked",
        adjustment_percent: 0,
        section_status: "in_progress",
        customer_quantity: 1,
        include_in_customer: true,
        owned: true,
        linked_date: new Date().toISOString(),
      };
      builderResult = await ensureBuilderProductForLine({
        estimate: current,
        line: provisionalLine,
        isNew: true,
      });
      const line_items = [...(current.line_items || []), builderResult.line];
      const updateResult = await base44.entities.AllInOneEstimate.update(estimate.id, { line_items });
      linked = true;
      await rememberServerVersion(updateResult);
      setEstimate((prev) => ({ ...prev, line_items }));
      setActiveProduct({ ...builderResult.line, estimate_id: estimate.id });
    } catch (error) {
      if (!linked) {
        if (builderResult?.builderProduct?.id) await deleteBuilderProductCascade(builderResult.builderProduct.id);
        if (created?.id) await base44.entities[mod.entity].delete(created.id).catch(() => null);
      }
      throw error;
    }
  };

  const addCustomSection = async (name = "Custom Product") => {
    if (readOnly) return;
    const current = await loadCurrentProductMutationEstimate();
    let result = null;
    let linked = false;
    try {
      result = await createCustomProduct({
        estimate: current,
        name,
        expectedEstimateUpdatedAt: current.updated_date || serverUpdatedAtRef.current,
      });
      const line_items = [...(current.line_items || []), result.line];
      const updateResult = await base44.entities.AllInOneEstimate.update(estimate.id, { line_items });
      linked = true;
      await rememberServerVersion(updateResult);
      setEstimate((prev) => ({ ...prev, line_items }));
    } catch (error) {
      if (!linked && result?.builderProduct?.id) await deleteBuilderProductCascade(result.builderProduct.id);
      throw error;
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
    const current = await base44.entities.AllInOneEstimate.get(estimate.id);
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
        : line?.price_acceptance_pending?.kind === "builder_part_group_move"
          ? await resumeIndependentPartGroupMove({ estimateId: estimate.id, lineId: line.line_id || "" })
          : await acceptBuilderPrice({ estimateId: estimate.id, line, expectedEstimateUpdatedAt: serverUpdatedAtRef.current });
      if (result?.blocked && result.reason === "detached_parts") {
        const names = (result.detachedParts || [])
          .map((part) => part.part_name || part.inventory_item_name)
          .filter(Boolean);
        window.alert(
          `Price update blocked. ${result.detachedCount} Part${result.detachedCount === 1 ? "" : "s"} must be reattached or resolved first.${names.length ? `\n\n${names.map((name) => `• ${name}`).join("\n")}` : ""}\n\nThe frozen product price has not changed.`
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
                : line?.price_acceptance_pending?.kind === "builder_quick_product_insert"
          ? line?.price_acceptance_pending?.source_type === "product_clone" ? "Resume Product Clone" : "Resume Quick Product"
          : "Resume Price Update";
      window.alert(`${error?.message || "Product pricing/recovery could not be completed."}\n\nThe estimate was refreshed. If this operation had already started, use ${recoveryLabel} to safely continue it.`);
    }
  };

  const handleStartRevision = async (reason) => {
    const current = await base44.entities.AllInOneEstimate.get(estimate.id);
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
      const before = await base44.entities.AllInOneEstimate.get(estimate.id);
      assertNoPendingPriceAcceptance(before, "saving the estimate");
      if (hasServerConflict(before)) {
        window.alert("This estimate changed in another session after this page last read or saved it. Your local changes were not written. Reload the estimate and reconcile the newer server changes before saving.");
        return;
      }
      const { id: _id, created_date: _created_date, updated_date: _updated_date, created_by_id: _created_by_id, created_by: _created_by, ...data } = estimate;
      const internalCost = acceptedInternalEstimateCost(estimate.line_items || []);
      const revisionBaseVersion = Math.max(0, Math.floor(Number(
        openRevision?.estimate_snapshot_before?.quote_version ?? before.quote_version ?? 0
      )));
      const completingSentRevision = !!openRevision &&
        before.status === "sent" &&
        estimate.status === "sent" &&
        Math.max(0, Math.floor(Number(before.quote_version || 0))) === revisionBaseVersion;
      const quoteIssueMetadata = resolveQuoteIssueMetadata({
        previousStatus: before.status || "",
        nextStatus: estimate.status || "",
        currentVersion: before.quote_version || 0,
        today: localDateStamp(),
        completingSentRevision,
      });
      if (lifecycleReasonRequired) {
        const pending = pendingLifecycleBaselineRef.current;
        if (!pending || pending.nextStatus !== estimate.status || pending.reason !== lifecycleReason) {
          pendingLifecycleBaselineRef.current = {
            estimateBefore: before,
            nextStatus: estimate.status,
            reason: lifecycleReason,
            key: `status_transition:${estimate.id}:${before.updated_date || "unknown"}:${before.status || "draft"}:${estimate.status}:${Number(quoteIssueMetadata.quote_version ?? before.quote_version ?? 0)}`,
          };
        }
      }
      const persistedData = {
        ...data,
        ...quoteIssueMetadata,
        edit_reason: lifecycleReasonRequired ? lifecycleReason : "",
        total_cost: internalCost,
        quote_total: pricing.quoteTotal,
      };
      const updateResult = await base44.entities.AllInOneEstimate.update(estimate.id, persistedData);
      const refreshed = updateResult?.updated_date ? updateResult : await base44.entities.AllInOneEstimate.get(estimate.id);
      let saved = { ...estimate, ...persistedData, ...(refreshed || {}), id: estimate.id };
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
          quoteTotal: pricing.quoteTotal,
          internalCost,
          workOrderId: saved.work_order_id || "",
        });
      } else if (lifecycleReasonRequired) {
        await ensureEstimateLifecycleRevision({
          idempotencyKey: transitionIdempotencyKey,
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
        const customerChangedKeys = estimateCustomerChangedKeys(before, saved);
        await syncEstimateEverywhere(saved, {
          previousEstimateStatus: syncPreviousStatus,
          syncCustomer: customerChangedKeys.length > 0,
          customerChangedKeys,
        });
        const cleanup = {};
        if (lifecycleReasonRequired && saved.edit_reason) cleanup.edit_reason = "";
        if (saved.pipeline_sync_pending) cleanup.pipeline_sync_pending = false;
        if (saved.pipeline_sync_error) cleanup.pipeline_sync_error = "";
        if (Object.keys(cleanup).length) {
          const clearResult = await base44.entities.AllInOneEstimate.update(estimate.id, cleanup);
          const cleared = clearResult?.updated_date ? clearResult : await base44.entities.AllInOneEstimate.get(estimate.id);
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
          const recoveryResult = await base44.entities.AllInOneEstimate.update(estimate.id, recoveryPatch);
          const recovered = recoveryResult?.updated_date ? recoveryResult : await base44.entities.AllInOneEstimate.get(estimate.id);
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
      const current = await base44.entities.AllInOneEstimate.get(estimate.id);
      if (hasServerConflict(current)) {
        window.alert("This estimate changed in another session. Reload before retrying Sales Pipeline synchronization.");
        return;
      }

      try {
        // No historical transition guess is needed here. Versioned quotes recover
        // their first-sent date from quote_issue_date; legacy Quote Version 0 data
        // is intentionally left untouched.
        await syncEstimateEverywhere(current, { previousEstimateStatus: "", syncCustomer: false });
      } catch (syncError) {
        const message = String(syncError?.message || "Customer/Sales Pipeline synchronization failed.");
        const errorResult = await base44.entities.AllInOneEstimate.update(estimate.id, {
          pipeline_sync_pending: true,
          pipeline_sync_error: message,
        }).catch(() => null);
        const failed = errorResult?.updated_date ? errorResult : await base44.entities.AllInOneEstimate.get(estimate.id).catch(() => current);
        const failedState = { ...current, ...(failed || {}), pipeline_sync_pending: true, pipeline_sync_error: message };
        await rememberServerVersion(failedState);
        setEstimate(failedState);
        setPersistedEstimate(failedState);
        window.alert(`Sales Pipeline synchronization is still pending.\n\n${message}`);
        return;
      }

      const clearResult = await base44.entities.AllInOneEstimate.update(estimate.id, {
        pipeline_sync_pending: false,
        pipeline_sync_error: "",
      });
      const cleared = clearResult?.updated_date ? clearResult : await base44.entities.AllInOneEstimate.get(estimate.id);
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
      const current = await base44.entities.AllInOneEstimate.get(estimate.id);
      if (!current?.work_order_id) throw new Error("This estimate is no longer linked to a Work Order. Reload the estimate before repairing conversion tracking.");
      if (current.work_order_id !== estimate.work_order_id) throw new Error("The linked Work Order changed in another session. Reload before repairing conversion tracking.");
      const workOrder = await base44.entities.WorkOrder.get(current.work_order_id).catch(() => null);
      if (!workOrder?.id) throw new Error("The linked Work Order could not be found. Conversion tracking was not changed.");

      const internalCost = Number.isFinite(Number(current.total_cost))
        ? Number(current.total_cost)
        : acceptedInternalEstimateCost(current.line_items || []);
      const quoteTotal = Number(current.quote_total || 0);
      const conversionAfter = { ...current, status: "approved", work_order_id: workOrder.id, edit_reason: "" };
      const conversionBefore = { ...conversionAfter, work_order_id: "" };
      await ensureEstimateLifecycleRevision({
        idempotencyKey: `work_order_conversion:${workOrder.id}`,
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
    const before = await base44.entities.AllInOneEstimate.get(estimate.id);
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
    const updateResult = await base44.entities.AllInOneEstimate.update(estimate.id, persistedData);
    const refreshed = updateResult?.updated_date ? updateResult : await base44.entities.AllInOneEstimate.get(estimate.id);
    let saved = { ...estimate, ...persistedData, ...(refreshed || {}), id: estimate.id };
    await rememberServerVersion(saved);

    const warnings = [];
    const deliveryIdentity = deliveryId || gmailMessageId || quoteIssueKey(estimate.id, quoteVersion);
    try {
      await ensureEstimateLifecycleRevision({
        idempotencyKey: `quote_issuance:${deliveryIdentity}`,
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
      await syncEstimateEverywhere(saved, { previousEstimateStatus: sourceStatus, syncCustomer: false });
      if (saved.pipeline_sync_pending || saved.pipeline_sync_error) {
        const clearResult = await base44.entities.AllInOneEstimate.update(estimate.id, {
          pipeline_sync_pending: false,
          pipeline_sync_error: "",
        });
        const cleared = clearResult?.updated_date ? clearResult : await base44.entities.AllInOneEstimate.get(estimate.id);
        saved = { ...saved, ...(cleared || {}), pipeline_sync_pending: false, pipeline_sync_error: "" };
        await rememberServerVersion(saved);
      }
    } catch (syncError) {
      const message = String(syncError?.message || "Customer/Sales Pipeline synchronization failed.");
      const recoveryResult = await base44.entities.AllInOneEstimate.update(estimate.id, {
        pipeline_sync_pending: true,
        pipeline_sync_error: message,
      }).catch(() => null);
      const recovered = recoveryResult?.updated_date ? recoveryResult : await base44.entities.AllInOneEstimate.get(estimate.id).catch(() => saved);
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
    const before = await base44.entities.AllInOneEstimate.get(estimate.id);
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
        const approvalResult = await base44.entities.AllInOneEstimate.update(estimate.id, { status: "approved", edit_reason: "" });
        const approved = approvalResult?.updated_date ? approvalResult : await base44.entities.AllInOneEstimate.get(estimate.id);
        after = { ...after, ...(approved || {}), status: "approved", edit_reason: "" };
        await rememberServerVersion(after);
      }

      // The immutable acceptance is the idempotency anchor for exactly one
      // Sent → Approved lifecycle revision.
      await ensureEstimateLifecycleRevision({
        idempotencyKey: `customer_acceptance:${acceptance.id}`,
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
      const reflected = await base44.entities.AllInOneEstimate.get(estimate.id).catch(() => after);
      const reflectedState = { ...after, ...(reflected || {}) };
      await rememberServerVersion(reflectedState);
      setEstimate(reflectedState);
      setPersistedEstimate(reflectedState);
      setRevisionRefreshKey((value) => value + 1);
      throw new Error(`Customer acceptance is recorded, but approval lifecycle tracking could not be finalized: ${error?.message || "unknown error"}`);
    }

    let syncWarning = "";
    try {
      await syncEstimateEverywhere(after, { previousEstimateStatus: "sent", syncCustomer: false });
      if (after.pipeline_sync_pending || after.pipeline_sync_error) {
        const clearResult = await base44.entities.AllInOneEstimate.update(estimate.id, {
          pipeline_sync_pending: false,
          pipeline_sync_error: "",
        });
        const cleared = clearResult?.updated_date ? clearResult : await base44.entities.AllInOneEstimate.get(estimate.id);
        after = { ...after, ...(cleared || {}), pipeline_sync_pending: false, pipeline_sync_error: "" };
        await rememberServerVersion(after);
      }
    } catch (syncError) {
      const message = String(syncError?.message || "Customer/Sales Pipeline synchronization failed.");
      const recoveryResult = await base44.entities.AllInOneEstimate.update(estimate.id, {
        pipeline_sync_pending: true,
        pipeline_sync_error: message,
      }).catch(() => null);
      const recovered = recoveryResult?.updated_date ? recoveryResult : await base44.entities.AllInOneEstimate.get(estimate.id).catch(() => after);
      after = { ...after, ...(recovered || {}), pipeline_sync_pending: true, pipeline_sync_error: message };
      await rememberServerVersion(after);
      syncWarning = `Customer acceptance and approval are saved, but Sales Pipeline synchronization is pending: ${message}`;
    }

    const refreshed = await base44.entities.AllInOneEstimate.get(estimate.id).catch(() => after);
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
    const before = await base44.entities.AllInOneEstimate.get(estimate.id);
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
    const cancellationResult = await base44.entities.AllInOneEstimate.update(estimate.id, {
      status: "cancelled",
      cancel_reason: reason,
      edit_reason: "",
    });
    const cancelled = cancellationResult?.updated_date ? cancellationResult : await base44.entities.AllInOneEstimate.get(estimate.id);
    let after = { ...before, ...(cancelled || {}), status: "cancelled", cancel_reason: reason, edit_reason: "" };
    await rememberServerVersion(after);

    try {
      await ensureEstimateLifecycleRevision({
        idempotencyKey: `cancel:${estimate.id}:${before.updated_date || "unknown"}`,
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
      await syncEstimateEverywhere(after, { previousEstimateStatus: before.status || "", syncCustomer: false });
    } catch (syncError) {
      const message = String(syncError?.message || "Customer/Sales Pipeline synchronization failed.");
      const recoveryResult = await base44.entities.AllInOneEstimate.update(estimate.id, {
        pipeline_sync_pending: true,
        pipeline_sync_error: message,
      }).catch(() => null);
      const recovered = recoveryResult?.updated_date ? recoveryResult : await base44.entities.AllInOneEstimate.get(estimate.id).catch(() => after);
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

  const StepNav = () => (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-bold text-gray-900">{STEP_TITLES[step]}</span>
        {step === 2 && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">
            {lines.length} products
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className="h-[28px] px-3 rounded border border-gray-200 bg-white text-[12px] font-semibold text-gray-600 disabled:opacity-40"
        >
          ← Previous Step
        </button>
        <button
          onClick={() => setStep(Math.min(3, step + 1))}
          disabled={step === 3}
          className="h-[28px] px-3 rounded bg-lime-200 border border-lime-300 text-[12px] font-semibold text-gray-800 disabled:opacity-40"
        >
          Next Step →
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-full bg-gray-50">
      <AioEstimateHeader
        title={estimate.project_name || "Estimate"}
        subtitle={`One page, one set of project info, every estimator. · Totals synced ${new Date().toLocaleTimeString()}`}
        status={estimate.status || "draft"}
        quoteTotal={pricing.quoteTotal}
        onSave={handleSave}
        saving={saving}
        readOnly={readOnly}
      />

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
          <StepNav />

          {reconciliationWarnings.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] text-amber-900">
              <div className="font-bold">Live Product pricing could not be fully verified.</div>
              <div className="mt-0.5">Saved estimate pricing was retained for {reconciliationWarnings.length} Product{reconciliationWarnings.length === 1 ? "" : "s"}. Reload to retry before accepting new pricing.</div>
              <div className="mt-1 text-[9px] text-amber-700 truncate" title={reconciliationWarnings.map((item) => `${item.product_name}: ${item.message}`).join("\n")}>
                {reconciliationWarnings.map((item) => item.product_name).join(" · ")}
              </div>
            </div>
          )}

          {readOnly && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[11px] text-amber-800"><LockKeyhole className="w-4 h-4" /><span><strong>Protected {persistedStatus} estimate.</strong> Viewing is available, but editing requires a recorded revision.</span></div>
              <button type="button" onClick={() => setStep(3)} className="h-[28px] px-3 rounded border border-amber-300 bg-white text-[10px] font-bold text-amber-800 hover:bg-amber-100">Open Finalize / Revise</button>
            </div>
          )}

          {step === 1 && <EstimateHeaderForm estimate={estimate} onChange={patch} readOnly={readOnly} />}

          {step === 2 && (
            activeProduct ? (
              <InlineProductEditor
                line={activeProduct}
                estimateId={estimate.id}
                expectedEstimateUpdatedAt={serverUpdatedAtRef.current}
                onClose={async () => {
                  await refreshProducts();
                  setActiveProduct(null);
                }}
                onSaved={refreshProducts}
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
              />
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
                />
              </div>
              <CustomerQuotePanel
                estimate={estimate}
                pricing={pricing}
                onChange={patch}
                readOnly={readOnly}
                revisionInProgress={!!openRevision}
                persistedStatus={persistedStatus}
                onQuoteDelivered={handleQuoteDelivered}
                onDeliveryLogged={() => setDeliveryRefreshKey((value) => value + 1)}
                onDeliveryEvidenceReady={handleDeliveryEvidenceReady}
              />
            </>
          )}

          <StepNav />
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
    </div>
  );
}