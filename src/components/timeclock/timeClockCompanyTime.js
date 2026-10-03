export const TIME_CLOCK_COMPANY_TIME_ZONE = "America/New_York";
export const TIME_CLOCK_COMPANY_TIME_LABEL = "Eastern Time";

const inputPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function zonedParts(value) {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_CLOCK_COMPANY_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  const result = {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
  return Object.values(result).every(Boolean) ? result : null;
}

export function companyDateTimeInputFromIso(iso) {
  const parts = zonedParts(iso);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function formatCompanyDateTime(iso) {
  const date = new Date(String(iso || ""));
  if (!Number.isFinite(date.getTime())) return "Invalid time";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_CLOCK_COMPANY_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function offsetMinutesAt(timestampMs) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_CLOCK_COMPANY_TIME_ZONE,
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestampMs));
  const name = parts.find((part) => part.type === "timeZoneName")?.value || "";
  if (name === "GMT" || name === "UTC") return 0;
  const match = name.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  const sign = match[1] === "+" ? 1 : -1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0));
}

export function parseCompanyDateTimeInput(value) {
  const normalized = String(value || "").trim();
  const match = normalized.match(inputPattern);
  if (!match) {
    return { ok: false, error: `Enter a valid date and time in ${TIME_CLOCK_COMPANY_TIME_LABEL}.` };
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const normalizedDate = new Date(naiveUtc);
  if (
    normalizedDate.getUTCFullYear() !== year ||
    normalizedDate.getUTCMonth() !== month - 1 ||
    normalizedDate.getUTCDate() !== day ||
    normalizedDate.getUTCHours() !== hour ||
    normalizedDate.getUTCMinutes() !== minute
  ) {
    return { ok: false, error: `Enter a valid date and time in ${TIME_CLOCK_COMPANY_TIME_LABEL}.` };
  }

  const offsets = new Set();
  for (const probe of [naiveUtc - 36 * 60 * 60 * 1000, naiveUtc - 12 * 60 * 60 * 1000, naiveUtc, naiveUtc + 12 * 60 * 60 * 1000, naiveUtc + 36 * 60 * 60 * 1000]) {
    const offset = offsetMinutesAt(probe);
    if (Number.isFinite(offset)) offsets.add(offset);
  }

  const candidates = [];
  for (const offset of offsets) {
    const candidateMs = naiveUtc - Number(offset) * 60 * 1000;
    const iso = new Date(candidateMs).toISOString();
    if (companyDateTimeInputFromIso(iso) === normalized) candidates.push(iso);
  }
  const unique = [...new Set(candidates)].sort();

  if (unique.length === 1) return { ok: true, iso: unique[0], ambiguous: false };
  if (unique.length > 1) {
    return {
      ok: false,
      ambiguous: true,
      candidates: unique,
      error: `That ${TIME_CLOCK_COMPANY_TIME_LABEL} occurs twice because daylight saving time is ending. Do not guess which occurrence applies; verify the exact punch before submitting the time.`,
    };
  }
  return {
    ok: false,
    error: `That ${TIME_CLOCK_COMPANY_TIME_LABEL} does not exist because of the daylight-saving transition. Choose a valid local time.`,
  };
}

export function shiftDurationSummary(clockInIso, clockOutIso, lunchMinutes = 0) {
  const clockInMs = new Date(String(clockInIso || "")).getTime();
  const clockOutMs = new Date(String(clockOutIso || "")).getTime();
  const lunch = Math.round(Number(lunchMinutes));
  if (!Number.isFinite(clockInMs) || !Number.isFinite(clockOutMs) || clockOutMs < clockInMs) {
    return { valid: false, error: "Clock Out must be at or after Clock In." };
  }
  if (!Number.isFinite(lunch) || lunch < 0 || lunch > 240) {
    return { valid: false, error: "Lunch must be between 0 and 240 minutes." };
  }
  const grossMinutes = Math.floor((clockOutMs - clockInMs) / 60000);
  if (lunch > grossMinutes) return { valid: false, error: "Lunch cannot exceed the shift duration." };
  return {
    valid: true,
    grossMinutes,
    lunchMinutes: lunch,
    netMinutesBeforeWorkPause: grossMinutes - lunch,
  };
}

export function formatMinutes(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}
