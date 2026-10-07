import OhioMunicipalResearchResources from "./OhioMunicipalResearchResources";
import ElectricalResearchResources from "./ElectricalResearchResources";
import LocalityOfficeEvidence from "./LocalityOfficeEvidence";
import LocalitySubmissionContext from "./LocalitySubmissionContext";
import { useState } from "react";
import PermittingApprovedEvidenceSearch from "@/components/admin/PermittingApprovedEvidenceSearch";

function EvidenceDisclosure({ jurisdiction, isAdmin, retrieveOfficeEvidence, retrieveApprovedEvidence }) {
  const [expanded, setExpanded] = useState(false);
  return <details className="min-w-0 rounded-lg border border-green-200 bg-green-50" open={expanded}
    onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer rounded-lg p-3 text-sm font-semibold text-green-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600">
      Approved sign requirements — {jurisdiction.name}
    </summary>
    <div className="min-w-0 space-y-3 p-3 pt-0 [overflow-wrap:anywhere]">
      <p className="text-sm text-gray-700">Check cited sign rules and reviewed submission instructions separately from research summaries. A locality match alone does not establish which rules apply to the job address.</p>
      {expanded && <LocalitySubmissionContext jurisdiction={jurisdiction} />}
      {expanded && isAdmin && <LocalityOfficeEvidence jurisdictionId={jurisdiction.id} retrieveEvidence={retrieveOfficeEvidence} />}
      {expanded && (isAdmin
        ? <PermittingApprovedEvidenceSearch jurisdictionId={jurisdiction.id} jurisdictionName={jurisdiction.name} retrieveEvidence={retrieveApprovedEvidence} />
        : <p className="text-sm text-gray-700">An administrator must load and verify approved evidence. Use the official documents below and confirm the requirements with the responsible office.</p>)}
    </div>
  </details>;
}

export default function LocalityApprovedEvidence({ jurisdiction, isAdmin = false, retrieveOfficeEvidence, retrieveApprovedEvidence }) {
  // Switching locality or losing admin status removes pending requests and prior quotes immediately.
  return <div className="min-w-0 space-y-3"><EvidenceDisclosure key={`${jurisdiction.id}:${isAdmin ? "admin" : "staff"}`} jurisdiction={jurisdiction} isAdmin={isAdmin} retrieveOfficeEvidence={retrieveOfficeEvidence} retrieveApprovedEvidence={retrieveApprovedEvidence} /><ElectricalResearchResources jurisdiction={jurisdiction} isAdmin={isAdmin} /><OhioMunicipalResearchResources jurisdiction={jurisdiction} isAdmin={isAdmin} /></div>;
}
