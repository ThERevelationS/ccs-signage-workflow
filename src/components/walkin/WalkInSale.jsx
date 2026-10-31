import { useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, Plus, Receipt, Search, Trash2, X } from "lucide-react";
import { createWorkOrderWithRecovery } from "@/components/workflow/workOrderPersistence";
import { ensureNewCustomer } from "@/components/estimator/customerCreationService";
import { generateDocNumber } from "@/functions/generateDocNumber";
import {
  buildWalkInSale,
  findWalkInCustomer,
  newWalkInItem,
  walkInItemsTotal,
  WALK_IN_CUSTOMER_CREATION_KEY,
  WALK_IN_CUSTOMER_NAME,
  WALK_IN_PAYMENT_METHODS,
  WALK_IN_PAYMENT_METHOD_LABELS,
} from "./walkInModel";

const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const clean = (v) => String(v ?? "").trim();
const num = (v, fb = 0) => Number.isFinite(Number(v)) ? Number(v) : fb;
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const inputCls = "w-full h-9 px-2 border border-gray-300 rounded text-sm bg-white";
const labelCls = "block text-[10px] font-bold tracking-wide text-gray-500 mb-0.5";

const invokeAction = async (sessionToken, body) => {
  const r = await base44.functions.invoke("invoicingAction", { session_token: sessionToken, ...body });
  const data = r?.data || r;
  if (!data?.success) throw new Error(data?.error || "Request failed.");
  return data;
};

function quickProductUnitPrice(product) {
  const quantity = Math.max(0, num(product?.product_quantity, 1)) || 1;
  return num(product?.price_snapshot?.frozen_cost,
    product?.total_price !== undefined && product?.total_price !== null ? num(product.total_price) / quantity : 0);
}

function CustomerPicker({ customers, selectedId, onSelect, walkIn, onCreateWalkIn, creatingCustomer }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = customers.find((c) => c.id === selectedId) || null;
  const q = clean(query).toLowerCase();
  const matches = q
    ? customers.filter((c) => clean(c.company_name).toLowerCase().includes(q)).slice(0, 8)
    : [];

  return (
    <div className="relative">
      {selected ? (
        <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
          <span className="font-semibold text-emerald-800">
            {selected.company_name}{selected.id === walkIn?.id ? " (counter default)" : ""}
          </span>
          <button type="button" onClick={() => onSelect("")} className="text-emerald-700 hover:text-emerald-900"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 w-4 h-4 -translate-y-1/2 text-gray-400" />
            <input
              className={`${inputCls} pl-8`}
              value={query}
              onFocus={() => setOpen(true)}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              placeholder="Search customers, or leave blank…"
            />
          </div>
          {open && q && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
              {matches.map((c) => (
                <button key={c.id} type="button"
                  onClick={() => { onSelect(c.id); setQuery(""); setOpen(false); }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-red-50">
                  <span className="font-medium text-gray-800">{c.company_name}</span>
                  <span className="text-xs text-gray-400">{c.customer_status || ""}</span>
                </button>
              ))}
              {matches.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">No matches.</div>}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {!walkIn && (
              <button type="button" onClick={onCreateWalkIn} disabled={creatingCustomer}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50">
                {creatingCustomer ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Create “{WALK_IN_CUSTOMER_NAME}” customer
              </button>
            )}
            <span className="text-[11px] text-gray-400">
              {walkIn ? "No selection = the Walk-in customer is used." : "No counter customer found — create one, search for a customer, or sell with no customer."}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default function WalkInSale({ customers = [], taxGroups = [], quickProducts = [], sessionToken = "", actor = "", onCustomersChanged }) {
  const [items, setItems] = useState([newWalkInItem()]);
  const defaultWalkIn = useMemo(() => findWalkInCustomer(customers), [customers]);
  const [customerId, setCustomerId] = useState("");
  const [noCustomer, setNoCustomer] = useState(false);
  const [taxGroup, setTaxGroup] = useState("");
  const [taxPercent, setTaxPercent] = useState(0);
  const [taxTouched, setTaxTouched] = useState(false);
  const [method, setMethod] = useState("cash");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null);
  const submitRef = useRef(false);
  // Retry-safe attempt state: the doc number, creation keys, and ids of any
  // records already created. A retry resumes where it left off instead of
  // minting duplicates — invoice/payment keys make those creates idempotent.
  const attemptRef = useRef(null);

  const resolvedCustomerId = noCustomer ? "" : (customerId || defaultWalkIn?.id || "");
  const resolvedCustomer = customers.find((c) => c.id === resolvedCustomerId) || null;
  const totals = useMemo(() => walkInItemsTotal(items, taxPercent), [items, taxPercent]);
  const tenderedNum = tendered === "" ? null : num(tendered, NaN);
  const changeDue = method === "cash" && Number.isFinite(tenderedNum) ? Math.max(0, Math.round((tenderedNum - totals.total) * 100) / 100) : 0;

  const updateItem = (index, patch) => setItems((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const removeItem = (index) => setItems((rows) => rows.filter((_, i) => i !== index));
  const addItem = () => setItems((rows) => [...rows, newWalkInItem()]);

  const pickTaxGroup = (name) => {
    setTaxGroup(name);
    if (taxTouched) return;
    const group = taxGroups.find((g) => (g.group_name || g.name) === name);
    setTaxPercent(num(group?.tax_percent, 0));
  };

  const insertQuickProduct = (id) => {
    const product = quickProducts.find((p) => p.id === id);
    if (!product) return;
    setItems((rows) => [...rows, {
      ...newWalkInItem(),
      description: clean(product.product_name) || "Quick Product",
      category: clean(product.product_category || (product.categories || [])[0]),
      unit_price: quickProductUnitPrice(product),
    }]);
  };

  const createWalkInCustomer = async () => {
    if (creatingCustomer) return;
    setCreatingCustomer(true);
    setError("");
    try {
      const created = await ensureNewCustomer({
        creationKey: WALK_IN_CUSTOMER_CREATION_KEY,
        customer: { company_name: WALK_IN_CUSTOMER_NAME },
        sessionToken,
      });
      await onCustomersChanged?.(created);
      if (created?.id) { setCustomerId(created.id); setNoCustomer(false); }
    } catch (e) {
      setError(e?.message || "The Walk-in customer could not be created.");
    } finally {
      setCreatingCustomer(false);
    }
  };

  const resetSale = () => {
    setItems([newWalkInItem()]);
    setCustomerId("");
    setNoCustomer(false);
    setMethod("cash");
    setTendered("");
    setReference("");
    setPayNotes("");
    setNotes("");
    setReceipt(null);
    setError("");
    attemptRef.current = null;
  };

  const submit = async () => {
    if (submitRef.current) return;
    submitRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (!attemptRef.current) {
        attemptRef.current = {
          attemptKey: uuid(),
          docNumber: "",
          workOrderId: "",
          workOrder: null,
          invoiceId: "",
          invoice: null,
          paymentIds: [],
        };
      }
      const attempt = attemptRef.current;

      // Allocate the order number once per attempt so a retry matches the same
      // WorkOrder payload exactly (createWorkOrderWithRecovery matches on the
      // full payload — a different number would defeat recovery).
      if (!attempt.docNumber) {
        const res = await generateDocNumber({ doc_type: "order", session_token: sessionToken });
        const number = clean(res?.data?.number || res?.number);
        if (!number) throw new Error("An order number could not be issued. Try again.");
        attempt.docNumber = number;
      }

      const payment = {
        method,
        tendered: method === "cash" && Number.isFinite(tenderedNum) ? tenderedNum : undefined,
        reference_number: reference,
        notes: payNotes,
      };
      const sale = buildWalkInSale({
        items,
        customerId: resolvedCustomerId,
        customerName: resolvedCustomer?.company_name || (noCustomer ? "" : WALK_IN_CUSTOMER_NAME),
        payments: totals.total > 0 ? [payment] : [],
        taxPercent,
        notes,
        docNumber: attempt.docNumber,
        actor,
      });

      if (!attempt.workOrderId) {
        const { record } = await createWorkOrderWithRecovery({
          data: { ...sale.workOrderFields, corbridge_invoice_number: attempt.docNumber },
          label: "Walk-in sale",
        });
        if (!record?.id) throw new Error("The Walk-in Work Order could not be verified after creation.");
        attempt.workOrderId = record.id;
        attempt.workOrder = record;
      }

      // Paid counter sales carry an Invoice + Payment so AR/revenue reports see
      // them — invoicingAction is the only code path that writes those records.
      if (sale.invoiceFields) {
        if (!attempt.invoiceId) {
          const created = await invokeAction(sessionToken, {
            action: "create_invoice",
            creation_request_key: `walkin:invoice:${attempt.attemptKey}`,
            fields: {
              ...sale.invoiceFields,
              work_order_id: attempt.workOrderId,
              internal_notes: `${sale.invoiceFields.internal_notes} · Work Order ${attempt.workOrderId}`.trim(),
            },
          });
          attempt.invoiceId = created?.invoice?.id || "";
          attempt.invoice = created?.invoice || null;
          if (!attempt.invoiceId) throw new Error("The walk-in invoice could not be verified after creation.");
        }
        // record_payment only accepts sent/partially_paid invoices — issue it.
        if (clean(attempt.invoice?.status) === "draft") {
          const sent = await invokeAction(sessionToken, { action: "mark_sent", invoice_id: attempt.invoiceId })
            .catch((e) => (/draft/i.test(e?.message || "") ? null : Promise.reject(e)));
          if (sent?.invoice) attempt.invoice = sent.invoice;
          else if (sent === null) {
            const detail = await invokeAction(sessionToken, { action: "get_invoice", invoice_id: attempt.invoiceId }).catch(() => null);
            if (detail?.invoice) attempt.invoice = detail.invoice;
          }
        }
        for (let i = 0; i < sale.paymentFields.length; i += 1) {
          if (attempt.paymentIds[i]) continue;
          const pf = sale.paymentFields[i];
          try {
            const paid = await invokeAction(sessionToken, {
              action: "record_payment",
              invoice_id: attempt.invoiceId,
              creation_request_key: `walkin:payment:${attempt.attemptKey}:${i}`,
              amount: pf.amount,
              method: pf.method,
              paid_date: pf.paid_date,
              reference_number: pf.reference_number,
              notes: pf.notes,
            });
            attempt.paymentIds[i] = paid?.payment?.id || true;
            if (paid?.invoice) attempt.invoice = paid.invoice;
          } catch (payError) {
            // A timed-out write may still have landed — recover via the
            // creation_request_key before reporting a failure.
            const detail = await invokeAction(sessionToken, { action: "get_invoice", invoice_id: attempt.invoiceId }).catch(() => null);
            const recovered = (detail?.payments || []).find((p) => clean(p?.creation_request_key) === `walkin:payment:${attempt.attemptKey}:${i}`);
            if (recovered?.id) {
              attempt.paymentIds[i] = recovered.id;
              if (detail?.invoice) attempt.invoice = detail.invoice;
            } else {
              throw payError;
            }
          }
        }
      }

      setReceipt({
        docNumber: attempt.docNumber,
        workOrderId: attempt.workOrderId,
        invoice: attempt.invoice,
        paymentsRecorded: attempt.paymentIds.filter(Boolean).length,
        totals: sale.totals,
        walkInSale: sale.walkInSale,
        payments: sale.paymentFields,
        customerName: resolvedCustomer?.company_name || "",
        noInvoice: !sale.invoiceFields,
        requiresProduction: sale.requiresProduction,
      });
    } catch (e) {
      const partial = attemptRef.current?.workOrderId
        ? ` Work Order ${attemptRef.current.docNumber || ""} (${attemptRef.current.workOrderId}) was already created — retrying resumes the invoice/payment steps without duplicating it.`
        : "";
      setError(`${e?.message || "The sale could not be completed."}${partial}`);
    } finally {
      submitRef.current = false;
      setBusy(false);
    }
  };

  if (receipt) {
    const inv = receipt.invoice;
    return (
      <div className="bg-white p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Receipt className="w-5 h-5 text-emerald-600" />
          <h2 className="text-base font-bold text-gray-800">Sale complete</h2>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-lg font-bold text-emerald-800">{receipt.docNumber || receipt.workOrderId}</div>
          <div className="text-xs text-emerald-700">
            {receipt.customerName || "No customer"} · {new Date().toLocaleString()}
            {inv?.invoice_number ? ` · Invoice ${inv.invoice_number}` : ""}
          </div>
        </div>
        {receipt.noInvoice && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            No customer was linked, so no invoice or AR payment was recorded — the tender details are stored on the Work Order only.
          </div>
        )}
        {receipt.requiresProduction && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
            One or more items still need production — they were seeded into the work queues (Order Review / awaiting fulfillment) even though this sale is paid.
          </div>
        )}
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-[10px] font-bold uppercase text-gray-500">
              <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Total</th></tr>
            </thead>
            <tbody>
              {receipt.totals.items.map((row, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-800">{row.description}{row.category ? <span className="ml-1 text-xs text-gray-400">({row.category})</span> : ""}{row.produces_work ? <span className="ml-1 text-[10px] font-bold text-sky-600">PROD</span> : ""}</td>
                  <td className="px-3 py-2 text-right">{row.quantity}</td>
                  <td className="px-3 py-2 text-right">{usd(row.unit_price)}</td>
                  <td className="px-3 py-2 text-right font-medium">{usd(row.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-0.5 text-right text-sm">
          <div>Subtotal: <span className="font-medium">{usd(receipt.totals.subtotal)}</span></div>
          {receipt.totals.tax_amount > 0 && <div>Tax ({receipt.totals.tax_percent}%): <span className="font-medium">{usd(receipt.totals.tax_amount)}</span></div>}
          <div className="text-base font-bold text-gray-900">Total: {usd(receipt.totals.total)}</div>
          {receipt.walkInSale.payments.map((p, i) => (
            <div key={i}>
              Paid ({WALK_IN_PAYMENT_METHOD_LABELS[p.method] || p.method}): <span className="font-medium text-emerald-700">{usd(p.amount)}</span>
              {p.amount_tendered !== null && p.amount_tendered !== undefined && p.method === "cash" && (
                <span className="text-xs text-gray-500"> · tendered {usd(p.amount_tendered)}{p.change_due > 0 ? ` · change ${usd(p.change_due)}` : ""}</span>
              )}
            </div>
          ))}
          <div className="text-base font-bold text-violet-700">Balance due: {usd(receipt.noInvoice ? receipt.walkInSale.balance_due : num(inv?.balance_due, receipt.walkInSale.balance_due))}</div>
        </div>
        <Button onClick={resetSale} className="clay-button border-2 border-red-300 bg-red-50 hover:bg-red-100 text-red-700 font-bold">
          New walk-in sale
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 sm:p-6 space-y-4">
      {/* Line items */}
      <div>
        <div className="mb-1 grid grid-cols-[1fr_110px_60px_90px_44px_44px_34px] items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
          <span>Description</span><span>Category</span><span>Qty</span><span>Unit price</span><span className="text-center">Tax</span><span className="text-center" title="Needs production/fulfillment">Prod</span><span />
        </div>
        {items.map((row, i) => (
          <div key={i} className="mb-1.5 grid grid-cols-[1fr_110px_60px_90px_44px_44px_34px] items-center gap-2">
            <input className={inputCls} value={row.description} onChange={(e) => updateItem(i, { description: e.target.value })} placeholder="Item description" />
            <input className={inputCls} value={row.category} onChange={(e) => updateItem(i, { category: e.target.value })} placeholder="Category" />
            <input className={inputCls} type="number" min="0" step="any" value={row.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} />
            <input className={inputCls} type="number" min="0" step="any" value={row.unit_price} onChange={(e) => updateItem(i, { unit_price: e.target.value })} />
            <input type="checkbox" className="h-4 w-4 justify-self-center accent-red-600" title="Taxable" checked={row.taxable !== false} onChange={(e) => updateItem(i, { taxable: e.target.checked })} />
            <input type="checkbox" className="h-4 w-4 justify-self-center accent-sky-600" title="Produces physical work (queues)" checked={row.produces_work === true} onChange={(e) => updateItem(i, { produces_work: e.target.checked })} />
            <button type="button" onClick={() => removeItem(i)} className="text-gray-400 hover:text-red-500 justify-self-center"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <button type="button" onClick={addItem} className="inline-flex items-center gap-1 text-xs font-bold text-red-700 hover:underline">
            <Plus className="w-3.5 h-3.5" /> Add line
          </button>
          {quickProducts.length > 0 && (
            <select className="h-8 px-2 border border-gray-300 rounded bg-white text-xs" defaultValue="" onChange={(e) => { if (e.target.value) insertQuickProduct(e.target.value); e.target.value = ""; }}>
              <option value="">Insert Quick Product…</option>
              {quickProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.product_name}{quickProductUnitPrice(p) > 0 ? ` — ${usd(quickProductUnitPrice(p))}` : ""}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Customer + tax */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>CUSTOMER</label>
          <CustomerPicker
            customers={customers}
            selectedId={resolvedCustomerId}
            onSelect={(id) => { setCustomerId(id); setNoCustomer(false); }}
            walkIn={defaultWalkIn}
            onCreateWalkIn={createWalkInCustomer}
            creatingCustomer={creatingCustomer}
          />
          <label className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500">
            <input type="checkbox" className="h-3.5 w-3.5 accent-red-600" checked={noCustomer} onChange={(e) => { setNoCustomer(e.target.checked); if (e.target.checked) setCustomerId(""); }} />
            No customer (Work Order only — no invoice/AR payment)
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>TAX GROUP</label>
            <select className={inputCls} value={taxGroup} onChange={(e) => pickTaxGroup(e.target.value)}>
              <option value="">No tax group</option>
              {taxGroups.map((g) => (
                <option key={g.id || g.group_name || g.name} value={g.group_name || g.name}>{g.group_name || g.name} ({num(g.tax_percent)}%)</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>TAX %</label>
            <input className={inputCls} type="number" min="0" step="any" value={taxPercent}
              onChange={(e) => { setTaxTouched(true); setTaxPercent(e.target.value); }} />
          </div>
        </div>
      </div>

      {/* Payment */}
      <div className="rounded-lg border border-gray-200 p-3 space-y-3">
        <h3 className="text-xs font-bold tracking-wide text-gray-600">PAYMENT</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>METHOD</label>
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
              {WALK_IN_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{WALK_IN_PAYMENT_METHOD_LABELS[m]}</option>)}
            </select>
          </div>
          {method === "cash" && (
            <div>
              <label className={labelCls}>TENDERED</label>
              <input className={inputCls} type="number" min="0" step="any" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={totals.total.toFixed(2)} />
            </div>
          )}
          {["check", "card", "ach", "financing", "other"].includes(method) && (
            <div>
              <label className={labelCls}>REFERENCE #</label>
              <input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === "check" ? "Check #" : "Reference"} />
            </div>
          )}
          <div>
            <label className={labelCls}>PAYMENT NOTE</label>
            <input className={inputCls} value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        {method === "cash" && Number.isFinite(tenderedNum) && (
          <div className={`text-sm font-bold ${tenderedNum + 0.005 < totals.total ? "text-red-600" : "text-emerald-700"}`}>
            {tenderedNum + 0.005 < totals.total ? `Tendered is ${usd(totals.total - tenderedNum)} short` : `Change due: ${usd(changeDue)}`}
          </div>
        )}
      </div>

      <div>
        <label className={labelCls}>ORDER NOTES</label>
        <textarea className={`${inputCls} h-16 py-1.5`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional — copied onto the Work Order and invoice" />
      </div>

      {/* Totals + submit */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg bg-gray-50 px-4 py-3">
        <div className="space-y-0.5 text-sm">
          <div>Subtotal: <span className="font-medium">{usd(totals.subtotal)}</span></div>
          <div>Tax{totals.tax_percent ? ` (${totals.tax_percent}%)` : ""}: <span className="font-medium">{usd(totals.tax_amount)}</span></div>
          <div className="text-base font-bold text-gray-900">Total: {usd(totals.total)}</div>
        </div>
        <Button onClick={submit} disabled={busy || !totals.items.length || totals.items.every((r) => !clean(r.description))}
          className="clay-button border-2 border-red-300 bg-red-50 hover:bg-red-100 text-red-700 font-bold">
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
          {busy ? "Processing…" : `Charge ${usd(totals.total)}`}
        </Button>
      </div>

      {noCustomer && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          Selling with no customer writes only the Work Order — invoicingAction requires a Customer, so no invoice or AR payment can be recorded.
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <div className="font-semibold">Checkout did not finish</div>
          <div className="mt-1">{error}</div>
        </div>
      )}
    </div>
  );
}
