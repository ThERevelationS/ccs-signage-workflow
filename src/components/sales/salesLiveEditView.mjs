const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function createOrExtendSalesLiveEditPin(existingPin, rowBefore = {}, localChanges = {}) {
  const baselineValues = { ...(existingPin?.baselineValues || {}) };
  const localValues = { ...(existingPin?.localValues || {}) };

  for (const [field, value] of Object.entries(localChanges || {})) {
    if (!Object.prototype.hasOwnProperty.call(baselineValues, field)) {
      baselineValues[field] = rowBefore?.[field];
    }
    localValues[field] = value;
  }

  return {
    baselineValues,
    localValues,
  };
}

export function projectSalesRowForLiveView(row = {}, pin = null) {
  if (!pin?.baselineValues || typeof pin.baselineValues !== "object") return row;
  return {
    ...row,
    ...pin.baselineValues,
  };
}

export function reconcileSalesLiveEditPinWithRemote(pin, remoteRow = {}, pendingChanges = {}) {
  if (!pin?.baselineValues || !pin?.localValues) return pin || null;

  const baselineValues = { ...pin.baselineValues };
  const localValues = { ...pin.localValues };

  for (const field of Object.keys(localValues)) {
    if (Object.prototype.hasOwnProperty.call(pendingChanges || {}, field)) continue;
    if (!Object.prototype.hasOwnProperty.call(remoteRow || {}, field)) continue;

    if (!sameValue(remoteRow[field], localValues[field])) {
      delete baselineValues[field];
      delete localValues[field];
    }
  }

  return Object.keys(localValues).length > 0
    ? { baselineValues, localValues }
    : null;
}

export function salesLiveEditPinChanged(left, right) {
  return JSON.stringify(left || null) !== JSON.stringify(right || null);
}
