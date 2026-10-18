export function validateOptionalFleetUnitCost(value: unknown) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    return { valid: true as const, provided: false as const, value: undefined };
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    return { valid: false as const, provided: true as const, value: undefined };
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    return { valid: false as const, provided: true as const, value: undefined };
  }
  return { valid: true as const, provided: true as const, value: amount };
}
