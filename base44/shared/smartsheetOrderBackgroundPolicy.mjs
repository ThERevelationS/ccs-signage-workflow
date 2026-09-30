export const ORDER_BACKGROUND_SYNC_POLICY = Object.freeze({
  mirror_enabled: true,
  pull_enabled: true,
  push_enabled: false,
  create_base44_from_smartsheet: false,
  create_smartsheet_from_base44: false,
});

export function orderBackgroundSyncPolicyViolations(profile = {}) {
  const violations = [];
  if (profile?.push_enabled === true) violations.push('push_enabled');
  if (profile?.create_base44_from_smartsheet === true) violations.push('create_base44_from_smartsheet');
  if (profile?.create_smartsheet_from_base44 === true) violations.push('create_smartsheet_from_base44');
  return violations;
}

export function enforceOrderBackgroundSyncPolicy(profile = {}) {
  return {
    ...(profile || {}),
    ...ORDER_BACKGROUND_SYNC_POLICY,
  };
}

export function assertOrderBackgroundSyncPolicy(profile = {}) {
  const violations = orderBackgroundSyncPolicyViolations(profile);
  if (violations.length) {
    const error = new Error(
      'Order Form background push and automatic record creation are locked OFF. Use Save & Sync for explicit Base44 → Smartsheet writes.'
    );
    error.status = 400;
    error.violations = violations;
    throw error;
  }
  return profile;
}
