import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

// Contract + behavior checks for customerPortalAction's portal file upload
// (#244) and counter offer (#257). The pure validators are lifted out of the
// Deno entry and transpiled so the real shipped code runs the assertions —
// not a re-implementation.
const entry = readFileSync(new URL("../base44/functions/customerPortalAction/entry.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/pages/CustomerPortal.jsx", import.meta.url), "utf8");

const grab = (re, name) => {
  const m = entry.match(re);
  assert.ok(m, `customerPortalAction must define ${name}`);
  return m[0];
};

const harness = [
  grab(/const clean = \([^)]*\)[^\n]*\n/, "clean helper"),
  grab(/const num = [\s\S]*?\n\};/, "num helper"),
  grab(/const bad = [\s\S]*?\n\};/, "bad helper"),
  grab(/const PORTAL_UPLOAD_MAX_BYTES[^\n]*\n/, "PORTAL_UPLOAD_MAX_BYTES"),
  grab(/const PORTAL_UPLOAD_MAX_B64_CHARS[^\n]*\n/, "PORTAL_UPLOAD_MAX_B64_CHARS"),
  grab(/const PORTAL_UPLOAD_MAX_MB[^\n]*\n/, "PORTAL_UPLOAD_MAX_MB"),
  grab(/function sniffPortalUpload[\s\S]*?\n\}/, "sniffPortalUpload"),
  grab(/function decodePortalUpload[\s\S]*?\n\}/, "decodePortalUpload"),
  grab(/async function portalMessageScope[\s\S]*?\n\}/, "portalMessageScope"),
  grab(/const portalSmallHash = [\s\S]*?\n\};/, "portalSmallHash"),
  grab(/const portalMoney = [^\n]*\n/, "portalMoney"),
  "return { clean, num, bad, sniffPortalUpload, decodePortalUpload, portalMessageScope, portalSmallHash, portalMoney, PORTAL_UPLOAD_MAX_BYTES, PORTAL_UPLOAD_MAX_B64_CHARS };",
].join("\n");

const js = transformSync(harness, { loader: "ts", format: "cjs" }).code;
const {
  decodePortalUpload, sniffPortalUpload, portalMessageScope, portalSmallHash, portalMoney,
  PORTAL_UPLOAD_MAX_BYTES, PORTAL_UPLOAD_MAX_B64_CHARS,
} = new Function(js)();

const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
const HEIC = [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63];
const EXE = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00];

// ---- Happy path: every allowed kind is detected by magic bytes, not mime ---
for (const [bytes, mime] of [[PNG, "image/png"], [JPG, "image/jpeg"], [PDF, "application/pdf"], [GIF, "image/gif"], [WEBP, "image/webp"], [HEIC, "image/heic"]]) {
  assert.equal(sniffPortalUpload(Uint8Array.from(bytes)), mime, `sniffs ${mime}`);
}
{
  const ok = decodePortalUpload({ file_base64: b64(PNG), file_name: "site photo.png", file_mime: "image/png" });
  assert.equal(ok.error, undefined, "valid png accepted");
  assert.equal(ok.mime, "image/png", "detected mime wins");
  assert.equal(ok.name, "site photo.png");
  assert.equal(ok.bytes.length, PNG.length, "decoded byte length");
}
// data: URL payloads and post_message's attachment_* field names both work.
{
  const ok = decodePortalUpload({ attachment_base64: `data:image/jpeg;base64,${b64(JPG)}`, attachment_name: "job.jpg", attachment_mime: "image/jpeg" });
  assert.equal(ok.error, undefined, "data URL + attachment_* fields accepted");
  assert.equal(ok.mime, "image/jpeg");
}
// Filename sanitizing: path separators/quotes are stripped.
{
  const ok = decodePortalUpload({ file_base64: b64(PDF), file_name: '..\\"..drawing.pdf', file_mime: "application/pdf" });
  assert.equal(ok.error, undefined);
  assert.doesNotMatch(ok.name, /[\\"]/, "name has no path separators/quotes");
}

// ---- Rejections: oversize, wrong type, mismatch, missing inputs ------------
{
  const big = b64(new Array(PORTAL_UPLOAD_MAX_BYTES + 4).fill(0x25));
  assert.match(decodePortalUpload({ file_base64: big, file_name: "big.pdf" }).error, /too large/, "oversize binary rejected");
  const tooLongB64 = "A".repeat(PORTAL_UPLOAD_MAX_B64_CHARS + 4);
  assert.match(decodePortalUpload({ file_base64: tooLongB64, file_name: "big.png" }).error, /too large/, "oversize base64 rejected before decode");
}
{
  const exe = decodePortalUpload({ file_base64: b64(EXE), file_name: "virus.png", file_mime: "image/png" });
  assert.match(exe.error, /Only photos/, "EXE bytes rejected even when declared as image/png");
  const script = decodePortalUpload({ file_base64: b64([...Buffer.from("<svg onload=alert(1)>")]), file_name: "x.svg", file_mime: "image/svg+xml" });
  assert.match(script.error, /Only photos/, "SVG (scriptable) rejected by signature check");
}
{
  const mismatch = decodePortalUpload({ file_base64: b64(PNG), file_name: "d.pdf", file_mime: "application/pdf" });
  assert.match(mismatch.error, /do not match/, "declared pdf vs actual image rejected");
  const mismatch2 = decodePortalUpload({ file_base64: b64(PDF), file_name: "p.png", file_mime: "image/png" });
  assert.match(mismatch2.error, /do not match/, "declared image vs actual pdf rejected");
  const octet = decodePortalUpload({ file_base64: b64(PNG), file_name: "p.png", file_mime: "application/octet-stream" });
  assert.match(octet.error, /Only photos/, "non-image/pdf declared mime rejected");
}
{
  assert.match(decodePortalUpload({ file_name: "x.png" }).error, /required/, "missing file rejected");
  assert.match(decodePortalUpload({ file_base64: b64(PNG) }).error, /filename/, "missing filename rejected");
  assert.match(decodePortalUpload({ file_base64: "!!!", file_name: "x.png" }).error, /decoded/, "invalid base64 rejected");
  assert.match(decodePortalUpload({ file_base64: "", file_name: "x.png" }).error, /required/, "empty payload rejected");
}

// ---- portalMessageScope: token-scope violations fail closed ----------------
const woEntity = (row) => ({ get: async (id) => (id === "wo-1" ? row : null) });
{
  // A work_order link can only attach/messages against ITS job — related_* is forced.
  const scope = await portalMessageScope({
    link: { kind: "work_order", record_id: "wo-1", customer_id: "cust-x" },
    body: { related_kind: "invoice", related_id: "inv-evil", related_label: "nope" },
    WorkOrder: woEntity({ id: "wo-1", customer_id: "cust-1", est_inv_at: "WO-100" }),
    Invoice: { get: async () => ({ customer_id: "cust-evil" }) },
    Estimate: { get: async () => null },
  });
  assert.equal(scope.relatedKind, "work_order", "job link forces work_order scope");
  assert.equal(scope.relatedId, "wo-1", "job link cannot reference a foreign record");
  assert.equal(scope.customerId, "cust-1", "customer resolved from the job, not the caller");
}
{
  // A customer link naming a related record owned by someone else -> 403.
  await assert.rejects(
    () => portalMessageScope({
      link: { kind: "customer", record_id: "cust-1", customer_id: "cust-1" },
      body: { related_kind: "estimate", related_id: "est-other" },
      WorkOrder: { get: async () => null },
      Invoice: { get: async () => null },
      Estimate: { get: async () => ({ id: "est-other", customer_id: "cust-2" }) },
    }),
    (e) => e.status === 403,
    "foreign related record rejected"
  );
  // Same-customer related record is allowed.
  const scope = await portalMessageScope({
    link: { kind: "customer", record_id: "cust-1" },
    body: { related_kind: "estimate", related_id: "est-mine" },
    WorkOrder: { get: async () => null },
    Invoice: { get: async () => null },
    Estimate: { get: async () => ({ id: "est-mine", customer_id: "cust-1" }) },
  });
  assert.equal(scope.relatedId, "est-mine", "own related record allowed");
}

// ---- Counter-offer payload shape (#257) -------------------------------------
assert.equal(portalSmallHash("hello"), portalSmallHash("hello"), "note hash deterministic");
assert.notEqual(portalSmallHash("a"), portalSmallHash("b"), "note hash varies");
assert.equal(portalMoney(4500), "$4,500.00", "money format");

const counterBlock = entry.slice(entry.indexOf('if (action === "counter_offer")'), entry.indexOf('if (action === "payment_notice")'));
assert.ok(counterBlock.length > 500, "counter_offer action exists");
assert.match(counterBlock, /linkKind !== "customer" && linkKind !== "estimate"/, "counter: only customer/estimate links");
assert.match(counterBlock, /link\.record_id\) !== estimateId\)/, "counter: estimate link is hard-scoped to its record");
assert.match(counterBlock, /estimate\.customer_id\) !== customerId\)/, "counter: estimate must belong to the link's customer");
assert.match(counterBlock, /clean\(estimate\.status\) !== "sent"/, "counter: only sent quotes respondable");
assert.match(counterBlock, /quoteValidUntil\(estimate\)/, "counter: expiry window checked");
assert.match(counterBlock, /proposedTotal <= 0/, "counter: positive total required");
assert.match(counterBlock, /kind: "estimate_revision_requested"/, "counter: declared message kind used");
assert.match(counterBlock, /status: "ready"/, "counter: request lands on the estimator queue");
assert.match(counterBlock, /source_type: "portal_counter_offer"/, "counter: structured snapshot");
assert.match(counterBlock, /portal-counter:/, "counter: dedupe attempt key");
assert.match(counterBlock, /10 \* 60 \* 1000/, "counter: 10-minute dedupe bucket");
assert.match(counterBlock, /subtype: "counter_offer"/, "counter: typed activity details");
assert.match(counterBlock, /logPortalOpportunityActivity/, "counter: opportunity activity logged");
assert.match(counterBlock, /EstimatingRequest/, "counter: estimating request written");

const uploadBlock = entry.slice(entry.indexOf('if (action === "upload_file")'), entry.indexOf('if (action === "estimate_respond")'));
assert.ok(uploadBlock.length > 500, "upload_file action exists");
assert.match(uploadBlock, /linkKind !== "customer" && linkKind !== "work_order"/, "upload: only customer/work_order links");
assert.match(uploadBlock, /decodePortalUpload\(body\)/, "upload: shared validator runs");
assert.match(uploadBlock, /integrations\.Core\.UploadFile/, "upload: service-role storage used");
assert.match(uploadBlock, /attachment_url: attachmentUrl/, "upload: message carries stored URL");
assert.match(uploadBlock, /portalMessageScope/, "upload: shared token scope");

const postBlock = entry.slice(entry.indexOf('if (action === "post_message")'), entry.indexOf('if (action === "upload_file")'));
assert.match(postBlock, /decodePortalUpload\(body\)/, "post_message: inline base64 uses the same validator");
assert.doesNotMatch(postBlock, /application\/octet-stream/, "post_message: declared mime is never trusted for storage");

// ---- Frontend wiring --------------------------------------------------------
assert.match(page, /action: "upload_file"/, "portal UI posts files via upload_file");
assert.match(page, /accept="image\/\*,application\/pdf,\.pdf"/, "file input restricted to photo/PDF");
assert.match(page, /PORTAL_ATTACHMENT_MAX_BYTES/, "client-side size cap present");
assert.match(page, /action: "counter_offer"/, "portal UI calls counter_offer");
assert.match(page, /Counter offer/, "counter affordance rendered");
assert.match(page, /onCounter=\{sendCounter\}/, "counter handler wired to quote card");

console.log("PASS portal upload + counter offer (52 assertions)");
