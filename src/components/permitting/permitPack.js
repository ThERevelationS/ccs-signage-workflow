// MP-11.5 — Permit pack: one-click bundle of everything needed to file in a
// jurisdiction — office contacts, roles, form links, fee text, submission
// methods, review times, required documents, meeting schedule, ordinance
// link + sign-section excerpts — rendered to a printable PDF via jsPDF.
import { jsPDF } from "jspdf";

const clean = (v) => String(v ?? "").trim();
const ROLE_LABEL = {
  sign_permit: "Sign permit", zoning: "Zoning", building: "Building",
  electrical: "Electrical", electrical_permit: "Electrical permit",
  electrical_inspection: "Electrical inspection", right_of_way: "Right of way",
  historic_review: "Historic review", planning: "Planning",
  transportation: "Transportation", other: "Permitting",
};

export function buildPermitPack({ jurisdiction, locality }) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48; let y = M;
  const name = clean(jurisdiction?.name || locality?.name || "Jurisdiction");
  const state = clean(jurisdiction?.state || locality?.state);

  const line = (text, size = 10, bold = false, gap = 14) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(String(text), W - M * 2);
    for (const t of wrapped) {
      if (y > doc.internal.pageSize.getHeight() - M) { doc.addPage(); y = M; }
      doc.text(t, M, y); y += gap;
    }
  };
  const rule = () => { doc.setDrawColor(220); doc.line(M, y - 6, W - M, y - 6); y += 8; };
  const field = (label, value) => { if (clean(value)) line(`${label}: ${clean(value)}`, 10); };

  // Header
  line(`PERMIT PACK — ${name}${state ? `, ${state}` : ""}`, 16, true, 22);
  line(`Generated ${new Date().toLocaleString()} · CCS Signage Workflow`, 9, false, 18);
  rule();

  const offices = Array.isArray(locality?.offices) ? locality.offices : [];
  if (!offices.length) line("No offices on record for this jurisdiction — run office research first.", 10);

  offices.forEach((o, i) => {
    line(`${i + 1}. ${clean(o.name) || "Office"}`, 13, true, 20);
    const roles = (o.authority_roles || []).map((r) => ROLE_LABEL[r] || r).join(", ");
    field("Roles", roles);
    field("Verification", o.authority_verification_status === "staff_verified" ? `Verified (${o.corroboration_tier || "single_source"})` : (o.authority_verification_status || "unverified"));
    field("Phone", o.contact_phone); field("Email", o.contact_email);
    field("Website", o.contact_website); field("Address", o.contact_address);
    field("Hours", o.hours); field("Contact", o.contact_person);
    if (clean(o.application_form_url)) field("Application form", `${o.application_form_name || "Form"} — ${o.application_form_url}`);
    field("Fees", o.fee_schedule_text);
    if (clean(o.fee_schedule_url)) field("Fee schedule", o.fee_schedule_url);
    field("Submit via", (o.submission_methods || []).join("; "));
    field("Review time", o.typical_review_time);
    field("Required documents", (o.required_documents || []).join("; "));
    field("Meetings/deadlines", o.meeting_schedule_text);
    field("Inspection scheduling", o.inspection_contact);
    field("Permit validity", o.permit_expiry_text);
    if ((o.overlay_flags || []).length) field("Overlay flags", o.overlay_flags.join(", "));
    if (clean(o.data_as_of)) field("Data as of", clean(o.data_as_of).slice(0, 10));
    if (clean(o.contact_notes)) line(`Notes: ${clean(o.contact_notes).slice(0, 500)}`, 9);
    y += 8; rule();
  });

  // Ordinance excerpt
  const ord = jurisdiction?.office_research?.ordinance;
  if (ord?.sign_sections?.length) {
    line("SIGN CODE EXCERPTS", 13, true, 20);
    field("Source", ord.url);
    for (const s of ord.sign_sections.slice(0, 3)) line(`• ${clean(s).slice(0, 700)}`, 9, false, 12);
    if (ord.dimensional_facts?.length) {
      line("Dimensional facts:", 10, true);
      for (const f of ord.dimensional_facts) line(`  ${f.fact.replace(/_/g, " ")}: ${f.value}`, 9);
    }
  } else if (clean(jurisdiction?.ordinance_url)) {
    line("SIGN CODE", 13, true, 20);
    field("Source", jurisdiction.ordinance_url);
  }

  return doc;
}

export function downloadPermitPack(args) {
  const doc = buildPermitPack(args);
  const name = clean(args?.jurisdiction?.name || args?.locality?.name || "jurisdiction").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`permit-pack-${name}.pdf`);
}
