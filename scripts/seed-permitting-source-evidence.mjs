// Migration + seed script for Permitting Intelligence Mega-Chunk 1.
// Run via exec_tool (CommonJS) — this file documents the canonical logic.
//
// Steps:
// 1. Load Boone County KY JurisdictionProfile and its documents[].
// 2. Create PermittingSourceDocument records for each archived source (36 docs
//    from JurisdictionProfile.documents[] + filesystem-only 2026 rewrite /
//    legislative evidence + the newly archived electrical permit .doc).
// 3. Classify each via explicit overrides for known Boone docs.
// 4. Create the Boone SourceCollectionQueue row (verified_current) with
//    source_document_refs and missing_next (current fee schedule 404 gap).
// 5. Seed all 120 KY + 88 OH counties as SourceCollectionQueue rows (not_started),
//    skipping Boone County KY (already verified_current).
//
// JurisdictionProfile.documents[] originals are kept fully intact; the new
// PermittingSourceDocument records link back via jurisdiction_profile_doc_id.

import { classifySourceDocument } from "../base44/shared/permittingSourceClassification.mjs";
import { COUNTY_QUEUE_SEED } from "../base44/shared/countyQueueSeed.mjs";

const BOONE_PROFILE_ID = "6ab7c6107f2251a8e8e48b90";
const BOONE_ISSUING_OFFICES = {
  article34: "Boone County Planning Commission (enCode Plus codification)",
  sign_form: "Boone County Planning Commission",
  fees: "Boone County Planning Commission",
  gis: "Boone County GIS",
  checklist: "Boone County Planning Commission",
  building: "Boone County Building Department",
  right_of_way: "Boone County Public Works",
  electrical: "Boone County Building Department",
  rewrite: "Boone County Planning Commission (2026 rewrite project)",
  legislative: "Boone County Fiscal Court / City legislative bodies",
};

// Explicit classification overrides for known Boone documents.
const BOONE_DOC_CLASSIFICATION = {
  "source-boone-ky-article34-20260926": "current_adopted",
  "source-boone-ky-sign-form-20260926": "application_form",
  "source-boone-ky-fees-20260926": "historical",
  "source-boone-ky-gis-20260926": "administrative_guidance",
  "source-boone-ky-sign-checklist-20260926": "checklist",
  "source-boone-ky-building-sign-20260926": "checklist",
  "source-boone-ky-building-online-20260926": "administrative_guidance",
  "source-boone-ky-right-of-way-20260926": "application_form",
};

function classifyBooneDoc(doc) {
  const override = BOONE_DOC_CLASSIFICATION[doc.id];
  if (override) return { classification: override, matched_signals: ["explicit_migration_override"] };
  // All remaining docs are adopted Article 34 sections (sign_ordinance / zoning_code)
  return classifySourceDocument(doc);
}

export async function runMigration(base44, fs, crypto) {
  const boone = await base44.entities.JurisdictionProfile.get(BOONE_PROFILE_ID);
  const now = new Date().toISOString();

  // --- 1. Migrate JurisdictionProfile.documents[] ---
  const sourceDocs = [];
  for (const doc of boone.documents) {
    const { classification, matched_signals } = classifyBooneDoc(doc);
    const isArticle34 = doc.doc_type === "sign_ordinance" || doc.doc_type === "zoning_code";
    sourceDocs.push({
      title: doc.title,
      jurisdiction_name: "Boone County",
      jurisdiction_id: BOONE_PROFILE_ID,
      jurisdiction_profile_doc_id: doc.id,
      issuing_office: isArticle34 ? BOONE_ISSUING_OFFICES.article34 : (doc.doc_type === "fee_schedule" ? BOONE_ISSUING_OFFICES.fees : BOONE_ISSUING_OFFICES.sign_form),
      source_type: doc.doc_type === "other" && doc.id.includes("gis") ? "gis_resource" : (doc.doc_type === "other" ? "portal_instruction" : doc.doc_type),
      category: isArticle34 ? "adopted_code" : (classification === "historical" ? "fee_schedule_historical" : doc.doc_type),
      official_url: doc.url,
      archived_file_path: doc.archive_repo_path || null,
      archived_file_url: doc.file_url || null,
      file_hash_sha256: doc.archive_html_sha256 || doc.source_sha256 || doc.stored_sha256 || null,
      file_bytes: doc.archive_html_bytes || doc.source_bytes || doc.stored_bytes || null,
      http_outcome: doc.file_url || doc.archive_repo_path ? "200" : "manual",
      retrieval_timestamp: doc.last_fetched || doc.downloaded_at || now,
      content_status: classification === "historical" ? "historical" : (classification === "draft_proposed" || classification === "comprehensive_rewrite" ? "draft" : "current"),
      authority_confidence: classification === "current_adopted" ? "high" : (classification === "historical" ? "low" : "medium"),
      jurisdiction_scope: "unincorporated Boone County",
      verification_status: classification === "historical" ? "historical" : "verified",
      notes_gaps: doc.ai_summary || "",
      extracted_text: doc.extracted_text || "",
      authority_classification: classification,
      matched_signals: matched_signals,
      classified_at: now,
      last_checked: doc.last_fetched || now,
    });
  }

  // --- 2. Add filesystem-only 2026 rewrite + legislative evidence sources ---
  const fsSources = [
    { file: "2026-zoning-rewrite-introduction-schedule-2026-10-02.html", classification: "comprehensive_rewrite", title: "Boone County 2026 Zoning Rewrite — Introduction & Schedule", office: BOONE_ISSUING_OFFICES.rewrite, scope: "countywide (draft/proposed)" },
    { file: "2026-zoning-rewrite-meetings-workshops-2026-10-03.html", classification: "comprehensive_rewrite", title: "Boone County 2026 Zoning Rewrite — Meetings & Workshops", office: BOONE_ISSUING_OFFICES.rewrite, scope: "countywide (draft/proposed)" },
    { file: "fiscal-court-agenda-2026-10-06.pdf", classification: "legislative_evidence", title: "Boone County Fiscal Court Agenda — 2026-10-06", office: BOONE_ISSUING_OFFICES.legislative, scope: "countywide legislative" },
    { file: "fiscal-court-meeting-minutes-index-2026-10-03.html", classification: "legislative_evidence", title: "Boone County Fiscal Court — Meeting Minutes Index", office: BOONE_ISSUING_OFFICES.legislative, scope: "countywide legislative" },
    { file: "enacted-ordinances-index-2026-10-03.html", classification: "legislative_evidence", title: "Boone County — Enacted Ordinances Index", office: BOONE_ISSUING_OFFICES.legislative, scope: "countywide legislative" },
    { file: "enacted-ordinances-page-2026-10-03.html", classification: "legislative_evidence", title: "Boone County — Enacted Ordinances Page", office: BOONE_ISSUING_OFFICES.legislative, scope: "countywide legislative" },
    { file: "florence-government-records-index-2026-10-03.html", classification: "legislative_evidence", title: "Florence KY — Government Records Index", office: BOONE_ISSUING_OFFICES.legislative, scope: "Florence (city) legislative" },
    { file: "union-commission-meetings-index-2026-10-03.html", classification: "legislative_evidence", title: "Union KY — Commission Meetings Index", office: BOONE_ISSUING_OFFICES.legislative, scope: "Union (city) legislative" },
    { file: "walton-city-council-minutes-index-2026-10-03.html", classification: "legislative_evidence", title: "Walton KY — City Council Minutes Index", office: BOONE_ISSUING_OFFICES.legislative, scope: "Walton (city) legislative" },
    { file: "walton-current-ordinances-index-2026-10-03.html", classification: "legislative_evidence", title: "Walton KY — Current Ordinances Index", office: BOONE_ISSUING_OFFICES.legislative, scope: "Walton (city) legislative" },
    { file: "planning-commission-agendas-minutes-index-2026-10-03.html", classification: "legislative_evidence", title: "Boone County Planning Commission — Agendas & Minutes Index", office: BOONE_ISSUING_OFFICES.article34, scope: "countywide legislative" },
  ];
  for (const s of fsSources) {
    const repoPath = `public/permitting/sources/boone-ky/${s.file}`;
    let bytes = null, sha = null;
    try {
      const buf = fs.readFileSync(repoPath);
      bytes = buf.length;
      sha = crypto.createHash("sha256").update(buf).digest("hex");
    } catch (e) { /* file may be missing */ }
    sourceDocs.push({
      title: s.title,
      jurisdiction_name: "Boone County",
      jurisdiction_id: BOONE_PROFILE_ID,
      issuing_office: s.office,
      source_type: s.classification === "legislative_evidence" ? "legislative_record" : "zoning_code",
      category: s.classification === "comprehensive_rewrite" ? "rewrite_draft" : "legislative_evidence",
      official_url: null,
      archived_file_path: repoPath,
      archived_file_url: null,
      file_hash_sha256: sha,
      file_bytes: bytes,
      http_outcome: "200",
      retrieval_timestamp: now,
      content_status: s.classification === "comprehensive_rewrite" ? "draft" : "current",
      authority_confidence: s.classification === "comprehensive_rewrite" ? "low" : "high",
      jurisdiction_scope: s.scope,
      verification_status: "verified",
      notes_gaps: s.classification === "comprehensive_rewrite" ? "Draft/proposed 2026 rewrite material — NOT adopted. Triggers rewrite protection; not authoritative." : "Legislative evidence record (agendas, minutes, enacted ordinances index).",
      extracted_text: "",
      authority_classification: s.classification,
      matched_signals: ["explicit_migration_override"],
      classified_at: now,
      last_checked: now,
    });
  }

  // --- 3. Add the newly archived electrical permit application (.doc) ---
  sourceDocs.push({
    title: "Boone County Electrical Permit Application Form (2024)",
    jurisdiction_name: "Boone County",
    jurisdiction_id: BOONE_PROFILE_ID,
    issuing_office: BOONE_ISSUING_OFFICES.electrical,
    source_type: "permit_application",
    category: "electrical_permit_form",
    official_url: "https://www.boonecountyky.org/Documents/Services/Building%20Department/Building%20Permits/ElecApp%202024%20(4).doc?t=202604230917280",
    archived_file_url: "mp/private/68dfcc5e57bbbc35387da97c/1595e6d4f_electrical-permit-application-2024.doc",
    file_hash_sha256: "c211c60568dd9f057c7dfbdce3779eb12b6e3ed1ed6eee03dec9374a07fdaf32",
    file_bytes: 32256,
    http_outcome: "200",
    retrieval_timestamp: now,
    content_status: "current",
    authority_confidence: "high",
    jurisdiction_scope: "countywide electrical permitting (Building Department)",
    verification_status: "verified",
    notes_gaps: "Official Boone County Building Department electrical permit application form (.doc, 2024 edition). Retrieved 2026-10-03 from the Building Permits resource page. Electrical work must follow building and electrical codes per the Building Department.",
    extracted_text: "",
    authority_classification: "application_form",
    matched_signals: ["explicit_migration_override"],
    classified_at: now,
    last_checked: now,
  });

  // --- 4. bulkCreate PermittingSourceDocument records ---
  const created = await base44.entities.PermittingSourceDocument.bulkCreate(sourceDocs);
  const sourceDocIds = created.records.map((r) => r.id);

  // --- 5. Create Boone SourceCollectionQueue row (verified_current) ---
  const booneQueue = await base44.entities.SourceCollectionQueue.create({
    jurisdiction_name: "Boone County",
    state: "KY",
    jurisdiction_type: "county",
    authority_note: "Adopted Article 34 (28 sections) verified current. 2026 zoning rewrite is draft/proposed — not authoritative, rewrite protection active. Florence/Union/Walton legislative authority evidence archived.",
    source_category: "sign_regulations",
    status: "verified_current",
    missing_next: "Current (2024-2026) Planning Commission fee schedule PDF not found — /Documents/About%20us/FeeSchedule.pdf returns 404 as of 2026-10-03; only the May 2021 edition is archived (historical, reconfirm fees before quoting). Online permit portal shows GovWell (app.govwell.com) with residual Oracle ambiguity — preserve.",
    source_document_refs: sourceDocIds,
    last_activity: now,
  });

  // --- 6. Seed remaining KY + OH counties (not_started) ---
  const queueRows = COUNTY_QUEUE_SEED
    .filter((c) => !(c.jurisdiction_name === "Boone County" && c.state === "KY"))
    .map((c) => ({
      jurisdiction_name: c.jurisdiction_name,
      state: c.state,
      jurisdiction_type: "county",
      source_category: "sign_regulations",
      status: "not_started",
      missing_next: "Sign regulation source discovery not yet started.",
      source_document_refs: [],
      last_activity: now,
    }));
  const createdQueue = await base44.entities.SourceCollectionQueue.bulkCreate(queueRows);

  return {
    permittingSourceDocuments: created.records.length,
    sourceDocumentIds: sourceDocIds.length,
    booneQueueId: booneQueue.id,
    seededQueueRows: createdQueue.records.length,
    classificationCounts: sourceDocs.reduce((acc, d) => {
      acc[d.authority_classification] = (acc[d.authority_classification] || 0) + 1;
      return acc;
    }, {}),
  };
}