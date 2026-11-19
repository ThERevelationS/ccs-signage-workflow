// Advisory construction checks for the Concrete | Masonry | Poles estimator
// (CMP-B16 / O-030).
//
// These surface authored assumptions and incompatible choices so an
// estimator can verify them — they are NOT engineering review and they never
// block pricing or save. calcProject returns them on the separate
// `constructionWarnings` channel, which the page renders as a non-blocking
// diagnostics list (the same surface assembly placement notices use); they
// are never folded into inputIssues/catalogIssues, so they cannot trip
// pricingBlocked/inputBlocked.
//
// Every message reports what the ported priced model already assumes — the
// 125% spoil factor, labor-only excavation, straight 16-ft forming stock,
// the 4000-AE mix fallback — or a contradiction between two authored
// choices the supplier catalog itself documents (e.g. calcium chloride vs.
// rebar). No check invents a code minimum, a required practice, or a
// threshold the priced model does not already contain — each ends in
// "verify", never a pass/fail engineering claim.
//
// Warning records mirror the existing issue shape ({kind, index,
// componentId, field, code, message}) plus `severity: "advisory"` so panels
// and tests can distinguish them from blocking issues.

import { getConcreteAdmixtures } from "./legacyFoundationCalc";

const METHOD_LABELS = {
  hand_dig: "hand dig",
  equipment_excavation: "equipment",
};

const blank = (v) => v === undefined || v === null || v === "";

// Mirrors calcItem's effective-method merge: an item without its own method
// inherits the project default, and the ported calcItemCost prices a missing
// method on the hand-dig branch (`item.excavation_method === 'hand_dig' ||
// !item.excavation_method`).
const effectiveMethod = (item, project) =>
  blank(item?.excavation_method) ? (blank(project?.excavation_method) ? null : project.excavation_method) : item.excavation_method;

const pricedMethod = (item, project) => effectiveMethod(item, project) || "hand_dig";

const list = (indexes) => indexes.map((i) => i + 1).join(", ");

const round2 = (n) => Math.round(n * 100) / 100;

// Ready-mix consumers mirror calcConcreteDelivery's filter: an item with no
// selected concrete, or one resolving to a concrete_service supplier, prices
// into delivered truck loads. Bagged items never consume mixes/admixtures.
const readyMixItem = (item, inventory) => {
  const inv = inventory.find((i) => i.id === item?.selected_concrete_id);
  return !inv || inv.material_type === "concrete_service";
};

// context: { items, deliveryCheck } — `items` is the calcProject-priced item
// array (carries excavation_volume_cy), `deliveryCheck` the
// calcConcreteDelivery result or null when held items gate the delivery scan.
export function foundationConstructionWarnings(project, inventory = [], context = {}) {
  const warnings = [];
  const sourceItems = Array.isArray(project?.items) ? project.items : [];
  const pricedItems = Array.isArray(context.items) ? context.items : [];
  const deliveryCheck = context.deliveryCheck ?? null;
  const push = (kind, index, componentId, field, code, message) =>
    warnings.push({
      kind, index, componentId, field, inventoryId: null,
      code, severity: "advisory", message,
    });

  // ---- Excavation / soil spoil ------------------------------------------
  // The ported model prices spoil at a fixed 125% of concrete volume and
  // prices excavation as labor hours only — haul-off, disposal, and backfill
  // are never priced. One warning per method actually used so the message
  // can name the assumption per crew.
  const spoilGroups = new Map();
  pricedItems.forEach((item, index) => {
    const cy = item?.excavation_volume_cy;
    if (!Number.isFinite(cy) || cy <= 0) return;
    const method = pricedMethod(sourceItems[index] ?? item, project);
    const group = spoilGroups.get(method) || { indexes: [], cy: 0 };
    group.indexes.push(index);
    group.cy += cy;
    spoilGroups.set(method, group);
  });
  for (const [method, group] of spoilGroups) {
    const single = group.indexes.length === 1;
    push(
      "foundation", single ? group.indexes[0] : null,
      single ? sourceItems[group.indexes[0]]?.component_id ?? null : null,
      "excavation_method", "excavation_spoil_unaccounted",
      `Foundation${single ? "" : "s"} ${list(group.indexes)}: under ${METHOD_LABELS[method] || method} excavation the soil spoil is assumed at 125% of the priced concrete volume (≈${round2(group.cy)} CY across ${group.indexes.length} foundation${single ? "" : "s"}) — excavation is priced as labor only; haul-off, disposal, and backfill are not priced. Verify spoil handling.`,
    );
  }

  // An item with no recorded method and no project default prices on the
  // hand-dig branch silently — surface the assumption instead of pretending
  // the choice was made.
  const unspecified = [];
  sourceItems.forEach((item, index) => {
    if (blank(item?.excavation_method) && blank(project?.excavation_method)) unspecified.push(index);
  });
  if (unspecified.length) {
    push(
      "foundation", unspecified.length === 1 ? unspecified[0] : null,
      unspecified.length === 1 ? sourceItems[unspecified[0]]?.component_id ?? null : null,
      "excavation_method", "excavation_method_unspecified",
      `Foundation${unspecified.length === 1 ? "" : "s"} ${list(unspecified)}: no excavation method is recorded and the project has no default — priced assuming hand dig. Verify the excavation method.`,
    );
  }

  // "Equipment" excavation prices crew hours at the equipment rate only —
  // the machine itself is a separate selected_equipment rental row.
  const equipmentItems = [];
  sourceItems.forEach((item, index) => {
    if (effectiveMethod(item, project) === "equipment_excavation") equipmentItems.push(index);
  });
  if (equipmentItems.length && !(Array.isArray(project?.selected_equipment) && project.selected_equipment.length)) {
    push(
      "foundation", equipmentItems.length === 1 ? equipmentItems[0] : null,
      equipmentItems.length === 1 ? sourceItems[equipmentItems[0]]?.component_id ?? null : null,
      "excavation_method", "excavation_equipment_unpriced",
      `Foundation${equipmentItems.length === 1 ? "" : "s"} ${list(equipmentItems)}: equipment excavation is priced as crew hours at the equipment rate — no excavation equipment rental is attached to this project. Verify whether a rental is needed.`,
    );
  }

  // ---- Forming / finishing ----------------------------------------------
  // The include toggles are independent authored choices; a mismatched pair
  // is an unsupported scope assumption, not an error.
  sourceItems.forEach((item, index) => {
    const componentId = item?.component_id ?? null;
    const forming = Boolean(item?.include_forming);
    const finishing = Boolean(item?.include_finishing);
    if (forming && !finishing) {
      push(
        "foundation", index, componentId, "include_finishing", "forming_without_finishing",
        `Foundation ${index + 1}: forming is priced but top finishing is not — a formed pour still exposes the top surface. Verify whether finishing is in scope.`,
      );
    }
    if (finishing && !forming) {
      push(
        "foundation", index, componentId, "include_forming", "finishing_without_forming",
        `Foundation ${index + 1}: top finishing is priced but no forming — the priced model assumes the sides are formed another way (e.g. neat-cut excavation or existing formwork). Verify.`,
      );
    }
    // Pillar forming prices straight 16-ft forming stock (Math.ceil(perim/16))
    // — the priced material does not represent round formwork.
    if (forming && item?.foundation_type === "pillar") {
      push(
        "foundation", index, componentId, "selected_forming_id", "pillar_forming_straight_stock",
        `Foundation ${index + 1}: pillar/caisson forming is priced as straight 16-ft forming stock — the priced material does not represent round formwork (e.g. sonotube). Verify the forming material choice.`,
      );
    }
  });

  // ---- Concrete delivery / admixtures ------------------------------------
  const readyMixIndexes = [];
  sourceItems.forEach((item, index) => {
    if (readyMixItem(item, inventory)) readyMixIndexes.push(index);
  });
  // Ready-mix is "in play" when a ready-mix item exists and either the live
  // delivery scan shows shipped yards or the scan is gated (held items) and
  // the authored choices still stand.
  const deliveryActive = readyMixIndexes.length > 0
    && (deliveryCheck === null || (Number(deliveryCheck.roundedYards) || 0) > 0);
  const admixtures = Array.isArray(project?.project_concrete_admixtures)
    ? project.project_concrete_admixtures : [];

  if (deliveryActive) {
    // The delivery select displays 4000 AE even when nothing is recorded —
    // surface the silent fallback instead of pretending a mix was chosen.
    if (blank(project?.project_concrete_type)) {
      push(
        "concrete_delivery", null, null, "project_concrete_type", "concrete_mix_unspecified",
        "Concrete delivery: no mix strength is recorded — delivery is priced assuming 4000 AIR ENTRAINED (AE), the catalog fallback. Verify the mix.",
      );
    }
    const has = (id) => admixtures.includes(id);
    const admixName = (id) => getConcreteAdmixtures().find((a) => a.id === id)?.name || id;
    if (has("calcium_chloride")) {
      // The supplier catalog itself warns this admixture corrodes rebar.
      const rebarIndexes = [];
      sourceItems.forEach((item, index) => {
        if (item?.include_rebar) rebarIndexes.push(index);
      });
      if (rebarIndexes.length) {
        push(
          "concrete_delivery", null, null, "project_concrete_admixtures", "admixture_rebar_corrosion",
          `Concrete delivery: ${admixName("calcium_chloride")} is selected while Foundation${rebarIndexes.length === 1 ? "" : "s"} ${list(rebarIndexes)} include${rebarIndexes.length === 1 ? "s" : ""} rebar — the supplier catalog warns calcium chloride corrodes rebar. Verify the admixture choice.`,
        );
      }
      if (has("set_retarding")) {
        push(
          "concrete_delivery", null, null, "project_concrete_admixtures", "admixture_set_pace_conflict",
          `Concrete delivery: ${admixName("calcium_chloride")} (accelerating) and ${admixName("set_retarding")} (retarding) admixtures are selected together — verify the intended set behavior.`,
        );
      }
    }
    if (has("set_retarding")) {
      // FAST SET accelerates the mix; a retarder slows it — recorded
      // choices pull in opposite directions.
      if ((project?.project_concrete_type || "4000_ae") === "fast_set") {
        push(
          "concrete_delivery", null, null, "project_concrete_admixtures", "mix_admixture_pace_conflict",
          `Concrete delivery: FAST SET mix is selected with a ${admixName("set_retarding")} admixture — verify the intended set time.`,
        );
      }
      // The catalog scopes winter service to freezing conditions and
      // set-retarding to hot-weather placement — both at once is a
      // contradictory site assumption.
      if (has("winter_service")) {
        push(
          "concrete_delivery", null, null, "project_concrete_admixtures", "admixture_weather_conflict",
          `Concrete delivery: ${admixName("winter_service")} (freezing conditions) and ${admixName("set_retarding")} (hot-weather placement) are selected together — verify pour conditions.`,
        );
      }
    }
  }

  // Admixtures only price on delivered ready-mix; a recorded selection on an
  // all-bagged project applies to nothing that ships.
  if (admixtures.length && sourceItems.length && readyMixIndexes.length === 0) {
    push(
      "concrete_delivery", null, null, "project_concrete_admixtures", "admixtures_without_ready_mix",
      "Concrete delivery: selected admixtures apply to delivered ready-mix only — every foundation uses bagged concrete, so they price nothing here. Verify the admixture selection.",
    );
  }

  return warnings;
}