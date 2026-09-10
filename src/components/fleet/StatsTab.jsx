import { formatDuration, formatMiles, computeStats } from "./fleetHelpers";
import { Loader2 } from "lucide-react";

const RANGES = [
  { label: "7 Days", days: 7 },
  { label: "30 Days", days: 30 },
  { label: "90 Days", days: 90 },
];

const AVG_OPTIONS = [
  { key: "trip", label: "Trip" },
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
];

export default function StatsTab({ trips, loading, daysBack, onDaysBackChange, avgBy, onAvgByChange }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const stats = computeStats(trips, avgBy);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">Viewing Last {daysBack} Days</span>
        <div className="relative">
          <select
            value={daysBack}
            onChange={(e) => onDaysBackChange(Number(e.target.value))}
            className="appearance-none pl-3 pr-8 py-1.5 text-xs font-semibold rounded border border-indigo-500 bg-white dark:bg-slate-950 text-indigo-600 dark:text-indigo-300"
          >
            {RANGES.map(r => <option key={r.days} value={r.days}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {/* Average By toggle */}
      <div className="flex gap-1 mb-5 p-1 rounded bg-gray-100 dark:bg-slate-800">
        {AVG_OPTIONS.map(o => (
          <button
            key={o.key}
            onClick={() => onAvgByChange(o.key)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${avgBy === o.key ? "bg-indigo-600 text-white" : "text-gray-500 dark:text-slate-400"}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <Section title="Driving">
        <Row label="Distance" total={formatMiles(stats.driving.distance.total)} avg={formatMiles(stats.driving.distance.avg)} />
        <Row label="Travel Time" total={formatDuration(stats.driving.travelTime.total)} avg={formatDuration(stats.driving.travelTime.avg)} />
        <Row label="Idle Time" total={formatDuration(stats.driving.idleTime.total)} avg={formatDuration(stats.driving.idleTime.avg)} />
      </Section>

      <Section title="Fuel">
        <Row label="Fuel Used" total={`${Math.round(stats.fuel.fuelUsed.total)} gallons`} avg={`${Math.round(stats.fuel.fuelUsed.avg)} gallons`} />
        <Row label="Fuel Economy" value={stats.fuel.fuelEconomy != null ? `${Math.round(stats.fuel.fuelEconomy)} mpg` : "—"} align="right" />
      </Section>

      <Section title="Speed">
        <Row label="Moving Speed" value={`${Math.round(stats.speed.movingSpeed)} mph`} align="right" />
        <Row label="Overall Speed" value={`${Math.round(stats.speed.overallSpeed)} mph`} align="right" />
        <Row label="Highest Trip Speed" value={`${Math.round(stats.speed.highestTripSpeed)} mph`} align="right" />
      </Section>

      <Section title="Habits">
        <Row label="Rapid Acceleration" total={`${stats.habits.rapidAccel.total} events`} avg={`${stats.habits.rapidAccel.avg.toFixed(2)} events`} />
        <Row label="Hard Braking" total={`${stats.habits.hardBraking.total} events`} avg={`${stats.habits.hardBraking.avg.toFixed(2)} events`} />
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-bold uppercase tracking-wide mb-2 text-gray-600 dark:text-slate-300">{title}</h3>
      <div className="border border-gray-200 dark:border-slate-700 rounded overflow-hidden">
        <div className="flex bg-gray-100 dark:bg-slate-800 text-xs font-semibold text-gray-500 dark:text-slate-400 px-3 py-2">
          <div className="flex-1"></div>
          <div className="w-24 text-right">TOTAL</div>
          <div className="w-24 text-right">AVERAGE</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Row({ label, total, avg, value }) {
  return (
    <div className="flex items-center px-3 py-2.5 border-t border-gray-100 dark:border-slate-800 text-sm">
      <div className="flex-1 text-gray-700 dark:text-slate-300">{label}</div>
      {value !== undefined ? (
        <div className="w-48 text-right font-medium text-gray-900 dark:text-slate-100">{value}</div>
      ) : (
        <>
          <div className="w-24 text-right text-gray-900 dark:text-slate-100">{total}</div>
          <div className="w-24 text-right text-gray-500 dark:text-slate-400">{avg}</div>
        </>
      )}
    </div>
  );
}