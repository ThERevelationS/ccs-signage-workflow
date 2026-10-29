import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { mergeableLines } from "@/components/estimator/estimateMergeService";

// Step 1 of the merge: pick which other draft to pull products from.
export default function MergeDraftList({ drafts = [], loading, onPick }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return drafts;
    return drafts.filter((d) => [d.project_name, d.client_name, d.estimate_number].some((v) => String(v || "").toLowerCase().includes(q)));
  }, [drafts, query]);

  if (loading) return <p className="py-6 text-center text-[12px] text-gray-500" role="status">Loading drafts…</p>;
  if (!drafts.length) return <p className="py-6 text-center text-[12px] text-gray-500">No other draft estimates with products to merge.</p>;
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 border border-gray-200 rounded px-2 h-9">
        <Search className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search drafts" aria-label="Search drafts" className="flex-1 text-[13px] outline-none bg-transparent" />
      </label>
      <div className="max-h-72 overflow-y-auto space-y-1.5">
        {visible.map((d) => (
          <button key={d.id} type="button" onClick={() => onPick(d)} className="w-full min-h-[44px] text-left border border-gray-200 rounded px-3 py-2 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
            <span className="block text-[13px] font-semibold text-gray-900">{d.project_name || "Untitled estimate"}</span>
            <span className="block text-[11px] text-gray-500">
              {[d.client_name, d.estimate_number && `#${d.estimate_number}`, `${mergeableLines(d).length} product(s)`].filter(Boolean).join(" · ")}
            </span>
          </button>
        ))}
        {!visible.length && <p className="py-4 text-center text-[12px] text-gray-500">No drafts match this search.</p>}
      </div>
    </div>
  );
}