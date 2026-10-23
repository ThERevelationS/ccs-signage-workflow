import { geographicCandidates, geographicCandidateMetadata } from './permittingGeographicCandidates.mjs';

const norm = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
function geographicName(value, type) {
  if (!['county', 'township', 'city', 'village'].includes(type)) return norm(value);
  const name = norm(value).replace(new RegExp(`^${type} of\\s+`), '');
  return ['county', 'township'].includes(type) ? name.replace(new RegExp(`\\s+${type}$`), '') : name;
}

// Eligibility for automatic geographic research only, not office/authority proof.
export function assessOfficialQueueIdentity(row = {}) {
  const state = String(row.state || '').trim().toUpperCase();
  const type = norm(row.jurisdiction_type);
  const name = geographicName(row.jurisdiction_name, type);
  const county = geographicName(row.parent_county_name, 'county');
  const hits = geographicCandidates.filter(([s, t, n, c]) =>
    s === state && t === type && geographicName(n, t) === name &&
    (type !== 'township' || (county && geographicName(c, 'county') === county)));
  const eligible = hits.length === 1;
  return {
    eligible, reason: eligible ? 'single_official_geographic_candidate'
      : hits.length > 1 ? 'ambiguous_official_geographic_identity' : 'official_geographic_identity_review_required',
    candidate_keys: hits.map(row => row[4]),
    source_vintage: geographicCandidateMetadata.source_vintage,
    county_relationship_verified: eligible && ['county', 'township'].includes(type),
    authority_verified: false,
  };
}

export function assertOfficialProfileResearchIdentity(profile) {
  if (!['OH', 'KY'].includes(String(profile.state || '').toUpperCase())) return;
  const assessment = assessOfficialQueueIdentity({
    state: profile.state, jurisdiction_type: profile.type, jurisdiction_name: profile.name,
    parent_county_name: profile.parent_county?.name || profile.parent_county_name,
  });
  if (!assessment.eligible) throw Object.assign(
    Error('Official geographic identity requires review before automatic jurisdiction research.'),
    { status: 409, code: 'JURISDICTION_IDENTITY_REVIEW_REQUIRED', assessment },
  );
}

const states = {
  Alabama:'AL', Alaska:'AK', Arizona:'AZ', Arkansas:'AR', California:'CA', Colorado:'CO',
  Connecticut:'CT', Delaware:'DE', Florida:'FL', Georgia:'GA', Hawaii:'HI', Idaho:'ID',
  Illinois:'IL', Indiana:'IN', Iowa:'IA', Kansas:'KS', Kentucky:'KY', Louisiana:'LA',
  Maine:'ME', Maryland:'MD', Massachusetts:'MA', Michigan:'MI', Minnesota:'MN',
  Mississippi:'MS', Missouri:'MO', Montana:'MT', Nebraska:'NE', Nevada:'NV',
  'New Hampshire':'NH', 'New Jersey':'NJ', 'New Mexico':'NM', 'New York':'NY',
  'North Carolina':'NC', 'North Dakota':'ND', Ohio:'OH', Oklahoma:'OK', Oregon:'OR',
  Pennsylvania:'PA', 'Rhode Island':'RI', 'South Carolina':'SC', 'South Dakota':'SD',
  Tennessee:'TN', Texas:'TX', Utah:'UT', Vermont:'VT', Virginia:'VA', Washington:'WA',
  'West Virginia':'WV', Wisconsin:'WI', Wyoming:'WY', 'District of Columbia':'DC',
};
const statePattern = Object.keys(states).sort((a, b) => b.length - a.length).join('|');
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const text = html => String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&(?:nbsp|#160);/gi, ' ').replace(/&#(?:44|x2c);/gi, ',')
  .replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();

function inspect(profile, value, context, footer = false) {
  const expectedState = String(profile?.state || '').trim().toUpperCase();
  const name = norm(profile?.name).replace(/^(?:city|village|county|township) of\s+/, '')
    .replace(/\s+(?:county|township)$/, '');
  if (!name || !['OH', 'KY'].includes(expectedState)) return;
  const n = escape(name), kind = '(?:city|village|county|township|town)';
  const label = footer ? `\\b(?:${kind}\\s+of\\s+${n}|${n}\\s+${kind})`
    : `^(?:the\\s+|welcome to\\s+(?:the\\s+)?)?(?:${kind}\\s+of\\s+)?${n}(?:\\s+${kind})?`;
  const pattern = new RegExp(`${label}\\s*,\\s*(${statePattern})(?=[\\s,.|\\u2013-]|$)`, 'gi');
  for (const match of text(value).matchAll(pattern)) {
    const stateName = Object.keys(states).find(key => norm(key) === norm(match[1]));
    const observedState = states[stateName];
    if (observedState !== expectedState) throw Object.assign(
      Error(`Source jurisdiction/state mismatch: expected ${profile.name}, ${expectedState}; ${context} identifies ${stateName}. Review required before retention.`),
      { status: 409, code: 'SOURCE_IDENTITY_REVIEW_REQUIRED', frontier_review_required: true },
    );
  }
}

export function assertResearchSourceIdentity(profile, research) {
  inspect(profile, String(research?.ai_summary || '').slice(0, 2000), 'research summary');
}

export function assertPageSourceIdentity(profile, html) {
  // Inspect identity-bearing branding, not ordinary body references to other cities.
  for (const match of String(html).matchAll(/<(title|h1)\b[^>]*>([\s\S]*?)<\/\1>/gi))
    inspect(profile, match[2], 'page branding');
  for (const match of String(html).matchAll(/<footer\b[^>]*>([\s\S]*?)<\/footer>/gi))
    inspect(profile, match[1], 'page footer', true);
}
