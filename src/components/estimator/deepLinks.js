// Shared URL deep-link + search helpers for the estimator surfaces.
// Conventions here match the existing pages: params are read from
// window.location.search and written back with history.replaceState so
// React Router is never re-navigated for a pure filter change.
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export function getSearchParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name) || "";
  } catch {
    return "";
  }
}

// Writes (or clears) one query param via replaceState — no reload, no
// router navigation, other params preserved. `defaultValue` lets callers
// keep the URL clean for the "no filter" state (e.g. sort "newest").
export function writeSearchParam(name, value, defaultValue = "") {
  try {
    const next = new URLSearchParams(window.location.search);
    if (value && value !== defaultValue) next.set(name, value);
    else next.delete(name);
    const qs = next.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash || ""}`
    );
  } catch {
    // Non-browser context — param write-back is best-effort.
  }
}

// #302 — /EstimatorQueues?estimate=<id> (and sibling estimator pages)
// opens that estimate. Mirrors the /Opportunities?open=<id> convention:
// the list page forwards to the record surface rather than duplicating it.
// Reactive to location.search so an in-app navigation that only changes
// the param on an already-mounted page still fires.
export function useEstimateDeepLink() {
  const navigate = useNavigate();
  const location = useLocation();
  const lastHandledRef = useRef("");
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("estimate") || "";
    if (!id || lastHandledRef.current === id) return;
    lastHandledRef.current = id;
    navigate(`/EstimateDetail?id=${encodeURIComponent(id)}`, { replace: true });
  }, [location.search, navigate]);
}

// #301 — estimate list search across the "header" fields plus notes and
// every loaded line item. line_items is a real array column on
// AllInOneEstimate so the full projection already comes back with
// loadAllEntityRows — no field list needed.
const ESTIMATE_SEARCH_FIELDS = [
  "project_name",
  "client_name",
  "estimate_number",
  "job_name",
  "contact_name",
  "salesperson_email",
  "created_by",
  "project_address",
  "site_address",
  "source_module",
  "notes",
  "estimate_notes",
];

const LINE_ITEM_SEARCH_FIELDS = [
  "title",
  "name",
  "product_name",
  "client_product_name",
  "builder_name",
  "project_name",
  "description",
  "module_key",
  "product_category",
  "production_product_type",
];

export function estimateMatchesSearch(estimate, rawTerm) {
  const term = String(rawTerm || "").trim().toLowerCase();
  if (!term) return true;
  const haystacks = ESTIMATE_SEARCH_FIELDS.map((f) => estimate?.[f]);
  if (Array.isArray(estimate?.line_items)) {
    for (const line of estimate.line_items) {
      for (const f of LINE_ITEM_SEARCH_FIELDS) haystacks.push(line?.[f]);
    }
  }
  return haystacks.some((v) => String(v ?? "").toLowerCase().includes(term));
}

// #313 — recent searches per surface per user. Key shape follows the
// `ccs.<surface>.<user>.<purpose>` convention used elsewhere in the app.
const RECENT_SEARCH_LIMIT = 5;

export function recentSearchesKey(surface, userEmail) {
  const user = String(userEmail || "anon").trim().toLowerCase() || "anon";
  return `ccs.${surface}.${user}.recent_searches`;
}

export function readRecentSearches(surface, userEmail) {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentSearchesKey(surface, userEmail)) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((v) => typeof v === "string" && v.trim()).slice(0, RECENT_SEARCH_LIMIT)
      : [];
  } catch {
    return [];
  }
}

// Returns the updated list so callers can refresh dropdown state.
export function pushRecentSearch(surface, userEmail, rawTerm) {
  const term = String(rawTerm || "").trim().slice(0, 80);
  if (term.length < 2) return readRecentSearches(surface, userEmail);
  const next = [
    term,
    ...readRecentSearches(surface, userEmail).filter(
      (v) => v.toLowerCase() !== term.toLowerCase()
    ),
  ].slice(0, RECENT_SEARCH_LIMIT);
  try {
    localStorage.setItem(recentSearchesKey(surface, userEmail), JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode, quota) — best-effort.
  }
  return next;
}

// #317 — EstimatorCustomers ?filter=<preset>. Customer rows carry no
// open-balance field (Invoice is backend-only RLS), so `ar_aging` maps to
// the honest client-side proxy: accounts flagged credit_hold. `recent` and
// `inactive` key off last_contacted_at with updated/created as the
// activity fallback.
export const CUSTOMER_FILTER_PRESETS = [
  { key: "ar_aging", label: "Credit hold / AR risk" },
  { key: "recent", label: "Active \u2264 30d" },
  { key: "inactive", label: "No activity \u2265 90d" },
];

const DAY_MS = 86400000;

function customerActivityStamp(c) {
  const stamp = Date.parse(c?.last_contacted_at || c?.updated_date || c?.created_date || "");
  return Number.isFinite(stamp) ? stamp : null;
}

export function customerMatchesFilterPreset(customer, preset) {
  if (preset === "ar_aging") return customer?.credit_hold === true;
  if (preset === "recent") {
    const stamp = customerActivityStamp(customer);
    return stamp != null && Date.now() - stamp <= 30 * DAY_MS;
  }
  if (preset === "inactive") {
    const stamp = customerActivityStamp(customer);
    return stamp == null || Date.now() - stamp >= 90 * DAY_MS;
  }
  return true;
}
