// Source-contract checks for the upgraded AI Part Finder dialog.
// Verifies the new capability surface (multi-candidate, multi-photo, live
// barcode scan, paste/drop, resume strip, research links, per-field
// confidence) AND that the write-safety invariants (creation_key sessions,
// CAS expected_updated_date, busy gating, Escape lock, focus/URL cleanup)
// were preserved through the rewrite.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "src/components/fleet/FleetPartLookupDialog.jsx");
const src = readFileSync(file, "utf8");
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log("PASS " + name); };

test("multi-candidate schema requests ranked candidates and mirrors top-level fields", () => {
  assert.match(src, /candidates:\s*\{\s*type:\s*"array",\s*items:\s*candidateSchema\s*\}/);
  assert.match(src, /top-level part_\* fields must mirror candidates\[0\]/);
  assert.match(src, /required:\s*\[[^\]]*"candidates"/);
  assert.match(src, /fit_summary/);
});

test("candidate picker populates the verify form from the selected candidate", () => {
  assert.match(src, /const applyCandidate = \(index\) =>/);
  const body = src.slice(src.indexOf("const applyCandidate"), src.indexOf("const analyze"));
  assert.match(body, /setActiveCandidateIndex\(index\)/);
  assert.match(body, /chosen\.part_name/);
  assert.match(body, /chosen\.part_number/);
  assert.match(body, /chosen\.confidence/);
  assert.match(src, /candidates\.length > 1 && <section/);
});

test("AI response falls back to a synthesized single candidate when candidates[] is absent", () => {
  assert.match(src, /Array\.isArray\(ai\.candidates\) && ai\.candidates\.length \? ai\.candidates : \[/);
});

test("per-field confidence grades key fields and renders badges", () => {
  assert.match(src, /field_confidence:\s*\{\s*type:\s*"object"/);
  for (const key of ["part_number","manufacturer","category","specification","fitment"]) {
    assert.match(src, new RegExp(key + ':\\s*\\{\\s*type:\\s*"string",\\s*enum:\\s*\\["low","medium","high"\\]\\s*\\}'));
  }
  assert.match(src, /const fieldConfidence = key => aiResult\?\.field_confidence\?\.\[key\]/);
  assert.match(src, /confidence=\{fieldConfidence\("part_number"\)\}/);
  assert.match(src, /AI \{confidence\}/);
});

test("multi-photo capture caps at four, uploads all, and sends every URL to the model", () => {
  assert.match(src, /const MAX_PHOTOS = 4/);
  assert.match(src, /MAX_PHOTOS - photosRef\.current\.length/);
  assert.match(src, /file_urls:\s*photoUrls/);
  assert.match(src, /uploaded_photo_urls:\s*photoUrls/);
  assert.match(src, /primary_photo_url:\s*photoUrls\[0\]/);
  assert.match(src, /accept="image\/\*" capture="environment" multiple/);
  assert.match(src, /const removePhoto = \(index\)/);
  const removeBody = src.slice(src.indexOf("const removePhoto"), src.indexOf("const applyCandidate"));
  assert.match(removeBody, /revokePhoto\(removed\)/);
});

test("live barcode scan polls BarcodeDetector on a camera stream and always stops tracks", () => {
  assert.match(src, /navigator\.mediaDevices\.getUserMedia\(\{\s*video:\s*\{\s*facingMode:\s*"environment"\s*\}/);
  assert.match(src, /new window\.BarcodeDetector\(\{\s*formats:\s*BARCODE_FORMATS\s*\}\)/);
  const scanEffect = src.slice(src.indexOf("Live barcode scan"), src.indexOf("const duplicates = useMemo"));
  assert.match(scanEffect, /detector\.detect\(video\)/);
  assert.match(scanEffect, /stream\?\.getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  assert.match(scanEffect, /videoRef\.current\.srcObject = null/);
  assert.match(scanEffect, /setBarcodeValue\(raw\)/);
  assert.match(src, /<video ref=\{videoRef\} autoPlay playsInline muted/);
  assert.match(src, /setScanError\("Camera access was denied/);
});

test("camera scan is only offered when the platform supports it", () => {
  assert.match(src, /"BarcodeDetector" in window && !!navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(src, /\{barcodeSupported && <button/);
});

test("clipboard paste and drag-drop feed the photo pipeline", () => {
  assert.match(src, /document\.addEventListener\("paste", handlePaste\)/);
  const pasteEffect = src.slice(src.indexOf("Clipboard-paste photo capture"), src.indexOf("Live barcode scan"));
  assert.match(pasteEffect, /step !== "identify"/);
  assert.match(pasteEffect, /item\.type\?\.startsWith\("image\/"\)/);
  assert.match(src, /onDrop=\{e => \{ e\.preventDefault\(\); setDragActive\(false\); addFiles\(e\.dataTransfer\?\.files\); \}\}/);
  assert.match(src, /Ctrl\+V works anywhere in this step/);
});

test("recent open identifications are resumable inside the dialog", () => {
  assert.match(src, /identifications = \[\]/);
  assert.match(src, /const resumableSessions = useMemo/);
  const memo = src.slice(src.indexOf("const resumableSessions"), src.indexOf("const sourceLinks"));
  assert.match(memo, /\!"promoted","matched_existing","dismissed"\.includes|!\["promoted","matched_existing","dismissed"\]\.includes/);
  assert.match(memo, /row\.id !== identification\?\.id/);
  assert.match(src, /Resume a recent lookup/);
  assert.match(src, /onClick=\{\(\) => applyResumeIdentification\(row\)\}/);
});

test("research sources and vendor listing render as safe external links", () => {
  assert.match(src, /Research sources/);
  assert.match(src, /target="_blank" rel="noreferrer"/);
  assert.ok(src.includes("/^https?:\\/\\//i.test(url)"), "only http(s) URLs are rendered as links");
  assert.match(src, /listing<\/a>/);
});

test("Ctrl+Enter in the query field triggers identification", () => {
  assert.match(src, /e\.key === "Enter" && \(e\.ctrlKey \|\| e\.metaKey\)/);
});

test("write-safety invariants survive: session key, CAS, busy gating, Escape lock, focus restore", () => {
  assert.match(src, /creation_key: sessionKey/);
  assert.equal((src.match(/expected_updated_date: identification\.updated_date \|\| ""/g) || []).length >= 3, true, "update_review, match_existing and promote must all send the CAS token");
  assert.match(src, /if \(!busyState\.current\) \{ event\.preventDefault\(\); closeCallback\.current\?\.\(\); \}/);
  assert.match(src, /disabled=\{busy\}/);
  assert.match(src, /previousFocus\.current\?\.isConnected\) previousFocus\.current\.focus\(\)/);
  assert.match(src, /photosRef\.current\.forEach\(revokePhoto\)/);
});

test("scanning state is cleared when the dialog closes", () => {
  const cleanup = src.slice(src.indexOf("document.removeEventListener(\"keydown\""), src.indexOf("\n  }, [open]);"));
  assert.match(cleanup, /setScanning\(false\)/);
});

test("in-dialog request creation posts to fleetRequestAction with a stable creation key", () => {
  const submit = src.slice(src.indexOf("const submitRequest"), src.indexOf("const reSearch"));
  assert.match(submit, /invoke\("fleetRequestAction",\s*\{/);
  assert.match(submit, /action:\s*"create",\s*creation_key:\s*requestKey/);
  assert.match(submit, /item_type:\s*"part"/);
  assert.match(submit, /inventory_item_id: requestFor\.inventory_item_id/);
  assert.match(submit, /justification:\s*requestJustification\.trim\(\)/);
  assert.match(submit, /justification is required/);
  assert.match(src, /const newRequestKey = \(\) => `partlookup-request-\$\{crypto\.randomUUID\(\)\}`/);
});

test("request edits regenerate the creation key so unchanged retries stay idempotent", () => {
  const regens = src.match(/setRequestKey\(newRequestKey\(\)\)/g) || [];
  assert.ok(regens.length >= 4, `expected at least 4 key regenerations (open + qty + equipment + justification), got ${regens.length}`);
});

test("duplicate matches and the done step can raise a linked request", () => {
  assert.match(src, /onClick=\{\(\) => openRequest\(part\)\}/);
  assert.match(src, /Request more of this/);
  assert.match(src, /onClick=\{\(\) => openRequest\(actionedPart\)\}/);
  assert.match(src, /setActionedPart\(part\)/);
  assert.match(src, /setActionedPart\(data\.part \|\| null\)/);
  assert.match(src, /Linked to the exact Fleet inventory record/);
});

test("cross-reference chips start a fresh session without losing the saved review", () => {
  const body = src.slice(src.indexOf("const reSearch"), src.indexOf("const analyze"));
  assert.match(body, /setSessionKey\(`partlookup-\$\{crypto\.randomUUID\(\)\}`\)/);
  assert.match(body, /setQuery\(num\)/);
  assert.match(body, /setSearchMode\("part_number"\)/);
  assert.doesNotMatch(body, /setPhotos\(\[\]\)/, "re-search keeps the physical part's photos");
  assert.match(src, /Cross-reference numbers/);
  assert.match(src, /onClick=\{\(\) => reSearch\(num\)\}/);
});

test("a hardware wedge scanner's Enter in the barcode field triggers identification", () => {
  assert.match(src, /e\.key === "Enter" && barcodeValue\.trim\(\)\) \{ e\.preventDefault\(\); analyze\(\); \}/);
});

test("duplicate cards surface the existing part's physical location", () => {
  assert.match(src, /part\.storage_zone,part\.storage_cabinet,part\.storage_shelf,part\.storage_bin/);
  assert.match(src, /Location: \{/);
});

test("live inventory matches surface already-stocked parts before any AI call", () => {
  const memo = src.slice(src.indexOf("const inventoryMatches"), src.indexOf("}, [parts, query, barcodeValue]);"));
  assert.match(memo, /normKeyLocal\(barcodeValue\.trim\(\)\)/);
  assert.match(memo, /numbers\.includes\(bc\)/);
  assert.match(memo, /part_name.*toLowerCase\(\)\.includes/);
  assert.match(memo, /\.slice\(0, 4\)/);
  assert.match(src, /Already in Fleet inventory/);
  assert.match(src, /onClick=\{\(\) => openRequest\(part\)\} disabled=\{busy\} className="shrink-0/);
});

test("AI fitment check sends selected equipment detail and keeps verdicts review-only", () => {
  const body = src.slice(src.indexOf("const checkFitment"), src.indexOf("const analyze"));
  assert.match(body, /Select at least one equipment unit first/);
  assert.match(body, /InvokeLLM\(\{ prompt, add_context_from_internet: true, response_json_schema: schema \}\)/);
  assert.match(body, /verdict:\s*\{\s*type:\s*"string",\s*enum:\s*\["fits","likely","uncertain","unlikely","does_not_fit"\]\s*\}/);
  assert.match(body, /REVIEW-ONLY/);
  assert.match(body, /fitment check failed/i);
  assert.doesNotMatch(body, /toggleEquipment|compatible_equipment_ids:\s*\[/, "fitment check must never mutate selections");
  assert.match(src, /Check fitment/);
  assert.match(src, /fitResults\?\.\[eq\.id\]/);
  assert.match(src, /FIT_LABEL\[fitResults\[eq\.id\]\.verdict\]/);
});

test("AI vendor options render as an apply-on-click comparison in Procurement", () => {
  assert.match(src, /vendor_options:\s*\{\s*type:\s*"array"/);
  assert.match(src, /est_price/);
  assert.match(src, /Only real, researched vendors/);
  const card = src.slice(src.indexOf("AI vendor options"));
  assert.match(card, /set\("preferred_vendor", opt\.vendor \|\| ""\)/);
  assert.match(card, /set\("vendor_sku", opt\.sku \|\| ""\)/);
  assert.match(card, /set\("vendor_url", opt\.url \|\| ""\)/);
});

test("fitment verdicts reset on every new analysis, resume, reset, and re-search", () => {
  const resets = src.match(/setFitResults\(null\)/g) || [];
  assert.ok(resets.length >= 4, `expected fitResults reset in applyResume/reset/reSearch/analyze, got ${resets.length}`);
});

test("the verified candidate can be requested as a new part without promoting it", () => {
  assert.match(src, /Request this part/);
  assert.match(src, /openRequest\(null\)/, "the verify-step CTA must open the free-text request draft");
  assert.match(src, /identification\.id/, "the request must record which identification session raised it");
});

console.log(`${passed}/${passed} part-lookup upgrade contract checks passed`);
