import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FileMinus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AioEstimateHeader from "@/components/estimator/aio/AioEstimateHeader";
import AioStepRail from "@/components/estimator/aio/AioStepRail";
import AddProductGrid from "@/components/estimator/aio/AddProductGrid";
import EstimateProductsList from "@/components/estimator/aio/EstimateProductsList";
import InlineProductEditor from "@/components/estimator/aio/InlineProductEditor";
import EstimateHeaderForm from "@/components/estimator/EstimateHeaderForm";
import PricingSummary from "@/components/estimator/PricingSummary";
import ConvertToWorkOrder from "@/components/estimator/ConvertToWorkOrder";
import CancelEstimateModal from "@/components/estimator/aio/CancelEstimateModal";
import { computePricing } from "@/components/estimator/aioPricing";
import { refreshSectionSnapshots, deleteOwnedSection } from "@/components/estimator/useSectionSync";
import {
  acceptBuilderPrice,
  deleteBuilderProductCascade,
  ensureBuilderProductForLine,
  ensureEstimateBuilderProducts,
} from "@/components/estimator/builder/builderService";
import { createCustomProduct, refreshManualProductPricing } from "@/components/estimator/parts/customProductService";
import { syncEstimateEverywhere } from "@/components/estimator/customerSync";

const STEP_TITLES = {
  1: "Step 1: Estimate Details",
  2: "Step 2: Edit Products",
  3: "Step 3: Finalize Estimate",
};

export default function EstimateDetail() {
  const navigate = useNavigate();
  const id = new URLSearchParams(window.location.search).get("id");
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(2);
  const [showCancel, setShowCancel] = useState(false);
  const [activeProduct, setActiveProduct] = useState(null);

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
      setEstimate({ ...current, line_items });
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="p-10 text-center text-gray-400">Loading estimate…</div>;
  if (!estimate) return <div className="p-10 text-center text-gray-500">Estimate not found.</div>;

  const pricing = computePricing(estimate);
  const lines = estimate.line_items || [];

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
    const line = estimate.line_items[index];
    const line_items = estimate.line_items.filter((_, i) => i !== index);
    setEstimate((prev) => ({ ...prev, line_items }));
    await base44.entities.AllInOneEstimate.update(estimate.id, { line_items });
    await deleteOwnedSection(line);
  };

  const addSection = async (mod) => {
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

  const updateProductPrice = async (line) => {
    const result = await acceptBuilderPrice({ estimateId: estimate.id, line });
    if (result?.blocked && result.reason === "detached_parts") {
      const names = (result.detachedParts || [])
        .map((part) => part.part_name || part.inventory_item_name)
        .filter(Boolean);
      window.alert(
        `Price update blocked. ${result.detachedCount} Part${result.detachedCount === 1 ? "" : "s"} must be reattached or resolved first.${names.length ? `\n\n${names.map((name) => `• ${name}`).join("\n")}` : ""}\n\nThe frozen product price has not changed.`
      );
    }
    await refreshProducts();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { id: _id, created_date, updated_date, created_by_id, created_by, ...data } = estimate;
      const saved = {
        ...data,
        id: estimate.id,
        total_cost: pricing.rawTotal,
        quote_total: pricing.quoteTotal,
      };
      await base44.entities.AllInOneEstimate.update(estimate.id, {
        ...data,
        total_cost: pricing.rawTotal,
        quote_total: pricing.quoteTotal,
      });
      // Keep the shared customer record and the Sales Pipeline lead in step
      await syncEstimateEverywhere(saved);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (reason) => {
    await base44.entities.AllInOneEstimate.update(estimate.id, {
      status: "cancelled",
      cancel_reason: reason,
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
        />

        <div className="flex-1 min-w-0 space-y-3">
          <StepNav />

          {step === 1 && <EstimateHeaderForm estimate={estimate} onChange={patch} />}

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
                <div className="flex justify-end">
                  <AddProductGrid counts={counts} onAdd={addSection} />
                </div>
                <EstimateProductsList
                  lines={lines.map((l) => ({ ...l, estimate_id: estimate.id }))}
                  rawTotal={pricing.rawTotal}
                  onChange={patchLine}
                  onRemove={removeLine}
                  onEdit={(line) => setActiveProduct(line)}
                  onUpdatePrice={updateProductPrice}
                  onProductRefresh={refreshProducts}
                />
                <div className="flex justify-end pt-1">
                  <AddProductGrid counts={counts} onAdd={addSection} />
                </div>
              </>
            )
          )}

          {step === 3 && (
            <>
              {estimate.status !== "cancelled" && (
                <button
                  onClick={() => setShowCancel(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 mb-3 bg-white border border-gray-300 rounded-sm hover:bg-gray-50 transition-colors text-left"
                >
                  <FileMinus className="w-4 h-4" style={{ color: "#8b1e1e" }} />
                  <span className="text-sm font-medium text-gray-800">Cancel Estimate</span>
                </button>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <PricingSummary estimate={estimate} pricing={pricing} onChange={patch} />
                <ConvertToWorkOrder
                  estimate={estimate}
                  pricing={pricing}
                  onConverted={(woId) => patch({ work_order_id: woId, status: "approved" })}
                />
              </div>
            </>
          )}

          <StepNav />
        </div>
      </div>

      <CancelEstimateModal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={handleCancel}
        estimateName={estimate.project_name}
      />
    </div>
  );
}