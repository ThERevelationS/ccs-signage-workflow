import { summarizeElectricalRoleCoverage } from '../../../base44/shared/permittingAddressLocality.js';

export default function ElectricalAuthorityCoverage({ authority }) {
  const coverage = summarizeElectricalRoleCoverage(authority?.verified_roles || [], authority?.roles_needing_review || []);
  const statusLabels = { staff_verified: 'Staff reviewed', needs_review: 'Needs staff review', missing: 'Not established' };
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
      <p className="mt-1 text-gray-700">Confirm applicability for this project. Office review does not establish every required permit or inspection.</p>
    </section>
  );
}
