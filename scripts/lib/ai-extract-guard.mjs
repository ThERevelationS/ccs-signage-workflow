// Hard guard on every SWE extraction answer — code checks only, the model is
// never trusted. Accept a role answer only if:
//   · source_url is one of the unit's pages
//   · whitespace/case-normalized quote is a substring of that page's FULL
//     fetched text (not just the trimmed keyword window sent to the model)
//   · quote is 20–400 chars and contains a role keyword
//   · office name is not a non-permitting body under the cleaner's list
// Everything else is discarded and counted by reason.
import { isNonPermitOfficeName } from './office-name-clean.mjs';

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

const ROLE_KEYWORDS = /permit|zoning|building|sign|inspection|electric|right.?of.?way|road|street|public works|historic|planning|license|licence|code|landmark|architectural|plat|subdivis|variance|encroach|fee/i;

export function validateExtractAnswer(unit, answer) {
  if (!answer || typeof answer !== 'object') return { ok: false, reason: 'no_answer' };
  const role = String(answer.role || '').trim();
  const quote = String(answer.quote || '').trim();
  const src = String(answer.source_url || '').trim();
  const office = String(answer.office_name || '').trim();
  const pages = unit?.pages || [];
  const page = pages.find((p) => String(p.url).trim() === src);
  if (!page) return { ok: false, reason: 'url_not_in_unit' };
  if (!quote) return { ok: false, reason: 'no_quote' };
  if (quote.length < 20) return { ok: false, reason: 'quote_too_short' };
  if (quote.length > 400) return { ok: false, reason: 'quote_too_long' };
  if (!ROLE_KEYWORDS.test(quote)) return { ok: false, reason: 'quote_no_role_keyword' };
  // Full fetched text wins over the trimmed window — a paraphrase, or a quote
  // stitched from another page, never verifies.
  const hay = norm(page.full_text || page.text);
  if (!hay || !hay.includes(norm(quote))) return { ok: false, reason: 'quote_not_verbatim' };
  if (office && isNonPermitOfficeName(office)) return { ok: false, reason: 'non_permit_office' };
  return { ok: true };
}

// Build the keyword-window page view sent to the model: every window is a
// slice of the real page text around a role/permit keyword, so verbatim is
// always possible — the guard can always re-check against full_text.
const WINDOW_RE = /permit|zoning|building|sign|inspection|electric|right.?of.?way|road depart|public works|historic|landmark|architectural|planning|license|licence|application|ordinance|fee|variance|plat|subdivis|encroach/gi;
const WINDOW = 600;
export function keywordWindows(text, maxChars = 12000) {
  const src = String(text || '');
  const out = [];
  let used = 0;
  for (const m of src.matchAll(WINDOW_RE)) {
    const start = Math.max(0, m.index - WINDOW / 2);
    const end = Math.min(src.length, m.index + WINDOW / 2);
    // skip windows fully inside a previous one
    if (out.length && start <= out[out.length - 1].end) { out[out.length - 1].end = Math.max(out[out.length - 1].end, end); continue; }
    out.push({ start, end });
    if (end - start + used > maxChars) break;
  }
  const parts = [];
  for (const w of out) {
    const piece = src.slice(w.start, w.end);
    if (used + piece.length > maxChars) break;
    parts.push(piece);
    used += piece.length;
  }
  return parts.join('\n…\n');
}
