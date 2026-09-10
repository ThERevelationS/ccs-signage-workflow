import {
  Fuel, Battery, Wrench, Cpu, Car, AlertTriangle,
  MapPin, Activity, Power, Route as RouteIcon
} from "lucide-react";

export const MAKE_COLORS = {
  CHEVROLET: "#d40000",
  HONDA: "#cc0000",
  FORD: "#003478",
  TOYOTA: "#eb0a1e",
  FREIGHTLINER: "#1a3a5c",
  GMC: "#8a1b1b",
  DODGE: "#1a1a1a",
  NISSAN: "#c3002f",
  JEEP: "#5a5a5a",
  INTERNATIONAL: "#b22222",
  PETERBILT: "#d40000",
  KENWORTH: "#e00000",
  VOLVO: "#1a3a8a",
  MACK: "#8a1b1b",
  DEFAULT: "#a80000"
};

export function makeColor(make) {
  if (!make) return MAKE_COLORS.DEFAULT;
  return MAKE_COLORS[make.toUpperCase()] || MAKE_COLORS.DEFAULT;
}

export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return "0 minutes";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h && m) return `${h} hour${h !== 1 ? "s" : ""} ${m} minute${m !== 1 ? "s" : ""}`;
  if (h) return `${h} hour${h !== 1 ? "s" : ""}`;
  return `${m} minute${m !== 1 ? "s" : ""}`;
}

export function formatMiles(n) {
  if (n == null) return "0 miles";
  const rounded = Math.round(n);
  return `${rounded.toLocaleString()} mile${rounded !== 1 ? "s" : ""}`;
}

export function formatNumber(n, suffix = "") {
  if (n == null) return `0${suffix}`;
  return `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
}

const FLUID_OUNCES_PER_UNIT = {
  ounces: 1,
  pints: 16,
  quarts: 32,
  gallons: 128,
};

export function convertFluidQuantity(value, fromUnit, toUnit) {
  const numeric = Number(value);
  const from = String(fromUnit || "").toLowerCase();
  const to = String(toUnit || "").toLowerCase();
  if (!Number.isFinite(numeric) || !FLUID_OUNCES_PER_UNIT[from] || !FLUID_OUNCES_PER_UNIT[to]) return null;
  return numeric * FLUID_OUNCES_PER_UNIT[from] / FLUID_OUNCES_PER_UNIT[to];
}

export function isFluidLowStock(fluid) {
  if (!fluid || fluid.enable_low_stock_alerts === false || fluid.quantity == null || fluid.minimum_stock == null) return false;
  const stockUnit = String(fluid.unit || "").toLowerCase();
  const minimumUnit = String(fluid.minimum_stock_unit || fluid.unit || "").toLowerCase();
  if (!stockUnit || !minimumUnit) return false;
  const minimumInStockUnit = convertFluidQuantity(fluid.minimum_stock, minimumUnit, stockUnit);
  if (minimumInStockUnit == null) return false;
  return Number(fluid.quantity) <= minimumInStockUnit + 1e-9;
}

export function easternTodayText() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function workOrderAnchorDate(workOrder) {
  return workOrder?.started_date || String(workOrder?.migration_source_created_date || workOrder?.created_date || "").slice(0, 10);
}

export function workOrderAgeDays(workOrder, todayText = easternTodayText()) {
  const anchor = workOrderAnchorDate(workOrder);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor || "")) return null;
  const diff = Math.floor((Date.parse(`${todayText}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / 86400000);
  return Number.isFinite(diff) ? Math.max(0, diff) : null;
}

export function isWorkOrderPastProjected(workOrder, todayText = easternTodayText()) {
  return !["completed", "cancelled"].includes(workOrder?.status) && !!workOrder?.projected_completion_date && workOrder.projected_completion_date < todayText;
}

export function formatTime(iso, timeZone) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true,
      timeZone: timeZone || undefined
    });
  } catch { return ""; }
}

export function formatDateShort(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
  } catch { return ""; }
}

export function formatDateTimeShort(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
  } catch { return ""; }
}

export function formatRelativeDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const diffDays = Math.floor((today.setHours(0,0,0,0) - new Date(d).setHours(0,0,0,0)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "2-digit" });
}

export function groupTripsByDay(trips) {
  const groups = {};
  for (const t of trips) {
    const day = new Date(t.startTime).toDateString();
    if (!groups[day]) groups[day] = [];
    groups[day].push(t);
  }
  return Object.keys(groups).sort((a, b) => new Date(b) - new Date(a)).map(day => {
    const dayTrips = groups[day];
    const total = dayTrips.reduce((s, t) => s + (t.distance || 0), 0);
    return { day, trips: dayTrips, totalMiles: total };
  });
}

export function monthLabel(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function buildWeeklyRanges(daysBack) {
  const ranges = [];
  const now = new Date();
  let end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - daysBack);
  let cursor = new Date(start);
  while (cursor < end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + 7);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    ranges.push({
      "starts-after": cursor.toISOString(),
      "ends-before": chunkEnd.toISOString()
    });
    cursor = new Date(chunkEnd);
  }
  return ranges;
}

export function computeStats(trips, avgBy) {
  const tripCount = trips.length;
  if (tripCount === 0) {
    return {
      driving: { distance: { total: 0, avg: 0 }, travelTime: { total: 0, avg: 0 }, idleTime: { total: 0, avg: 0 } },
      fuel: { fuelUsed: { total: 0, avg: 0 }, fuelEconomy: null },
      speed: { movingSpeed: 0, overallSpeed: 0, highestTripSpeed: 0 },
      habits: { rapidAccel: { total: 0, avg: 0 }, hardBraking: { total: 0, avg: 0 } }
    };
  }

  const totalDistance = trips.reduce((s, t) => s + (t.distance || 0), 0);
  const totalTravelSeconds = trips.reduce((s, t) => {
    if (t.startTime && t.endTime) return s + (new Date(t.endTime) - new Date(t.startTime)) / 1000;
    return s;
  }, 0);
  const totalIdleSeconds = trips.reduce((s, t) => s + (t.totalIdleDuration || 0), 0);
  const totalFuel = trips.reduce((s, t) => s + (t.fuelConsumed || 0), 0);
  const totalHardAccel = trips.reduce((s, t) => s + (t.hardAccelerationCount || 0), 0);
  const totalHardBrake = trips.reduce((s, t) => s + (t.hardBrakingCount || 0), 0);
  const maxSpeed = Math.max(...trips.map(t => t.maxSpeed || 0));
  const movingSpeeds = trips.filter(t => t.averageSpeed && t.distance > 0).map(t => t.averageSpeed);
  const overallSpeed = totalTravelSeconds > 0 ? (totalDistance / (totalTravelSeconds / 3600)) : 0;
  const movingSpeed = movingSpeeds.length ? movingSpeeds.reduce((s, v) => s + v, 0) / movingSpeeds.length : 0;

  let divisor = tripCount;
  if (avgBy === "day") {
    const days = new Set(trips.map(t => new Date(t.startTime).toDateString()));
    divisor = days.size || 1;
  } else if (avgBy === "week") {
    const weeks = new Set(trips.map(t => {
      const d = new Date(t.startTime);
      const onejan = new Date(d.getFullYear(), 0, 1);
      return Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    }));
    divisor = weeks.size || 1;
  }

  return {
    driving: {
      distance: { total: totalDistance, avg: totalDistance / divisor },
      travelTime: { total: totalTravelSeconds, avg: totalTravelSeconds / divisor },
      idleTime: { total: totalIdleSeconds, avg: totalIdleSeconds / divisor }
    },
    fuel: {
      fuelUsed: { total: totalFuel, avg: totalFuel / divisor },
      fuelEconomy: totalFuel > 0 ? totalDistance / totalFuel : null
    },
    speed: {
      movingSpeed,
      overallSpeed,
      highestTripSpeed: maxSpeed
    },
    habits: {
      rapidAccel: { total: totalHardAccel, avg: totalHardAccel / divisor },
      hardBraking: { total: totalHardBrake, avg: totalHardBrake / divisor }
    }
  };
}

export function notificationIcon(eventType) {
  const map = {
    mil: Wrench, battery: Battery, fuel: Fuel,
    connect: Power, disconnect: Power,
    tripStart: Car, tripEnd: Car, tripData: RouteIcon, tripMetrics: Activity,
    userGeozone: MapPin, applicationGeozone: MapPin,
    vinChange: Cpu
  };
  return map[eventType] || AlertTriangle;
}

export function notificationIconColor(eventType, severity) {
  if (severity === "critical") return "#dc3545";
  if (severity === "warning") return "#ff9800";
  return "#2b73ff";
}