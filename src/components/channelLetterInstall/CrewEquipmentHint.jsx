import React from "react";
import { Users, HardHat, AlertTriangle } from "lucide-react";

// Suggest crew size and equipment based on max install height across items
export default function CrewEquipmentHint({ items = [] }) {
  if (!items.length) return null;

  const maxHeight = items.reduce(
    (max, it) => Math.max(max, parseFloat(it.installation_height_feet) || 0),
    0
  );
  const totalLetters = items.reduce(
    (s, it) => s + (parseFloat(it.qty_letters) || 0),
    0
  );

  let crewSize = 2;
  let equipment = "Standard ladder";
  let equipmentLevel = "low";

  if (maxHeight > 30) {
    crewSize = 4;
    equipment = "Boom lift (40ft+) + ground crew";
    equipmentLevel = "high";
  } else if (maxHeight > 20) {
    crewSize = 3;
    equipment = "Scissor lift / boom lift (30ft)";
    equipmentLevel = "medium";
  } else if (maxHeight > 12) {
    crewSize = 2;
    equipment = "Scissor lift or extension ladder (20ft)";
    equipmentLevel = "medium";
  }

  if (totalLetters > 30 && crewSize < 3) crewSize += 1;

  const levelColor = {
    low: "bg-green-50 border-green-200 text-green-900",
    medium: "bg-amber-50 border-amber-200 text-amber-900",
    high: "bg-red-50 border-red-200 text-red-900",
  }[equipmentLevel];

  return (
    <div className={`rounded-lg border p-3 ${levelColor}`}>
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide">
        <HardHat className="w-3.5 h-3.5" />
        Crew & Equipment Hint
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex items-center gap-1.5">
          <Users className="w-3 h-3" />
          <span><strong>{crewSize}-person crew</strong> recommended</span>
        </div>
        <div className="flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 mt-0.5" />
          <span><strong>{equipment}</strong> (max {maxHeight}ft)</span>
        </div>
      </div>
    </div>
  );
}