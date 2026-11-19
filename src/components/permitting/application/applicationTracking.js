import { format, isValid } from "date-fns";

export const COMMON_DOCUMENTS = [
  "Sign drawings",
  "Site plan",
  "Contractor license",
  "Owner authorization",
  "Electrical drawings",
];

export function formatShortDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return isValid(date) ? format(date, "MMM d") : "";
}

export function getApplicationStages(line) {
  return [
    { key: "drafted", label: "Drafted", field: "drafted_date", date: line?.drafted_date, editable: true },
    { key: "submitted", label: "Submitted", field: "submitted_date", date: line?.submitted_date, editable: false, hint: "Set in the workflow steps" },
    { key: "acknowledged", label: "Acknowledged", field: "acknowledged_date", date: line?.acknowledged_date, editable: true },
    { key: "review", label: "Under review", field: "under_review_date", date: line?.under_review_date, editable: true },
    { key: "approved", label: "Approved", field: "approval_date", date: line?.approval_date || line?.permit_received_date, editable: false, hint: "Set in permit details" },
  ].map((stage, index) => ({ ...stage, index }));
}

export function getRequiredDocuments(line) {
  return Array.isArray(line?.required_documents)
    ? line.required_documents.filter((doc) => doc && String(doc.name || "").trim())
    : [];
}

// What still stops this application from going in. Only checks what staff
// record here — never infers an office's requirements.
export function getSubmitReadiness(line) {
  const documents = getRequiredDocuments(line);
  const missing = [];
  if (!String(line?.submission_method || "").trim()) missing.push("Record how it will be submitted");
  if (documents.length === 0) missing.push("List the documents this office needs");
  documents.filter((doc) => !doc.done).forEach((doc) => missing.push(`${doc.name} not ready`));
  return { submitted: !!line?.submitted_date, ready: missing.length === 0, missing };
}

export function newDocument(name) {
  return { id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: name.trim(), done: false };
}