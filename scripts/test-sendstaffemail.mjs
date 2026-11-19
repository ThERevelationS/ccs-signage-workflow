import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source-contract test for the staff email bridge: sendStaffEmail is a Deno
// backend function, so this asserts on the shipped source rather than bundling
// it under Node — the same pattern test-customer-statement.mjs uses.

const entry = readFileSync(new URL("../base44/functions/sendStaffEmail/entry.ts", import.meta.url), "utf8");
const helper = readFileSync(new URL("../src/components/comms/sendStaffEmail.js", import.meta.url), "utf8");
const queue = readFileSync(new URL("../src/components/comms/FollowupQueue.jsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/procurement/ReceivePanel.jsx", import.meta.url), "utf8");

// --- Backend entry.ts guards ---
assert.match(entry, /import \{ authenticateSignShopSession \} from ['"]\.\.\/\.\.\/shared\/signShopSession\.ts['"]/, "imports the shared sign-shop session verifier");
assert.match(entry, /authenticateSignShopSession\(base44,\s*body\?\.session_token\)/, "authenticates on session_token");
assert.doesNotMatch(entry, /role\s*!==\s*['"]admin['"]|role\s*===\s*['"]admin['"]/, "not admin-gated — any staff role may send");
assert.match(entry, /HEADER_BAD|\/\[\\r\\n\]\//, "rejects header-injection characters");
assert.match(entry, /HEADER_BAD\.test\(subject\)/, "subject scanned for header injection");
assert.match(entry, /checkRecipientField\(to,\s*['"]to['"]\)/, "to field validated");
assert.match(entry, /checkRecipientField\(cc,\s*['"]cc['"]\)/, "cc field validated");
assert.match(entry, /MAX_RECIPIENTS\s*=\s*5/, "recipient cap of 5 declared");
assert.match(entry, /recipients\.length\s*>\s*MAX_RECIPIENTS/, "recipient cap enforced");
assert.match(entry, /MAX_BODY_LEN\s*=\s*50_?000/, "~50k body cap declared");
assert.match(entry, /text\.length\s*>\s*MAX_BODY_LEN/, "body length cap enforced");
assert.match(entry, /htmlEscape/, "body HTML-escaped (plain-text only)");
assert.match(entry, /functions\s*\n?\s*\.invoke\(['"]sendGmail['"]|\.invoke\(['"]sendGmail['"]/, "invokes sendGmail internally");
assert.match(entry, /_workflow_capability:\s*['"]ccs-sendGmail-internal-svc-cap-791d5baab4d78cfc['"]/, "service capability pass-through (same token as invoicingAction)");
assert.match(entry, /body\?\.kind/, "kind tag accepted for logging");
assert.match(entry, /Response\.json\(\{ ok: true, success: true \}\)/, "returns ok/success envelope");
assert.doesNotMatch(entry, /_workflow_capability[^:]*:?\s*(body|req)\?*\./, "capability is a constant, never caller-supplied");

// --- Client helper contract ---
assert.match(helper, /import \{ getSessionToken \} from ["']@\/components\/auth\/EmailGate["']/, "helper reads the sss_session_token via getSessionToken");
assert.match(helper, /invoke\(["']sendStaffEmail["']/, "helper calls the sendStaffEmail function");
assert.match(helper, /session_token:\s*token/, "helper passes session_token");
assert.match(helper, /not deployed yet/i, "helper maps missing-function to a 'not deployed' message");

// --- UI wiring ---
assert.match(queue, /import \{ sendStaffEmail \} from ["']@\/components\/comms\/sendStaffEmail["']/, "follow-up queue imports the bridge helper");
assert.match(queue, /await sendStaffEmail\(\{/, "follow-up queue sends via the bridge");
assert.doesNotMatch(queue, /invoke\(["']sendEmail["']/, "disabled sendEmail no longer called from the queue");
assert.match(panel, /import \{ sendStaffEmail \} from ["']@\/components\/comms\/sendStaffEmail["']/, "receive panel imports the bridge helper");
assert.match(panel, /await sendStaffEmail\(\{/, "receive panel sends via the bridge");
assert.match(panel, /receipt\/backorder notice/, "vendor subject uses the PO receipt/backorder notice format");
assert.match(panel, /vendor_email/, "vendor recipient resolves from po.vendor_email");
assert.match(panel, /mailto\.href/, "mailto fallback retained");

console.log("PASS sendstaffemail (28 assertions)");
