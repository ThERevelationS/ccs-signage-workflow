import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import SavedViews from "@/components/workflow/SavedViews";
import {
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Loader2,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  X,
} from "lucide-react";

const clean = (v) => String(v ?? "").trim();
const uuid = () => crypto.randomUUID();
const inputCls = "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

const invokeAction = async (sessionToken, body) => {
  const r = await base44.functions.invoke("inventoryAction", { session_token: sessionToken, ...body });
  const data = r?.data || r;
  if (!data?.success) throw new Error(data?.error || "Request failed.");
  return data;
};

function MovementLog({ sessionToken, item, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const data = await invokeAction(sessionToken, { action: "list_movements", item_id: item.id });
        if (live) setRows(data.movements || []);
      } catch { /* log is advisory */ } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [sessionToken, item.id]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-slate-100">Stock history — {item.label}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
          {loading ? <div className="py-8 text-center text-sm text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
            : rows.length === 0 ? <div className="py-8 text-center text-sm text-slate-400">No movements recorded.</div>
            : rows.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
                <div>
                  <span className="font-semibold capitalize text-slate-800 dark:text-slate-100">{m.reason}</span>
                  <span className="ml-2 text-slate-500">{clean(m.note)}</span>
                  <div className="text-slate-400">{clean(m.created_at || m.created_date).slice(0, 16).replace("T", " ")} · {clean(m.created_by)}</div>
                </div>
                <div className={`font-bold ${Number(m.delta) >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {Number(m.delta) >= 0 ? "+" : ""}{m.delta} → {m.resulting_qty}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

export default function Inventory() {
  const { sessionToken, isRegistered } = useAuth();
  const [items, setItems] = useState([]);
  const [lowCount, setLowCount] = useState(0);
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [scanHit, setScanHit] = useState(""); // row id isolated by a barcode scan
  const [viewName, setViewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState("");
  const [qtys, setQtys] = useState({});
  const [logItem, setLogItem] = useState(null);
  const keyRef = useRef(uuid());

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    try {
      const data = await invokeAction(sessionToken, { action: "list_stock", query, low_only: lowOnly });
      setItems(data.items || []);
      setLowCount(data.low_stock_count || 0);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, query, lowOnly]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const move = async (item, action) => {
    if (busy) return;
    const qty = Number(qtys[item.id]);
    if (action !== "adjust_stock" && !(qty > 0)) { setError(`Enter a quantity for ${item.material_type} ${item.product_type}.`); return; }
    if (action === "adjust_stock" && (!Number.isFinite(qty) || qty === 0)) { setError("Enter a non-zero adjustment (+/-)."); return; }
    let body = { action, item_id: item.id, creation_request_key: keyRef.current };
    if (action === "receive_stock") body = { ...body, quantity: qty };
    if (action === "adjust_stock") body = { ...body, delta: qty, note: "manual adjustment" };
    if (action === "issue_to_job") {
      const workOrderId = prompt("Issue to which work order ID?", "");
      if (!workOrderId) return;
      body = { ...body, quantity: qty, work_order_id: clean(workOrderId) };
    }
    setBusy(`${item.id}:${action}`);
    setError("");
    try {
      await invokeAction(sessionToken, body);
      keyRef.current = uuid();
      setQtys((s) => ({ ...s, [item.id]: "" }));
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Update failed.");
    } finally {
      setBusy("");
    }
  };

  const saveReorderPoint = async (item, raw) => {
    const next = raw === "" ? 0 : Number(raw);
    const prev = Number(item.reorder_point ?? 0);
    if (busy || !Number.isFinite(next) || next < 0 || next === prev) return;
    setBusy(`${item.id}:reorder_point`);
    setError("");
    try {
      await invokeAction(sessionToken, {
        action: "set_reorder_point",
        item_id: item.id,
        reorder_point: next,
        expected_updated_date: item.updated_date,
      });
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Reorder point update failed.");
    } finally {
      setBusy("");
    }
  };

  const archiveItem = async (item) => {
    if (busy) return;
    if (!window.confirm(`Archive "${[item.material_type, item.product_type, item.size].filter(Boolean).join(" · ") || "this item"}"? It will be hidden from stock lists, pickers, and reorder suggestions (restorable by an admin).`)) return;
    setBusy(`${item.id}:archive`);
    setError("");
    try {
      await invokeAction(sessionToken, {
        action: "set_archived",
        item_id: item.id,
        archived: true,
        expected_updated_date: item.updated_date,
      });
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Archive failed.");
    } finally {
      setBusy("");
    }
  };

  const createReorderPo = async () => {
    if (busy) return;
    setBusy("reorder-po");
    setError("");
    setNotice(null);
    try {
      const low = await invokeAction(sessionToken, { action: "list_stock", low_only: true });
      const ids = (low.items || []).map((it) => it.id).filter(Boolean);
      if (ids.length === 0) { setError("No low-stock items to reorder."); return; }
      const data = await invokeAction(sessionToken, {
        action: "create_reorder_po",
        item_ids: ids,
        creation_request_key: keyRef.current,
      });
      keyRef.current = uuid();
      setNotice({ poId: data.purchase_order_id, poNumber: data.po_number || "draft" });
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Could not create the purchase order.");
    } finally {
      setBusy("");
    }
  };

  if (!isRegistered) return null;

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-violet-600" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Inventory Stock</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">On-hand quantities, receiving, issue-to-job, and reorder flags.</p>
        </div>
        <button type="button" onClick={load} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
        </button>
      </div>

      {lowCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setViewName(""); setLowOnly(!lowOnly); }} className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />{lowCount} item{lowCount === 1 ? "" : "s"} at/below reorder point — {lowOnly ? "show all" : "show only these"}
          </button>
          <button type="button" onClick={createReorderPo} disabled={Boolean(busy)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-200 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60">
            {busy === "reorder-po" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            Create draft PO
          </button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} pl-9`} value={query} onChange={(e) => { setViewName(""); setQuery(e.target.value); }} placeholder="Search material, type, size, supplier…" />
        </div>
        <input className={`${inputCls} w-44`} placeholder="Scan barcode + Enter"
          title="Scan or type a barcode and press Enter to isolate the matching item"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const code = e.currentTarget.value.trim();
            if (!code) { setScanHit(""); return; }
            const hit = items.find((it) => String(it.barcode || "") === code);
            if (hit) { setScanHit(hit.id); setError(""); }
            else setError(`No inventory item matches barcode "${code}".`);
          }} />
        {scanHit && (
          <button type="button" onClick={() => setScanHit("")}
            className="rounded-lg bg-sky-100 px-2.5 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-200">
            Barcode match — clear
          </button>
        )}
        <SavedViews
          storageKey="views.inventory"
          getState={() => ({ query, lowOnly })}
          activeName={viewName}
          onApply={(s, name) => { setQuery(s.query || ""); setLowOnly(s.lowOnly === true); setViewName(name || ""); }}
        />
      </div>

      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

      {notice && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <span>Draft purchase order {notice.poNumber} created.</span>
          {notice.poId && <a href={`/PurchaseOrders?po=${notice.poId}`} className="font-bold underline">Open it</a>}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading stock…</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-500">No inventory items.</div>
        ) : (
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Item</th><th className="px-4 py-2.5">Supplier</th>
                <th className="px-4 py-2.5 text-right">Cost</th><th className="px-4 py-2.5 text-right">On hand</th>
                <th className="px-4 py-2.5 text-right">Reorder pt</th><th className="px-4 py-2.5 text-center">Qty</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(scanHit ? items.filter((it) => it.id === scanHit) : items).map((it) => {
                const label = [it.material_type, it.product_type, it.size].filter(Boolean).join(" · ");
                const b = (a) => busy === `${it.id}:${a}`;
                return (
                  <tr key={it.id} className={`border-t border-slate-100 dark:border-slate-800 ${it.low_stock ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}`}>
                    <td className="max-w-72 truncate px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                      {label}{it.thickness_gauge ? ` (${it.thickness_gauge})` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{it.supplier || "—"}</td>
                    <td className="px-4 py-2.5 text-right">${Number(it.cost_per_unit || 0).toFixed(2)}<span className="text-xs text-slate-400">/{it.unit_type || "ea"}</span></td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`font-bold ${it.low_stock ? "text-amber-600" : "text-slate-900 dark:text-slate-100"}`}>{it.quantity_on_hand}</span>
                      {it.low_stock && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-amber-500" />}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <input className="w-16 rounded border border-slate-200 px-1 py-0.5 text-right text-xs dark:border-slate-600 dark:bg-slate-800"
                        type="number" min="0" step="any" key={`${it.id}:${it.reorder_point}`}
                        defaultValue={it.reorder_point ?? ""} placeholder="—"
                        title="Reorder point — edit and leave the field to save"
                        disabled={busy === `${it.id}:reorder_point`}
                        onBlur={(e) => saveReorderPoint(it, e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <input className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm dark:border-slate-600 dark:bg-slate-800"
                        type="number" step="any" placeholder="0"
                        value={qtys[it.id] ?? ""} onChange={(e) => setQtys((s) => ({ ...s, [it.id]: e.target.value }))} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button type="button" title="Receive stock" onClick={() => move(it, "receive_stock")} disabled={Boolean(busy)}
                          className="rounded-lg bg-emerald-100 p-1.5 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-900/50 dark:text-emerald-300">
                          {b("receive_stock") ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
                        </button>
                        <button type="button" title="Issue to job" onClick={() => move(it, "issue_to_job")} disabled={Boolean(busy)}
                          className="rounded-lg bg-blue-100 p-1.5 text-blue-700 hover:bg-blue-200 disabled:opacity-50 dark:bg-blue-900/50 dark:text-blue-300">
                          {b("issue_to_job") ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
                        </button>
                        <button type="button" title="Adjust ±" onClick={() => move(it, "adjust_stock")} disabled={Boolean(busy)}
                          className="rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300">
                          {b("adjust_stock") ? <Loader2 className="h-4 w-4 animate-spin" /> : "±"}
                        </button>
                        <button type="button" title="Movement history" onClick={() => setLogItem({ id: it.id, label })}
                          className="rounded-lg bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
                          <History className="h-4 w-4" />
                        </button>
                        <button type="button" title="Archive item" onClick={() => archiveItem(it)} disabled={Boolean(busy)}
                          className="rounded-lg bg-red-50 p-1.5 text-red-500 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/40 dark:text-red-300">
                          {b("archive") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-400">Catalog items are managed in Admin → Master Inventory; reorder points live on the item record. Quantities here update atomically with a full movement audit trail.</p>

      {logItem && <MovementLog sessionToken={sessionToken} item={logItem} onClose={() => setLogItem(null)} />}
    </div>
  );
}