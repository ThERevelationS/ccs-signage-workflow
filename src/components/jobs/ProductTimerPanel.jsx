// Drop-in per-product timer panel (B-09 — CoreBridge parity). Render it next
// to a products[] row wherever the job surface needs labor timing; the parent
// owns the WorkOrderTimeEntry reads/writes (backend-only entity — go through
// the staff gateways, never the entity facade) and passes them in as props.
//
//   <ProductTimerPanel
//     product={product}            // one WorkOrder.products[] row
//     workOrderId={wo.id}          // parent WorkOrder id
//     entries={timeEntries}        // loaded WorkOrderTimeEntry rows for the WO
//     currentUser={currentUser}    // session user ({email})
//     onStart={(fields) => …}      // create payload from startPayload()
//     onStop={(entry, patch) => …} // running row + stopPayload() patch
//     loading={saving}             // disables Start/Stop while a write is in flight
//   />
//
// Pure display + productTimerModel — no data access of its own, so it works
// inside JobWorkspace, ProductQueue row editors, or a traveler page.

import React, { useEffect, useMemo, useState } from "react";
import { Play, Square, Timer } from "lucide-react";
import { StatusChip } from "@/components/kit";
import { cn } from "@/lib/utils";
import {
  TIME_ENTRY_DEPARTMENTS,
  departmentForProduct,
  elapsedSeconds,
  formatDuration,
  labelForProduct,
  openEntriesForUser,
  openEntryFor,
  startPayload,
  stopPayload,
  summarizeProductTime,
  syncProductTimeFields,
} from "./productTimerModel";

const DEPARTMENT_LABELS = {
  design: "Design",
  production: "Production",
  fabrication: "Fabrication",
  installation: "Installation",
};

const NO_ID_TOOLTIP = "Product has no id — reopen the Work Order to repair it";
const NO_USER_TOOLTIP = "Sign in to run a timer";

const startedLabel = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

export default function ProductTimerPanel({
  product,
  workOrderId,
  entries = [],
  currentUser,
  onStart,
  onStop,
  loading = false,
  className,
}) {
  const productId = String(product?.id || "").trim();
  const userEmail = String(currentUser?.email || currentUser?.user_email || "").trim();
  const [department, setDepartment] = useState(() => departmentForProduct(product));
  const [now, setNow] = useState(() => new Date());

  // Re-derive the department default when a different product mounts.
  useEffect(() => {
    setDepartment(departmentForProduct(product));
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the row identity

  const all = useMemo(() => (Array.isArray(entries) ? entries : []), [entries]);
  const productEntries = useMemo(
    () => all.filter((e) => String(e?.product_id || "").trim() === productId),
    [all, productId],
  );
  const running = useMemo(
    () => openEntryFor(userEmail, productId, all),
    [all, userEmail, productId],
  );
  const otherRunning = useMemo(
    () =>
      openEntriesForUser(userEmail, all).find(
        (e) => String(e?.product_id || "").trim() !== productId,
      ) || null,
    [all, userEmail, productId],
  );

  // 1s elapsed ticker — only while this user holds a running timer here, so
  // the panel costs nothing when idle. Keyed on the session so a new timer
  // restarts the clock cleanly.
  const runningKey = running ? `${running.id || running.creation_request_key}:${running.started_at}` : "";
  useEffect(() => {
    if (!runningKey) return undefined;
    setNow(new Date());
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, [runningKey]);

  const summary = useMemo(
    () => summarizeProductTime(productEntries, { now }),
    [productEntries, now],
  );
  const synced = useMemo(
    () => syncProductTimeFields(product, productEntries, { now }),
    [product, productEntries, now],
  );

  const canAct = Boolean(productId && userEmail) && !loading;
  const startTooltip = !productId
    ? NO_ID_TOOLTIP
    : !userEmail
      ? NO_USER_TOOLTIP
      : otherRunning
        ? `Timer already running on product ${otherRunning.product_id} — stop it first`
        : "Start a timer on this product";

  const handleStart = () => {
    if (!canAct || running || otherRunning) return;
    onStart?.(
      startPayload({
        workOrderId,
        productId,
        userEmail,
        department,
        now: new Date().toISOString(),
      }),
    );
  };

  const handleStop = () => {
    if (!canAct || !running) return;
    onStop?.(running, stopPayload(running, new Date().toISOString()));
  };

  if (!product) {
    return (
      <div className={cn("clay-card p-3 text-xs text-gray-400", className)}>
        No product selected for time tracking.
      </div>
    );
  }

  const btn =
    "clay-button inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className={cn("clay-card p-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Timer className="h-4 w-4 shrink-0 text-sky-600" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-800">Time tracking</div>
            <div className="truncate text-[11px] text-gray-500" title={labelForProduct(product)}>
              {labelForProduct(product)}
            </div>
          </div>
        </div>
        {running ? (
          <StatusChip status="in_progress" label="Running" />
        ) : summary.total_seconds > 0 ? (
          <StatusChip tone="emerald" label="Time logged" />
        ) : (
          <StatusChip tone="slate" label="No time yet" />
        )}
      </div>

      {running ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded border border-sky-200 bg-sky-50/60 px-3 py-2">
          <div>
            <div className="font-mono text-2xl font-bold tabular-nums text-gray-900">
              {formatDuration(elapsedSeconds(running, now))}
            </div>
            <div className="text-[11px] text-gray-500">
              {DEPARTMENT_LABELS[running.department] || running.department}
              {startedLabel(running.started_at) ? ` · started ${startedLabel(running.started_at)}` : ""}
            </div>
          </div>
          <button
            type="button"
            className={cn(btn, "text-rose-700")}
            disabled={!canAct}
            title="Stop the timer"
            onClick={handleStop}
          >
            <Square className="h-3.5 w-3.5" />
            Stop
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              Department
            </span>
            <select
              className="rounded border border-gray-300 bg-white px-1.5 py-1 text-xs"
              value={department}
              disabled={loading}
              onChange={(e) => setDepartment(e.target.value)}
            >
              {TIME_ENTRY_DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {DEPARTMENT_LABELS[d]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={cn(btn, "text-emerald-700")}
            disabled={!canAct || Boolean(otherRunning)}
            title={startTooltip}
            onClick={handleStart}
          >
            <Play className="h-3.5 w-3.5" />
            Start
          </button>
          {otherRunning && (
            <div className="text-[11px] text-amber-700">
              Timer already running on another product
              {otherRunning.product_id ? ` (${otherRunning.product_id})` : ""} — stop it first.
            </div>
          )}
          {!userEmail && <div className="text-[11px] text-gray-400">{NO_USER_TOOLTIP}.</div>}
        </div>
      )}

      <div className="mt-3 border-t border-gray-100 pt-2">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          {TIME_ENTRY_DEPARTMENTS.map((d) => (
            <div key={d} className="flex items-baseline justify-between gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                {DEPARTMENT_LABELS[d]}
              </span>
              <span className="font-mono text-xs tabular-nums text-gray-800">
                {formatDuration(summary.by_department[d])}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex items-baseline justify-between border-t border-gray-100 pt-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            Total
            <span className="ml-1.5 font-normal normal-case tracking-normal text-gray-400">
              {summary.entry_count} session{summary.entry_count === 1 ? "" : "s"}
              {summary.running_count ? ` · ${summary.running_count} running` : ""}
            </span>
          </span>
          <span className="font-mono text-sm font-bold tabular-nums text-gray-900">
            {formatDuration(summary.total_seconds)}
          </span>
        </div>
        <div className="mt-1 text-[10px] text-gray-400">
          On product — design {formatDuration(synced.design_time_seconds)} · production{" "}
          {formatDuration(synced.production_time_seconds)}
        </div>
      </div>
    </div>
  );
}
