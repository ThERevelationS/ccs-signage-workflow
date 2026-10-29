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
      { value: 'fleet', label: 'Fleet Settings', adminOnly: true },
    ],
  },
];

// Per-user Admin page permissions. admin_permissions = {
//   sections: [groupId...], tabs: { tabValue: true }, subtabs: { tabValue: [subtabValue...] }
// }. Missing/empty sections or tabs entries default to allowed so partially
// configured users keep the behavior their role already grants.
function isTabPermitted(tab, permissions) {
  if (!permissions) return true;
  const sections = Array.isArray(permissions.sections) ? permissions.sections : null;
  const tabs = permissions.tabs && typeof permissions.tabs === 'object' && !Array.isArray(permissions.tabs) ? permissions.tabs : null;
  if (!sections && !tabs) return true;
  if (tabs) return tabs[tab.value] === true;
  return true;
}

function isGroupPermitted(groupId, permissions) {
  if (!permissions) return true;
  const sections = Array.isArray(permissions.sections) ? permissions.sections : null;
  if (!sections) return true;
  return sections.includes(groupId);
}

function permittedSubtabs(parentTab, permissions) {
  const nested = ADMIN_NESTED_TABS[parentTab] || [];
  const subtabs = permissions?.subtabs && typeof permissions.subtabs === 'object' && !Array.isArray(permissions.subtabs) ? permissions.subtabs : null;
  if (!subtabs || !Object.prototype.hasOwnProperty.call(subtabs, parentTab)) return nested;
  const allowed = Array.isArray(subtabs[parentTab]) ? subtabs[parentTab] : [];
  return nested.filter((subtab) => allowed.includes(subtab.value));
}

export function getAccessibleAdminGroups(isAdmin, user) {
  const permissions = user?.is_full_admin ? null : (user?.admin_permissions && typeof user.admin_permissions === 'object' ? user.admin_permissions : null);
  return ADMIN_TAB_GROUPS.map((group) => ({
    ...group,
    tabs: group.tabs.filter((tab) => (!tab.adminOnly || isAdmin) && isGroupPermitted(group.id, permissions) && isTabPermitted(tab, permissions)),
  })).filter((group) => group.tabs.length > 0);
}

export function getAccessibleAdminTab(requestedTab, isAdmin, user) {
  const available = getAccessibleAdminGroups(isAdmin, user);
  return available.some((group) => group.tabs.some((tab) => tab.value === requestedTab))
    ? requestedTab
    : 'automations';
}

export function getAdminGroupForTab(tabValue, isAdmin, user) {
  return getAccessibleAdminGroups(isAdmin, user).find(
    (group) => group.tabs.some((tab) => tab.value === tabValue),
  )?.id || 'workflow';
}

// Button groups keep Enter/Space activation; arrows only move keyboard focus.
// A null result means the key should retain its native behavior.
export function getAdminCategoryKeyboardTarget(key, index, count) {
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1 || index < 0 || index >= count) {
    return null;
  }
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

// Searchable nested settings are mapped only to panels that actually exist.
export const ADMIN_NESTED_TABS = {
  timeclock: [
    { value: 'entries', label: 'Time Entries', keywords: 'punches clock in clock out shifts' },
    { value: 'reports', label: 'Reports', keywords: 'timeclock payroll reports' },
    { value: 'pto', label: 'PTO Policies', keywords: 'paid time off vacation leave' },
    { value: 'overtime', label: 'Overtime Rules', keywords: 'payroll overtime hours' },
  ],
  backend: [
    { value: 'backup', label: 'Data Backup', keywords: 'data recovery' },
    { value: 'client_trash', label: 'Client Trash', keywords: 'deleted clients restore' },
    { value: 'order_trash', label: 'Order Trash', keywords: 'deleted orders restore' },
    { value: 'default_sort', label: 'Default Sort', keywords: 'sales pipeline sorting' },
    { value: 'wip_import', label: 'WIP Import', keywords: 'work in progress importer' },
    { value: 'permitting', label: 'Permitting Repository', keywords: 'permit documents' },
    { value: 'monitoring', label: 'Jurisdiction Monitoring', keywords: 'permit research jurisdictions' },
  ],
};

const ADMIN_SEARCH_KEYWORDS = {
  automations: 'automation rules email groups gmail pause resume kill switch enabled disabled duplicate restore version create new rule',
  users: 'staff user accounts access roles permissions passwords deactivate remove delete export csv invite grant revoke admin bulk',
  timeclock: 'time clock employee hours payroll approve shift review exception missed punch clock out export correction time off pto overtime',
  backend: 'backend functions maintenance administration backup restore trash client order deleted',
  corebridge: 'corebridge api migration',
  opportunity_bridge: 'sales opportunities integration',
  sync_conflicts: 'sync conflict review discrepancies resolve approve merge',
  smartsheet: 'smartsheet sync integration sales orders run sync now columns sheet binding',
  resources: 'resource allocation capacity',
  permitting_completeness: 'permit completeness',
  permitting_rules: 'permit rules review',
  permitting_tests: 'permit tests',
  task_assignments: 'task assignment rules',
  calendar: 'scheduling calendar',
  activity: 'activity feed events history audit log export saved views live mine filter',
  fleet: 'fleet settings bouncie notifications reminders maintenance mechanic portal public report',
};

export function getAccessibleAdminSubtab(parentTab, requestedSubtab, user) {
  const permissions = user?.is_full_admin ? null : (user?.admin_permissions && typeof user.admin_permissions === 'object' ? user.admin_permissions : null);
  const tabs = permittedSubtabs(parentTab, permissions);
  // A tab with no nested settings, or a permission set that grants none, has no
  // subtab to select. An empty list must resolve to null, never to tabs[0].
  if (!Array.isArray(tabs) || tabs.length === 0) return null;
  return tabs.find((tab) => tab.value === requestedSubtab)?.value || tabs[0].value;
}

const normalizedSearch = (input) => String(input ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[_-]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

// Search results retain input focus. -1 means no result has been highlighted yet.
// Return null for keys that should use their native input behavior.
export function getAdminSearchKeyboardIndex(key, index, resultCount) {
  if (!Number.isInteger(resultCount) || resultCount < 1 || !Number.isInteger(index)) return null;
  if (key === 'ArrowDown') return index < 0 || index >= resultCount - 1 ? 0 : index + 1;
  if (key === 'ArrowUp') return index <= 0 || index >= resultCount ? resultCount - 1 : index - 1;
  return null;
}

export function searchAdminSettings(input, isAdmin, limit = 8, user) {
  let query = normalizedSearch(input);
  if (!query) return [];
  // Scoped prefixes: "tab:time clock", "group:people", "page:users" restrict
  // matching to that field so admins can jump precisely.
  let scope = null;
  const prefixed = query.match(/^(tab|group|page):\s*(.*)$/);
  if (prefixed) { scope = prefixed[1]; query = prefixed[2].trim(); }
  if (!query) return [];
  const terms = query.split(' ');
  const permissions = user?.is_full_admin ? null : (user?.admin_permissions && typeof user.admin_permissions === 'object' ? user.admin_permissions : null);
  const destinations = getAccessibleAdminGroups(isAdmin, user).flatMap((group) =>
    group.tabs.flatMap((tab) => [
      {
        id: tab.value,
        label: tab.label,
        group: group.label,
        tab: tab.value,
        keywords: ADMIN_SEARCH_KEYWORDS[tab.value] || '',
      },
      ...permittedSubtabs(tab.value, permissions).map((nested) => ({
        id: `${tab.value}:${nested.value}`,
        label: nested.label,
        group: group.label,
        parentLabel: tab.label,
        tab: tab.value,
        subtab: nested.value,
        keywords: nested.keywords || '',
      })),
    ])
  );

  return destinations
    .map((destination, order) => {
      const label = normalizedSearch(destination.label);
      const breadcrumb = normalizedSearch(`${destination.group} ${destination.parentLabel || ''}`);
      const haystack = scope === 'group' ? normalizedSearch(destination.group)
        : scope === 'tab' || scope === 'page' ? `${label} ${normalizedSearch(destination.parentLabel || '')}`
        : `${label} ${breadcrumb} ${normalizedSearch(destination.keywords)}`;
      if (!terms.every((term) => haystack.includes(term))) return null;
      const rank = label === query ? 0 : label.startsWith(query) ? 1 : label.includes(query) ? 2 : 3;
      return { destination, rank, order };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, Math.max(0, Math.floor(Number(limit) || 0)))
    .map(({ destination: { keywords, ...result } }) => result);
}

// Human-readable summary of an admin's page access for row badges.
// Counts top-level tab visibility only; subtab restrictions don't change the count.
export function getAdminAccessSummary(user) {
  if (user?.is_full_admin === true) return 'Full access';
  const permissions = user?.admin_permissions && typeof user.admin_permissions === 'object' && !Array.isArray(user.admin_permissions)
    ? user.admin_permissions : null;
  const allTabs = ADMIN_TAB_GROUPS.flatMap((g) => g.tabs.map((t) => ({ ...t, groupId: g.id })));
  const allowed = allTabs.filter((tab) => isGroupPermitted(tab.groupId, permissions) && isTabPermitted(tab, permissions));
  if (allowed.length === allTabs.length) return 'All pages';
  if (allowed.length === 0) return 'No pages';
  return `${allowed.length} of ${allTabs.length} pages`;
}