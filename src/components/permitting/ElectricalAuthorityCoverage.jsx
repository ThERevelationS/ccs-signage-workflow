import { summarizeElectricalRoleCoverage } from '../../../base44/shared/permittingAddressLocality.js';

export default function ElectricalAuthorityCoverage({ authority, selectionContext = 'manual' }) {
  const coverage = summarizeElectricalRoleCoverage(authority?.verified_roles || [], authority?.roles_needing_review || []);
  const statusLabels = { staff_verified: 'Staff reviewed', needs_review: 'Needs staff review', missing: 'Not established' };
  const unresolved = ['electrical_permit', 'electrical_inspection'].filter(role => coverage.roles[role] !== 'staff_verified');
  const guidance = {
    electrical_permit: {
      missing: 'No distinct electrical permit issuer is established. Research the official electrical permit application, current requirements and the government office that actually issues permits for this service area.',
      needs_review: 'An issuer role is configured but awaits staff review. Compare its canonical office identity, issuing responsibility and exact service-area evidence against the current official source.'
    },
    electrical_inspection: {
      missing: 'No distinct electrical inspection provider is established. Research official inspection scheduling and responsibility records to identify who actually performs inspections in this service area.',
      needs_review: 'An inspection role is configured but awaits staff review. Confirm the named inspection provider, inspection responsibility and exact area using current official evidence.'
    }
  };
  return (
    <section aria-label="Electrical authority coverage" className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-gray-900">
      <p className="font-semibold">Electrical authority coverage</p>
      <dl className="mt-1 space-y-1">
        {[['electrical_permit', 'Permit issuer'], ['electrical_inspection', 'Inspection provider']].map(([role, label]) => (
          <div key={role} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
            <dt>{label}</dt><dd className="font-medium">{statusLabels[coverage.roles[role]]}</dd>
          </div>
        ))}
      </dl>
      {coverage.legacy_broad_role_present && <p className="mt-1">A broad electrical role is recorded. Issuance and inspection still require separate review.</p>}
      {unresolved.length > 0 && <div className="mt-2 border-t border-amber-200 pt-2 space-y-1" aria-label="Electrical role follow-up guidance">
        <p className="font-semibold">Next: resolve the separate electrical office evidence</p>
        {unresolved.map(role => <p key={role}><strong>{role==='electrical_permit'?'Permit issuer':'Inspection provider'}:</strong> {guidance[role][coverage.roles[role]]}</p>)}
        {selectionContext==='manual' ?
          <p>Manual selection is not a verified job-address match. Enter the complete job address and use “Find my jurisdiction” to check its location before relying on an office.</p> :
          <p>A searched address or map match does not prove an office’s boundaries. Verify the specific government jurisdiction and any county or parent-office overlays before applying a role.</p>}
        <p>Use “Check this place” to inspect saved official forms and links. An authorized administrator may use “Find missing information”; staff must review official evidence and the exact canonical office/role before marking a relationship reviewed. Do not substitute an office name, ZIP code or unverified AI result.</p>
      </div>}
      <p className="mt-1 text-gray-700">Even if both roles are staff reviewed, confirm applicability and current official sources for this sign and electrical work. Office review does not establish every required permit or inspection.</p>
    </section>
  );
}
