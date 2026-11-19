// signage-facts.mjs — signage-intelligence taxonomy + pattern-harvest helpers.
// Shared by the facts worker (local extraction) and the in-app fact cards.
// Jurisdiction identity stays per-row; extraction inputs are always scoped to
// a single jurisdiction's documents — never cross-contaminate.

export const SIGN_TYPES = [
  // by form
  'wall', 'fascia', 'projecting', 'awning', 'canopy', 'marquee', 'roof', 'parapet', 'window', 'suspended', 'painted',
  // freestanding
  'pole', 'pylon', 'monument', 'post_and_panel', 'multi_tenant_pylon', 'billboard_offpremise',
  // portable / temporary
  'temporary', 'banner', 'a_frame', 'feather_flag', 'inflatable', 'portable_changeable',
  'construction', 'real_estate', 'political', 'yard', 'garage_sale', 'directional', 'window_temporary',
  // electronic / specialty
  'emc_digital', 'readerboard', 'neon', 'led_channel', 'backlit', 'halo_lit', 'exposed_neon', 'projection_light',
  // functional
  'menu_board', 'drive_thru', 'wayfinding', 'address_sign', 'regulatory', 'nameplate', 'mural', 'vehicle_wrap',
  'general', // jurisdiction-wide rule not tied to one type
];

export const FACT_KEYS = [
  // permit
  'permit_required', 'permit_exempt', 'application_steps', 'required_materials', 'review_time', 'inspection', 'electrical_permit',
  // fees
  'permit_fee', 'plan_review_fee', 'per_sqft_fee', 'inspection_fee', 'annual_fee', 'bond',
  // dimensions
  'max_height', 'max_area', 'max_count', 'min_setback', 'min_clearance', 'min_separation', 'area_rule', 'depth_projection', 'height_from_grade',
  // illumination / emc
  'illumination_allowed', 'brightness_nits', 'illumination_hours', 'emc_dwell_time', 'emc_animation', 'emc_transition', 'dimming_required',
  // placement
  'allowed_zones', 'overlay_restrictions', 'row_prohibited', 'multi_tenant_rule', 'frontage_req',
  // prohibited
  'prohibited_types', 'nonconforming_amortization', 'abandoned_rule',
  // process
  'variance_path', 'appeal_path', 'penalties', 'who_issues',
  // timing
  'temporary_duration', 'display_period', 'removal_deadline',
];

export const CONFIDENCE_LADDER = ['pattern', 'agent', 'ai_verified', 'verified'];

// ── Pass-A pattern harvest ────────────────────────────────────────────────
// Sign-relevant text candidates. Each pattern tags the snippet with the fact
// topics it might support; Pass-B (devin-llm) does the real structuring.
const SIGN_PATTERNS = [
  { re: /\bsign(s)?\b/i, tag: 'sign', weight: 1 },
  { re: /sign\s+(permit|license)/i, tag: 'permit_required', weight: 3 },
  { re: /\$\s?\d[\d,]*(\.\d{2})?/, tag: 'fee', weight: 1 },
  { re: /(square\s*(feet|foot)|sq\.?\s*ft)/i, tag: 'area', weight: 2 },
  { re: /\b\d+(\.\d+)?\s*(feet|foot|ft\.?|inches|in\.?)/i, tag: 'dimension', weight: 1 },
  { re: /(height|setback|clearance|separation|frontage|projection)/i, tag: 'dimension', weight: 2 },
  { re: /(illumina|light(ed|ing)?|backlit|halo|neon|LED|electronic|digital|EMC|message\s*(center|board)|readerboard)/i, tag: 'illumination', weight: 2 },
  { re: /(prohibit(ed)?|not\s+permitted|shall\s+not|forbidden)/i, tag: 'prohibited', weight: 2 },
  { re: /(variance|appeal|board\s+of\s+(zoning\s+)?appeals|BZA)/i, tag: 'process', weight: 2 },
  { re: /(billboard|off-?premise|off\s+site)/i, tag: 'billboard', weight: 2 },
  { re: /(temporary|banner|a-?frame|sandwich|feather|flag|inflatable|portable)/i, tag: 'temporary', weight: 2 },
  { re: /(monument|pole|pylon|wall|projecting|awning|canopy|marquee|roof|window)\s+sign/i, tag: 'type', weight: 2 },
  { re: /(zoning\s+(code|ordinance)|resolution|§|section\s+\d+\.\d+)/i, tag: 'authority', weight: 1 },
  { re: /(fine|penalt|violat|enforcement|removal)/i, tag: 'penalties', weight: 1 },
  { re: /(inspection|application|review|approval|expire|duration)/i, tag: 'process', weight: 1 },
];

// harvestPage — split extracted page text into candidate snippets that look
// sign-relevant. Returns [] for pages with no signal (most docs).
const SNIP_LEN = 900;
export function harvestPage({ page, text, source_sha256, source_document_id, source_title, official_url }) {
  const t = String(text || '');
  if (!/\bsign/i.test(t) && !/zoning|ordinance|permit/i.test(t)) return [];
  const out = [];
  // Paragraph-ish windows: split on blank lines / section headers, keep ±SNIP_LEN.
  const chunks = t.split(/\n\s*\n|\r?\n(?=\s*(?:§|SECTION|Section|ARTICLE|Article|\d+\.\d))/).filter(Boolean);
  for (const c of chunks) {
    const hits = [];
    let weight = 0;
    for (const p of SIGN_PATTERNS) {
      if (p.re.test(c)) { hits.push(p.tag); weight += p.weight; }
    }
    if (!hits.includes('sign') && weight < 3) continue;
    if (weight < 2) continue;
    out.push({
      page,
      snippet: c.replace(/\s+/g, ' ').trim().slice(0, SNIP_LEN),
      tags: [...new Set(hits)],
      weight,
      source_sha256, source_document_id, source_title, official_url,
    });
  }
  return out;
}

// factIdentity — deterministic key for dedupe/supersession.
export function factIdentity({ jurisdiction_id, sign_type, fact_key, source_sha256 }) {
  return `${jurisdiction_id}|${sign_type || 'general'}|${fact_key}|${source_sha256 || 'no-src'}`;
}
