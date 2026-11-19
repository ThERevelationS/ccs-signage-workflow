// base44/shared/userDefaultsModel.ts
var USER_DEFAULTS = Object.freeze({
  timezone: "America/New_York",
  date_format: "MM/DD/YYYY",
  time_format: "12h",
  default_queue_view: "my_queue",
  default_pages: Object.freeze({ dashboard: "/MainWorkflow", financials: "/Financials" }),
  notifications: Object.freeze({ in_app: true, email: true, digest: true })
});
var USER_DEFAULT_FIELDS = Object.freeze([
  "timezone",
  "date_format",
  "time_format",
  "default_queue_view",
  "default_pages",
  "notifications"
]);
var NOTIFICATION_KEYS = Object.freeze(["in_app", "email", "digest"]);
var DATE_FORMATS = Object.freeze([
  "MM/DD/YYYY",
  "DD/MM/YYYY",
  "YYYY-MM-DD",
  "MMM D, YYYY"
]);
var TIME_FORMATS = Object.freeze(["12h", "24h"]);
var DEFAULT_QUEUE_VIEWS = Object.freeze([
  "my_queue",
  "team_queue",
  "all"
]);
var KNOWN_TIMEZONES = Object.freeze([
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Boise",
  "America/Anchorage",
  "America/Juneau",
  "America/Indiana/Indianapolis",
  "Pacific/Honolulu",
  "America/Puerto_Rico",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "UTC"
]);
var KNOWN_PAGE_KEYS = Object.freeze({
  dashboard: "/MainWorkflow",
  main_workflow: "/MainWorkflow",
  my_workflow: "/MyWorkflow",
  financials: "/Financials",
  invoices: "/Invoices",
  sales_pipeline: "/SalesPipeline",
  opportunities: "/Opportunities",
  estimator_queues: "/EstimatorQueues",
  production: "/Production",
  permitting: "/Permitting",
  timeclock: "/TimeClock",
  sop: "/SOP"
});
var PREFS_PATHS = Object.freeze({
  timezone: "locale.timezone",
  date_format: "locale.date_format",
  time_format: "locale.time_format",
  default_queue_view: "default_queue_view",
  default_pages: "default_pages",
  notifications: "notifications"
});
var NOTIFICATION_KEY_SET = new Set(NOTIFICATION_KEYS);
var KNOWN_TIMEZONE_SET = new Set(KNOWN_TIMEZONES);
var DATE_FORMAT_SET = new Set(DATE_FORMATS);
var TIME_FORMAT_SET = new Set(TIME_FORMATS);
var QUEUE_VIEW_SET = new Set(DEFAULT_QUEUE_VIEWS);
var PAGE_KEY_RE = /^[a-z0-9][a-z0-9_]{0,39}$/;
var ROUTE_RE = /^\/[A-Za-z0-9][A-Za-z0-9_\-/]{0,199}$/;
var isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var cleanStr = (v, max = 500) => String(v ?? "").trim().slice(0, max);
function isKnownTimeZone(tz) {
  return KNOWN_TIMEZONE_SET.has(cleanStr(tz, 100));
}
function isValidTimeZone(tz) {
  const s = cleanStr(tz, 100);
  if (!s) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: s });
    return true;
  } catch {
    return false;
  }
}
function isValidDefaultRoute(route) {
  const s = cleanStr(route, 220);
  return ROUTE_RE.test(s) && !s.includes("//");
}
var normPageKey = (v) => cleanStr(v, 48).toLowerCase();
function extractPresent(raw) {
  let src = raw;
  if (isObj(src) && isObj(src.preferences)) src = src.preferences;
  else if (isObj(src) && isObj(src.prefs)) src = src.prefs;
  if (!isObj(src)) return {};
  const out = {};
  const locale = isObj(src.locale) ? src.locale : {};
  if (Object.prototype.hasOwnProperty.call(src, "timezone")) out.timezone = src.timezone;
  if (Object.prototype.hasOwnProperty.call(locale, "timezone")) out.timezone = locale.timezone;
  if (Object.prototype.hasOwnProperty.call(src, "date_format")) out.date_format = src.date_format;
  if (Object.prototype.hasOwnProperty.call(locale, "date_format")) out.date_format = locale.date_format;
  if (Object.prototype.hasOwnProperty.call(src, "time_format")) out.time_format = src.time_format;
  if (Object.prototype.hasOwnProperty.call(locale, "time_format")) out.time_format = locale.time_format;
  if (Object.prototype.hasOwnProperty.call(src, "default_queue_view")) out.default_queue_view = src.default_queue_view;
  if (Object.prototype.hasOwnProperty.call(src, "default_pages")) out.default_pages = src.default_pages;
  if (Object.prototype.hasOwnProperty.call(src, "notifications")) out.notifications = src.notifications;
  return out;
}
function userDefaultsFromPrefs(prefs) {
  return extractPresent(prefs);
}
var normTimezone = (v) => {
  const s = cleanStr(v, 100);
  return s && KNOWN_TIMEZONE_SET.has(s) ? s : void 0;
};
var normDateFormat = (v) => {
  const s = cleanStr(v, 32);
  return DATE_FORMAT_SET.has(s) ? s : void 0;
};
var normTimeFormat = (v) => {
  const s = cleanStr(v, 8);
  return TIME_FORMAT_SET.has(s) ? s : void 0;
};
var normQueueView = (v) => {
  const s = cleanStr(v, 32);
  return QUEUE_VIEW_SET.has(s) ? s : void 0;
};
var normDefaultPages = (v, base) => {
  const out = { ...base };
  if (!isObj(v)) return out;
  for (const [k, route] of Object.entries(v)) {
    const key = normPageKey(k);
    if (!key || !PAGE_KEY_RE.test(key)) continue;
    const r = cleanStr(route, 220);
    if (!isValidDefaultRoute(r)) continue;
    out[key] = r;
  }
  return out;
};
var normNotifications = (v, base) => {
  const out = { ...base };
  if (!isObj(v)) return out;
  for (const key of NOTIFICATION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(v, key) && typeof v[key] === "boolean") {
      out[key] = v[key];
    }
  }
  return out;
};
function mergeTier(base, src) {
  const out = {
    ...base,
    default_pages: { ...base.default_pages },
    notifications: { ...base.notifications }
  };
  const tz = normTimezone(src.timezone);
  if (tz !== void 0) out.timezone = tz;
  const df = normDateFormat(src.date_format);
  if (df !== void 0) out.date_format = df;
  const tf = normTimeFormat(src.time_format);
  if (tf !== void 0) out.time_format = tf;
  const qv = normQueueView(src.default_queue_view);
  if (qv !== void 0) out.default_queue_view = qv;
  out.default_pages = normDefaultPages(src.default_pages, out.default_pages);
  out.notifications = normNotifications(src.notifications, out.notifications);
  return out;
}
function normalizeUserDefaults(raw, { shop_defaults } = {}) {
  let row = {
    ...USER_DEFAULTS,
    default_pages: { ...USER_DEFAULTS.default_pages },
    notifications: { ...USER_DEFAULTS.notifications }
  };
  if (shop_defaults !== void 0 && shop_defaults !== null) {
    row = mergeTier(row, extractPresent(shop_defaults));
  }
  row = mergeTier(row, extractPresent(raw));
  return row;
}
var readTimezoneField = (src) => {
  const fields = extractPresent(src);
  return cleanStr(fields.timezone, 100);
};
var readShopTimezone = (shop) => {
  if (typeof shop === "string") return cleanStr(shop, 100);
  if (!isObj(shop)) return "";
  for (const key of ["timezone", "display_timezone", "shop_timezone", "company_timezone"]) {
    const v = cleanStr(shop[key], 100);
    if (v) return v;
  }
  return readTimezoneField(shop);
};
function resolveTimezone(user, shop) {
  const userTz = readTimezoneField(user);
  if (userTz && KNOWN_TIMEZONE_SET.has(userTz)) return { iana: userTz, source: "user" };
  const shopTz = readShopTimezone(shop);
  if (shopTz && KNOWN_TIMEZONE_SET.has(shopTz)) return { iana: shopTz, source: "shop" };
  return { iana: USER_DEFAULTS.timezone, source: "fallback" };
}
var MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var BARE_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
var fmtCache = {};
var partsFormatter = (iana, withTime, hour12) => {
  const key = `${iana}|${withTime ? "t" : "d"}|${hour12 ? "12" : "24"}`;
  if (fmtCache[key] !== void 0) return fmtCache[key];
  try {
    const opts = {
      timeZone: iana,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    };
    if (withTime) {
      opts.hour = "2-digit";
      opts.minute = "2-digit";
      opts.hour12 = hour12;
    }
    fmtCache[key] = new Intl.DateTimeFormat("en-US", opts);
  } catch {
    fmtCache[key] = null;
  }
  return fmtCache[key];
};
var monthNameFormatter = (iana) => {
  const key = `${iana}|mon`;
  if (fmtCache[key] !== void 0) return fmtCache[key];
  try {
    fmtCache[key] = new Intl.DateTimeFormat("en-US", { timeZone: iana, month: "short" });
  } catch {
    fmtCache[key] = null;
  }
  return fmtCache[key];
};
var partsMap = (fmt, d) => {
  const out = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return out;
};
var renderDate = (yyyy, mm, dd, monName, dayNum, fmt) => {
  switch (fmt) {
    case "DD/MM/YYYY":
      return `${dd}/${mm}/${yyyy}`;
    case "YYYY-MM-DD":
      return `${yyyy}-${mm}-${dd}`;
    case "MMM D, YYYY":
      return `${monName} ${dayNum}, ${yyyy}`;
    case "MM/DD/YYYY":
    default:
      return `${mm}/${dd}/${yyyy}`;
  }
};
function formatDateFor(value, user_defaults, opts = {}) {
  if (value === null || value === void 0 || value === "") return "";
  const defaults = normalizeUserDefaults(user_defaults, { shop_defaults: opts.shop });
  const fmt = defaults.date_format;
  const tf = defaults.time_format;
  const withTime = opts.with_time === true;
  if (typeof value === "string") {
    const m = BARE_DATE_RE.exec(value.trim());
    if (m) {
      const y = m[1];
      const mo = m[2];
      const dy = m[3];
      const monName2 = MONTHS_SHORT[Math.max(0, Math.min(11, Number(mo) - 1))];
      return renderDate(y, mo, dy, monName2, String(Number(dy)), fmt);
    }
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const { iana } = resolveTimezone(user_defaults, opts.shop);
  const pf = partsFormatter(iana, withTime, tf === "12h");
  if (!pf) {
    const months = MONTHS_SHORT[d.getMonth()];
    const datePart2 = renderDate(
      String(d.getFullYear()),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
      months,
      String(d.getDate()),
      fmt
    );
    if (!withTime) return datePart2;
    return `${datePart2} ${d.toLocaleTimeString("en-US", { hour12: tf === "12h", hour: "2-digit", minute: "2-digit" })}`;
  }
  const parts = partsMap(pf, d);
  let monName = "";
  if (fmt === "MMM D, YYYY") {
    const mf = monthNameFormatter(iana);
    if (mf) monName = mf.format(d);
    if (!monName) monName = MONTHS_SHORT[Number(parts.month) - 1] || parts.month;
  }
  const datePart = renderDate(
    parts.year,
    parts.month,
    parts.day,
    monName,
    String(Number(parts.day)),
    fmt
  );
  if (!withTime) return datePart;
  const hour = parts.hour || "";
  const minute = parts.minute || "";
  if (!hour || !minute) return datePart;
  if (tf === "12h") {
    const ap = (parts.dayPeriod || "").toUpperCase();
    return `${datePart} ${Number(hour)}:${minute}${ap ? ` ${ap}` : ""}`;
  }
  return `${datePart} ${hour}:${minute}`;
}
function defaultPageFor(user, page_key) {
  const key = normPageKey(page_key);
  if (!key || !PAGE_KEY_RE.test(key)) return "";
  const fields = extractPresent(user);
  if (isObj(fields.default_pages)) {
    const candidate = cleanStr(fields.default_pages[key], 220);
    if (candidate && isValidDefaultRoute(candidate)) return candidate;
  }
  const fallback = USER_DEFAULTS.default_pages[key];
  return fallback && isValidDefaultRoute(fallback) ? fallback : "";
}
function userDefaultsPatch(user_id, patch, { request_id } = {}) {
  const user_email = cleanStr(user_id, 200).toLowerCase();
  const present = extractPresent(patch);
  const dropped = [];
  const locale = {};
  const preferences = {};
  if (Object.prototype.hasOwnProperty.call(present, "timezone")) {
    const tz = normTimezone(present.timezone);
    if (tz !== void 0) locale.timezone = tz;
    else {
      const s = cleanStr(present.timezone, 100);
      if (s === "") locale.timezone = "";
      else dropped.push({ field: "timezone", reason: `not on the reviewed zone list: "${s}"` });
    }
  }
  if (Object.prototype.hasOwnProperty.call(present, "date_format")) {
    const df = normDateFormat(present.date_format);
    if (df !== void 0) locale.date_format = df;
    else dropped.push({ field: "date_format", reason: `not one of ${DATE_FORMATS.join(" | ")}` });
  }
  if (Object.prototype.hasOwnProperty.call(present, "time_format")) {
    const tf = normTimeFormat(present.time_format);
    if (tf !== void 0) locale.time_format = tf;
    else dropped.push({ field: "time_format", reason: `not one of ${TIME_FORMATS.join(" | ")}` });
  }
  if (Object.prototype.hasOwnProperty.call(present, "default_queue_view")) {
    const qv = normQueueView(present.default_queue_view);
    if (qv !== void 0) preferences.default_queue_view = qv;
    else dropped.push({ field: "default_queue_view", reason: `not one of ${DEFAULT_QUEUE_VIEWS.join(" | ")}` });
  }
  if (Object.prototype.hasOwnProperty.call(present, "default_pages")) {
    const cleaned = normDefaultPages(present.default_pages, {});
    if (Object.keys(cleaned).length) preferences.default_pages = cleaned;
    if (isObj(present.default_pages)) {
      for (const [k, v] of Object.entries(present.default_pages)) {
        const key = normPageKey(k);
        if (!key || !PAGE_KEY_RE.test(key) || !isValidDefaultRoute(v)) {
          dropped.push({ field: `default_pages.${k}`, reason: 'invalid page key or route (routes must be in-app "/Path")' });
        }
      }
    } else {
      dropped.push({ field: "default_pages", reason: "not an object map of page_key \u2192 route" });
    }
  }
  if (Object.prototype.hasOwnProperty.call(present, "notifications")) {
    const notif = present.notifications;
    if (isObj(notif)) {
      const out = {};
      for (const key of Object.keys(notif)) {
        if (!NOTIFICATION_KEY_SET.has(key)) {
          dropped.push({ field: `notifications.${key}`, reason: `not one of ${NOTIFICATION_KEYS.join(" | ")}` });
          continue;
        }
        if (typeof notif[key] !== "boolean") {
          dropped.push({ field: `notifications.${key}`, reason: "must be a boolean" });
          continue;
        }
        out[key] = notif[key];
      }
      if (Object.keys(out).length) preferences.notifications = out;
    } else {
      dropped.push({ field: "notifications", reason: "not an object of boolean toggles" });
    }
  }
  if (Object.keys(locale).length) preferences.locale = locale;
  return {
    user_email,
    schema_version: 1,
    last_request_id: cleanStr(request_id, 120),
    preferences,
    dropped
  };
}
function validateUserDefaults(patch) {
  const errors = [];
  const warnings = [];
  const present = extractPresent(patch);
  if (isObj(patch)) {
    const src = isObj(patch.preferences) ? patch.preferences : isObj(patch.prefs) ? patch.prefs : patch;
    for (const key of Object.keys(src)) {
      if (key === "locale") continue;
      if (!USER_DEFAULT_FIELDS.includes(key)) {
        warnings.push(`Unknown preference key "${key}" is ignored by normalization.`);
      }
    }
    if (isObj(src.locale)) {
      for (const key of Object.keys(src.locale)) {
        if (!["timezone", "date_format", "time_format"].includes(key)) {
          warnings.push(`Unknown locale key "locale.${key}" is ignored by normalization.`);
        }
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(present, "timezone")) {
    const tz = cleanStr(present.timezone, 100);
    if (tz && !KNOWN_TIMEZONE_SET.has(tz)) {
      if (isValidTimeZone(tz)) {
        warnings.push(`Timezone "${tz}" is a real IANA zone but outside the shop's reviewed list \u2014 it will resolve to the shop timezone (${USER_DEFAULTS.timezone}) until the list is extended.`);
      } else {
        errors.push(`Timezone "${tz}" is not a recognized IANA zone \u2014 try e.g. ${KNOWN_TIMEZONES.slice(0, 4).join(", ")}.`);
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(present, "date_format")) {
    const v = cleanStr(present.date_format, 32);
    if (!DATE_FORMAT_SET.has(v)) errors.push(`date_format "${v}" is not one of ${DATE_FORMATS.join(" | ")}.`);
  }
  if (Object.prototype.hasOwnProperty.call(present, "time_format")) {
    const v = cleanStr(present.time_format, 8);
    if (!TIME_FORMAT_SET.has(v)) errors.push(`time_format "${v}" is not one of ${TIME_FORMATS.join(" | ")}.`);
  }
  if (Object.prototype.hasOwnProperty.call(present, "default_queue_view")) {
    const v = cleanStr(present.default_queue_view, 32);
    if (!QUEUE_VIEW_SET.has(v)) errors.push(`default_queue_view "${v}" is not one of ${DEFAULT_QUEUE_VIEWS.join(" | ")}.`);
  }
  if (Object.prototype.hasOwnProperty.call(present, "default_pages")) {
    if (!isObj(present.default_pages)) {
      errors.push('default_pages must be an object map of page_key \u2192 "/Route".');
    } else {
      for (const [k, v] of Object.entries(present.default_pages)) {
        const key = normPageKey(k);
        if (!key || !PAGE_KEY_RE.test(key)) {
          errors.push(`default_pages key "${k}" is not a valid page key (lowercase snake, 1-40 chars).`);
          continue;
        }
        if (!isValidDefaultRoute(v)) {
          errors.push(`default_pages.${key} route "${cleanStr(v, 60)}" is not an in-app "/Path" route.`);
          continue;
        }
        if (!(key in KNOWN_PAGE_KEYS)) {
          warnings.push(`default_pages.${key} stores fine, but "${key}" is not a registered page key \u2014 no built-in surface reads it yet.`);
        }
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(present, "notifications")) {
    const notif = present.notifications;
    if (!isObj(notif)) {
      errors.push("notifications must be an object of boolean toggles.");
    } else {
      for (const [k, v] of Object.entries(notif)) {
        if (!NOTIFICATION_KEY_SET.has(k)) {
          warnings.push(`notifications.${k} is not a known toggle (${NOTIFICATION_KEYS.join(" | ")}) \u2014 it is dropped by normalization.`);
        } else if (typeof v !== "boolean") {
          errors.push(`notifications.${k} must be true or false.`);
        }
      }
    }
  }
  return { errors, warnings };
}
export {
  DATE_FORMATS,
  DEFAULT_QUEUE_VIEWS,
  KNOWN_PAGE_KEYS,
  KNOWN_TIMEZONES,
  NOTIFICATION_KEYS,
  PREFS_PATHS,
  TIME_FORMATS,
  USER_DEFAULTS,
  USER_DEFAULT_FIELDS,
  defaultPageFor,
  formatDateFor,
  isKnownTimeZone,
  isValidDefaultRoute,
  isValidTimeZone,
  normalizeUserDefaults,
  resolveTimezone,
  userDefaultsFromPrefs,
  userDefaultsPatch,
  validateUserDefaults
};
