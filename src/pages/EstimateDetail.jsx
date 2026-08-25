import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Save } from "lucide-react";
import EstimateHeaderForm from "@/components/estimator/EstimateHeaderForm";
import SectionRow from "@/components/estimator/SectionRow";
import PricingSummary from "@/components/estimator/PricingSummary";
import AddSectionDialog from "@/components/estimator/AddSectionDialog";
import { computePricing } from "@/components/estimator/aioPricing";

export default function EstimateDetail() {
  const id = new URLSearchParams(window.location.search).get("id");
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    base44.entities.AllInOneEstimate.get(id).then((res) => {
      setEstimate(res);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="p-10 text-center text-gray-400">Loading estimate…</div>;
  if (!estimate) return <div className="p-10 text-center text-gray-500">Estimate not found.</div>;

  const pricing = computePricing(estimate);

  const patch = (changes) => setEstimate((prev) => ({ ...prev, ...changes }));

  const patchLine = (index, changes) =>
    setEstimate((prev) => ({
      ...prev,
      line_items: prev.line_items.map((l, i) => (i === index ? { ...l, ...changes } : l)),
    }));

  const removeLine = (index) =>
    setEstimate((prev) => ({ ...prev, line_items: prev.line_items.filter((_, i) => i !== index) }));

  const addSection = async (mod) => {
    const sectionName = `${estimate.project_name} — ${mod.label}`;
    const created = await base44.entities[mod.entity].create({
      project_name: sectionName,
      client_name: estimate.client_name,
      customer_id: estimate.customer_id,
      estimate_number: estimate.estimate_number,
    });
    setEstimate((prev) => ({
      ...prev,
      line_items: [
        ...(prev.line_items || []),
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
      ],
    }));
    setShowAdd(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { id: _id, created_date, updated_date, created_by_id, created_by, ...data } = estimate;
      await base44.entities.AllInOneEstimate.update(estimate.id, {
        ...data,
        total_cost: pricing.rawTotal,
        quote_total: pricing.quoteTotal,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between gap-4 mb-5">
          <Link to="/Estimator" className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600">
            <ArrowLeft className="w-4 h-4" /> All estimates
          </Link>
          <Button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save Estimate"}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <EstimateHeaderForm estimate={estimate} onChange={patch} />

            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Sections</h2>
              <Button variant="outline" onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4" /> Add Section
              </Button>
            </div>

            {(estimate.line_items || []).length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500">
                No sections yet — add one to start pricing this estimate.
              </div>
            ) : (
              <div className="space-y-3">
                {estimate.line_items.map((line, index) => (
                  <SectionRow
                    key={line.project_id || index}
                    line={line}
                    index={index}
                    onChange={patchLine}
                    onRemove={removeLine}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <PricingSummary estimate={estimate} pricing={pricing} onChange={patch} />
          </div>
        </div>
      </div>

      <AddSectionDialog open={showAdd} onClose={() => setShowAdd(false)} onAdd={addSection} />
    </div>
  );
}