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
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">Viewing Last {daysBack} Days</span>
        <select
          value={daysBack}
          onChange={(e) => onDaysBackChange(Number(e.target.value))}
          className="min-h-11 w-full rounded-lg border border-indigo-500 bg-white px-3 text-xs font-semibold text-indigo-600 dark:bg-slate-950 dark:text-indigo-300 sm:w-auto"
          aria-label="Statistics history range"
        >
          {RANGES.map(r => <option key={r.days} value={r.days}>{r.label}</option>)}
        </select>
      </div>

      {/* Average By toggle */}
      <div className="mb-5 flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-slate-800" role="group" aria-label="Average statistics by">
        {AVG_OPTIONS.map(o => (
          <button
            type="button"
            key={o.key}
            onClick={() => onAvgByChange(o.key)}
            aria-pressed={avgBy === o.key}
            className={`min-h-11 flex-1 rounded-md px-2 text-xs font-semibold transition-colors ${avgBy === o.key ? "bg-indigo-600 text-white" : "text-gray-500 dark:text-slate-400"}`}
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
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300">{title}</h3>
      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700">
        <div className="hidden bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-500 dark:bg-slate-800 dark:text-slate-400 sm:grid sm:grid-cols-[minmax(0,1fr)_6rem_6rem]">
          <div />
          <div className="text-right">TOTAL</div>
          <div className="text-right">AVERAGE</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Row({ label, total = "", avg = "", value = undefined, align = "right" }) {
  return (
    <div className="border-t border-gray-100 px-3 py-3 text-sm first:border-t-0 dark:border-slate-800 sm:grid sm:min-h-11 sm:grid-cols-[minmax(0,1fr)_6rem_6rem] sm:items-center sm:py-2.5">
      <div className="text-gray-700 dark:text-slate-300">{label}</div>
      {value !== undefined ? (
        <div className={`mt-1 font-medium text-gray-900 dark:text-slate-100 sm:col-span-2 sm:mt-0 ${align === "left" ? "text-left" : "text-right"}`}>{value}</div>
      ) : (
        <>
          <div className="mt-1 flex items-baseline justify-between gap-3 sm:contents">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 sm:hidden">Total</span>
            <span className="text-right text-gray-900 dark:text-slate-100">{total}</span>
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-gray-400 sm:hidden">Avg</span>
            <span className="text-right text-gray-500 dark:text-slate-400">{avg}</span>
          </div>
        </>
      )}
    </div>
  );
}