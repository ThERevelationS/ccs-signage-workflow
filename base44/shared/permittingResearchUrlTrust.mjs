// AI web research can be steered by pages it reads (indirect prompt injection),
// so its URLs are unverified candidates. A candidate may become a canonical
// profile URL, crawl seed or retained document only when its host is already
// established on the profile or is a registrant-vetted government domain.
// Host changes and other hosts are reported for admin review, never applied.

// Ordinance publishers that host official municipal codes for many localities.
const CODE_PUBLISHER_HOSTS = ['municode.com', 'amlegal.com', 'ecode360.com', 'codepublishing.com', 'generalcode.com'];
const REVIEW_LIMIT = 50;

function parseWebUrl(value) {
  try {
    const u = new URL(String(value ?? '').trim());
    return ['http:', 'https:'].includes(u.protocol) && u.hostname ? u : null;
  } catch { return null; }
}

export function researchUrlHost(value) {
  const u = parseWebUrl(value);
  return u && !u.username && !u.password ? u.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '') : null;
}

// .gov registrations are vetted by CISA; <locality>.<state>.us names are
// delegated by state registrars (e.g. ci.example.oh.us).
export function isGovernmentHost(host) {
  return typeof host === 'string' && (/^(?:[a-z0-9-]+\.)+gov$/.test(host) || /^(?:[a-z0-9-]+\.)+[a-z]{2}\.us$/.test(host));
}

const matchesHost = (host, domain) => host === domain || host.endsWith('.' + domain);

export function establishedOfficialHosts(profile, fields = ['permitting_url', 'website_url']) {
  return new Set(fields.map(field => researchUrlHost(profile?.[field])).filter(Boolean));
}

function gateCanonical(value, established) {
  if (value == null || value === '') return { url: null };
  // Non-web values are the sanitizer's concern and cannot name a fetchable host.
  if (!parseWebUrl(value)) return { url: value };
  const host = researchUrlHost(value);
  if (!host) return { url: null, reason: 'credentials_in_url_require_review' };
  if (established.size) return established.has(host) ? { url: value, host } : { url: null, reason: 'host_change_requires_review' };
  return isGovernmentHost(host) ? { url: value, host } : { url: null, reason: 'unvetted_host_requires_review' };
}

function gateScope(prefix, research, established, review) {
  const out = { ...research }, trusted = new Set(established);
  for (const field of ['permitting_url', 'website_url']) {
    if (!Object.hasOwn(research, field)) continue;
    const gated = gateCanonical(research[field], established);
    out[field] = gated.url;
    if (gated.host) trusted.add(gated.host);
    if (gated.reason) review.push({ field: prefix + field, url: String(research[field]).slice(0, 2000), reason: gated.reason });
  }
  if (Array.isArray(research.documents)) {
    out.documents = research.documents.filter(doc => {
      const host = researchUrlHost(doc?.url);
      const ok = host && (trusted.has(host) || isGovernmentHost(host) || CODE_PUBLISHER_HOSTS.some(d => matchesHost(host, d)));
      if (!ok) review.push({ field: prefix + 'documents', url: String(doc?.url ?? '').slice(0, 2000), reason: 'unvetted_document_host_requires_review' });
      return ok;
    });
  }
  return out;
}

export function gateResearchSourceUrls(profile, research) {
  const review = [];
  if (!research || typeof research !== 'object') return { research, review };
  const gated = gateScope('', research, establishedOfficialHosts(profile), review);
  if (Object.hasOwn(research, 'cagis_database_url')) {
    const cagis = gateCanonical(research.cagis_database_url, establishedOfficialHosts(profile, ['cagis_database_url']));
    gated.cagis_database_url = cagis.url;
    if (cagis.reason) review.push({ field: 'cagis_database_url', url: String(research.cagis_database_url).slice(0, 2000), reason: cagis.reason });
  }
  if (research.parent_county && typeof research.parent_county === 'object') {
    gated.parent_county = gateScope('parent_county.', research.parent_county,
      establishedOfficialHosts(profile?.parent_county), review);
  }
  return { research: gated, review: review.slice(0, REVIEW_LIMIT), review_omitted: Math.max(0, review.length - REVIEW_LIMIT) };
}
