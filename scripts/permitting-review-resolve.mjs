#!/usr/bin/env node
// Turns a staff review decision into a REUSABLE PermitResolutionRule — every
// flag resolved here kills that entire class of flag for every future lookup,
// not just the one address. This is the anti-review-queue tool: the point is
// that in-app review shrinks toward 0% as rules accumulate.
//
//   --list                          Show addresses whose latest stage is needs_review, with candidates.
//   --address "A" --pick "Name"     Mint a rule resolving that flagged item.
//     --type municipality|township|county|city|village   Jurisdiction type (auto-guessed from pick text).
//     --county "Hamilton"           Scope: parent county (auto-filled from the flagged event when known).
//     --state OH|KY                 Auto-filled from the flagged event.
//     --scope postal|address        postal (default): "city written on mail -> jurisdiction" generalizes
//                                   to ALL addresses sharing the postal city in that county.
//                                   address: one-parcel override (last resort).
//     --entered-name "Amelia"       Postal city for postal scope (defaults to the address's city part).
//     --retire                      Deactivate the matching rule instead of creating.
//     --dry-run                     Print the rule row without writing.
//
// After minting, re-run the address through the resolver (validator or app)
// once the ~5min rule cache rolls — it should come back location_verified
// with corroborated_by:'resolution_rule'.
import { readFileSync, appendFileSync, existsSync, writeFileSync } from "node:fs";
import { permitCreds } from './lib/permit-creds.mjs';
import { mirrorApply } from './lib/entity-mirror.mjs';
import { paceCall } from './lib/read-ledger.mjs';

const APP_ID = "68dfcc5e57bbbc35387da97c";
const FN = (n) => `https://base44.app/api/apps/${APP_ID}/functions/${n}`;
const EVENTS = ".live-events.jsonl";
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const val = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };

let token = process.env.PERMIT_SESSION_TOKEN || (existsSync(".permit-session-token") ? readFileSync(".permit-session-token", "utf8").trim() : "") || (existsSync(".permit-token.txt") ? readFileSync(".permit-token.txt", "utf8").trim() : "");

// ---- latest needs_review marks from the live event stream -------------------
function flaggedItems() {
  if (!existsSync(EVENTS)) return [];
  const last = new Map();
  for (const line of readFileSync(EVENTS, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (!e.address || !e.stage) continue;
    last.set(e.address, e);
  }
  return [...last.values()].filter((e) => e.stage === "needs_review");
}

const emit = (rec) => { try { appendFileSync(EVENTS, JSON.stringify({ t: Date.now(), ...rec }) + "\n"); } catch {} };
const normName = (v) => String(v || "").trim().toLowerCase().replace(/\s+(city|village|town|county|township|twp\.?|tp\.?)$/, "").replace(/\s+/g, " ");
const guessType = (name) => {
  const n = String(name || "").toLowerCase();
  if (/\btownship|twp\b/.test(n)) return "township";
  if (/\bcounty\b/.test(n)) return "county";
  if (/\bvillage\b/.test(n)) return "village";
  return "municipality";
};

if (flag("list")) {
  const items = flaggedItems();
  console.log(`${items.length} address(es) currently flagged needs_review:\n`);
  for (const e of items) {
    console.log(`  ${e.address}`);
    console.log(`    reason: ${e.detail || e.reason || "(no detail)"}`);
    for (const c of e.candidates || []) console.log(`    candidate: ${c.name || c}  [${c.type || "?"}${c.inside ? ", pin inside" : ""}]`);
  }
  process.exit(0);
}

// ---- resolve mode -----------------------------------------------------------
const address = val("address");
const pick = val("pick");
if (!address || !pick) {
  console.log("Usage: --list  |  --address \"A\" --pick \"Jurisdiction\" [--county X] [--state OH] [--type T] [--scope postal|address] [--retire] [--dry-run]");
  process.exit(1);
}

const item = flaggedItems().find((e) => normName(e.address).startsWith(normName(address).slice(0, 30)) || normName(address).includes(normName(e.address).slice(0, 30)));
const enteredCity = val("entered-name") || (() => { const parts = String(address).split(",").map((s) => s.trim()); return parts.length > 1 ? parts[1] : ""; })();
const scope = val("scope") || "postal";
const state = (val("state") || item?.state || "").toUpperCase().replace(/^OHIO$/, "OH").replace(/^KENTUCKY$/, "KY");
const countyRaw = val("county") || item?.county || item?.target?.county || "";
// A bare "county" literal means county derivation failed upstream — storing it
// dead-locks the rule (county gate can never match). Empty is honest: the
// gate simply doesn't constrain.
const county = /^\s*(the\s+)?county\s*$/i.test(countyRaw) ? "" : countyRaw;
const jtype = val("type") || guessType(pick);

const rule = {
  rule_type: scope === "address" ? "address_override" : "postal_name_map",
  entered_name: scope === "address" ? "" : normName(enteredCity),
  address_key: scope === "address" ? normName(String(address).split(",")[0]) : "",
  state, county: normName(county),
  jurisdiction_name: normName(pick),
  jurisdiction_type: jtype,
  geoid: val("geoid") || "",
  source: "staff_review",
  evidence: `Staff resolved flagged address "${address}" -> ${pick}. ${item?.detail || item?.reason || ""}`.slice(0, 900),
  created_from_address: address,
  active: true,
};

console.log("Rule to write:", JSON.stringify(rule, null, 2));
if (flag("dry-run")) process.exit(0);
if (!state) { console.error("Could not determine state — pass --state OH|KY."); process.exit(1); }
const login = async () => {
  const j = await fetch(FN("verifyLogin"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: permitCreds().user, password: permitCreds().pass }), signal: AbortSignal.timeout(20000) }).then((r) => r.json()).catch(() => ({}));
  token = j?.token || token;
};
// Auto-login when the tool runs inside the fleet (PERMIT_AUTO_LOGIN) or when
// the token file is missing — the on-disk tokens go stale in ~1 day and the
// old single-shot call surfaced that as "Authentication required".
if (!token || process.env.PERMIT_AUTO_LOGIN) await login();
if (!token) { console.error("No session token (PERMIT_SESSION_TOKEN / .permit-session-token)."); process.exit(1); }

const call = async (fn, body, authRetried = false, busyRetry = 0) => {
  let r;
  try {
  await paceCall(fn);
    r = await fetch(FN(fn), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_token: token, ...body }), signal: AbortSignal.timeout(30000) });
  } catch (e) {
    if (busyRetry < 5) { await new Promise((s) => setTimeout(s, 4000 * (busyRetry + 1))); return call(fn, body, authRetried, busyRetry + 1); }
    return { status: 0, body: { error: String(e?.message || e) } };
  }
  if ((r.status === 401 || r.status === 403) && !authRetried) { await login(); return call(fn, body, true, busyRetry); }
  if (r.status === 429 && busyRetry < 8) { await new Promise((s) => setTimeout(s, 5000 * (busyRetry + 1))); return call(fn, body, authRetried, busyRetry + 1); }
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j?.data || j };
};

// Dedupe: an identical active rule already on file means this class is covered.
const existing = await call("staffDataRead", { entity: "PermitResolutionRule", query: { active: true, state }, limit: 100 });
const items = Array.isArray(existing.body?.items) ? existing.body.items : (existing.body?.item ? [existing.body.item] : []);
const dupe = (Array.isArray(items) ? items : []).find((r) =>
  r.rule_type === rule.rule_type &&
  normName(r.entered_name) === normName(rule.entered_name) &&
  normName(r.address_key) === normName(rule.address_key) &&
  normName(r.county) === normName(rule.county) &&
  normName(r.jurisdiction_name) === normName(rule.jurisdiction_name));

if (flag("retire")) {
  if (!dupe) { console.log("No matching active rule found to retire."); process.exit(1); }
  const res = await call("staffEntityWrite", { entity: "PermitResolutionRule", op: "update", data: { id: dupe.id, active: false } });
  if (res.status === 200) { try { mirrorApply('rules', { id: dupe.id, active: false }); } catch {} }
  console.log(`Retired rule ${dupe.id}:`, res.status === 200 ? "OK" : JSON.stringify(res.body));
  emit({ address, stage: "rule_retired", detail: `Rule retired: ${rule.rule_type} ${rule.entered_name || rule.address_key} -> ${pick} (${county}, ${state})` });
  process.exit(res.status === 200 ? 0 : 1);
}

if (dupe) {
  console.log(`Identical active rule already exists (${dupe.id}) — this flag class is already covered. Re-run the address to resolve it.`);
  emit({ address, stage: "rule_already_covered", detail: `Existing rule ${dupe.id} already maps ${rule.entered_name || rule.address_key} -> ${pick}.` });
  process.exit(0);
}

const res = await call("staffEntityWrite", { entity: "PermitResolutionRule", op: "create", data: rule });
const ok = res.status === 200 || res.body?.success === true;
// Write-through: local workers must see the new rule NOW, not after the
// next mirror-sync — otherwise flags re-emit while a rule already exists.
if (ok) {
  const rid = res.body?.item?.id || res.body?.id || null;
  try { mirrorApply('rules', { ...(rid ? { id: rid } : {}), ...rule, active: true }); } catch {}
  try {
    const f = '.audit-work/rules.json';
    const cur = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : [];
    cur.push({ ...(rid ? { id: rid } : {}), ...rule, active: true });
    writeFileSync(f, JSON.stringify(cur));
  } catch {}
}
console.log(ok ? `Rule created (${res.body?.item?.id || res.body?.id || "?"}).` : `Create failed: HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 400)}`);
emit({
  address, stage: ok ? "rule_created" : "rule_create_failed",
  detail: ok
    ? `Staff review minted reusable rule: ${rule.rule_type === "postal_name_map" ? `postal city "${enteredCity}"` : `address "${rule.address_key}"`} -> ${pick} in ${county || state}. All future lookups matching this pattern now resolve automatically.`
    : `Rule write failed: ${JSON.stringify(res.body).slice(0, 200)}`,
});
if (ok) console.log("Re-run this address after the ~5min rule cache rolls — it should resolve with corroborated_by: resolution_rule.");
process.exit(ok ? 0 : 1);
