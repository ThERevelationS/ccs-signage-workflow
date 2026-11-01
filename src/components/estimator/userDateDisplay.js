// #488 — per-user timezone preference → date display. The preference lives in
// the UserWorkspacePreferences blob at `locale.timezone` (IANA name, "" =
// browser local) and is edited on the Estimator Settings "My display
// preferences" card. Resolution order:
//   1. user pref (locale.timezone)
//   2. company default (QuoteDefaults.display_timezone)
//   3. browser-local rendering
// Surfaces call formatInUserTz with the resolved zone so every staff member
// can view due dates / timestamps in their own zone without changing data.
import { formatInCompanyTz } from "./quoteLifecycle";

export function resolveUserTimeZone(prefs, companyTz = "") {
  const userTz = String(prefs?.locale?.timezone || "").trim();
  if (userTz && isValidTimeZone(userTz)) return userTz;
  const coTz = String(companyTz || "").trim();
  if (coTz && isValidTimeZone(coTz)) return coTz;
  return "";
}

export function isValidTimeZone(tz) {
  if (!tz) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; }
  catch { return false; }
}

// Datetime display honoring the resolved zone. `pattern` supports the
// quoteLifecycle presets plus "datetime" (localized date+time).
export function formatInUserTz(value, prefs, companyTz = "", pattern = "MMM d") {
  const tz = resolveUserTimeZone(prefs, companyTz);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  if (pattern === "datetime" || pattern === "MMM d, yyyy h:mm a") {
    if (!tz) return d.toLocaleString();
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: tz, month: "short", day: "numeric",
        year: "numeric", hour: "numeric", minute: "2-digit",
      }).format(d);
    } catch {
      return d.toLocaleString();
    }
  }
  return formatInCompanyTz(d, tz, pattern);
}

// Date-only stamps ("YYYY-MM-DD") are already zone-safe when compared as
// strings; this helper produces a local/zone-aware "today" stamp for
// comparisons against them (e.g. due-date overdue checks).
export function todayStampInZone(prefs, companyTz = "") {
  const tz = resolveUserTimeZone(prefs, companyTz);
  if (!tz) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
}
