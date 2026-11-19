// Pole + pole-painting math — ported VERBATIM from SignEstimate Pro
// (NewFoundationEstimate.jsx: polesTotal / calcPolePaintingCost /
//  getPolePaintingSizeMultiplier). Poles are PROJECT-level, not per foundation item.
//
// Availability hardening: a missing price, malformed dimension, or invalid
// painting setting is not a free pole — the row is held with its acknowledged
// snapshot amounts and reported instead of silently repricing to $0.
//
// CMP-E01/O-056 consolidation: project-level `poles[]` is the single priced
// representation. The legacy per-item pole fields (`selected_pole_id`,
// `pole_total_height_inches`, `pole_offset_from_bottom_inches`, item-level
// `include_pole_painting`, and the dead `pole_cost`/`pole_painting_cost`
// snapshots) are NEVER priced — they derive advisory `legacy_item` rows via
// consolidateFoundationPoles and move onto the canonical list only through the
// explicit migrateLegacyItemPole step. A row marked pole_origin "legacy_item"
// that reaches the priced path is held, never silently repriced.
//
// CMP-E02/O-057 geometry: foundationPoleGeometry resolves five DISTINCT
// quantities that used to be conflated into height_inches + y_offset_inches —
// height above grade, embedment below grade (canonical `embedment_inches`,
// legacy `y_offset_inches` is the same quantity's old spelling), vertical base
// offset above grade (`base_offset_inches`, placement only — never material
// length), plan offset (x_inches/z_inches), and the explicit total stock
// length (`total_length_inches`, the billed length when recorded; otherwise
// the billed length is height + embedment). The actual cross-section shape
// (`pole_shape`, authored then catalog) is carried distinctly — the priced
// math below is unchanged for rows that record none of the new fields.

const assignedId = value => (typeof value === "string" && value.trim() !== "")
  || (typeof value === "number" && Number.isFinite(value));

// Inventory normalization boundary (CMP-A08): the canonical settings pick and
// price/dimension/measurement kernels live in
// masterInventory/inventoryNormalization.
//   poleSettingValue      — explicit-0-respecting pick (same semantics as wallSettingValue)
//   polePriceNumber       — catalog/customer price basis: finite, nonnegative
//                           (explicit 0 is a valid free price)
//   poleDimensionNumber   — positive finite dimension in inches/feet (height
//                           above grade, stock length, pole width)
//   poleOffsetNumber      — finite nonnegative measurement (depth in ground may
//                           legitimately be zero; negatives are not lengths)
//   poleSettingNumber / polePositiveSettingNumber — setting compositions;
//                           missing/blank settings keep the module default,
//                           recorded values must parse on the basis.
//   poleFiniteNumber      — finite signed basis (legacy field presence checks)
import {
  inventorySettingValue as poleSettingValue,
  inventoryNonnegativeNumber as polePriceNumber,
  inventoryPositiveNumber as poleDimensionNumber,
  inventoryNonnegativeMeasurement as poleOffsetNumber,
  inventorySettingNumber as poleSettingNumber,
  inventoryPositiveSettingNumber as polePositiveSettingNumber,
  inventoryFiniteNumber as poleFiniteNumber,
} from "@/components/masterInventory/inventoryNormalization";
// O-009 tail: the catalog lifecycle classifier is the single contract —
// a resolved-but-inactive/deleted pole row now flags catalog_item_inactive /
// catalog_item_deleted instead of silently repricing; the acknowledged
// snapshot still holds through the unchanged issues channel.
import { foundationCatalogRowAvailability } from "./foundationCatalogIntegrity";

const setting = (settings, key, def) => parseFloat(poleSettingValue(settings?.[key], def));

const POLE_PAINT_SETTING_DEFAULTS = {
  pole_paint_cost_per_lf: 3.5,
  pole_paint_labor_per_lf: 2.5,
  pole_paint_size_multiplier_12in: 2.0,
  pole_paint_size_multiplier_10in: 1.75,
  pole_paint_size_multiplier_8in: 1.5,
  pole_paint_size_multiplier_6in: 1.25,
  pole_paint_size_multiplier_4in: 1.0,
};

const polePaintMultiplierKey = (widthInches) => {
  const w = widthInches === null ? 6 : widthInches;
  if (w >= 12) return "pole_paint_size_multiplier_12in";
  if (w >= 10) return "pole_paint_size_multiplier_10in";
  if (w >= 8) return "pole_paint_size_multiplier_8in";
  if (w >= 6) return "pole_paint_size_multiplier_6in";
  return "pole_paint_size_multiplier_4in";
};

const getPolePaintingSizeMultiplier = (inv, settings) => {
  const w = inv?.pole_width_inches || 6;
  if (w >= 12) return setting(settings, "pole_paint_size_multiplier_12in", 2.0);
  if (w >= 10) return setting(settings, "pole_paint_size_multiplier_10in", 1.75);
  if (w >= 8) return setting(settings, "pole_paint_size_multiplier_8in", 1.5);
  if (w >= 6) return setting(settings, "pole_paint_size_multiplier_6in", 1.25);
  return setting(settings, "pole_paint_size_multiplier_4in", 1.0);
};

export const calcPolePaintingCost = (p, inv, settings) => {
  if (!p.include_pole_painting || !inv) return 0;
  // Total pole length = height above ground + depth in ground.
  const heightFt = ((p.height_inches || 0) + (p.y_offset_inches || 0)) / 12;
  const paintCostPerLf = setting(settings, "pole_paint_cost_per_lf", 3.5);
  const paintLaborPerLf = setting(settings, "pole_paint_labor_per_lf", 2.5);
  const sizeMult = getPolePaintingSizeMultiplier(inv, settings);
  return heightFt * (paintCostPerLf + paintLaborPerLf) * sizeMult;
};

// ─── Canonical pole geometry (CMP-E02 / O-057) ──────────────────────────────
//
// Known cross-section values; a recorded string outside this set is still
// carried verbatim (shape is geometry metadata, not yet a priced quantity) —
// only a non-string recording is malformed authored data and holds the row.
export const POLE_SHAPE_VALUES = ["round", "square", "rectangular", "elliptical", "other"];

// A recorded value is present data; undefined/null/"" are absent (blank is
// "not authored", matching the draft-input boundary).
const recorded = (v) => v !== undefined && v !== null && v !== "";

// Resolve the distinct pole quantities into one model. Returns:
//   height_above_grade_inches — pole dimension above finished grade (required)
//   embedment_inches          — depth below grade; canonical embedment_inches,
//                               legacy y_offset_inches is the same quantity
//   base_offset_inches        — pole base above grade (wall/pier mounting);
//                               placement metadata, never material length
//   plan_offset_inches        — plan position x/z (lenient finite-or-0, the
//                               same basis the layout canvas/preview consume)
//   total_length_inches       — explicit billed/purchased stock length override
//   required_length_inches    — billed material length: explicit total, else
//                               height + embedment (the unchanged ported basis)
//   pole_shape                — actual cross-section (authored > catalog), or
//                               null when unspecified — never invented
//   cross_section             — catalog width/depth/wall-thickness for shape
//   sources                   — which field supplied each quantity
//   problems                  — [{field, code, message}] for the caller to map
//                               onto held-row issues (never repriced silently)
export function foundationPoleGeometry(pole, inv = null) {
  const p = pole ?? {};
  const problems = [];
  const add = (field, code, message) => problems.push({ field, code, message });

  // Height above grade — a distinct, always-required quantity.
  const height = poleDimensionNumber(p.height_inches);
  const heightSource = height !== null ? "height_inches" : "unavailable";
  if (height === null) {
    add("height_inches", "pole_height_unavailable",
      "record a positive, finite height above grade in inches before repricing");
  }

  // Embedment below grade — canonical embedment_inches; y_offset_inches is
  // the legacy spelling of the SAME quantity (the panel labeled it "depth in
  // ground" and the priced length has always included it). Both recorded and
  // resolving differently is ambiguous authored data — held, never picked.
  const canonEmbedRaw = p.embedment_inches;
  const legacyEmbedRaw = p.y_offset_inches;
  const canonEmbedPresent = recorded(canonEmbedRaw);
  const legacyEmbedPresent = recorded(legacyEmbedRaw);
  let embedment = null;
  let embedmentSource = "unavailable";
  if (canonEmbedPresent) {
    embedment = poleOffsetNumber(canonEmbedRaw);
    if (embedment === null) {
      add("embedment_inches", "pole_embedment_unavailable",
        "record a finite, nonnegative embedment below grade in inches before repricing");
    } else {
      embedmentSource = "embedment_inches";
    }
  }
  if (legacyEmbedPresent) {
    const legacy = poleOffsetNumber(legacyEmbedRaw);
    if (!canonEmbedPresent) {
      embedment = legacy;
      if (legacy === null) {
        add("y_offset_inches", "pole_depth_unavailable",
          "record a finite, nonnegative depth in ground in inches before repricing");
      } else {
        embedmentSource = "y_offset_inches";
      }
    } else if (embedment !== null && legacy !== null && legacy !== embedment) {
      add("embedment_inches", "pole_embedment_conflict",
        "embedment and legacy depth-in-ground record different values — clear one before repricing");
    }
  }
  if (!canonEmbedPresent && !legacyEmbedPresent) {
    add("y_offset_inches", "pole_depth_unavailable",
      "record a finite, nonnegative depth in ground in inches before repricing");
  }

  // Vertical base offset — where the pole's base sits relative to grade
  // (e.g. wall-top mounting). Placement metadata only: it never contributes
  // to required material length.
  const baseRaw = p.base_offset_inches;
  let baseOffset = 0;
  let baseSource = "default";
  if (recorded(baseRaw)) {
    baseOffset = poleOffsetNumber(baseRaw);
    if (baseOffset === null) {
      add("base_offset_inches", "pole_base_offset_unavailable",
        "record a finite, nonnegative base offset above grade in inches or clear it before repricing");
    } else {
      baseSource = "base_offset_inches";
    }
  }

  // Explicit total stock length — the purchased/billed stick length. When
  // recorded it is the billed length; it must cover height + embedment or the
  // pole cannot physically reach its recorded embedment.
  const totalRaw = p.total_length_inches;
  let total = null;
  let totalSource = "derived";
  if (recorded(totalRaw)) {
    total = poleDimensionNumber(totalRaw);
    if (total === null) {
      add("total_length_inches", "pole_total_length_unavailable",
        "record a positive, finite total stock length in inches or clear it before repricing");
    } else {
      totalSource = "total_length_inches";
    }
  }

  // Billed material length — the unchanged ported basis (height + embedment)
  // unless an explicit total stock length overrides it.
  let required = null;
  if (totalSource === "total_length_inches" && total !== null) {
    required = total;
    if (height !== null && embedment !== null && total < height + embedment) {
      add("total_length_inches", "pole_total_length_conflict",
        "total stock length is shorter than height above grade plus embedment — lengthen it or clear it before repricing");
    }
  } else if (height !== null && embedment !== null) {
    required = height + embedment;
  }

  // Actual cross-section — authored pole_shape wins over the catalog row's
  // pole_shape; an unspecified shape stays null (unspecified is legitimate —
  // the renderers assume round today and no claim otherwise is made). A
  // recorded non-string is malformed authored data and holds the row.
  const authoredShapePresent = recorded(p.pole_shape);
  const shapeRaw = authoredShapePresent ? p.pole_shape : inv?.pole_shape;
  let shape = null;
  let shapeSource = null;
  let shapeKnown = false;
  if (recorded(shapeRaw)) {
    if (typeof shapeRaw !== "string") {
      add("pole_shape", "pole_shape_unavailable",
        "recorded pole shape must be a value like round or square — clear or correct it before repricing");
    } else {
      shape = shapeRaw.trim().toLowerCase();
      shapeSource = authoredShapePresent ? "pole_shape" : "catalog";
      shapeKnown = POLE_SHAPE_VALUES.includes(shape);
    }
  }
  const cross_section = inv == null ? null : {
    shape,
    width_inches: poleOffsetNumber(inv.pole_width_inches),
    depth_inches: poleOffsetNumber(inv.pole_depth_inches),
    wall_thickness_inches: poleOffsetNumber(inv.pole_wall_thickness_inches),
  };

  // Plan offset — the same finite-or-0 basis the layout canvas and preview
  // consume (placement only, never material length).
  const planOffset = {
    x_inches: poleFiniteNumber(p.x_inches) ?? 0,
    z_inches: poleFiniteNumber(p.z_inches) ?? 0,
  };

  return {
    height_above_grade_inches: height,
    embedment_inches: embedment,
    base_offset_inches: baseOffset,
    plan_offset_inches: planOffset,
    total_length_inches: total,
    required_length_inches: required,
    pole_shape: shape,
    pole_shape_known: shapeKnown,
    cross_section,
    sources: {
      height_above_grade: heightSource,
      embedment: embedmentSource,
      base_offset: baseSource,
      total_length: totalSource,
      shape: shapeSource,
    },
    problems,
  };
}

// ─── Legacy item-pole consolidation (CMP-E01 / O-056) ───────────────────────
//
// The single priced representation is project.poles. Item rows can still carry
// the pre-CMP fields below; they are ghost data (rendered in the 3D preview,
// never priced — item_total_cost has no pole term and sumPole reads only
// project poles). These helpers expose them as advisory derived rows and move
// them onto the canonical list only through the explicit migrate step, so a
// physical pole is never billed twice and never silently loses geometry.
export const POLE_ORIGIN_PROJECT = "project";
export const POLE_ORIGIN_LEGACY_ITEM = "legacy_item";
export const LEGACY_ITEM_POLE_FIELDS = [
  "selected_pole_id", "pole_total_height_inches", "pole_offset_from_bottom_inches",
  "include_pole_painting",
];

const isCostSnapshot = (v) => typeof v === "number" && Number.isFinite(v);

// An item "carries" a legacy pole when any pole field departs from the
// blankItem defaults — including the dead pole_cost/pole_painting_cost
// snapshots, which prove a pole once existed even if the selection was lost.
export function itemHasLegacyPole(item) {
  if (!item || typeof item !== "object") return false;
  const id = item.selected_pole_id;
  if (assignedId(id)) return true;
  const height = poleFiniteNumber(item.pole_total_height_inches);
  if (height !== null && height !== 0) return true;
  const offBottom = poleFiniteNumber(item.pole_offset_from_bottom_inches);
  if (offBottom !== null && offBottom !== 0) return true;
  if (item.include_pole_painting === true) return true;
  if (isCostSnapshot(item.pole_cost) || isCostSnapshot(item.pole_painting_cost)) return true;
  return false;
}

// Advisory derived view of one item's legacy pole fields — marked
// pole_origin "legacy_item" so it can never enter the priced list silently.
// `height_inches` is null when the legacy total height is absent/malformed;
// embedment is intentionally absent (not derivable — see migrate below).
export function deriveLegacyItemPole(item, index = 0) {
  if (!itemHasLegacyPole(item)) return null;
  const height = poleFiniteNumber(item.pole_total_height_inches);
  const offBottom = poleFiniteNumber(item.pole_offset_from_bottom_inches);
  return {
    pole_origin: POLE_ORIGIN_LEGACY_ITEM,
    source_item_index: index,
    source_item_component_id: item.component_id ?? null,
    foundation_component_id: item.component_id ?? "",
    foundation_idx: index,
    pole_id: assignedId(item.selected_pole_id) ? item.selected_pole_id : "",
    height_inches: height !== null && height > 0 ? height : null,
    include_pole_painting: item.include_pole_painting === true,
    legacy_pole_offset_from_bottom_inches: offBottom,
    legacy_pole_cost: isCostSnapshot(item.pole_cost) ? item.pole_cost : null,
    legacy_pole_painting_cost: isCostSnapshot(item.pole_painting_cost) ? item.pole_painting_cost : null,
  };
}

// Consolidated pole model for one project (or any {items, poles} source):
//   poles       — the canonical, priced list (same row refs, never mutated)
//   legacyPoles — advisory rows derived from item-level fields
//   overlaps    — [{derivedIndex, poleIndex, ...}] where a project pole is
//                 already assigned to the same foundation; surfaced for review
//                 rather than silently deduplicated (two poles on one footing
//                 are legitimate)
//   issues      — advisory-only; `severity: "advisory"` keeps them out of the
//                 priced-issue channels that gate save/handoff
export function consolidateFoundationPoles(source = {}) {
  const items = Array.isArray(source?.items) ? source.items : [];
  const poles = Array.isArray(source?.poles) ? source.poles : [];
  const legacyPoles = [];
  const overlaps = [];
  const issues = [];
  items.forEach((item, index) => {
    const derived = deriveLegacyItemPole(item, index);
    if (!derived) return;
    const derivedIndex = legacyPoles.length;
    legacyPoles.push(derived);
    issues.push({
      kind: "pole", severity: "advisory", code: "legacy_item_pole_fields",
      componentId: item?.component_id ?? null, field: "selected_pole_id",
      message: `Foundation ${index + 1} carries legacy item-pole fields that are not priced — migrate them into the Poles section or clear them.`,
    });
    poles.forEach((p, poleIndex) => {
      // Overlap = this project pole is assigned to this foundation item —
      // by component id when both sides carry one, otherwise by the
      // foundation_idx slot (which is itself an assignment signal even when
      // the component id side is missing).
      const assignedToItem = p?.foundation_component_id && item?.component_id
        ? p.foundation_component_id === item.component_id
        : p?.foundation_idx !== undefined && p?.foundation_idx !== null
          && p.foundation_idx === index;
      if (assignedToItem) {
        overlaps.push({
          derivedIndex, poleIndex,
          itemComponentId: item?.component_id ?? null,
          poleComponentId: p?.component_id ?? null,
        });
      }
    });
  });
  const overlappedItems = new Set(overlaps.map((o) => o.derivedIndex));
  for (const derivedIndex of overlappedItems) {
    const count = overlaps.filter((o) => o.derivedIndex === derivedIndex).length;
    const itemIndex = legacyPoles[derivedIndex]?.source_item_index ?? derivedIndex;
    issues.push({
      kind: "pole", severity: "advisory", code: "pole_representation_overlap",
      componentId: legacyPoles[derivedIndex]?.source_item_component_id ?? null,
      field: "selected_pole_id",
      message: `Foundation ${itemIndex + 1} has legacy item-pole fields and ${count} project pole(s) on the same foundation — verify they describe different physical poles before migrating.`,
    });
  }
  return { poles, legacyPoles, overlaps, issues };
}

// The explicit consolidation step: build the canonical project-pole row from
// an item's legacy fields plus the patch that clears them. The returned pole
// deliberately leaves embedment unrecorded — pole_offset_from_bottom_inches is
// ambiguous (offset above the footing bottom, not a depth in ground), so it is
// preserved verbatim as legacy_pole_offset_from_bottom_inches and the priced
// row holds on pole_depth_unavailable until a real embedment is recorded.
// Plan position inherits the foundation item's recorded x/z placement.
export function migrateLegacyItemPole(item, index = 0, { createId } = {}) {
  if (!itemHasLegacyPole(item)) return null;
  const height = poleFiniteNumber(item.pole_total_height_inches);
  const offBottom = poleFiniteNumber(item.pole_offset_from_bottom_inches);
  const planX = poleFiniteNumber(item.x_inches);
  const planZ = poleFiniteNumber(item.z_inches);
  const pole = {
    ...(typeof createId === "function" ? { component_id: createId("pole") } : {}),
    pole_id: assignedId(item.selected_pole_id) ? item.selected_pole_id : "",
    ...(height !== null && height > 0 ? { height_inches: height } : {}),
    include_pole_painting: item.include_pole_painting === true,
    foundation_component_id: item.component_id ?? "",
    foundation_idx: index,
    ...(planX !== null ? { x_inches: planX } : {}),
    ...(planZ !== null ? { z_inches: planZ } : {}),
    migrated_from: POLE_ORIGIN_LEGACY_ITEM,
    source_item_component_id: item.component_id ?? undefined,
    ...(offBottom !== null ? { legacy_pole_offset_from_bottom_inches: offBottom } : {}),
  };
  const itemPatch = {
    selected_pole_id: "",
    pole_total_height_inches: 0,
    pole_offset_from_bottom_inches: 0,
    include_pole_painting: false,
    // The dead item-level snapshots clear too — leaving them would keep the
    // item flagged as carrying a legacy pole after its explicit migration.
    pole_cost: undefined,
    pole_painting_cost: undefined,
  };
  return { pole, itemPatch };
}

// Resolves the catalog row and every value the pricing formulas read, on a
// normalized calculation copy — authored rows and settings are never mutated.
function polePricing(pole, inventory = [], index = 0, settings = {}) {
  const issues = [];
  const id = pole?.pole_id;
  const paint = { costPerLf: null, laborPerLf: null, sizeMultiplier: null };
  const add = (field, code, message) => issues.push({
    kind: "pole", index, componentId: pole?.component_id ?? pole?.id ?? null,
    field, inventoryId: assignedId(id) ? id : null, code,
    message: `Pole ${index + 1}: ${message}.`,
  });
  // Fail closed on the legacy representation: a row marked legacy_item must
  // never reach the priced list — migrate it through migrateLegacyItemPole or
  // it stays held (a silent price here would double-charge the ghost pole).
  if (pole?.pole_origin === POLE_ORIGIN_LEGACY_ITEM) {
    add("pole_origin", "pole_legacy_representation",
      "legacy item-pole data cannot price here — migrate it into the Poles section or remove it");
    return { issues, inv: null, geometry: null, painting: false, rate: null, stockLengthInches: null, widthInches: null, paint };
  }
  let inv = null;
  if (!assignedId(id)) {
    add("pole_id", "catalog_item_unassigned", "select a catalog material");
  } else {
    const matches = inventory.filter((row) => row?.id === id);
    if (!matches.length) {
      add("pole_id", "catalog_item_unavailable", "selected catalog material is unavailable");
    } else if (matches.length !== 1) {
      add("pole_id", "catalog_item_ambiguous", "selected catalog material is ambiguous");
    } else if (matches[0].material_type !== "pole") {
      add("pole_id", "catalog_item_type_mismatch", "selected catalog material is not a pole");
    } else {
      // O-009 tail: existence -> type -> lifecycle -> consumed basis, the same
      // precedence as the item scan. A resolved-but-inactive/deleted row held
      // a silent price; it is flagged here so the pole keeps its acknowledged
      // snapshot instead of repricing on a deactivated/deleted catalog row.
      const availability = foundationCatalogRowAvailability(matches[0]);
      if (availability !== "active") {
        add("pole_id", availability === "deleted" ? "catalog_item_deleted" : "catalog_item_inactive",
          availability === "deleted"
            ? "selected catalog material is marked deleted — pick a replacement"
            : "selected catalog material is inactive — reactivate it or pick a replacement");
      } else {
        inv = matches[0];
      }
    }
  }
  // Distinct authored/calculated quantities (CMP-E02). The height and
  // depth-in-ground checks map onto the geometry problems unchanged — same
  // codes and messages as the pre-consolidation checks.
  const geometry = foundationPoleGeometry(pole, inv);
  for (const problem of geometry.problems) add(problem.field, problem.code, problem.message);
  const painting = pole?.include_pole_painting === true;
  let rate = null;
  let stockLengthInches = null;
  let widthInches = null;
  if (inv) {
    const override = pole?.custom_cost_per_unit;
    const hasOverride = override !== undefined && override !== null;
    const stockMode = inv.pole_pricing_mode === "stock_price";
    rate = polePriceNumber(hasOverride ? override : (stockMode ? inv.pole_stock_price : inv.cost_per_unit));
    if (rate === null) {
      add(hasOverride ? "custom_cost_per_unit" : stockMode ? "pole_stock_price" : "cost_per_unit",
        "pole_price_unavailable", "record a finite, nonnegative pole price before repricing");
    }
    if (stockMode) {
      const stockLengthFt = polePositiveSettingNumber(inv.pole_stock_length_ft, 20);
      if (stockLengthFt === null) {
        add("pole_stock_length_ft", "pole_stock_length_unavailable",
          "the selected catalog stock length must be a recorded finite positive number");
      } else {
        stockLengthInches = stockLengthFt * 12;
      }
    }
    if (painting) {
      widthInches = polePositiveSettingNumber(inv.pole_width_inches, 6);
      if (widthInches === null) {
        add("pole_width_inches", "pole_width_unavailable",
          "the selected catalog pole width must be a recorded finite positive number");
      }
      const paintSetting = (key, label) => {
        const value = poleSettingNumber(settings?.[key], POLE_PAINT_SETTING_DEFAULTS[key]);
        if (value === null) {
          add(key, "pole_paint_setting_unavailable",
            `record a finite, nonnegative ${label} before repricing`);
        }
        return value;
      };
      paint.costPerLf = paintSetting("pole_paint_cost_per_lf", "pole paint cost per LF");
      paint.laborPerLf = paintSetting("pole_paint_labor_per_lf", "pole paint labor per LF");
      paint.sizeMultiplier = paintSetting(polePaintMultiplierKey(widthInches), "pole paint size multiplier");
    }
  }
  return { issues, inv, geometry, painting, rate, stockLengthInches, widthInches, paint };
}

export function foundationPolePricingIssues(pole, inventory = [], index = 0, settings = {}) {
  return polePricing(pole, inventory, index, settings).issues;
}

export function foundationPoleCatalogIssues(poles = [], inventory = [], settings = {}) {
  return (poles || []).flatMap((pole, index) => foundationPolePricingIssues(pole, inventory, index, settings));
}

export function calcPoles(poles = [], inventory = [], settings = {}, options = {}) {
  const explicitSnapshot = options != null && Object.prototype.hasOwnProperty.call(options, "savedPoles");
  const savedPoles = Array.isArray(options?.savedPoles) ? options.savedPoles : [];
  const counts = rows => {
    const out = new Map();
    for (const row of rows) {
      const id = row?.component_id;
      if (assignedId(id)) out.set(id, (out.get(id) || 0) + 1);
    }
    return out;
  };
  const currentCounts = counts(poles), savedCounts = counts(savedPoles);
  const savedById = new Map(savedPoles.filter((row) => assignedId(row?.component_id))
    .map((row) => [row.component_id, row]));
  // Preserve the last saved amounts, not a fabricated free pole. The project
  // availability gate prevents these historical values becoming a new quote.
  const held = pole => {
    const id = pole?.component_id;
    const acknowledged = explicitSnapshot
      ? assignedId(id) && currentCounts.get(id) === 1 && savedCounts.get(id) === 1
        ? savedById.get(id) : null
      : pole;
    const result = { ...pole };
    if (explicitSnapshot) {
      // Calculated snapshot fields only — authored fields ride on the spread.
      for (const field of ["pole_name", "pole_cost", "pole_painting_cost", "total_cost",
        "required_length_inches", "stock_pieces"]) {
        if (acknowledged && Object.prototype.hasOwnProperty.call(acknowledged, field)) result[field] = acknowledged[field];
        else delete result[field];
      }
    }
    return result;
  };
  const results = (poles || []).map((pole, index) => polePricing(pole, inventory, index, settings));
  return {
    poles: results.map((check, index) => {
      const pole = poles[index];
      if (check.issues.length) return held(pole);
      const { inv, geometry, rate, stockLengthInches, widthInches, paint } = check;
      const requiredInches = geometry.required_length_inches;
      let poleCost;
      let stockPieces = null;
      if (inv.pole_pricing_mode === "stock_price") {
        stockPieces = Math.ceil(requiredInches / stockLengthInches);
        poleCost = stockPieces * rate;
      } else {
        poleCost = (requiredInches / 12) * rate;
      }
      // The guarded path reuses the ported painting math on the normalized
      // calculation copy, so valid inputs price identically to the original.
      // The painted length is the billed required length — the whole stick.
      const paintingCost = check.painting
        ? calcPolePaintingCost(
            { include_pole_painting: true, height_inches: requiredInches, y_offset_inches: 0 },
            { ...inv, pole_width_inches: widthInches },
            {
              pole_paint_cost_per_lf: paint.costPerLf,
              pole_paint_labor_per_lf: paint.laborPerLf,
              [polePaintMultiplierKey(widthInches)]: paint.sizeMultiplier,
            })
        : 0;
      return {
        ...pole,
        // Resolved-geometry snapshots (CMP-E02): the canonical embedment
        // materializes alongside the authored legacy spelling; required
        // length, stock pieces, base offset and resolved shape persist so the
        // BOM, preview and handoff read the same distinct quantities.
        embedment_inches: geometry.embedment_inches,
        base_offset_inches: geometry.base_offset_inches,
        required_length_inches: requiredInches,
        stock_pieces: stockPieces,
        ...(geometry.pole_shape !== null ? { pole_shape: geometry.pole_shape } : {}),
        pole_name: inv.material_name || "",
        pole_cost: poleCost,
        pole_painting_cost: paintingCost,
        total_cost: poleCost + paintingCost,
      };
    }),
    polePricing: results.map((check) => ({
      available: check.issues.length === 0,
      issues: check.issues,
      // Resolved canonical geometry for display surfaces (never priced again).
      geometry: check.geometry,
    })),
  };
}