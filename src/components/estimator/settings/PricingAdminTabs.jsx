// F-24 — Pricing registry admin tabs for EstimatorSettings (CoreBridge
// settings parity). One admin card hosting per-registry CRUD tabs:
//   Pricing Tiers (GlobalPricingTier) · Templates (PricingTemplate)
//   Global Variables (GlobalSettings.pricing_variables) · Modifiers
//   (PricingModifier) · Machines (Machine) · Labor Levels (LaborLevel)
//   Part Groups (BuilderPartGroup, edit-only) · Import History (ImportJob,
//   read-only).
//
// Reads run through staffEntities -> staffDataRead (all seven entities are
// STAFF_READABLE). Writes run through staffEntities -> staffEntityWrite:
//   create        -> op 'create'        (admin-gated for the pricing registries)
//   update (CAS)  -> op 'updateMany'    {id, updated_date} + {$set: patch}
//   delete        -> op 'delete'
// BuilderPartGroup only exposes updateMany server-side, so its tab renders
// without New/Delete affordances. ImportJob stays read-only — the importer
// owns those rows. Global Variables live on a GlobalSettings row's top-level
// pricing_variables field (F-07 contract) and save through the same CAS
// updateMany lane; GlobalSettings has no staff 'create' op, so a missing
// carrier row surfaces a seed note instead of a broken button.
//
// The pure registry config + draft/validation helpers below the REACT marker
// are the testable surface for scripts/test-pricing-admin.mjs.

import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Clock,
  Cog,
  FileUp,
  Layers,
  LayoutTemplate,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Trash2,
  Variable,
  X,
} from "lucide-react";
import { staffEntities } from "@/components/staff/staffEntities";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { replaceEntityFieldsIfUnchanged } from "@/components/estimator/builder/builderEntityPersistence";
import { getSessionUser } from "@/components/auth/EmailGate";
import {
  BUILTIN_VARIABLES,
  normalizePricingVariables,
} from "../../../../base44/shared/pricingVariables.ts";

// ---------------------------------------------------------------------------
// Registry constants (pure — asserted by scripts/test-pricing-admin.mjs)
// ---------------------------------------------------------------------------

export const REGISTRY_PAGE_SIZE = 25;
export const IMPORT_JOBS_LIMIT = 200;
export const PRICING_VARIABLES_SETTING_KEY = "pricingVariables";

export const STATUS_OPTIONS = [
  { value: "active", label: "active" },
  { value: "inactive", label: "inactive" },
];
export const INPUT_TYPE_OPTIONS = [
  { value: "text", label: "text" },
  { value: "number", label: "number" },
  { value: "select", label: "select" },
  { value: "checkbox", label: "checkbox" },
  { value: "formula", label: "formula" },
];
export const MACHINE_TYPE_OPTIONS = [
  { value: "", label: "—" },
  { value: "roll_fed", label: "roll_fed" },
  { value: "sheet_fed", label: "sheet_fed" },
  { value: "other", label: "other" },
];
export const RATE_BASIS_OPTIONS = [
  { value: "sqft_per_hour", label: "sqft_per_hour" },
  { value: "units_per_hour", label: "units_per_hour" },
  { value: "hours_per_unit", label: "hours_per_unit" },
  { value: "flat_hours", label: "flat_hours" },
];
export const IMPORT_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "running", label: "running" },
  { value: "paused", label: "paused" },
  { value: "completed", label: "completed" },
  { value: "failed", label: "failed" },
  { value: "cancelled", label: "cancelled" },
];

// Mirrors base44/functions/staffEntityWrite WRITE_OPS for the registry
// entities. `update` on ImportJob exists server-side but the tab stays
// read-only per the F-24 brief.
export const REGISTRY_WRITE_OPS = Object.freeze({
  GlobalPricingTier: Object.freeze({ create: true, updateMany: true, delete: true }),
  PricingTemplate: Object.freeze({ create: true, updateMany: true, delete: true }),
  PricingModifier: Object.freeze({ create: true, updateMany: true, delete: true }),
  Machine: Object.freeze({ create: true, updateMany: true, delete: true }),
  LaborLevel: Object.freeze({ create: true, updateMany: true, delete: true }),
  BuilderPartGroup: Object.freeze({ create: false, updateMany: true, delete: false }),
  ImportJob: Object.freeze({ create: false, updateMany: false, delete: false }),
});

export const registryWriteOps = (entity) =>
  REGISTRY_WRITE_OPS[entity] || { create: false, updateMany: false, delete: false };

// Identity/system fields never leave the browser in a write payload (the
// gateway strips them too, but keeping them out of drafts avoids confusion).
const STRIP_FIELDS = new Set(["id", "created_date", "updated_date", "created_by"]);

// ---------------------------------------------------------------------------
// JSON-shape validators for complex declared fields (pure)
// ---------------------------------------------------------------------------

const isFiniteNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const isPlainObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** GlobalPricingTier.rules: [{tier:string, markup_pct:number, market_based?:bool}] */
export function validateTierRules(value) {
  if (!Array.isArray(value)) return "Rules must be a JSON array.";
  for (let i = 0; i < value.length; i += 1) {
    const r = value[i];
    if (!isPlainObj(r)) return `Rule ${i + 1} must be an object.`;
    if (!String(r.tier ?? "").trim()) return `Rule ${i + 1} needs a "tier" name.`;
    if (r.market_based !== undefined && typeof r.market_based !== "boolean") {
      return `Rule ${i + 1} "market_based" must be true or false.`;
    }
    if (r.market_based !== true && !isFiniteNum(r.markup_pct)) {
      return `Rule ${i + 1} needs a numeric "markup_pct" (or market_based: true).`;
    }
    if (r.markup_pct !== undefined && !isFiniteNum(r.markup_pct)) {
      return `Rule ${i + 1} "markup_pct" must be a number.`;
    }
  }
  return null;
}

/** PricingTemplate.breaks: ascending [{qty:number, tier_markups:{tier:number}}] */
export function validateTemplateBreaks(value) {
  if (!Array.isArray(value)) return "Breaks must be a JSON array.";
  let prev = -Infinity;
  for (let i = 0; i < value.length; i += 1) {
    const b = value[i];
    if (!isPlainObj(b)) return `Break ${i + 1} must be an object.`;
    if (!isFiniteNum(b.qty) || Number(b.qty) < 0) {
      return `Break ${i + 1} needs a non-negative numeric "qty".`;
    }
    if (Number(b.qty) <= prev) {
      return `Break ${i + 1} qty ${b.qty} must be greater than the previous break (${prev}).`;
    }
    prev = Number(b.qty);
    if (b.tier_markups !== undefined) {
      if (!isPlainObj(b.tier_markups)) return `Break ${i + 1} "tier_markups" must be an object.`;
      for (const [k, v] of Object.entries(b.tier_markups)) {
        if (!isFiniteNum(v)) return `Break ${i + 1} tier_markups["${k}"] must be a number.`;
      }
    }
  }
  return null;
}

/** PricingModifier.rates: [{label?:string, retail?:number, cost?:number, per_unit?:string}] */
export function validateModifierRates(value) {
  if (!Array.isArray(value)) return "Rates must be a JSON array.";
  for (let i = 0; i < value.length; i += 1) {
    const r = value[i];
    if (!isPlainObj(r)) return `Rate ${i + 1} must be an object.`;
    if (r.retail !== undefined && !isFiniteNum(r.retail)) return `Rate ${i + 1} "retail" must be a number.`;
    if (r.cost !== undefined && !isFiniteNum(r.cost)) return `Rate ${i + 1} "cost" must be a number.`;
    if (r.label !== undefined && typeof r.label !== "string") return `Rate ${i + 1} "label" must be a string.`;
    if (r.per_unit !== undefined && typeof r.per_unit !== "string") return `Rate ${i + 1} "per_unit" must be a string.`;
  }
  return null;
}

/** Machine.profiles: [{name:string, speed_settings?:object}] — names unique (ci). */
export function validateMachineProfiles(value) {
  if (!Array.isArray(value)) return "Profiles must be a JSON array.";
  const seen = new Set();
  for (let i = 0; i < value.length; i += 1) {
    const p = value[i];
    if (!isPlainObj(p)) return `Profile ${i + 1} must be an object.`;
    const name = String(p.name ?? "").trim();
    if (!name) return `Profile ${i + 1} needs a "name".`;
    if (seen.has(name.toLowerCase())) return `Profile "${name}" is duplicated.`;
    seen.add(name.toLowerCase());
    if (p.speed_settings !== undefined && !isPlainObj(p.speed_settings)) {
      return `Profile "${name}" speed_settings must be an object.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tab registry — columns/fields match the entity .jsonc declarations exactly.
// field.type: text | textarea | number | checkbox | select | list | json
// column.type: text | number | bool | status | list | json | render()
// ---------------------------------------------------------------------------

export const PRICING_ADMIN_TABS = [
  {
    key: "tiers",
    label: "Pricing Tiers",
    icon: "Layers",
    entity: "GlobalPricingTier",
    singular: "pricing tier",
    nameField: "name",
    sort: "name",
    hint: "Shared rule sets resolving each customer tier to a markup percent or a market-based mode — a catalog part links here instead of declaring its own chart.",
    columns: [
      { key: "name", label: "Name" },
      { key: "rules", label: "Rules", type: "json" },
      { key: "status", label: "Status", type: "status" },
      { key: "description", label: "Description" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true, placeholder: "Standard Tier" },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, default: "active" },
      { key: "description", label: "Description", type: "textarea" },
      {
        key: "rules", label: "Rules (JSON array)", type: "json", jsonKind: "array",
        help: '[{"tier":"General Public","markup_pct":50,"market_based":false}]',
        validateJson: validateTierRules,
      },
    ],
  },
  {
    key: "templates",
    label: "Templates",
    icon: "LayoutTemplate",
    entity: "PricingTemplate",
    singular: "pricing template",
    nameField: "name",
    sort: "sort",
    hint: "Quantity-break × customer-tier margin charts scoped to a unit category. Breaks must stay in ascending qty order.",
    columns: [
      { key: "name", label: "Name" },
      { key: "unit_category", label: "Unit category" },
      { key: "breaks", label: "Breaks", type: "json" },
      { key: "market_based", label: "Market", type: "bool" },
      { key: "sort", label: "Sort", type: "number" },
      { key: "status", label: "Status", type: "status" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true, placeholder: "Banner SqFt — Standard" },
      { key: "unit_category", label: "Unit category", type: "text", placeholder: "SqFt" },
      { key: "sort", label: "Sort order", type: "number", default: 0 },
      { key: "market_based", label: "Market-based chart (retail/discount instead of cost-plus)", type: "checkbox", default: false },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, default: "active" },
      { key: "description", label: "Description", type: "textarea" },
      {
        key: "breaks", label: "Quantity breaks (JSON array)", type: "json", jsonKind: "array",
        help: '[{"qty":1,"tier_markups":{"General Public":50}},{"qty":10,"tier_markups":{"General Public":40}}]',
        validateJson: validateTemplateBreaks,
      },
    ],
  },
  {
    key: "variables",
    label: "Global Variables",
    icon: "Variable",
    kind: "variables",
    hint: "Custom formula variables stored on the GlobalSettings.pricing_variables registry (F-07). Builtin names are reserved.",
  },
  {
    key: "modifiers",
    label: "Modifiers",
    icon: "SlidersHorizontal",
    entity: "PricingModifier",
    singular: "modifier",
    nameField: "name",
    sort: "display_order",
    hint: "Variable-rate modifiers attachable to catalog parts and estimate lines — extra inputs, rate tables, setup fees, minimums and waste factors.",
    columns: [
      { key: "name", label: "Name" },
      { key: "label", label: "Label" },
      { key: "input_type", label: "Input" },
      { key: "can_use_in_pricing", label: "Pricing", type: "bool" },
      { key: "rates", label: "Rates", type: "json" },
      { key: "min_charge", label: "Min $", type: "number" },
      { key: "display_order", label: "Order", type: "number" },
      { key: "status", label: "Status", type: "status" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true, placeholder: "rush_fee" },
      { key: "label", label: "Label", type: "text", placeholder: "Rush fee" },
      { key: "input_type", label: "Input type", type: "select", options: INPUT_TYPE_OPTIONS, default: "number" },
      { key: "can_use_in_pricing", label: "Can feed the pricing waterfall", type: "checkbox", default: false },
      { key: "include_setup_fee", label: "Include setup fee", type: "checkbox", default: false },
      { key: "affects_waste", label: "Scales waste/overage factor", type: "checkbox", default: false },
      { key: "min_charge", label: "Minimum charge ($)", type: "number", min: 0, default: 0 },
      { key: "display_order", label: "Display order", type: "number", default: 0 },
      { key: "inventoried_part_type", label: "Inventoried part type", type: "text" },
      { key: "pricing_tier_id", label: "Pricing tier id", type: "text" },
      { key: "formula_text", label: "Formula (CoreBridge variable-rate syntax)", type: "textarea" },
      { key: "status", label: "Status", type: "text", placeholder: "active" },
      {
        key: "rates", label: "Variable rate table (JSON array)", type: "json", jsonKind: "array",
        help: '[{"label":"Standard","retail":1.5,"cost":0.9,"per_unit":"sqft"}]',
        validateJson: validateModifierRates,
      },
    ],
  },
  {
    key: "machines",
    label: "Machines",
    icon: "Cog",
    entity: "Machine",
    singular: "machine",
    nameField: "name",
    sort: "name",
    hint: "Unified production machine registry — run cost, setup, disposables, labor share and named speed/quality profiles.",
    columns: [
      { key: "name", label: "Name" },
      { key: "machine_type", label: "Type" },
      { key: "cost_per_hour", label: "$/hr", type: "number" },
      { key: "setup_cost", label: "Setup $", type: "number" },
      { key: "setup_minutes", label: "Setup min", type: "number" },
      { key: "labor_pct", label: "Labor %", type: "number" },
      { key: "profiles", label: "Profiles", type: "json" },
      { key: "status", label: "Status", type: "status" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true, placeholder: "HP Latex 360" },
      { key: "machine_type", label: "Machine type", type: "select", options: MACHINE_TYPE_OPTIONS, default: "" },
      { key: "cost_per_hour", label: "Cost per hour ($)", type: "number", min: 0 },
      { key: "setup_cost", label: "Setup cost ($)", type: "number", min: 0 },
      { key: "setup_minutes", label: "Setup minutes", type: "number", min: 0 },
      { key: "disposable_cost_per_unit", label: "Disposable cost / unit ($)", type: "number", min: 0 },
      { key: "labor_pct", label: "Labor % (0-100)", type: "number", min: 0, max: 100 },
      { key: "weighted_multiplier", label: "Weighted multiplier", type: "number", min: 0 },
      { key: "margin_chart_id", label: "Margin chart id", type: "text" },
      { key: "income_account", label: "Income account", type: "text" },
      { key: "status", label: "Status", type: "text", placeholder: "active" },
      { key: "description", label: "Description", type: "textarea" },
      {
        key: "profiles", label: "Speed/quality profiles (JSON array)", type: "json", jsonKind: "array",
        help: '[{"name":"production","speed_settings":{"sqft_per_hour":180}}]',
        validateJson: validateMachineProfiles,
      },
    ],
  },
  {
    key: "labor",
    label: "Labor Levels",
    icon: "Clock",
    entity: "LaborLevel",
    singular: "labor level",
    nameField: "name",
    sort: "level_rank",
    stampsUpdatedBy: true,
    hint: "Billable labor rates by skill level — hourly_rate plus the throughput basis the engine uses to turn work into hours.",
    columns: [
      { key: "name", label: "Name" },
      { key: "level_rank", label: "Rank", type: "number" },
      { key: "hourly_rate", label: "$/hr", type: "number" },
      { key: "rate_basis", label: "Basis" },
      { key: "rate_value", label: "Rate", type: "number" },
      { key: "applies_to_categories", label: "Categories", type: "list" },
      { key: "status", label: "Status", type: "status" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true, placeholder: "Journeyman Installer" },
      { key: "level_rank", label: "Level rank", type: "number", default: 0 },
      { key: "hourly_rate", label: "Hourly rate ($/hr)", type: "number", required: true, min: 0 },
      { key: "rate_basis", label: "Rate basis", type: "select", options: RATE_BASIS_OPTIONS, default: "units_per_hour" },
      { key: "rate_value", label: "Rate value (throughput)", type: "number", min: 0, default: 1 },
      { key: "applies_to_categories", label: "Categories (comma list — blank = all)", type: "list" },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, default: "active" },
      { key: "description", label: "Description", type: "textarea" },
    ],
  },
  {
    key: "partGroups",
    label: "Part Groups",
    icon: "Boxes",
    entity: "BuilderPartGroup",
    singular: "part group",
    nameField: "group_name",
    sort: "sort_order",
    hint: "Named, ordered groups of builder parts inside a product. Groups are created by the product builder — this surface edits existing rows only (the gateway exposes updateMany only).",
    columns: [
      { key: "group_name", label: "Group" },
      { key: "client_label", label: "Client label" },
      { key: "builder_product_id", label: "Product id" },
      { key: "parent_group_id", label: "Parent" },
      { key: "sort_order", label: "Sort", type: "number" },
      { key: "is_active", label: "Active", type: "bool" },
      { key: "copy_as_unit", label: "Copy unit", type: "bool" },
      { key: "is_collapsed", label: "Collapsed", type: "bool" },
    ],
    fields: [
      { key: "group_name", label: "Group name", type: "text", required: true },
      { key: "client_label", label: "Client label", type: "text" },
      { key: "builder_product_id", label: "Builder product id", type: "text", required: true },
      { key: "group_key", label: "Group key", type: "text" },
      { key: "parent_group_id", label: "Parent group id", type: "text" },
      { key: "sort_order", label: "Sort order", type: "number", default: 0 },
      { key: "copy_as_unit", label: "Copy/move as a unit", type: "checkbox", default: true },
      { key: "is_collapsed", label: "Collapsed", type: "checkbox", default: false },
      { key: "is_active", label: "Active", type: "checkbox", default: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "notes", label: "Notes", type: "textarea" },
      { key: "group_snapshot", label: "Group snapshot (JSON object)", type: "json", jsonKind: "object" },
    ],
  },
  {
    key: "imports",
    label: "Import History",
    icon: "FileUp",
    entity: "ImportJob",
    singular: "import job",
    sort: "-created_date",
    limit: IMPORT_JOBS_LIMIT,
    readOnly: true,
    hint: "Spreadsheet import runs — read-only history owned by the importer pipeline.",
    columns: [
      { key: "started_at", label: "Started", type: "render", render: (r) => fmtDateTime(r?.started_at || r?.created_date) },
      { key: "user_email", label: "User" },
      { key: "import_type", label: "Type" },
      { key: "file_name", label: "File" },
      { key: "status", label: "Status", type: "status" },
      { key: "phase", label: "Phase" },
      {
        key: "_progress", label: "Progress", type: "render",
        render: (r) => { const p = importJobProgress(r); return `${p.done}/${p.total} (${p.pct}%)`; },
      },
      {
        key: "_results", label: "C/U/S/I", type: "render",
        render: (r) => `${Number(r?.created_items) || 0}/${Number(r?.updated_items) || 0}/${Number(r?.skipped_items) || 0}/${Number(r?.invalid_items) || 0}`,
      },
      { key: "duration_ms", label: "Duration", type: "render", render: (r) => fmtDuration(r?.duration_ms) },
    ],
    fields: [],
  },
];

export const registryTab = (key) => PRICING_ADMIN_TABS.find((t) => t.key === key) || null;
export const registryByEntity = (entity) => PRICING_ADMIN_TABS.find((t) => t.entity === entity) || null;

// ---------------------------------------------------------------------------
// Draft helpers (pure) — drafts keep json fields as pretty JSON text and list
// fields as comma text so inputs stay controlled; recordFromDraft coerces the
// declared shapes back out for the write payload.
// ---------------------------------------------------------------------------

export function blankDraft(config) {
  const draft = {};
  for (const f of config?.fields || []) {
    switch (f.type) {
      case "checkbox": draft[f.key] = f.default === undefined ? false : !!f.default; break;
      case "number": draft[f.key] = f.default ?? ""; break;
      case "list": draft[f.key] = ""; break;
      case "json": draft[f.key] = f.jsonKind === "object" ? "{}" : "[]"; break;
      case "select": draft[f.key] = f.default ?? (f.options?.[0]?.value ?? ""); break;
      default: draft[f.key] = f.default ?? "";
    }
  }
  return draft;
}

export function draftFromRow(config, row) {
  const draft = {};
  for (const f of config?.fields || []) {
    const v = row?.[f.key];
    switch (f.type) {
      case "checkbox": draft[f.key] = v === true; break;
      case "number": draft[f.key] = v === undefined || v === null ? "" : v; break;
      case "list": draft[f.key] = Array.isArray(v) ? v.join(", ") : (v ?? ""); break;
      case "json": {
        const fallback = f.jsonKind === "object" ? "{}" : "[]";
        draft[f.key] = v === undefined || v === null ? fallback : JSON.stringify(v, null, 2);
        break;
      }
      default: draft[f.key] = v === undefined || v === null ? "" : String(v);
    }
  }
  return draft;
}

/** Drop undefined and system fields — $set never touches identity keys. */
export function cleanRecord(record) {
  const out = {};
  for (const [k, v] of Object.entries(record || {})) {
    if (v === undefined || STRIP_FIELDS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Coerce a draft into the write payload. JSON fields parse + shape-validate;
 * blank optional numbers are omitted (a blank is "leave unset", not zero —
 * admins type 0 to zero a field). Returns { record, errors:[{field,message}] }.
 */
export function recordFromDraft(config, draft) {
  const record = {};
  const errors = [];
  for (const f of config?.fields || []) {
    const raw = draft?.[f.key];
    switch (f.type) {
      case "checkbox":
        record[f.key] = raw === true;
        break;
      case "number": {
        if (raw === "" || raw === undefined || raw === null) {
          if (f.required) errors.push({ field: f.key, message: `${f.label} is required.` });
          break; // optional numeric left blank -> omitted from the patch
        }
        const num = Number(raw);
        if (!Number.isFinite(num)) {
          errors.push({ field: f.key, message: `${f.label} must be a number.` });
        } else {
          record[f.key] = num;
        }
        break;
      }
      case "list":
        record[f.key] = String(raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "json": {
        const text = String(raw ?? "").trim();
        if (!text) {
          record[f.key] = f.jsonKind === "object" ? {} : [];
          break;
        }
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          errors.push({ field: f.key, message: `${f.label} is not valid JSON.` });
          break;
        }
        if (f.jsonKind === "object") {
          if (!isPlainObj(parsed)) {
            errors.push({ field: f.key, message: `${f.label} must be a JSON object.` });
            break;
          }
        } else if (!Array.isArray(parsed)) {
          errors.push({ field: f.key, message: `${f.label} must be a JSON array.` });
          break;
        }
        record[f.key] = parsed;
        if (typeof f.validateJson === "function") {
          const err = f.validateJson(parsed);
          if (err) errors.push({ field: f.key, message: err });
        }
        break;
      }
      default: {
        const s = typeof raw === "string" ? raw : String(raw ?? "");
        if (f.required && !s.trim()) {
          errors.push({ field: f.key, message: `${f.label} is required.` });
        }
        if (s !== "" || f.required || f.keepEmpty) record[f.key] = s;
        break;
      }
    }
  }
  return { record: cleanRecord(record), errors };
}

/**
 * Full draft validation: coercion errors + required + numeric range +
 * case-insensitive duplicate-name guard against the loaded rows.
 * Returns { record, errors }.
 */
export function validateDraft(config, draft, { rows = [], editingId = "" } = {}) {
  const { record, errors } = recordFromDraft(config, draft);
  for (const f of config?.fields || []) {
    if (f.type !== "number") continue;
    const v = record[f.key];
    if (v === undefined) continue;
    if (f.min !== undefined && v < f.min) errors.push({ field: f.key, message: `${f.label} must be at least ${f.min}.` });
    if (f.max !== undefined && v > f.max) errors.push({ field: f.key, message: `${f.label} must be at most ${f.max}.` });
  }
  const nameField = config?.nameField;
  if (nameField) {
    const want = String(record[nameField] ?? "").trim().toLowerCase();
    const clash = want && (rows || []).some((r) =>
      String(r?.id || "") !== String(editingId || "") &&
      String(r?.[nameField] ?? "").trim().toLowerCase() === want);
    if (clash) {
      errors.push({ field: nameField, message: `A ${config.singular || "record"} named "${record[nameField]}" already exists.` });
    }
  }
  return { record, errors };
}

/** CAS anchor for the gateway's single-record updateMany contract. */
export function casQueryFor(row) {
  const id = String(row?.id || "").trim();
  const updated = String(row?.updated_date || "").trim();
  if (!id || !updated) return null;
  return { id, updated_date: updated };
}

export function setPatchFor(record) {
  return { $set: cleanRecord(record) };
}

/** LaborLevel stamps updated_by with the saving admin's email. */
export function stampUpdatedBy(config, record, email) {
  if (!config?.stampsUpdatedBy) return record;
  const who = String(email || "").trim();
  return who ? { ...record, updated_by: who } : record;
}

/** Display text for one table cell. */
export function cellSummary(row, col) {
  if (col?.type === "render" && typeof col.render === "function") return col.render(row);
  const v = row?.[col?.key];
  switch (col?.type) {
    case "bool": return v === true ? "Yes" : v === false ? "No" : "—";
    case "status": return String(v || "active");
    case "json": {
      if (Array.isArray(v)) return v.length ? `${v.length} ${v.length === 1 ? "entry" : "entries"}` : "—";
      if (isPlainObj(v)) { const k = Object.keys(v).length; return k ? `${k} ${k === 1 ? "key" : "keys"}` : "—"; }
      return "—";
    }
    case "list": return Array.isArray(v) ? (v.length ? v.join(", ") : "—") : (v ?? "—") || "—";
    case "number": return v === undefined || v === null || v === "" ? "—" : String(v);
    default: {
      const s = v === undefined || v === null ? "" : String(v);
      if (!s) return "—";
      return s.length > 60 ? `${s.slice(0, 57)}…` : s;
    }
  }
}

/** ImportJob progress numbers for the history table. */
export function importJobProgress(row) {
  const total = Math.max(0, Number(row?.total_items) || 0);
  const done = Math.max(0, Number(row?.processed_items) || 0);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : (done > 0 ? 100 : 0);
  return { total, done, pct };
}

/** GlobalSettings carrier row for pricing_variables: canonical setting_key first, then any row already carrying the field. */
export function pickPricingVariablesRow(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const keyed = list.find((r) => String(r?.setting_key || "").trim() === PRICING_VARIABLES_SETTING_KEY);
  if (keyed) return keyed;
  return list.find((r) => Array.isArray(r?.pricing_variables)) || null;
}

/**
 * Normalize a variables draft list through shared/pricingVariables. Returns
 * { rows, errors:[{name,error}] } — errors describe entries normalize() would
 * mark status:'error' (invalid/reserved/duplicate/non-numeric).
 */
export function validatePricingVariablesDraft(drafts) {
  const normalized = normalizePricingVariables(drafts);
  const errors = normalized
    .filter((r) => r.status === "error")
    .map((r) => ({ name: r.name || "(unnamed)", error: r.error || "invalid variable" }));
  return { rows: normalized, errors };
}

export function pageCountFor(rows, pageSize = REGISTRY_PAGE_SIZE) {
  const n = Array.isArray(rows) ? rows.length : 0;
  return Math.max(1, Math.ceil(n / Math.max(1, pageSize)));
}

export function pageSlice(rows, page, pageSize = REGISTRY_PAGE_SIZE) {
  const list = Array.isArray(rows) ? rows : [];
  const p = Math.max(0, Math.min(Number(page) || 0, pageCountFor(list, pageSize) - 1));
  return list.slice(p * pageSize, p * pageSize + pageSize);
}

// ---------------------------------------------------------------------------
// Error surfacing (pure) — a refused staff write must read as an admin gate,
// not a crash.
// ---------------------------------------------------------------------------

export const isForbidden = (err) => Number(err?.status ?? err?.response?.status) === 403;

export function friendlyRegistryError(err, singular = "registry") {
  if (isForbidden(err)) {
    return `Only administrators can manage ${singular} records — this session was refused (403).`;
  }
  return err?.response?.data?.error || err?.data?.error || err?.message || "The request failed.";
}

const fmtDateTime = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
};
const fmtDuration = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`;
};

// ---------------------------------------------------------------------------
// React surface
// ---------------------------------------------------------------------------

const TAB_ICONS = { Layers, LayoutTemplate, Variable, SlidersHorizontal, Cog, Clock, Boxes, FileUp };

const inputCls = "h-[30px] w-full rounded border border-gray-300 px-2 text-[11px] text-gray-800 disabled:opacity-50";
const textareaCls = "w-full rounded border border-gray-300 px-2 py-1.5 text-[11px] text-gray-800 font-mono disabled:opacity-50";
const labelCls = "block text-[10px] font-bold tracking-wide text-gray-500 mb-1";
const thCls = "px-2 py-1.5 text-left text-[9px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap";
const tdCls = "px-2 py-1.5 text-[11px] text-gray-700 align-top";

function FieldEditor({ field, value, onChange, disabled }) {
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-[11px] text-gray-700 h-[30px]">
        <input type="checkbox" className="w-3.5 h-3.5 accent-red-600" checked={value === true}
          disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span>{field.label}</span>
      </label>
    );
  }
  const control = (() => {
    if (field.type === "select") {
      return (
        <select className={inputCls} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {(field.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (field.type === "number") {
      return (
        <input type="number" step="0.01" className={inputCls} value={value ?? ""} placeholder={field.placeholder}
          disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      );
    }
    if (field.type === "textarea" || field.type === "json") {
      return (
        <textarea rows={field.type === "json" ? 6 : 2} className={textareaCls} value={value ?? ""}
          placeholder={field.help || field.placeholder} disabled={disabled} spellCheck={false}
          onChange={(e) => onChange(e.target.value)} />
      );
    }
    return (
      <input type="text" className={inputCls} value={value ?? ""} placeholder={field.placeholder}
        disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    );
  })();
  return (
    <div>
      <div className={labelCls}>{field.label}{field.required ? " *" : ""}</div>
      {control}
      {field.help && field.type !== "json" && <div className="mt-0.5 text-[9px] text-gray-400">{field.help}</div>}
    </div>
  );
}

function RegistryEditDialog({ config, row, open, readOnly, onClose, onSave, onDelete, saving }) {
  const [draft, setDraft] = useState(() => (row ? draftFromRow(config, row) : blankDraft(config)));
  const [errors, setErrors] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (open) {
      setDraft(row ? draftFromRow(config, row) : blankDraft(config));
      setErrors([]);
      setConfirmDelete(false);
    }
    // config identity churns each parent render (rows are folded in for the
    // dup-name check) — only the open transition and the target row re-seed.
  }, [open, row]);
  if (!open) return null;
  const ops = registryWriteOps(config.entity);
  const isNew = !row;
  const patch = (key, v) => setDraft((d) => ({ ...d, [key]: v }));
  const submit = () => {
    const { record, errors: errs } = validateDraft(config, draft, { rows: config._rows || [], editingId: row?.id || "" });
    setErrors(errs);
    if (errs.length === 0) onSave(record);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mt-10 w-full max-w-2xl bg-white rounded-lg border border-gray-200 shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="text-[11px] font-bold tracking-wide text-gray-700 uppercase">
            {readOnly ? "View" : isNew ? "New" : "Edit"} {config.singular || config.label}
          </div>
          <button type="button" className="p-1 text-gray-400 hover:text-gray-700" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="px-4 py-3 grid sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
          {(config.fields || []).map((f) => (
            <div key={f.key} className={f.type === "textarea" || f.type === "json" || f.type === "checkbox" ? "sm:col-span-2" : ""}>
              <FieldEditor field={f} value={draft[f.key]} disabled={readOnly || saving} onChange={(v) => patch(f.key, v)} />
            </div>
          ))}
        </div>
        {errors.length > 0 && (
          <div className="mx-4 mb-3 border border-red-200 bg-red-50 rounded px-3 py-2">
            {errors.map((e, i) => <div key={i} className="text-[10px] text-red-700">{e.message}</div>)}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100">
          <div>
            {!readOnly && !isNew && ops.delete && (
              confirmDelete ? (
                <span className="inline-flex items-center gap-1.5">
                  <button type="button" disabled={saving}
                    className="h-[30px] px-3 rounded border border-red-300 bg-red-600 text-white text-[11px] font-bold hover:bg-red-700 disabled:opacity-50"
                    onClick={() => onDelete(row)}>Confirm delete</button>
                  <button type="button" className="h-[30px] px-2 text-[11px] text-gray-500" onClick={() => setConfirmDelete(false)}>Cancel</button>
                </span>
              ) : (
                <button type="button" disabled={saving}
                  className="h-[30px] px-3 rounded border border-red-200 text-red-600 text-[11px] font-bold hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1"
                  onClick={() => setConfirmDelete(true)}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="h-[30px] px-3 rounded border border-gray-300 text-[11px] text-gray-600 hover:bg-gray-50" onClick={onClose}>
              {readOnly ? "Close" : "Cancel"}
            </button>
            {!readOnly && (
              <button type="button" disabled={saving}
                className="h-[30px] px-4 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-40 inline-flex items-center gap-1.5"
                onClick={submit}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? "Saving…" : isNew ? "Create" : "Save"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RegistryCrudTab({ config, canManage }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(null); // {row|null->new}
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const ops = registryWriteOps(config.entity);
  const readOnly = config.readOnly === true || !canManage;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await loadAllEntityRows({
        entity: staffEntities[config.entity],
        sort: config.sort || "name",
        limit: config.limit || null,
        label: `Pricing admin ${config.entity} registry`,
      });
      setRows(data);
      setPage(0);
    } catch (err) {
      setError(friendlyRegistryError(err, config.singular));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [config.entity]);

  const filtered = useMemo(() => {
    if (!statusFilter) return rows;
    return rows.filter((r) => String(r?.status || "") === statusFilter);
  }, [rows, statusFilter]);
  const pages = pageCountFor(filtered);
  const pageRows = pageSlice(filtered, Math.min(page, pages - 1));

  const save = async (record) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = stampUpdatedBy(config, record, getSessionUser()?.email);
      if (!editing?.row) {
        if (!ops.create) throw new Error(`New ${config.singular} rows cannot be created here.`);
        await staffEntities[config.entity].create(payload);
        setMessage(`${config.label} row created.`);
      } else {
        const anchor = casQueryFor(editing.row);
        if (!anchor) throw new Error(`This ${config.singular} is missing its current version. Reload before saving.`);
        const result = await staffEntities[config.entity].updateMany(anchor, setPatchFor(payload));
        if (result && typeof result.updated === "number") {
          if (result.updated === 0) throw new Error(`This ${config.singular} changed in another session. Reload before saving.`);
          if (result.updated !== 1) throw new Error(`Saving this ${config.singular} matched ${result.updated} records. Reload and review.`);
        }
        setMessage(`${config.label} row saved.`);
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(friendlyRegistryError(err, config.singular));
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  const remove = async (row) => {
    setSaving(true);
    setError("");
    try {
      await staffEntities[config.entity].delete(row.id);
      setMessage(`${config.label} row deleted.`);
      setEditing(null);
      await load();
    } catch (err) {
      setError(friendlyRegistryError(err, config.singular));
    } finally {
      setSaving(false);
    }
  };

  const dialogConfig = { ...config, _rows: rows };
  return (
    <div>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="text-[10px] text-gray-500 max-w-xl">{config.hint}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          {config.entity === "ImportJob" && (
            <select className="h-[28px] rounded border border-gray-300 px-1.5 text-[10px] text-gray-700"
              value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
              {IMPORT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          <button type="button" onClick={load} disabled={loading}
            className="h-[28px] px-2.5 rounded border border-gray-300 text-[10px] font-bold text-gray-600 hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Reload
          </button>
          {!readOnly && ops.create && (
            <button type="button" onClick={() => setEditing({ row: null })}
              className="h-[28px] px-2.5 rounded border border-lime-400 bg-lime-200 text-[10px] font-bold text-gray-900 hover:bg-lime-300 inline-flex items-center gap-1">
              <Plus className="w-3 h-3" /> New
            </button>
          )}
        </div>
      </div>
      {!readOnly && !ops.create && !config.readOnly && (
        <div className="mt-2 border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] text-amber-800 rounded">
          New {config.singular} rows are created by the product builder — this surface edits existing rows only (the staff gateway exposes no create or delete for {config.entity}).
        </div>
      )}
      {readOnly && !config.readOnly && !canManage && (
        <div className="mt-2 border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] text-amber-800 rounded">
          Read-only for this session — only administrators can manage {config.singular} records (the gateway refuses other writes with 403).
        </div>
      )}

      {message && <div className="mt-2 border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] text-emerald-800 rounded">{message}</div>}
      {error && <div className="mt-2 border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] text-red-700 rounded">{error}</div>}

      <div className="mt-2 overflow-x-auto border border-gray-200 rounded">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {config.columns.map((c) => <th key={c.key} className={thCls}>{c.label}</th>)}
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={config.columns.length + 1} className="px-3 py-6 text-center text-[11px] text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />Loading {config.label}…
              </td></tr>
            )}
            {!loading && pageRows.length === 0 && (
              <tr><td colSpan={config.columns.length + 1} className="px-3 py-6 text-center text-[11px] text-gray-400">
                No {config.label} rows{statusFilter ? " match this filter" : ""}.
              </td></tr>
            )}
            {!loading && pageRows.map((r) => (
              <tr key={r.id || JSON.stringify(r)} className="border-b border-gray-100 hover:bg-gray-50/60">
                {config.columns.map((c) => <td key={c.key} className={tdCls}>{cellSummary(r, c)}</td>)}
                <td className="px-2 py-1.5 text-right whitespace-nowrap">
                  {readOnly ? (
                    <button type="button" className="p-1 text-gray-400 hover:text-gray-700" title="View"
                      onClick={() => setViewing(r)}><Pencil className="w-3.5 h-3.5" /></button>
                  ) : (
                    <button type="button" className="p-1 text-gray-400 hover:text-gray-700" title="Edit"
                      onClick={() => setEditing({ row: r })}><Pencil className="w-3.5 h-3.5" /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500">
          <span>{filtered.length} rows · page {Math.min(page, pages - 1) + 1} of {pages}</span>
          <span className="flex items-center gap-1.5">
            <button type="button" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}
              className="h-[24px] px-2 rounded border border-gray-300 disabled:opacity-40">Prev</button>
            <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}
              className="h-[24px] px-2 rounded border border-gray-300 disabled:opacity-40">Next</button>
          </span>
        </div>
      )}

      <RegistryEditDialog
        config={dialogConfig}
        row={editing?.row || null}
        open={!!editing}
        readOnly={readOnly}
        saving={saving}
        onClose={() => setEditing(null)}
        onSave={save}
        onDelete={remove}
      />
      {viewing && config.entity === "ImportJob" && (
        <ImportJobDetail row={viewing} onClose={() => setViewing(null)} />
      )}
      {viewing && config.entity !== "ImportJob" && (
        <RegistryEditDialog
          config={dialogConfig}
          row={viewing}
          open={!!viewing}
          readOnly
          saving={false}
          onClose={() => setViewing(null)}
          onSave={() => {}}
          onDelete={() => {}}
        />
      )}
    </div>
  );
}

const IMPORT_DETAIL_FIELDS = [
  "user_email", "import_type", "status", "phase", "total_items", "processed_items",
  "current_item", "started_at", "completed_at", "duration_ms", "parse_ms",
  "match_ms", "apply_ms", "file_name", "file_hash", "file_size_bytes",
  "created_items", "updated_items", "unchanged_items", "skipped_items",
  "conflict_items", "ambiguous_items", "invalid_items", "error_message",
  "result_message",
];

function ImportJobDetail({ row, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mt-10 w-full max-w-xl bg-white rounded-lg border border-gray-200 shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="text-[11px] font-bold tracking-wide text-gray-700 uppercase">Import job detail</div>
          <button type="button" className="p-1 text-gray-400 hover:text-gray-700" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <dl className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2 max-h-[60vh] overflow-y-auto">
          {IMPORT_DETAIL_FIELDS.map((k) => (
            <div key={k} className={k.includes("message") || k === "current_item" || k === "file_name" || k === "file_hash" ? "col-span-2" : ""}>
              <dt className="text-[9px] font-bold tracking-wide text-gray-400 uppercase">{k}</dt>
              <dd className="text-[11px] text-gray-800 break-all">
                {k.endsWith("_at") ? fmtDateTime(row?.[k]) : k.endsWith("_ms") ? fmtDuration(row?.[k]) : cellSummary(row, { key: k })}
              </dd>
            </div>
          ))}
        </dl>
        <div className="px-4 py-3 border-t border-gray-100 text-right">
          <button type="button" className="h-[30px] px-4 rounded border border-gray-300 text-[11px] text-gray-600 hover:bg-gray-50" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Global Variables tab — GlobalSettings.pricing_variables (top-level field on
// the 'pricingVariables' carrier row), saved through CAS updateMany.
// ---------------------------------------------------------------------------

let varSeq = 0;
const newVarKey = () => `var_${(varSeq += 1)}`;

function GlobalVariablesTab({ canManage }) {
  const [carrier, setCarrier] = useState(undefined); // undefined = loading
  const [vars, setVars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await loadAllEntityRows({
        entity: staffEntities.GlobalSettings,
        sort: "setting_key",
        label: "Pricing admin GlobalSettings registry",
      });
      const found = pickPricingVariablesRow(rows);
      setCarrier(found || null);
      setVars(normalizePricingVariables(found?.pricing_variables).map((v) => ({ ...v, _key: newVarKey() })));
    } catch (err) {
      setError(friendlyRegistryError(err, "pricing variable"));
      setCarrier(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const patch = (key, field, value) =>
    setVars((prev) => prev.map((v) => (v._key === key ? { ...v, [field]: value } : v)));
  const addVar = () =>
    setVars((prev) => [...prev, { _key: newVarKey(), name: "", label: "", description: "", default_value: 0, status: "active" }]);
  const dropVar = (key) => setVars((prev) => prev.filter((v) => v._key !== key));

  const draft = vars.map(({ name, label, description, default_value, status }) => ({
    name, label, description, default_value, status,
  }));
  const check = validatePricingVariablesDraft(draft);

  const save = async () => {
    if (!carrier?.id) return;
    if (check.errors.length) {
      setError(`Fix the flagged variables before saving: ${check.errors.map((e) => `${e.name} (${e.error})`).join("; ")}`);
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await replaceEntityFieldsIfUnchanged({
        entity: staffEntities.GlobalSettings,
        id: carrier.id,
        expectedUpdatedAt: carrier.updated_date || "",
        expectedFields: { pricing_variables: carrier.pricing_variables },
        nextFields: { pricing_variables: check.rows.map(({ name, label, description, default_value, status }) => ({ name, label, description, default_value, status })) },
        guardFields: { setting_key: String(carrier.setting_key || "") },
        label: "Pricing variables registry",
      });
      setCarrier(saved);
      setVars(normalizePricingVariables(saved?.pricing_variables).map((v) => ({ ...v, _key: newVarKey() })));
      setMessage("Pricing variables saved.");
    } catch (err) {
      setError(friendlyRegistryError(err, "pricing variable"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-[11px] text-gray-400 flex items-center gap-2 py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading pricing variables…</div>;
  }
  if (!carrier) {
    return (
      <div>
        <p className="text-[10px] text-gray-500 max-w-xl">
          Custom formula variables stored on the GlobalSettings.pricing_variables registry (F-07). Builtin names are reserved.
        </p>
        {error && <div className="mt-2 border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] text-red-700 rounded">{error}</div>}
        {!error && (
          <div className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800 rounded">
            No GlobalSettings row carries the <span className="font-mono">pricing_variables</span> registry yet — seed one with
            setting_key <span className="font-mono">"{PRICING_VARIABLES_SETTING_KEY}"</span>. GlobalSettings exposes no staff
            create op, so this surface cannot mint the row; an admin function or seed script must create it first.
          </div>
        )}
        <div className="mt-3">
          <div className={labelCls}>RESERVED BUILTIN NAMES (always available to formulas)</div>
          <div className="flex flex-wrap gap-1.5">
            {BUILTIN_VARIABLES.map((b) => (
              <span key={b.name} className="px-2 py-0.5 rounded bg-gray-100 border border-gray-200 text-[10px] font-mono text-gray-700" title={b.description}>
                {b.name} = {b.default}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="text-[10px] text-gray-500 max-w-xl">
          Stored on the <span className="font-mono">{PRICING_VARIABLES_SETTING_KEY}</span> GlobalSettings row's top-level
          <span className="font-mono"> pricing_variables</span> field (CAS save). Builtins are reserved — a colliding name can never shadow one.
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={load} disabled={loading}
            className="h-[28px] px-2.5 rounded border border-gray-300 text-[10px] font-bold text-gray-600 hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-50">
            <RefreshCw className="w-3 h-3" /> Reload
          </button>
          {canManage && (
            <button type="button" onClick={addVar}
              className="h-[28px] px-2.5 rounded border border-lime-400 bg-lime-200 text-[10px] font-bold text-gray-900 hover:bg-lime-300 inline-flex items-center gap-1">
              <Plus className="w-3 h-3" /> Variable
            </button>
          )}
        </div>
      </div>

      <div className="mt-2">
        <div className={labelCls}>RESERVED BUILTIN NAMES</div>
        <div className="flex flex-wrap gap-1.5">
          {BUILTIN_VARIABLES.map((b) => (
            <span key={b.name} className="px-2 py-0.5 rounded bg-gray-100 border border-gray-200 text-[10px] font-mono text-gray-700" title={b.description}>
              {b.name} = {b.default}
            </span>
          ))}
        </div>
      </div>

      {message && <div className="mt-2 border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] text-emerald-800 rounded">{message}</div>}
      {error && <div className="mt-2 border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] text-red-700 rounded">{error}</div>}
      {check.errors.length > 0 && (
        <div className="mt-2 border border-amber-200 bg-amber-50 px-3 py-1.5 rounded">
          {check.errors.map((e, i) => <div key={i} className="text-[10px] text-amber-800">{e.name}: {e.error}</div>)}
        </div>
      )}

      <div className="mt-2 overflow-x-auto border border-gray-200 rounded">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className={thCls}>Name</th><th className={thCls}>Label</th><th className={thCls}>Default</th>
              <th className={thCls}>Status</th><th className={thCls}>Description</th><th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {vars.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-[11px] text-gray-400">No custom variables — formulas see only the builtins.</td></tr>
            )}
            {vars.map((v) => (
              <tr key={v._key} className={`border-b border-gray-100 ${v.status === "error" ? "bg-red-50/60" : ""}`}>
                <td className="px-1.5 py-1"><input className={`${inputCls} font-mono`} value={v.name} disabled={!canManage || saving} onChange={(e) => patch(v._key, "name", e.target.value)} placeholder="SqFtRate" /></td>
                <td className="px-1.5 py-1"><input className={inputCls} value={v.label} disabled={!canManage || saving} onChange={(e) => patch(v._key, "label", e.target.value)} /></td>
                <td className="px-1.5 py-1 w-24"><input type="number" step="0.01" className={inputCls} value={v.default_value} disabled={!canManage || saving} onChange={(e) => patch(v._key, "default_value", e.target.value)} /></td>
                <td className="px-1.5 py-1 w-28"><input className={inputCls} value={v.status} disabled={!canManage || saving} onChange={(e) => patch(v._key, "status", e.target.value)} placeholder="active" /></td>
                <td className="px-1.5 py-1"><input className={inputCls} value={v.description} disabled={!canManage || saving} onChange={(e) => patch(v._key, "description", e.target.value)} /></td>
                <td className="px-1.5 py-1 text-right">
                  {canManage && <button type="button" className="p-1 text-gray-400 hover:text-red-600" onClick={() => dropVar(v._key)}><Trash2 className="w-3.5 h-3.5" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && (
        <div className="mt-2 text-right">
          <button type="button" onClick={save} disabled={saving}
            className="h-[30px] px-4 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-40 inline-flex items-center gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving…" : "Save variables"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel — admin card hosting the tab strip + the active registry surface.
// ---------------------------------------------------------------------------

export default function PricingRegistriesPanel() {
  const isAdmin = getSessionUser()?.role === "admin";
  const [active, setActive] = useState(PRICING_ADMIN_TABS[0].key);
  const activeConfig = registryTab(active) || PRICING_ADMIN_TABS[0];

  return (
    <div className="bg-white px-4 py-4 border-t-4 border-violet-300">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-red-500" />
        <div className="text-xs font-bold tracking-wide text-gray-600">PRICING REGISTRIES</div>
      </div>
      <p className="mt-1 text-[11px] text-gray-500">
        CoreBridge settings parity — the shared pricing registries behind the estimator. Complements the Pricing Admin page (tier matrices, machine rates, quote simulator).
      </p>
      {!isAdmin && (
        <div className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800 rounded">
          Read-only — only administrators can change pricing registry records; the write gateway refuses other sessions with 403.
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1 border-b border-gray-200 pb-2">
        {PRICING_ADMIN_TABS.map((t) => {
          const TIcon = TAB_ICONS[t.icon] || Layers;
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={`h-[28px] px-2.5 rounded text-[10px] font-bold tracking-wide inline-flex items-center gap-1.5 border ${
                on ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              <TIcon className="w-3 h-3" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        {activeConfig.kind === "variables" ? (
          <GlobalVariablesTab canManage={isAdmin} />
        ) : (
          <RegistryCrudTab key={activeConfig.key} config={activeConfig} canManage={isAdmin} />
        )}
      </div>
    </div>
  );
}
