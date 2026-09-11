import { base44 } from "@/api/base44Client";
import { expectedBuilderEntityFields, replaceBuilderEntityFieldsIfUnchanged } from "./builderEntityPersistence";

const APP_ID = "68dfcc5e57bbbc35387da97c";
export const LEGACY_BOM_RECONCILE_BATCH = "legacy_bom_reconcile_v1";
const COMPLETE_SENTINEL = "__legacy_bom_reconcile_v1_complete__";
const TOLERANCE = 0.01;

const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nowIso = () => new Date().toISOString();
const moneyClose = (a, b) => Math.abs(num(a) - num(b)) <= TOLERANCE;
const activeParts = (rows) => (rows || []).filter((part) => part.is_active !== false);
const frozenSum = (rows) => activeParts(rows).reduce((sum, part) => sum + num(part.frozen_extended_cost), 0);

function appendNote(existing, note) {
  const current = String(existing || "").trim();
  return current ? `${current}\n${note}` : note;
}

function foundationCategory(part) {
  const key = String(part.part_key || "");
  if (key === "foundation:concrete-delivery" || /foundation:item:\d+:concrete/.test(key)) return "concrete";
  if (/foundation:item:\d+:rebar/.test(key)) return "rebar";
  if (/foundation:item:\d+:excavation/.test(key)) return "excavation";
  if (/foundation:item:\d+:forming/.test(key)) return "forming";
  if (/foundation:item:\d+:(pouring|finishing)/.test(key)) return "labor";
  if (key.startsWith("foundation:wall:")) return "wall";
  if (key.startsWith("foundation:pole:") && key.endsWith(":painting")) return "pole_painting";
  if (key.startsWith("foundation:pole:")) return "pole";
  if (key.startsWith("foundation:equipment:")) return "equipment";
  if (key.startsWith("foundation:cap:")) return "wall_cap";
  if (key.startsWith("foundation:cabinet:")) return "cabinet";
  if (key === "foundation:landscape") return "landscape";
  return "other";
}

function channelCategory(part) {
  const key = String(part.part_key || "");
  if (key.startsWith("channel:letters:") || key.startsWith("channel:letter-fee:") || key === "channel:letters-markup") return "letters";
  if (/channel:item:\d+:material:\d+/.test(key)) return "materials";
  if (/channel:item:\d+:labor/.test(key)) return "labor";
  if (key.startsWith("channel:equipment:")) return "equipment";
  if (key === "channel:install-supplies") return "supplies";
  if (key.startsWith("channel:personnel:")) return "personnel";
  if (key === "channel:travel") return "travel";
  if (key === "channel:project-markup") return "markup";
  return "other";
}

function cncCategory(part) {
  const key = String(part.part_key || "");
  if (/cnc:item:\d+:machine/.test(key)) return "machine";
  if (/cnc:item:\d+:labor/.test(key) || key === "cnc:fixed-setup") return "labor";
  return "other";
}

const FOUNDATION_META = {
  concrete: { label: "Legacy Concrete", type: "material", subtype: "legacy_concrete", sourceFields: ["total_concrete_cost"] },
  rebar: { label: "Legacy Rebar", type: "material", subtype: "legacy_rebar", sourceFields: ["total_rebar_cost"] },
  excavation: { label: "Legacy Excavation", type: "labor", subtype: "legacy_excavation", sourceFields: ["total_excavation_cost"] },
  forming: { label: "Legacy Forming", type: "labor", subtype: "legacy_forming", sourceFields: ["total_forming_materials_cost"] },
  labor: { label: "Legacy Foundation Labor", type: "labor", subtype: "legacy_foundation_labor", sourceFields: ["total_labor_cost"] },
  wall: { label: "Legacy Masonry Wall", type: "material", subtype: "legacy_wall", sourceFields: ["total_wall_cost"] },
  pole: { label: "Legacy Sign Poles", type: "material", subtype: "legacy_poles", sourceFields: ["total_pole_cost"] },
  pole_painting: { label: "Legacy Pole Painting", type: "labor", subtype: "legacy_pole_painting", sourceFields: ["total_pole_painting_cost"] },
  equipment: { label: "Legacy Foundation Equipment", type: "equipment", subtype: "legacy_equipment", sourceFields: ["total_equipment_cost"] },
  wall_cap: { label: "Legacy Wall Caps", type: "material", subtype: "legacy_wall_cap", sourceFields: ["total_wall_cap_cost"] },
  cabinet: { label: "Legacy Signage Cabinet", type: "fabrication", subtype: "legacy_signage_cabinet", sourceFields: ["total_signage_cabinet_cost"] },
  landscape: { label: "Legacy Landscape", type: "material", subtype: "legacy_landscape", sourceFields: ["total_landscape_cost"] },
};

const CHANNEL_META = {
  letters: { label: "Legacy Letter Purchase / Fabrication", type: "fabrication", subtype: "legacy_letters", sourceFields: ["total_letters_cost"] },
  materials: { label: "Legacy Installation Materials", type: "material", subtype: "legacy_install_materials", sourceFields: ["total_materials_cost"] },
  labor: { label: "Legacy Installation Labor", type: "labor", subtype: "legacy_install_labor", sourceFields: ["labor_cost"] },
  supplies: { label: "Legacy Installation Supplies", type: "consumable", subtype: "legacy_supplies", sourceFields: ["total_supplies_cost"] },
  equipment: { label: "Legacy Installation Equipment", type: "equipment", subtype: "legacy_equipment", sourceFields: ["total_equipment_cost"] },
  personnel: { label: "Legacy Installation Personnel", type: "labor", subtype: "legacy_personnel", sourceFields: ["total_personnel_cost"] },
  travel: { label: "Legacy Travel / Mileage", type: "service", subtype: "legacy_travel", sourceFields: ["total_travel_cost"] },
  markup: { label: "Legacy Builder Markup", type: "pricing", subtype: "legacy_markup", sourceFields: ["markup_amount"] },
};

const CNC_META = {
  machine: { label: "Legacy CNC Machine Time", type: "equipment", subtype: "legacy_cnc_machine", sourceFields: ["total_machine_cost"] },
  labor: { label: "Legacy CNC Labor", type: "labor", subtype: "legacy_cnc_labor", sourceFields: ["total_labor_cost"] },
};

function foundationExpected(project) {
  return {
    concrete: num(project.total_concrete_cost),
    rebar: num(project.total_rebar_cost),
    excavation: num(project.total_excavation_cost),
    forming: num(project.total_forming_materials_cost),
    labor: num(project.total_labor_cost),
    wall: num(project.total_wall_cost),
    pole: num(project.total_pole_cost),
    pole_painting: num(project.total_pole_painting_cost),
    equipment: num(project.total_equipment_cost),
    wall_cap: num(project.total_wall_cap_cost),
    cabinet: num(project.total_signage_cabinet_cost),
    landscape: num(project.total_landscape_cost),
  };
}

function channelExpectedCandidates(project) {
  const common = {
    supplies: num(project.total_supplies_cost),
    equipment: num(project.total_equipment_cost),
    personnel: num(project.total_personnel_cost),
    travel: num(project.total_travel_cost),
    markup: num(project.markup_amount),
  };
  return [
    {
      mode: "legacy_letters_plus_install_materials_personnel",
      expected: {
        letters: num(project.total_letters_cost),
        materials: num(project.total_materials_cost),
        labor: 0,
        ...common,
      },
    },
    {
      mode: "modern_materials_include_letters",
      expected: {
        letters: 0,
        materials: num(project.total_materials_cost),
        labor: num(project.labor_cost),
        ...common,
      },
    },
    {
      mode: "explicit_letters_materials_and_labor",
      expected: {
        letters: num(project.total_letters_cost),
        materials: num(project.total_materials_cost),
        labor: num(project.labor_cost),
        ...common,
      },
    },
  ];
}

function cncExpected(project) {
  return {
    machine: num(project.total_machine_cost),
    labor: num(project.total_labor_cost),
  };
}

function expectedSum(expected) {
  return Object.values(expected || {}).reduce((sum, value) => sum + num(value), 0);
}

function resolveExpected(moduleKey, project, frozenTotal) {
  if (moduleKey === "foundation") {
    const expected = foundationExpected(project || {});
    if (!moneyClose(expectedSum(expected), frozenTotal)) {
      throw new Error(`Foundation legacy category totals ${expectedSum(expected)} do not match frozen Product ${frozenTotal}.`);
    }
    return { expected, meta: FOUNDATION_META, categorize: foundationCategory, mode: "foundation_saved_totals" };
  }
  if (moduleKey === "channel_letters") {
    const match = channelExpectedCandidates(project || {}).find((candidate) => moneyClose(expectedSum(candidate.expected), frozenTotal));
    if (!match) {
      const sums = channelExpectedCandidates(project || {}).map((candidate) => `${candidate.mode}=${expectedSum(candidate.expected)}`).join(", ");
      throw new Error(`Channel Letter legacy categories do not match frozen Product ${frozenTotal}. Candidates: ${sums}.`);
    }
    return { expected: match.expected, meta: CHANNEL_META, categorize: channelCategory, mode: match.mode };
  }
  if (moduleKey === "cnc") {
    const expected = cncExpected(project || {});
    if (!moneyClose(expectedSum(expected), frozenTotal)) {
      throw new Error(`CNC legacy category totals ${expectedSum(expected)} do not match frozen Product ${frozenTotal}.`);
    }
    return { expected, meta: CNC_META, categorize: cncCategory, mode: "cnc_saved_totals" };
  }
  return null;
}

async function deactivateParts(parts, reason) {
  const timestamp = nowIso();
  for (const part of parts) {
    const deactivatePatch = {
      is_active: false,
      last_price_check_at: timestamp,
      notes: appendNote(part.notes, reason),
    };
    await replaceBuilderEntityFieldsIfUnchanged({
      entity: base44.entities.BuilderPart,
      id: part.id,
      expectedUpdatedAt: part.updated_date || "",
      expectedFields: expectedBuilderEntityFields(part, deactivatePatch),
      nextFields: deactivatePatch,
      guardFields: { builder_product_id: part.builder_product_id },
      label: `Legacy BOM Part “${part.part_name || "Part"}” deactivation`,
    });
  }
}

async function createAggregatePart({ builder, category, amount, represented, meta, mode, sortOrder }) {
  if (amount <= TOLERANCE) return null;
  const timestamp = nowIso();
  const info = meta[category] || { label: `Legacy ${category}`, type: "other", subtype: `legacy_${category}`, sourceFields: [] };
  return base44.entities.BuilderPart.create({
    builder_product_id: builder.id,
    part_key: `legacy-reconcile:${builder.module_key}:${category}`,
    sort_order: sortOrder,
    part_name: info.label,
    part_type: info.type,
    part_subtype: info.subtype,
    source_module_key: builder.module_key,
    source_path: (info.sourceFields || []).join(" + "),
    builder_sync_state: "linked",
    inventory_entity: "",
    inventory_item_id: "",
    original_inventory_item_id: "",
    inventory_item_name: "",
    inventory_link_state: "manual",
    frozen_inventory_snapshot: {},
    current_inventory_snapshot: {},
    builder_data: {
      legacy_bom_reconciliation: true,
      reconcile_batch: LEGACY_BOM_RECONCILE_BATCH,
      authoritative_source_fields: info.sourceFields || [],
      reconciliation_mode: mode,
    },
    calculation_snapshot: {
      authoritative_category_total: represented + amount,
      detailed_snapshot_total_retained: represented,
      aggregate_balance_added: amount,
      frozen_product_total: num(builder.frozen_cost),
    },
    pricing_basis_snapshot: {
      pricing_mode: "legacy_saved_aggregate",
      authoritative_source_fields: info.sourceFields || [],
      reconcile_batch: LEGACY_BOM_RECONCILE_BATCH,
    },
    quantity: 1,
    unit: "job",
    frozen_unit_cost: amount,
    frozen_extended_cost: amount,
    current_unit_cost: amount,
    current_extended_cost: amount,
    price_state: "legacy_frozen",
    price_delta: 0,
    price_delta_percent: 0,
    last_price_check_at: timestamp,
    last_price_update_at: timestamp,
    manual_cost_override: true,
    manual_cost: amount,
    is_active: true,
    notes: "Historical aggregate Part created only for a saved legacy Builder cost category that was not represented by the detailed legacy snapshot. The accepted Product price was not changed.",
  });
}

async function reconcileSupportedBuilder(builder, project, parts) {
  const frozenTotal = num(builder.frozen_cost);
  const plan = resolveExpected(builder.module_key, project, frozenTotal);
  if (!plan) {
    if (moneyClose(frozenSum(parts), frozenTotal)) {
      return { mode: "already_reconciled_unsupported_module", created: 0, deactivated: 0 };
    }
    throw new Error(`Legacy BOM reconciliation is not defined for ${builder.module_key} Product ${builder.id} with frozen cost ${frozenTotal}.`);
  }

  const generated = activeParts(parts);
  const unsafe = generated.filter((part) => ["manual_addon", "detached_override"].includes(part.builder_sync_state));
  if (unsafe.length) {
    throw new Error(`Product ${builder.id} has ${unsafe.length} user-controlled Part(s); refusing automatic legacy BOM rewrite.`);
  }

  const byCategory = new Map();
  for (const part of generated) {
    const category = plan.categorize(part);
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(part);
  }

  const otherCost = (byCategory.get("other") || []).reduce((sum, part) => sum + num(part.frozen_extended_cost), 0);
  if (Math.abs(otherCost) > TOLERANCE) {
    throw new Error(`Product ${builder.id} has ${otherCost} of uncategorized active legacy Parts; refusing to hide them.`);
  }

  let deactivated = 0;
  let created = 0;
  let sortOrder = 9000;

  for (const [category, expectedAmountRaw] of Object.entries(plan.expected)) {
    const expectedAmount = num(expectedAmountRaw);
    const categoryParts = byCategory.get(category) || [];
    const represented = categoryParts.reduce((sum, part) => sum + num(part.frozen_extended_cost), 0);

    if (represented > expectedAmount + TOLERANCE) {
      await deactivateParts(
        categoryParts,
        `Deactivated by ${LEGACY_BOM_RECONCILE_BATCH}: detailed legacy ${category} Parts totaled ${represented}, but the authoritative saved Builder category was ${expectedAmount}. Frozen history retained as inactive records.`
      );
      deactivated += categoryParts.length;
      const createdPart = await createAggregatePart({
        builder,
        category,
        amount: expectedAmount,
        represented: 0,
        meta: plan.meta,
        mode: plan.mode,
        sortOrder: sortOrder++,
      });
      if (createdPart) created += 1;
      continue;
    }

    const remainder = expectedAmount - represented;
    if (remainder > TOLERANCE) {
      const createdPart = await createAggregatePart({
        builder,
        category,
        amount: remainder,
        represented,
        meta: plan.meta,
        mode: plan.mode,
        sortOrder: sortOrder++,
      });
      if (createdPart) created += 1;
    }
  }

  const refreshed = await base44.entities.BuilderPart.filter({ builder_product_id: builder.id });
  const finalSum = frozenSum(refreshed);
  if (!moneyClose(finalSum, frozenTotal)) {
    throw new Error(`Product ${builder.id} reconciliation failed: active frozen Parts=${finalSum}, frozen Product=${frozenTotal}.`);
  }

  return { mode: plan.mode, created, deactivated, finalSum };
}

async function markBuilderComplete(builder, result) {
  const timestamp = nowIso();
  const parts = await base44.entities.BuilderPart.filter({ builder_product_id: builder.id });
  const active = activeParts(parts);
  const finalSum = frozenSum(active);
  if (!moneyClose(finalSum, num(builder.frozen_cost))) {
    throw new Error(`Cannot mark Product ${builder.id} reconciled: active frozen BOM ${finalSum} != frozen Product ${builder.frozen_cost}.`);
  }

  const reconcilePatch = {
    legacy_bom_reconciled: true,
    legacy_bom_reconcile_version: LEGACY_BOM_RECONCILE_BATCH,
    legacy_bom_reconciled_at: timestamp,
    part_count: active.length,
    notes: appendNote(builder.notes, `Historical BOM reconciled by ${LEGACY_BOM_RECONCILE_BATCH}; frozen Product price remained ${builder.frozen_cost}.`),
  };
  await replaceBuilderEntityFieldsIfUnchanged({
    entity: base44.entities.BuilderProduct,
    id: builder.id,
    expectedUpdatedAt: builder.updated_date || "",
    expectedFields: expectedBuilderEntityFields(builder, reconcilePatch),
    nextFields: reconcilePatch,
    guardFields: { estimate_id: builder.estimate_id },
    label: "Legacy BOM Builder reconciliation receipt",
  });

  await base44.entities.LegacyMigrationMap.create({
    source_app_id: APP_ID,
    source_entity: "BuilderProduct",
    source_id: builder.id,
    target_entity: "BuilderProduct",
    target_id: builder.id,
    source_created_date: builder.created_date || "",
    source_updated_date: builder.updated_date || "",
    migration_batch: LEGACY_BOM_RECONCILE_BATCH,
    notes: JSON.stringify({
      completed_at: timestamp,
      module_key: builder.module_key,
      frozen_product_total: num(builder.frozen_cost),
      active_part_count: active.length,
      active_frozen_part_sum: finalSum,
      mode: result.mode,
      created_aggregate_parts: result.created || 0,
      deactivated_generated_parts: result.deactivated || 0,
    }),
  });
}

async function migrationRows() {
  const rows = await base44.entities.LegacyMigrationMap.filter({ migration_batch: LEGACY_BOM_RECONCILE_BATCH });
  if (!Array.isArray(rows)) {
    throw new Error("Legacy BOM reconciliation status could not be verified. Reconciliation was paused without writing anything.");
  }
  return rows;
}

export async function verifyLegacyBomReconciliation() {
  const builders = await base44.entities.BuilderProduct.filter({ price_state: "legacy_frozen" });
  if (!Array.isArray(builders)) {
    throw new Error("Legacy BOM verification could not load the Builder Product set.");
  }
  const results = [];
  for (const builder of builders) {
    const parts = await base44.entities.BuilderPart.filter({ builder_product_id: builder.id });
    if (!Array.isArray(parts)) {
      throw new Error(`Legacy BOM verification could not load Parts for Product ${builder.id}.`);
    }
    const sum = frozenSum(parts);
    results.push({
      builder_product_id: builder.id,
      estimate_id: builder.estimate_id,
      module_key: builder.module_key,
      frozen_product_total: num(builder.frozen_cost),
      active_frozen_part_sum: sum,
      delta: sum - num(builder.frozen_cost),
      active_part_count: activeParts(parts).length,
      legacy_bom_reconciled: !!builder.legacy_bom_reconciled,
      reconciled: moneyClose(sum, num(builder.frozen_cost)),
    });
  }
  return {
    product_count: results.length,
    mismatch_count: results.filter((row) => !row.reconciled).length,
    nonzero_product_count: results.filter((row) => Math.abs(row.frozen_product_total) > TOLERANCE).length,
    results,
  };
}

export async function runLegacyBomReconcile() {
  const me = await base44.auth.me().catch(() => null);
  if (me?.role !== "admin") return { ran: false, reason: "admin_only" };

  const rows = await migrationRows();
  if ((rows || []).some((row) => row.source_id === COMPLETE_SENTINEL)) {
    return { ran: false, reason: "complete", verification: await verifyLegacyBomReconciliation() };
  }

  const completedIds = new Set((rows || []).filter((row) => row.source_entity === "BuilderProduct").map((row) => row.source_id));
  const builders = await base44.entities.BuilderProduct.filter({ price_state: "legacy_frozen" });
  let processed = 0;
  let aggregatePartsCreated = 0;
  let generatedPartsDeactivated = 0;

  for (const builder of builders || []) {
    if (completedIds.has(builder.id) || builder.legacy_bom_reconciled) continue;
    const parts = await base44.entities.BuilderPart.filter({ builder_product_id: builder.id });
    if (!Array.isArray(parts)) {
      throw new Error(`Legacy BOM reconciliation could not load Parts for Product ${builder.id}.`);
    }
    const frozenTotal = num(builder.frozen_cost);

    let result = { mode: "zero_frozen_product", created: 0, deactivated: 0 };
    if (Math.abs(frozenTotal) <= TOLERANCE) {
      if (!moneyClose(frozenSum(parts), 0)) {
        throw new Error(`Zero-price legacy Product ${builder.id} unexpectedly has ${frozenSum(parts)} of active frozen Parts.`);
      }
    } else {
      if (!builder.source_entity || !builder.source_project_id) {
        throw new Error(`Non-zero legacy Product ${builder.id} has no source project for authoritative BOM reconciliation.`);
      }
      const project = await base44.entities[builder.source_entity].get(builder.source_project_id).catch(() => null);
      if (!project) throw new Error(`Could not load ${builder.source_entity} ${builder.source_project_id} for Product ${builder.id}.`);
      result = await reconcileSupportedBuilder(builder, project, parts);
    }

    await markBuilderComplete(builder, result);
    processed += 1;
    aggregatePartsCreated += result.created || 0;
    generatedPartsDeactivated += result.deactivated || 0;
  }

  const verification = await verifyLegacyBomReconciliation();
  if (verification.mismatch_count > 0) {
    throw new Error(`Legacy BOM reconciliation verification still has ${verification.mismatch_count} mismatched Product(s).`);
  }

  await base44.entities.LegacyMigrationMap.create({
    source_app_id: APP_ID,
    source_entity: "BuilderProduct",
    source_id: COMPLETE_SENTINEL,
    target_entity: "BuilderProduct",
    target_id: COMPLETE_SENTINEL,
    source_created_date: "",
    source_updated_date: "",
    migration_batch: LEGACY_BOM_RECONCILE_BATCH,
    notes: JSON.stringify({
      completed_at: nowIso(),
      processed_products: processed,
      total_legacy_products: verification.product_count,
      nonzero_legacy_products: verification.nonzero_product_count,
      mismatch_count: verification.mismatch_count,
      aggregate_parts_created: aggregatePartsCreated,
      generated_parts_deactivated: generatedPartsDeactivated,
      behavior: "Historical frozen Product prices were not changed. Active frozen BOM Parts were reconciled to authoritative saved legacy Builder cost categories; detailed Parts were retained when category totals agreed.",
    }),
  });

  return {
    ran: true,
    processed,
    aggregatePartsCreated,
    generatedPartsDeactivated,
    verification,
  };
}
