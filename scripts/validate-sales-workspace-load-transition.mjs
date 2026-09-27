import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/components/sales/SalesPipelineSpreadsheet.jsx", "utf8");
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks += 1; };

check(source.includes("const activeRecordScopeRef = useRef(recordScope);"),
  "Tracks the currently selected Sales workspace independently of async requests.");

const scopeEffect = source.split("useEffect(() => {")[2]?.split("}, [recordScope]);")[0] || "";
check(scopeEffect.includes("activeRecordScopeRef.current = recordScope;"),
  "Workspace transition updates the active scope before loading.");
check(scopeEffect.includes("loadRequestRef.current += 1;"),
  "Workspace transition immediately invalidates requests from the previous scope.");
check(scopeEffect.indexOf("loadRequestRef.current += 1;") < scopeEffect.indexOf("loadWorkOrders(true, recordScope);"),
  "Old requests are invalidated before the new workspace load begins.");
check(scopeEffect.includes("setSelectedWorkOrder(null);") && scopeEffect.includes("setShowFullWorkOrderDetails(false);"),
  "Workspace changes still close details from the previous result set.");

const loader = source.split("const loadWorkOrders = async")[1]?.split("\n  const loadMoreArchive")[0] || "";
check(loader.includes("const requestId = ++loadRequestRef.current;"),
  "Each load still receives a monotonic request id.");
check(loader.includes("const scopeAtStart = scope;"),
  "Each load captures the workspace it belongs to.");
check(loader.includes("requestId !== loadRequestRef.current || scopeAtStart !== activeRecordScopeRef.current"),
  "Loaded rows are committed only when both request and workspace are still current.");
check(loader.includes("if (requestId === loadRequestRef.current) setIsLoading(false);"),
  "A stale load cannot clear the current workspace loading state.");

const archiveLoader = source.split("const loadMoreArchive = async")[1]?.split("\n  const calculateDays")[0] || "";
check(archiveLoader.includes("const scopeAtStart = recordScope;") &&
  archiveLoader.includes("const requestId = loadRequestRef.current;"),
  "Archive paging remains tied to its originating workspace load.");
check(archiveLoader.includes("if (requestId !== loadRequestRef.current) return;"),
  "Archive paging still rejects results after a workspace reload.");

console.log(`Sales workspace load transition safety: ${checks}/${checks} PASS.`);
