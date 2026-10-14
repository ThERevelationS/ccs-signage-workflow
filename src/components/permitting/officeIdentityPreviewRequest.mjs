import { normalizeGovernmentOfficeCatalogEntry } from "./governmentOfficeCatalog.js";
import { officeCandidateEvidence } from "./officeCandidateEvidence.mjs";
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const officePreviewSelectionKey = office => JSON.stringify(canonical(normalizeGovernmentOfficeCatalogEntry(office)));
async function digest(snapshot) {
  if (!globalThis.crypto?.subtle) throw Error("This browser cannot verify the review snapshot digest.");
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(snapshot)));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
/** Exactly one catalog read and one read-only function request; no retry or save. */
export async function loadOfficeIdentityPreview({ office, settingsEntity, invoke, timeoutMs = 20000 }) {
  const evidence = officeCandidateEvidence(office);
  if (!evidence || evidence.gaps.length) throw Error("Complete, unchanged candidate registration evidence is required for a preview.");
  const selectedKey = officePreviewSelectionKey(office);
  let timer;
  const request = (async () => {
    const rows = await settingsEntity.filter({ setting_key: "permitOfficeCatalog" }, "id", 2, 0);
    if (!Array.isArray(rows) || rows.length !== 1 || !rows[0]?.id || !rows[0]?.updated_date ||
      !Array.isArray(rows[0].setting_value?.items)) throw Error("The saved office catalog is missing, ambiguous or unversioned.");
    const row = rows[0], matches = row.setting_value.items.filter(item => item?.id === evidence.officeId);
    if (matches.length !== 1 || officePreviewSelectionKey(matches[0]) !== selectedKey)
      throw Error("This office differs from the saved catalog. Finish saving or reload your draft before previewing.");
    const response = await invoke("permittingOfficeCandidate", {
      action: "identity_preview", office_id: evidence.officeId, registration_key: evidence.registrationKey,
      expected_catalog_updated_date: row.updated_date,
    });
    const result = response?.data ?? response, snapshot = result?.review_snapshot;
    const unapproved = ["identity_verified", "authority_verified", "source_currentness_verified", "contacts_verified",
      "commercial_sign_scope_verified", "delegation_verified", "address_authority_resolved"];
    if (!result?.success) throw Error(result?.error || "Identity preview could not be confirmed.");
    if (result.status !== "identity_review_only" || result.dry_run !== true || result.production_writes !== 0 ||
      result.llm_calls !== 0 || unapproved.some(key => result[key] !== false) ||
      snapshot?.catalog?.id !== row.id || snapshot.catalog.updated_date !== row.updated_date ||
      officePreviewSelectionKey(snapshot.office) !== selectedKey ||
      !snapshot.source_updated_date || !snapshot.profile_updated_date ||
      !Array.isArray(result.unresolved_identity) || result.unresolved_identity.some(v => typeof v !== "string") ||
      !/^[a-f0-9]{64}$/.test(result.review_snapshot_sha256 || "") ||
      await digest(snapshot) !== result.review_snapshot_sha256)
      throw Error("Preview response does not match this saved selection or read-only evidence. Recheck before review.");
    return result;
  })();
  try {
    return await Promise.race([request, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error("The read-only preview timed out. No approval or save was attempted. You can request it again.")), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}
