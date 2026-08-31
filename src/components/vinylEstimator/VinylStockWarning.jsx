// Roll-stock + multi-roll planning warning. Features #6 & #37.

import React from "react";
import { AlertTriangle, Layers, CheckCircle2 } from "lucide-react";

export default function VinylStockWarning({ stockUsage, vinyl }) {
  if (!stockUsage || !vinyl) return null;
  const { rollsNeeded, percentOfRoll, fullRollsNeeded, exceedsOneRoll } = stockUsage;

  if (!exceedsOneRoll && percentOfRoll < 90) {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
        Uses <b className="tabular-nums">{percentOfRoll.toFixed(1)}%</b> of one roll.
      </div>
    );
  }

  if (!exceedsOneRoll) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        Uses <b className="tabular-nums">{percentOfRoll.toFixed(1)}%</b> of a single roll — very close to the end.
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1.5">
      <Layers className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      <div>
        <div className="font-semibold">Multi-roll job</div>
        <div>
          Needs <b className="tabular-nums">{rollsNeeded.toFixed(2)}</b> rolls
          {" "}(<b>{fullRollsNeeded}</b> full rolls of {vinyl.vinyl_name}).
          Each roll has its own leading/trailing edge waste — costs are estimated based on total pulled length.
        </div>
      </div>
    </div>
  );
}