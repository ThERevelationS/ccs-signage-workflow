import { useMemo, useState } from 'react';

const ROLES = [
  ['electrical_permit', 'Issues the electrical permit'],
  ['electrical_inspection', 'Inspects the electrical work'],
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
        <label className="text-xs">Electrical job
          <select aria-label="Filter by electrical job" className="mt-1 min-h-11 w-full rounded border bg-white px-2 text-sm" value={role} onChange={event => setRole(event.target.value)}>
            <option value="all">Both jobs</option>
            {ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs">Find a town
          <input aria-label="Search towns with open electrical questions" className="mt-1 min-h-11 w-full rounded border bg-white px-3 text-sm" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or town ID" />
        </label>
      </div>
      <p role="status" className="text-xs text-gray-600">Showing {visible.length} of {gaps.length} places where an electrical office or inspector isn't settled.</p>
      <ul className="space-y-3 text-sm">
        {visible.map(row => <li key={row.id} className="rounded border bg-white p-3">
          <strong>{row.state} {row.name}</strong>
          <span className="block text-xs text-gray-600">Town ID: {row.id}{row.legacy_broad_role_present ? " · An old generic role is saved — it doesn't settle who issues or inspects." : ''}</span>
          <ul className="mt-2 space-y-1">
            {row.unresolved.map(([key, label]) => <li key={key}>
              <strong>{label}:</strong> {row.roles[key] === 'needs_review' ? 'Set up — still needs a staff check.' : 'Nobody is saved for this job.'}
            </li>)}
          </ul>
          {canReview && <button type="button" aria-label={'Check the office setup for ' + row.name} className="mt-3 min-h-11 rounded border bg-white px-3 text-sm underline" disabled={Boolean(openingId || recordOpen)} onClick={() => onReview?.(row.id)}>
            {openingId === row.id ? 'Opening…' : 'Check office setup'}
          </button>}
        </li>)}
      </ul>
      {!visible.length && <p className="text-sm">No open electrical questions match.</p>}
      <p className="text-xs text-gray-600">Flags come from saved setups only. Check the office's real identity, proof, coverage, and whether it applies to the job address before relying on either.</p>
    </div>
  );
}
