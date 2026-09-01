import { base44 } from "@/api/base44Client";
import { getModule, getModuleLabel, MODULE_TOTAL_FIELD } from "@/components/estimator/moduleRegistry";
import { acceptBuilderPartPrices, syncBuilderParts } from "./partSync";
import { acceptedCustomerUnitPrice, hasNumericValue, liveCustomerUnitPrice, sourceProjectEconomics } from "../customerPricing";

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

  if (line?.module_key === "painting") {
    return num(record.total_paint_mask_cost)
      + num(record.total_liquid_paint_and_supplies_cost)
      + num(record.total_labor_cost);
  }

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
  const sourceTotal = sourceProjectTotal(line, source);
  const acceptedTotal = num(line.total_snapshot);
  const acceptedCustomerPrice = acceptedCustomerUnitPrice(line);
  const { builderName, clientName } = productIdentity(line);
  const sourceEntity = getModule(line.module_key)?.entity || "";
  const timestamp = nowIso();
  let builderProduct = await findBuilderProduct(line, estimateId);
  const preserveLegacyEconomics = !isNew && (!builderProduct || builderProduct.price_state === "legacy_frozen");
  const economics = preserveLegacyEconomics
    ? { internalCost: sourceTotal, customerPrice: liveCustomerUnitPrice(line) }
    : sourceProjectEconomics(line.module_key, source, sourceTotal);
  const liveTotal = economics.internalCost;
  const liveCustomerPrice = economics.customerPrice;

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
      product_notes: line.product_notes || "",
      quantity: num(line.customer_quantity, 1),
      status: line.section_status === "complete" ? "complete" : "in_progress",
      builder_version: 1,
      builder_snapshot: source || {},
      builder_snapshot_at: timestamp,
      builder_snapshot_source_updated_date: source?.updated_date || line.updated_date_snapshot || "",
      builder_snapshot_hash: snapshotHash(source || {}),
      frozen_cost: isNew ? 0 : acceptedTotal,
      frozen_customer_price: isNew ? 0 : acceptedCustomerPrice,
      current_recalculated_cost: liveTotal,
      price_state: isNew ? "unchecked" : "legacy_frozen",
      price_delta: isNew ? liveTotal : liveTotal - acceptedTotal,
      price_delta_percent: !isNew && acceptedTotal ? ((liveTotal - acceptedTotal) / acceptedTotal) * 100 : 0,
      price_recalc_required: false,
      price_recalc_reason: "",
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
    const frozenCustomer = hasNumericValue(builderProduct.frozen_customer_price)
      ? num(builderProduct.frozen_customer_price)
      : acceptedCustomerPrice;
    const awaitingInitialFreeze = builderProduct.price_state === "unchecked" && frozen === 0;
    const nextState = builderProduct.price_state === "legacy_frozen"
      ? "legacy_frozen"
      : awaitingInitialFreeze
        ? "unchecked"
        : Math.abs(liveTotal - frozen) > 0.005 || Math.abs(liveCustomerPrice - frozenCustomer) > 0.005
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
      product_notes: line.product_notes ?? builderProduct.product_notes ?? "",
      quantity: num(line.customer_quantity, 1),
      status: line.section_status === "complete" ? "complete" : "in_progress",
      current_recalculated_cost: liveTotal,
      price_state: nextState,
      price_delta: liveTotal - frozen,
      price_delta_percent: frozen ? ((liveTotal - frozen) / frozen) * 100 : 0,
      price_recalc_required: builderProduct.price_recalc_required || false,
      price_recalc_reason: builderProduct.price_recalc_reason || "",
      last_price_check_at: timestamp,
    });
    builderProduct = { ...builderProduct, current_recalculated_cost: liveTotal, price_state: nextState };
  }

  let partSummary = {
    partCount: num(builderProduct.part_count),
    detachedCount: num(builderProduct.detached_part_count),
    changedCount: 0,
    newPartCount: 0,
    removedPartCount: 0,
    recalcRequired: !!builderProduct.price_recalc_required,
    recalcReason: builderProduct.price_recalc_reason || "",
    usesDirectLiveReprice: false,
    currentPartsTotal: 0,
    frozenPartsTotal: 0,
    currentMarkupTotal: 0,
    frozenMarkupTotal: 0,
    manualAddonFrozenTotal: 0,
    manualAddonCurrentTotal: 0,
  };
  let effectiveLiveTotal = liveTotal;
  let effectiveLiveCustomerPrice = preserveLegacyEconomics ? liveCustomerPrice : economics.customerPrice;
  const preserveReconciledLegacyBom =
    builderProduct?.price_state === "legacy_frozen" && builderProduct?.legacy_bom_reconciled === true;
  if (source && builderProduct?.id && !preserveReconciledLegacyBom) {
    partSummary = await syncBuilderParts({
      builderProduct,
      sourceProject: source,
      acceptPrices: false,
      legacyMode: builderProduct.price_state === "legacy_frozen",
    });
    if (partSummary.usesDirectLiveReprice) {
      const manualAddonCurrent = num(partSummary.manualAddonCurrentTotal);
      const liveInternalFromParts = num(partSummary.currentPartsTotal) - num(partSummary.currentMarkupTotal);
      const liveBuilderCoreCost = liveInternalFromParts - manualAddonCurrent;
      const markupPercent = num(source?.markup_percent);
      effectiveLiveTotal = liveInternalFromParts;
      effectiveLiveCustomerPrice = liveBuilderCoreCost * (1 + markupPercent / 100) + manualAddonCurrent;
    } else {
      effectiveLiveTotal = liveTotal + num(partSummary.manualAddonCurrentTotal);
      effectiveLiveCustomerPrice = preserveLegacyEconomics
        ? liveCustomerPrice
        : economics.customerPrice + num(partSummary.manualAddonCurrentTotal);
    }
    const frozenAfterSync = num(builderProduct.frozen_cost, acceptedTotal);
    const frozenCustomerAfterSync = hasNumericValue(builderProduct.frozen_customer_price)
      ? num(builderProduct.frozen_customer_price)
      : acceptedCustomerPrice;
    const productPriceState = partSummary.detachedCount > 0
      ? "detached_parts"
      : builderProduct.price_state === "legacy_frozen"
        ? "legacy_frozen"
        : partSummary.changedCount > 0 ||
            Math.abs(effectiveLiveTotal - frozenAfterSync) > 0.005 ||
            Math.abs(effectiveLiveCustomerPrice - frozenCustomerAfterSync) > 0.005
          ? "changed"
          : "current";
    await base44.entities.BuilderProduct.update(builderProduct.id, {
      part_count: partSummary.partCount,
      detached_part_count: partSummary.detachedCount,
      needs_reattach_review: partSummary.detachedCount > 0,
      current_recalculated_cost: effectiveLiveTotal,
      price_state: productPriceState,
      price_delta: effectiveLiveTotal - frozenAfterSync,
      price_delta_percent: frozenAfterSync ? ((effectiveLiveTotal - frozenAfterSync) / frozenAfterSync) * 100 : 0,
      price_recalc_required: !!partSummary.recalcRequired,
      price_recalc_reason: partSummary.recalcReason || "",
    });
    builderProduct = {
      ...builderProduct,
      part_count: partSummary.partCount,
      detached_part_count: partSummary.detachedCount,
      needs_reattach_review: partSummary.detachedCount > 0,
      current_recalculated_cost: effectiveLiveTotal,
      price_state: productPriceState,
      price_delta: effectiveLiveTotal - frozenAfterSync,
      price_delta_percent: frozenAfterSync ? ((effectiveLiveTotal - frozenAfterSync) / frozenAfterSync) * 100 : 0,
      price_recalc_required: !!partSummary.recalcRequired,
      price_recalc_reason: partSummary.recalcReason || "",
    };
  }

  const frozenCost = isNew ? num(builderProduct.frozen_cost) : acceptedTotal;
  const frozenCustomerPrice = hasNumericValue(builderProduct.frozen_customer_price)
    ? num(builderProduct.frozen_customer_price)
    : acceptedCustomerPrice;
  const nextLine = {
    ...line,
    line_id: lineId,
    builder_product_id: builderProduct.id,
    builder_name: builderName,
    client_product_name: clientName,
    product_category: line.product_category || builderProduct.product_category || "",
    product_notes: line.product_notes ?? builderProduct.product_notes ?? "",
    total_snapshot: frozenCost,
    live_total_snapshot: effectiveLiveTotal,
    customer_price_snapshot: frozenCustomerPrice,
    live_customer_price_snapshot: effectiveLiveCustomerPrice,
    price_state: builderProduct.price_state || (isNew ? "unchecked" : "legacy_frozen"),
    price_recalc_required: !!builderProduct.price_recalc_required,
    price_recalc_reason: builderProduct.price_recalc_reason || "",
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

export async function recordBuilderSave({ estimateId, line, sourceProject, liveTotal, internalCost, customerPrice }) {
  if (!estimateId || !line) return line;
  const estimate = await base44.entities.AllInOneEstimate.get(estimateId);
  const currentLine = (estimate.line_items || []).find(
    (item) => item.builder_product_id === line.builder_product_id || item.project_id === line.project_id
  ) || line;

  const ensured = await ensureBuilderProductForLine({ estimate, line: currentLine, isNew: !currentLine.builder_product_id });
  const builder = ensured.builderProduct;
  const timestamp = nowIso();
  const sourceTotal = num(liveTotal, sourceProjectTotal(currentLine, sourceProject));
  const economics = sourceProjectEconomics(currentLine.module_key, sourceProject, sourceTotal);
  const nextLiveTotal = hasNumericValue(internalCost) ? num(internalCost) : economics.internalCost;
  const nextLiveCustomerPrice = hasNumericValue(customerPrice) ? num(customerPrice) : economics.customerPrice;
  const previousFrozenTotal = num(builder?.frozen_cost, num(currentLine.total_snapshot));
  const previousFrozenCustomerPrice = hasNumericValue(builder?.frozen_customer_price)
    ? num(builder.frozen_customer_price)
    : acceptedCustomerUnitPrice(currentLine);
  const wantsInitialFreeze = builder?.price_state === "unchecked" && previousFrozenTotal === 0;

  let partSummary = {
    partCount: num(builder?.part_count),
    detachedCount: num(builder?.detached_part_count),
    changedCount: 0,
    newPartCount: 0,
    removedPartCount: 0,
    recalcRequired: false,
    recalcReason: "",
    usesDirectLiveReprice: false,
    currentPartsTotal: 0,
    frozenPartsTotal: 0,
    currentMarkupTotal: 0,
    frozenMarkupTotal: 0,
    manualAddonFrozenTotal: 0,
    manualAddonCurrentTotal: 0,
  };

  if (builder) {
    // Always detect first without accepting prices. A missing inventory link must
    // block the initial freeze just like it blocks later Update Price actions.
    partSummary = await syncBuilderParts({
      builderProduct: builder,
      sourceProject: sourceProject || {},
      acceptPrices: false,
      legacyMode: builder.price_state === "legacy_frozen",
      // This path runs only after the authoritative Builder calculator has
      // produced and saved sourceProject/liveTotal. Mark the current inventory
      // pricing used by that calculation so Update Price can safely accept it.
      builderRecalculated: true,
    });
  }

  const effectiveLiveTotal = nextLiveTotal + num(partSummary.manualAddonCurrentTotal);
  const effectiveLiveCustomerPrice = nextLiveCustomerPrice + num(partSummary.manualAddonCurrentTotal);
  const canInitialFreeze = wantsInitialFreeze && partSummary.detachedCount === 0;
  const acceptedTotal = canInitialFreeze ? effectiveLiveTotal : previousFrozenTotal;
  const calculatedState = canInitialFreeze
    ? "current"
    : partSummary.changedCount > 0 ||
        Math.abs(effectiveLiveTotal - acceptedTotal) > 0.005 ||
        Math.abs(effectiveLiveCustomerPrice - previousFrozenCustomerPrice) > 0.005
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
  const finalAcceptedTotal = initialFreezeCompleted ? effectiveLiveTotal : previousFrozenTotal;
  const finalAcceptedCustomerPrice = initialFreezeCompleted ? effectiveLiveCustomerPrice : previousFrozenCustomerPrice;
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
      frozen_customer_price: finalAcceptedCustomerPrice,
      current_recalculated_cost: effectiveLiveTotal,
      price_state: finalProductState,
      price_delta: effectiveLiveTotal - finalAcceptedTotal,
      price_delta_percent: finalAcceptedTotal ? ((effectiveLiveTotal - finalAcceptedTotal) / finalAcceptedTotal) * 100 : 0,
      // The authoritative Builder calculator just ran, so any earlier stale-catalog
      // block is now resolved even if the user has not accepted the new price yet.
      price_recalc_required: false,
      price_recalc_reason: "",
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
        new_customer_price: finalAcceptedCustomerPrice,
        changed_parts: initialPartChanges,
        builder_snapshot_before: builder.builder_snapshot || {},
        builder_snapshot_after: sourceProject || {},
        price_snapshot_before: { total: 0 },
        price_snapshot_after: { total: finalAcceptedTotal, customer_price: finalAcceptedCustomerPrice },
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
      live_total_snapshot: effectiveLiveTotal,
      customer_price_snapshot: finalAcceptedCustomerPrice,
      live_customer_price_snapshot: effectiveLiveCustomerPrice,
      price_state: finalProductState,
      price_recalc_required: false,
      price_recalc_reason: "",
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

  if (partAcceptance.recalcRequired) {
    const timestamp = nowIso();
    const reason = partAcceptance.recalcReason || "Master Inventory changed after this Builder was last calculated. Reopen and save the Builder before accepting Update Price.";
    await base44.entities.BuilderProduct.update(builder.id, {
      price_state: "changed",
      price_recalc_required: true,
      price_recalc_reason: reason,
      last_price_check_at: timestamp,
    });
    const blockedLines = (estimate.line_items || []).map((item) =>
      item.builder_product_id === builder.id
        ? {
            ...item,
            price_state: "changed",
            price_recalc_required: true,
            price_recalc_reason: reason,
            last_price_check_at: timestamp,
          }
        : item
    );
    await base44.entities.AllInOneEstimate.update(estimateId, { line_items: blockedLines });
    return {
      blocked: true,
      reason: "recalc_required",
      recalcReason: reason,
      recalcParts: partAcceptance.recalcParts || [],
      line: blockedLines.find((item) => item.builder_product_id === builder.id) || line,
    };
  }

  const timestamp = nowIso();
  const currentEstimateLine = (estimate.line_items || []).find((item) => item.builder_product_id === builder.id) || line;
  const previousTotal = num(builder.frozen_cost, num(currentEstimateLine.total_snapshot));
  const nextTotal = num(builder.current_recalculated_cost, num(currentEstimateLine.live_total_snapshot, previousTotal));
  const previousCustomerPrice = hasNumericValue(builder.frozen_customer_price)
    ? num(builder.frozen_customer_price)
    : acceptedCustomerUnitPrice(currentEstimateLine);
  const nextCustomerPrice = liveCustomerUnitPrice(currentEstimateLine);
  const revisions = await base44.entities.BuilderPriceRevision.filter({ builder_product_id: builder.id });
  const revisionNumber = Math.max(0, ...(revisions || []).map((r) => num(r.revision_number))) + 1;

  await base44.entities.BuilderPriceRevision.create({
    builder_product_id: builder.id,
    estimate_id: estimateId,
    revision_number: revisionNumber,
    reason: "update_price",
    previous_total_cost: previousTotal,
    new_total_cost: nextTotal,
    previous_customer_price: previousCustomerPrice,
    new_customer_price: nextCustomerPrice,
    changed_parts: partAcceptance.changedParts || [],
    builder_snapshot_before: builder.builder_snapshot || {},
    builder_snapshot_after: builder.builder_snapshot || {},
    price_snapshot_before: { total: previousTotal, customer_price: previousCustomerPrice },
    price_snapshot_after: { total: nextTotal, customer_price: nextCustomerPrice },
    notes: note,
  });

  await base44.entities.BuilderProduct.update(builder.id, {
    frozen_cost: nextTotal,
    frozen_customer_price: nextCustomerPrice,
    price_state: "current",
    price_delta: 0,
    price_delta_percent: 0,
    price_recalc_required: false,
    price_recalc_reason: "",
    detached_part_count: 0,
    needs_reattach_review: false,
    part_count: partAcceptance.activePartCount ?? builder.part_count,
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
          customer_price_snapshot: nextCustomerPrice,
          live_customer_price_snapshot: nextCustomerPrice,
          price_state: "current",
          price_recalc_required: false,
          price_recalc_reason: "",
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
