import { foundationEquipmentCatalogIssues } from "./foundationEquipmentBindings";
import { foundationWallCapCatalogIssues } from "./wallCapCalculator";
import { foundationWallCatalogIssues } from "./wallCalculator";
// CMP-A08: the catalog price basis lives on the normalization boundary —
// finite, nonnegative; a recorded 0 is a deliberate free price, absent or
// malformed is unpriced (never laundered to 0 or guessed).
import { inventoryNonnegativeNumber } from "@/components/masterInventory/inventoryNormalization";

// ─── Catalog lifecycle + price classification (O-009 / CMP-A09) ────────────
//
// The catalog rows the estimator sees arrive through a filtered load
// (`show_in_foundation: true` on FoundationInventory, `is_active: true` on
// LaborServiceInventory) — except labor-service supplier rows, which are
// merged client-side AFTER the query and can still carry
// `show_in_foundation: false`, and any row a caller passes unfiltered. A
// project reference can therefore resolve four ways, previously lumped:
//   • the row is present and current            → usable,
//   • the row is present but marked INACTIVE    → was picked before
//     deactivation; the picker hides it now (was reported as nothing),
//   • the row is present but marked DELETED     → soft-deleted tombstone
//     still in the loaded list,
//   • the row is ABSENT                         → deleted or filtered out;
//     we cannot tell which from this list, so the issue says both.
// Price basis classifies the same way: a recorded finite nonnegative price
// is "priced" (0 = deliberately free), anything else is "unpriced" — the
// ported `|| 0` fallbacks laundered unpriced into a silent free.

const INACTIVE_STATUS_VALUES = new Set([
  "inactive", "disabled", "archived", "discontinued", "retired", "deactivated",
]);
const DELETED_STATUS_VALUES = new Set(["deleted", "removed", "purged"]);

// Row lifecycle class: "deleted" tombstones win over "inactive" flags; a row
// carrying neither is "active". Schemaless flags from every catalog source
// are honored — FoundationInventory's picker flag (`show_in_foundation`),
// LaborServiceInventory's `is_active`, and generic `active`/`archived`/
// `status`/`deleted_at` markers an import or admin surface may write.
export function foundationCatalogRowAvailability(row) {
  if (!row || typeof row !== "object") return "deleted";
  const status = typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
  if (row.deleted === true || row.is_deleted === true || row.deleted_at != null
    || DELETED_STATUS_VALUES.has(status)) return "deleted";
  if (row.is_active === false || row.active === false
    || row.archived === true || row.is_archived === true || row.disabled === true
    || row.show_in_foundation === false || INACTIVE_STATUS_VALUES.has(status)) return "inactive";
  return "active";
}

// Consumed catalog price basis: "unpriced" (absent/malformed/negative — the
// boundary returns null), "free" (a recorded explicit 0), else "priced".
export function foundationCatalogPriceClass(value) {
  const number = inventoryNonnegativeNumber(value);
  if (number === null) return "unpriced";
  return number === 0 ? "free" : "priced";
}

// A custom override is "authored" exactly when the calculator consumes it —
// `value !== null && !== undefined` mirrors the calcItemCost `??` picks.
const authoredOverride = (value) => value !== undefined && value !== null;
// The item's `|| "#4"` / picker fallbacks treat every falsy value as
// unselected; mirror that (an authored blank string still defaults).
const authoredSelection = (value) => value !== undefined && value !== null && value !== "";

export function foundationItemCatalogIssues(item, inventory = [], index = 0) {
  const issues = [];
  const add = (field, id, code, message) => issues.push({
    kind: "foundation", index, componentId: item.component_id ?? null, field,
    inventoryId: id ?? null, code,
    message: `Foundation ${index + 1}: ${message}`,
  });
  const selected = id => id !== undefined && id !== null && id !== "";
  // Selected-id check: absent → unavailable (deleted or deactivated — the
  // loaded catalog can't tell them apart); found → type, then lifecycle,
  // then the consumed price basis. Deliberate free (recorded 0) never flags.
  const check = (field, types, label, { unassigned = null, priceBasis = null } = {}) => {
    const id = item[field];
    if (!selected(id)) {
      if (unassigned) add(field, null, "catalog_item_unassigned", unassigned);
      return;
    }
    const row = inventory.find(record => record.id === id);
    if (!row) {
      add(field, id, "catalog_item_unavailable",
        `${label} is unavailable — the catalog row may have been deleted or deactivated`);
      return;
    }
    if (!types.includes(row.material_type)) {
      add(field, id, "catalog_item_type_mismatch", `${label} is the wrong catalog type`);
      return;
    }
    const availability = foundationCatalogRowAvailability(row);
    if (availability !== "active") {
      add(field, id, availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
        availability === "deleted"
          ? `${label} is marked deleted in the catalog — pick a replacement`
          : `${label} is inactive in the catalog — reactivate it or pick a replacement`);
      return;
    }
    const basis = priceBasis?.(row);
    if (basis && foundationCatalogPriceClass(row[basis]) === "unpriced") {
      add(field, id, "catalog_item_unpriced",
        `${label} has no recorded ${basis} — a missing price is not a free material`);
    }
  };
  // Concrete is consumed by every item: an unassigned selection rides the
  // first supplier's delivery catalog or prices material at $0, never an
  // authored free — flag it like the sibling pickers already do.
  check("selected_concrete_id", ["bagged_concrete", "concrete_service"], "the selected concrete catalog material", {
    unassigned: "select a concrete catalog material — unassigned concrete rides the first supplier's delivery mix or prices at $0",
    // Item-level bag pricing consumes cost_per_unit; a service row's mixes
    // and fees are the delivery scan's own checks, never duplicated here.
    priceBasis: row => (row.material_type === "bagged_concrete" && !authoredOverride(item.custom_concrete_cost_per_cy)
      ? "cost_per_unit" : null),
  });
  if (item.include_forming) check("selected_forming_id", ["forming_material"], "the selected forming catalog material", {
    // An authored custom rate replaces the catalog basis entirely; the row
    // is then consumed for nothing and unassigned/unpriced stay silent.
    unassigned: !authoredOverride(item.custom_forming_rate)
      ? "select a forming catalog material or record a custom forming rate"
      : null,
    priceBasis: () => (!authoredOverride(item.custom_forming_rate) ? "cost_per_unit" : null),
  });
  // Versioned items price steel through their explicit reinforcement_material
  // basis — a catalog basis needs exactly one current rebar-typed row; the
  // legacy rebar_size lookup below does not apply to them.
  if (item.reinforcement_calculation_version != null && item.reinforcement_calculation_version !== 1) {
    if (item.reinforcement_calculation_version === 2 && item.include_rebar && item.reinforcement_material?.kind === "catalog") {
      const id = item.reinforcement_material.inventory_id;
      const matches = selected(id) ? inventory.filter(row => row.id === id) : [];
      if (matches.length !== 1 || matches[0].material_type !== "rebar") {
        add("reinforcement_material.inventory_id", id,
          !selected(id) ? "catalog_item_unassigned" : matches.length > 1 ? "catalog_item_ambiguous" : "catalog_item_unavailable",
          !selected(id) ? "select a reinforcement catalog material"
            : matches.length > 1 ? "the selected reinforcement catalog ID is ambiguous; refresh the catalog"
            : "the selected reinforcement catalog material is unavailable — it may have been deleted or deactivated");
      } else {
        const availability = foundationCatalogRowAvailability(matches[0]);
        if (availability !== "active") {
          add("reinforcement_material.inventory_id", id,
            availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
            availability === "deleted"
              ? "the selected reinforcement catalog material is marked deleted — pick a replacement"
              : "the selected reinforcement catalog material is inactive — reactivate it or pick a replacement");
        }
      }
    }
    return issues;
  }
  const manualRebar = hasFoundationCostSnapshot(item.custom_rebar_cost_per_ft) && item.custom_rebar_cost_per_ft >= 0;
  if (item.include_rebar && !manualRebar) {
    const field = item.foundation_type === "spread_foot" ? "rebar_size" : "pillar_rebar_size";
    const authoredSize = field === "rebar_size" ? item.rebar_size : item.pillar_rebar_size;
    // A pillar with no authored size silently consumes the catalog "#4"
    // default (the ported `pillar_rebar_size || '#4'` pick) — flag the
    // unassigned default whether or not a #4 row exists to consume.
    const defaulted = field === "pillar_rebar_size" && !authoredSize;
    const size = defaulted ? "#4" : authoredSize;
    const row = size ? inventory.find(record => record.material_type === "rebar" && record.rebar_size === size) : null;
    if (defaulted) {
      const rowState = row ? foundationCatalogRowAvailability(row) : null;
      add(field, row?.id ?? null, "catalog_item_unassigned_default", !row
        ? `no rebar size is selected and the catalog has no ${size} rebar default to consume — select a size`
        : rowState !== "active"
          ? `no rebar size is selected — the catalog ${size} default resolves to ${rowState === "inactive" ? "an inactive" : "a deleted"} row; pick a size explicitly`
          : `no rebar size is selected — the catalog ${size} default is consumed; pick a size explicitly`);
    } else if (!row) {
      add(field, null, size ? "catalog_item_unavailable" : "catalog_item_unassigned",
        size ? `rebar catalog size ${size} is unavailable — it may have been deleted or deactivated`
          : "select a rebar catalog size");
    } else {
      const availability = foundationCatalogRowAvailability(row);
      if (availability !== "active") {
        add(field, row.id, availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
          availability === "deleted"
            ? `rebar catalog size ${size} is marked deleted — pick another size`
            : `rebar catalog size ${size} is inactive — reactivate it or pick another size`);
      } else if (!authoredOverride(item.custom_rebar_cost_per_ft)
        && foundationCatalogPriceClass(row.cost_per_unit) === "unpriced") {
        add(field, row.id, "catalog_item_unpriced",
          `rebar catalog size ${size} has no recorded cost_per_unit — a missing price is not a free material`);
      }
    }
  }
  return issues;
}

// Check catalog availability and the explicit wall-cap full-stock price basis.
export function foundationAssemblyCatalogIssues(project, inventory = []) {
  const issues = [];
  const check = (row, index, kind, field, label) => {
    const id = row[field];
    const assigned = (typeof id === "string" && id.trim() !== "")
      || (typeof id === "number" && Number.isFinite(id));
    if (!assigned) {
      issues.push({
        kind,
        index,
        componentId: row.component_id ?? row.id ?? null,
        field,
        inventoryId: null,
        code: "catalog_item_unassigned",
        message: `${label} ${index + 1}: select a catalog material.`,
      });
      return;
    }
    const match = inventory.find((record) => record.id === id);
    if (!match) {
      issues.push({
        kind,
        index,
        componentId: row.component_id ?? row.id ?? null,
        field,
        inventoryId: id,
        code: "catalog_item_unavailable",
        message: `${label} ${index + 1}: selected catalog material is unavailable — it may have been deleted or deactivated.`,
      });
      return;
    }
    const availability = foundationCatalogRowAvailability(match);
    if (availability !== "active") {
      issues.push({
        kind,
        index,
        componentId: row.component_id ?? row.id ?? null,
        field,
        inventoryId: id,
        code: availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
        message: availability === "deleted"
          ? `${label} ${index + 1}: selected catalog material is marked deleted — pick a replacement.`
          : `${label} ${index + 1}: selected catalog material is inactive — reactivate it or pick a replacement.`,
      });
    }
  };
  for (const [index, pole] of (project?.poles || []).entries()) {
    check(pole, index, "pole", "pole_id", "Pole");
  }
  // Unassigned-default (CMP-A09): when the project names no concrete mix the
  // delivery scan silently consumes the first ready-mix supplier's catalog
  // '4000_ae' mix. Flag the unassigned default whenever a service supplier is
  // actually selected — the mix consumption itself stays the delivery scan's.
  if (!project?.project_concrete_type) {
    const firstServiceItem = (project?.items || []).find((item) => {
      const row = inventory.find((record) => record?.id === item?.selected_concrete_id);
      return row?.material_type === "concrete_service";
    });
    if (firstServiceItem) {
      issues.push({
        kind: "concrete_delivery",
        index: null,
        componentId: null,
        field: "project_concrete_type",
        inventoryId: firstServiceItem.selected_concrete_id ?? null,
        code: "catalog_item_unassigned_default",
        message: "Concrete delivery: no concrete mix is selected — the supplier's catalog default mix is consumed when concrete ships. Pick a mix explicitly.",
      });
    }
  }
  return [
    ...issues,
    ...foundationWallCatalogIssues(project?.walls || [], inventory),
    ...foundationWallCapCatalogIssues(project?.wall_caps || [], inventory),
    ...(project?.items || []).flatMap((item, index) => foundationItemCatalogIssues(item, inventory, index)),
    ...foundationEquipmentCatalogIssues(project?.selected_equipment || [], inventory),
  ];
}

// ─── Advisory classification audit (O-009 / CMP-A09) ────────────────────────
//
// Non-blocking mirror of the item scan: every catalog basis the item can
// consume, classified so downstream surfaces keep deliberate free ($0),
// unpriced (missing), implicit defaults, and inactive/deleted rows distinct
// instead of lumping them under "unavailable". Nothing here gates pricing —
// the blocking flags live in foundationItemCatalogIssues above.
export function foundationItemCatalogAudit(item, inventory = [], index = 0) {
  const record = item ?? {};
  const audit = [];
  const emit = (field, inventoryId, selection, availability, priceClass) => audit.push({
    kind: "foundation", index, componentId: record.component_id ?? null,
    field, inventoryId: inventoryId ?? null, selection, availability, priceClass,
  });
  const auditId = (field, { overrideAuthored = false, priceBasis = null, unconsumedClass = "unchecked" } = {}) => {
    const id = record[field];
    if (!authoredSelection(id)) {
      emit(field, null, "unassigned", "unassigned", overrideAuthored ? "override" : unconsumedClass);
      return;
    }
    const row = inventory.find((candidate) => candidate.id === id);
    if (!row) {
      emit(field, id, "authored", "missing", overrideAuthored ? "override" : unconsumedClass);
      return;
    }
    const availability = foundationCatalogRowAvailability(row);
    const basis = priceBasis?.(row);
    emit(field, id, "authored", availability,
      overrideAuthored ? "override"
        : basis ? foundationCatalogPriceClass(row[basis]) : unconsumedClass);
  };
  auditId("selected_concrete_id", {
    overrideAuthored: authoredOverride(record.custom_concrete_cost_per_cy),
    priceBasis: (row) => (row.material_type === "bagged_concrete" ? "cost_per_unit" : null),
    unconsumedClass: "deferred", // ready-mix prices ship through the delivery scan's mix/admix/fee checks
  });
  if (record.include_forming) {
    auditId("selected_forming_id", {
      overrideAuthored: authoredOverride(record.custom_forming_rate),
      priceBasis: () => "cost_per_unit",
      unconsumedClass: "unconsumed", // a missing/unassigned forming row consumes no catalog basis
    });
  }
  if (record.reinforcement_calculation_version != null && record.reinforcement_calculation_version !== 1) {
    if (record.reinforcement_calculation_version === 2 && record.include_rebar
      && record.reinforcement_material?.kind === "catalog") {
      auditId("reinforcement_material.inventory_id", { unconsumedClass: "deferred" });
    }
    return audit;
  }
  const manualRebar = hasFoundationCostSnapshot(record.custom_rebar_cost_per_ft) && record.custom_rebar_cost_per_ft >= 0;
  if (record.include_rebar && !manualRebar) {
    const field = record.foundation_type === "spread_foot" ? "rebar_size" : "pillar_rebar_size";
    const authoredSize = field === "rebar_size" ? record.rebar_size : record.pillar_rebar_size;
    const defaulted = field === "pillar_rebar_size" && !authoredSize;
    const size = defaulted ? "#4" : authoredSize;
    if (!size) {
      emit(field, null, "unassigned", "unassigned",
        authoredOverride(record.custom_rebar_cost_per_ft) ? "override" : "unconsumed");
    } else {
      const row = inventory.find((candidate) => candidate.material_type === "rebar" && candidate.rebar_size === size);
      emit(field, row?.id ?? null, defaulted ? "defaulted" : "authored",
        row ? foundationCatalogRowAvailability(row) : "missing",
        authoredOverride(record.custom_rebar_cost_per_ft) ? "override"
          : row ? foundationCatalogPriceClass(row.cost_per_unit) : "unconsumed");
    }
  }
  return audit;
}

// A missing snapshot is not evidence of a free material.
export function hasFoundationCostSnapshot(value) {
  return typeof value === "number" && Number.isFinite(value);
}