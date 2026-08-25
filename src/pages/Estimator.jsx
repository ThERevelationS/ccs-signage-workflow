import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Calculator, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import EstimateCard from "@/components/estimator/EstimateCard";
import NewEstimateDialog from "@/components/estimator/NewEstimateDialog";

export default function Estimator() {
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    const res = await base44.entities.AllInOneEstimate.list("-created_date", 200);
    setEstimates(res || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (estimate) => {
    if (!window.confirm(`Delete estimate "${estimate.project_name}"?`)) return;
    await base44.entities.AllInOneEstimate.delete(estimate.id);
    setEstimates((prev) => prev.filter((e) => e.id !== estimate.id));
  };

  const term = search.trim().toLowerCase();
  const filtered = term
    ? estimates.filter((e) =>
        [e.project_name, e.client_name, e.estimate_number]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term))
      )
    : estimates;

  return (
    <div className="min-h-full bg-slate-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-red-600 flex items-center justify-center">
              <Calculator className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Estimator</h1>
              <p className="text-sm text-gray-500">Build and price multi-section sign estimates</p>
            </div>
          </div>
          <Button onClick={() => setShowNew(true)} className="bg-red-600 hover:bg-red-700 text-white">
            <Plus className="w-4 h-4" /> New Estimate
          </Button>
        </div>

        <div className="relative mb-5">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by description, client or estimate number"
            className="pl-9 bg-white"
          />
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading estimates…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
            <Calculator className="w-8 h-8 text-red-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">
              {estimates.length === 0 ? "No estimates yet" : "No estimates match your search"}
            </p>
            {estimates.length === 0 && (
              <p className="text-sm text-gray-400 mt-1">Create your first estimate to get started.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((estimate) => (
              <EstimateCard key={estimate.id} estimate={estimate} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      <NewEstimateDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(estimate) => {
          setEstimates((prev) => [estimate, ...prev]);
          setShowNew(false);
        }}
      />
    </div>
  );
}