import { useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";
import { ESTIMATOR_MODULES } from "@/components/estimator/moduleRegistry";
import { createQuickPriceProjectWithRecovery } from "@/components/estimator/quickPricePersistence";
import { staffEntities } from "@/components/staff/staffEntities";

const HISTORY_KEY = "ccs_quick_price_history";
const HISTORY_LIMIT = 8;

function readHistory() {
  try {
    const rows = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(rows)
      ? rows.filter((row) => row && row.id && row.module_key).slice(0, HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

function writeHistory(rows) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(rows.slice(0, HISTORY_LIMIT)));
  } catch {
    // localStorage unavailable (private mode, quota) — history is best-effort.
  }
}

export default function QuickPrice() {
  const navigate = useNavigate();
  const location = useLocation();
  const preset = new URLSearchParams(location.search).get("module") || "";

  const [moduleKey, setModuleKey] = useState(preset || ESTIMATOR_MODULES[0].key);
  const pickModule = (key) => {
    setModuleKey(key);
    try {
      const next = new URLSearchParams(window.location.search);
      if (key && key !== ESTIMATOR_MODULES[0].key) next.set("module", key); else next.delete("module");
      window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
    } catch {}
  };
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState(readHistory);
  const createRef = useRef(false);

  const recordHistory = (entry) => {
    const next = [entry, ...history.filter((row) => row.id !== entry.id)].slice(0, HISTORY_LIMIT);
    writeHistory(next);
    setHistory(next);
  };

  const clearHistory = () => {
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // best-effort
    }
    setHistory([]);
  };

  const reuseEntry = (entry) => {
    if (ESTIMATOR_MODULES.some((m) => m.key === entry.module_key)) {
      pickModule(entry.module_key);
    }
    setProjectName(`${entry.project_name || ""} copy`.trim());
    setClientName(entry.client_name || "");
  };

  const openEntry = (entry) => {
    const mod = ESTIMATOR_MODULES.find((m) => m.key === entry.module_key);
    if (mod && entry.id) navigate(`/${mod.page}?id=${entry.id}`);
  };

  const start = async () => {
    const mod = ESTIMATOR_MODULES.find((m) => m.key === moduleKey);
    if (!mod || !projectName.trim() || !clientName.trim() || createRef.current) return;
    createRef.current = true;
    setCreating(true);
    setError("");
    try {
      const result = await createQuickPriceProjectWithRecovery({
        entity: staffEntities[mod.entity],
        data: {
          project_name: projectName.trim(),
          client_name: clientName.trim(),
          status: "draft",
        },
        label: `${mod.label} Quick Price project`,
      });
      recordHistory({
        module_key: mod.key,
        module_label: mod.label,
        project_name: projectName.trim(),
        client_name: clientName.trim(),
        id: result.record.id,
        created: new Date().toISOString(),
      });
      navigate(`/${mod.page}?id=${result.record.id}`);
    } catch (e) {
      setError(e?.message || "Quick Price could not safely create the project. Review existing drafts before retrying.");
    } finally {
      createRef.current = false;
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

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <div className="font-semibold">Quick Price creation blocked</div>
              <div className="mt-1">{error}</div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ESTIMATOR_MODULES.map((m) => (
              <button type="button"
                key={m.key}
                onClick={() => pickModule(m.key)}
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

        {history.length > 0 && (
          <div className="bg-white p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold tracking-wide text-gray-600">RECENT QUICK PRICES</h2>
              <button type="button"
                onClick={clearHistory}
                className="text-xs font-medium text-red-600 hover:text-red-700"
              >
                Clear history
              </button>
            </div>
            <ul className="divide-y divide-gray-100">
              {history.map((entry) => {
                const mod = ESTIMATOR_MODULES.find((m) => m.key === entry.module_key);
                return (
                  <li key={entry.id} className="py-2 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-700 truncate">{entry.project_name}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {entry.client_name} · {entry.module_label || mod?.label || entry.module_key}
                        {entry.created ? ` · ${new Date(entry.created).toLocaleDateString()}` : ""}
                      </div>
                    </div>
                    <button type="button"
                      onClick={() => reuseEntry(entry)}
                      className="px-2 py-1 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-700"
                    >
                      Reuse
                    </button>
                    {mod && (
                      <button type="button"
                        onClick={() => openEntry(entry)}
                        className="px-2 py-1 rounded-lg text-xs font-bold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                      >
                        Open
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}