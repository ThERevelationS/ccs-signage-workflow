import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { normalizeAddressState } from '../../shared/permittingAddressState.js';
import { staffEntities } from "@/components/staff/staffEntities";

const PAGE_SIZE = 50;
const Profile = staffEntities.JurisdictionProfile;
const exactId = value => typeof value === 'string' && value.length > 0 && value.trim() === value;
const stateCode = value => normalizeAddressState(value).toUpperCase();
const displayId = value => typeof value === 'string' && value.trim()
  ? value
  : value == null || value === '' ? 'Not recorded' : 'Malformed non-text value';

export default function LocalityProfileLinkEditor({
  localityId,
  localityState,
  currentProfileId,
  onLink,
}) {
  const [profiles, setProfiles] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const request = useRef(0);
  const loadingRef = useRef(false);
  const state = stateCode(localityState);
  const canLoad = ['OH', 'KY'].includes(state);

  useEffect(() => () => { request.current += 1; }, []);

  const loadNext = async () => {
    if (!canLoad || loadingRef.current || typeof Profile?.filter !== 'function') return;
    loadingRef.current = true;
    const requestId = ++request.current;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const page = await Profile.filter({ state }, 'name', PAGE_SIZE, offset);
      if (request.current !== requestId) return;
      if (!Array.isArray(page)) throw new Error('Profile page was not a list.');
      const valid = page.filter(row => exactId(row?.id) && stateCode(row?.state) === state);
      setProfiles(previous => {
        const byId = new Map(previous.map(row => [row.id, row]));
        valid.forEach(row => byId.set(row.id, row));
        return [...byId.values()];
      });
      setOffset(offset + page.length);
      setHasMore(page.length === PAGE_SIZE);
      setLoaded(true);
      setSelectedId('');
    } catch {
      if (request.current === requestId) setError('Repository profiles could not be loaded. Retry this read; no link was changed.');
    } finally {
      if (request.current === requestId) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  };

  const visible = profiles.filter(row => {
    const term = search.trim().toLowerCase();
    return !term || String(row.name || '').toLowerCase().includes(term) ||
      String(row.id).toLowerCase().includes(term);
  });
  const selected = profiles.find(row => row.id === selectedId);

  const stageLink = async () => {
    if (!selected || checking || typeof Profile?.get !== 'function') return;
    const requestId = ++request.current;
    setChecking(true);
    setError('');
    setNotice('');
    try {
      const fresh = await Profile.get(selected.id);
      if (request.current !== requestId) return;
      if (fresh?.id !== selected.id || !exactId(fresh.id)) {
        setError('The exact profile ID could not be confirmed. No link was staged.');
        return;
      }
      if (stateCode(fresh.state) !== state) {
        setError('The profile state changed or does not match this locality. No link was staged.');
        return;
      }
      onLink?.(fresh.id);
      setNotice('Exact profile ID and state confirmed. Save the locality to apply this link.');
    } catch {
      if (request.current === requestId) setError('The exact profile could not be rechecked. No link was staged.');
    } finally {
      if (request.current === requestId) setChecking(false);
    }
  };

  return (
    <section aria-label="Repository profile link" className="space-y-2 rounded border border-blue-200 bg-blue-50 p-3">
      <div>
        <h4 className="text-sm font-semibold">Jurisdiction repository link</h4>
        <p className="text-xs text-gray-700">Current saved profile ID: <span className="break-all font-mono">{displayId(currentProfileId)}</span></p>
      </div>
      {!canLoad ? (
        <p className="text-xs">Choose Ohio or Kentucky in the locality state field to load repository profiles for an exact, same-state link.</p>
      ) : (
        <>
          <p className="text-xs text-gray-700">Load profiles only when needed, then choose one exact record. No locality is linked automatically by name, ZIP code, or county. Matching state alone does not prove geographic identity or service area.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded border bg-white px-3 text-sm" disabled={loading || checking} onClick={loadNext}>
              {loading ? 'Loading profiles…' : loaded ? `Load next ${PAGE_SIZE} profiles` : `Load profiles for ${state}`}
            </button>
            {hasMore && <span className="self-center text-xs text-gray-600">More profiles are available; load the next page to find another record.</span>}
          </div>
          {loaded && (
            <div className="space-y-2">
              <label className="block text-xs">Search loaded profile names or exact IDs
                <input className="mt-1 min-h-11 w-full rounded border bg-white px-3 text-sm" value={search} onChange={event => setSearch(event.target.value)} />
              </label>
              <label className="block text-xs">Select an exact {state} repository profile
                <select className="mt-1 min-h-11 w-full rounded border bg-white px-3 text-sm" value={selectedId} onChange={event => setSelectedId(event.target.value)}>
                  <option value="">Choose a profile</option>
                  {visible.map(profile => <option key={profile.id} value={profile.id}>{profile.name || 'Unnamed profile'} · {profile.type || 'type not recorded'} · {profile.state} · {profile.id}</option>)}
                </select>
              </label>
              <button type="button" className="min-h-11 rounded border bg-white px-3 text-sm" disabled={!selected || checking || selected.id === currentProfileId} onClick={stageLink}>
                {checking ? 'Rechecking exact profile…' : 'Stage exact profile link'}
              </button>
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {notice && <p role="status" className="text-xs text-green-800">{notice}</p>}
      {currentProfileId && selected && selected.id !== currentProfileId && (
        <p className="text-xs text-amber-900">Saving this change replaces the current profile ID shown above. Review the locality and exact profile before saving.</p>
      )}
      {localityId && <p className="text-xs text-gray-600">Link selection stays unsaved until you choose Save Locality. It does not verify permitting authority, legal responsibility, or job-address applicability.</p>}
    </section>
  );
}