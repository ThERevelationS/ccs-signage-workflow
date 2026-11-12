// Estimate / parts-library / line-item / template-section import helpers.
//
// Mapper + planning functions are pure and unit-tested under Node
// (scripts/test-estimate-import-export.mjs). Orchestration functions take
// injectable dependencies with production defaults so tests never touch the
// SDK.
//
// Covers backlog §19: #451 (JSON re-import), #453 (parts-library CSV),
// #455 (legacy/BOM → AllInOneEstimate), #460 (link customer by name),
// #464 (copy BOM across estimates), #467 (template section instantiation),
// #473 (line-items CSV).

import { ensureNewEstimate, newEstimateCreationKey } from "./estimateCreationService";
import { ensureNewCustomer, newCustomerCreationKey } from "./customerCreationService";
import { replaceEstimateFieldsIfUnchanged, expectedEstimateFields } from "./estimatePersistence";
import { ensureIdempotentEntityCreate } from "./idempotentEntityCreate";
import { loadAllEntityRows } from "./loadAllEntityRows";
import { staffEntities } from "@/components/staff/staffEntities";
import { addPartPackageToProduct } from "./parts/partPackageService";
import { cloneSnapshot } from "./products/snapshotUtils";
import { builderMutationHash } from "./builder/builderMutationRecovery";

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const cleanStr = (v) => (v === null || v === undefined ? "" : String(v).trim());
const nameKey = (s) => cleanStr(s).toLowerCase().replace(/\s+/g, " ");

// ---------------------------------------------------------------------------
// Tiny CSV parser — quoted fields, escaped quotes, CRLF, BOM.
// ---------------------------------------------------------------------------

export function parseCsvRows(text) {
  const src = String(text || "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i += 1; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cur); cur = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

export function csvRecords(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map((h) => cleanStr(h).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, ""));
  const records = rows.slice(1).map((cells, index) => ({
    row: index + 2,
    data: Object.fromEntries(headers.map((h, i) => [h, cells[i] !== undefined ? cleanStr(cells[i]) : ""])),
  }));
  return { headers, records };
}

const pick = (data, ...names) => {
  for (const n of names) {
    if (data[n] !== undefined && data[n] !== "") return data[n];
  }
  return "";
};

// ---------------------------------------------------------------------------
// #451 — estimate JSON re-import (round-trip with exportEstimates.js)
// ---------------------------------------------------------------------------

// Identity/lifecycle/audit fields removed on import — mirrors the duplicate
// strip list in estimateCreationService.js so an imported estimate lands as a
// fresh draft with a new estimate_number and empty audit state.
export const IMPORT_STRIP_FIELDS = new Set([
  "id", "created_date", "updated_date", "created_by", "created_by_id",
  "estimate_number", "status", "quote_version",
  "work_order_id", "customer_po",
  "internal_approval", "deleted", "deleted_at", "deleted_by",
  "accepted_at", "accepted_by_name", "accepted_by_email",
  "sent_at", "sent_to_email", "delivery_id",
  "quote_issue_date", "quote_issue_key", "quote_expiration_date",
  "revision_reason", "closed_revision_id", "edit_reason",
  "cancel_reason", "cancelled_at", "archived_at", "archived_reason",
  "is_template", "split_from_estimate_id", "duplicated_from_estimate_id",
  "last_product_removal_key", "last_product_removal_line_id", "last_product_removal_at",
  "pipeline_sync_pending", "pipeline_sync_error",
  "creation_request_key", "idempotency_key",
]);

export function sanitizeEstimateForImport(raw = {}) {
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (IMPORT_STRIP_FIELDS.has(key) || key.startsWith("_")) continue;
    out[key] = value;
  }
  out.status = "draft";
  out.estimate_number = "";
  return out;
}

// Accepts the shapes we actually export plus a bare estimate object:
//   { format:"aio-estimate-v1", estimate }        — single export (#451)
//   { format:"aio-estimate-backup-v1", estimates } — backup file (#468)
//   { estimate } / bare AllInOneEstimate field bag — lenient fallback
export function parseEstimateImportJson(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object — an exported estimate file or a legacy estimate payload.");
  }
  if (parsed.format === "aio-estimate-v1" && parsed.estimate) return { estimates: [parsed.estimate], format: "native" };
  if (parsed.format === "aio-estimate-backup-v1" && Array.isArray(parsed.estimates)) return { estimates: parsed.estimates, format: "backup" };
  if (parsed.estimate && typeof parsed.estimate === "object") return { estimates: [parsed.estimate], format: "native" };
  if (Array.isArray(parsed.estimates)) return { estimates: parsed.estimates, format: "backup" };
  return { estimates: [parsed], format: "bare" };
}

// ---------------------------------------------------------------------------
// #460 — link an imported estimate to an existing customer by name
// ---------------------------------------------------------------------------
//
// Exact (normalized) company_name match wins. Fuzzy = unambiguous prefix or
// containment match across company_name / legacy_name — returned as
// `candidates` so the caller can ask the user to confirm before linking. Never
// guesses across multiple fuzzy hits.

export function resolveImportCustomer({ name, customers = [] } = {}) {
  const key = nameKey(name);
  if (!key) return { status: "none", customer: null, candidates: [] };
  const namesOf = (c) => [c.company_name, c.legacy_name, c.contact_name, c.display_name].map(nameKey).filter(Boolean);
  const exact = customers.find((c) => namesOf(c).includes(key));
  if (exact) return { status: "exact", customer: exact, candidates: [exact] };
  const fuzzy = customers.filter((c) => namesOf(c).some((n) => n.startsWith(key) || (key.length >= 4 && n.includes(key))));
  if (fuzzy.length === 1) return { status: "fuzzy", customer: fuzzy[0], candidates: fuzzy };
  if (fuzzy.length > 1) return { status: "ambiguous", customer: null, candidates: fuzzy };
  return { status: "none", customer: null, candidates: [] };
}

// ---------------------------------------------------------------------------
// #455 — legacy / BOM-shaped estimate → AllInOneEstimate payload
// ---------------------------------------------------------------------------
//
// Honestly supported input shapes (documented, no silent guessing):
//   • Native aio exports (handled by parseEstimateImportJson, not here)
//   • { customer|client_name, project|project_name|title,
//       line_items|sections|items|bom: [
//         { name|part_name|description, qty|quantity,
//           unit_cost|cost|cost_each, unit_price|price|sell|sell_price,
//           section|group|category }
//       ] }
// Everything else throws an honest "unsupported shape" error.

export function mapLegacyEstimateToAio(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Legacy estimate import expects a JSON object with customer/project fields and an items/line_items/bom list.");
  }
  const clientName = cleanStr(raw.client_name ?? raw.customer ?? raw.customer_name ?? raw.company ?? "");
  const projectName = cleanStr(raw.project_name ?? raw.project ?? raw.title ?? raw.job_name ?? "");
  const itemLists = [raw.line_items, raw.sections, raw.items, raw.bom, raw.parts].filter(Array.isArray);
  const rawItems = itemLists[0] || [];
  if (!rawItems.length) {
    throw new Error("No importable line items found. Supported keys: line_items, sections, items, bom, parts — each an array of {name, qty, unit_cost, unit_price}.");
  }

  const lineItems = [];
  const dropped = [];
  rawItems.forEach((item, index) => {
    const label = cleanStr(item.client_product_name ?? item.name ?? item.part_name ?? item.description ?? item.item ?? "");
    if (!label) { dropped.push({ row: index + 1, reason: "No item name" }); return; }
    const qty = Math.max(0, num(item.customer_quantity ?? item.qty ?? item.quantity, 1));
    const unitCost = num(item.unit_cost ?? item.cost ?? item.cost_each ?? item.internal_cost);
    const unitPrice = num(item.unit_price ?? item.price ?? item.sell ?? item.sell_price ?? item.customer_price, unitCost);
    lineItems.push({
      line_id: `imported-${index + 1}-${Math.random().toString(36).slice(2, 8)}`,
      module_key: "custom",
      client_product_name: label,
      project_name: cleanStr(item.section ?? item.group ?? item.category ?? projectName) || label,
      product_category: cleanStr(item.category ?? item.section ?? item.group ?? "imported"),
      customer_description: cleanStr(item.description ?? item.notes ?? ""),
      customer_quantity: qty || 1,
      total_snapshot: unitCost,
      customer_price_snapshot: unitPrice,
      adjustment_percent: num(item.adjustment_percent),
      include_in_customer: item.include_in_customer !== false,
      imported_source: "legacy_estimate_import",
    });
  });
  if (!lineItems.length) throw new Error("Every row was dropped — no importable line items (each needs a name).");

  return {
    payload: {
      client_name: clientName,
      project_name: projectName || clientName || "Imported estimate",
      contact_email: cleanStr(raw.contact_email ?? raw.email ?? ""),
      office_phone: cleanStr(raw.office_phone ?? raw.phone ?? ""),
      site_address: cleanStr(raw.site_address ?? raw.address ?? ""),
      notes: cleanStr(raw.notes ?? ""),
      line_items: lineItems,
      imported_from: "legacy_estimate_import",
    },
    lineItems,
    dropped,
    warnings: dropped.length ? [`${dropped.length} row(s) dropped without an item name.`] : [],
  };
}

// ---------------------------------------------------------------------------
// #473 — estimate line items from CSV → append to line_items via CAS
// ---------------------------------------------------------------------------
//
// Columns (case-insensitive, common aliases accepted):
//   section|group|category — optional grouping label → product_category
//   name|item|part|description — required
//   qty|quantity — defaults to 1
//   unit_cost|cost — internal cost per unit → total_snapshot
//   unit_price|price|sell — customer unit price → customer_price_snapshot
//   notes|desc — appended to customer_description when not used as name

export function mapLineItemsCsv(text) {
  const { records } = csvRecords(text);
  const lineItems = [];
  const dropped = [];
  records.forEach(({ row, data }) => {
    const name = pick(data, "name", "item", "part_name", "part", "product", "description", "item_name");
    if (!name) { dropped.push({ row, reason: "No item name" }); return; }
    const qty = Math.max(0, num(pick(data, "qty", "quantity", "customer_quantity"), 1));
    const unitCost = num(pick(data, "unit_cost", "cost", "cost_each", "internal_cost"));
    const unitPrice = num(pick(data, "unit_price", "price", "sell", "sell_price", "customer_price"), unitCost);
    const section = pick(data, "section", "group", "category", "product_category", "section_name");
    lineItems.push({
      line_id: `csv-${row}-${Math.random().toString(36).slice(2, 8)}`,
      module_key: "custom",
      client_product_name: name,
      project_name: section || name,
      product_category: section || "imported",
      customer_description: pick(data, "notes", "note", "desc"),
      customer_quantity: qty || 1,
      total_snapshot: unitCost,
      customer_price_snapshot: unitPrice,
      adjustment_percent: num(pick(data, "adjustment_percent", "markup_percent")),
      include_in_customer: true,
      imported_source: "line_items_csv",
      source_row: row,
    });
  });
  return { lineItems, dropped, totalRows: records.length };
}

export function mergeLineItems(existing = [], incoming = []) {
  const usedIds = new Set((existing || []).map((l) => l?.line_id).filter(Boolean));
  const merged = [...(existing || [])];
  for (const line of incoming) {
    let id = line.line_id;
    while (id && usedIds.has(id)) id = `${id}-r`;
    usedIds.add(id);
    merged.push({ ...line, line_id: id || `csv-${merged.length + 1}-${Math.random().toString(36).slice(2, 8)}` });
  }
  return merged;
}

export async function appendLineItemsToEstimate({
  estimate,
  lineItems,
  entity = staffEntities.AllInOneEstimate,
  replaceFn = replaceEstimateFieldsIfUnchanged,
  label = "Imported line items",
} = {}) {
  if (!estimate?.id) throw new Error("The target estimate is not loaded.");
  if (!lineItems?.length) throw new Error("There are no line items to add.");
  const nextLineItems = mergeLineItems(estimate.line_items || [], lineItems);
  const nextFields = { line_items: nextLineItems };
  return replaceFn({
    entity,
    estimateId: estimate.id,
    expectedFields: expectedEstimateFields(estimate, nextFields),
    guardFields: { updated_date: estimate.updated_date },
    nextFields,
    label,
  });
}

// ---------------------------------------------------------------------------
// #453 — parts library CSV import → PartTemplate rows (the library entity)
// ---------------------------------------------------------------------------
//
// Columns: name|part_name (required), type|part_type, subtype|part_subtype,
//   category, unit|pricing_unit, unit_cost|cost, unit_price|price,
//   qty|quantity, supplier|vendor, sku|supplier_sku, description|notes.
// Each row becomes a `part`-type PartTemplate whose part_snapshot carries the
// BuilderPart-shaped fields, so it can be instantiated onto a Product from the
// Part Library. Idempotent: a deterministic idempotency_key per content hash
// means re-running the same CSV updates nothing and creates nothing twice —
// existing templates with the same key are reported as "existing".

export function mapPartsLibraryCsv(text) {
  const { records } = csvRecords(text);
  const templates = [];
  const dropped = [];
  records.forEach(({ row, data }) => {
    const name = pick(data, "name", "part_name", "item", "item_name", "part", "description");
    if (!name) { dropped.push({ row, reason: "No part name" }); return; }
    const unitCost = num(pick(data, "unit_cost", "cost", "cost_each"));
    const unitPrice = num(pick(data, "unit_price", "price", "sell", "sell_price", "customer_price"), unitCost);
    const qty = Math.max(0, num(pick(data, "qty", "quantity"), 1)) || 1;
    const snapshot = {
      part_name: name,
      client_label: pick(data, "label", "client_label") || name,
      part_type: pick(data, "type", "part_type") || "material",
      part_subtype: pick(data, "subtype", "part_subtype"),
      quantity: qty,
      unit: pick(data, "unit", "pricing_unit", "uom") || "each",
      frozen_unit_cost: unitCost,
      current_unit_cost: unitCost,
      frozen_extended_cost: unitCost * qty,
      current_extended_cost: unitCost * qty,
      frozen_unit_customer_price: unitPrice,
      current_unit_customer_price: unitPrice,
      frozen_extended_customer_price: unitPrice * qty,
      current_extended_customer_price: unitPrice * qty,
      inventory_item_name: pick(data, "inventory_item", "inventory_item_name"),
      inventory_item_id: pick(data, "inventory_item_id", "inventory_id"),
      supplier: pick(data, "supplier", "vendor"),
      supplier_sku: pick(data, "sku", "supplier_sku", "part_number"),
      description: pick(data, "notes", "note", "desc"),
      source_module_key: "parts_library_csv",
      is_active: true,
    };
    const meta = {
      template_name: name,
      product_group: "global",
      category: pick(data, "category", "group") || "imported",
      tags: pick(data, "tags") ? pick(data, "tags").split(/[;|]/).map((t) => t.trim()).filter(Boolean) : [],
      description: snapshot.description,
    };
    const templateData = {
      ...meta,
      template_family_key: "",
      template_version: 1,
      template_type: "part",
      source_module_key: "parts_library_csv",
      source_part_type: snapshot.part_type,
      source_part_subtype: snapshot.part_subtype,
      created_from_estimate_id: "",
      created_from_product_id: "",
      created_from_part_id: "",
      created_from_part_group_id: "",
      part_snapshot: snapshot,
      group_snapshot: {},
      parts_snapshot: [],
      part_count: 1,
      frozen_cost: snapshot.frozen_extended_cost,
      current_cost: snapshot.current_extended_cost,
      contains_detached_parts: false,
      search_text: [name, meta.category, snapshot.part_type, snapshot.supplier, snapshot.supplier_sku].filter(Boolean).join(" ").toLowerCase(),
      is_active: true,
    };
    templateData.template_family_key = `part-template-family:${builderMutationHash({ template_type: "part", source_id: `csv:${name}`, product_group: meta.product_group, template_name: nameKey(meta.template_name) })}`;
    templates.push({
      row,
      data: templateData,
      idempotencyKey: `parts_library_csv:${builderMutationHash({ name: nameKey(name), type: snapshot.part_type, unit_cost: unitCost, unit_price: unitPrice, qty, supplier: snapshot.supplier, sku: snapshot.supplier_sku, category: meta.category })}`,
    });
  });
  return { templates, dropped, totalRows: records.length };
}

export async function importPartsLibraryRows({
  templates = [],
  entity = staffEntities.PartTemplate,
  createFn = ensureIdempotentEntityCreate,
  delayMs = 0,
} = {}) {
  const result = { created: 0, existing: 0, errors: [] };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const t of templates) {
    try {
      // Pre-check so the summary honestly separates "created" from "already
      // imported" — the idempotent create alone can't distinguish the two.
      // A failed existence check is NOT "row absent": fail closed (record an
      // error, skip the row) rather than miscount a recovered row as created.
      const prior = typeof entity?.filter === "function"
        ? await entity.filter({ idempotency_key: t.idempotencyKey }).catch((e) => {
          result.errors.push({ row: t.row, name: t.data.template_name, message: `Existence check failed — row not imported: ${e?.message || "read error"}` });
          return null;
        })
        : [];
      if (prior === null) { if (delayMs > 0) await sleep(delayMs); continue; }
      if ((prior || []).some((row) => String(row?.idempotency_key || "") === t.idempotencyKey)) {
        result.existing += 1;
        continue;
      }
      await createFn({
        entity,
        keyField: "idempotency_key",
        key: t.idempotencyKey,
        data: { ...t.data, idempotency_key: t.idempotencyKey },
        label: `Part Library import “${t.data.template_name}”`,
      });
      result.created += 1;
    } catch (error) {
      result.errors.push({ row: t.row, name: t.data.template_name, message: error?.message || "Import failed." });
    }
    if (delayMs > 0) await sleep(delayMs);
  }
  return result;
}

// ---------------------------------------------------------------------------
// #467 — instantiate sections from a ProjectTemplate
// ---------------------------------------------------------------------------
//
// Module templates store a free-form project_data blob. The honest seam:
// a template exposes importable sections only when project_data carries a
// `line_items` or `sections` array of line-shaped objects. Templates without
// one fail closed with an honest message instead of fabricating sections.

export function templateImportableSections(template = {}) {
  const data = template?.project_data || {};
  const list = Array.isArray(data.line_items) ? data.line_items : Array.isArray(data.sections) ? data.sections : null;
  if (!list) return [];
  return list
    .map((item, index) => {
      const name = cleanStr(item?.client_product_name ?? item?.name ?? item?.project_name ?? item?.product_category ?? "");
      if (!name) return null;
      return {
        line_id: `template-${template.id || "t"}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        module_key: cleanStr(item?.module_key || template.module_key || "custom"),
        client_product_name: name,
        project_name: cleanStr(item?.project_name) || name,
        product_category: cleanStr(item?.product_category) || "template",
        customer_description: cleanStr(item?.customer_description ?? item?.description ?? ""),
        customer_quantity: Math.max(0, num(item?.customer_quantity ?? item?.quantity, 1)) || 1,
        total_snapshot: num(item?.total_snapshot ?? item?.unit_cost),
        customer_price_snapshot: num(item?.customer_price_snapshot ?? item?.unit_price ?? item?.total_snapshot),
        adjustment_percent: num(item?.adjustment_percent),
        include_in_customer: item?.include_in_customer !== false,
        imported_source: `project_template:${template.id || ""}`,
      };
    })
    .filter(Boolean);
}

export async function appendTemplateSectionsToEstimate({ estimate, template, ...rest } = {}) {
  const sections = templateImportableSections(template);
  if (!sections.length) {
    throw new Error(`Template "${template?.template_name || "Untitled"}" has no importable line-item sections. Only templates whose project data includes a line_items/sections list can be instantiated.`);
  }
  return appendLineItemsToEstimate({ estimate, lineItems: sections, label: `Template sections “${template?.template_name || ""}”`, ...rest });
}

// ---------------------------------------------------------------------------
// #464 — copy a Product's BOM (groups + parts) from another estimate
// ---------------------------------------------------------------------------
//
// Loads the source Product's Part Groups and Parts as snapshots and repacks
// them as addPartPackageToProduct payloads — that service assigns fresh
// part_key/group_key values, so a repeat copy of the same BOM is idempotent
// per call but produces a real second copy when run twice deliberately.

export function buildCopiedBomPackages({ groups = [], parts = [] } = {}) {
  const activeGroups = (groups || []).filter((g) => g?.is_active !== false);
  const activeParts = (parts || []).filter((p) => p?.is_active !== false);
  const grouped = new Map(activeGroups.map((g) => [g.id, []]));
  const loose = [];
  for (const part of activeParts) {
    if (part.part_group_id && grouped.has(part.part_group_id)) grouped.get(part.part_group_id).push(part);
    else loose.push(part);
  }
  const packages = activeGroups.map((group) => ({
    itemType: "part_group",
    itemName: group.client_label || group.group_name || "Part Group",
    payload: {
      group: { ...cloneSnapshot(group), snapshot_source_group_id: group.id },
      parts: (grouped.get(group.id) || []).sort((a, b) => num(a.sort_order) - num(b.sort_order)).map(cloneSnapshot),
    },
  }));
  for (const part of loose.sort((a, b) => num(a.sort_order) - num(b.sort_order))) {
    packages.push({ itemType: "part", itemName: part.client_label || part.part_name || "Part", payload: { part: cloneSnapshot(part) } });
  }
  return packages;
}

export async function copyProductBomToProduct({
  estimateId,
  sourceBuilderProductId,
  targetBuilderProductId,
  expectedEstimateUpdatedAt = "",
  addPackageFn = addPartPackageToProduct,
} = {}) {
  if (!estimateId || !sourceBuilderProductId || !targetBuilderProductId) {
    throw new Error("Source and target Products are required to copy a BOM.");
  }
  const [groups, parts] = await Promise.all([
    loadAllEntityRows({ entity: staffEntities.BuilderPartGroup, query: { builder_product_id: sourceBuilderProductId }, sort: "sort_order", label: "Source BOM part groups" }),
    loadAllEntityRows({ entity: staffEntities.BuilderPart, query: { builder_product_id: sourceBuilderProductId }, sort: "sort_order", label: "Source BOM parts" }),
  ]);
  const packages = buildCopiedBomPackages({ groups, parts });
  if (!packages.length) throw new Error("The source Product has no active Parts to copy.");
  const results = [];
  for (const pkg of packages) {
    results.push(await addPackageFn({
      estimateId,
      targetBuilderProductId,
      itemType: pkg.itemType,
      itemName: pkg.itemName,
      payload: pkg.payload,
      sourceType: "estimate_bom_copy",
      sourceId: sourceBuilderProductId,
      expectedEstimateUpdatedAt,
    }));
  }
  return { packages: packages.length, results };
}

// ---------------------------------------------------------------------------
// #451/#460 — full estimate JSON import orchestration
// ---------------------------------------------------------------------------

export async function importEstimateRecord({
  raw,
  format = "",
  sessionToken = "",
  customers = [],
  confirmFuzzyMatch = async () => false,
  createCustomer = false,
  ensureNewEstimateFn = ensureNewEstimate,
  ensureNewCustomerFn = ensureNewCustomer,
  creationKey = newEstimateCreationKey(),
  customerCreationKey = newCustomerCreationKey(),
} = {}) {
  if (!raw || typeof raw !== "object") throw new Error("No estimate payload was parsed.");

  // Native aio exports sanitize straight through; foreign shapes go through
  // the legacy mapper first — anything else fails with an honest
  // unsupported-shape error. A native-format estimate with no line_items key
  // still imports (with an empty list) — the mapper is only for foreign JSON.
  let payload;
  let legacyDropped = [];
  if (Array.isArray(raw.line_items) || format === "native" || format === "backup") {
    payload = sanitizeEstimateForImport(raw);
    if (!Array.isArray(payload.line_items)) payload.line_items = [];
  } else {
    const mapped = mapLegacyEstimateToAio(raw);
    payload = mapped.payload;
    legacyDropped = mapped.dropped;
  }

  // Customer resolution: exact → fuzzy (needs caller confirmation) → optional
  // create-if-missing → client_name only.
  const resolution = resolveImportCustomer({ name: payload.client_name, customers });
  if (resolution.status === "exact") {
    payload.customer_id = resolution.customer.id;
    payload.client_name = resolution.customer.company_name || payload.client_name;
  } else if (resolution.status === "fuzzy") {
    const ok = await confirmFuzzyMatch(resolution.customer, payload.client_name);
    if (ok) {
      payload.customer_id = resolution.customer.id;
      payload.client_name = resolution.customer.company_name || payload.client_name;
    }
  } else if (resolution.status === "ambiguous") {
    payload.customer_link_candidates = resolution.candidates.map((c) => ({ id: c.id, company_name: c.company_name }));
  }
  if (!payload.customer_id && createCustomer && payload.client_name) {
    const created = await ensureNewCustomerFn({
      creationKey: customerCreationKey,
      customer: { company_name: payload.client_name, contact_email: payload.contact_email || "", company_phone: payload.office_phone || "" },
      sessionToken,
    });
    if (created?.id) payload.customer_id = created.id;
  }

  const estimate = await ensureNewEstimateFn({ creationKey, estimate: payload, sessionToken });
  return { estimate, resolution: resolution.status, dropped: legacyDropped };
}