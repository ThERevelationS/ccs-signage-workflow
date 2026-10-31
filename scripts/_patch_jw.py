import sys

PATH = "src/components/jobs/JobWorkspace.jsx"
src = open(PATH, encoding="utf-8").read()

edits = [
    # 1. imports
    (
        'import { transitionWorkOrderFromLoadedSnapshot } from "@/components/workflow/workOrderPersistence";',
        'import { transitionWorkOrderFromLoadedSnapshot, replaceWorkOrderFieldsIfUnchanged } from "@/components/workflow/workOrderPersistence";\nimport { depositChip, depositCoveredByFinancials } from "@/components/estimator/depositGate";',
    ),
    # 2. deposit state vars after stageSyncNotice
    (
        '  const [stageSyncNotice, setStageSyncNotice] = useState("");\n  const now = useMemo(() => new Date(), []);',
        '  const [stageSyncNotice, setStageSyncNotice] = useState("");\n  // Deposit controls for the Financials card. Form state mirrors the loaded\n  // WO snapshot; every write goes through the CAS field path anchored on that\n  // snapshot, so a concurrent edit reverts instead of silently clobbering.\n  const [depositForm, setDepositForm] = useState({ required: false, amount: "" });\n  const [depositBusy, setDepositBusy] = useState(false);\n  const [depositError, setDepositError] = useState("");\n  const [depositNotice, setDepositNotice] = useState("");\n  const now = useMemo(() => new Date(), []);',
    ),
    # 3. sync effect after document.title effect
    (
        '    document.title = ref ? `Job ${ref}` : "Job Workspace";\n  }, [wo]);',
        '    document.title = ref ? `Job ${ref}` : "Job Workspace";\n  }, [wo]);\n\n  // Keep the deposit form pinned to the loaded WO snapshot.\n  useEffect(() => {\n    setDepositForm({\n      required: wo?.deposit_required === true,\n      amount: Number(wo?.deposit_amount) > 0 ? String(wo.deposit_amount) : "",\n    });\n  }, [wo?.id, wo?.deposit_required, wo?.deposit_amount]);',
    ),
    # 4. coverage memo after timeline memo
    (
        '  const rows = useMemo(() => workspaceProductRows(wo), [wo]);\n  const timeline = useMemo(() => jobActivityTimeline(wo), [wo]);',
        '  const rows = useMemo(() => workspaceProductRows(wo), [wo]);\n  const timeline = useMemo(() => jobActivityTimeline(wo), [wo]);\n  // Auto-suggest: once linked financials cover the deposit, the card nudges\n  // staff to flip deposit_invoiced. Suggest-only -- the flag is still set by\n  // an explicit audited write, never silently derived.\n  const depositCoverage = useMemo(\n    () => depositCoveredByFinancials(wo, { invoices: financials?.invoices || [], payments: financials?.payments || [] }),\n    [wo, financials]\n  );',
    ),
    # 5. deposit handlers + pass workOrder hint into transition
    (
        '  const transition = async (row, patch) => {\n    const key = row.productId;\n    setBusy((b) => ({ ...b, [key]: true }));\n    setErrors((e) => ({ ...e, [key]: "" }));\n    setTransitionError("");\n    try {\n      const res = await transitionProductAndBuilderStatus({\n        workOrderId: wo.id, product: row.product, patch, actor, label: "Job workspace",\n      });',
        '  const saveDepositSettings = async () => {\n    if (!wo?.id || depositBusy) return;\n    setDepositBusy(true);\n    setDepositError("");\n    setDepositNotice("");\n    try {\n      const nextAmount = depositForm.required ? Math.max(0, Number(depositForm.amount) || 0) : 0;\n      await replaceWorkOrderFieldsIfUnchanged({\n        workOrderId: wo.id,\n        expectedFields: {\n          deposit_required: wo.deposit_required === true,\n          deposit_amount: Number(wo.deposit_amount) || 0,\n        },\n        nextFields: { deposit_required: depositForm.required, deposit_amount: nextAmount },\n      });\n      setDepositNotice("Deposit settings saved.");\n      refreshAllWorkOrders();\n    } catch (e) {\n      setDepositError(e?.message || "Deposit settings could not be saved.");\n    } finally {\n      setDepositBusy(false);\n    }\n  };\n\n  const setDepositInvoiced = async (value) => {\n    if (!wo?.id || depositBusy) return;\n    setDepositBusy(true);\n    setDepositError("");\n    setDepositNotice("");\n    try {\n      await replaceWorkOrderFieldsIfUnchanged({\n        workOrderId: wo.id,\n        expectedFields: { deposit_invoiced: wo.deposit_invoiced === true },\n        nextFields: { deposit_invoiced: value },\n      });\n      setDepositNotice(value ? "Deposit marked as invoiced." : "Deposit invoiced flag cleared.");\n      refreshAllWorkOrders();\n    } catch (e) {\n      setDepositError(e?.message || "The deposit flag could not be updated.");\n    } finally {\n      setDepositBusy(false);\n    }\n  };\n\n  const transition = async (row, patch) => {\n    const key = row.productId;\n    setBusy((b) => ({ ...b, [key]: true }));\n    setErrors((e) => ({ ...e, [key]: "" }));\n    setTransitionError("");\n    try {\n      const res = await transitionProductAndBuilderStatus({\n        workOrderId: wo.id, product: row.product, patch, actor, label: "Job workspace", workOrder: wo,\n      });',
    ),
    # 6. compute chip data near ref/stage
    (
        '  const ref = wo.corbridge_invoice_number || wo.title || wo.id;\n  const stage = norm(wo.current_stage);',
        '  const ref = wo.corbridge_invoice_number || wo.title || wo.id;\n  const stage = norm(wo.current_stage);\n  const depositChipData = depositChip(wo);',
    ),
    # 7. header chip
    (
        '              {badge(WORKSPACE_STAGES[stage] || wo.current_stage || "\u2014", STAGE_TONE[stage] || TONE.muted)}\n              {wo.sales_status && badge(wo.sales_status, TONE.muted)}',
        '              {badge(WORKSPACE_STAGES[stage] || wo.current_stage || "\u2014", STAGE_TONE[stage] || TONE.muted)}\n              {wo.sales_status && badge(wo.sales_status, TONE.muted)}\n              {depositChipData && badge(depositChipData.text, depositChipData.tone === "invoiced" ? TONE.done : TONE.wip)}',
    ),
    # 8. deposit strip in Financials card
    (
        '          ))}\n        </div>\n        {summary.milestoneBilling && (',
        '          ))}\n        </div>\n\n        {/* Deposit requirement + invoiced flag. Both flags write through the\n            CAS field path; the coverage hint only ever suggests marking. */}\n        <div className="mt-2 rounded border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs">\n          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">\n            <span className="font-semibold uppercase tracking-wide text-gray-400">Deposit</span>\n            <label className="flex items-center gap-1 font-medium text-gray-700">\n              <input type="checkbox" disabled={depositBusy}\n                checked={depositForm.required}\n                onChange={(e) => setDepositForm((f) => ({ ...f, required: e.target.checked }))} />\n              Required\n            </label>\n            <label className="flex items-center gap-1 text-gray-700">\n              <span>$</span>\n              <input type="number" min="0" step="0.01" disabled={depositBusy || !depositForm.required}\n                className="w-24 rounded border border-gray-300 bg-white px-1.5 py-0.5 disabled:opacity-50"\n                placeholder="0.00" value={depositForm.amount}\n                onChange={(e) => setDepositForm((f) => ({ ...f, amount: e.target.value }))} />\n            </label>\n            <button type="button" disabled={depositBusy} onClick={saveDepositSettings}\n              className="rounded border border-gray-300 bg-white px-1.5 py-0.5 font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50">\n              {depositBusy ? "Saving\u2026" : "Save deposit"}\n            </button>\n            {wo.deposit_required === true && wo.deposit_invoiced !== true && (\n              <button type="button" disabled={depositBusy} onClick={() => setDepositInvoiced(true)}\n                className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">\n                Mark deposit invoiced\n              </button>\n            )}\n            {wo.deposit_required === true && wo.deposit_invoiced === true && (\n              <>\n                <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800">Deposit invoiced</span>\n                <button type="button" disabled={depositBusy} onClick={() => setDepositInvoiced(false)}\n                  className="text-gray-500 underline hover:text-gray-700 disabled:opacity-50">\n                  Unmark\n                </button>\n              </>\n            )}\n          </div>\n          {wo.deposit_required === true && wo.deposit_invoiced !== true && depositCoverage.covered && (\n            <div className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">\n              {depositCoverage.reason} Review and mark the deposit invoiced.\n            </div>\n          )}\n          {depositError && <div className="mt-1.5 text-rose-700">{depositError}</div>}\n          {depositNotice && <div className="mt-1.5 text-emerald-700">{depositNotice}</div>}\n        </div>\n        {summary.milestoneBilling && (',
    ),
]

for old, new in edits:
    n = src.count(old)
    if n != 1:
        print(f"FAIL: old_text matched {n} times:\n{old[:120]}")
        sys.exit(1)
    src = src.replace(old, new, 1)

open(PATH, "w", encoding="utf-8", newline="\n").write(src)
print("PATCHED OK", len(edits), "edits")
