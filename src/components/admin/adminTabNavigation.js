// Resolve Admin tab deep links without exposing privileged sections to non-admin navigation.
// Authorization for tab actions must still be enforced by backend functions.
const COMMON_ADMIN_TABS = new Set([
  'automations', 'users', 'task_assignments', 'calendar', 'activity',
]);

const ADMIN_ONLY_TABS = new Set([
  'timeclock', 'backend', 'corebridge', 'opportunity_bridge', 'sync_conflicts',
  'smartsheet', 'resources', 'permitting_completeness', 'permitting_rules', 'permitting_tests',
]);

export function getAccessibleAdminTab(requestedTab, isAdmin) {
  if (COMMON_ADMIN_TABS.has(requestedTab) || (isAdmin && ADMIN_ONLY_TABS.has(requestedTab))) {
    return requestedTab;
  }
  return 'automations';
}
