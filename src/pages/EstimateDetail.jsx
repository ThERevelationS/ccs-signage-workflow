import { useState, useEffect } from "react";
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
import { createCustomProduct, refreshManualProductPricing } from "@/components/estimator/parts/customProductService";
import { cloneProductInEstimate, saveProductNotes, saveProductSettings } from "@/components/estimator/products/productOperations";
import { instantiateQuickProduct, saveProductAsQuickProduct } from "@/components/estimator/products/quickProductService";
import { syncEstimateEverywhere } from "@/components/estimator/customerSync";
import EstimateRevisionPanel from "@/components/estimator/EstimateRevisionPanel";
import { isEstimateProtected, requiresEstimateLifecycleReason } from "@/components/estimator/estimateLifecycle";
import { completeEstimateRevision, getOpenEstimateRevision, recordEstimateLifecycleRevision, startEstimateRevision } from "@/components/estimator/estimateRevisionService";
import { localDateStamp, resolveQuoteIssueMetadata } from "@/components/estimator/quoteLifecycle";

const STEP_TITLES = {
  1: "Step 1: Estimate Details",
  2: "Step 2: Edit Products",
  3: "Step 3: Finalize Estimate",
};

export default function EstimateDetail() {
  const navigate = useNavigate();
  const id = new URLSearchParams(window.location.search).get("id");
  const [estimate, setEstimate] = useState(null);
  const [persistedEstimate, setPersistedEstimate] = useState(null);
  const [openRevision, setOpenRevision] = useState(null);
  const [revisionRefreshKey, setRevisionRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(2);
  const [showCancel, setShowCancel] = useState(false);
  const [activeProduct, setActiveProduct] = useState(null);
  const [clipboardOpen, setClipboardOpen] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    base44.entities.AllInOneEstimate.get(id).then(async (res) => {
      const withBuilders = await ensureEstimateBuilderProducts(res);
      for (const line of withBuilders.line_items || []) {
        if (line.module_key === "custom" && line.builder_product_id) {
          await refreshManualProductPricing(line.builder_product_id);
        }
      }
      const current = await base44.entities.AllInOneEstimate.get(id);
      const line_items = await refreshSectionSnapshots(current.line_items);
      const loaded = { ...current, line_items };
      const revision = await getOpenEstimateRevision(id);
      setEstimate(loaded);
      setPersistedEstimate(loaded);
      setOpenRevision(revision);
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

  const refreshProducts = async () => {
    const current = await base44.entities.AllInOneEstimate.get(estimate.id);
    const withBuilders = await ensureEstimateBuilderProducts(current);
    for (const line of withBuilders.line_items || []) {
      if (line.module_key === "custom" && line.builder_product_id) {
        await refreshManualProductPricing(line.builder_product_id);
      }
    }
    const refreshed = await base44.entities.AllInOneEstimate.get(estimate.id);
    const line_items = await refreshSectionSnapshots(refreshed.line_items);
    setEstimate((prev) => ({ ...prev, ...refreshed, line_items }));
  };

  const removeLine = async (index) => {
    if (readOnly) return;
    const line = estimate.line_items[index];
    const line_items = estimate.line_items.filter((_, i) => i !== index);
    setEstimate((prev) => ({ ...prev, line_items }));
    await base44.entities.AllInOneEstimate.update(estimate.id, { line_items });
    await deleteOwnedSection(line);
    if (line.builder_product_id) await deleteBuilderProductCascade(line.builder_product_id);
  };

  const addSection = async (mod) => {
    if (readOnly) return;
    const sectionName = `${estimate.project_name} — ${mod.label}`;
    const created = await base44.entities[mod.entity].create({
      project_name: sectionName,
      client_name: estimate.client_name,
      customer_id: estimate.customer_id,
      estimate_number: estimate.estimate_number,
    });
    const provisionalLine = {
      module_key: mod.key,
      project_id: created.id,
      project_name: sectionName,
      builder_name: mod.label,
      client_product_name: sectionName,
      client_name: estimate.client_name,
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
    const builderResult = await ensureBuilderProductForLine({
      estimate,
      line: provisionalLine,
      isNew: true,
    });
    const line_items = [...(estimate.line_items || []), builderResult.line];
    // Persist immediately, then open the new product in the inline editor.
    await base44.entities.AllInOneEstimate.update(estimate.id, { line_items });
    setEstimate((prev) => ({ ...prev, line_items }));
    setActiveProduct({ ...builderResult.line, estimate_id: estimate.id });
  };

  const addCustomSection = async (name = "Custom Product") => {
    if (readOnly) return;
    const result = await createCustomProduct({ estimate, name });
    const line_items = [...(estimate.line_items || []), result.line];
    await base44.entities.AllInOneEstimate.update(estimate.id, { line_items });
    setEstimate((prev) => ({ ...prev, line_items }));
  };

  const cloneProduct = async (line) => {
    if (readOnly) return;
    await cloneProductInEstimate({ estimateId: estimate.id, line });
    await refreshProducts();
  };

  const updateProductNotes = async (line, notes) => {
    if (readOnly) return;
    await saveProductNotes({ estimateId: estimate.id, line, notes });
    await refreshProducts();
  };

  const persistProductSettings = async (line, index, patch) => {
    if (readOnly) return;
    patchLine(index, patch);
    const savedLine = await saveProductSettings({ estimateId: estimate.id, line, patch });
    if (savedLine) patchLine(index, savedLine);
  };

  const createQuickProduct = async (line, options) => {
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
    await instantiateQuickProduct({ estimateId: estimate.id, quickProduct });
    await refreshProducts();
  };

  const updateProductPrice = async (line) => {
    if (readOnly) return;
    const result = await acceptBuilderPrice({ estimateId: estimate.id, line });
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
  };

  const handleStartRevision = async (reason) => {
    const internalCost = acceptedInternalEstimateCost(estimate.line_items || []);
    const revision = await startEstimateRevision({
      estimate: persistedEstimate || estimate,
      reason,
      quoteTotal: pricing.quoteTotal,
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
      const before = persistedEstimate || await base44.entities.AllInOneEstimate.get(estimate.id);
      const { id: _id, created_date: _created_date, updated_date: _updated_date, created_by_id: _created_by_id, created_by: _created_by, ...data } = estimate;
      const internalCost = acceptedInternalEstimateCost(estimate.line_items || []);
      const quoteIssueMetadata = resolveQuoteIssueMetadata({
        previousStatus: before.status || "",
        nextStatus: estimate.status || "",
        currentVersion: before.quote_version || 0,
        today: localDateStamp(),
        completingSentRevision: !!openRevision,
      });
      const persistedData = {
        ...data,
        ...quoteIssueMetadata,
        edit_reason: "",
        total_cost: internalCost,
        quote_total: pricing.quoteTotal,
      };
      await base44.entities.AllInOneEstimate.update(estimate.id, persistedData);
      const saved = { ...estimate, ...persistedData, id: estimate.id };
      // Keep the shared customer record and the Sales Pipeline lead in step.
      await syncEstimateEverywhere(saved, { previousEstimateStatus: before.status || "" });

      if (openRevision) {
        await completeEstimateRevision({
          revision: openRevision,
          estimate: saved,
          quoteTotal: pricing.quoteTotal,
          internalCost,
          workOrderId: saved.work_order_id || "",
        });
        setOpenRevision(null);
        setRevisionRefreshKey((value) => value + 1);
      } else if (lifecycleReasonRequired) {
        await recordEstimateLifecycleRevision({
          estimateBefore: before,
          estimateAfter: saved,
          reason: lifecycleReason,
          revisionType: "status_transition",
          quoteTotalBefore: before.quote_total,
          quoteTotalAfter: pricing.quoteTotal,
          internalCostBefore: before.total_cost,
          internalCostAfter: internalCost,
          workOrderId: saved.work_order_id || "",
        });
        setRevisionRefreshKey((value) => value + 1);
      }

      setEstimate(saved);
      setPersistedEstimate(saved);
    } finally {
      setSaving(false);
    }
  };

  const handleQuoteDelivered = async ({ recipientEmail, issueMetadata }) => {
    const before = persistedEstimate || await base44.entities.AllInOneEstimate.get(estimate.id);
    const sourceStatus = before.status || "draft";
    const issuingNewQuote = ["draft", "calculated"].includes(sourceStatus);
    if (!issuingNewQuote) return {};
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
    await base44.entities.AllInOneEstimate.update(estimate.id, persistedData);
    const saved = { ...estimate, ...persistedData, id: estimate.id };
    await syncEstimateEverywhere(saved, { previousEstimateStatus: sourceStatus });
    await recordEstimateLifecycleRevision({
      estimateBefore: before,
      estimateAfter: saved,
      reason: `Quote emailed to ${recipientEmail}`,
      revisionType: "status_transition",
      quoteTotalBefore: before.quote_total,
      quoteTotalAfter: pricing.quoteTotal,
      internalCostBefore: before.total_cost,
      internalCostAfter: internalCost,
      workOrderId: saved.work_order_id || "",
    });

    setEstimate(saved);
    setPersistedEstimate(saved);
    setRevisionRefreshKey((value) => value + 1);
    return {};
  };

  const handleCancel = async (reason) => {
    if (openRevision) {
      window.alert("Save the open estimate revision before cancelling the estimate.");
      return;
    }
    const before = await base44.entities.AllInOneEstimate.get(estimate.id);
    const after = { ...before, status: "cancelled", cancel_reason: reason };
    await base44.entities.AllInOneEstimate.update(estimate.id, {
      status: "cancelled",
      cancel_reason: reason,
    });
    await recordEstimateLifecycleRevision({
      estimateBefore: before,
      estimateAfter: after,
      reason,
      revisionType: "cancel",
      quoteTotalBefore: before.quote_total,
      quoteTotalAfter: before.quote_total,
      internalCostBefore: before.total_cost,
      internalCostAfter: before.total_cost,
      workOrderId: before.work_order_id || "",
    });
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
                  lines={lines.map((l) => ({ ...l, estimate_id: estimate.id }))}
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
              {estimate.status !== "cancelled" && (
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
              <EstimateRevisionPanel
                estimate={estimate}
                persistedEstimate={persistedEstimate}
                openRevision={openRevision}
                onStartRevision={handleStartRevision}
                onChange={patch}
                refreshKey={revisionRefreshKey}
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
                  disabled={!!openRevision}
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
              />
            </>
          )}

          <StepNav />
        </div>
      </div>

      <ClipboardManagerModal
        open={clipboardOpen}
        estimateId={estimate.id}
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