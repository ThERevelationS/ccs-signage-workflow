import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";
import { ESTIMATOR_MODULES } from "@/components/estimator/moduleRegistry";

export default function QuickPrice() {
  const navigate = useNavigate();
  const location = useLocation();
  const preset = new URLSearchParams(location.search).get("module") || "";

  const [moduleKey, setModuleKey] = useState(preset || ESTIMATOR_MODULES[0].key);
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [creating, setCreating] = useState(false);

  const start = async () => {
    const mod = ESTIMATOR_MODULES.find((m) => m.key === moduleKey);
    if (!mod || !projectName.trim() || !clientName.trim()) return;
    setCreating(true);
    try {
      const record = await base44.entities[mod.entity].create({
        project_name: projectName.trim(),
        client_name: clientName.trim(),
        status: "draft",
      });
      navigate(`/${mod.page}?id=${record.id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-3">
        <div className="bg-white px-4 py-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-red-500" />
          <h1 className="text-xs font-bold tracking-wide text-gray-600">QUICK PRICE</h1>
        </div>

        <div className="bg-white p-4 space-y-3">
          <p className="text-sm text-gray-500">
            Price a single module without building a full estimate.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">
              Job description
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </label>
            <label className="text-xs text-gray-500">
              Client
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ESTIMATOR_MODULES.map((m) => (
              <button
                key={m.key}
                onClick={() => setModuleKey(m.key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium text-left border ${
                  moduleKey === m.key
                    ? "border-red-400 bg-red-50 text-red-700"
                    : "border-gray-200 text-gray-700 hover:border-red-300"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <Button
            onClick={start}
            disabled={creating || !projectName.trim() || !clientName.trim()}
            className="clay-button border-2 border-red-300 bg-red-50 hover:bg-red-100 text-red-700 font-bold"
          >
            {creating ? "Opening…" : "Start Quick Price"}
          </Button>
        </div>
      </div>
    </div>
  );
}