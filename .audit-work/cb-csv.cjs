// tiny RFC4180 parser (quoted fields, embedded commas/newlines)
module.exports = (text) => {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; } else f += c; }
  if (f || row.length) { row.push(f); if (row.some((x) => x.trim())) rows.push(row); }
  const [h, ...body] = rows; return { headers: h, rows: body.map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()]))) };
};
