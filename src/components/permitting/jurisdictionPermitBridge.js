import {normalizeAddressState} from '../../shared/permittingAddressState.js';
const PLACEHOLDER_VALUES = new Set([
  "information not found",
  "not found",
  "unknown",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
]);

function cleanText(value) {
  const text = String(value || "").trim();
  if (!text || PLACEHOLDER_VALUES.has(text.toLowerCase())) return "";
  return text;
}

export function normalizePermitJurisdictionName(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(city|village|town|borough|municipality) of\s+/, "")
    .trim();
}

export function normalizeState(value) {
  return normalizeAddressState(cleanText(value));
}

function possibleResultNames(result) {
  const names = [
    result?.suggested_locality?.name,
    result?.ai_locality_name,
  ];

  const county = cleanText(result?.ai_county);
  if (county) names.push(/county$/i.test(county) ? county : `${county} County`);

  return new Set(names.map(normalizePermitJurisdictionName).filter(Boolean));
}

export function findRepositoryJurisdictionMatches(jurisdictions, result) {
  if (!Array.isArray(jurisdictions) || !result) return [];

  // An explicitly linked tracker locality is stronger than legacy name/state
  // compatibility. Never fall back to names when that canonical ID is present:
  // a stale/broken link must be reviewed instead of silently choosing a profile.
  const linkedProfileId = cleanText(result?.suggested_locality?.jurisdiction_profile_id);
  if (linkedProfileId) {
    return jurisdictions.filter((jurisdiction) => cleanText(jurisdiction?.id) === linkedProfileId);
  }

  const names = possibleResultNames(result);
  if (names.size === 0) return [];

  const state = normalizeState(result?.ai_state || result?.suggested_locality?.state);
  return jurisdictions.filter((jurisdiction) => {
    const name = normalizePermitJurisdictionName(jurisdiction?.name);
    if (!name || !names.has(name)) return false;
    if (!state) return true;
    return normalizeState(jurisdiction?.state) === state;
  });
}

export function repositoryJurisdictionIdentity(jurisdiction) {
  // Same name+type in different parent counties are distinct entities (e.g.,
  // Ohio's many same-named townships) — identity must include the county.
  const county = cleanText(jurisdiction?.parent_county?.name).toLowerCase().replace(/\s*county$/u, "");
  return [
    normalizePermitJurisdictionName(jurisdiction?.name),
    normalizeState(jurisdiction?.state),
    cleanText(jurisdiction?.type).toLowerCase(),
    county,
  ].join("|");
}

export function hasDuplicateRepositoryIdentity(jurisdictions, jurisdiction) {
  if (!Array.isArray(jurisdictions) || !jurisdiction) return false;
  // A profile explicitly held as a duplicate of another record is itself
  // blocked, but it must not disqualify the canonical profile it points at.
  if (cleanText(jurisdiction?.duplicate_of)) return true;
  const identity = repositoryJurisdictionIdentity(jurisdiction);
  return jurisdictions.filter((row) => !cleanText(row?.duplicate_of) && repositoryJurisdictionIdentity(row) === identity).length > 1;
}

export function jurisdictionToDraftPermitLocality(jurisdiction) {
  const id = cleanText(jurisdiction?.id) || "repository";
  const name = cleanText(jurisdiction?.name);
  const state = cleanText(jurisdiction?.state).toUpperCase();
  const contact = jurisdiction?.contact_info && typeof jurisdiction.contact_info === "object"
    ? jurisdiction.contact_info
    : {};
  const department = cleanText(contact.department);
  const website = cleanText(jurisdiction?.permitting_url) || cleanText(jurisdiction?.website_url);

  if (!name) throw new Error("This repository profile does not have a usable jurisdiction name.");

  const office = {
    id: `repo-${id}-office`,
    name: department || name,
    office_type: "",
    office_types: [],
    contact_phone: cleanText(contact.phone),
    contact_email: cleanText(contact.email),
    contact_website: website,
    contact_address: cleanText(contact.address),
    contact_notes: `Drafted from the Jurisdiction Repository (${name}${state ? `, ${state}` : ""}). Verify the responsible office, requirements, contacts, and workflow before relying on this configuration.`,
    workflow_steps: [
      {
        id: `repo-${id}-submitted`,
        name: "Application Submitted",
        type: "submitted_date",
        followup_interval_days: 14,
        order: 0,
      },
      {
        id: `repo-${id}-followup`,
        name: "Follow-up",
        type: "followup_date",
        followup_interval_days: 14,
        order: 1,
      },
      {
        id: `repo-${id}-received`,
        name: "Permit Received",
        type: "permit_received_date",
        followup_interval_days: 14,
        order: 2,
      },
    ],
    order: 0,
  };

  return {
    name,
    state,
    zip: "",
    ...(id !== "repository" ? { jurisdiction_profile_id: id } : {}),
    offices: [office],
    order: 0,
  };
}

// ── Scanner-generated localities — real office records, not drafts. ──────────
// The address scan resolves the jurisdiction from official boundaries and the
// repository profile supplies the researched offices. Each role's office is
// carried as a real office record (name, contacts, source URL, standard
// permit pipeline) with authority_verification_status 'needs_verification' —
// the record is usable immediately while office-role truth stays gated by
// staff verification, same as a hand-entered record.
const ROLE_TYPE_LABEL = {
  sign_permit: "Sign permit", zoning: "Zoning", building: "Building",
  electrical: "Electrical", electrical_permit: "Electrical permit",
  electrical_inspection: "Electrical inspection", right_of_way: "Right of way",
  historic_review: "Historic review", planning: "Planning",
  transportation: "Transportation", other: "Permitting",
};
const realContact = (v) => { const s = cleanText(v); return /information not found/i.test(s) ? "" : s; };
const scanSteps = (id, tag) => [
  { id: `scan-${id}-${tag}-submitted`, name: "Application Submitted", type: "submitted_date", followup_interval_days: 14, order: 0 },
  { id: `scan-${id}-${tag}-review`, name: "Office Review", type: "checkbox", followup_interval_days: 14, order: 1 },
  { id: `scan-${id}-${tag}-followup`, name: "Follow-up", type: "followup_date", followup_interval_days: 14, order: 2 },
  { id: `scan-${id}-${tag}-received`, name: "Permit Received", type: "permit_received_date", followup_interval_days: 14, order: 3 },
];
export function jurisdictionToPermitLocality(jurisdiction) {
  const id = cleanText(jurisdiction?.id) || "repository";
  const name = cleanText(jurisdiction?.name);
  const state = cleanText(jurisdiction?.state).toUpperCase();
  if (!name) throw new Error("This repository profile does not have a usable jurisdiction name.");
  const contact = jurisdiction?.contact_info && typeof jurisdiction.contact_info === "object" ? jurisdiction.contact_info : {};
  const profileSite = cleanText(jurisdiction?.permitting_url) || cleanText(jurisdiction?.website_url);
  const roles = Array.isArray(jurisdiction?.office_research?.roles) ? jurisdiction.office_research.roles : [];

  // One office record per distinct researched office; roles an office covers
  // merge onto that office (sign permit + zoning often share one counter).
  const byOffice = new Map();
  for (const r of roles) {
    const officeName = cleanText(r?.office_name) || cleanText(r?.label);
    if (!officeName) continue;
    const key = officeName.toLowerCase();
    const entry = byOffice.get(key) || { name: officeName, roles: [], source: "", quotes: [], notes: [], contact: {} };
    if (r?.role && !entry.roles.includes(r.role)) entry.roles.push(r.role);
    if (!entry.source) entry.source = cleanText(r?.official_source_url);
    if (r?.responsibility_quote) entry.quotes.push(String(r.responsibility_quote).slice(0, 300));
    if (r?.notes) entry.notes.push(String(r.notes).slice(0, 200));
    const rc = r?.contact_info || {};
    if (!entry.contact.phone) entry.contact.phone = realContact(rc.phone);
    if (!entry.contact.email) entry.contact.email = realContact(rc.email);
    if (!entry.contact.address) entry.contact.address = realContact(rc.address);
    byOffice.set(key, entry);
  }

  let offices;
  if (byOffice.size) {
    offices = [...byOffice.values()].map((o, i) => ({
      id: `scan-${id}-office-${i}`,
      name: o.name,
      office_type: ROLE_TYPE_LABEL[o.roles[0]] || "Permitting",
      office_types: o.roles.map((r) => ROLE_TYPE_LABEL[r] || r),
      contact_phone: o.contact.phone || realContact(contact.phone),
      contact_email: o.contact.email || realContact(contact.email),
      contact_website: o.source || profileSite,
      contact_address: o.contact.address || realContact(contact.address),
      contact_notes: [
        ...o.quotes.slice(0, 2),
        ...o.notes.slice(0, 2),
        `Auto-built from the ${name}${state ? `, ${state}` : ""} repository profile (researched ${jurisdiction?.office_research?.researched_at ? String(jurisdiction.office_research.researched_at).slice(0, 10) : "official sources"}). Office roles need staff verification before a permit is filed.`,
      ].filter(Boolean).join(" "),
      workflow_steps: scanSteps(id, i),
      authority_roles: o.roles,
      authority_verification_status: "needs_verification",
      order: i,
    }));
  } else {
    offices = [{
      id: `scan-${id}-office-0`,
      name: cleanText(contact.department) || `${name} permitting office`,
      office_type: "Permitting",
      office_types: [],
      contact_phone: realContact(contact.phone),
      contact_email: realContact(contact.email),
      contact_website: profileSite,
      contact_address: realContact(contact.address),
      contact_notes: `Auto-built from the ${name}${state ? `, ${state}` : ""} repository profile. No office research is saved yet — confirm the responsible office before filing.`,
      workflow_steps: scanSteps(id, 0),
      authority_verification_status: "needs_verification",
      order: 0,
    }];
  }

  return {
    name, state, zip: "",
    ...(id !== "repository" ? { jurisdiction_profile_id: id } : {}),
    offices,
    order: 0,
  };
}