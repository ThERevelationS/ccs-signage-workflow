import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findRepositoryJurisdictionMatches } from '../src/components/permitting/jurisdictionPermitBridge.js';

const profiles = [
  { id: 'profile-canonical', name: 'Example City', state: 'OH', type: 'city' },
  { id: 'profile-name-collision', name: 'Example City', state: 'OH', type: 'municipality' },
];

test('canonical tracker link wins over ambiguous repository name/state matches', () => {
  const matches = findRepositoryJurisdictionMatches(profiles, {
    suggested_locality: { name: 'Example City', state: 'OH', jurisdiction_profile_id: 'profile-canonical' },
    ai_locality_name: 'Example City', ai_state: 'OH',
  });
  assert.deepEqual(matches.map(row => row.id), ['profile-canonical']);
});

test('broken canonical link fails closed instead of falling back by name', () => {
  const matches = findRepositoryJurisdictionMatches(profiles, {
    suggested_locality: { name: 'Example City', state: 'OH', jurisdiction_profile_id: 'missing-profile' },
    ai_locality_name: 'Example City', ai_state: 'OH',
  });
  assert.deepEqual(matches, []);
});

test('legacy unlinked tracker result retains name/state compatibility', () => {
  const matches = findRepositoryJurisdictionMatches([
    profiles[0],
    { id: 'other-state', name: 'Example City', state: 'KY', type: 'city' },
  ], { suggested_locality: { name: 'Example City', state: 'OH' }, ai_state: 'OH' });
  assert.deepEqual(matches.map(row => row.id), ['profile-canonical']);
});

test('address resolver returns canonical profile id for both accepted match paths', () => {
  const source = readFileSync(new URL('../base44/functions/findLocalityByAddress/entry.ts', import.meta.url), 'utf8');
  const projection = '...(found.jurisdiction_profile_id ? { jurisdiction_profile_id: found.jurisdiction_profile_id } : {})';
  assert.equal(source.split(projection).length - 1, 2);
  assert.match(source, /directMatches\.length === 1 \|\| \(directMatches\.length > 1 && canonicalDirectMatches\.length === 1\)/);
  assert.match(source, /if \(aiIdentityMatches && aiResult\.confidence !== 'low'\)/);
});

test('ambiguous geocoder matches use exactly one canonical profile link and otherwise fail closed before AI selection', () => {
  const source = readFileSync(new URL('../base44/functions/findLocalityByAddress/entry.ts', import.meta.url), 'utf8');
  assert.match(source, /canonicalDirectMatches = directMatches\.filter/);
  assert.match(source, /matchMethod = directMatches\.length === 1 \? 'geocode_exact' : 'geocode_canonical_profile'/);
  assert.match(source, /else if \(directMatches\.length > 1\)/);
  assert.match(source, /canonicalDirectMatches\.length > 1/);
  const ambiguousGuard = source.indexOf("} else if (directMatches.length > 1) {");
  const aiFallback = source.indexOf("} else if (aiResult.suggested_locality_id) {");
  assert.ok(ambiguousGuard > 0 && aiFallback > ambiguousGuard, 'ambiguous geocoder matches must be handled before AI id fallback');
});
