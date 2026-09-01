// Single (sign_type × action) rate card with an enable/disable toggle.
// Extracted from RatesBySignTypeTab so each card lives in its own focused file.

import React from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Clock, Sparkles, Lightbulb, Zap, Wrench } from "lucide-react";
import { LETTER_SIZES, CABINET_SIZES, sizeAxisFor } from "./constants";
import { SIZE_FIELD } from "./defaults";

const GROUP_THEMES = {
  "Cosmetic":   { Icon: Sparkles,  bar: "from-pink-400 to-rose-500",     text: "text-rose-700",   bg: "bg-rose-50",   border: "border-rose-200" },
  "LED / Lamp": { Icon: Lightbulb, bar: "from-amber-400 to-orange-500",  text: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200" },
  "Electrical": { Icon: Zap,       bar: "from-yellow-400 to-amber-500",  text: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
  "Component":  { Icon: Wrench,    bar: "from-violet-400 to-purple-500", text: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200" },
};

export default function ActionRateCard({ action, signType, rate, isLocked, onChange }) {
  const isCabinet = sizeAxisFor(signType.id) === "cabinet";
  const sizes = isCabinet ? CABINET_SIZES : LETTER_SIZES;
  const basis = rate.rate_basis || (isCabinet ? "per_cabinet" : "per_letter");
  const isFlat = basis === "flat";
  const theme = GROUP_THEMES[action.group] || GROUP_THEMES["Component"];
  const Icon = theme.Icon;
  const enabled = rate.is_enabled !== false; // default true

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={`border ${theme.border} rounded-xl bg-white hover:shadow-md transition-shadow overflow-hidden ${!enabled ? "opacity-60" : ""}`}
    >
      <div className={`h-1 bg-gradient-to-r ${theme.bar}`} />
      <div className={`px-4 py-3 ${theme.bg}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${theme.bar} flex items-center justify-center shadow-sm flex-shrink-0`}>
              <Icon className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0">
              <div className={`text-sm font-semibold ${theme.text} truncate`}>{action.label}</div>
              <div className="text-[11px] text-slate-500">
                {isFlat ? "Flat per service item" : `Per ${isCabinet ? "cabinet" : "letter"}`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={enabled}
              disabled={isLocked}
              onCheckedChange={(v) => onChange({ is_enabled: !!v })}
              aria-label={`Enable ${action.label} for ${signType.label}`}
            />
          </div>
        </div>
      </div>

      <div className={`p-4 space-y-3 ${!enabled ? "pointer-events-none" : ""}`}>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Rate Basis</Label>
          <select
            className="h-9 w-full rounded-md border border-slate-200 text-xs bg-white px-2 mt-1 disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:border-transparent"
            value={basis}
            disabled={isLocked || !enabled}
            onChange={(e) => onChange({ rate_basis: e.target.value })}
          >
            <option value={isCabinet ? "per_cabinet" : "per_letter"}>{isCabinet ? "Per cabinet" : "Per letter"}</option>
            <option value="flat">Flat per service item</option>
          </select>
        </div>

        {isFlat ? (
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
              <Clock className="w-3 h-3" /> Minutes (flat)
            </Label>
            <Input
              type="number" min="0" step="1"
              value={rate.base_minutes_flat ?? 0}
              disabled={isLocked || !enabled}
              onChange={(e) => onChange({ base_minutes_flat: parseFloat(e.target.value) || 0 })}
              className="h-9 text-sm tabular-nums mt-1"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {sizes.map(sz => {
              const field = SIZE_FIELD[sz.id];
              return (
                <div key={sz.id}>
                  <Label className={`text-[10px] font-semibold ${theme.text}`}>{sz.label}</Label>
                  <Input
                    type="number" min="0" step="1"
                    value={rate[field] ?? 0}
                    disabled={isLocked || !enabled}
                    onChange={(e) => onChange({ [field]: parseFloat(e.target.value) || 0 })}
                    className="h-9 text-sm tabular-nums mt-1"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}