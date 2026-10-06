import LocalityOfficeEvidence from "./LocalityOfficeEvidence";
import LocalitySubmissionContext from "./LocalitySubmissionContext";
import { useState } from "react";
import PermittingApprovedEvidenceSearch from "@/components/admin/PermittingApprovedEvidenceSearch";

function EvidenceDisclosure({ jurisdiction, isAdmin }) {
  const [expanded, setExpanded] = useState(false);
  return <details className="min-w-0 rounded-lg border border-green-200 bg-green-50" open={expanded}
    onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer rounded-lg p-3 text-sm font-semibold text-green-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600">
      Approved sign requirements — {jurisdiction.name}
    </summary>
    <div className="min-w-0 space-y-3 p-3 pt-0 [overflow-wrap:anywhere]">
      <p className="text-sm text-gray-700">Check cited sign rules and reviewed submission instructions separately from research summaries. A locality match alone does not establish which rules apply to the job address.</p>
      {expanded && <LocalitySubmissionContext jurisdiction={jurisdiction} />}
      {expanded && isAdmin && <LocalityOfficeEvidence jurisdictionId={jurisdiction.id} />}
      {expanded && (isAdmin
        ? <PermittingApprovedEvidenceSearch jurisdictionId={jurisdiction.id} jurisdictionName={jurisdiction.name} />
        : <p className="text-sm text-gray-700">An administrator must load and verify approved evidence. Use the official documents below and confirm the requirements with the responsible office.</p>)}
    </div>
  </details>;
}

export default function LocalityApprovedEvidence({ jurisdiction, isAdmin = false }) {
  // Switching locality or losing admin status removes pending requests and prior quotes immediately.
  return <EvidenceDisclosure key={`${jurisdiction.id}:${isAdmin ? "admin" : "staff"}`} jurisdiction={jurisdiction} isAdmin={isAdmin} />;
}
