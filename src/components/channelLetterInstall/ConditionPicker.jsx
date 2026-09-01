import React from "react";
import { Check, Zap, Navigation, ArrowDownToLine, Mountain } from "lucide-react";
import CyclingImage from "./CyclingImage";
import { Slider } from "@/components/ui/slider";

const ELECTRICAL_SEVERITY_DEFAULTS = {
  1: "A Bit Harder",
  2: "Mildly Annoying",
  3: "Inconvenient",
  4: "Real Pain",
  5: "Frustrating",
  6: "Seriously?",
  7: "Nightmare Fuel",
  8: "Who Designed This?",
  9: "Total Disaster",
  10: "What the Heck is Wrong With These People!?",
};

const SITE_ACCESS_SEVERITY_DEFAULTS = {
  1: "Mildly Cramped",
  2: "Slightly Awkward",
  3: "Squeeze Play",
  4: "Tight Quarters",
  5: "Obstacle Course",
  6: "Where Does the Lift Go?",
  7: "Sketchy Footing",
  8: "Hold My Coffee",
  9: "Mission Impossible",
  10: "Did a Sign Even Belong Here?",
};

const labelFromSettings = (settings, key, fallback) => {
  const v = settings && settings[key];
  if (typeof v === "string" && v.trim()) return v;
  return fallback;
};

const BASE = "https://media.base44.com/images/public/68a5a85045cf8570330146ef/";

const CONDITIONS = [
  {
    id: "thick_hollow_walls",
    label: "Thick / Hollow Walls",
    description: "Brick veneer, masonry, hollow cavity",
    images: [
      "354337612", "84462815e", "5b7a796e9", "3e74960b9", "f3485fd9a",
      "bf147d559", "d188f44b1", "5d1898ed4", "084e9cdf8", "dade9676f",
    ],
    accent: "border-orange-500 bg-orange-50 text-orange-900",
    accentDot: "bg-orange-500",
  },
  {
    id: "parapet",
    label: "Parapet",
    description: "Working over rooftop edge wall",
    images: [
      "46e545715", "dc634e87b", "d20b09c6e", "f0be4b794", "4678784bb",
      "f56669274", "43a05074f", "46609c428", "50ac973f7", "0b19729fe",
    ],
    accent: "border-red-500 bg-red-50 text-red-900",
    accentDot: "bg-red-500",
  },
  {
    id: "poor_electrical_access",
    label: "Poor Electrical Access",
    description: "Difficult conduit / power routing",
    images: [
      "1ec96707a", "d5ae58684", "57fcecc8c", "c5347f3af", "509147fed",
      "6b56939ac", "dcf9c1adc", "8ec6bf0fe", "e09579e01", "0915a9043",
    ],
    accent: "border-yellow-500 bg-yellow-50 text-yellow-900",
    accentDot: "bg-yellow-500",
  },
  {
    id: "escort_required",
    label: "Escort Required",
    description: "Must be escorted on-site at all times",
    images: [
      "2f0c1de7c", "c687a46d3", "1c49571c6", "412d12b68", "ffb60cf1f",
      "917adf941", "700611476", "4650bb73b", "b42272e3d",
    ],
    accent: "border-sky-500 bg-sky-50 text-sky-900",
    accentDot: "bg-sky-500",
  },
  {
    id: "badging_checkin",
    label: "Badging / Check-in",
    description: "Security badge or sign-in required",
    images: [
      "f2ded6395", "aa55e3ae9", "cf1cadee6", "388fcc5a8", "b45f279f4",
      "0f1161fe7", "39a14f0a2", "4200e28a3", "891770826",
    ],
    accent: "border-indigo-500 bg-indigo-50 text-indigo-900",
    accentDot: "bg-indigo-500",
  },
  {
    id: "after_hours_weekend",
    label: "After-Hours / Weekend",
    description: "Night, early morning, or weekend install",
    images: [
      "1cdf0e29e", "f58ad5ed6", "ac51fe06c", "e1e776e0f", "42caaf28b",
      "de4312c59", "89abe805e", "287c5d801", "ae9640c42",
    ],
    accent: "border-violet-500 bg-violet-50 text-violet-900",
    accentDot: "bg-violet-500",
  },
  {
    id: "set_hours_installation",
    label: "Set-Hours Installation",
    description: "Fixed time window / scheduled appointment",
    images: [
      "1670f70d1", "1c5add52a", "e3768da95", "d36581597", "5b6acff88",
      "a3f771ff2", "ab486c2bb", "516c15423", "c9c9de17b",
    ],
    accent: "border-teal-500 bg-teal-50 text-teal-900",
    accentDot: "bg-teal-500",
  },
  {
    id: "poor_site_access",
    label: "Poor Site Access",
    description: "No lift room, obstructions, tight space",
    images: [
      "786a757c7", "16a9c332e", "f1fb9a541", "028ff7b47", "22d9b1525",
      "e9785417c", "7794ec650", "87e0ab013", "28eb113ca",
    ],
    accent: "border-rose-500 bg-rose-50 text-rose-900",
    accentDot: "bg-rose-500",
  },
].map(c => ({ ...c, images: c.images.map(id => `${BASE}${id}_generated_image.png`) }));

export default function ConditionPicker({ values, onChange, settings = {} }) {
  const toggle = (id) => onChange({ ...values, [id]: !values[id] });
  const elecSeverity = Math.max(1, Math.min(10, parseInt(values.poor_electrical_severity) || 1));
  const siteSeverity = Math.max(1, Math.min(10, parseInt(values.poor_site_access_severity) || 1));
  const parapetRouting = values.parapet_electrical_routing === "drop" ? "drop" : "roof";

  const elecLabel = labelFromSettings(
    settings,
    `install_poor_electrical_label_${elecSeverity}`,
    ELECTRICAL_SEVERITY_DEFAULTS[elecSeverity]
  );
  const siteLabel = labelFromSettings(
    settings,
    `install_site_access_label_${siteSeverity}`,
    SITE_ACCESS_SEVERITY_DEFAULTS[siteSeverity]
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {CONDITIONS.map(c => {
        const selected = !!values[c.id];
        const isElectrical = c.id === "poor_electrical_access";
        const isSiteAccess = c.id === "poor_site_access";
        const isParapet = c.id === "parapet";
        return (
          <div
            key={c.id}
            className={`relative rounded-lg border-2 transition-all text-left overflow-hidden ${
              selected
                ? c.accent + " shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {/* Severity slider — only on Poor Electrical Access, only when selected */}
            {isElectrical && selected && (
              <div
                className="px-2.5 pt-2.5 pb-1 bg-yellow-100/60 border-b border-yellow-300"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="w-3 h-3 text-yellow-700" />
                  <span className="text-[10px] font-bold text-yellow-900 uppercase tracking-wide">
                    Severity {elecSeverity}/10
                  </span>
                </div>
                <Slider
                  min={1}
                  max={10}
                  step={1}
                  value={[elecSeverity]}
                  onValueChange={(v) => onChange({ ...values, poor_electrical_severity: v[0] })}
                  className="my-1"
                />
                <div className="text-[10px] font-semibold text-yellow-900 leading-tight italic h-7 flex items-center">
                  "{elecLabel}"
                </div>
              </div>
            )}

            {/* Routing slider — only on Parapet, only when selected */}
            {isParapet && selected && (
              <div
                className="px-2.5 pt-2.5 pb-1 bg-red-100/60 border-b border-red-300"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {parapetRouting === "drop"
                    ? <ArrowDownToLine className="w-3 h-3 text-red-700" />
                    : <Mountain className="w-3 h-3 text-red-700" />
                  }
                  <span className="text-[10px] font-bold text-red-900 uppercase tracking-wide">
                    Electrical Routing
                  </span>
                </div>
                <Slider
                  min={0}
                  max={1}
                  step={1}
                  value={[parapetRouting === "drop" ? 1 : 0]}
                  onValueChange={(v) =>
                    onChange({
                      ...values,
                      parapet_electrical_routing: v[0] === 1 ? "drop" : "roof",
                    })
                  }
                  className="my-1"
                />
                <div className="text-[10px] font-semibold text-red-900 leading-tight italic h-7 flex items-center">
                  {parapetRouting === "drop"
                    ? '"Drops inside parapet" (harder)'
                    : '"Runs on roof" (easier)'}
                </div>
              </div>
            )}

            {/* Severity slider — only on Poor Site Access, only when selected */}
            {isSiteAccess && selected && (
              <div
                className="px-2.5 pt-2.5 pb-1 bg-rose-100/60 border-b border-rose-300"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Navigation className="w-3 h-3 text-rose-700" />
                  <span className="text-[10px] font-bold text-rose-900 uppercase tracking-wide">
                    Severity {siteSeverity}/10
                  </span>
                </div>
                <Slider
                  min={1}
                  max={10}
                  step={1}
                  value={[siteSeverity]}
                  onValueChange={(v) => onChange({ ...values, poor_site_access_severity: v[0] })}
                  className="my-1"
                />
                <div className="text-[10px] font-semibold text-rose-900 leading-tight italic h-7 flex items-center">
                  "{siteLabel}"
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => toggle(c.id)}
              className="block w-full text-left"
            >
              {selected && (
                <div className={`absolute top-2 right-2 w-5 h-5 rounded-full ${c.accentDot} flex items-center justify-center z-10`}>
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
              <CyclingImage
                images={c.images}
                alt={c.label}
                className="w-full aspect-video"
                intervalMs={5000}
              />
              <div className="p-2.5">
                <div className="text-sm font-semibold">{c.label}</div>
                <div className="text-[10px] opacity-70 leading-tight">{c.description}</div>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}