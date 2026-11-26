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
// Role-template placeholders: names that are nothing but role vocabulary
// plus a template suffix — "Right-of-way authority", "Electrical inspection
// office", "Holmes Building office" (optional locality prefix). Real
// providers end in department/commission/board/etc., not these stubs.
const ROLE_TOKENS = /^(sign|permits?|zoning|buildings?|electrical|electric|inspections?|right|of|way|historic|review|planning|land|use|code|entitlement|development|services|construction|licensing|licenses?|subdivision)$/i;
export function isRoleTemplateName(name, locName) {
  const cleaned = cleanOfficeName(name).clean;
  if (!cleaned) return false;
  let words = cleaned.split(/[\s-]+/); // 'Right-of-way authority' → right/of/way/authority
  const locWords = new Set(norm(locName).split(' ').filter((w) => w && !/^(city|village|township|of|the)$/i.test(w)));
  while (words.length && (locWords.has(words[0].toLowerCase()) || /^(city|village|township|of|the)$/i.test(words[0]))) words = words.slice(1);
  if (words.length < 2) return false;
  if (!/^(authority|office|issuer)$/i.test(words[words.length - 1])) return false;
  return words.slice(0, -1).every((w) => ROLE_TOKENS.test(w));
}

export function isPlaceholderOffice(name, locName) {
  const cleaned = cleanOfficeName(name).clean;
  if (isGenericOfficeName(cleaned)) return true;
  if (isRoleTemplateName(name, locName)) return true;
  const locWords = new Set(norm(locName).split(' ').filter((w) => w && !/^(city|village|township|of|the)$/i.test(w)));
  const words = cleaned.split(' ');
  let i = 0;
  while (i < words.length && (locWords.has(words[i].toLowerCase()) || /^(city|village|township|of|the)$/i.test(words[i]))) i++;
  return i > 0 && isGenericOfficeName(words.slice(i).join(' '));
}

// ── Non-permitting bodies ────────────────────────────────────────────────
// An office is only retired as non-permit when its own (cleaned) name says
// so — evidence reasons alone never retire anything. Clerk offices are
// protected: in small KY/OH cities the city clerk issues permits; only
// "clerk of courts" is a non-permit body.
const NON_PERMIT_RE = /police|sheriff|marshal\b|clerk of courts|\bcourts?\b|auditor|treasurer|property tax|adamh|health board|board of health|civil service|airport|library|school|fire\b|fire dept|ems\b|emergency medical|parks\b|park (district|department|dept|and recreation|recreation)|recreation|cemetery|coroner|prosecutor|probate|common pleas/i;
// Any permitting token in the name disqualifies a non-permit verdict — a
// "Police Department Public Works Department" contains a real office.
const PERMIT_TOKEN_RE = /building|zoning|planning|permits?|inspection|engineer|public works|service|street|road|historic|design review|code/i;
export function isNonPermitOfficeName(name) {
  const { clean } = cleanOfficeName(name);
  if (!clean || isGenericOfficeName(clean)) return false; // placeholders never retire
  if (/\bclerk\b/i.test(clean) && !/clerk of courts|courts? clerk/i.test(clean)) return false; // city clerks issue permits
  return NON_PERMIT_RE.test(clean) && !PERMIT_TOKEN_RE.test(clean);
}

// ── Merge receivers ──────────────────────────────────────────────────────
// A placeholder may only merge into an office whose name actually matches
// the role it would absorb — a clerk or police dept can never carry
// historic_review evidence for the placeholder.
const ROLE_NAME_TOKENS = {
  historic_review: /historic|landmark|design review|architectural review|preservation/i,
  zoning: /zoning|planning/i,
  planning: /planning|zoning|comprehensive/i,
  right_of_way: /engineer|public works|street|road|service departments?|services dept|odot|kytc|highway/i,
  building: /building|inspection|code|housing/i,
  electrical_permit: /building|inspection|code|electric/i,
  electrical_inspection: /building|inspection|code|electric/i,
  sign_permit: /building|zoning|planning|permits?|inspection|code|sign/i,
  transportation: /engineer|public works|street|road|odot|kytc/i,
  other: null, // 'other' never auto-merges
};
export function receiverOkForRole(receiver, role, locName) {
  const name = String(receiver?.name || '');
  if (/\t/.test(name)) return false;                        // tab-glued person names
  const c = cleanOfficeName(name);
  if (!c.clean || c.generic) return false;                  // junk/generic names
  if (isPlaceholderOffice(name, locName)) return false;     // placeholders can't absorb
  if (isNonPermitOfficeName(name)) return false;            // non-permit bodies can't absorb
  const re = ROLE_NAME_TOKENS[role];
  return re ? re.test(c.clean) : false;
}
