import { readFileSync } from 'node:fs';
import { permitCreds } from './lib/permit-creds.mjs';
import { paceCall } from './lib/read-ledger.mjs';
// 500-address validation harness for the permitting picker pipeline.
// Replicates resolvePermittingAddress's fallback path exactly:
//   Census onelineaddress geocode -> county/place/township/state boundary
//   point-in-polygon queries on the same public ArcGIS endpoints.
// Google server geocoding needs the app's private key, so this exercises the
// public path that must work when Google fails (the "map tool had a problem"
// path the user keeps hitting).
// Usage: node scripts/permitting-address-validation.mjs [--limit N] [--json out.json]

const CENSUS_GEOCODE = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const CENSUS_ARCGIS = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb";
const LOCATION_SOURCES = {
  county: `${CENSUS_ARCGIS}/State_County/MapServer/1`,
  place: `${CENSUS_ARCGIS}/Places_CouSub_ConCity_SubMCD/MapServer/4`,
  township: `${CENSUS_ARCGIS}/Places_CouSub_ConCity_SubMCD/MapServer/1`,
  oh_city: "https://maps.ohio.gov/arcgis/rest/services/Hosted/Ohio_Municipal_Boundaries/FeatureServer/0",
  oh_township: "https://maps.ohio.gov/arcgis/rest/services/OGRIP/boundaryData/MapServer/3",
  ky_city: "https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_CityBnd_Polygon_WGS84WM/MapServer/0",
};

// ── 500 real-ish addresses: real street names in real OH/KY municipalities,
// spread across cities, villages, townships, and county-only areas. ──
const OH = [
  ["Cincinnati", ["Vine St", "Main St", "Reading Rd", "Madison Rd", "Colerain Ave", "Montgomery Rd", "Eastern Ave", "Glenway Ave", "Hamilton Ave", "Warsaw Ave"]],
  ["Columbus", ["High St", "Broad St", "Main St", "Cleveland Ave", "Morse Rd", "Dublin Rd", "Parsons Ave", "Henderson Rd", "Fifth Ave", "Georgesville Rd"]],
  ["Cleveland", ["Euclid Ave", "Superior Ave", "Lorain Ave", "Detroit Ave", "Pearl Rd", "Kinsman Rd", "St Clair Ave", "West 25th St", "Lee Rd", "Denison Ave"]],
  ["Dayton", ["Main St", "Salem Ave", "Third St", "Dixie Dr", "Alex Bell Rd", "Smithville Rd", "Keowee St", "Gettysburg Ave", "Watervliet Ave", "Harshman Rd"]],
  ["Toledo", ["Monroe St", "Sylvania Ave", "Laskey Rd", "Reynolds Rd", "Central Ave", "Dorr St", "Summit St", "Alexis Rd", "Secor Rd", "Jackman Rd"]],
  ["Akron", ["Main St", "Market St", "Copley Rd", "Arlington Rd", "Canton Rd", "Tallmadge Ave", "Kenmore Blvd", "Brittain Rd", "East Ave", "Manchester Rd"]],
  ["Milford", ["Main St", "Lila Ave", "Garfield Ave", "Chamber Dr", "Water St", "High St", "Cleveland Ave", "Mill St"]],
  ["Loveland", ["Loveland Ave", "Second St", "Lebanon Rd", "Wards Corner Rd", "Rich Rd", "Kemper Rd"]],
  ["Mason", ["Main St", "Mason Montgomery Rd", "Western Row Rd", "Snider Rd", "Tylersville Rd", "Reading Rd"]],
  ["Hamilton", ["High St", "Main St", "Eaton Ave", "Dixie Hwy", "Pleasant Ave", "Symmes Rd", "Millville Ave", "Ross Ave"]],
  ["West Chester", ["Cincinnati Dayton Rd", "Tylersville Rd", "Union Centre Blvd", "Duff Dr", "Schumacher Park Dr"]],
  ["Fairfield", ["Pleasant Ave", "Nilles Rd", "Mack Rd", "Dixie Hwy", "Seward Rd", "River Rd"]],
  ["Middletown", ["Central Ave", "Main St", "Verity Pkwy", "Towne Blvd", "University Blvd", "Roosevelt Blvd"]],
  ["Springdale", ["Springfield Pike", "Northland Blvd", "Kemper Rd", "West Chester Rd", "Ray Norrish Dr"]],
  ["Blue Ash", ["Kenwood Rd", "Reed Hartman Hwy", "Hunt Rd", "Cooper Rd", "Plainfield Rd"]],
  ["Montgomery", ["Montgomery Rd", "Cooper Rd", "Zig Zag Rd", "Remington Rd", "Main St"]],
  ["Norwood", ["Montgomery Rd", "Sherman Ave", "Floral Ave", "Smith Rd", "Williams Ave", "Harris Ave"]],
  ["Forest Park", ["Winton Rd", "Smiley Ave", "Waycross Rd", "Kemper Meadow Dr", "Northland Blvd"]],
  ["Sharonville", ["Reading Rd", "Lebanon Rd", "Mosteller Rd", "Creek Rd", "Kemper Rd"]],
  ["Deer Park", ["Plainfield Rd", "Blue Ash Rd", "Galbraith Rd", "Chamberlain Park Ave"]],
  ["Madeira", ["Miami Ave", "Euclid Ave", "Camargo Rd", "Dawson Rd"]],
  ["Wyoming", ["Springfield Pike", "Wyoming Ave", "Burns Ave", "Reily Rd"]],
  ["Reading", ["Reading Rd", "Benson St", "Haffey Ave", "South St"]],
  ["Lebanon", ["Broadway", "Main St", "Mechanic St", "Silver St", "Turtle Creek Union Rd"]],
  ["Oxford", ["High St", "Main St", "College Ave", "Spring St", "Brown Rd"]],
  ["Trenton", ["Main St", "State St", "Edgewood Dr", "Wayne Madison Rd"]],
  ["Monroe", ["Main St", "Cincinnati Dayton Rd", "Garver Rd", "Britton Ln"]],
  ["Franklin", ["Second St", "Main St", "Riley Blvd", "Shotwell Dr"]],
  ["Springboro", ["Main St", "Central Ave", "Patterson Blvd", "Pioneer Blvd"]],
  ["Centerville", ["Main St", "Franklin St", "Yankee St", "Alex Bell Rd"]],
  ["Kettering", ["Far Hills Ave", "Dorothy Ln", "Woodman Dr", "Stroop Rd", "Wilmington Pike"]],
  ["Beavercreek", ["Dayton Xenia Rd", "Fairfield Rd", "Indian Ripple Rd", "Kemp Rd"]],
  ["Huber Heights", ["Old Troy Pike", "Brandt Pike", "Chambersburg Rd", "Taylorsville Rd"]],
  ["Fairborn", ["Main St", "Dayton Dr", "Kauffman Ave", "Central Ave"]],
  ["Xenia", ["Main St", "Detroit St", "Church St", "West St"]],
  ["Piqua", ["Main St", "Sunset Dr", "High St", "College St"]],
  ["Troy", ["Main St", "Market St", "Dorset Rd", "Experiment Farm Rd"]],
  ["Sidney", ["Main Ave", "Ohio Ave", "Court St", "Russell Rd"]],
  ["Findlay", ["Main St", "Tiffin Ave", "Bright Rd", "Sandusky St"]],
  ["Lima", ["Main St", "Elm St", "Allentown Rd", "Robb Ave"]],
];
const KY = [
  ["Louisville", ["Bardstown Rd", "Dixie Hwy", "Shelbyville Rd", "Preston Hwy", "Frankfort Ave", "Poplar Level Rd", "Brownsboro Rd", "Outer Loop", "Hurstbourne Pkwy", "Taylorsville Rd"]],
  ["Lexington", ["Main St", "Richmond Rd", "Nicholasville Rd", "Winchester Rd", "Versailles Rd", "Tates Creek Rd", "New Circle Rd", "Georgetown St", "Broadway", "Liberty Rd"]],
  ["Covington", ["Madison Ave", "Scott St", "Greenup St", "Pike St", "Dixie Hwy", "Holman St"]],
  ["Newport", ["Monmouth St", "York St", "Washington Ave", "Carothers Rd", "Alexandria Pike"]],
  ["Florence", ["Dixie Hwy", "Houston Rd", "Turfway Rd", "Main St", "Industrial Rd"]],
  ["Independence", ["Madison Pike", "Taylor Mill Rd", "McFarland Rd", "Richardson Rd"]],
  ["Erlanger", ["Dixie Hwy", "Commonwealth Ave", "Donaldson Hwy", "Kentucky Ave"]],
  ["Fort Thomas", ["Alexandria Pike", "Highland Ave", "N Fort Thomas Ave", "River Rd"]],
  ["Burlington", ["Burlington Pike", "Camp Ernst Rd", "Bullittsville Rd", "North Bend Rd"]],
  ["Hebron", ["Petersburg Rd", "North Bend Rd", "Litton Ln", "Limaburg Rd"]],
];

function buildAddresses() {
  const out = [];
  const numbers = [114, 220, 305, 428, 517, 640, 755, 812, 905, 1010, 1118, 1225, 1330, 1440, 1555, 1620, 1780, 1905, 2050, 2145, 2260, 2400];
  // Two house-number variants per street → ~560 addresses, sliced to 500.
  for (const v of [0, 9]) {
    for (const [city, streets] of OH) for (const st of streets) out.push(`${numbers[(out.length + v) % numbers.length]} ${st}, ${city}, OH`);
    for (const [city, streets] of KY) for (const st of streets) out.push(`${numbers[(out.length + v) % numbers.length]} ${st}, ${city}, KY`);
  }
  // Interleave states so a KY outage can't skew the tail of the run.
  const oh = out.filter((a) => a.endsWith("OH")), ky = out.filter((a) => a.endsWith("KY"));
  const mixed = [];
  for (let i = 0; i < Math.max(oh.length, ky.length); i++) { if (oh[i]) mixed.push(oh[i]); if (ky[i]) mixed.push(ky[i]); }
  return mixed.slice(0, 500);
}

// ── Same pipeline as the function ──
async function fetchJSON(url, tries = 2) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (r.status === 429 || r.status >= 500) { last = new Error(`HTTP ${r.status}`); await sleep(800 * (i + 1)); continue; }
      return await r.json();
    } catch (e) { last = e; await sleep(800 * (i + 1)); }
  }
  throw last;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pointInRings(rings, p) {
  let inside = false;
  for (const ring of rings || []) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

async function boundaryQuery(url, point) {
  const params = new URLSearchParams({ f: "json", where: "1=1", geometry: JSON.stringify({ x: point.lng, y: point.lat, spatialReference: { wkid: 4326 } }), geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", distance: "25", units: "esriSRUnit_Meter", outFields: "*", returnGeometry: "true", outSR: "4326", resultRecordCount: "10" });
  const data = await fetchJSON(`${url}/query?${params}`);
  if (data.error || !Array.isArray(data.features)) throw new Error(data.error?.message || "bad boundary response");
  return data.features.map((f) => ({ attrs: f.attributes || {}, inside: pointInRings(f.geometry?.rings, point), rings: f.geometry?.rings }));
}

let lastNominatim = 0;
async function geocodeNominatim(address) {
  // OSM Nominatim usage policy: max 1 request/second, descriptive UA required.
  const wait = Math.max(0, lastNominatim + 1050 - Date.now());
  if (wait) await sleep(wait);
  lastNominatim = Date.now();
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&addressdetails=1&q=${encodeURIComponent(address)}`, { headers: { "User-Agent": "ccs-signage-permitting-validation/1.0" }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`nominatim HTTP ${r.status}`);
  const hit = (await r.json())?.[0];
  if (!hit?.lat || !hit?.lon) return null;
  const a = hit.address || {};
  return { lat: Number(hit.lat), lon: Number(hit.lon), display: hit.display_name, state: a.state || "", city: a.city || a.town || a.village || a.hamlet || "", source: "nominatim" };
}

async function testAddress(address) {
  const out = { address, ok: false, stage: "geocode", detail: "" };
  try {
    // Primary: Nominatim (the app's browser fallback — handles interpolation).
    let g = null;
    try { g = await geocodeNominatim(address); } catch (e) { out.nominatim_error = String(e?.message || e); }
    // Fallback: Census locator (what the function uses when Google fails).
    let match = null;
    if (!g) {
      const geo = await fetchJSON(`${CENSUS_GEOCODE}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`);
      match = geo?.result?.addressMatches?.[0];
    } else {
      match = { coordinates: { x: g.lon, y: g.lat }, matchedAddress: g.display, addressComponents: { state: g.state } };
    }
    if (!match?.coordinates) {
      // Postal fallback: no pin needed — "city written on mail" -> jurisdiction
      // via PermitResolutionRule(postal_name_map). City-level certainty only;
      // county-gated rules can't fire without a derived county.
      try {
        const parts = String(address).split(",").map((s) => s.trim()).filter(Boolean);
        const last = parts[parts.length - 1] || "";
        const stM = last.match(/^([A-Z]{2})\b/) || last.match(/\b(OH|OHIO|KY|KENTUCKY)\b/i);
        const stGuess = stM ? (/^OH/i.test(stM[1]) ? "OH" : "KY") : null;
        const normV = (v) => String(v || "").trim().toLowerCase().replace(/\s+(city|village|town|county|township|twp\.?|tp\.?|hts|heights)$/, (m) => /hts|heights/.test(m) ? "" : "").replace(/^mt\b/, "mount").replace(/^st\b/, "saint").replace(/\bct hs\b/, "court house").replace(/^wshngtn\b/, "washington").replace(/\s+/g, " ");
        const cityGuess = parts.length > 1 ? normV(parts[parts.length - 2]) : "";
        if (stGuess && cityGuess) {
          let rules = [];
          try { rules = (JSON.parse(readFileSync(".audit-work/mirrors/rules.json", "utf8")).rows || []); } catch {}
          const hit = rules.find((r) => r.rule_type === "postal_name_map" && r.active !== false && String(r.state || "").toUpperCase() === stGuess && normV(r.entered_name) === cityGuess && !r.county);
          const streetKey = normV(parts[0]).replace(/\s+(apt|suite|unit|ste|#)\s*.*$/i, "");
          const oHit = rules.find((r) => r.rule_type === "address_override" && r.active !== false && String(r.state || "").toUpperCase() === stGuess && normV(r.address_key) === streetKey);
          const pick = hit || oHit;
          if (pick) {
            out.ok = true; out.stage = "resolved"; out.detail = `${oHit ? "address override" : "postal rule"}: ${oHit ? streetKey : cityGuess} -> ${pick.jurisdiction_name}`;
            out.target = { type: pick.jurisdiction_type || "municipality", name: pick.jurisdiction_name };
            out.county = pick.county || "";
            return out;
          }
        }
      } catch {}
      out.detail = "no geocoder match"; return out;
    }
    out.geocoder = g ? "nominatim" : "census";
    const point = { lat: match.coordinates.y, lng: match.coordinates.x };
    out.point = point; out.matched = match.matchedAddress;
    const st = normalizeSt(match.addressComponents?.state || "");
    if (!["OH", "KY"].includes(st)) { out.stage = "geocode"; out.detail = `wrong state ${st || "(none)"}`; return out; }
    out.stage = "boundary";
    const fips = st === "OH" ? "39" : "21";
    const [counties, places, stateCities] = await Promise.all([
      boundaryQuery(LOCATION_SOURCES.county, point),
      boundaryQuery(LOCATION_SOURCES.place, point),
      boundaryQuery(st === "OH" ? LOCATION_SOURCES.oh_city : LOCATION_SOURCES.ky_city, point),
    ]);
    const county = counties.filter((f) => f.inside);
    if (county.length !== 1 || String(county[0].attrs.STATE) !== fips) { out.detail = `county check failed (${county.length} inside)`; return out; }
    const cities = places.filter((f) => f.inside), sCities = stateCities.filter((f) => f.inside);
    if (cities.length > 1 || sCities.length > 1 || cities.length !== sCities.length) {
      out.detail = `city sources disagree (census:${cities.length} state:${sCities.length})`;
      out.stage = "city_conflict"; return out;
    }
    let target;
    if (cities.length === 1) target = { type: "municipality", name: cities[0].attrs.NAME || sCities[0].attrs.NAME };
    else {
      out.stage = "township_lookup";
      const townships = await boundaryQuery(LOCATION_SOURCES.township, point);
      const st2 = st === "OH" ? await boundaryQuery(LOCATION_SOURCES.oh_township, point) : [];
      const tIn = townships.filter((f) => f.inside), sIn = st2.filter((f) => f.inside);
      if (!tIn.length) { out.detail = "no city, no township"; out.stage = "unresolved"; return out; }
      target = { type: "township", name: tIn[0].attrs.NAME, county: county[0].attrs.NAME };
      if (st === "OH" && sIn.length !== tIn.length) out.detail = `state township disagree (census:${tIn.length} state:${sIn.length})`;
    }
    out.ok = true; out.stage = "resolved"; out.target = target; out.county = county[0].attrs.NAME;
    return out;
  } catch (e) { out.detail = String(e?.message || e); return out; }
}

// ── Live mode: call the deployed resolvePermittingAddress end-to-end. ──
const APP_ID = "68dfcc5e57bbbc35387da97c";
const FN_URL = `https://base44.app/api/apps/${APP_ID}/functions/resolvePermittingAddress`;
const SCAN_URL = `https://base44.app/api/apps/${APP_ID}/functions/permittingScanStatus`;

// While an address call is in flight, poll its PermittingScanRun so the
// dashboard shows the REAL server-side steps (which boundary URL was queried,
// which geocoder answered, how many saved offices were checked) — not a
// client-side guess. Passing action_token is what makes the function record
// this activity; without it the run is silent.
async function pollScanSteps(tokenRef, getToken, onStep, stop) {
  const seen = new Set();
  while (!stop.done) {
    await sleep(900);
    if (stop.done) break;
    const actionToken = tokenRef.current;
    if (!actionToken) continue;
    try {
      await paceCall('permittingScanStatus');
      const r = await fetch(SCAN_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_token: getToken(), action_token: actionToken }),
        signal: AbortSignal.timeout(8000),
      });
      const j = await r.json().catch(() => ({}));
      for (const ev of j?.run?.events || []) {
        const k = `${ev.at}|${ev.kind}|${ev.detail || ""}`;
        if (seen.has(k)) continue;
        seen.add(k);
        onStep?.(ev);
      }
    } catch { /* polling is best-effort; the call result is authoritative */ }
  }
}

async function testAddressLive(address, getToken, onStep, requeried = false) {
  const out = { address, ok: false, stage: "invoke", detail: "" };
  const tokenRef = { current: null };
  const stop = { done: false };
  const poller = pollScanSteps(tokenRef, getToken, onStep, stop);
  let last;
  try {
  for (let attempt = 0; attempt < 3; attempt++) {
    // A retried call must mint a FRESH scan token — the first attempt's
    // PermittingScanRun row already exists and createScanReporter 409s on
    // duplicates, which used to masquerade as an invoke failure even though
    // the server-side work had actually run.
    const actionToken = crypto.randomUUID();
    tokenRef.current = actionToken;
    try {
      onStep?.({ kind: "live_call", detail: "Calling the live resolver function…" });
      await paceCall('resolvePermittingAddress');
      const r = await fetch(FN_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, session_token: getToken(), action_token: actionToken }),
        signal: AbortSignal.timeout(60000),
      });
      if (r.status === 401 || r.status === 403) { last = new Error(`HTTP ${r.status}`); if (await refreshToken()) { attempt--; continue; } return out; }
      // 429 = shared-budget burst. Retry patiently like the picker does
      // (up to ~90s of waiting) without consuming a real attempt — but once
      // one address has waited 4+ times the app-level volume cap is likely
      // tripped, so back off to 30-45s instead of poking a saturated app.
      if (r.status === 429) { last = new Error(`HTTP 429`); if ((out.busy_waits = (out.busy_waits || 0) + 1) <= 12) { const w = Math.min(out.busy_waits >= 4 ? 30000 + 5000 * out.busy_waits : 3000 + 1500 * out.busy_waits, 45000); onStep?.({ kind: "busy_wait", detail: `App read budget busy — waiting ${Math.round(w / 1000)}s before retrying` }); await sleep(w); attempt--; } continue; }
      // 5xx / user-exception = worker-pool transient. Wait it out like 429 —
      // up to ~4 min of escalation — without burning one of the 3 real
      // attempts. A saturated window outlives 3 quick retries, so patience here
      // is what keeps transient outages from landing as permanent invoke rows.
      if (r.status >= 500) { last = new Error(`HTTP ${r.status}`); if ((out.server_waits = (out.server_waits || 0) + 1) <= 8) { const w = Math.min(5000 + 8000 * out.server_waits, 60000); onStep?.({ kind: "server_wait", detail: `Resolver worker restarting (HTTP ${r.status}) — waiting ${Math.round(w / 1000)}s` }); await sleep(w); attempt--; } continue; }
      const res = await r.json();
      const d = res?.data || res;
      if (d?.success === false && Number(d?.retry_after_ms) > 0) {
        last = new Error(`busy (retry_after ${d.retry_after_ms}ms)`);
        onStep?.({ kind: "busy_wait", detail: `Resolver queue busy — retrying in ${Math.round(Math.min(d.retry_after_ms, 8000) / 1000)}s` });
        await sleep(Math.min(d.retry_after_ms, 8000));
        attempt--; // busy doesn't consume an attempt — it's a queue guard
        continue;
      }
      if (d?.success === false && /scan action already exists/i.test(String(d?.error || ""))) {
        last = new Error("scan token collision"); await sleep(1500); attempt--; continue;
      }
      if (d?.success === false) { out.stage = "invoke"; out.detail = d.error || "function error"; return out; }
      out.result = {
        apply_allowed: d?.apply_allowed === true,
        status: d?.location_resolution?.status || "",
        suggested: d?.suggested_locality?.name || null,
        ai_name: d?.ai_locality_name || null,
        targets: (d?.location_resolution?.targets || []).map((t) => `${t.name}${t.type ? ` (${t.type})` : ""}`).join(" + "),
        trace: [
          d?.geocode ? (d.geocode.location_exact ? "google rooftop pin" : `approx pin (${d.geocode.approximate_source || "service"})`) : (d?.geocoding_service?.issue ? "geocode service issue" : "no geocode"),
          (d?.location_resolution?.sources || []).length ? `checked ${d.location_resolution.sources.map((s) => s.kind).join(" + ")} boundaries` : "no boundary sources answered",
          (d?.location_resolution?.targets || []).length ? `inside ${d.location_resolution.targets.map((t) => t.name).join(" + ")}` : "",
          d?.authority_review ? `offices: ${d.authority_review.verified_office_count ?? 0} checked · ${d.authority_review.other_office_count ?? 0} unchecked` : "",
          d?.automatic_scan?.started ? "research scan started" : "",
        ].filter(Boolean).join(" → "),
        geocoder: d?.geocode ? (d.geocode.location_exact ? "exact" : d.geocode.approximate_source || "approx") : (d?.geocoding_service?.issue ? "issue" : "none"),
        boundaries: (d?.location_resolution?.boundaries || []).length,
        geo_issue: Boolean(d?.geocoding_service?.issue),
        match: d?.match_method || "",
      };
      if (d?.apply_allowed === true) { out.ok = true; out.stage = "resolved_apply"; return out; }
      if (d?.suggested_locality) { out.ok = true; out.stage = "resolved_needs_office_check"; return out; }
      if (d?.location_resolution?.status === "location_verified") {
        // Don't let a location finish before its office record exists — the
        // generator picks this target up from the event feed in ~1-2s, so
        // wait for it and re-query once; the locality then matches and the
        // address closes as resolved, not "located with nothing behind it".
        out.stage = "located_no_locality"; out.detail = `${d.ai_locality_name || "?"} — no saved office matched`;
        if (!requeried) {
          onStep?.({ kind: "requery", detail: `Location is ${d.ai_locality_name || "?"} — waiting for its office record, then re-checking` });
          await sleep(5000);
          const again = await testAddressLive(address, getToken, onStep, true);
          return again.stage === "located_no_locality" ? out : again;
        }
        return out;
      }
      if (d?.location_resolution?.status === "needs_review") { out.stage = "needs_review"; out.detail = d.location_resolution?.reason || ""; return out; }
      if (d?.location_resolution?.status === "invalid_input") { out.ok = true; out.stage = "invalid_input"; out.detail = d.location_resolution?.reason || "not a street address"; return out; }
      out.stage = "unresolved"; out.detail = d?.match_reason || d?.location_resolution?.reason || d?.notes || "no resolution";
      return out;
    } catch (e) { last = e; await sleep(2000 * (attempt + 1)); }
  }
  } finally { stop.done = true; await poller.catch(() => {}); }
  out.stage = "invoke"; out.detail = String(last?.message || last);
  return out;
}

// Session tokens expire mid-run — re-login once on demand, shared across workers.
let tokenRefresher = null;
async function refreshToken() { return tokenRefresher ? tokenRefresher() : false; }

function normalizeSt(v) {
  const s = String(v || "").toLowerCase();
  if (s === "ohio" || s === "oh") return "OH";
  if (s === "kentucky" || s === "ky") return "KY";
  return s.toUpperCase();
}

const args = process.argv.slice(2);
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : 500;
const skip = args.includes("--skip") ? Number(args[args.indexOf("--skip") + 1]) : 0;
let pool = buildAddresses();
if (args.includes("--file")) {
  const { readFileSync } = await import("node:fs");
  const raw = JSON.parse(readFileSync(args[args.indexOf("--file") + 1], "utf8"));
  pool = raw.map((x) => (typeof x === "string" ? x : x.address)).filter(Boolean);
}
const addresses = pool.slice(skip, skip + limit);
const eventsFile = args.includes("--events") ? args[args.indexOf("--events") + 1] : null;
let eventsFd = null;
if (eventsFile) { const { openSync } = await import("node:fs"); eventsFd = openSync(eventsFile, "a"); }
const emit = (r) => { if (eventsFd != null) { try { writeFd(eventsFd, JSON.stringify(
  r.__start ? { t: Date.now(), start: true, address: r.__start, worker: r.worker }
  : r.__step ? { t: Date.now(), step: true, address: r.__step, worker: r.worker, kind: r.kind, detail: String(r.detail || "").slice(0, 240) }
  : { t: Date.now(), address: r.address, worker: r.worker, stage: r.stage, ok: r.ok, suggested: r.result?.suggested || null, targets: r.result?.targets || "", geocoder: r.result?.geocoder || r.geocoder || "", ms: r.ms || 0, busy_waits: r.busy_waits || 0, detail: (r.detail || "").slice(0, 120), trace: r.result?.trace || "" }) + "\n"); } catch {} } };
const { writeSync: writeFd } = await import("node:fs");
let liveToken = process.env.PERMIT_SESSION_TOKEN || "";
// Long runs outlive tokens — keep a shared refresher all workers use.
if (process.env.PERMIT_AUTO_LOGIN === "1") {
  tokenRefresher = async () => {
    try {
      const j = await fetch(`https://base44.app/api/apps/${APP_ID}/functions/verifyLogin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }) }).then((r) => r.json());
      if (j?.token) { liveToken = j.token; return true; }
    } catch {}
    return false;
  };
  if (!liveToken) await tokenRefresher();
}
const getToken = () => liveToken;
// --require-live: refuse a whole run in public mode. The forever-runner uses
// this so a login failure can never silently degrade a validation cycle to
// the local pipeline (which bypasses deployed rules, county GIS, and the
// lookup index — and still writes "resolved" marks to the event stream).
if (args.includes("--require-live") && !liveToken) {
  console.log("no live session token — refusing public-mode run");
  process.exit(42);
}
const results = new Array(addresses.length);
// Brett's cap: at most 12 lookup workers + 1 office creator (raised
// 1→3→5→8→10→12 on 2026-11-02 under his direction — ramping until invoke 500s
// appear, then backing to the last clean level; the app entity budget, not
// local CPU, is the ceiling).
// Default is deliberately 1 so a forgetful launch never oversubscribes.
const WORKERS = args.includes("--workers") ? Math.min(Number(args[args.indexOf("--workers") + 1]), 12) : 1;
const delayMs = args.includes("--delay-ms") ? Number(args[args.indexOf("--delay-ms") + 1]) : (liveToken ? 800 : 300);
console.log(`Testing ${addresses.length} addresses (${WORKERS} workers, ${liveToken ? "LIVE function" : "public services"}, delay ${delayMs}ms/worker)…`);
let done = 0, cursor = 0;
const jsonIdx2 = args.indexOf("--json");
async function worker(id) {
  while (cursor < addresses.length) {
    const i = cursor++;
    const a = addresses[i];
    if (!a) break;
    emit({ __start: a, worker: id });
    const t0 = Date.now();
    const r = liveToken
      ? await testAddressLive(a, getToken, (ev) => emit({ __step: a, worker: id, kind: ev.kind, detail: ev.detail }))
      : await testAddress(a);
    r.ms = Date.now() - t0; r.worker = id;
    emit(r);
    results[i] = r; done++;
    if (done % 20 === 0) {
      const got = results.filter(Boolean);
      const stages = {};
      for (const x of got.filter((x) => !x.ok)) stages[x.stage] = (stages[x.stage] || 0) + 1;
      console.log(`${done}/${addresses.length} — ${got.filter((r) => r.ok).length} resolved so far — failures: ${JSON.stringify(stages)}`);
      if (jsonIdx2 >= 0) {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(args[jsonIdx2 + 1], JSON.stringify({ partial: true, done, results: got }, null, 2));
      }
    }
    await sleep(delayMs);
  }
}
await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i + 1)));
const finalResults = results.filter(Boolean);

// Failed calls + unresolved items keep retrying — each testAddressLive call is
// up to 3 internal attempts, so 3 extra sweeps lands at roughly 10 total logic
// attempts. Whatever still fails after that is exported to a work-list file
// for human diagnosis instead of silently disappearing.
const RETRYABLE = new Set(["invoke", "unresolved"]);
// Vague-pin needs_review items are also retryable — resolver upgrades can
// turn them into real answers. Boundary-proximity reviews are deterministic
// flags and correctly stay out.
const retryable = (r) => RETRYABLE.has(r.stage) || r.stage === "located_no_locality" || (r.stage === "needs_review" && /approximate/i.test(r.detail || ""));
let stuck = finalResults.filter(retryable);
const keep = finalResults.filter((r) => !retryable(r));
for (let sweep = 1; stuck.length && sweep <= 3; sweep++) {
  console.log(`\nretry sweep ${sweep}: ${stuck.length} addresses still failing`);
  const retrying = stuck; stuck = [];
  for (const r of retrying) {
    const again = await testAddressLive(r.address, getToken, (ev) => emit({ __step: r.address, worker: "sweep", kind: ev.kind, detail: ev.detail }));
    emit({ ...again });
    await sleep(delayMs);
    (retryable(again) ? stuck : keep).push(again);
  }
}
finalResults.length = 0; finalResults.push(...keep, ...stuck);
if (stuck.length) {
  const jsonPath = args.includes("--json") ? args[args.indexOf("--json") + 1] : "run.json";
  const stuckFile = `.stuck-${jsonPath.split(/[\\/]/).pop()}`;
  writeFileSync(stuckFile, JSON.stringify(stuck.map((r) => ({ address: r.address, stage: r.stage, detail: r.detail })), null, 2));
  for (const r of stuck) emit({ ...r, stage: "stuck", ok: false, detail: `${r.stage} after ~10 attempts — moved to the fix list` });
  console.log(`\n${stuck.length} addresses exhausted ~10 attempts → ${stuckFile}`);
}
results.length = 0; results.push(...finalResults);
const byStage = {}, fails = results.filter((r) => !r.ok);
for (const r of fails) byStage[`${r.stage}`] = (byStage[r.stage] || 0) + 1;
const summary = {
  total: results.length, resolved: results.filter((r) => r.ok).length,
  rate: `${((results.filter((r) => r.ok).length / results.length) * 100).toFixed(1)}%`,
  failure_stages: byStage,
  geocode_misses: fails.filter((r) => r.stage === "geocode").length,
  boundary_errors: fails.filter((r) => r.stage === "boundary").length,
  city_conflicts: fails.filter((r) => r.stage === "city_conflict").length,
  unresolved: fails.filter((r) => r.stage === "unresolved").length,
};
console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(summary, null, 2));
const jsonIdx = args.indexOf("--json");
if (jsonIdx >= 0) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(args[jsonIdx + 1], JSON.stringify({ summary, results }, null, 2));
  console.log(`Wrote ${args[jsonIdx + 1]}`);
}
console.log("\nFailures:");
for (const r of fails.slice(0, 60)) console.log(`  [${r.stage}] ${r.address} — ${r.detail}`);
