import { isVerifiedPermitPDFArchive } from "./permitArchiveVerification";

const submissionTypes = { permit_application: "Application form", checklist: "Submission checklist", fee_schedule: "Fee schedule" };
function webUrl(value) {
  try { const url = new URL(String(value || "")); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; }
  catch { return ""; }
}

export default function LocalitySubmissionContext({ jurisdiction }) {
  const documents = (jurisdiction.documents || []).filter(doc => submissionTypes[doc.doc_type]);
  const contact = jurisdiction.contact_info || {};
  const permittingUrl = webUrl(jurisdiction.permitting_url);
  return <section aria-label="Locality submission resources" className="min-w-0 space-y-3 rounded border bg-white p-3">
    <h3 className="font-semibold">Forms, fees and office contact</h3>
    <p className="text-sm text-gray-600">These resources belong to this locality’s repository. Confirm their current version and applicability with the office; a listed form or contact does not establish permit authority.</p>
    {permittingUrl && <a className="inline-flex min-h-11 items-center text-sm text-blue-700 underline [overflow-wrap:anywhere]" href={permittingUrl} target="_blank" rel="noopener noreferrer">Open locality permitting page</a>}
    {documents.length ? <ul className="space-y-3">{documents.map((doc, index) => {
      const sourceUrl = webUrl(doc.url), archiveUrl = webUrl(doc.file_url);
      const verified = isVerifiedPermitPDFArchive(doc) && !!archiveUrl;
      return <li key={`${doc.id || "document"}:${index}`} className="min-w-0 rounded border p-2 text-sm">
        <p className="font-medium [overflow-wrap:anywhere]">{doc.title || submissionTypes[doc.doc_type]}</p>
        <p className="text-xs text-gray-600">{submissionTypes[doc.doc_type]}</p>
        <div className="flex flex-wrap gap-x-4">
          {sourceUrl && <a className="inline-flex min-h-11 items-center text-blue-700 underline" href={sourceUrl} target="_blank" rel="noopener noreferrer">Open source form or page</a>}
          {verified && <a className="inline-flex min-h-11 items-center text-blue-700 underline" href={archiveUrl} target="_blank" rel="noopener noreferrer">Open verified stored PDF</a>}
        </div>
        {!sourceUrl && <p className="text-amber-800">Source link missing or unusable — confirm with the office.</p>}
        {!verified && <p className="text-xs text-amber-800">Verified stored PDF not available. The source may be an online form or a document still awaiting archival verification.</p>}
      </li>;
    })}</ul> : <p className="text-sm text-amber-800">No application form, checklist or fee schedule is recorded here yet. Ask the office for the current submission materials.</p>}
    <div className="space-y-1 border-t pt-3 text-sm">
      <h4 className="font-semibold">Recorded department contact — authority requires confirmation</h4>
      {contact.department && <p>{contact.department}</p>}
      {contact.phone && <p>Phone: {contact.phone}</p>}
      {contact.email && <p className="[overflow-wrap:anywhere]">Email: {contact.email}</p>}
      {contact.address && <p>{contact.address}</p>}
      {![contact.department, contact.phone, contact.email, contact.address].some(Boolean) && <p className="text-amber-800">No department contact is recorded.</p>}
      <p className="text-xs text-gray-600">Confirm who handles sign, zoning, building and electrical review for the property. County and city coverage may differ.</p>
    </div>
  </section>;
}
