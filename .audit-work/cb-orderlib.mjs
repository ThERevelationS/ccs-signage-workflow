// Parsing helpers for CoreBridge order pages.
export function extractJsonAfter(html, marker) {
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const j = html.indexOf('{', i);
  let depth = 0, inS = false, esc = false, k = j;
  for (; k < html.length; k++) {
    const c = html[k];
    if (inS) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inS = false; continue; }
    if (c === '"') inS = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) break; }
  }
  return JSON.parse(html.slice(j, k + 1));
}
const SECRET = /password|passwd|hash|cvv|cardnumber|card_number|ccnumber|securitycode|slicekey|token|apikey|api_key/i;
const OPTION_LIST = (v) => Array.isArray(v) && v.length && v.every((x) => x && typeof x === 'object' && 'Text' in x && 'Value' in x);
export function scrub(v, keepOptions = false) {
  if (Array.isArray(v)) return v.map((x) => scrub(x, keepOptions));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (SECRET.test(k)) continue;
      if (!keepOptions && OPTION_LIST(x)) { const sel = x.find((o) => o.Selected); out[k + '__selected'] = sel ? { Text: sel.Text, Value: sel.Value } : null; continue; }
      out[k] = scrub(x, keepOptions);
    }
    return out;
  }
  return v;
}
export function textOf(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}
export function historyRows(html) {
  const rows = [];
  for (const tr of String(html).match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = (tr.match(/<td[\s\S]*?<\/td>/gi) || []).map((td) => textOf(td));
    if (cells.length >= 3) rows.push({ event: cells[0], at: cells[1], user: cells[2], extra: cells.slice(3) });
  }
  return rows;
}
