// Conservative office-name cleaner for scraped junk: page-navigation text
// glued onto a role ("HALL RENTALS Zoning Office"), doubled words
// ("Planning Planning Commission"), and generic role-label placeholders.
// Used by the needs-a-person cleanup script and its known-answer tests.
// Conservative by contract: it only strips a closed list of known boilerplate
// from the FRONT of the name — anything else is left untouched.

// Only unambiguous navigation/scrape glue — words that could begin a real
// office name (community, business, planning, village) stay out on purpose.
const NAV_PREFIXES = [
  'hall rentals', 'contact us', 'quick links', 'online services',
  'how do i', 'staff directory', 'document center', 'pay now', 'sign in',
  'log in', 'skip to main content', 'skip to content', 'skip to',
  'back to top', 'site map', 'sitemap', 'main menu',
  'frequently asked questions', 'faq',
  'city auditor archive', 'county auditor archive',
  'village administrative office', 'an official', 'owners', 'commissions',
  'services',
].sort((a, b) => b.length - a.length); // longest first — 'quick links' before 'quick'

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Whole-name generic labels — a name that says only "zoning office" or "sign
// permit issuer" is a placeholder for a role, not a discovered office.
const GENERIC_NAMES = new Set([
  'office', 'official', 'inspector', 'department', 'dept', 'authority',
  'staff', 'contact', 'administration', 'administrator', 'clerk', 'permit',
  'permits', 'zoning', 'an official',
  'zoning office', 'permit office', 'sign permit office', 'sign permit issuer',
  'permit issuer', 'zoning authority', 'permit authority',
  'building dept', 'planning office', 'planning authority', 'street dept',
  'electrical office', 'electrical inspector', 'electrical inspection',
  'historic review office', 'historic review authority',
  'historic/design review authority', 'historic / design review authority',
  'historic and design review authority', 'historic district office',
  'right-of-way office', 'right of way office', 'row office',
]);
export function isGenericOfficeName(name) {
  const n = norm(name);
  if (!n) return true;
  if (GENERIC_NAMES.has(n)) return true;
  const words = n.split(' ');
  return words.length === 1 && /^(office|official|inspector|department|dept|authority|staff|clerk|contact|administrator|administration)$/.test(n);
}

// Strip known boilerplate prefixes, collapse doubled words, report what came
// off. Returns { clean, generic, stripped[] }.
export function cleanOfficeName(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  const stripped = [];
  if (!s) return { clean: '', generic: true, stripped };
  let low = s.toLowerCase();
  for (;;) {
    const hit = NAV_PREFIXES.find((p) => low.startsWith(p + ' '));
    if (!hit) break;
    s = s.slice(hit.length).trim();
    stripped.push(hit);
    low = s.toLowerCase();
    if (!s) break;
  }
  // Collapse doubled consecutive words — "Planning Planning Commission".
  const dedup = [];
  for (const w of s.split(' ')) {
    if (dedup.length && dedup[dedup.length - 1].toLowerCase() === w.toLowerCase()) continue;
    dedup.push(w);
  }
  s = dedup.join(' ').trim();
  return { clean: s, generic: isGenericOfficeName(s), stripped };
}

// Placeholder offices are jurisdiction-name + a generic role label
// ("Eden Township Sign permit office", "Sign permit issuer") — synthetic
// stubs a real office can absorb. Strip the locality's own words from the
// front; if what remains is generic, it's a placeholder.
export function isPlaceholderOffice(name, locName) {
  const cleaned = cleanOfficeName(name).clean;
  if (isGenericOfficeName(cleaned)) return true;
  const locWords = new Set(norm(locName).split(' ').filter((w) => w && !/^(city|village|township|of|the)$/i.test(w)));
  const words = cleaned.split(' ');
  let i = 0;
  while (i < words.length && (locWords.has(words[i].toLowerCase()) || /^(city|village|township|of|the)$/i.test(words[i]))) i++;
  return i > 0 && isGenericOfficeName(words.slice(i).join(' '));
}
