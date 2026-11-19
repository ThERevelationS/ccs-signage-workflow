// MP-4.3 — State certified-department rosters (corroboration source).
//
// Ohio BBS certifies jurisdictions that administer their own building code;
// non-certified areas fall to the county or state. Kentucky electrical
// inspection is performed by DHBC-certified inspectors statewide — a
// structural fact, not a per-jurisdiction list.
//
// com.ohio.gov blocks plain fetches, so the certified list is a maintained
// static snapshot (update when BBS republishes); the API is async to allow a
// future live-fetch refresh.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CACHE = '.audit-work/certified-depts-cache.json';

// Ohio BBS certified jurisdictions — static snapshot. A jurisdiction being
// certified means it administers its own building/electrical permits; the
// county does NOT issue permits inside it.
const OH_CERTIFIED = new Set([
  'akron', 'alliance', 'ashland', 'athens', 'avon', 'avon lake', 'bay village',
  'beachwood', 'beavercreek', 'bedford', 'bedford heights', 'bexley',
  'blue ash', 'bowling green', 'broadview heights', 'brooklyn', 'brunswick',
  'canton', 'centerville', 'chagrin falls', 'chillicothe', 'cincinnati',
  'cleveland', 'cleveland heights', 'columbus', 'cuyahoga falls', 'dayton',
  'delaware', 'dublin', 'east cleveland', 'eastlake', 'elyria', 'euclid',
  'fairborn', 'fairfield', 'fairlawn', 'findlay', 'fremont', 'gahanna',
  'green', 'grove city', 'hamilton', 'hilliard', 'hudson', 'independence',
  'kettering', 'lakewood', 'lancaster', 'lima', 'lorain', 'lyndhurst',
  'macedonia', 'marietta', 'marion', 'mentor', 'miamisburg', 'middleburg heights',
  'middletown', 'north olmsted', 'north ridgeville', 'north royalton',
  'norwood', 'parma', 'parma heights', 'perrysburg', 'pickerington',
  'reynoldsburg', 'rocky river', 'shaker heights', 'sidney', 'solon',
  'springfield', 'steubenville', 'strongsville', 'toledo', 'troy', 'twinsburg',
  'upper arlington', 'vandalia', 'wauseon', 'west carrollton', 'westerville',
  'westlake', 'whitehall', 'willoughby', 'wooster', 'worthington', 'xenia',
  'youngstown', 'zanesville',
]);

function loadCache() {
  try { return JSON.parse(readFileSync(CACHE, 'utf8')); } catch { return null; }
}
function saveCache(rows) {
  try { mkdirSync(dirname(CACHE), { recursive: true }); writeFileSync(CACHE, JSON.stringify({ t: Date.now(), rows }, null, 1)); } catch {}
}

/** Is `name` an Ohio BBS-certified jurisdiction (administers its own code)? */
export function ohioCertifiedDept(name) {
  const cache = loadCache();
  const list = cache?.rows || OH_CERTIFIED;
  return list.has(String(name || '').toLowerCase().replace(/\s+(city|village|twp|township)$/i, '').trim()) ||
         list.has(String(name || '').toLowerCase().trim());
}

/**
 * Kentucky electrical inspection is performed ONLY by state-certified
 * electrical inspectors licensed by DHBC — structural fact (KRS 227.480+).
 * Returns the corroboration statement for any KY jurisdiction.
 */
export function kyElectricalRoster() {
  return {
    fact: 'Kentucky electrical inspections are performed by state-certified electrical inspectors licensed by the Department of Housing, Buildings and Construction (DHBC), KRS 227.480+. Local electrical inspectors must hold DHBC certification; the inspector roster is maintained at dhbc.ky.gov.',
    roster_url: 'https://dhbc.ky.gov/',
    source: 'KRS 227.480-227.530',
  };
}

/** Refresh hook — a future headless pass can repopulate the OH list. */
export function refreshCertifiedDepts(names) {
  saveCache([...new Set(names.map((n) => String(n).toLowerCase().trim()))]);
}
