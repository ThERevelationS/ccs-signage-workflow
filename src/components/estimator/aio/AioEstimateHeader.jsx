import { Layers, Link2, Save, RefreshCw } from "lucide-react";

export default function AioEstimateHeader({
  status = "draft",
  quoteTotal = 0,
  onSave,
  saving,
  title = "New All-In-One Estimate",
  subtitle = "One page, one set of project info, every estimator.",
  metaRight,
  readOnly = false,
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-md m-3 px-4 py-3 flex items-center justify-between">
      <div className="flex items-start gap-2">
        <Layers className="w-5 h-5 text-gray-700 mt-0.5" />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-bold text-gray-900">{title}</h1>
            <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
              {status}
            </span>
            <span className="w-2 h-2 rounded-full bg-yellow-400" />
          </div>
          <p className="text-[11px] text-gray-400">
            {subtitle}
            {metaRight ? <span className="ml-1 text-gray-300">· {metaRight}</span> : null}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-[9px] font-bold tracking-widest text-gray-400">QUOTE TOTAL</div>
          <div className="text-[20px] font-bold text-green-600">
            ${Number(quoteTotal || 0).toFixed(2)}
          </div>
        </div>
        <button className="w-9 h-9 border border-gray-200 rounded flex items-center justify-center text-gray-500 hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" />
        </button>
        <button className="w-9 h-9 border border-gray-200 rounded flex items-center justify-center text-gray-500 hover:bg-gray-50">
          <Link2 className="w-4 h-4" />
        </button>
        <button
          onClick={onSave}
          disabled={saving || readOnly}
          className="h-9 px-4 rounded bg-gray-800 text-white text-[13px] font-semibold flex items-center gap-2 hover:bg-gray-900 disabled:opacity-60"
        >
          <Save className="w-4 h-4" /> {readOnly ? "Protected" : saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}