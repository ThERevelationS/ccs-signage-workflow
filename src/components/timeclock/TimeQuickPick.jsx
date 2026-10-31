import { useState } from "react";
import { Input } from "@/components/ui/input";

// Kiosk-friendly picker shared by every Time Clock date/time entry point.
// Most claims are "yesterday at shift end" or "this morning at start" ??? day
// chips + big time buttons cover that in two taps; the native input stays
// behind a toggle for odd cases.
//   mode="datetime"  day chips + time chips ??? "YYYY-MM-DDTHH:MM" (default)
//   mode="date"      day chips only         ??? "YYYY-MM-DD"
//   mode="time"      time chips only        ??? "HH:MM"
// dayOffsets > 0 are days in the past; < 0 are days ahead (-1 = tomorrow).
export const SHIFT_END_TIMES = ["15:30", "16:00", "16:30", "17:00", "17:30", "18:00"];
export const SHIFT_START_TIMES = ["06:30", "07:00", "07:30", "08:00", "08:30", "09:00"];
export const WORKDAY_TIMES = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

const pad = (n) => String(n).padStart(2, "0");

function dayLabel(offset) {
  if (offset === 0) return "Today";
  if (offset === 1) return "Yesterday";
  if (offset === -1) return "Tomorrow";
  return offset > 0 ? `${offset} days ago` : `In ${-offset} days`;
}

const dateAt = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d;
};

export default function TimeQuickPick({
  value,
  onChange,
  disabled,
  clockIn,
  mode = "datetime",
  times = SHIFT_END_TIMES,
  dayOffsets,
  confirmLabel = "Set to",
  inputId = "time-quick-pick-custom",
}) {
  const isDate = mode === "date";
  const isTime = mode === "time";
  const [dayOffset, setDayOffset] = useState(dayOffsets?.[0] ?? 1); // default: yesterday (or first provided)
  const [showCustom, setShowCustom] = useState(false);
  const clockInDate = clockIn ? new Date(clockIn) : null;
  const clockInDay = clockInDate && !isNaN(clockInDate) ? Math.floor((Date.now() - clockInDate.getTime()) / 86400000) : null;
  const maxDay = clockInDay != null ? Math.min(7, clockInDay) : 7;

  const emit = (offset, time) => {
    if (isTime) { onChange(time); return; }
    const d = dateAt(offset);
    const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (isDate) { onChange(ymd); return; }
    const [h, m] = time.split(":").map(Number);
    onChange(`${ymd}T${pad(h)}:${pad(m)}`);
  };

  const chips = dayOffsets || (() => { const out = []; for (let d = 1; d <= Math.max(1, maxDay); d += 1) out.push(d); return out; })();
  const inputType = isDate ? "date" : isTime ? "time" : "datetime-local";
  const confirmText = value
    ? isTime
      ? value
      : new Date(isDate ? `${value}T12:00` : value.replace("T", " ")).toLocaleString(undefined, isDate
          ? { weekday: "short", month: "short", day: "numeric" }
          : { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <div className="mt-3">
      {!isTime && chips.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((d) => (
            <button key={d} type="button" disabled={disabled}
              onClick={() => { setDayOffset(d); setShowCustom(false); if (isDate) emit(d); }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${dayOffset === d && !showCustom ? "border-amber-600 bg-amber-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-amber-400"}`}>
              {dayLabel(d)}
            </button>
          ))}
        </div>
      )}
      {!showCustom && !isDate && (
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
      {(showCustom || isDate) && (
        <div className="mt-2">
          {isDate && (
            <button type="button" disabled={disabled} onClick={() => setShowCustom((v) => !v)}
              className={`mb-2 rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium hover:border-amber-400 ${showCustom ? "border-amber-400 text-amber-700" : "border-slate-300 text-slate-500"}`}>
              {showCustom ? "Back to quick picks" : "Other date???"}
            </button>
          )}
          {showCustom && (
            <Input
              id={inputId}
              type={inputType}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              className="bg-white dark:bg-slate-900"
            />
          )}
        </div>
      )}
      {value && !showCustom && (
        <p className="mt-1.5 text-xs font-medium text-amber-800">
          {confirmLabel} {confirmText}
        </p>
      )}
    </div>
  );
}

