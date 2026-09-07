import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Calculator, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import EstimateCard from "@/components/estimator/EstimateCard";
import NewEstimateDialog from "@/components/estimator/NewEstimateDialog";
import { runHistoricalBuilderBackfill } from "@/components/estimator/builder/historicalBackfill";
import { runLegacyBomReconcile } from "@/components/estimator/builder/legacyBomReconcile";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

export default function Estimator() {
  const navigate = useNavigate();
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(
    new URLSearchParams(window.location.search).get("new") === "1"
  );
  const backfillStartedRef = useRef(false);

  const load = async () => {
    const rows = await loadAllEntityRows({
      entity: base44.entities.AllInOneEstimate,
      sort: "-created_date",
      label: "Estimates",
    });
    setEstimates(rows);
    setLoading(false);

    if (!backfillStartedRef.current) {
      backfillStartedRef.current = true;
      runHistoricalBuilderBackfill({ seedEstimates: rows })
        .then(async (result) => {
          if (result?.estimates?.length) setEstimates(result.estimates);
          await runLegacyBomReconcile();
        })
        .catch((error) => {
          // Historical conversion/reconciliation must never block normal estimating.
          // Each migration writes its completion marker last, so the next admin
          // visit can resume safely if either pass is interrupted.
          console.error("Historical Product/BOM migration paused:", error);
        });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const term = search.trim().toLowerCase();
  const filtered = term
    ? estimates.filter((e) =>
        [e.project_name, e.client_name, e.estimate_number]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term))
      )
    : estimates;

  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <div className="clay-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
                boxShadow: 'inset 2px 2px 6px rgba(255,255,255,0.7), inset -2px -2px 6px rgba(0,0,0,0.08)',
              }}
            >
              <Calculator className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Estimator</h1>
              <p className="text-sm text-gray-500">Build and price multi-section sign estimates</p>
            </div>
          </div>
          <Button onClick={() => navigate("/NewAllInOneEstimate")} className="clay-button border-2 border-red-300 bg-red-50 hover:bg-red-100 text-red-700 font-bold">
            <Plus className="w-4 h-4" /> New Estimate
          </Button>
        </div>

        <div className="relative mb-5">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by description, client or estimate number"
            className="pl-9 clay-card border-none h-11"
          />
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading estimates…</div>
        ) : filtered.length === 0 ? (
          <div className="clay-card text-center py-16">
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
              <EstimateCard key={estimate.id} estimate={estimate} />
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