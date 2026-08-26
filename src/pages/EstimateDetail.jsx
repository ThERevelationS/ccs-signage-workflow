import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import AioEstimateHeader from "@/components/estimator/aio/AioEstimateHeader";
import AioStepRail from "@/components/estimator/aio/AioStepRail";
import AddProductGrid from "@/components/estimator/aio/AddProductGrid";
import EstimateProductsList from "@/components/estimator/aio/EstimateProductsList";
import EstimateHeaderForm from "@/components/estimator/EstimateHeaderForm";
import PricingSummary from "@/components/estimator/PricingSummary";
import ConvertToWorkOrder from "@/components/estimator/ConvertToWorkOrder";
import { computePricing } from "@/components/estimator/aioPricing";
import { refreshSectionSnapshots, deleteOwnedSection } from "@/components/estimator/useSectionSync";
import { syncEstimateEverywhere } from "@/components/estimator/customerSync";

const STEP_TITLES = {
  1: "Step 1: Estimate Details",
  2: "Step 2: Edit Products",
  3: "Step 3: Finalize Estimate",
};

export default function EstimateDetail() {
  const id = new URLSearchParams(window.location.search).get("id");
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(2);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    base44.entities.AllInOneEstimate.get(id).then(async (res) => {
      const line_items = await refreshSectionSnapshots(res.line_items);
      setEstimate({ ...res, line_items });
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
    const line_items = [
      ...(estimate.line_items || []),
      {
        module_key: mod.key,
        project_id: created.id,
        project_name: sectionName,
        client_name: estimate.client_name,
        total_snapshot: 0,
        adjustment_percent: 0,
        section_status: "in_progress",
        customer_quantity: 1,
        include_in_customer: true,
        owned: true,
        linked_date: new Date().toISOString(),
      },
    ];
    // Persist immediately — the user navigates straight into the new section.
    await base44.entities.AllInOneEstimate.update(estimate.id, { line_items });
    setEstimate((prev) => ({ ...prev, line_items }));
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
            <>
              <AddProductGrid counts={counts} onAdd={addSection} />
              <EstimateProductsList
                lines={lines.map((l) => ({ ...l, estimate_id: estimate.id }))}
                rawTotal={pricing.rawTotal}
                onChange={patchLine}
                onRemove={removeLine}
              />
            </>
          )}

          {step === 3 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <PricingSummary estimate={estimate} pricing={pricing} onChange={patch} />
              <ConvertToWorkOrder
                estimate={estimate}
                pricing={pricing}
                onConverted={(woId) => patch({ work_order_id: woId, status: "approved" })}
              />
            </div>
          )}

          <StepNav />
        </div>
      </div>
    </div>
  );
}