// O-043 (CMP-C11) -- labeled plan export. Pure builder: the live scene
// ({items,poles,walls,wall_caps,signage_cabinets}) becomes a standalone SVG
// document string the caller downloads. Labels come from authored values
// only; unresolved mounts draw nothing and a missing placement is skipped
// (never a guessed position).

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };

const itemFootprint = (item) => {
  const type = String(item?.foundation_type || "spread").toLowerCase();
  if (type === "pillar") {
    const d = n(item?.diameter);
    return d ? { w: d, h: d, circular: true } : null;
  }
  const w = n(item?.length_inches), h = n(item?.width_inches);
  if (!w || !h) return null;
  return { w, h, circular: false };
};

const itemName = (it, i) => (typeof it?.description === "string" && it.description.trim()) || `Foundation ${i + 1}`;

export function buildFoundationPlanSvg(scene, { width = 480, depth = 320 } = {}) {
  const items = scene?.items || [], poles = scene?.poles || [];
  const walls = scene?.walls || [], caps = scene?.wall_caps || [], cabinets = scene?.signage_cabinets || [];
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${depth}" font-family="system-ui, sans-serif">`);
  out.push(`<rect width="${width}" height="${depth}" fill="#ffffff"/>`);
  out.push(`<rect x="0.5" y="0.5" width="${width - 1}" height="${depth - 1}" fill="none" stroke="#94a3b8" stroke-width="1"/>`);
  // 1ft grid
  for (let x = 12; x < width; x += 12) out.push(`<line x1="${x}" y1="0" x2="${x}" y2="${depth}" stroke="#f1f5f9" stroke-width="0.5"/>`);
  for (let y = 12; y < depth; y += 12) out.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#f1f5f9" stroke-width="0.5"/>`);

  items.forEach((item, i) => {
    const fp = itemFootprint(item);
    const x = n(item?.x_inches), z = n(item?.z_inches);
    if (!fp || x === null || z === null) return;
    const qty = Math.max(1, Number(item?.quantity) || 1);
    out.push(`<rect x="${x}" y="${z}" width="${fp.w}" height="${fp.h}" fill="rgba(245,158,11,0.18)" stroke="#d97706" stroke-width="1.5"/>`);
    out.push(`<text x="${x + 2}" y="${z + 9}" font-size="8" fill="#92400e">${esc(itemName(item, i))}${qty > 1 ? ` x${qty}` : ""} ${fp.w}x${fp.h}"</text>`);
  });

  walls.forEach((w, i) => {
    const pts = (w?.shape?.points || []).filter((p) => n(p?.x) !== null && n(p?.z) !== null);
    if (pts.length < 2) return;
    const path = pts.map((p, j) => `${j ? "L" : "M"}${p.x},${p.z}`).join(" ") + (w?.shape?.closed ? " Z" : "");
    out.push(`<path d="${path}" fill="none" stroke="#7c2d12" stroke-width="${Math.max(3, (n(w?.thicknessInches) || 8) / 4)}"/>`);
    const [p0] = pts;
    out.push(`<text x="${p0.x + 2}" y="${p0.z - 3}" font-size="8" fill="#7c2d12">${esc(w?.name || `Wall ${i + 1}`)}</text>`);
  });

  caps.forEach((c, i) => {
    const wall = walls.find((wl) => wl?.component_id === c?.wall_component_id);
    const segs = wall?.shape?.segments || [];
    const seg = segs.find((sg) => sg?.component_id === c?.segment_component_id);
    const pts = wall?.shape?.points || [];
    const si = segs.indexOf(seg);
    if (si < 0 || !pts[si] || !pts[si + 1]) return;
    const [a, b] = [pts[si], pts[si + 1]];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    out.push(`<line x1="${a.x}" y1="${a.z}" x2="${b.x}" y2="${b.z}" stroke="#57534e" stroke-width="1.5" stroke-dasharray="3 2"/>`);
    out.push(`<circle cx="${mx}" cy="${mz}" r="2" fill="#57534e"/>`);
    out.push(`<text x="${mx + 3}" y="${mz - 3}" font-size="7" fill="#44403c">cap ${i + 1}</text>`);
  });

  poles.forEach((p, i) => {
    const x = n(p?.x_inches), z = n(p?.z_inches);
    if (x === null || z === null) return;
    out.push(`<circle cx="${x}" cy="${z}" r="4" fill="rgba(71,85,105,0.3)" stroke="#334155" stroke-width="1.5"/>`);
    out.push(`<text x="${x + 6}" y="${z + 3}" font-size="8" fill="#1e293b">Pole ${i + 1}${n(p?.height_inches) ? ` ${p.height_inches}"` : ""}</text>`);
    (p.signs || []).forEach((s) => {
      const sw = n(s?.width_inches), sd = n(s?.depth_inches);
      if (!sw || !sd) return;
      out.push(`<rect x="${x - sw / 2}" y="${z - sd / 2}" width="${sw}" height="${sd}" fill="rgba(59,130,246,0.12)" stroke="#2563eb" stroke-width="0.8"/>`);
    });
  });

  cabinets.forEach((c, i) => {
    let x = null, z = null;
    if (c?.mount === "pole") {
      const pole = poles.find((p) => p?.component_id === c?.pole_component_id);
      if (pole) { x = n(pole.x_inches); z = n(pole.z_inches); }
    } else if (c?.mount === "foundation") {
      const it = items.find((it2) => it2?.component_id === c?.foundation_component_id);
      const fp = it ? itemFootprint(it) : null;
      if (it && fp) { x = (n(it.x_inches) || 0) + fp.w / 2; z = (n(it.z_inches) || 0) + fp.h / 2; }
    }
    const cw = n(c?.width_inches), cd = n(c?.depth_inches);
    if (x === null || z === null || !cw || !cd) return;
    out.push(`<rect x="${x - cw / 2}" y="${z - cd / 2}" width="${cw}" height="${cd}" fill="rgba(31,41,55,0.2)" stroke="#1f2937" stroke-width="1.2"/>`);
    out.push(`<text x="${x - cw / 2}" y="${z - cd / 2 - 2}" font-size="7" fill="#1f2937">Cabinet ${i + 1}</text>`);
  });

  out.push(`<text x="6" y="${depth - 6}" font-size="9" fill="#64748b">${width}x${depth} plan -- labeled export (inches)</text>`);
  out.push("</svg>");
  return out.join("\n");
}

// O-043 (CMP-C12) -- labeled elevation export: items as depth rects at grade
// offset, poles as height lines, signs/cabinets at mount height. Elevation
// view (x = horizontal plan axis, y = height above grade; y-axis inverted so
// grade sits at the bottom).
export function buildFoundationElevationSvg(scene, { width = 480, height = 320 } = {}) {
  const items = scene?.items || [], poles = scene?.poles || [], cabinets = scene?.signage_cabinets || [];
  const out = [];
  const gradeY = height - 24;
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif">`);
  out.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);
  out.push(`<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="#94a3b8" stroke-width="1"/>`);
  // grade line + 1ft grid
  out.push(`<line x1="0" y1="${gradeY}" x2="${width}" y2="${gradeY}" stroke="#78716c" stroke-width="1.5"/>`);
  out.push(`<text x="4" y="${gradeY - 2}" font-size="8" fill="#78716c">grade</text>`);
  for (let x = 12; x < width; x += 12) out.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#f1f5f9" stroke-width="0.5"/>`);
  for (let y = 12; y < height; y += 12) out.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#f1f5f9" stroke-width="0.5"/>`);

  items.forEach((item, i) => {
    const x = n(item?.x_inches), d = n(item?.depth_inches), off = n(item?.grade_offset_inches) || 0;
    const fp = itemFootprint(item);
    if (!fp || x === null || d === null) return;
    // Elevation: the footing sits at grade - off, depth tall below grade.
    const top = gradeY + off - d;
    out.push(`<rect x="${x}" y="${top}" width="${fp.w}" height="${d}" fill="rgba(245,158,11,0.18)" stroke="#d97706" stroke-width="1.5"/>`);
    out.push(`<text x="${x + 2}" y="${top + 9}" font-size="8" fill="#92400e">${esc(itemName(item, i))} d${d}"</text>`);
  });

  poles.forEach((p, i) => {
    const x = n(p?.x_inches), h = n(p?.height_inches), off = n(p?.base_offset_inches) || 0;
    if (x === null || h === null) return;
    const top = gradeY + off - h;
    out.push(`<line x1="${x}" y1="${gradeY + off}" x2="${x}" y2="${top}" stroke="#334155" stroke-width="3"/>`);
    out.push(`<text x="${x + 4}" y="${top + 3}" font-size="8" fill="#1e293b">Pole ${i + 1} ${h}"</text>`);
    (p.signs || []).forEach((s) => {
      const sw = n(s?.width_inches), sh = n(s?.height_inches), mh = n(s?.mount_height_inches);
      if (!sw || !sh || mh === null) return;
      const sy = gradeY + off - mh - sh / 2;
      out.push(`<rect x="${x - sw / 2}" y="${sy}" width="${sw}" height="${sh}" fill="rgba(59,130,246,0.12)" stroke="#2563eb" stroke-width="0.8"/>`);
    });
  });

  cabinets.forEach((c, i) => {
    let x = null, mh = null;
    if (c?.mount === "pole") {
      const pole = poles.find((p) => p?.component_id === c?.pole_component_id);
      if (pole) { x = n(pole.x_inches); mh = n(c?.mount_height_inches); }
    } else if (c?.mount === "foundation") {
      const it = items.find((it2) => it2?.component_id === c?.foundation_component_id);
      const fp = it ? itemFootprint(it) : null;
      if (it && fp) { x = (n(it.x_inches) || 0) + fp.w / 2; mh = n(c?.mount_height_inches); }
    }
    const cw = n(c?.width_inches), ch = n(c?.height_inches);
    if (x === null || mh === null || !cw || !ch) return;
    const cy = gradeY - mh - ch / 2;
    out.push(`<rect x="${x - cw / 2}" y="${cy}" width="${cw}" height="${ch}" fill="rgba(31,41,55,0.2)" stroke="#1f2937" stroke-width="1.2"/>`);
    out.push(`<text x="${x - cw / 2}" y="${cy - 2}" font-size="7" fill="#1f2937">Cabinet ${i + 1} @${mh}"</text>`);
  });

  out.push(`<text x="6" y="${height - 6}" font-size="9" fill="#64748b">${width}x${height} elevation -- labeled export (inches)</text>`);
  out.push("</svg>");
  return out.join("\n");
}
