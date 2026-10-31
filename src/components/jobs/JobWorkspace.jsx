import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { useAllWorkOrders, refreshAllWorkOrders } from "@/lib/workOrderCache";
import {
  OPERATIONAL_STATUS_CUSTOMER_LABELS,
  OPERATIONAL_STATUS_VALUES,
  PROOF_STATUS_VALUES,
  FULFILLMENT_STATE_VALUES,
  transitionProductAndBuilderStatus,
} from "@/components/estimator/workOrderConversion";
import { getModuleLabel } from "@/components/estimator/moduleRegistry";
import { FULFILLMENT_LABELS, overdueDays, parseLocalDate } from "@/components/queues/productQueueModel";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";
import { staffEntities } from "@/components/staff/staffEntities";
import { transitionWorkOrderFromLoadedSnapshot, replaceWorkOrderFieldsIfUnchanged } from "@/components/workflow/workOrderPersistence";
import { depositChip, depositCoveredByFinancials } from "@/components/estimator/depositGate";
import {
  PRODUCT_STAGE_MODE_SETTING_KEY,
  productStageModeFromSetting,
  suggestStageForProducts,
} from "@/components/estimator/productStageSync";
import {
  findWorkOrder,
  findWorkOrdersForEstimate,
  jobActivityTimeline,
  jobFinancialSummary,
  recordLinksWorkOrder,
  workspaceProductRows,
  PAYMENT_STATUS_LABELS,
  WORKSPACE_STAGES,
} from "./jobWorkspaceModel";
import {
  DataTableShell,
  EmptyState,
  FilterSearchInput,
  KpiStrip,
  PageHeader,
  RecordLink,
  StatusChip,
} from "@/components/kit";

const norm = (v) => String(v || "").trim().toLowerCase();
const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS_OPTIONS = OPERATIONAL_STATUS_VALUES.filter((s) => s !== "none");
const FULFILLMENT_OPTIONS = FULFILLMENT_STATE_VALUES.filter((s) => s !== "none");
const PROOF_OPTIONS = PROOF_STATUS_VALUES.filter((s) => s !== "none");
const NO_ID_TOOLTIP = "Product has no id — reopen the Work Order to repair it";
// Invoice/Payment entities are backend-only RLS; the workspace reads them
// through the session-authenticated invoicingAction gateway (same path as the
// Invoices page) instead of the entity facade.
const MAX_INVOICE_DETAILS = 10;

const invokeAction = async (sessionToken, body) => {
  const r = await base44.functions.invoke("invoicingAction", { session_token: sessionToken, ...body });
  const data = r?.data || r;
  if (!data?.success) throw new Error(data?.error || "Request failed.");
  return data;
};

// Status pills come from the shared kit (StatusChip + statusTones) -- one
// tone vocabulary app-wide. Deposit chips keep their own two-tone map since
// the depositGate model reports "required" | "invoiced", not a status enum.
const INVOICE_STATUS_LABELS = {
  draft: "Draft", sent: "Sent", partially_paid: "Partially paid", paid: "Paid", void: "Void",
};
const METHOD_LABELS = { cash: "Cash", check: "Check", card: "Card", ach: "ACH", financing: "Financing", other: "Other" };
const FIELD_LABELS = {
  operational_status: "Status", operational_substatus: "Substatus",
  customer_facing_status: "Customer label", proof_status: "Proof",
  fulfillment_state: "Fulfillment", design_due_date: "Design due",
  product_due_date: "Product due", hard_due_date: "Hard due",
  designer: "Designer", assigned_to: "Assigned to",
  responsibility: "Responsibility", queue_priority: "Priority",
};

const sel = "rounded border border-gray-300 bg-white px-1.5 py-1 text-xs";
const fmtDate = (v) => {
  const d = parseLocalDate(v);
  return d ? d.toLocaleDateString() : "";
};
const fmtAt = (v) => {
  const d = parseLocalDate(v);
  return d ? `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "";
};
const fieldLabel = (f) => FIELD_LABELS[f] || String(f || "").replace(/_/g, " ");
const prettyValue = (field, v) => {
  if (v === true) return "yes";
  if (v === false) return "no";
  const s = String(v ?? "");
  if (field === "operational_status") return OPERATIONAL_STATUS_CUSTOMER_LABELS[s] || s || "—";
  if (field === "fulfillment_state") return FULFILLMENT_LABELS[s] || s || "—";
  if (!s) return "—";
  if (/_status$|_state$/.test(field)) return s.replace(/_/g, " ");
  if (/_date$/.test(field)) return fmtDate(s) || s;
  return s;
};

function WorkOrderPicker({ workOrders, estimateId }) {
  const [query, setQuery] = useState("");
  const candidates = useMemo(() => {
    if (estimateId) return findWorkOrdersForEstimate(workOrders, estimateId);
    const q = norm(query);
    return (workOrders || [])
      .filter((wo) => wo?.deleted !== true)
      .filter((wo) => !q || [wo.corbridge_invoice_number, wo.title, wo.client_name].some((f) => norm(f).includes(q)))
      .sort((a, b) => String(b?.updated_date || "").localeCompare(String(a?.updated_date || "")))
      .slice(0, 50);
  }, [workOrders, estimateId, query]);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h2 className="mb-2 text-lg font-semibold">
        {estimateId ? "Work Orders for this Estimate" : "Open a Job Workspace"}
      </h2>
      {!estimateId && (
        <FilterSearchInput
          containerClassName="mb-2"
          placeholder="Search by order #, title, or customer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <div className="divide-y divide-gray-100 rounded border border-gray-200 bg-white">
        {candidates.map((wo) => (
          <Link
            key={wo.id}
            to={`/JobWorkspace?wo=${wo.id}`}
            className="flex items-center justify-between px-3 py-2 text-sm hover:bg-sky-50"
          >
            <span>
              <span className="font-medium text-sky-700">{wo.corbridge_invoice_number || wo.title || wo.id}</span>
              {wo.client_name && wo.client_name !== (wo.corbridge_invoice_number || wo.title) && <span className="ml-2 text-gray-500">{wo.client_name}</span>}
            </span>
            <span className="text-xs text-gray-400">{WORKSPACE_STAGES[wo.current_stage] || wo.current_stage || ""}</span>
          </Link>
        ))}
        {!candidates.length && (
          <EmptyState compact title={estimateId ? "No work order is linked to this estimate." : "No work orders match."} />
        )}
      </div>
      {estimateId && (
        <Link className="mt-2 inline-block text-sm text-sky-700 hover:underline" to={`/EstimateDetail?id=${estimateId}`}>
          Back to Estimate Detail
        </Link>
      )}
    </div>
  );
}

export default function JobWorkspace() {
  const { data: workOrders = [], isFetched } = useAllWorkOrders();
  const { currentUser, sessionToken } = useAuth();
  const actor = String(currentUser?.email || "").trim();
  const [searchParams] = useSearchParams();
  const woParam = String(searchParams.get("wo") || "").trim();
  const estimateParam = String(searchParams.get("estimate") || "").trim();
  const [busy, setBusy] = useState({});
  const [errors, setErrors] = useState({});
  const [transitionError, setTransitionError] = useState("");
  const [stageSyncNotice, setStageSyncNotice] = useState("");
  // Deposit controls for the Financials card. Form state mirrors the loaded
  // WO snapshot; every write goes through the CAS field path anchored on that
  // snapshot, so a concurrent edit reverts instead of silently clobbering.
  const [depositForm, setDepositForm] = useState({ required: false, amount: "" });
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositError, setDepositError] = useState("");
  const [depositNotice, setDepositNotice] = useState("");
  const now = useMemo(() => new Date(), []);

  const wo = useMemo(() => {
    if (woParam) return findWorkOrder(workOrders, woParam);
    if (estimateParam) return findWorkOrdersForEstimate(workOrders, estimateParam)[0] || null;
    return null;
  }, [workOrders, woParam, estimateParam]);

  const estimateCandidateCount = useMemo(
    () => (estimateParam ? findWorkOrdersForEstimate(workOrders, estimateParam).length : 0),
    [workOrders, estimateParam]
  );

  useEffect(() => {
    const ref = wo ? (wo.corbridge_invoice_number || wo.title || wo.id) : "";
    document.title = ref ? `Job ${ref}` : "Job Workspace";
  }, [wo]);

  // Keep the deposit form pinned to the loaded WO snapshot.
  useEffect(() => {
    setDepositForm({
      required: wo?.deposit_required === true,
      amount: Number(wo?.deposit_amount) > 0 ? String(wo.deposit_amount) : "",
    });
  }, [wo?.id, wo?.deposit_required, wo?.deposit_amount]);

  const { data: financials, isLoading: financialsLoading } = useQuery({
    queryKey: ["jobWorkspaceFinancials", wo?.id || ""],
    enabled: Boolean(sessionToken && wo?.id),
    queryFn: async () => {
      const list = await invokeAction(sessionToken, { action: "list_invoices" });
      const linked = (list.invoices || []).filter((inv) => recordLinksWorkOrder(inv, wo));
      const details = await Promise.all(
        linked.slice(0, MAX_INVOICE_DETAILS).map((inv) =>
          invokeAction(sessionToken, { action: "get_invoice", invoice_id: inv.id }).catch(() => null))
      );
      return {
        invoices: linked,
        payments: details.flatMap((d) => (Array.isArray(d?.payments) ? d.payments : [])),
      };
    },
  });

  const summary = useMemo(
    () => jobFinancialSummary({ workOrder: wo, invoices: financials?.invoices || [], payments: financials?.payments || [] }),
    [wo, financials]
  );
  const rows = useMemo(() => workspaceProductRows(wo), [wo]);
  const timeline = useMemo(() => jobActivityTimeline(wo), [wo]);
  // Auto-suggest: once linked financials cover the deposit, the card nudges
  // staff to flip deposit_invoiced. Suggest-only -- the flag is still set by
  // an explicit audited write, never silently derived.
  const depositCoverage = useMemo(
    () => depositCoveredByFinancials(wo, { invoices: financials?.invoices || [], payments: financials?.payments || [] }),
    [wo, financials]
  );

  // Product → stage sync mode (GlobalSettings.productStatusDrivesStage):
  // "off" renders nothing, "suggest" shows a one-click Apply chip, "auto"
  // applies the suggestion whenever a product write lands — and always says
  // so through stageSyncNotice, never silently.
  const { data: stageSyncMode = "suggest" } = useQuery({
    queryKey: ["productStatusDrivesStage"],
    staleTime: 60000,
    queryFn: async () => {
      const record = await loadSingleGlobalSetting({
        entity: staffEntities.GlobalSettings,
        settingKey: PRODUCT_STAGE_MODE_SETTING_KEY,
        label: "Product status stage sync",
      }).catch(() => null);
      return productStageModeFromSetting(record);
    },
  });

  const stageSuggestion = useMemo(
    () => (stageSyncMode === "off" ? null : suggestStageForProducts(wo?.products, wo?.current_stage)),
    [wo, stageSyncMode]
  );

  const applyStageSuggestion = async (snapshot, suggestion) => {
    if (!snapshot?.id || !suggestion?.suggested) return;
    try {
      await transitionWorkOrderFromLoadedSnapshot({
        workOrder: snapshot,
        newStage: suggestion.suggested,
        label: "Job workspace product-stage sync",
      });
      setStageSyncNotice(`Stage moved to ${WORKSPACE_STAGES[suggestion.suggested] || suggestion.suggested} — ${suggestion.reason}.`);
      refreshAllWorkOrders();
    } catch (e) {
      setTransitionError(e?.message || "The suggested stage move could not be applied.");
    }
  };

  const saveDepositSettings = async () => {
    if (!wo?.id || depositBusy) return;
    setDepositBusy(true);
    setDepositError("");
    setDepositNotice("");
    try {
      const nextAmount = depositForm.required ? Math.max(0, Number(depositForm.amount) || 0) : 0;
      await replaceWorkOrderFieldsIfUnchanged({
        workOrderId: wo.id,
        expectedFields: {
          deposit_required: wo.deposit_required === true,
          deposit_amount: Number(wo.deposit_amount) || 0,
        },
        nextFields: { deposit_required: depositForm.required, deposit_amount: nextAmount },
      });
      setDepositNotice("Deposit settings saved.");
      refreshAllWorkOrders();
    } catch (e) {
      setDepositError(e?.message || "Deposit settings could not be saved.");
    } finally {
      setDepositBusy(false);
    }
  };

  const setDepositInvoiced = async (value) => {
    if (!wo?.id || depositBusy) return;
    setDepositBusy(true);
    setDepositError("");
    setDepositNotice("");
    try {
      await replaceWorkOrderFieldsIfUnchanged({
        workOrderId: wo.id,
        expectedFields: { deposit_invoiced: wo.deposit_invoiced === true },
        nextFields: { deposit_invoiced: value },
      });
      setDepositNotice(value ? "Deposit marked as invoiced." : "Deposit invoiced flag cleared.");
      refreshAllWorkOrders();
    } catch (e) {
      setDepositError(e?.message || "The deposit flag could not be updated.");
    } finally {
      setDepositBusy(false);
    }
  };

  const transition = async (row, patch) => {
    const key = row.productId;
    setBusy((b) => ({ ...b, [key]: true }));
    setErrors((e) => ({ ...e, [key]: "" }));
    setTransitionError("");
    try {
      const res = await transitionProductAndBuilderStatus({
        workOrderId: wo.id, product: row.product, patch, actor, label: "Job workspace", workOrder: wo,
      });
      refreshAllWorkOrders();
      // Auto mode: the product write just landed, so re-roll the saved
      // snapshot and move the board stage when products imply a later one.
      if (stageSyncMode === "auto" && res?.workOrder) {
        const auto = suggestStageForProducts(res.workOrder.products, res.workOrder.current_stage);
        if (auto) await applyStageSuggestion(res.workOrder, auto);
      }
    } catch (e) {
      const msg = e?.message || "Status update failed.";
      setErrors((prev) => ({ ...prev, [key]: msg }));
      setTransitionError(msg);
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  if (!woParam && !estimateParam) {
    return <WorkOrderPicker workOrders={workOrders} estimateId="" />;
  }
  if (estimateParam && !woParam && (estimateCandidateCount !== 1 || !wo)) {
    if (!isFetched) {
      return <div className="p-6 text-center text-sm text-gray-400">Loading…</div>;
    }
    return <WorkOrderPicker workOrders={workOrders} estimateId={estimateParam} />;
  }
  if (isFetched && !wo) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <EmptyState
          title="Work order not found"
          message={`No work order matches "${woParam || estimateParam}".`}
          actionLabel="Browse work orders"
          actionTo="/JobWorkspace"
        />
      </div>
    );
  }
  if (!wo) {
    return <div className="p-6 text-center text-sm text-gray-400">Loading…</div>;
  }

  const ref = wo.corbridge_invoice_number || wo.title || wo.id;
  const stage = norm(wo.current_stage);
  const depositChipData = depositChip(wo);
  const contactBits = [wo.contact_name, wo.contact_email, wo.contact_phone].filter((f) => String(f || "").trim());

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3 p-3">
      {wo.deleted === true && (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          This work order is in the trash.
        </div>
      )}
      {transitionError && (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {transitionError}
        </div>
      )}
      {stageSyncNotice && (
        <div className="flex items-center justify-between gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <span>{stageSyncNotice}</span>
          <button type="button" className="font-semibold hover:underline" onClick={() => setStageSyncNotice("")}>Dismiss</button>
        </div>
      )}

      {/* Header */}
      <div className="rounded border border-gray-200 bg-white p-3">
        <PageHeader
          className="mb-0 items-start"
          breadcrumbs={[
            { label: wo.client_name || "Customer", to: wo.customer_id ? `/Customer360?id=${wo.customer_id}` : undefined },
            { label: ref },
          ]}
          title={ref}
          status={stage}
          statusLabel={WORKSPACE_STAGES[stage] || wo.current_stage || "—"}
          subtitle={wo.title && wo.title !== ref ? wo.title : wo.description || ""}
          actions={
            <div className="flex flex-wrap items-center gap-2 text-sm">
            {wo.estimate_id && (
              <RecordLink kind="estimate" id={wo.estimate_id} className="rounded border border-gray-300 px-2 py-1 hover:bg-sky-50">
                Estimate
              </RecordLink>
            )}
            <Link className="rounded border border-gray-300 px-2 py-1 text-sky-700 hover:bg-sky-50" to={`/MainWorkflow?wo=${wo.id}`}>
              Work Order
            </Link>
            <Link className="rounded border border-gray-300 px-2 py-1 text-sky-700 hover:bg-sky-50" to={`/WorkOrderTraveler?wo=${wo.id}`}>
              Traveler
            </Link>
            <Link className="rounded border border-gray-300 px-2 py-1 text-sky-700 hover:bg-sky-50" to={`/JobCosting?job=${wo.id}`}>
              Job Costing
            </Link>
            <Link className="rounded border border-gray-300 px-2 py-1 text-sky-700 hover:bg-sky-50" to={`/PurchaseOrders?wo=${wo.id}`}>
              Purchase Orders
            </Link>
            {wo.customer_id && (
              <Link className="rounded border border-gray-300 px-2 py-1 text-sky-700 hover:bg-sky-50" to={`/CustomerStatements?customer=${wo.customer_id}`}>
                Statement
              </Link>
            )}
            </div>
          }
        >
          {(wo.sales_status || depositChipData) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {wo.sales_status && <StatusChip status={wo.sales_status} />}
              {depositChipData && (
                <StatusChip tone={depositChipData.tone === "invoiced" ? "emerald" : "amber"} label={depositChipData.text} />
              )}
            </div>
          )}
        </PageHeader>
        {stageSyncMode !== "off" && stageSuggestion && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs text-sky-800">
            <span>
              Products suggest stage: <span className="font-semibold">{WORKSPACE_STAGES[stageSuggestion.suggested] || stageSuggestion.suggested}</span>
              <span className="text-sky-600"> — {stageSuggestion.reason}</span>
            </span>
            <button
              type="button"
              className="rounded border border-sky-300 bg-white px-1.5 py-0.5 font-semibold text-sky-700 hover:bg-sky-100"
              onClick={() => applyStageSuggestion(wo, stageSuggestion)}
            >
              Apply
            </button>
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-3 lg:grid-cols-6">
          <div><div className="font-semibold uppercase tracking-wide text-gray-400">Customer</div><div className="mt-0.5 text-sm text-gray-800"><RecordLink kind="customer" id={wo.customer_id}>{wo.client_name || "—"}</RecordLink></div></div>
          <div><div className="font-semibold uppercase tracking-wide text-gray-400">Contact</div><div className="mt-0.5 text-sm text-gray-800">{contactBits.join(" · ") || "—"}</div></div>
          <div><div className="font-semibold uppercase tracking-wide text-gray-400">Salesperson</div><div className="mt-0.5 text-sm text-gray-800">{wo.sales_rep || wo.representative || "—"}</div></div>
          <div><div className="font-semibold uppercase tracking-wide text-gray-400">Install Date</div><div className="mt-0.5 text-sm text-gray-800">{fmtDate(wo.project_install_date) || "—"}</div></div>
          <div><div className="font-semibold uppercase tracking-wide text-gray-400">PO #</div><div className="mt-0.5 text-sm text-gray-800">{wo.po_number || "—"}</div></div>
          <div><div className="font-semibold uppercase tracking-wide text-gray-400">Order Created</div><div className="mt-0.5 text-sm text-gray-800">{fmtDate(wo.date_order_created || wo.created_date) || "—"}</div></div>
        </div>
      </div>

      {/* Products */}
      <DataTableShell
        dense
        head={["#", "Product", "Qty", "Unit", "Total", "Status / Substatus", "Proof", "Fulfillment", "Due", "History", ""]}
        isEmpty={!rows.length}
        emptyState={{
          title: "No products on this work order.",
          actionLabel: "Open work order",
          actionTo: `/MainWorkflow?wo=${wo.id}`,
        }}
      >
            {rows.map((r) => {
              const isBusy = !!busy[r.productId];
              const locked = !r.editable || isBusy;
              const overdue = overdueDays({ due: r.productDue || r.designDue }, now);
              const label = r.customerLabel || OPERATIONAL_STATUS_CUSTOMER_LABELS[r.status] || r.status || "none";
              return (
                <tr key={r.productId} className="border-t border-gray-100 odd:bg-white even:bg-gray-50/60">
                  <td className="whitespace-nowrap px-2 py-1.5 text-gray-500">{r.position}</td>
                  <td className="max-w-[220px] px-2 py-1.5">
                    <div className="truncate font-medium text-gray-800" title={r.name}>{r.name}</div>
                    <div className="text-[10px] text-gray-400">{getModuleLabel(r.moduleKey) || r.moduleKey || "—"}</div>
                  </td>
                  <td className="px-2 py-1.5">{r.quantity}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{usd(r.quotedUnitPrice)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-medium">{usd(r.quotedTotal)}</td>
                  <td className="px-2 py-1.5">
                    <StatusChip status={r.status} label={label} />
                    {r.substatus && <div className="mt-0.5 text-[10px] italic text-gray-500">{r.substatus}</div>}
                    {r.hardDue && <div className="mt-0.5 text-[10px] font-semibold text-rose-600">HARD DUE</div>}
                  </td>
                  <td className="px-2 py-1.5">
                    <select className={sel} disabled={locked} title={r.editable ? "" : NO_ID_TOOLTIP} value={r.proof === "none" ? "" : r.proof}
                      onChange={(e) => transition(r, { proofStatus: e.target.value })}>
                      <option value="">—</option>
                      {PROOF_OPTIONS.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select className={sel} disabled={locked} title={r.editable ? "" : NO_ID_TOOLTIP} value={r.fulfillment === "none" ? "" : r.fulfillment}
                      onChange={(e) => transition(r, { fulfillmentState: e.target.value })}>
                      <option value="">—</option>
                      {FULFILLMENT_OPTIONS.map((o) => <option key={o} value={o}>{FULFILLMENT_LABELS[o]}</option>)}
                    </select>
                  </td>
                  <td className={`whitespace-nowrap px-2 py-1.5 ${overdue > 0 ? "font-semibold text-rose-700" : ""}`}>
                    {r.productDue ? fmtDate(r.productDue) : <span className="text-gray-400">—</span>}
                    {r.designDue && r.designDue !== r.productDue && (
                      <div className="text-[10px] font-normal text-gray-400">design {fmtDate(r.designDue)}</div>
                    )}
                    {overdue > 0 && <div className="text-[10px]">{overdue}d overdue</div>}
                  </td>
                  <td className="px-2 py-1.5 text-gray-500">{r.historyCount || "—"}</td>
                  <td className="px-2 py-1.5">
                    <select className={sel} disabled={locked} title={r.editable ? "" : NO_ID_TOOLTIP} value=""
                      onChange={(e) => { if (e.target.value) transition(r, { operationalStatus: e.target.value }); e.target.value = ""; }}>
                      <option value="">Set status…</option>
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{OPERATIONAL_STATUS_CUSTOMER_LABELS[s] || s}</option>)}
                    </select>
                    {isBusy && <span className="ml-1 text-[10px] text-gray-400">saving…</span>}
                    {errors[r.productId] && <div className="mt-0.5 max-w-[200px] text-[10px] text-rose-700">{errors[r.productId]}</div>}
                  </td>
                </tr>
              );
            })}
      </DataTableShell>

      {/* Financials */}
      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Financials</h2>
          {badge(PAYMENT_STATUS_LABELS[summary.paymentStatus] || summary.paymentStatus, PAYMENT_TONE[summary.paymentStatus] || TONE.muted)}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            ["Quoted", summary.quotedTotal],
            ["Invoiced", summary.invoicedTotal],
            ["Paid", summary.paidTotal],
            ["Balance Due", summary.balanceDue],
          ].map(([label, val], i) => (
            <div key={label} className="rounded border border-gray-100 bg-gray-50 p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
              <div className={`mt-0.5 text-base font-bold ${i === 3 && val > 0 ? "text-rose-700" : "text-gray-900"}`}>{usd(val)}</div>
            </div>
          ))}
        </div>

        {/* Deposit requirement + invoiced flag. Both flags write through the
            CAS field path; the coverage hint only ever suggests marking. */}
        <div className="mt-2 rounded border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="font-semibold uppercase tracking-wide text-gray-400">Deposit</span>
            <label className="flex items-center gap-1 font-medium text-gray-700">
              <input type="checkbox" disabled={depositBusy}
                checked={depositForm.required}
                onChange={(e) => setDepositForm((f) => ({ ...f, required: e.target.checked }))} />
              Required
            </label>
            <label className="flex items-center gap-1 text-gray-700">
              <span>$</span>
              <input type="number" min="0" step="0.01" disabled={depositBusy || !depositForm.required}
                className="w-24 rounded border border-gray-300 bg-white px-1.5 py-0.5 disabled:opacity-50"
                placeholder="0.00" value={depositForm.amount}
                onChange={(e) => setDepositForm((f) => ({ ...f, amount: e.target.value }))} />
            </label>
            <button type="button" disabled={depositBusy} onClick={saveDepositSettings}
              className="rounded border border-gray-300 bg-white px-1.5 py-0.5 font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50">
              {depositBusy ? "Saving…" : "Save deposit"}
            </button>
            {wo.deposit_required === true && wo.deposit_invoiced !== true && (
              <button type="button" disabled={depositBusy} onClick={() => setDepositInvoiced(true)}
                className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                Mark deposit invoiced
              </button>
            )}
            {wo.deposit_required === true && wo.deposit_invoiced === true && (
              <>
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800">Deposit invoiced</span>
                <button type="button" disabled={depositBusy} onClick={() => setDepositInvoiced(false)}
                  className="text-gray-500 underline hover:text-gray-700 disabled:opacity-50">
                  Unmark
                </button>
              </>
            )}
          </div>
          {wo.deposit_required === true && wo.deposit_invoiced !== true && depositCoverage.covered && (
            <div className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
              {depositCoverage.reason} Review and mark the deposit invoiced.
            </div>
          )}
          {depositError && <div className="mt-1.5 text-rose-700">{depositError}</div>}
          {depositNotice && <div className="mt-1.5 text-emerald-700">{depositNotice}</div>}
        </div>
        {summary.milestoneBilling && (
          <div className="mt-2 text-[11px] font-medium text-gray-500">
            {summary.milestoneBilling.label} — {summary.milestoneBilling.billed_pct}% of contract invoiced
          </div>
        )}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Invoices{summary.invoiceCount ? ` (${summary.invoiceCount})` : ""}
            </div>
            {financialsLoading && <div className="text-xs text-gray-400">Loading…</div>}
            {!financialsLoading && !(financials?.invoices || []).length && (
              <div className="text-xs text-gray-400">No invoices yet.</div>
            )}
            <ul className="divide-y divide-gray-100 rounded border border-gray-100">
              {(financials?.invoices || []).map((inv) => (
                <li key={inv.id} className="flex items-center justify-between px-2 py-1.5 text-xs">
                  <span className="font-medium text-gray-800">{inv.invoice_number || inv.id}</span>
                  <span className="flex items-center gap-2">
                    {badge(INVOICE_STATUS_LABELS[inv.status] || inv.status || "—", INVOICE_STATUS_TONE[inv.status] || TONE.muted)}
                    <span className="w-20 text-right font-medium">{usd(inv.total)}</span>
                    <span className="w-16 text-right text-gray-400">{fmtDate(inv.due_date)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Payments{(financials?.payments || []).length ? ` (${financials.payments.length})` : ""}
            </div>
            {!financialsLoading && !(financials?.payments || []).length && (
              <div className="text-xs text-gray-400">No payments recorded.</div>
            )}
            <ul className="divide-y divide-gray-100 rounded border border-gray-100">
              {(financials?.payments || []).map((pay, idx) => (
                <li key={pay.id || idx} className="flex items-center justify-between px-2 py-1.5 text-xs">
                  <span className="text-gray-700">{fmtDate(pay.paid_date || pay.created_date) || "—"}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-gray-500">{METHOD_LABELS[pay.method] || pay.method || "—"}</span>
                    {["void", "refunded"].includes(norm(pay.status)) && badge(pay.status, TONE.blocked)}
                    <span className="w-20 text-right font-medium">{usd(pay.amount)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Product Activity */}
      <div className="rounded border border-gray-200 bg-white p-3">
        <h2 className="mb-2 text-sm font-semibold">Product Activity</h2>
        {!timeline.length && <div className="text-xs text-gray-400">No product status changes recorded yet.</div>}
        <ul className="divide-y divide-gray-100">
          {timeline.map((entry, idx) => (
            <li key={idx} className="flex items-baseline justify-between gap-2 px-1 py-1.5 text-xs">
              <span className="w-36 shrink-0 text-gray-400">{fmtAt(entry.at) || "—"}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-gray-800">{entry.product}</span>
                <span className="text-gray-500"> · {fieldLabel(entry.field)}: </span>
                <span className="text-gray-500">{prettyValue(entry.field, entry.from)}</span>
                <span className="text-gray-400"> → </span>
                <span className="font-medium text-gray-800">{prettyValue(entry.field, entry.to)}</span>
              </span>
              <span className="shrink-0 text-gray-400">{entry.by || ""}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
