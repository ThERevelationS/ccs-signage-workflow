// Centralized Admin navigation metadata. Category organization is presentation only;
// backend authorization remains responsible for protecting administrative actions.
export const ADMIN_TAB_GROUPS = [
  {
    id: 'workflow',
    label: 'Workflow',
    tabs: [
      { value: 'automations', label: 'Automations' },
      { value: 'task_assignments', label: 'Task Assignments' },
      { value: 'calendar', label: 'Calendar' },
      { value: 'activity', label: 'Activity' },
    ],
  },
  {
    id: 'people',
    label: 'People',
    tabs: [
      { value: 'users', label: 'Users' },
      { value: 'timeclock', label: 'Time Clock', adminOnly: true },
      { value: 'resources', label: 'Resources', adminOnly: true },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    tabs: [
      { value: 'smartsheet', label: 'Smartsheet Sync', adminOnly: true },
      { value: 'corebridge', label: 'CoreBridge Migration', adminOnly: true },
      { value: 'opportunity_bridge', label: 'Opportunity Bridge', adminOnly: true },
      { value: 'sync_conflicts', label: 'Sync Conflict Review', adminOnly: true },
    ],
  },
  {
    id: 'permitting',
    label: 'Permitting',
    tabs: [
      { value: 'permitting_completeness', label: 'Permitting Completeness', adminOnly: true },
      { value: 'permitting_rules', label: 'Permitting Rules', adminOnly: true },
      { value: 'permitting_tests', label: 'Permitting Tests', adminOnly: true },
    ],
  },
  {
    id: 'system',
    label: 'System',
    tabs: [
      { value: 'backend', label: 'Backend Functions', adminOnly: true },
    ],
  },
];

export function getAccessibleAdminGroups(isAdmin) {
  return ADMIN_TAB_GROUPS.map((group) => ({
    ...group,
    tabs: group.tabs.filter((tab) => !tab.adminOnly || isAdmin),
  })).filter((group) => group.tabs.length > 0);
}

export function getAccessibleAdminTab(requestedTab, isAdmin) {
  const available = getAccessibleAdminGroups(isAdmin);
  return available.some((group) => group.tabs.some((tab) => tab.value === requestedTab))
    ? requestedTab
    : 'automations';
}

export function getAdminGroupForTab(tabValue, isAdmin) {
  return getAccessibleAdminGroups(isAdmin).find(
    (group) => group.tabs.some((tab) => tab.value === tabValue),
  )?.id || 'workflow';
}
