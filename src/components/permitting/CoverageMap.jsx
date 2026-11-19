import { useMemo, useState } from "react";
import countiesGeo from "@/assets/oh-ky-counties.json";

// MP-12.2 — per-county coverage choropleth (OH + KY). Colors each county by
// the share of its jurisdiction profiles carrying researched office answers
// (office_research.roles >= 2). Geometry: Census TIGERweb generalized
// polygons (src/assets/oh-ky-counties.json, ~138KB).
const W = 640, H = 380;

function project(bounds, lon, lat) {
  const [minX, minY, maxX, maxY] = bounds;
  return [((lon - minX) / (maxX - minX)) * W, (1 - (lat - minY) / (maxY - minY)) * H];
}

function ringToPath(bounds, ring) {
  return ring.map((pt, i) => `${i === 0 ? "M" : "L"}${project(bounds, pt[0], pt[1]).map((n) => n.toFixed(1)).join(",")}`).join("") + "Z";
}

function featurePath(bounds, geom) {
  if (!geom) return "";
  const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  return polys.map((poly) => poly.map((ring) => ringToPath(bounds, ring)).join("")).join("");
}

const STOP = (t) => {
  // red → amber → green
  const a = Math.max(0, Math.min(1, t));
  const r = a < 0.5 ? 220 : Math.round(220 - (a - 0.5) * 2 * (220 - 22));
  const g = a < 0.5 ? Math.round(60 + a * 2 * (163 - 60)) : 163;
  const b = a < 0.5 ? Math.round(60 + a * 2 * (74 - 60)) : Math.round(74 - (a - 0.5) * 2 * (74 - 21));
  return `rgb(${r},${g},${b})`;
};

const normCounty = (s) => String(s || "").replace(/ County$/i, "").trim().toLowerCase();
const FIPS = { OH: "39", KY: "21" };

export default function CoverageMap({ jurisdictions = [] }) {
  const [hover, setHover] = useState(null);

  const { paths, stats, maxN } = useMemo(() => {
    const feats = countiesGeo.features || [];
    let minX = 180, maxX = -180, minY = 90, maxY = -90;
    for (const f of feats) {
      const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
      for (const poly of polys) for (const ring of poly) for (const [x, y] of ring) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    const bounds = [minX, minY, maxX, maxY];

    const byCounty = {};
    for (const p of jurisdictions) {
      const c = normCounty(p.parent_county?.name || p.county || "");
      const st = String(p.state || "").toUpperCase();
      if (!c || c === "?") continue;
      const key = `${c}|${FIPS[st] || st}`;
      const s = byCounty[key] || (byCounty[key] = { n: 0, r: 0, v: 0 });
      s.n++;
      if ((p.office_research?.roles || []).length >= 2) s.r++;
      if (/verified/i.test(String(p.verification_status || ""))) s.v++;
    }

    const paths = feats.map((f) => {
      const key = `${normCounty(f.properties.name)}|${f.properties.state}`;
      const s = byCounty[key] || { n: 0, r: 0, v: 0 };
      return { key, name: f.properties.name, state: f.properties.state, d: featurePath(bounds, f.geometry), stats: s };
    });
    const maxN = Math.max(1, ...paths.map((p) => p.stats.n));
    return { paths, stats: byCounty, maxN };
  }, [jurisdictions]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-semibold text-slate-800">Coverage by county</p>
        <p className="text-[11px] text-slate-500">share of profiles with researched office answers · gray = no profiles</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Ohio and Kentucky coverage map">
        {paths.map((p) => {
          const share = p.stats.n ? p.stats.r / p.stats.n : null;
          const fill = share == null ? "#e5e7eb" : STOP(share);
          const isHover = hover === p.key;
          return (
            <path
              key={p.key}
              d={p.d}
              fill={fill}
              stroke={isHover ? "#111827" : "#ffffff"}
              strokeWidth={isHover ? 1.2 : 0.4}
              onMouseEnter={() => setHover(p.key)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${p.name}, ${p.state} — ${p.stats.n} profiles, ${p.stats.r} researched (${share == null ? "0" : Math.round(share * 100)}%)`}</title>
            </path>
          );
        })}
      </svg>
      {hover && (() => {
        const p = paths.find((x) => x.key === hover);
        const share = p?.stats.n ? Math.round((p.stats.r / p.stats.n) * 100) : 0;
        return (
          <p className="mt-1 text-[11px] text-slate-600">
            <span className="font-medium">{p?.name}, {p?.state}</span> — {p?.stats.n ?? 0} profiles · {p?.stats.r ?? 0} researched ({share}%)
          </p>
        );
      })()}
      <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
        <span>0%</span>
        <div className="h-2 flex-1 rounded" style={{ background: `linear-gradient(to right, ${STOP(0)}, ${STOP(0.5)}, ${STOP(1)})` }} />
        <span>100% researched</span>
      </div>
    </div>
  );
}
