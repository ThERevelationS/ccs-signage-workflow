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
  // Only potentially-applicable roles are claimed — research returns all
  // seven roles including 'unknown'/'not_applicable_candidate' entries, and
  // claiming those puts unprovable (or contradicted) roles on the office.
  // Office names extracted from pages are often nav/footer noise ("Career
  // Opportunities Building Inspector", "Income Taxes Law Department"). A name
  // must match the ROLE's domain vocabulary or it's discarded and the role
  // materializes under a synthesized "<Jurisdiction> <role> office" name —
  // better an honest role-honest stub than a wrong-provider office (the
  // verifier renames stubs to real providers on promote anyway).
  const ROLE_VOCAB = {
    sign_permit: /sign|permit|building|zoning|develop|inspect/i,
    zoning: /zoning|planning|develop|community/i,
    building: /build|construct|code|develop|inspect/i,
    electrical: /electric|inspect|build|code/i,
    electrical_permit: /electric|inspect|build|code/i,
    electrical_inspection: /electric|inspect|build|code/i,
    right_of_way: /works|engineer|street|road|right|service|transport|utility/i,
    historic_review: /historic|landmark|conservation|preservation|appropriateness/i,
    planning: /plan|develop|community|zoning/i,
    transportation: /transport|traffic|engineer|works/i,
    other: /./,
  };
  const byOffice = new Map();
  for (const r of roles) {
    if (r?.applicability && !/potentially_applicable|applicable|confirmed/i.test(String(r.applicability))) continue;
    let officeName = cleanText(r?.office_name) || cleanText(r?.label);
    const vocab = ROLE_VOCAB[r?.role] || ROLE_VOCAB.other;
    if (officeName && !vocab.test(officeName)) officeName = ""; // wrong-domain extraction — don't materialize it
    if (!officeName) officeName = `${name} ${ROLE_TYPE_LABEL[r?.role] || "Permitting"} office`;
    const key = officeName.toLowerCase();
    const entry = byOffice.get(key) || { name: officeName, roles: [], source: "", quotes: [], notes: [], contact: {}, fields: {} };
    if (r?.role && !entry.roles.includes(r.role)) entry.roles.push(r.role);
    if (!entry.source) entry.source = cleanText(r?.official_source_url);
    if (r?.responsibility_quote) entry.quotes.push(String(r.responsibility_quote).slice(0, 300));
    if (r?.notes) entry.notes.push(String(r.notes).slice(0, 200));
    if (r?.service_area && !entry.fields.service_area) entry.fields.service_area = cleanText(r.service_area);
    // MP-8.1 — WS-3 harvest rides research_fields through to office records:
    // fees, forms, submission methods, review time, staff, hours, required docs.
    const rf = r?.research_fields || {};
    for (const k of ['fee_text', 'submission', 'review_time', 'contact_person', 'hours', 'required_documents', 'field_confidence', 'application_form_url', 'application_form_name', 'meeting_schedule', 'installer_registration', 'inspection_contact', 'permit_expiry']) {
      if (rf[k] && !entry.fields[k]) entry.fields[k] = rf[k];
    }
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
      canonical_provider_id: `${String(state || '').toLowerCase() || 'xx'}::${o.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      name: o.name,
      office_type: ROLE_TYPE_LABEL[o.roles[0]] || "Permitting",
      office_types: o.roles.map((r) => ROLE_TYPE_LABEL[r] || r),
      contact_phone: o.contact.phone || realContact(contact.phone),
      contact_email: o.contact.email || realContact(contact.email),
      contact_website: o.source || profileSite,
      contact_address: o.contact.address || realContact(contact.address),
      hours: o.fields.hours || "",
      application_form_url: o.fields.application_form_url || "",
      application_form_name: o.fields.application_form_name || "",
      fee_schedule_text: o.fields.fee_text || "",
      submission_methods: o.fields.submission ? [String(o.fields.submission).slice(0, 160)] : [],
      typical_review_time: o.fields.review_time || "",
      contact_person: o.fields.contact_person || "",
      required_documents: o.fields.required_documents ? [String(o.fields.required_documents)] : [],
      meeting_schedule_text: o.fields.meeting_schedule || "",
      inspection_contact: o.fields.inspection_contact || "",
      permit_expiry_text: o.fields.permit_expiry || "",
      installer_registration_required: !!o.fields.installer_registration || undefined,
      // MP-10.5 — overlay flags derivable from the role set itself.
      overlay_flags: [
        ...(/historic/i.test(o.fields.meeting_schedule || '') || o.roles.includes('historic_review') ? ['historic_district'] : []),
        ...(o.roles.includes('right_of_way') ? ['row_permit_possible'] : []),
      ],
      field_confidence: o.fields.field_confidence || "",
      service_area: o.fields.service_area || "",
      data_as_of: new Date().toISOString(),
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