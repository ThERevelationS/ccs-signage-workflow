import React, { useMemo, useState, useEffect } from "react";
import { ChannelLetterInstallEquipment } from "@/entities/all";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  Legend,
} from "recharts";

// Computes the maximum horizontal parking distance (boom pivot → building
// face) at which a boom can still reach a given building height.
// The boom's working envelope is approximated as a circle of radius
// horizontal_boom_reach centered on the boom pivot. The pivot sits
// (total_boom_height) above the ground. So at building height `h`, the
// reachable horizontal distance from the pivot is:
//     sqrt( H_reach^2 - (h - pivot_height)^2 )
// Subtract half the deployed truck width because the pivot is centered on
// the truck while the truck side touches the building.
function reachAt(equipment, buildingHeight) {
  const H = Number(equipment.horizontal_boom_reach_feet) || 0;
  const totalBoom = Number(equipment.total_boom_height_feet) || Number(equipment.max_height_feet) || 0;
  const safety = Number(equipment.vertical_reach_safety_margin_feet) || 0;
  const truckWidth = Number(equipment.deployed_truck_width_feet) || 0;
  if (H <= 0 || totalBoom <= 0) return null;

  // The boom can reach UP to (totalBoom - safety) and DOWN to (- some amount)
  // We model the pivot at ~truck-deck height; for simplicity treat the pivot
  // as at ground level with a max vertical reach of (totalBoom - safety).
  const maxVertical = totalBoom - safety;
  if (buildingHeight > maxVertical) return 0; // out of vertical range
  // Horizontal reach from pivot at this height (circular envelope)
  const horiz = Math.sqrt(Math.max(0, H * H - Math.pow(buildingHeight - 0, 2)));
  // Subtract half the truck width — boom pivot is centered on the carriage
  const usable = horiz - truckWidth / 2;
  return Math.max(0, usable);
}

const COLORS = ["#7c3aed", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#ec4899", "#6366f1"];

export default function BoomLiftReachChart({ installationHeightFeet }) {
  const [allEquipment, setAllEquipment] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const list = await ChannelLetterInstallEquipment.list("sort_order");
        const booms = list.filter(
          (e) => (e.equipment_type === "boom_lift" || e.equipment_type === "boom_truck") && e.is_active !== false
        );
        setAllEquipment(booms);
        // Auto-select the smallest boom whose max height ≥ install height,
        // otherwise just the first one.
        const h = Number(installationHeightFeet) || 0;
        const sorted = [...booms].sort(
          (a, b) => (Number(a.max_height_feet) || 0) - (Number(b.max_height_feet) || 0)
        );
        const best = sorted.find((b) => (Number(b.max_height_feet) || 0) >= h) || sorted[0];
        if (best) setSelectedId(best.id);
      } catch (e) {
        console.error("BoomLiftReachChart load error:", e);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => allEquipment.find((e) => e.id === selectedId),
    [allEquipment, selectedId]
  );

  const chartData = useMemo(() => {
    if (!selected) return [];
    const H = Number(selected.horizontal_boom_reach_feet) || 0;
    const totalBoom = Number(selected.total_boom_height_feet) || Number(selected.max_height_feet) || 0;
    const safety = Number(selected.vertical_reach_safety_margin_feet) || 0;
    const maxVertical = Math.max(totalBoom - safety, 0);
    const upperBound = Math.max(maxVertical, Number(installationHeightFeet) || 0, 30);
    const steps = 60;
    const data = [];
    for (let i = 0; i <= steps; i++) {
      const height = (upperBound / steps) * i;
      const dist = reachAt(selected, height);
      data.push({
        building_height: +height.toFixed(1),
        parking_distance: dist == null ? null : +dist.toFixed(2),
      });
    }
    return data;
  }, [selected, installationHeightFeet]);

  const targetReach = useMemo(() => {
    if (!selected) return null;
    return reachAt(selected, Number(installationHeightFeet) || 0);
  }, [selected, installationHeightFeet]);

  const isReachable = targetReach != null && targetReach > 0;
  const maxVerticalReach = selected
    ? (Number(selected.total_boom_height_feet) || Number(selected.max_height_feet) || 0) -
      (Number(selected.vertical_reach_safety_margin_feet) || 0)
    : 0;

  if (loading) {
    return <div className="text-xs text-slate-500 py-6 text-center">Loading boom lift data…</div>;
  }

  if (allEquipment.length === 0) {
    return (
      <div className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded p-3 leading-relaxed">
        No boom lifts or boom trucks in your equipment inventory yet. Add one in{" "}
        <span className="font-semibold">Channel Letter Inventory → Equipment</span> with{" "}
        <span className="font-semibold">Horizontal Boom Reach</span>,{" "}
        <span className="font-semibold">Total Boom Height</span>, and{" "}
        <span className="font-semibold">Deployed Truck Width</span> to enable this chart.
      </div>
    );
  }

  const hasFullData =
    selected &&
    Number(selected.horizontal_boom_reach_feet) > 0 &&
    (Number(selected.total_boom_height_feet) > 0 || Number(selected.max_height_feet) > 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-700">Boom Lift / Truck:</span>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="h-8 w-[280px] text-xs">
            <SelectValue placeholder="Choose a boom lift or truck" />
          </SelectTrigger>
          <SelectContent>
            {allEquipment.map((e) => (
              <SelectItem key={e.id} value={e.id} className="text-xs">
                {e.equipment_name} — {e.max_height_feet || 0}ft max
                {e.equipment_type === "boom_truck" ? " (Truck)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!hasFullData ? (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
          This boom lift is missing reach data. Edit it in the Equipment inventory and add{" "}
          <span className="font-semibold">Horizontal Boom Reach</span> and{" "}
          <span className="font-semibold">Total Boom Height</span>.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* LEFT column — specs, status, explanation */}
          <div className="space-y-2 min-w-0">
            {/* Quick spec strip */}
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <div className="bg-slate-50 border border-slate-200 rounded px-2 py-1">
                <div className="text-slate-500">Horiz Reach</div>
                <div className="font-semibold text-slate-800">{selected.horizontal_boom_reach_feet || 0} ft</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded px-2 py-1">
                <div className="text-slate-500">Max Vert (w/ safety)</div>
                <div className="font-semibold text-slate-800">{maxVerticalReach.toFixed(0)} ft</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded px-2 py-1">
                <div className="text-slate-500">Truck Width</div>
                <div className="font-semibold text-slate-800">{selected.deployed_truck_width_feet || 0} ft</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded px-2 py-1">
                <div className="text-slate-500">Safety Margin</div>
                <div className="font-semibold text-slate-800">{selected.vertical_reach_safety_margin_feet || 0} ft</div>
              </div>
            </div>

            {/* Status badge for current install height */}
            {isReachable ? (
              <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded px-2.5 py-1.5 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  At <strong>{Number(installationHeightFeet) || 0} ft</strong> install height, this boom can park up to{" "}
                  <strong>{targetReach.toFixed(1)} ft</strong> away from the building face.
                </span>
              </div>
            ) : (
              <div className="text-xs bg-red-50 border border-red-200 text-red-800 rounded px-2.5 py-1.5 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  This boom can't safely reach <strong>{Number(installationHeightFeet) || 0} ft</strong>. Choose a larger lift or
                  check vertical safety margin.
                </span>
              </div>
            )}

            <p className="text-[10px] text-slate-400 leading-snug">
              The shaded area is where the boom can position its platform to touch the building face. Below the curve = OK;
              above = the boom physically can't get the worker that high while parked that far out. Half the truck width is
              subtracted because the boom pivot sits in the middle of the carriage.
            </p>
          </div>

          {/* RIGHT column — chart */}
          <div className="bg-white border border-slate-200 rounded-lg p-2 min-w-0">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 36 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="building_height"
                  type="number"
                  domain={[0, "dataMax"]}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  label={{ value: "Building Height (ft)", position: "insideBottom", offset: -20, fontSize: 11, fill: "#475569" }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  label={{ value: "Parking Dist (ft)", angle: -90, position: "insideLeft", offset: 14, fontSize: 11, fill: "#475569", style: { textAnchor: "middle" } }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, padding: "4px 8px", borderRadius: 6 }}
                  formatter={(v) => (v == null ? "out of reach" : `${v} ft`)}
                  labelFormatter={(v) => `Building height: ${v} ft`}
                />
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} verticalAlign="top" height={20} />
                <Area
                  type="monotone"
                  dataKey="parking_distance"
                  name="Reachable zone"
                  stroke={COLORS[0]}
                  fill={COLORS[0]}
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <ReferenceLine
                  x={Number(installationHeightFeet) || 0}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{ value: "Install Ht", fontSize: 10, fill: "#ef4444", position: "top" }}
                />
                {isReachable && (
                  <ReferenceDot
                    x={Number(installationHeightFeet) || 0}
                    y={targetReach}
                    r={5}
                    fill="#ef4444"
                    stroke="#fff"
                    strokeWidth={2}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}