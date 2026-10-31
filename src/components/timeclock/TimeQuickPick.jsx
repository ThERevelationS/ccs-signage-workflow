import { useState } from "react";
import { Input } from "@/components/ui/input";

// Kiosk-friendly date+time picker shared by the Time Clock correction dialogs.
// Most claims are "yesterday at shift end" or "this morning at start" ??? day
// chips + big time buttons cover that in two taps; the native datetime input
// stays behind a toggle for odd cases.
export const SHIFT_END_TIMES = ["15:30", "16:00", "16:30", "17:00", "17:30", "18:00"];
export const SHIFT_START_TIMES = ["06:30", "07:00", "07:30", "08:00", "08:30", "09:00"];

const pad = (n) => String(n).padStart(2, "0");

function dayLabel(offset) {
  if (offset === 0) return "Today";
  if (offset === 1) return "Yesterday";
  if (offset === 2) return "2 days ago";
  return `${offset} days ago`;
}

export default function TimeQuickPick({
  value,
  onChange,
  disabled,
  clockIn,
  times = SHIFT_END_TIMES,
  dayOffsets,
  confirmLabel = "Set to",
  inputId = "time-quick-pick-custom",
}) {
  const [dayOffset, setDayOffset] = useState(dayOffsets?.[0] ?? 1); // default: yesterday (or first provided)
  const [showCustom, setShowCustom] = useState(false);
  const clockInDate = clockIn ? new Date(clockIn) : null;
  const clockInDay = clockInDate && !isNaN(clockInDate) ? Math.floor((Date.now() - clockInDate.getTime()) / 86400000) : null;
  const maxDay = clockInDay != null ? Math.min(7, clockInDay) : 7;

  const emit = (offset, time) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}`);
  };

  const chips = dayOffsets || (() => { const out = []; for (let d = 1; d <= Math.max(1, maxDay); d += 1) out.push(d); return out; })();

  return (
    <div className="mt-3">
      {chips.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((d) => (
            <button key={d} type="button" disabled={disabled} onClick={() => { setDayOffset(d); setShowCustom(false); }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${dayOffset === d && !showCustom ? "border-amber-600 bg-amber-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-amber-400"}`}>
              {dayLabel(d)}
            </button>
          ))}
        </div>
      )}
      {!showCustom && (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {times.map((t) => {
            const [h, m] = t.split(":").map(Number);
            const hr12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
            const suffix = h >= 12 ? "PM" : "AM";
            return (
              <button key={t} type="button" disabled={disabled} onClick={() => emit(dayOffset, t)}
                className="rounded-lg border border-slate-300 bg-white py-2 text-sm font-semibold text-slate-700 hover:border-amber-500 hover:bg-amber-50 disabled:opacity-50">
                {hr12}:{pad(m)} {suffix}
              </button>
            );
          })}
          <button type="button" disabled={disabled} onClick={() => setShowCustom(true)}
            className="rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-500 hover:border-amber-400">
            Other time???
          </button>
        </div>
      )}
      {showCustom && (
        <Input
          id={inputId}
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="mt-2 bg-white dark:bg-slate-900"
        />
      )}
      {value && !showCustom && (
        <p className="mt-1.5 text-xs font-medium text-amber-800">
          {confirmLabel} {new Date(value.replace("T", " ")).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}

