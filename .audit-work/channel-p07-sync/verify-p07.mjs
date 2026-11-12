// P-07 sync-contract verifier — overrides, cascade, dedupe, exactly-once.
import * as esbuild from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, ".verify-bundle.mjs");
await esbuild.build({ entryPoints: [join(HERE, "../../src/components/channelLetterInstall/channelSetSync.js")], bundle: true, format: "esm", platform: "node", outfile: OUT, logLevel: "silent" });
const M = await import(pathToFileURL(OUT).href + `?t=${Date.now()}`);
const { syncChannelSet, applySyncOverrides, ensureAllowanceLines, ensurePersonnelTravelLines } = M;

let pass = 0, fail = 0;
const ok = (c, n, x = "") => { if (c) { pass++; console.log("ok  ", n); } else { fail++; console.log("FAIL", n, x); } };
const map = (p) => ({ description: p.description, qty_letters: p.qty, installation_height_feet: p.height });
const purchases = [{ id: "p1", create_install_item: true, qty: 5, description: "Main set", height: 12 }];

// create + re-sync idempotent.
let r = syncChannelSet({ items: [], purchases, mapPurchase: map });
ok(r.items.length === 1 && r.items[0].qty_letters === 5, "purchase creates linked item");
let r2 = syncChannelSet({ items: r.items, purchases: [{ ...purchases[0], qty: 8 }], mapPurchase: map });
ok(r2.items.length === 1 && r2.items[0].qty_letters === 8, "re-sync edits propagate, no duplicate");

// override pins a field.
r2.items[0].override_fields = ["installation_height_feet"];
let r3 = syncChannelSet({ items: r2.items, purchases: [{ ...purchases[0], height: 30 }], mapPurchase: map });
ok(r3.items[0].installation_height_feet === 12 && r3.items[0].qty_letters === 5, "overridden field survives re-sync, others update");

// deletion cascades to linked item only; manual item survives.
r3.items.push({ description: "manual line" });
let r4 = syncChannelSet({ items: r3.items, purchases: [], mapPurchase: map });
ok(r4.items.length === 1 && !r4.items[0].source_letter_purchase_id, "deleted purchase removes linked item, manual stays");

// duplicate purchase id -> issue, first wins.
const dup = syncChannelSet({ items: [], purchases: [{ ...purchases[0] }, { ...purchases[0], qty: 99 }], mapPurchase: map });
ok(dup.issues.some((i) => i.kind === "conflict") && dup.items.length === 1 && dup.items[0].qty_letters === 5, "duplicate purchase id flagged, first kept");

// raceway purchases never become install items.
const rw = syncChannelSet({ items: [], purchases: [{ id: "p9", create_install_item: true, letter_type: "raceway", qty: 40 }], mapPurchase: map });
ok(rw.items.length === 0, "raceway hardware purchase -> no install item");

// allowances exactly once across re-syncs.
let a = ensureAllowanceLines([], [{ kind: "delivery", unit_price: 90 }, { kind: "design", unit_price: 150 }, { kind: "permit", unit_price: 750 }]);
a = ensureAllowanceLines(a, [{ kind: "delivery", unit_price: 95 }]);
ok(a.length === 3 && a.find((x) => x.allowance_kind === "delivery").unit_price === 95, "delivery patches in place; no dupes");
ok(a.every((x) => x.is_allowance && x.allowance_key), "allowance lines keyed");

// personnel/travel exactly once regardless of set count.
let pt = ensurePersonnelTravelLines([], { personnel: { qty: 2, unit_price: 65 }, travel: { qty: 1, unit_price: 120 } });
pt = ensurePersonnelTravelLines(pt, { personnel: { qty: 3, unit_price: 65 }, travel: { qty: 1, unit_price: 120 } });
ok(pt.length === 2 && pt.find((x) => x.estimate_level_key === "estimate_level:personnel").qty === 3, "personnel/travel single lines, patch in place");

// full pipeline: 2 sets + allowances + personnel -> correct count, idempotent.
const two = [{ id: "s1", create_install_item: true, qty: 4 }, { id: "s2", create_install_item: true, qty: 6 }];
const args = { items: [], purchases: two, mapPurchase: map, allowances: [{ kind: "delivery", unit_price: 90 }], personnel: { qty: 1, unit_price: 65 }, travel: { qty: 1, unit_price: 50 } };
const full = syncChannelSet(args);
const full2 = syncChannelSet({ ...args, items: full.items });
ok(full.items.length === 5 && full2.items.length === 5 && JSON.stringify(full.items) === JSON.stringify(full2.items), "2 sets + delivery + personnel + travel = 5 lines, second sync identical");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} verify-p07: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
