export class FleetInventoryQuantityConflictError extends Error {
  code = 'FLEET_INVENTORY_QUANTITY_CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'FleetInventoryQuantityConflictError';
  }
}

export class FleetInventoryQuantityAmbiguousError extends Error {
  code = 'FLEET_INVENTORY_QUANTITY_AMBIGUOUS';
  constructor(message: string) {
    super(message);
    this.name = 'FleetInventoryQuantityAmbiguousError';
  }
}

const toNumber = (value: unknown) => {
  if (value == null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
};

const sameNumber = (a: unknown, b: unknown) => {
  const av = toNumber(a);
  const bv = toNumber(b);
  return Number.isFinite(av) && Number.isFinite(bv) && Math.abs(av - bv) <= 1e-9;
};

export async function setFleetInventoryQuantityIfUnchanged({
  entity,
  itemId,
  field,
  expectedQuantity,
  nextQuantity,
  label = 'Fleet inventory quantity',
  maxAttempts = 3,
  allowAlreadyDesired = false,
}: {
  entity: any;
  itemId: string;
  field: string;
  expectedQuantity: number;
  nextQuantity: number;
  label?: string;
  maxAttempts?: number;
  allowAlreadyDesired?: boolean;
}) {
  const id = String(itemId || '').trim();
  const fieldName = String(field || '').trim();
  const expected = Number(expectedQuantity);
  const desired = Number(nextQuantity);
  if (!id || !fieldName || !Number.isFinite(expected) || !Number.isFinite(desired) || typeof entity?.get !== 'function' || typeof entity?.updateMany !== 'function') {
    throw new Error(`${label} could not initialize its concurrency-safe update.`);
  }

  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 3));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await entity.get(id);
    if (!current?.id) throw new FleetInventoryQuantityConflictError(`${label} no longer exists.`);
    const currentQuantity = toNumber(current[fieldName]);
    if (!Number.isFinite(currentQuantity)) throw new FleetInventoryQuantityConflictError(`${label} has an invalid current quantity.`);
    if (sameNumber(currentQuantity, expected)) {
      if (sameNumber(expected, desired)) return { item: current, changed: false, already_desired: true };
    } else if (sameNumber(currentQuantity, desired)) {
      if (allowAlreadyDesired) return { item: current, changed: false, already_desired: true };
      throw new FleetInventoryQuantityConflictError(`${label} already equals the planned result, but this fresh operation cannot prove it made that change.`);
    } else {
      throw new FleetInventoryQuantityConflictError(`${label} changed from ${expected} to ${currentQuantity} while this operation was in progress.`);
    }

    const version = String(current.updated_date || '').trim();
    if (!version) throw new Error(`${label} is missing its current record version.`);

    let result: any;
    try {
      result = await entity.updateMany(
        { id, updated_date: version },
        { $set: { [fieldName]: desired } },
      );
    } catch (error: any) {
      let after: any;
      try {
        after = await entity.get(id);
      } catch (verificationError: any) {
        throw new FleetInventoryQuantityAmbiguousError(`${label} returned an error and its outcome could not be verified. ${verificationError?.message || ''}`.trim());
      }
      if (sameNumber(after?.[fieldName], desired)) {
        if (allowAlreadyDesired) return { item: after, changed: false, already_desired: true, verified_after_error: true };
        throw new FleetInventoryQuantityAmbiguousError(`${label} may have reached the planned quantity, but this operation cannot prove ownership of that change after an update error.`);
      }
      if (sameNumber(after?.[fieldName], expected)) continue;
      throw new FleetInventoryQuantityAmbiguousError(`${label} changed while an update error was being verified. It was not replayed automatically.`);
    }

    if (!result || typeof result.updated !== 'number') {
      throw new FleetInventoryQuantityAmbiguousError(`${label} returned an unverifiable conditional-update result.`);
    }
    if (result.updated > 1) {
      throw new FleetInventoryQuantityAmbiguousError(`${label} returned an impossible multi-record update count.`);
    }
    if (result.updated === 1) {
      const saved = await entity.get(id).catch(() => null);
      return { item: saved || { ...current, [fieldName]: desired }, changed: true };
    }
    // updated === 0 means another write changed the record version. Re-read and
    // retry only when the quantity itself is still exactly the expected value.
  }

  throw new FleetInventoryQuantityConflictError(`${label} changed repeatedly while saving. No stock quantity was overwritten.`);
}
