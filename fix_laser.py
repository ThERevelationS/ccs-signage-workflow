src = open("src/pages/LaserEstimator.jsx", encoding="utf-8").read()
head = src.find("// DXF/SVG dimension extraction")
tail = src.find("  const addItem = () => {")
assert head != -1 and tail != -1 and head < tail, (head, tail)
helper = r"""// DXF/SVG dimension extraction (#92): reads the file text and pulls a
// bounding box -- DXF $EXTMIN/$EXTMAX headers, or an SVG width/height/viewBox --
// returning inches so a laser part can prefill length/width from a vector file.
async function extractLaserDims(file) {
  try {
    const text = await file.text();
    const lines = String(text).split(/[\r\n]+/);
    const readPair = (marker) => {
      const idx = lines.findIndex((l) => String(l).trim() === marker);
      if (idx < 0) return null;
      let x = NaN, y = NaN;
      for (let j = idx + 1; j < Math.min(idx + 14, lines.length); j += 1) {
        const code = String(lines[j]).trim();
        if (code === "10") x = parseFloat(lines[j + 1]);
        else if (code === "20") y = parseFloat(lines[j + 1]);
        if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
      }
      return null;
    };
    const extMin = readPair("$EXTMIN");
    const extMax = readPair("$EXTMAX");
    const metric = lines.some((l, i) => String(l).trim() === "$MEASUREMENT" && String(lines[i + 2] || "").trim() === "1");
    const insUnitsMM = lines.some((l, i) => String(l).trim() === "$INSUNITS" && String(lines[i + 2] || "").trim() === "4");
    const toIn = (metric || insUnitsMM) ? 1 / 25.4 : 1;
    if (extMin && extMax && extMax.x > extMin.x) {
      const w = (extMax.x - extMin.x) * toIn;
      const h = Math.abs(extMax.y - extMin.y) * toIn;
      return { w: +w.toFixed(2), h: +h.toFixed(2) };
    }
    const vb = /viewBox=["']([\d\.\s-]+)["']/.exec(text);
    const sW = /width=["']([\d\.]+)/.exec(text), sH = /height=["']([\d\.]+)/.exec(text);
    if (Number.isFinite(parseFloat(sW?.[1])) && Number.isFinite(parseFloat(sH?.[1]))) return { w: parseFloat(sW[1]), h: parseFloat(sH[1]) };
    if (vb) { const p = vb[1].trim().split(/\s+/).map(Number); if (p.length === 4 && p[2] > 0 && p[3] > 0) return { w: +p[2].toFixed(2), h: +p[3].toFixed(2) }; }
  } catch {}
  return null;
}
"""
out = src[:head] + helper + "\n" + src[tail:]
open("src/pages/LaserEstimator.jsx", "w", encoding="utf-8", newline="\n").write(out)
print("rewrote", tail - head, "->", len(helper))
