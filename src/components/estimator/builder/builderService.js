import { base44 } from "@/api/base44Client";
import { getModule, getModuleLabel, MODULE_TOTAL_FIELD } from "@/components/estimator/moduleRegistry";
import { acceptBuilderPartPrices, syncBuilderParts } from "./partSync";

const num = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const nowIso = () => new Date().toISOString();

export const makeStableId = (prefix = "id") => {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
};

function stripSystemFields(value) {
  if (Array.isArray(value)) return value.map(stripSystemFields);
  if (!value || typeof value !== "object") return value;
  const result = {};
  Object.keys(value)
    .sort()
    .forEach((key) => {
      if (["created_by", "created_by_id"].includes(key)) return;
      result[key] = stripSystemFields(value[key]);
    });
  return result;
}

export function stableStringify(value) {
  return JSON.stringify(stripSystemFields(value ?? null));
}

export function snapshotHash(value) {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export async function getSourceProject(line) {
  const mod = getModule(line?.module_key);
  if (!mod || !line?.project_id) return null;
  return base44.entities[mod.entity].get(line.project_id).catch(() => null);
}

export function sourceProjectTotal(line, record) {
  if (!record) return num(line?.live_total_snapshot, num(line?.total_snapshot));
  const totalField = MODULE_TOTAL_FIELD[line?.module_key];
  if (totalField) return num(record[totalField]);

  if (line?.module_key === "foundation") {
    const direct = num(record.grand_total, NaN);
    if (Number.isFinite(direct)) return direct;
    const known = [
      "total_concrete_cost",
      "total_rebar_cost",
      "total_excavation_cost",
      "total_forming_materials_cost",
      "total_labor_cost",
      "total_wall_cost",
      "total_pole_cost",
      "total_pole_painting_cost",
      "total_equipment_cost",
      "total_wall_cap_cost",
      "total_signage_cabinet_cost",
      "total_landscape_cost",
    ];
    return known.reduce((sum, key) => sum + num(record[key]), 0);
  }

  return num(record.total_cost, num(line?.total_snapshot));
}

async function findBuilderProduct(line, estimateId) {
  if (line?.builder_product_id) {
    const direct = await base44.entities.BuilderProduct.get(line.builder_product_id).catch(() => null);
    if (direct) return direct;
  }

  if (line?.project_id) {
    const bySource = await base44.entities.BuilderProduct.filter({
      estimate_id: estimateId,
      source_project_id: line.project_id,
    });
    if (bySource?.[0]) return bySource[0];
  }

  if (line?.line_id) {
    const byLine = await base44.entities.BuilderProduct.filter({
      estimate_id: estimateId,
      estimate_line_id: line.line_id,
    });
    if (byLine?.[0]) return byLine[0];
  }

  return null;
}

function productIdentity(line) {
  const builderName = line?.builder_name || getModuleLabel(line?.module_key) || line?.project_name || "Product";
  const clientName = line?.client_product_name || line?.project_name || builderName;
  return { builderName, clientName };
}

export async function ensureBuilderProductForLine({ estimate, line, isNew = false }) {
  const estimateId = estimate?.id;
  if (!estimateId || !line) return { line, builderProduct: null, changed: false };

  const lineId = line.line_id || makeStableId("line");
  const source = await getSourceProject(line);
  const liveTotal = sourceProjectTotal(line, source);
  const acceptedTotal = num(line.total_snapshot);
  const { builderName, clientName } = productIdentity(line);
  const sourceEntity = getModule(line.module_key)?.entity || "";
  const timestamp = nowIso();
  let builderProduct = await findBuilderProduct(line, estimateId);

  if (!builderProduct) {
    builderProduct = await base44.entities.BuilderProduct.create({
      estimate_id: estimateId,
      estimate_line_id: lineId,
      module_key: line.module_key,
      source_entity: sourceEntity,
      source_project_id: line.project_id || "",
      builder_name: builderName,
      client_product_name: clientName,
      client_description: line.customer_description || "",
      product_category: line.product_category || "",
      quantity: num(line.customer_quantity, 1),
      status: line.section_status === "complete" ? "complete" : "in_progress",
      builder_version: 1,
      builder_snapshot: source || {},
      builder_snapshot_at: timestamp,
      builder_snapshot_source_updated_date: source?.updated_date || line.updated_date_snapshot || "",
      builder_snapshot_hash: snapshotHash(source || {}),
      frozen_cost: isNew ? 0 : acceptedTotal,
      frozen_customer_price: isNew ? 0 : acceptedTotal,
      current_recalculated_cost: liveTotal,
      price_state: isNew ? "unchecked" : "legacy_frozen",
      price_delta: isNew ? liveTotal : liveTotal - acceptedTotal,
      price_delta_percent: !isNew && acceptedTotal ? ((liveTotal - acceptedTotal) / acceptedTotal) * 100 : 0,
      last_price_check_at: timestamp,
      part_count: 0,
      group_count: 0,
      detached_part_count: 0,
      needs_reattach_review: false,
      is_active: true,
      notes: isNew
        ? "Builder Product created with estimate product. First priced save creates the initial frozen revision."
        : "Backfilled from an existing estimate line. Existing total_snapshot remains the authoritative legacy frozen price.",
    });
  } else {
    const frozen = num(builderProduct.frozen_cost, acceptedTotal);
    const awaitingInitialFreeze = builderProduct.price_state === "unchecked" && frozen === 0;
    const nextState = builderProduct.price_state === "legacy_frozen"
      ? "legacy_frozen"
      : awaitingInitialFreeze
        ? "unchecked"
        : Math.abs(liveTotal - frozen) > 0.005
          ? "changed"
          : "current";
    await base44.entities.BuilderProduct.update(builderProduct.id, {
      estimate_line_id: lineId,
      module_key: line.module_key,
      source_entity: sourceEntity,
      source_project_id: line.project_id || "",
      builder_name: builderName,
      client_product_name: clientName,
      client_description: line.customer_description || "",
      product_category: line.product_category || builderProduct.product_category || "",
      quantity: num(line.customer_quantity, 1),
      status: line.section_status === "complete" ? "complete" : "in_progress",
      current_recalculated_cost: liveTotal,
      price_state: nextState,
      price_delta: liveTotal - frozen,
      price_delta_percent: frozen ? ((liveTotal - frozen) / frozen) * 100 : 0,
      last_price_check_at: timestamp,
    });
    builderProduct = { ...builderProduct, current_recalculated_cost: liveTotal, price_state: nextState };
  }

  let partSummary = {
    partCount: num(builderProduct.part_count),
    detachedCount: num(builderProduct.detached_part_count),
    changedCount: 0,
  };
  if (source && builderProduct?.id) {
    partSummary = await syncBuilderParts({
      builderProduct,
      sourceProject: source,
      acceptPrices: false,
      legacyMode: builderProduct.price_state === "legacy_frozen",
    });
    const productPriceState = partSummary.detachedCount > 0
      ? "detached_parts"
      : builderProduct.price_state;
    await base44.entities.BuilderProduct.update(builderProduct.id, {
      part_count: partSummary.partCount,
      detached_part_count: partSummary.detachedCount,
      needs_reattach_review: partSummary.detachedCount > 0,
      price_state: productPriceState,
    });
    builderProduct = {
      ...builderProduct,
      part_count: partSummary.partCount,
      detached_part_count: partSummary.detachedCount,
      needs_reattach_review: partSummary.detachedCount > 0,
      price_state: productPriceState,
    };
  }

  const frozenCost = isNew ? num(builderProduct.frozen_cost) : acceptedTotal;
  const nextLine = {
    ...line,
    line_id: lineId,
    builder_product_id: builderProduct.id,
    builder_name: builderName,
    client_product_name: clientName,
    product_category: line.product_category || builderProduct.product_category || "",
    total_snapshot: frozenCost,
    live_total_snapshot: liveTotal,
    price_state: builderProduct.price_state || (isNew ? "unchecked" : "legacy_frozen"),
    detached_part_count: num(builderProduct.detached_part_count),
    needs_reattach_review: !!builderProduct.needs_reattach_review,
    last_price_check_at: timestamp,
    updated_date_snapshot: source?.updated_date || line.updated_date_snapshot,
  };

  return {
    line: nextLine,
    builderProduct,
    changed: stableStringify(nextLine) !== stableStringify(line),
  };
}

export async function ensureEstimateBuilderProducts(estimate) {
  if (!estimate?.id) return estimate;
  const original = estimate.line_items || [];
  const lineItems = [];
  let changed = false;

  for (const line of original) {
    const result = await ensureBuilderProductForLine({ estimate, line, isNew: false });
    lineItems.push(result.line);
    changed = changed || result.changed;
  }

  if (changed) {
    await base44.entities.AllInOneEstimate.update(estimate.id, { line_items: lineItems });
  }
  return { ...estimate, line_items: lineItems };
}

export async function recordBuilderSave({ estimateId, line, sourceProject, liveTotal }) {
  if (!estimateId || !line) return line;
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  const currentLine = (estimate.line_items || []).find(
    (item) => item.builder_product_id === line.builder_product_id || item.project_id === line.project_id
  ) || line;

  const ensured = await ensureBuilderProductForLine({ estimate, line: currentLine, isNew: !currentLine.builder_product_id });
  const builder = ensured.builderProduct;
  const timestamp = nowIso();
  const nextLiveTotal = num(liveTotal, sourceProjectTotal(currentLine, sourceProject));
  const previousFrozenTotal = num(builder?.frozen_cost, num(currentLine.total_snapshot));
  const wantsInitialFreeze = builder?.price_state === "unchecked" && previousFrozenTotal === 0;

  let partSummary = {
    partCount: num(builder?.part_count),
    detachedCount: num(builder?.detached_part_count),
    changedCount: 0,
  };

  if (builder) {
    // Always detect first without accepting prices. A missing inventory link must
    // block the initial freeze just like it blocks later Update Price actions.
    partSummary = await syncBuilderParts({
      builderProduct: builder,
      sourceProject: sourceProject || {},
      acceptPrices: false,
      legacyMode: builder.price_state === "legacy_frozen",
    });
  }

  const canInitialFreeze = wantsInitialFreeze && partSummary.detachedCount === 0;
  const acceptedTotal = canInitialFreeze ? nextLiveTotal : previousFrozenTotal;
  const calculatedState = canInitialFreeze
    ? "current"
    : Math.abs(nextLiveTotal - acceptedTotal) > 0.005
      ? "changed"
      : "current";
  const productState = partSummary.detachedCount > 0
    ? "detached_parts"
    : builder?.price_state === "legacy_frozen"
      ? "legacy_frozen"
      : calculatedState;

  let initialPartChanges = [];
  if (builder && canInitialFreeze) {
    const partAcceptance = await acceptBuilderPartPrices(builder.id);
    if (partAcceptance.detachedCount > 0) {
      // Defensive second guard in case the inventory changed between detection
      // and acceptance. Keep the product unfrozen rather than accepting partial data.
      partSummary.detachedCount = partAcceptance.detachedCount;
    } else {
      initialPartChanges = partAcceptance.changedParts || [];
    }
  }

  const initialFreezeCompleted = canInitialFreeze && partSummary.detachedCount === 0;
  const finalAcceptedTotal = initialFreezeCompleted ? nextLiveTotal : previousFrozenTotal;
  const finalProductState = partSummary.detachedCount > 0
    ? "detached_parts"
    : initialFreezeCompleted
      ? "current"
      : productState;

  if (builder) {
    const nextRevision = num(builder.builder_version, 1) + (initialFreezeCompleted ? 1 : 0);
    await base44.entities.BuilderProduct.update(builder.id, {
      builder_snapshot: sourceProject || {},
      builder_snapshot_at: timestamp,
      builder_snapshot_source_updated_date: sourceProject?.updated_date || timestamp,
      builder_snapshot_hash: snapshotHash(sourceProject || {}),
      frozen_cost: finalAcceptedTotal,
      frozen_customer_price: initialFreezeCompleted
        ? finalAcceptedTotal
        : num(builder.frozen_customer_price, finalAcceptedTotal),
      current_recalculated_cost: nextLiveTotal,
      price_state: finalProductState,
      price_delta: nextLiveTotal - finalAcceptedTotal,
      price_delta_percent: finalAcceptedTotal ? ((nextLiveTotal - finalAcceptedTotal) / finalAcceptedTotal) * 100 : 0,
      last_price_check_at: timestamp,
      last_price_update_at: initialFreezeCompleted ? timestamp : builder.last_price_update_at,
      builder_version: nextRevision,
      part_count: partSummary.partCount,
      detached_part_count: partSummary.detachedCount,
      needs_reattach_review: partSummary.detachedCount > 0,
    });

    if (initialFreezeCompleted) {
      await base44.entities.BuilderPriceRevision.create({
        builder_product_id: builder.id,
        estimate_id: estimateId,
        revision_number: 1,
        reason: "initial_freeze",
        previous_total_cost: 0,
        new_total_cost: finalAcceptedTotal,
        previous_customer_price: 0,
        new_customer_price: finalAcceptedTotal,
        changed_parts: initialPartChanges,
        builder_snapshot_before: builder.builder_snapshot || {},
        builder_snapshot_after: sourceProject || {},
        price_snapshot_before: { total: 0 },
        price_snapshot_after: { total: finalAcceptedTotal },
        notes: "Initial accepted/frozen product price.",
      });
    }
  }

  const nextLines = (estimate.line_items || []).map((item) => {
    if (item.project_id !== currentLine.project_id && item.builder_product_id !== builder?.id) return item;
    return {
      ...item,
      line_id: item.line_id || ensured.line.line_id,
      builder_product_id: builder?.id || item.builder_product_id,
      builder_name: item.builder_name || ensured.line.builder_name,
      client_product_name: item.client_product_name || ensured.line.client_product_name,
      total_snapshot: finalAcceptedTotal,
      live_total_snapshot: nextLiveTotal,
      price_state: finalProductState,
      detached_part_count: partSummary.detachedCount,
      needs_reattach_review: partSummary.detachedCount > 0,
      last_price_check_at: timestamp,
      last_price_update_at: initialFreezeCompleted ? timestamp : item.last_price_update_at,
      updated_date_snapshot: sourceProject?.updated_date || timestamp,
    };
  });
  await base44.entities.AllInOneEstimate.update(estimateId, { line_items: nextLines });
  return nextLines.find((item) => item.project_id === currentLine.project_id) || currentLine;
}

export async function deleteBuilderProductCascade(builderProductId) {
  if (!builderProductId) return;
  const [parts, groups, revisions] = await Promise.all([
    base44.entities.BuilderPart.filter({ builder_product_id: builderProductId }).catch(() => []),
    base44.entities.BuilderPartGroup.filter({ builder_product_id: builderProductId }).catch(() => []),
    base44.entities.BuilderPriceRevision.filter({ builder_product_id: builderProductId }).catch(() => []),
  ]);
  await Promise.all((parts || []).map((row) => base44.entities.BuilderPart.delete(row.id).catch(() => null)));
  await Promise.all((groups || []).map((row) => base44.entities.BuilderPartGroup.delete(row.id).catch(() => null)));
  await Promise.all((revisions || []).map((row) => base44.entities.BuilderPriceRevision.delete(row.id).catch(() => null)));
  await base44.entities.BuilderProduct.delete(builderProductId).catch(() => null);
}

export async function acceptBuilderPrice({ estimateId, line, note = "Price updated from current builder calculation." }) {
  if (!estimateId || !line?.builder_product_id) return null;
  const [estimate, builder] = await Promise.all([
    base44.entities.AllInOneEstimate.get(estimateId),
    base44.entities.BuilderProduct.get(line.builder_product_id),
  ]);
  if (!estimate || !builder) return null;

  // Part prices are accepted first because this call performs the all-or-nothing
  // detached-link guard. If anything is detached, product pricing remains frozen.
  const partAcceptance = await acceptBuilderPartPrices(builder.id);
  if (partAcceptance.detachedCount > 0) {
    await base44.entities.BuilderProduct.update(builder.id, {
      price_state: "detached_parts",
      detached_part_count: partAcceptance.detachedCount,
      needs_reattach_review: true,
      last_price_check_at: nowIso(),
    });
    const blockedLines = (estimate.line_items || []).map((item) =>
      item.builder_product_id === builder.id
        ? {
            ...item,
            price_state: "detached_parts",
            detached_part_count: partAcceptance.detachedCount,
            needs_reattach_review: true,
            last_price_check_at: nowIso(),
          }
        : item
    );
    await base44.entities.AllInOneEstimate.update(estimateId, { line_items: blockedLines });
    return {
      blocked: true,
      reason: "detached_parts",
      detachedCount: partAcceptance.detachedCount,
      detachedParts: partAcceptance.detachedParts || [],
      line: blockedLines.find((item) => item.builder_product_id === builder.id) || line,
    };
  }

  const timestamp = nowIso();
  const previousTotal = num(builder.frozen_cost, num(line.total_snapshot));
  const nextTotal = num(builder.current_recalculated_cost, num(line.live_total_snapshot, previousTotal));
  const revisions = await base44.entities.BuilderPriceRevision.filter({ builder_product_id: builder.id });
  const revisionNumber = Math.max(0, ...(revisions || []).map((r) => num(r.revision_number))) + 1;

  await base44.entities.BuilderPriceRevision.create({
    builder_product_id: builder.id,
    estimate_id: estimateId,
    revision_number: revisionNumber,
    reason: "update_price",
    previous_total_cost: previousTotal,
    new_total_cost: nextTotal,
    previous_customer_price: num(builder.frozen_customer_price, previousTotal),
    new_customer_price: nextTotal,
    changed_parts: partAcceptance.changedParts || [],
    builder_snapshot_before: builder.builder_snapshot || {},
    builder_snapshot_after: builder.builder_snapshot || {},
    price_snapshot_before: { total: previousTotal },
    price_snapshot_after: { total: nextTotal },
    notes: note,
  });

  await base44.entities.BuilderProduct.update(builder.id, {
    frozen_cost: nextTotal,
    frozen_customer_price: nextTotal,
    price_state: "current",
    price_delta: 0,
    price_delta_percent: 0,
    detached_part_count: 0,
    needs_reattach_review: false,
    last_price_update_at: timestamp,
    last_price_update_note: note,
    last_price_check_at: timestamp,
    builder_version: num(builder.builder_version, 1) + 1,
  });

  const lineItems = (estimate.line_items || []).map((item) =>
    item.builder_product_id === builder.id
      ? {
          ...item,
          total_snapshot: nextTotal,
          live_total_snapshot: nextTotal,
          price_state: "current",
          detached_part_count: 0,
          needs_reattach_review: false,
          last_price_update_at: timestamp,
          last_price_check_at: timestamp,
        }
      : item
  );
  await base44.entities.AllInOneEstimate.update(estimateId, { line_items: lineItems });
  return {
    blocked: false,
    changedParts: partAcceptance.changedParts || [],
    line: lineItems.find((item) => item.builder_product_id === builder.id) || null,
  };
}
