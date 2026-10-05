import { normalizeCustomerText } from "./smartsheetCustomerResolutionModel.js";
import { serializeBase44WorkNotes } from "./smartsheetTranslationModel.js";
import { resolveSmartsheetTaskAssignee } from "./smartsheetTaskAssigneeModel.js";

// Observation-only. This module has no Base44 client, Smartsheet transport, or write path.
const ORDER_TYPES = Object.freeze({
  substrate: "Substrate",
  vinyl: "Vinyl",
  supplies: "Supplies",
  other: "Other",
});
const TERMINAL_TASK_PATTERN = /^(lost\b|completed sales?\b|closed\b)/;

function text(value) {
  return String(value ?? "").trim();
}

function problem(code, label, detail = "") {
  return { code, label, detail };
}

function dateOnly(value) {
  const raw = text(value);
  if (!raw) return "";
  let year;
  let month;
  let day;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(raw);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (iso) [, year, month, day] = iso;
  else if (us) [, month, day, year] = us;
  else return null;
  const valueDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const result = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return valueDate.toISOString().slice(0, 10) === result ? result : null;
}

function mappedValue(value, field) {
  if (value === null || value === undefined || text(value) === "") return { state: "blank", value: undefined };
  if (field.transform === "notes_process") {
    return { state: "translation_required", value: undefined };
  }
  if (field.transform === "money") {
    const raw = typeof value === "number" ? value : Number(text(value).replace(/[$,\s]/g, ""));
    return Number.isFinite(raw)
      ? { state: "mapped", value: raw }
      : { state: "invalid", reason: "Expected a valid currency amount." };
  }
  if (field.transform === "date") {
    const parsed = dateOnly(value);
    return parsed
      ? { state: "mapped", value: parsed }
      : { state: "invalid", reason: "Expected a real calendar date (YYYY-MM-DD or MM/DD/YYYY)." };
  }
  if (field.field === "request_type") {
    const translated = ORDER_TYPES[text(value).toLowerCase()];
    return translated
      ? { state: "mapped", value: translated }
      : { state: "invalid", reason: "Expected Substrate, Vinyl, Supplies, or Other." };
  }
  return { state: "mapped", value: text(value) };
}

function customerCatalog(customers) {
  const byId = new Map();
  const byName = new Map();
  for (const customer of customers || []) {
    if (!customer?.id || !customer?.company_name) continue;
    byId.set(String(customer.id), customer);
    for (const name of [customer.company_name, ...(customer.legacy_client_names || [])]) {
      const key = normalizeCustomerText(name);
      if (!key) continue;
      const matches = byName.get(key) || new Set();
      matches.add(String(customer.id));
      byName.set(key, matches);
    }
  }
  return { byId, byName };
}

function resolveProposedCustomer(readinessCustomer, sourceName, dataset, sheetId, catalog, blockers) {
  if (!readinessCustomer?.ready) return null;
  if (readinessCustomer.state === "approved_new_customer") {
    const name = text(readinessCustomer.proposed_company_name);
    const normalized = normalizeCustomerText(name);
    if (!normalized) {
      blockers.push(problem("new_customer_name_missing", "Approved Customer has no name"));
      return null;
    }
    const duplicateIds = [...(catalog.byName.get(normalized) || [])];
    if (duplicateIds.length) {
      blockers.push(problem(
        "new_customer_matches_existing",
        "Approved new Customer now matches an existing Customer or alias",
        `Re-review this name against existing Customer ID(s): ${duplicateIds.join(", ")}.`,
      ));
    }
    const key = `${dataset}|${sheetId}|${normalized}`;
    return {
      kind: "new_customer",
      key,
      company_name: name,
      customer_payload: { company_name: name, customer_status: "prospect" },
      // All rows with this key share ONE proposed Customer, not one Customer per row.
      relationship: { field: "customer_id", planned_customer_key: key },
      alias_plan: null,
      source_name: sourceName,
      normalized_name: normalized,
    };
  }

  const id = text(readinessCustomer.customer_id);
  const record = catalog.byId.get(id);
  if (!id || !record) {
    blockers.push(problem("selected_customer_missing", "Chosen existing Customer is missing", "Refresh the Customer catalog and re-review this selection."));
    return null;
  }
  const canonical = text(record.company_name);
  if (!canonical) {
    blockers.push(problem("selected_customer_invalid", "Chosen Customer has no company name"));
    return null;
  }
  const sourceNormalized = normalizeCustomerText(sourceName);
  const existingAliases = (record.legacy_client_names || []).map(normalizeCustomerText);
  const aliasPlan = readinessCustomer.remember_alias
    && sourceNormalized !== normalizeCustomerText(canonical)
    && !existingAliases.includes(sourceNormalized)
    ? {
      action: "append_existing_customer_alias",
      field: "legacy_client_names",
      customer_id: id,
      alias: text(sourceName),
      existing_values: [...(record.legacy_client_names || [])],
    } : null;
  if (aliasPlan) {
    const otherIds = [...(catalog.byName.get(sourceNormalized) || [])].filter((otherId) => otherId !== id);
    if (otherIds.length) {
      blockers.push(problem("alias_conflict", "Planned alias belongs to another Customer", `Existing Customer ID(s): ${otherIds.join(", ")}.`));
    }
  }
  return {
    kind: "existing_customer",
    customer_id: id,
    company_name: canonical,
    source_name: sourceName,
    normalized_name: sourceNormalized,
    relationship: { field: "customer_id", existing_customer_id: id },
    customer_payload: null,
    alias_plan: aliasPlan,
  };
}

export function buildSmartsheetControlledCreationProposals({
  rows = [],
  creationReadiness = null,
  dataset = "",
  sheetId = "",
  customers = [],
  base44Records = [],
  blueprint = [],
  columnBindings = {},
  noteTranslationsByRowId = {},
  authorizedUsers = [],
  customAssigneeNames = [],
  today = new Date().toISOString().slice(0, 10),
} = {}) {
  if (!["sales", "orders"].includes(dataset)
    || creationReadiness?.state !== "ready"
    || !sheetId) {
    return {
      state: "baseline_required",
      creation_enabled: false,
      automatic_creates: 0,
      rows: [],
      summary: { post_baseline_rows: 0, dependent_record_lines: 0, data_ready: 0, proposal_ready: 0, blocked: 0, new_customer_groups: 0 },
    };
  }

  const byRowId = new Map((rows || []).map((row) => [String(row.row_id), row]));
  const catalog = customerCatalog(customers);
  const fingerprint = (record) => dataset === "sales"
    ? (text(record?.est_inv_at)
      ? `est:${text(record?.est_inv_at).toLowerCase()}`
      : text(Array.isArray(record?.work_notes) ? serializeBase44WorkNotes(record.work_notes) : record?.work_notes)
        ? `notes:${text(Array.isArray(record?.work_notes) ? serializeBase44WorkNotes(record.work_notes) : record?.work_notes).toLowerCase().replace(/\s+/g, " ")}`
        : text(record?.title)
          ? `title:${text(record?.title).toLowerCase().replace(/\s+/g, " ")}`
          : "")
    : [record?.request_type, record?.description].map((value) =>
      text(value).toLowerCase().replace(/\s+/g, " ")).join("|");
  const existingFingerprints = new Map();
  for (const record of base44Records || []) {
    if (!record?.id || record.deleted) continue;
    const subject = fingerprint(record);
    if (!subject) continue;
    const customerKey = text(record.customer_id)
      ? `id:${record.customer_id}`
      : `name:${normalizeCustomerText(dataset === "sales" ? record.client_name : record.customer_name)}`;
    if (customerKey === "name:") continue;
    const key = `${customerKey}|${subject}`;
    const matches = existingFingerprints.get(key) || [];
    matches.push(String(record.id));
    existingFingerprints.set(key, matches);
  }
  const mappedFields = (blueprint || []).filter(
    (field) => field.direction !== "base44_only" && columnBindings?.[field.field]?.column_id,
  );
  const proposed = (creationReadiness.rows || []).map((readiness) => {
    const source = byRowId.get(String(readiness.row_id));
    const blockers = [...(readiness.blockers || [])];
    const originalValues = { ...(source?.values || {}) };
    const sourceCustomerName = text(dataset === "sales" ? originalValues.client_name : originalValues.customer_name);
    // Show an approved Customer bundle even when a dependent record has missing fields.
    // Existing-record matches and ambiguous Base44 candidates never propose a new link.
    const identity = source?.status === "new_record" && readiness.customer?.ready
      ? resolveProposedCustomer(readiness.customer, sourceCustomerName, dataset, String(sheetId), catalog, blockers)
      : null;

    const payload = dataset === "sales"
      ? { current_stage: "sales", sales_status: "lead", in_pipeline: true }
      : { status: "pending" };
    const fieldAudit = [];

    for (const field of mappedFields) {
      if (field.field === "current_task_assigned_to" && text(originalValues[field.field])) {
        const resolution = resolveSmartsheetTaskAssignee(originalValues[field.field], authorizedUsers, customAssigneeNames);
        const translatedName = text(resolution.name);
        fieldAudit.push({
          field: field.field,
          label: field.label,
          source_value: originalValues[field.field] ?? null,
          proposed_value: translatedName || null,
          state: resolution.custom ? "confirmed_custom_name" : translatedName ? `translated_user_${resolution.state}` : `user_${resolution.state}`,
        });
        if (translatedName) {
          payload.current_task_assigned_to = translatedName;
        } else {
          blockers.push(problem(
            "task_owner_translation_required",
            "Task owner needs user resolution or custom-name confirmation",
            resolution.state === "ambiguous"
              ? `Smartsheet owner “${text(originalValues[field.field])}” matches multiple Base44 users.`
              : `Smartsheet owner “${text(originalValues[field.field])}” does not resolve to an active Base44 user.`,
          ));
        }
        continue;
      }
      const mapped = mappedValue(originalValues[field.field], field);
      fieldAudit.push({
        field: field.field,
        label: field.label,
        source_value: originalValues[field.field] ?? null,
        proposed_value: mapped.state === "mapped" ? mapped.value : null,
        state: mapped.state,
      });
      if (mapped.state === "invalid") {
        blockers.push(problem("invalid_field", `Invalid ${field.label || field.field}`, mapped.reason));
      } else if (mapped.state === "translation_required") {
        const translatedNotes = noteTranslationsByRowId?.[String(readiness.row_id)];
        if (Array.isArray(translatedNotes)) {
          payload.work_notes = translatedNotes;
          fieldAudit[fieldAudit.length - 1].proposed_value = translatedNotes;
          fieldAudit[fieldAudit.length - 1].state = "ai_translated";
        } else {
          blockers.push(problem(
            "notes_ai_translation_required",
            "Smartsheet Notes need AI translation",
            "Split the combined Smartsheet Notes into reviewed Base44 work_notes before any future record creation.",
          ));
        }
      } else if (mapped.state === "mapped" && field.transform !== "customer_resolution") {
        payload[field.field] = mapped.value;
      }
    }

    if (identity) {
      const customerField = dataset === "sales" ? "client_name" : "customer_name";
      payload[customerField] = identity.company_name;
      if (identity.kind === "existing_customer") payload.customer_id = identity.customer_id;
      const customerAudit = fieldAudit.find((field) => field.field === customerField);
      if (customerAudit) customerAudit.proposed_value = identity.company_name;
    }

    if (dataset === "sales" && !text(payload.title)) {
      const customer = text(payload.client_name || sourceCustomerName) || "Smartsheet Sales";
      const estimateNumber = text(originalValues.est_inv_at);
      const rowLabel = Number(readiness.row_number || 0) > 0
        ? `Row ${Number(readiness.row_number)}`
        : `Row ${String(readiness.row_id || "").slice(-8) || "New"}`;
      payload.title = estimateNumber
        ? `${customer} — ${estimateNumber}`
        : `${customer} — ${rowLabel}`;
      fieldAudit.push({
        field: "title",
        label: "Internal Work Order Title",
        source_value: null,
        proposed_value: payload.title,
        state: "generated_internal",
      });
    }

    // Recheck the actual payload independently of the earlier readiness gate.
    const required = dataset === "sales"
      ? ["client_name", "title"]
      : ["customer_name", "request_type", "description"];
    for (const field of required) {
      if (!text(payload[field])) {
        blockers.push(problem("proposed_required_field_missing", `Proposed ${field} is missing`, "A required value must be present in the actual proposed record."));
      }
    }

    // A post-baseline terminal task is not evidence of an authoritative modern outcome.
    if (dataset === "sales") {
      const task = text(originalValues.current_task_description).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (TERMINAL_TASK_PATTERN.test(task)) {
        blockers.push(problem("terminal_task_review", "Terminal task text needs manual review", "Do not turn legacy-like task text into a modern Lead, Won, or Lost outcome."));
      }
      if (payload.date_estimate_sent && payload.date_estimate_sent > today) {
        blockers.push(problem("future_estimate_sent", "Estimate Sent date is in the future", "Correct or verify the source date before a later creation."));
      }
    }

    if (source?.row_id && source?.status === "new_record") {
      payload.smartsheet_sheet_id = String(sheetId);
      payload.smartsheet_row_id = String(source.row_id);
    }

    if (identity?.kind === "new_customer"
      && ["ambiguous", "strong_review", "close_review"].includes(source?.customer_resolution?.outcome)
      && (source?.customer_resolution?.candidates || []).length > 0) {
      blockers.push(problem(
        "similar_customer_risk",
        "Approved new Customer still has similar existing candidates",
        "Review the suggested existing Customers again before any future creation.",
      ));
    }
    if (identity?.kind === "existing_customer" && source?.status === "new_record") {
      const subject = fingerprint(originalValues) || fingerprint(payload);
      const keys = [
        `id:${identity.customer_id}|${subject}`,
        `name:${normalizeCustomerText(identity.company_name)}|${subject}`,
        `name:${normalizeCustomerText(identity.source_name)}|${subject}`,
      ];
      const existingIds = [...new Set(keys.flatMap((key) => existingFingerprints.get(key) || []))];
      if (existingIds.length) {
        blockers.push(problem(
          "possible_duplicate_base44_record",
          "Possible duplicate existing Base44 record",
          `Same resolved Customer and description in existing record ID(s): ${existingIds.slice(0, 5).join(", ")}. Review and link instead of creating a duplicate.`,
        ));
      }
    }
    if (readiness.ready_for_controlled_create_review && !identity) {
      blockers.push(problem("customer_relationship_missing", "No safe Customer relationship"));
    }

    return {
      // Permanent invariant: one Smartsheet source row remains one dependent
      // WorkOrder/Order proposal line. Customer grouping may be shared, but
      // project/order lines are never collapsed by Customer name.
      source_line_key: `${String(sheetId)}|${String(readiness.row_id || "")}`,
      row_id: readiness.row_id,
      row_number: readiness.row_number,
      label: readiness.label,
      source_values: originalValues,
      source_status: source?.status || "unknown",
      data_ready: Boolean(readiness.ready_for_controlled_create_review),
      proposal_ready: Boolean(readiness.ready_for_controlled_create_review && identity && blockers.length === 0),
      blockers,
      entity: dataset === "sales" ? "WorkOrder" : "Order",
      customer: identity,
      fields: fieldAudit,
      // This describes a possible future create, never an API request.
      proposed_payload: payload,
      relationships: {
        customer: identity?.relationship || null,
        ...(dataset === "orders"
          ? { work_order: { field: "work_order_id", action: "unlinked_no_authoritative_workorder_match" } }
          : { estimate: { field: "estimate_id", action: "unlinked_no_authoritative_estimate_match" } }),
      },
    };
  });

  // Flag same-customer/same-work duplicates within this preview, including aliases
  // that resolve to the same existing Customer. This is review-only: every
  // permanent Smartsheet row stays in proposed[] as its own line; never merge,
  // drop, or replace rows just because they share one Customer.
  const fingerprints = new Map();
  for (const row of proposed) {
    if (!row.data_ready || !row.customer) continue;
    const customerKey = row.customer.kind === "existing_customer"
      ? `existing:${row.customer.customer_id}`
      : `new:${row.customer.key}`;
    const subject = dataset === "sales"
      ? (fingerprint(row.source_values) || fingerprint(row.proposed_payload))
      : `${text(row.proposed_payload.request_type).toLowerCase()}|${text(row.proposed_payload.description).toLowerCase()}`;
    if (!subject) continue;
    const key = `${customerKey}|${subject}`;
    const matches = fingerprints.get(key) || [];
    matches.push(row);
    fingerprints.set(key, matches);
  }
  for (const matches of fingerprints.values()) {
    if (matches.length < 2) continue;
    const rowIds = matches.map((item) => item.row_id);
    for (const row of matches) {
      row.blockers.push(problem(
        "possible_duplicate_new_rows",
        "Possible duplicate post-baseline records",
        `Same Customer and work description in Smartsheet row IDs: ${rowIds.join(", ")}. Review before enabling creation.`,
      ));
      row.proposal_ready = false;
    }
  }

  const summary = {
    post_baseline_rows: proposed.length,
    dependent_record_lines: proposed.length,
    data_ready: proposed.filter((item) => item.data_ready).length,
    proposal_ready: proposed.filter((item) => item.proposal_ready).length,
    blocked: proposed.filter((item) => !item.proposal_ready).length,
    new_customer_groups: new Set(proposed
      .filter((item) => item.proposal_ready && item.customer?.kind === "new_customer")
      .map((item) => item.customer.key)).size,
  };

  return {
    state: "ready",
    dataset,
    sheet_id: String(sheetId),
    creation_enabled: false,
    automatic_creates: 0,
    rows: proposed,
    summary,
  };
}

// One conflict per normalized name avoids a cartesian explosion when many rows share a Customer.
export function findSmartsheetCrossSheetCustomerConflicts(salesProposals, orderProposals) {
  if (salesProposals?.state !== "ready" || orderProposals?.state !== "ready") return [];
  const byName = (proposal) => {
    const groups = new Map();
    for (const row of proposal.rows || []) {
      if (!row.data_ready || !row.customer?.normalized_name) continue;
      const name = row.customer.normalized_name;
      const group = groups.get(name) || { rows: [], has_new: false };
      group.rows.push(row);
      group.has_new ||= row.customer.kind === "new_customer";
      groups.set(name, group);
    }
    return groups;
  };
  const sales = byName(salesProposals);
  const orders = byName(orderProposals);
  const conflicts = [];
  for (const [name, left] of sales) {
    const right = orders.get(name);
    if (!right || (!left.has_new && !right.has_new)) continue;
    conflicts.push({
      normalized_name: name,
      customer_name: left.rows[0].customer.source_name,
      sales_row_ids: left.rows.map((row) => row.row_id),
      order_row_ids: right.rows.map((row) => row.row_id),
      reason: "A new Customer is proposed on one sheet while the same normalized name appears on the other. Reconcile both review decisions before future creation.",
    });
  }
  return conflicts;
}

export function blockSmartsheetCrossSheetCustomerConflicts(salesProposals, orderProposals) {
  const conflicts = findSmartsheetCrossSheetCustomerConflicts(salesProposals, orderProposals);
  const blockedSales = new Map();
  const blockedOrders = new Map();
  for (const conflict of conflicts) {
    for (const rowId of conflict.sales_row_ids) blockedSales.set(rowId, conflict);
    for (const rowId of conflict.order_row_ids) blockedOrders.set(rowId, conflict);
  }

  const apply = (proposal, blocked) => {
    if (proposal?.state !== "ready") return proposal;
    const rows = proposal.rows.map((row) => {
      const conflict = blocked.get(row.row_id);
      if (!conflict) return row;
      return {
        ...row,
        proposal_ready: false,
        blockers: [...row.blockers, problem("cross_sheet_customer_collision", "Cross-sheet Customer collision", conflict.reason)],
      };
    });
    return {
      ...proposal,
      rows,
      summary: {
        ...proposal.summary,
        proposal_ready: rows.filter((row) => row.proposal_ready).length,
        blocked: rows.filter((row) => !row.proposal_ready).length,
        new_customer_groups: new Set(rows
          .filter((row) => row.proposal_ready && row.customer?.kind === "new_customer")
          .map((row) => row.customer.key)).size,
      },
    };
  };
  return {
    sales: apply(salesProposals, blockedSales),
    orders: apply(orderProposals, blockedOrders),
    conflicts,
  };
}