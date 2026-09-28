import { resolveSmartsheetPerson } from "../admin/smartsheetTranslationModel.js";

const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const key = (value) => clean(value).toLowerCase();

const roleMatch = (user, role) => {
  if (!role) return true;
  const roles = Array.isArray(user?.sales_roles) ? user.sales_roles : [];
  if (role === "PM") return roles.includes("PM") || roles.includes("Project Manager");
  return roles.includes(role);
};

const mergeUsers = (primary, duplicates = []) => ({
  ...primary,
  sales_roles: [...new Set(
    [primary, ...duplicates].flatMap((user) => Array.isArray(user?.sales_roles) ? user.sales_roles : [])
  )],
});

export function canonicalSalesPersonRoster(users = []) {
  const active = (Array.isArray(users) ? users : [])
    .filter((user) => user?.is_active !== false && clean(user?.full_name));

  const byFirst = new Map();
  for (const user of active) {
    const first = key(clean(user.full_name).split(/\s+/)[0]);
    if (!byFirst.has(first)) byFirst.set(first, []);
    byFirst.get(first).push(user);
  }

  const canonical = [];
  for (const group of byFirst.values()) {
    const fullByName = new Map();
    for (const user of group.filter((candidate) => clean(candidate.full_name).includes(" "))) {
      const nameKey = key(user.full_name);
      if (!fullByName.has(nameKey)) fullByName.set(nameKey, []);
      fullByName.get(nameKey).push(user);
    }
    if (fullByName.size === 1) {
      const fullRecords = [...fullByName.values()][0];
      canonical.push(mergeUsers(fullRecords[0], group.filter((user) => user !== fullRecords[0])));
      continue;
    }

    const byName = new Map();
    for (const user of group) {
      const nameKey = key(user.full_name);
      if (!byName.has(nameKey)) byName.set(nameKey, []);
      byName.get(nameKey).push(user);
    }
    for (const sameName of byName.values()) {
      canonical.push(mergeUsers(sameName[0], sameName.slice(1)));
    }
  }

  return canonical.sort((a, b) => clean(a.full_name).localeCompare(clean(b.full_name)));
}

export function salesPersonUsersForRole(users = [], role = null) {
  return canonicalSalesPersonRoster(users).filter((user) => roleMatch(user, role));
}

export function buildSalesPersonSelectModel(value, users = [], role = null) {
  const options = salesPersonUsersForRole(users, role);
  const resolution = resolveSmartsheetPerson(value, options);
  const canonical = resolution.user?.full_name || clean(value);
  const legacy = canonical && !options.some((user) => key(user.full_name) === key(canonical))
    ? canonical
    : "";
  return { canonical, options, legacy, resolution };
}
