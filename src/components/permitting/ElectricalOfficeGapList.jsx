import { useMemo, useState } from 'react';

const ROLES = [
  ['electrical_permit', 'Electrical permit issuer'],
  ['electrical_inspection', 'Electrical inspection provider'],
];
const STATES = [['all', 'All states'], ['OH', 'Ohio'], ['KY', 'Kentucky']];

export default function ElectricalOfficeGapList({ gaps = [], canReview = false, openingId = null, recordOpen = false, onReview }) {
  const [state, setState] = useState('all');
  const [role, setRole] = useState('all');
  const [search, setSearch] = useState('');
  const visible = useMemo(() => gaps.flatMap(row => {
    if (state !== 'all' && row.state !== state) return [];
    if (!String(row.name || '').toLowerCase().includes(search.trim().toLowerCase()) &&
        !String(row.id || '').toLowerCase().includes(search.trim().toLowerCase())) return [];
    const unresolved = ROLES.filter(([key]) => row.roles?.[key] !== 'staff_verified' &&
      (role === 'all' || role === key));
    return unresolved.length ? [{ ...row, unresolved }] : [];
  }), [gaps, role, search, state]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs">State
          <select aria-label="Filter electrical gaps by state" className="mt-1 min-h-11 w-full rounded border bg-white px-2 text-sm" value={state} onChange={event => setState(event.target.value)}>
            {STATES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs">Electrical responsibility
          <select aria-label="Filter electrical gaps by responsibility" className="mt-1 min-h-11 w-full rounded border bg-white px-2 text-sm" value={role} onChange={event => setRole(event.target.value)}>
            <option value="all">Both responsibilities</option>
            {ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs">Find a locality
          <input aria-label="Search electrical gap localities" className="mt-1 min-h-11 w-full rounded border bg-white px-3 text-sm" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or locality ID" />
        </label>
      </div>
      <p role="status" className="text-xs text-gray-600">Showing {visible.length} of {gaps.length} localities with at least one unresolved separate electrical role.</p>
      <ul className="space-y-3 text-sm">
        {visible.map(row => <li key={row.id} className="rounded border bg-white p-3">
          <strong>{row.state} {row.name}</strong>
          <span className="block text-xs text-gray-600">Locality ID: {row.id}{row.legacy_broad_role_present ? ' · Legacy generic electrical role recorded; it does not establish either responsibility.' : ''}</span>
          <ul className="mt-2 space-y-1">
            {row.unresolved.map(([key, label]) => <li key={key}>
              <strong>{label}:</strong> {row.roles[key] === 'needs_review' ? 'Configured; staff review remains open.' : 'No separate role is assigned in this saved setup.'}
            </li>)}
          </ul>
          {canReview && <button type="button" aria-label={'Review office setup for ' + row.name} className="mt-3 min-h-11 rounded border bg-white px-3 text-sm underline" disabled={Boolean(openingId || recordOpen)} onClick={() => onReview?.(row.id)}>
            {openingId === row.id ? 'Opening saved locality…' : 'Review locality office setup'}
          </button>}
        </li>)}
      </ul>
      {!visible.length && <p className="text-sm">No unresolved electrical roles match these filters.</p>}
      <p className="text-xs text-gray-600">Review flags describe saved setups only. Confirm exact office identity, source evidence, service area, current authority, and job-address applicability before relying on either role.</p>
    </div>
  );
}
