import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sun, Home } from "lucide-react";
import AutoGrowNotes from "./AutoGrowNotes";
import { HEIGHT_BUCKETS, qualifiedKey, qualifiedNotesKey } from "./installSizeRates";

// One size's editor card. Holds:
//   - large Interior/Exterior pill toggle (very noticeable)
//   - Height bucket dropdown (0-12, 12-20, 20-30, 30+ ft)
//   - the drill/prep/(elec) inputs for the currently-selected (env, height) tuple
//
// Each combination edits its own setting key:
//   `${drillPrefix}${sizeKey}__${env}__${heightBucket}` etc.
export default function BaseTimesSizeCard({
  sizeKey,
  sizeLabel,
  sizeRange,
  drillPrefix,
  prepPrefix,
  elecPrefix,
  includeElectrical,
  settings,
  updateSetting,
  isLocked,
}) {
  const [env, setEnv] = useState("exterior");
  const [heightBucket, setHeightBucket] = useState("h0_12");

  const drillName = qualifiedKey(drillPrefix, sizeKey, env, heightBucket);
  const prepName  = qualifiedKey(prepPrefix,  sizeKey, env, heightBucket);
  const elecName  = elecPrefix ? qualifiedKey(elecPrefix, sizeKey, env, heightBucket) : null;

  const drillVal = parseFloat(settings[drillName]) || 0;
  const prepVal  = parseFloat(settings[prepName]) || 0;
  const elecVal  = elecName ? (parseFloat(settings[elecName]) || 0) : 0;
  const total    = drillVal + prepVal + elecVal;

  const renderField = (name, label) => {
    if (!name) return null;
    const value = settings[name];
    const notesName = qualifiedNotesKey(
      name.startsWith(drillPrefix) ? drillPrefix
      : name.startsWith(prepPrefix) ? prepPrefix
      : elecPrefix,
      sizeKey, env, heightBucket
    );
    const notesValue = settings[notesName];
    return (
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <Label htmlFor={name} className="text-xs font-medium text-slate-700">{label}</Label>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">min</span>
        </div>
        <div className="flex items-start gap-2">
          <Input
            type="number"
            step="1"
            id={name}
            value={value ?? ""}
            onChange={(e) => updateSetting(name, e.target.value)}
            disabled={isLocked}
            className="h-9 w-14 flex-shrink-0 bg-white border-slate-200 focus:border-slate-400 focus:ring-0 text-sm tabular-nums font-medium px-1.5 text-center"
            min="0"
          />
          <AutoGrowNotes
            value={notesValue}
            onChange={(v) => updateSetting(notesName, v)}
            disabled={isLocked}
            className="flex-1 min-w-0"
            minHeightPx={36}
          />
        </div>
      </div>
    );
  };

  const envIsExterior = env === "exterior";

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 hover:bg-slate-50 transition-colors space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{sizeLabel}</div>
          <div className="text-[11px] text-slate-500">{sizeRange}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Total / letter</div>
          <div className="text-sm font-bold text-slate-900 tabular-nums">{total} min</div>
        </div>
      </div>

      {/* LARGE Interior/Exterior slider toggle — very noticeable */}
      <button
        type="button"
        role="switch"
        aria-checked={envIsExterior}
        onClick={() => setEnv(envIsExterior ? "interior" : "exterior")}
        disabled={isLocked}
        className={`relative w-full h-11 rounded-xl border-2 transition-all overflow-hidden shadow-sm ${
          envIsExterior
            ? "bg-gradient-to-r from-blue-50 to-sky-50 border-blue-300"
            : "bg-gradient-to-r from-amber-50 to-orange-50 border-amber-300"
        } ${isLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:shadow"}`}
      >
        {/* Sliding pill */}
        <div
          className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg shadow-md transition-all duration-300 ease-out ${
            envIsExterior
              ? "left-1 bg-gradient-to-br from-blue-500 to-blue-600"
              : "left-[calc(50%+3px)] bg-gradient-to-br from-amber-500 to-orange-500"
          }`}
        />
        {/* Labels */}
        <div className="relative grid grid-cols-2 h-full">
          <div className={`flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${envIsExterior ? "text-white" : "text-blue-700"}`}>
            <Sun className="w-3.5 h-3.5" />
            Exterior
          </div>
          <div className={`flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${!envIsExterior ? "text-white" : "text-amber-700"}`}>
            <Home className="w-3.5 h-3.5" />
            Interior
          </div>
        </div>
      </button>

      {/* Height bucket selector */}
      <div>
        <Label className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Installation Height</Label>
        <div className="grid grid-cols-4 gap-1 mt-1">
          {HEIGHT_BUCKETS.map(hb => (
            <button
              key={hb.key}
              type="button"
              onClick={() => setHeightBucket(hb.key)}
              disabled={isLocked}
              className={`text-[10px] py-1.5 px-1 rounded-md border transition-all font-medium ${
                heightBucket === hb.key
                  ? "border-slate-700 bg-slate-900 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              } ${isLocked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {hb.label}
            </button>
          ))}
        </div>
      </div>

      {/* The actual minute inputs for the currently-selected (env, height) tuple */}
      <div className="space-y-2 pt-1">
        {renderField(drillName, "Drill Pattern / Drill Time")}
        {renderField(prepName, "Installation / Prep Time")}
        {includeElectrical && renderField(elecName, "Electrical Hookup")}
      </div>

      <div className="text-[10px] text-slate-400 italic leading-tight pt-1 border-t border-slate-200">
        Editing: <span className="font-semibold text-slate-600">{envIsExterior ? "Exterior" : "Interior"}</span> · <span className="font-semibold text-slate-600">{HEIGHT_BUCKETS.find(h => h.key === heightBucket)?.label}</span>
      </div>
    </div>
  );
}