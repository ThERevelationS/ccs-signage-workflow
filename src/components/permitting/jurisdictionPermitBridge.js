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

function normalizeState(value) {
  return cleanText(value).toLowerCase();
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
  return [
    normalizePermitJurisdictionName(jurisdiction?.name),
    normalizeState(jurisdiction?.state),
    cleanText(jurisdiction?.type).toLowerCase(),
  ].join("|");
}

export function hasDuplicateRepositoryIdentity(jurisdictions, jurisdiction) {
  if (!Array.isArray(jurisdictions) || !jurisdiction) return false;
  const identity = repositoryJurisdictionIdentity(jurisdiction);
  return jurisdictions.filter((row) => repositoryJurisdictionIdentity(row) === identity).length > 1;
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
    offices: [office],
    order: 0,
  };
}
