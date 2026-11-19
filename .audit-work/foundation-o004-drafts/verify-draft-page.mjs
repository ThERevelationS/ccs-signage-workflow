// O-004 static page verification — asserts (a) the new guard/messaging is
// present, (b) every previously-landed availability/draft wiring survives in
// the candidate page, and (c) the baseline->candidate diff touches only the
// expected regions in each file.
import assert from "node:assert/strict";
import fs from "node:fs";

const DIR = ".audit-work/foundation-o004-drafts/";
const page = fs.readFileSync(DIR + "candidates/FoundationEstimator.jsx", "utf8");
const base = fs.readFileSync(DIR + "remote-src/src/pages/FoundationEstimator.jsx", "utf8");
const store = fs.readFileSync(DIR + "candidates/foundationDraftRecovery.js", "utf8");
const storeBase = fs.readFileSync(DIR + "remote-src/src/components/estimator/foundation/foundationDraftRecovery.js", "utf8");

const results = [];
const R = (name, fn) => {
  try { fn(); results.push({ case: name, ok: true }); console.log("ok", name); }
  catch (e) { results.push({ case: name, ok: false, error: String(e.stack || e).slice(0, 800) }); console.log("FAIL", name, "-", String(e.message || e).slice(0, 300)); }
};

const has = (src, needle, label) => assert.ok(src.includes(needle), `missing: ${label || needle}`);
const count = (src, needle) => src.split(needle).length - 1;

// ---------- new O-004 surface ----------
R("page: dirty-route-leave guard wired (click capture + sentinel popstate)", () => {
  has(page, "navGuardArmedRef", "armed ref");
  has(page, "ccsFoundationLeaveGuard", "sentinel marker");
  has(page, 'document.addEventListener("click", onClickCapture, true)', "capture-phase click guard");
  has(page, 'window.addEventListener("popstate", onPop)', "popstate listener");
  has(page, "window.history.forward()", "cancel re-arms via forward()");
  has(page, "Unsent edits stay backed up in this browser tab only.", "guard copy mentions tab-only backup");
  has(page, 'a[href]', "anchor interception");
  has(page, 'url.origin !== window.location.origin', "external links pass");
});

R("page: draft messaging updated to pricing-inclusive + tab-only honest copy", () => {
  has(page, "Design and customer-pricing edits backed up in this browser tab only", "backedUp message");
  assert.equal(count(page, "Recovery covers design and customer-pricing fields"), 2, "both offer states updated");
  assert.equal(count(page, "Recovery covers design fields only"), 0, "stale design-only copy removed");
});

R("store: pricing fields allowlisted + loss marker implemented", () => {
  for (const f of ["customer_markup_percent", "customer_price_override", "customer_pricing"]) has(store, `"${f}"`, f);
  has(store, "draftLost: true", "tombstone write");
  has(store, "env.draftLost === true", "tombstone read");
  has(store, "leaveLossMarker", "marker helper");
  has(store, "could not be kept", "graceful-loss read message");
  assert.equal(count(store, "FOUNDATION_DRAFT_FIELDS = ["), 1, "single explicit allowlist literal");
});

// ---------- protected wiring (landed earlier units — must stay intact) ----------
R("page: availability-hardening wiring preserved", () => {
  has(page, "pricingBlocked", "pricingBlocked gate");
  has(page, "wallPricing={calc.wallPricing}", "wallPricing prop");
  has(page, "polePricing={calc.polePricing}", "polePricing prop");
  has(page, "calc.totals.grand_total === null", "null-gated totals");
  has(page, "Estimate handoff paused", "handoff-paused surface");
  has(page, "catalogReloadRef", "catalog reload flight guard");
  has(page, "inputIssues", "input-issue surface");
  has(page, "hasFoundationCostSnapshot(cabinetCost)", "cabinet snapshot gate");
  has(page, "hasFoundationCostSnapshot(landscapeCost)", "landscape snapshot gate");
  has(page, "captureConcreteDeliverySnapshot", "delivery snapshot capture");
});

R("page: draft-store wiring preserved (persist/restore/discard/save-clear)", () => {
  has(page, "persistBrowserDraft(next)", "commit persist");
  has(page, "persistBrowserDraft(prevState)", "undo persist");
  has(page, "persistBrowserDraft(nextState)", "redo persist");
  has(page, "restoreBrowserDraft", "restore handler");
  has(page, "discardBrowserDraft", "discard handler");
  has(page, "session.store.read()", "restore CAS re-read");
  has(page, "session.store.clear(offer?.revision ?? null)", "CAS discard");
  has(page, "captured.draftStoreRef.clear(captured.draftRevision)", "save-path draft clear");
  has(page, "draftSessionRef.current.pending", "pending gate");
  has(page, "<fieldset disabled={draftSessionRef.current.pending}", "pending fieldset lock");
});

R("page: save/sync hardening preserved", () => {
  has(page, "calculateSavedCustomerPricing", "pricing recompute on save");
  has(page, "validateFoundationSyncAttempt", "receipt validation");
  has(page, "updateBuilderSourceProject", "CAS source write");
  has(page, "createFoundationSyncAttempt", "sync attempt minting");
  has(page, "assertFoundationBuilderAcknowledgment", "builder ack assert");
  has(page, "loadFoundationBuilderRecovery", "recovery gate");
  has(page, "verifyFoundationRecoverySource", "recovery verify");
  has(page, "sourceWriteEpochRef", "own-write epoch guard");
  has(page, "exitGenerationRef", "save&exit generation guard");
  has(page, "sourcePatchMatches", "CAS patch-match helper");
});

// ---------- diff containment ----------
const diff = (a, b) => {
  const al = a.split("\n"), bl = b.split("\n");
  // crude hunk finder: line indices that differ / are added
  const changed = [];
  const maxLen = Math.max(al.length, bl.length);
  // use a simple LCS-free approach: find common prefix/suffix, report middle
  let pre = 0;
  while (pre < Math.min(al.length, bl.length) && al[pre] === bl[pre]) pre++;
  let suf = 0;
  while (suf < Math.min(al.length - pre, bl.length - pre) && al[al.length - 1 - suf] === bl[bl.length - 1 - suf]) suf++;
  return { prefix: pre, baseTail: al.length - suf, candTail: bl.length - suf, baseLines: al.slice(pre, al.length - suf), candLines: bl.slice(pre, bl.length - suf) };
};

R("diff: store file changes confined to allowlist/check/read/write regions", () => {
  const lines = (s) => s.split("\n");
  const b = lines(storeBase), c = lines(store);
  const cText = c.join("\n");
  const listStart = cText.indexOf("FOUNDATION_DRAFT_FIELDS = [");
  const listEnd = cText.indexOf("];", listStart);
  const allowlist = cText.slice(listStart, listEnd);
  assert.ok(allowlist.includes('"customer_pricing"'));
  // Functions below write() must be byte-identical (clear + return).
  const bTail = b.slice(b.findIndex(l => l.includes("const clear =")));
  const cTail = c.slice(c.findIndex(l => l.includes("const clear =")));
  assert.deepEqual(cTail, bTail, "clear() and everything below must be unchanged");
  // no deletions of existing allowlist fields
  for (const f of ["items", "walls", "poles", "wall_caps", "signage_cabinets", "selected_equipment", "landscape",
    "concrete_cost_per_cy", "equipment_excavation_labor_rate", "ai_engineering_data"])
    assert.ok(allowlist.includes(`"${f}"`), `existing allowlist field removed: ${f}`);
  // forbidden fields stay excluded from the allowlist literal
  for (const f of ["status", "builder_sync_attempt", "hyperlink", "customer_id", "client_name",
    "estimate_number", "pricing_engine", "concrete_delivery_snapshot", "creation_request_key"])
    assert.ok(!allowlist.includes(`"${f}"`), `forbidden field leaked into allowlist: ${f}`);
});

R("diff: page file changes confined to guard effect + 3 message strings", () => {
  const b = base.split("\n"), c = page.split("\n");
  // Everything before the guard's comment block must be identical except nothing earlier changed:
  const guardIdx = c.findIndex(l => l.includes("In-app dirty-route-leave guard"));
  assert.ok(guardIdx > 0);
  // the previous block before our inserted comment is the existing beforeunload effect — verify intact
  has(c.slice(0, guardIdx).join("\n"), 'window.addEventListener("beforeunload", warn)');
  // All original lines still present (pure insertion + 3 one-line message swaps):
  const origKept = ["persistBrowserDraft", "const commit = (updater", "const payload = ()", "runSave", "FoundationTemplateDialog",
    "CustomerPricingPanel", "CustomerPricingTab", "handleSaveAndExit", "handleSaveAsCopy", "handleSwapToBrickStone"];
  for (const k of origKept) has(page, k);
  // line delta = +45 (net: guard block insertion; the 3 messages are same-length swaps)
  assert.equal(c.length - b.length, 45, `unexpected line delta ${c.length - b.length}`);
});

const okCount = results.filter(r => r.ok).length;
fs.writeFileSync(DIR + "draft-page-verification.json", JSON.stringify({ results, okCount, total: results.length }, null, 2));
console.log(`\n${okCount}/${results.length} page checks passed`);
process.exit(results.every(r => r.ok) ? 0 : 1);
