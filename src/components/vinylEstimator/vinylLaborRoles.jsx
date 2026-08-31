// Canonical vinyl labor roles + the rules tying them to machines and to the
// calculator's suggested hours.
//
// Roles live in Master Inventory → Labor & Services as `shop_labor` rows whose
// `service_name` is one of VINYL_ROLE_NAMES. We load those rows and resolve a
// rate per role (shop_rate_per_hour → default_rate fallback). If a role row is
// missing, we fall back to DEFAULT_ROLE_RATE so the dropdown still works.

import { base44 } from "@/api/base44Client";

// Full, non-abbreviated role names. NOTE: no "Installer".
export const VINYL_ROLE_NAMES = [
  "Designer",
  "Pre-Press",
  "Printer Operator",
  "Cutter Operator",
  "Laminator Operator",
  "Weeder",
  "Application Technician",
  "Helper",
];

// Used only if a role isn't found in the labor inventory.
export const DEFAULT_ROLE_RATE = {
  "Designer": 65,
  "Pre-Press": 55,
  "Printer Operator": 55,
  "Cutter Operator": 50,
  "Laminator Operator": 45,
  "Weeder": 38,
  "Application Technician": 45,
  "Helper": 32,
};

const num = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

// Load vinyl labor roles from the labor inventory, keyed by role name.
// Returns [{ role, hourly_rate }] in VINYL_ROLE_NAMES order.
export async function loadVinylLaborRoles() {
  const rows = await base44.entities.LaborServiceInventory.filter({ service_category: "shop_labor" });
  const byName = {};
  rows.forEach((r) => {
    if (VINYL_ROLE_NAMES.includes(r.service_name)) {
      byName[r.service_name] = num(r.shop_rate_per_hour, num(r.default_rate, DEFAULT_ROLE_RATE[r.service_name] || 0));
    }
  });
  return VINYL_ROLE_NAMES.map((role) => ({
    role,
    hourly_rate: byName[role] ?? DEFAULT_ROLE_RATE[role] ?? 0,
  }));
}

// Which roles each machine auto-selects.
//   printer    → Printer Operator
//   laminator  → Laminator Operator
//   cutter     → Printer Operator + Weeder  (per spec)
export const MACHINE_AUTO_ROLES = {
  printer: ["Printer Operator"],
  laminator: ["Laminator Operator"],
  cutter: ["Printer Operator", "Weeder"],
};

// Suggested hours for a given role, derived from the calculator breakdown.
// calc carries machineRunMinutes split + weeding/install minutes; we map the
// relevant slice to each operator role.
export function suggestedHoursForRole(role, calc) {
  if (!calc) return 0;
  const min = (v) => (Number.isFinite(v) ? v : 0);
  switch (role) {
    case "Printer Operator":   return (min(calc.printMinutes)) / 60;
    case "Cutter Operator":    return (min(calc.cutMinutes)) / 60;
    case "Laminator Operator": return (min(calc.laminateMinutes)) / 60;
    case "Weeder":             return (min(calc.weedingMinutes)) / 60;
    case "Application Technician": return (min(calc.installMinutes)) / 60;
    default:                   return 0; // Designer / Pre-Press / Helper → manual
  }
}