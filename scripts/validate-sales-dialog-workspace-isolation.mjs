import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks += 1; };

const effectStart = source.indexOf("useEffect(() => {\n    // Invalidate the previous workspace immediately.");
const effectEnd = source.indexOf("\n  }, [recordScope]);", effectStart);
check(effectStart >= 0 && effectEnd > effectStart, "Record-scope transition effect exists.");
const effect = source.slice(effectStart, effectEnd);

check(effect.includes("activeRecordScopeRef.current = recordScope;"), "Workspace identity updates immediately.");
check(effect.includes("loadRequestRef.current += 1;"), "Prior workspace loads are invalidated.");
check(effect.includes("setSelectedWorkOrder(null);"), "Opportunity dialog closes on workspace change.");
check(effect.includes("setShowFullWorkOrderDetails(false);"), "Full WorkOrder details close on workspace change.");
check(effect.includes("setStatusTransition(null);"), "Status confirmation closes on workspace change.");
check(effect.includes("setFollowUpCompletion(null);"), "Follow-up confirmation closes on workspace change.");
check(effect.includes('setCorbridgeDialog({ open: false, workOrder: null });'), "Est/Inv row dialog closes on workspace change.");
check(effect.includes('setCorbridgeDraft({ invoiceNumber: "", link: "" });'), "Est/Inv draft from the old row is discarded when its dialog closes.");
check(effect.includes('setCorbridgeSaveError("");'), "Old Est/Inv dialog error does not leak into another workspace.");
check(effect.indexOf("setStatusTransition(null);") < effect.indexOf("loadWorkOrders(true, recordScope);"), "Row-bound status dialog is closed before the new workspace load starts.");
check(effect.indexOf("setFollowUpCompletion(null);") < effect.indexOf("loadWorkOrders(true, recordScope);"), "Row-bound follow-up dialog is closed before the new workspace load starts.");
check(effect.indexOf("setCorbridgeDialog") < effect.indexOf("loadWorkOrders(true, recordScope);"), "Row-bound Est/Inv dialog is closed before the new workspace load starts.");

check(source.includes("<SalesStatusTransitionDialog") && source.includes("onClose={() => setStatusTransition(null)}"), "Existing status confirmation close path remains intact.");
check(source.includes("<SalesFollowUpCompleteDialog") && source.includes("onClose={() => setFollowUpCompletion(null)}"), "Existing follow-up confirmation close path remains intact.");
check(source.includes('<Dialog open={corbridgeDialog.open}') && source.includes("!open && closeCorbridgeDialog()"), "Existing Est/Inv dialog close path remains intact.");
check(source.includes("const pendingRecordScopesRef = useRef({});"), "Pending quick-edit workspace isolation remains intact.");

console.log(`Sales row-bound dialog workspace isolation: ${checks}/${checks} PASS.`);
