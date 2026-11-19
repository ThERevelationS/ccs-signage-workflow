import json
new_text = '''  const addItem = () => {
'''
new_text = '''// DXF/SVG dimension extraction (#92): reads the file text and pulls a
// bounding box — DXF $EXTMIN/$EXTMAX headers, or an SVG width/height/viewBox —
// returning inches so a laser part can prefill length/width from a vector file.
async function extractLaserDims(file) {
  try {
    const text = await file.text();
    const metric = /\$MEASUREMENT[\s\S]{0,40}?\n\s*1\b/.test(text);
    const units = /\$INSUNITS[\s\S]{0,40}?\n\s*4\b/.test(text) ? "mm" : (metric ? "mm" : "in");
    const num = (key, src) => { const m = src.match(new RegExp(`${key}[\\s\\S]{0,20}?([\\d\\.eE+-]+)`)); return m ? parseFloat(m[1]) : NaN; };
    const minX = num("$EXTMIN", text), maxX = num("$EXTMAX", text);
    const minY = /\$EXTMIN[\s\S]{0,60}?\n\s*([\d\.eE+-]+)[\s\S]{0,60}?\n\s*([\d\.eE+-]+)/.exec(text);
    if (Number.isFinite(minX) && Number.isFinite(maxX) && maxX > minX) {
      const widthRaw = maxX - minX;
      const hRaw = num("$EXTMAX", text.slice(text.indexOf("$EXTMAX")));
      let heightRaw = widthRaw;
      const maxY = (() => { const m = /\$EXTMAX[\s\S]{0,60}?\n\s*[\d\.eE+-]+[\s\S]{0,60}?\n\s*([\d\.eE+-]+)/.exec(text); return m ? parseFloat(m[1]) : NaN; })();
      if (Number.isFinite(maxY) && minY) heightRaw = maxY - parseFloat(minY[2] || minY[1] || 0);
      const toIn = units === "mm" ? 1 / 25.4 : 1;
      return { w: +(widthRaw * toIn).toFixed(2), h: +(Math.abs(heightRaw) * toIn).toFixed(2) };
    }
    const vb = /viewBox=["']([\d\.\s-]+)["']/.exec(text);
    const sW = /width=["']([\d\.]+)/.exec(text), sH = /height=["']([\d\.]+)/.exec(text);
    if (Number.isFinite(parseFloat(sW?.[1])) && Number.isFinite(parseFloat(sH?.[1]))) return { w: parseFloat(sW[1]), h: parseFloat(sH[1]) };
    if (vb) { const p = vb[1].trim().split(/\s+/).map(Number); if (p.length === 4 && p[2] > 0 && p[3] > 0) return { w: +p[2].toFixed(2), h: +p[3].toFixed(2) }; }
  } catch {}
  return null;
}

  const addItem = () => {
'''
old_text = '  const addItem = () => {'
print(json.dumps([{"old_text": old_text, "new_text": new_text}]))
