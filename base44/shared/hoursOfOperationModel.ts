// Hours-of-operation model — pure TS, zero entity/io imports. Safe to import
// from Deno functions (base44/functions/*) and from frontend modules.
// (ESTIMATOR_MASTERPLAN K-01; implements the two-clock half of A-21.)
//
// Two clocks (GlobalSettings.hoursOfOperation — see A-21 schema):
//   "production" — the shop clock. DEADLINE / DUE-DATE MATH RUNS ON THIS
//                  CLOCK (CoreBridge parity: production "start/day" shifts).
//   "sales"      — the sales-center (counter) clock. FOLLOW-UP SCHEDULING
//                  MATH RUNS ON THIS CLOCK (CoreBridge "open/close" counter
//                  hours).
// The two never mix: a promise to build is measured in shop days; a promise
// to call the customer back is measured in counter days.
//
// Where the schedule comes from (hoursFor resolution order):
//   1. location  — a SalesLocation row may carry per-location hours. The
//      `hours` column is a free-text string (LocationsPanel writes e.g.
//      "M-F 8-5"); it is honored when it holds JSON of any accepted shape or
//      a parseable shorthand ("mon-fri 8-5", "daily 7:00-17:00; sun closed",
//      "24/7"). Kind-specific structured fields (location.production_hours /
//      location.sales_center_hours / location.sales_hours / nested
//      location.hoursOfOperation.<key>) outrank the generic `hours` string.
//      Free text that does not parse is ignored — never blocks fallback.
//   2. settings  — GlobalSettings.hoursOfOperation.{sales_center_hours,
//      production_hours} (snake_case + camelCase spellings). `settings` may
//      be a GlobalSettings KV row ({setting_key, setting_value}), the row's
//      setting_value, an ARRAY of KV rows (merged by setting_key), or a
//      flat object holding the keys directly.
//   3. defaults  — DEFAULT_PRODUCTION_HOURS (Mon–Fri 07:00–17:00) or
//      DEFAULT_SALES_HOURS (Mon–Fri 08:00–17:00).
//
// Canonical WeeklySchedule (what hoursFor returns):
//   { kind, source, name, days, holidays }
//   days     — DayWindow[7]: index = JS getDay() (0=Sun..6=Sat); each element
//              is an array of { open:"HH:MM", close:"HH:MM" } windows.
//              CLOSED DAY = EMPTY ARRAY ([]). Windows are 24h wall-clock
//              local times; a window with close <= open spans midnight
//              (e.g. {open:"22:00",close:"06:00"}); "24:00" is a valid close.
//   holidays — "YYYY-MM-DD" list of full-day closures.
//   source   — "location" | "settings" | "default" (which tier produced it).
//
// Accepted input shapes (normalizeSchedule — every public function accepts
// any of these, so callers can pass raw settings blobs straight in):
//   A. canonical: { days: DayWindow[7][], holidays? }  (+metadata keys ignored)
//   B. entries array (dueDateEngine.clockFromHours-compatible, superset):
//      [ { day|days|day_of_week|days_of_week|weekday|weekdays: name|0-6|[..],
//          open|start|from|opens: "HH:MM", close|end|to|closes: "HH:MM",
//          windows|shifts|ranges: [ {open,close} | "HH:MM-HH:MM" .. ],
//          closed|off: true, open: false },
//        { date|holiday|holiday_date: "YYYY-MM-DD" } ]
//      An entry with times but no day key applies to EVERY day (daily).
//      A bare day name/index in the array marks that day all-day-open.
//   C. keyed map: { mon:{open,close}|"HH:MM-HH:MM"|[windows]|null|false,
//                   weekdays: "..", weekend: "..", daily: "..",
//                   holidays|holiday_dates|closed_dates: ["YYYY-MM-DD"] }
//   D. JSON string of A/B/C, or shorthand free text (see parseHoursString).
//
// Restriction semantics (mirrors dueDateEngine.openDaySet — a schedule that
// opens nowhere must not freeze deadline math forever):
//   - zero windows + zero holidays → UNRESTRICTED: every day open, all hours
//     count (calendar-day math; addBusinessDays degrades to plain day adds).
//   - zero windows + holidays    → every day open except listed holidays.
//   - windows present            → windows decide; holidays still close days.
//   - an input that yields no windows and no holidays normalizes to null —
//     "not a schedule" — so hoursFor falls through to the next tier.
//
// Boundary semantics: a window covers [open, close) — open instant inclusive,
// close instant exclusive. Day-boundary "24:00" equals next-day "00:00".
//
// Business-day arithmetic (addBusinessDays / dueDateWithClock /
// followUpDateWithClock) counts WHOLE DAYS and skips closed days entirely —
// a business day is a day with any open window; the hours inside it are not
// prorated (documented K-01 decision, matches dueDateEngine.addLeadDays
// business mode: counting starts the day AFTER the anchor; N=0 returns the
// anchor unchanged even when it is a closed day).
//
// INTEGRATION NOTES
//   dueDateEngine — do NOT edit it; it already takes clocks. Bridge:
//     import { hoursFor, toDueDateClock, dueDateWithClock } from
//       "../shared/hoursOfOperationModel";
//     computeProductDueDate({
//       ...args,
//       clock:        toDueDateClock(hoursFor(loc, { settings, kind: "production" })),
//       design_clock: toDueDateClock(hoursFor(loc, { settings, kind: "sales" })),
//     });
//     // or for a bare lead-day add: dueDateWithClock(product, { lead_days, now, schedule })
//     // returns "YYYY-MM-DD" — the same store format the engine emits.
//   followUpMachine — it schedules next_due_at as anchor + delay*DAY_MS
//     (calendar). To run follow-ups on the sales clock, stamp the patch's
//     next_due_at / the FU1 due test with
//       followUpDateWithClock(sent_at, delay_days, hoursFor(loc, { settings, kind: "sales" }))
//     which returns an ISO instant that also lands inside open hours.

export const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

// Canonical clock kinds. Accepted aliases (normalizeKind): production/prod/
// shop/deadline → "production"; sales/sales_center/sales-center/counter/
// follow_up → "sales".
export const HOURS_KINDS = { PRODUCTION: "production", SALES: "sales" } as const;

// Every spelling that resolves to a weekday index (0=Sun..6=Sat). Single
// letters cover the "M-F" shorthand the LocationsPanel placeholder suggests.
export const DAY_INDEX: Record<string, number> = {
  sun: 0, sunday: 0, su: 0,
  mon: 1, monday: 1, m: 1, mo: 1,
  tue: 2, tues: 2, tuesday: 2, t: 2, tu: 2,
  wed: 3, wednesday: 3, w: 3, we: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, th: 4,
  fri: 5, friday: 5, f: 5, fr: 5,
  sat: 6, saturday: 6, sa: 6,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ALL_DAY_OPEN = "00:00";
const ALL_DAY_CLOSE = "24:00";
// nextOpen scans at most this many days ahead before reporting "never opens"
// (a schedule with windows always opens within a week; the cap is for
// pathological inputs only).
const MAX_SCAN_DAYS = 370;
// businessHoursBetween refuses to iterate beyond ~100 years of days.
const MAX_SPAN_DAYS = 36600;

const pad2 = (n: number) => String(n).padStart(2, "0");

// "Bare" = written without ':' or a meridian marker ("8", 8) — eligible for
// the business-shorthand inference where a trailing hour that reads
// earlier-or-equal to a morning start is pm ("8-5" → 08:00-17:00). Explicit
// "22:00-06:00" keeps its overnight meaning; "00:00-00:00" stays all-day.
const isBareTimeText = (v: any): boolean =>
  typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !/[:ap]/i.test(v));

// Apply the bare-hour inference to a resolved (open, close) minute pair.
const inferPmClose = (o: number, c: number, bothBare: boolean): number =>
  bothBare && o < 720 && c <= o && !(o === 0 && c === 0) && c <= 720 ? c + 720 : c;

export const DEFAULT_PRODUCTION_HOURS = Object.freeze({
  kind: "production",
  source: "default",
  name: "default_production_hours",
  days: Object.freeze([
    Object.freeze([]),                                                       // sun
    Object.freeze([Object.freeze({ open: "07:00", close: "17:00" })]),       // mon
    Object.freeze([Object.freeze({ open: "07:00", close: "17:00" })]),       // tue
    Object.freeze([Object.freeze({ open: "07:00", close: "17:00" })]),       // wed
    Object.freeze([Object.freeze({ open: "07:00", close: "17:00" })]),       // thu
    Object.freeze([Object.freeze({ open: "07:00", close: "17:00" })]),       // fri
    Object.freeze([]),                                                       // sat
  ]),
  holidays: Object.freeze([]),
});

export const DEFAULT_SALES_HOURS = Object.freeze({
  kind: "sales",
  source: "default",
  name: "default_sales_hours",
  days: Object.freeze([
    Object.freeze([]),                                                       // sun
    Object.freeze([Object.freeze({ open: "08:00", close: "17:00" })]),       // mon
    Object.freeze([Object.freeze({ open: "08:00", close: "17:00" })]),       // tue
    Object.freeze([Object.freeze({ open: "08:00", close: "17:00" })]),       // wed
    Object.freeze([Object.freeze({ open: "08:00", close: "17:00" })]),       // thu
    Object.freeze([Object.freeze({ open: "08:00", close: "17:00" })]),       // fri
    Object.freeze([]),                                                       // sat (closed)
  ]),
  holidays: Object.freeze([]),
});

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

const finite = (value: any): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const nonNegInt = (value: any): number => {
  const n = finite(value);
  return n === undefined ? 0 : Math.max(0, Math.round(n));
};

// Any parseable input → local Date; date-only "YYYY-MM-DD" parses as local
// midnight (bare `new Date(str)` would be UTC — repo convention, same as
// dueDateEngine.toLocalDate / followUpMachine.toInstant). Invalid → null.
export function toLocalDate(value: any): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  const v = String(value ?? "").trim();
  if (!v) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toDateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const parseDateOnly = (value: any): string => {
  const d = toLocalDate(value);
  return d ? toDateOnly(d) : "";
};

const toIso = (d: Date): string => d.toISOString();

const dayIndex = (value: any): number | undefined => {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6) return value;
  const key = String(value ?? "").trim().toLowerCase();
  return key ? DAY_INDEX[key] : undefined;
};

// Expand a day spec into weekday indexes. Accepts single names/indexes,
// arrays, comma/slash-separated lists ("mon/wed/fri"), and ranges
// ("mon-fri", "fri-mon" wraps through the weekend, "m-f").
function expandDaySpec(value: any): number[] {
  if (Array.isArray(value)) {
    const out: number[] = [];
    for (const item of value) out.push(...expandDaySpec(item));
    return out;
  }
  const single = dayIndex(value);
  if (single !== undefined) return [single];
  const text = String(value ?? "").trim().toLowerCase()
    .replace(/\bto\b/g, "-")
    .replace(/\s*[-–—]\s*/g, "-");
  if (!text) return [];
  const out: number[] = [];
  for (const token of text.split(/[\s,/]+/)) {
    if (!token) continue;
    const range = token.split(/[-–—]/);
    if (range.length === 2) {
      const a = dayIndex(range[0]);
      const b = dayIndex(range[1]);
      if (a !== undefined && b !== undefined) {
        let i = a;
        for (;;) {
          out.push(i);
          if (i === b) break;
          i = (i + 1) % 7;
        }
        continue;
      }
    }
    const idx = dayIndex(token);
    if (idx !== undefined) out.push(idx);
  }
  return out;
}

// A clock time → minutes after local midnight (0..1440). Accepts "HH:MM",
// "H:MM", "8", "17", 8, 17.5 (→17:30), compact "800"/"1730", meridian
// spellings "8a"/"5pm"/"8:30 am", and "24:00" (valid as a close only —
// `allowEnd` distinguishes). Invalid → undefined.
function timeToMinutes(value: any, allowEnd = true): number | undefined {
  if (value === null || value === undefined || value === false) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    // 800/1730-style compact numbers when the hour reading is impossible.
    if (value >= 100 && Number.isInteger(value)) {
      const h = Math.floor(value / 100);
      const m = value % 100;
      if (m < 60 && ((h >= 0 && h < 24) || (allowEnd && h === 24 && m === 0))) {
        return h * 60 + m;
      }
    }
    if (value >= 0 && (value < 24 || (allowEnd && value === 24))) {
      return Math.round(value * 60);
    }
    return undefined;
  }
  const raw = String(value).trim().toLowerCase();
  if (!raw) return undefined;
  const m = raw.match(/^(\d{1,4})(?::([0-5]?\d))?\s*(a|am|p|pm)?$/);
  if (!m) return undefined;
  let hour = Number(m[1]);
  let minute = m[2] ? Number(m[2]) : 0;
  const meridian = m[3] ?? "";
  if (!m[2] && hour >= 100) {
    // Compact "1730"/"800" — only when the plain-hour reading is impossible
    // AND no meridian marker was given.
    if (!meridian) {
      const h = Math.floor(hour / 100);
      const mm = hour % 100;
      if (mm < 60 && h < 24) {
        hour = h;
        minute = mm;
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }
  if (meridian) {
    if (hour === 12) hour = 0;
    if (meridian[0] === "p") hour += 12;
  }
  if (minute > 59) return undefined;
  if (hour === 24 && minute === 0) return allowEnd ? 1440 : undefined;
  if (hour < 0 || hour > 23) return undefined;
  return hour * 60 + minute;
}

const minutesToHHMM = (mins: number): string => `${pad2(Math.floor(mins / 60) % 25)}:${pad2(mins % 60)}`;

// One window spec → canonical {open:"HH:MM", close:"HH:MM"}. Accepts
// {open|start|from|opens, close|end|to|closes}, "HH:MM-HH:MM" strings, and
// bare numbers treated as the open hour of an all-day window is NOT a thing —
// a lone number/string without a range is invalid (returns null).
function normalizeWindow(value: any): { open: string; close: string } | null {
  if (value === null || value === undefined || value === false) return null;
  if (typeof value === "string") {
    const parts = value.split(/[-–—]/);
    if (parts.length === 2) {
      const o = timeToMinutes(parts[0]);
      const cRaw = timeToMinutes(parts[1]);
      if (o !== undefined && cRaw !== undefined) {
        const c = inferPmClose(o, cRaw, isBareTimeText(parts[0]) && isBareTimeText(parts[1]));
        return { open: minutesToHHMM(o), close: minutesToHHMM(c) };
      }
    }
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const oRaw = value.open ?? value.start ?? value.from ?? value.opens ?? value.start_time;
  const cRaw = value.close ?? value.end ?? value.to ?? value.closes ?? value.end_time;
  // A single "open" field containing a range string ("08:00-17:00").
  if (cRaw === undefined && typeof oRaw === "string" && /[-–—]/.test(oRaw)) {
    return normalizeWindow(oRaw);
  }
  const o = timeToMinutes(oRaw);
  const c0 = timeToMinutes(cRaw);
  if (o === undefined || c0 === undefined) return null;
  const c = inferPmClose(o, c0, isBareTimeText(oRaw) && isBareTimeText(cRaw));
  return { open: minutesToHHMM(o), close: minutesToHHMM(c) };
}

// Extract the day-keyed spec from an entries-form object, plus its windows.
const ENTRY_DAY_KEYS = ["day", "days", "day_of_week", "days_of_week", "weekday", "weekdays", "day_name"];
const ENTRY_WINDOW_KEYS = ["windows", "shifts", "ranges", "times"];
const ENTRY_CLOSED = (e: any) => e.closed === true || e.off === true || e.open === false;

function entryWindows(e: any): { open: string; close: string }[] {
  const out: { open: string; close: string }[] = [];
  for (const key of ENTRY_WINDOW_KEYS) {
    const v = e[key];
    for (const item of Array.isArray(v) ? v : [v]) {
      const w = normalizeWindow(item);
      if (w) out.push(w);
    }
  }
  const w = normalizeWindow(e);
  if (w) out.push(w);
  return out;
}

const sortWindows = (windows: { open: string; close: string }[]) =>
  windows.sort((a, b) => (a.open < b.open ? -1 : a.open > b.open ? 1 : a.close < b.close ? -1 : 1));

const windowMinutes = (w: { open: string; close: string }) => ({
  o: timeToMinutes(w.open) ?? 0,
  c: timeToMinutes(w.close, true) ?? 0,
});

// Entries-array form → canonical {days, holidays}. `recognized` counts
// entries that contributed anything; the caller decides nullability.
function entriesToSchedule(entries: any[]): { days: { open: string; close: string }[][]; holidays: string[]; recognized: number } {
  const days: { open: string; close: string }[][] = [[], [], [], [], [], [], []];
  const holidays = new Set<string>();
  let recognized = 0;
  for (const entry of entries) {
    if (entry === null || entry === undefined) continue;
    if (typeof entry !== "object" || entry instanceof Date) {
      const idx = dayIndex(entry);
      if (idx !== undefined) {
        days[idx].push({ open: ALL_DAY_OPEN, close: ALL_DAY_CLOSE });
        recognized += 1;
      }
      continue;
    }
    const holiday = parseDateOnly(entry.date ?? entry.holiday ?? entry.holiday_date ?? "");
    if (holiday) {
      holidays.add(holiday);
      recognized += 1;
    }
    let idxs: number[] = [];
    for (const key of ENTRY_DAY_KEYS) {
      if (entry[key] !== undefined) idxs = idxs.concat(expandDaySpec(entry[key]));
    }
    const groupFlags: number[] = [];
    if (entry.weekend === true || entry.weekends === true) groupFlags.push(0, 6);
    if (entry.weekdays === true || entry.weekday === true) groupFlags.push(1, 2, 3, 4, 5);
    if (entry.daily === true || entry.everyday === true || entry.all_days === true) groupFlags.push(0, 1, 2, 3, 4, 5, 6);
    idxs = idxs.concat(groupFlags);
    const hasDaySpec = idxs.length > 0;
    const windows = entryWindows(entry);
    if (ENTRY_CLOSED(entry)) {
      // Explicit "closed" clears any windows already accumulated for the day
      // (lets "daily 8-5; sun closed" work). With no day spec it is a no-op.
      for (const i of new Set(idxs)) days[i] = [];
      if (hasDaySpec) recognized += 1;
      continue;
    }
    if (!windows.length) {
      // Day keys with no times mark those days all-day-open (mirrors the
      // bare-day-name primitive and dueDateEngine.clockFromHours semantics).
      if (hasDaySpec && !holiday) {
        for (const i of new Set(idxs)) days[i].push({ open: ALL_DAY_OPEN, close: ALL_DAY_CLOSE });
        recognized += 1;
      }
      continue;
    }
    // Times with no day spec = "daily" (documented).
    const targets = hasDaySpec ? new Set(idxs) : new Set([0, 1, 2, 3, 4, 5, 6]);
    for (const i of targets) days[i].push(...windows);
    recognized += 1;
  }
  for (const d of days) sortWindows(d);
  return { days, holidays: [...holidays].sort(), recognized };
}

// Shorthand free text → schedule. Handles what a human writes in a location
// "hours" box: "M-F 8-5", "mon-fri 8:00-17:00", "daily 7-5; sat 9-1; sun
// closed", "weekdays 8-5", "24/7". Segments split on ';' or newlines. A
// segment is [day-spec] [time-range | closed|off]; a missing day-spec means
// daily. Bare-hour ranges resolve "8-5" as 8:00–17:00 (trailing hour <= the
// start reads as pm). Unparseable → null.
export function parseHoursString(text: any): { days: { open: string; close: string }[][]; holidays: string[] } | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  if (/^(24[/-]?7|24\s*(hours?|hrs?)|always\s*open|open\s*24)/i.test(raw)) {
    const w = { open: ALL_DAY_OPEN, close: ALL_DAY_CLOSE };
    return { days: [[w], [w], [w], [w], [w], [w], [w]].map((d) => [...d]), holidays: [] };
  }
  if (/^(closed|by\s*appointment|appointment\s*only)/i.test(raw)) return null;
  const days: { open: string; close: string }[][] = [[], [], [], [], [], [], []];
  let recognized = 0;
  // Longest alternatives first so "fri" isn't clipped to "f"+"ri" etc.
  const DAY_TOKEN = "(?:sunday|saturday|monday|tuesday|wednesday|thursday|friday|tues|thur|thurs|sun|mon|tue|wed|thu|fri|sat|su|mo|tu|we|th|fr|sa|m|t|w|f)";
  const daySpecRe = new RegExp(
    `^(weekdays?|weekends?|daily|every\\s*day|all\\s*days?|((?:${DAY_TOKEN})(?:\\s*(?:[-–—]|\\s+to\\s+)\\s*(?:${DAY_TOKEN}))?(?:[\\s,/]+(?:${DAY_TOKEN})(?:\\s*(?:[-–—]|\\s+to\\s+)\\s*(?:${DAY_TOKEN}))?)*))\\b[\\s:.-]*`,
    "i",
  );
  const timeRe = /(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|am|pm|a|p)?)\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|am|pm|a|p)?)/i;
  for (const segment of raw.split(/[;\n]+/)) {
    let s = segment.trim();
    if (!s) continue;
    let idxs: number[] = [];
    const dayMatch = s.match(daySpecRe);
    if (dayMatch) {
      const spec = dayMatch[1].trim().toLowerCase();
      if (/^weekdays?$/.test(spec)) idxs = [1, 2, 3, 4, 5];
      else if (/^weekends?$/.test(spec)) idxs = [0, 6];
      else if (/^(daily|every\s*day|all\s*days?)$/.test(spec)) idxs = [0, 1, 2, 3, 4, 5, 6];
      else idxs = expandDaySpec(spec.replace(/\s*[-–—]\s*/g, "-"));
      s = s.slice(dayMatch[0].length);
    }
    if (/\b(closed|off|shut)\b/i.test(s) || /^\s*(closed|off)\s*$/i.test(s)) {
      if (!idxs.length) idxs = [0, 1, 2, 3, 4, 5, 6];
      for (const i of new Set(idxs)) days[i] = [];
      recognized += 1;
      continue;
    }
    const t = s.match(timeRe);
    if (!t) {
      // A day spec with no time ("sat") marks all-day-open, like the entries
      // form — but only when the segment consumed a day spec.
      if (idxs.length && !/[0-9]/.test(s)) {
        for (const i of new Set(idxs)) days[i].push({ open: ALL_DAY_OPEN, close: ALL_DAY_CLOSE });
        recognized += 1;
      }
      continue;
    }
    if (!idxs.length) idxs = [0, 1, 2, 3, 4, 5, 6];
    let o = timeToMinutes(t[1].replace(/\s/g, ""));
    const c0 = timeToMinutes(t[2].replace(/\s/g, ""));
    if (o === undefined || c0 === undefined) continue;
    // Bare-hour shorthand: "8-5" → 08:00-17:00 — a trailing hour that reads
    // earlier-or-equal to a morning start is pm (inferPmClose). Explicit
    // colon/meridian times keep their face value ("22:00-06:00" overnight).
    const bare = !/[:ap]/i.test(t[1]) && !/[:ap]/i.test(t[2]);
    const c = inferPmClose(o, c0, bare);
    const w = { open: minutesToHHMM(o), close: minutesToHHMM(c) };
    for (const i of new Set(idxs)) days[i].push(w);
    recognized += 1;
  }
  if (!recognized) return null;
  for (const d of days) sortWindows(d);
  return { days, holidays: [] };
}

// Keyed-map form ({mon:.., holidays:[..]}) → canonical; null when the object
// carries no day keys and no holiday keys.
function mapToSchedule(obj: any): { days: { open: string; close: string }[][]; holidays: string[]; recognized: number } {
  const days: { open: string; close: string }[][] = [[], [], [], [], [], [], []];
  const holidays = new Set<string>();
  let recognized = 0;
  for (const [key, value] of Object.entries(obj ?? {})) {
    const k = key.trim().toLowerCase();
    if (["holidays", "holiday_dates", "closed_dates", "holiday_list"].includes(k)) {
      for (const h of Array.isArray(value) ? value : [value]) {
        const d = parseDateOnly(h);
        if (d) {
          holidays.add(d);
          recognized += 1;
        }
      }
      continue;
    }
    let idxs: number[] = [];
    if (k === "weekday" || k === "weekdays") idxs = [1, 2, 3, 4, 5];
    else if (k === "weekend" || k === "weekends") idxs = [0, 6];
    else if (k === "daily" || k === "everyday" || k === "all" || k === "all_days") idxs = [0, 1, 2, 3, 4, 5, 6];
    else idxs = expandDaySpec(k);
    if (!idxs.length) continue; // not a day key — ignored (metadata)
    recognized += 1;
    if (value === null || value === undefined || value === false || value === "closed" || value === "off") {
      for (const i of new Set(idxs)) days[i] = [];
      continue;
    }
    // An array value is a list of window specs for that day.
    for (const item of Array.isArray(value) ? value : [value]) {
      const w = normalizeWindow(item);
      if (w) for (const i of new Set(idxs)) days[i].push(w);
    }
  }
  for (const d of days) sortWindows(d);
  return { days, holidays: [...holidays].sort(), recognized };
}

const isCanonicalDays = (v: any): v is { open: string; close: string }[][] =>
  Array.isArray(v) && v.length === 7 && v.every((d) => Array.isArray(d));

// The canonical core of any accepted input, or null when it is "not a
// schedule" (unparseable, empty, or yields zero windows AND zero holidays).
// Pass-through for already-canonical shapes (metadata keys dropped).
export function normalizeSchedule(input: any): { days: { open: string; close: string }[][]; holidays: string[] } | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) return null;
    if (raw.startsWith("{") || raw.startsWith("[")) {
      try {
        return normalizeSchedule(JSON.parse(raw));
      } catch {
        // fall through to shorthand parsing
      }
    }
    const r = parseHoursString(raw);
    return r && (r.days.some((d) => d.length > 0) || r.holidays.length) ? r : null;
  }
  let out: { days: { open: string; close: string }[][]; holidays: string[]; recognized?: number } | null = null;
  if (Array.isArray(input)) {
    if (!input.length) return null;
    out = entriesToSchedule(input);
  } else if (input instanceof Date) {
    return null;
  } else if (typeof input === "object") {
    if (isCanonicalDays(input.days)) {
      const days = input.days.map((windows) => windows.map((w) => normalizeWindow(w)).filter(Boolean) as { open: string; close: string }[]);
      const holidays = new Set<string>();
      for (const h of Array.isArray(input.holidays) ? input.holidays : []) {
        const d = parseDateOnly(h);
        if (d) holidays.add(d);
      }
      out = { days, holidays: [...holidays].sort(), recognized: 1 };
    } else {
      // Wrapper keys that hold the schedule itself (e.g. {days:[entries]},
      // {schedule:{...}}, {weekly:{...}}) — but NOT `hours`, which is
      // hoursFor's job on a location row.
      for (const key of ["schedule", "weekly", "week", "entries"]) {
        if (input[key] !== undefined) {
          const inner = normalizeSchedule(input[key]);
          if (inner) return inner;
        }
      }
      if (Array.isArray(input.days) && !isCanonicalDays(input.days)) {
        const inner = normalizeSchedule(input.days);
        if (inner) return inner;
      }
      // A bare single-entry object ({day:'mon',open:'08:00',close:'17:00'},
      // {date:'2026-12-25'}, {closed:true,day:'sun'}) — detected by top-level
      // time/status fields. Objects whose only day-ish keys are weekdays/
      // daily/etc. fall through to the keyed-map form instead (so
      // {weekdays:{open,close}} reads as a map, not a daily entry).
      const TIME_FIELD_KEYS = [
        "open", "close", "start", "end", "from", "to", "opens", "closes",
        "start_time", "end_time", "windows", "shifts", "ranges", "times",
        "closed", "off", "date", "holiday", "holiday_date",
      ];
      if (TIME_FIELD_KEYS.some((key) => input[key] !== undefined)) {
        out = entriesToSchedule([input]);
      } else {
        out = mapToSchedule(input);
      }
    }
  }
  if (!out) return null;
  const anyWindows = out.days.some((d) => d.length > 0);
  if (!anyWindows && !out.holidays.length) return null;
  return { days: out.days, holidays: out.holidays };
}

// ---------------------------------------------------------------------------
// Schedule resolution (location → settings → defaults)
// ---------------------------------------------------------------------------

// Settings keys per kind, in priority order. `hoursOfOperation` is the A-21
// object on GlobalSettings; flat spellings cover callers that unwrap rows.
const KIND_KEYS: Record<string, string[]> = {
  production: ["production_hours", "shop_hours", "productionHours", "shopHours"],
  sales: ["sales_center_hours", "sales_hours", "counter_hours", "salesCenterHours", "counterHours", "open_hours"],
};

export function normalizeKind(kind: any): "production" | "sales" {
  const k = String(kind ?? "").trim().toLowerCase();
  if (["sales", "sales_center", "sales-center", "salescenter", "counter", "front", "office", "follow_up", "followup", "follow-up"].includes(k)) {
    return "sales";
  }
  return "production";
}

// Flatten the many settings shapes into one lookup object: KV row →
// setting_value spread; array of rows → {setting_key: setting_value}; plain
// object → itself.
function settingsLookup(settings: any): any {
  if (Array.isArray(settings)) {
    const out: any = {};
    for (const row of settings) {
      if (!row || typeof row !== "object") continue;
      const key = String(row.setting_key ?? row.key ?? row.name ?? "").trim();
      const value = row.setting_value ?? row.value;
      if (key) out[key] = value;
      else if (value && typeof value === "object") Object.assign(out, value);
    }
    return out;
  }
  if (settings && typeof settings === "object" && settings.setting_value && typeof settings.setting_value === "object") {
    const key = String(settings.setting_key ?? "").trim();
    return { ...(key ? { [key]: settings.setting_value } : {}), ...settings.setting_value };
  }
  return settings && typeof settings === "object" ? settings : {};
}

const firstSchedule = (...candidates: any[]) => {
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const s = normalizeSchedule(c);
    if (s) return s;
  }
  return null;
};

// hoursFor(location, { settings, kind }) → the resolved WeeklySchedule.
// kind: "production" (deadline clock) | "sales" (follow-up clock) —
// aliases accepted, default "production". Pass location=null/undefined to
// skip the location tier entirely (typical for production-clock callers).
export function hoursFor(location: any = null, opts: any = {}) {
  const { settings = null, kind = "production" } = opts && typeof opts === "object" ? opts : {};
  const k = normalizeKind(kind);
  const keys = KIND_KEYS[k];

  if (location && typeof location === "object") {
    const locHours = location.hoursOfOperation && typeof location.hoursOfOperation === "object" ? location.hoursOfOperation : {};
    const s = firstSchedule(
      ...keys.map((key) => locHours[key]),
      ...keys.map((key) => location[key]),
      location.hours,
      locHours.hours,
    );
    if (s) {
      return {
        kind: k,
        source: "location",
        name: String(location.name ?? location.code ?? ""),
        location_id: String(location.id ?? location.location_id ?? ""),
        ...s,
      };
    }
  }

  const s = settingsLookup(settings);
  const hoo = s.hoursOfOperation && typeof s.hoursOfOperation === "object" ? s.hoursOfOperation
    : s.hours_of_operation && typeof s.hours_of_operation === "object" ? s.hours_of_operation
    : {};
  const fromSettings = firstSchedule(
    ...keys.map((key) => hoo[key]),
    ...keys.map((key) => s[key]),
    hoo.hours,
    s.hours,
  );
  if (fromSettings) {
    return {
      kind: k,
      source: "settings",
      name: String(hoo.name ?? s.name ?? ""),
      location_id: "",
      ...fromSettings,
    };
  }

  const dflt = k === "sales" ? DEFAULT_SALES_HOURS : DEFAULT_PRODUCTION_HOURS;
  return {
    kind: k,
    source: "default",
    name: dflt.name,
    location_id: "",
    days: dflt.days.map((d) => d.map((w) => ({ ...w }))),
    holidays: [...dflt.holidays],
  };
}

// ---------------------------------------------------------------------------
// Open/closed evaluation
// ---------------------------------------------------------------------------

// Internal: canonical schedule or null (unrestricted sentinel). Callers that
// pass a raw spec (entries array, map, JSON string, canonical) get
// normalized on the way in.
const asSchedule = (input: any): { days: { open: string; close: string }[][]; holidays: string[] } | null =>
  normalizeSchedule(input);

// Day-level view: which weekday indexes have any window (empty set →
// unrestricted), plus the holiday set. null = fully unrestricted.
function openRule(schedule: any): { days: Set<number>; holidays: Set<string> } | null {
  const s = asSchedule(schedule);
  if (!s) return null;
  const holidays = new Set(s.holidays);
  const days = new Set<number>();
  s.days.forEach((windows, i) => {
    if (windows.length) days.add(i);
  });
  if (!days.size && !holidays.size) return null; // never-open / no content → unrestricted
  if (!days.size) for (let i = 0; i < 7; i += 1) days.add(i); // holidays-only → all else open
  return { days, holidays };
}

const isHoliday = (d: Date, rule: { holidays: Set<string> }) => rule.holidays.has(toDateOnly(d));

const ALL_DAY_WINDOW = { open: ALL_DAY_OPEN, close: ALL_DAY_CLOSE };

// Windows in effect for a weekday index. A canonical schedule with NO
// windows anywhere can only exist alongside a holiday list (normalizeSchedule
// nulls window-free+holiday-free input); it reads as open all day on every
// non-holiday day — mirroring openRule's "all weekdays open" expansion.
const windowsForDay = (s: { days: { open: string; close: string }[][] }, idx: number) => {
  const w = s.days[idx] ?? [];
  if (w.length) return w;
  return s.days.every((d) => !d.length) ? [ALL_DAY_WINDOW] : [];
};

const prevLocalDay = (d: Date): Date => {
  const p = new Date(d.getTime());
  p.setDate(p.getDate() - 1);
  return p;
};

const nextLocalDay = (d: Date): Date => {
  const n = new Date(d.getTime());
  n.setDate(n.getDate() + 1);
  return n;
};

// Is this calendar day a business day at all (any open window, not a
// holiday)? Unrestricted schedule → always true.
export function isBusinessDay(dt: any, schedule: any): boolean {
  const d = toLocalDate(dt);
  if (!d) return false;
  const rule = openRule(schedule);
  if (!rule) return true;
  return rule.days.has(d.getDay()) && !isHoliday(d, rule);
}

// Minute-level check: is `dt` inside any open window? Semantics [open, close).
// Overnight windows (close <= open) are honored: today's head (m >= open) and
// yesterday's tail (m < close). opts.kind is accepted for call-site symmetry
// with hoursFor — the schedule already encodes which clock it is.
export function isBusinessTime(dt: any, schedule: any, opts: any = {}): boolean {
  void opts?.kind;
  const d = toLocalDate(dt);
  if (!d) return false;
  const s = asSchedule(schedule);
  if (!s) return true; // unrestricted → always open
  const m = d.getHours() * 60 + d.getMinutes();
  const holidayToday = s.holidays.includes(toDateOnly(d));
  if (!holidayToday) {
    for (const w of windowsForDay(s, d.getDay())) {
      const { o, c } = windowMinutes(w);
      if (c > o ? m >= o && m < c : m >= o) return true;
    }
  }
  const y = prevLocalDay(d);
  if (!s.holidays.includes(toDateOnly(y))) {
    for (const w of windowsForDay(s, y.getDay())) {
      const { o, c } = windowMinutes(w);
      if (c <= o && m < c) return true; // tail of yesterday's overnight window
    }
  }
  return false;
}

// Next instant the schedule opens, as a Date. `dt` itself when it is already
// inside a window (inclusive). Scans up to MAX_SCAN_DAYS; null = never opens
// within the horizon (pathological schedules only).
export function nextOpen(dt: any, schedule: any): Date | null {
  const d = toLocalDate(dt);
  if (!d) return null;
  const s = asSchedule(schedule);
  if (!s) return d; // unrestricted → always open
  if (isBusinessTime(d, s)) return d;
  let day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  for (let i = 0; i <= MAX_SCAN_DAYS; i += 1) {
    if (!s.holidays.includes(toDateOnly(day))) {
      for (const w of windowsForDay(s, day.getDay())) {
        const { o } = windowMinutes(w);
        const cand = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(o / 60), o % 60);
        if (cand.getTime() > d.getTime()) return cand;
      }
    }
    day = nextLocalDay(day);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Business-day arithmetic
// ---------------------------------------------------------------------------

// dt + N business days (Date; time-of-day preserved). Counting starts the day
// AFTER the anchor and counts only business days — a closed day is skipped
// ENTIRELY, not prorated to its open window (K-01 documented decision,
// matching dueDateEngine.addLeadDays business mode). N=0 returns dt
// unchanged even when it lands on a closed day. Unrestricted schedule →
// plain calendar-day add. Negative N clamps to 0.
export function addBusinessDays(dt: any, days: any, schedule: any): Date | null {
  const anchor = toLocalDate(dt);
  if (!anchor) return null;
  const n = nonNegInt(days);
  const out = new Date(anchor.getTime());
  const rule = openRule(schedule);
  if (!rule || n === 0) {
    if (!rule) out.setDate(out.getDate() + n);
    return out;
  }
  let remaining = n;
  while (remaining > 0) {
    out.setDate(out.getDate() + 1);
    if (rule.days.has(out.getDay()) && !isHoliday(out, rule)) remaining -= 1;
  }
  return out;
}

// Fractional hours inside open windows between two instants. to <= from or
// unparseable → 0. Unrestricted schedule → all elapsed hours count (24/7).
// Overlapping windows are merged before summing — no double counting.
// Overnight windows split across the midnight boundary correctly. Capped at
// MAX_SPAN_DAYS of day-iterations (~100 years).
export function businessHoursBetween(from: any, to: any, schedule: any): number {
  const a = toLocalDate(from);
  const b = toLocalDate(to);
  if (!a || !b) return 0;
  const fromMs = a.getTime();
  const toMs = b.getTime();
  if (toMs <= fromMs) return 0;
  const s = asSchedule(schedule);
  if (!s) return (toMs - fromMs) / 3600000;

  // Build absolute [startMs, endMs) intervals day by day. Window endpoints
  // are constructed as local wall-clock times (new Date(y,m,d,h,min)) so DST
  // transitions keep the intended wall-clock meaning.
  const intervals: [number, number][] = [];
  let day = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const lastDay = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  for (let i = 0; i <= MAX_SPAN_DAYS && day.getTime() <= lastDay.getTime(); i += 1) {
    if (!s.holidays.includes(toDateOnly(day))) {
      for (const w of windowsForDay(s, day.getDay())) {
        const { o, c } = windowMinutes(w);
        const open = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(o / 60), o % 60);
        // c <= o (incl. the equal-times 24h window) ends on a later day.
        const close = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(c / 60) + (c <= o ? 24 : 0), c % 60);
        if (close.getTime() > open.getTime()) intervals.push([open.getTime(), close.getTime()]);
      }
    }
    day = nextLocalDay(day);
  }
  intervals.sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  const flush = () => {
    if (curStart < 0) return;
    const lo = Math.max(curStart, fromMs);
    const hi = Math.min(curEnd, toMs);
    if (hi > lo) total += hi - lo;
  };
  for (const [st, en] of intervals) {
    if (en <= fromMs || st >= toMs) {
      if (st >= toMs) break;
      continue;
    }
    if (curStart < 0) {
      curStart = st;
      curEnd = en;
    } else if (st <= curEnd) {
      curEnd = Math.max(curEnd, en);
    } else {
      flush();
      curStart = st;
      curEnd = en;
    }
  }
  flush();
  return total / 3600000;
}

// ---------------------------------------------------------------------------
// Clock-aware date helpers (the K-01 deliverables for the two engines)
// ---------------------------------------------------------------------------

// Due date = now + lead_days BUSINESS days on the PRODUCTION clock, returned
// as "YYYY-MM-DD" (the dueDateEngine store convention). `product` supplies a
// lead-day fallback chain (product_lead_days → lead_days → product.days) when
// `lead_days` is not given explicitly. `schedule` defaults to
// DEFAULT_PRODUCTION_HOURS; `kind` picks which default applies.
//
// Integration (dueDateEngine): prefer feeding computeProductDueDate a clock —
// `clock: toDueDateClock(hoursFor(loc, {settings, kind:'production'}))` — so
// tier/max/clamp/trace semantics stay in one place. Use this helper for
// standalone lead-adds (quick quotes, ad-hoc "X business days" promises)
// where pulling the whole engine in is overkill.
export function dueDateWithClock(product: any = {}, opts: any = {}): string {
  const { lead_days, now, schedule, kind = "production" } = opts && typeof opts === "object" ? opts : {};
  const anchor = toLocalDate(now ?? new Date());
  if (!anchor) return "";
  const p = product && typeof product === "object" ? product : {};
  const lead = nonNegInt(
    lead_days ?? p.product_lead_days ?? p.lead_days ?? p.days ?? 0,
  );
  const sched = schedule !== undefined && schedule !== null
    ? schedule
    : normalizeKind(kind) === "sales"
      ? DEFAULT_SALES_HOURS
      : DEFAULT_PRODUCTION_HOURS;
  const due = addBusinessDays(anchor, lead, sched);
  return due ? toDateOnly(due) : "";
}

// Follow-up due instant = sent_at + `days` SALES-clock business days,
// snapped forward into open hours (a follow-up never schedules for 02:00 or
// a closed day — it lands at the next open instant). Returns a full ISO UTC
// string, ready for follow_up_state.next_due_at. Unparseable sent_at → "".
//
// Integration (followUpMachine): it anchors at sent_at/anchor_at and stamps
// next_due_at = now + fu2_after_fu1_days*DAY_MS (calendar). To run the
// sequence on the sales clock, compute the stamped due instant with this
// helper instead:
//   next_due_at: followUpDateWithClock(nowIso, cfg.fu2_after_fu1_days,
//                                    hoursFor(loc, { settings, kind: "sales" }))
// The machine's evaluation loop stays unchanged — it still compares stored
// next_due_at against now.
export function followUpDateWithClock(sent_at: any, days: any, schedule: any = null): string {
  const sent = toLocalDate(sent_at);
  if (!sent) return "";
  const sched = schedule === undefined || schedule === null ? DEFAULT_SALES_HOURS : schedule;
  const due = addBusinessDays(sent, nonNegInt(days), sched);
  if (!due) return "";
  const open = isBusinessTime(due, sched) ? due : nextOpen(due, sched);
  return open ? toIso(open) : toIso(due);
}

// Bridge into dueDateEngine: adapt a resolved/normalized WeeklySchedule into
// its clock shape { business_days, holidays }. An unrestricted schedule
// yields business_days: null (engine = calendar mode). Open-day indexes are
// the days carrying windows; holidays pass through.
export function toDueDateClock(schedule: any, name = ""): { name: string; business_days: number[] | null; holidays: string[] } {
  const s = asSchedule(schedule);
  if (!s) return { name: String(name || (schedule && schedule.name) || ""), business_days: null, holidays: [] };
  const days = new Set<number>();
  s.days.forEach((windows, i) => {
    if (windows.length) days.add(i);
  });
  return {
    name: String(name || (schedule && schedule.name) || ""),
    business_days: days.size ? [...days].sort() : null,
    holidays: [...s.holidays],
  };
}

// Weekday indexes (0=Sun..6=Sat) that carry at least one window, sorted.
// Unrestricted → [0..6]. "Not a schedule" input → [0..6] (unrestricted).
export function openDayIndexes(schedule: any): number[] {
  const rule = openRule(schedule);
  if (!rule) return [0, 1, 2, 3, 4, 5, 6];
  return [...rule.days].sort();
}
