import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import ReconcileWizard from "@/components/reconciliation/ReconcileWizard";
import LocationsPanel from "@/components/reconciliation/LocationsPanel";
import BatchList from "@/components/reconciliation/BatchList";
import BatchDetail from "@/components/reconciliation/BatchDetail";
import CloseBatchDialog from "@/components/reconciliation/CloseBatchDialog";
import { batchName } from "@/components/reconciliation/reconUiModel";
import { staffEntities } from "@/components/staff/staffEntities";
import {
  Landmark,
  Plus,
  RefreshCw,
  Scale,
} from "lucide-react";
import {
  KpiStrip,
  PageHeader,
} from "@/components/kit";

const clean = (v) => String(v ?? "").trim();
const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const invokeAction = async (sessionToken, body) => {
  const r = await base44.functions.invoke("manageReconciliation", { session_token: sessionToken, ...body });
  const data = r?.data || r;
  if (!data?.success) throw new Error(data?.error || "Request failed.");
  return data;
};

export default function Reconciliation() {
  const { sessionToken, isRegistered, currentUser } = useAuth();
  const [batches, setBatches] = useState([]);
  const [unreconciled, setUnreconciled] = useState([]);
  const [locations, setLocations] = useState([]);
  const [salesLocations, setSalesLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [openId, setOpenId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    try {
      const data = await invokeAction(sessionToken, { action: "bootstrap" });
      setBatches(data.batches || []);
      setUnreconciled(data.unreconciled || []);
      setLocations(data.locations || []);
      // SalesLocation registry -- the close dialog's batch-location select
      // reads active rows from here. Until the staff gateways allowlist the
      // entity this resolves to an empty list and the select falls back to
      // past batch locations rather than failing the page.
      const salesLocationRows = await staffEntities.SalesLocation.list("name", 200).catch(() => []);
      setSalesLocations(Array.isArray(salesLocationRows) ? salesLocationRows : []);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { load(); }, [load]);

  // refresh() = bootstrap reload + BatchList re-query. The list re-queries on
  // refreshKey bumps only — not on mount — so page load costs one
  // list_batches call instead of two (the app's shared read budget is thin).
  const refresh = useCallback(() => {
    setNotice("");
    load();
    setRefreshKey((k) => k + 1);
  }, [load]);

  if (!isRegistered) return null;

  const pendingTotal = unreconciled.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const closedCount = batches.filter((b) => clean(b.status).toLowerCase() !== "reopened").length;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <PageHeader
        breadcrumbs={[{ label: "Financials", to: "/Financials" }, { label: "Reconciliation" }]}
        icon={Scale}
        title="Reconciliation"
        subtitle="Batched cash close — group payments, count tenders, track variance."
        actions={(
          <>
            <button onClick={refresh} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
            </button>
            <button onClick={() => setShowWizard(true)} disabled={unreconciled.length === 0}
              title="Quick close — sweeps every waiting payment (legacy wizard)"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-violet-300 px-4 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-60 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/40">
              <Plus className="h-4 w-4" />New Reconciliation
            </button>
            <button onClick={() => setShowClose(true)}
              title="Filtered close — scope by location/date/tender, select payments, count tenders"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700">
              <Landmark className="h-4 w-4" />Close batch
            </button>
          </>
        )}
      />

      <KpiStrip
        className="lg:grid-cols-3"
        tiles={[
          { label: "Unreconciled", value: `${unreconciled.length} payment${unreconciled.length === 1 ? "" : "s"}` },
          { label: "Waiting to close", value: usd(pendingTotal) },
          { label: "Batches closed", value: closedCount },
        ]}
      />

      <LocationsPanel locations={salesLocations} isAdmin={currentUser?.role === "admin" || currentUser?.is_full_admin === true} onChanged={load} />

      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
      {notice && <div className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</div>}

      <BatchList
        sessionToken={sessionToken}
        invoke={invokeAction}
        locations={locations}
        salesLocations={salesLocations}
        reloadToken={refreshKey}
        onOpen={(b) => setOpenId(b?.id || "")}
      />

      {showWizard && (
        <ReconcileWizard
          sessionToken={sessionToken}
          payments={unreconciled}
          batches={batches}
          locations={locations}
          salesLocations={salesLocations}
          invoke={invokeAction}
          onClose={() => setShowWizard(false)}
          onClosed={(data) => {
            setShowWizard(false);
            refresh();
            setNotice(`${clean(data?.batch?.batch_number) || "Batch"} closed — ${data?.swept_count ?? 0} payment${(data?.swept_count ?? 0) === 1 ? "" : "s"} swept${data?.skipped_payment_ids?.length ? `, ${data.skipped_payment_ids.length} skipped (changed mid-close)` : ""}.`);
          }}
        />
      )}
      {showClose && (
        <CloseBatchDialog
          sessionToken={sessionToken}
          invoke={invokeAction}
          locations={locations}
          salesLocations={salesLocations}
          onClose={() => setShowClose(false)}
          onClosed={(data) => {
            setShowClose(false);
            const swept = data?.swept_count ?? 0;
            const skipped = data?.skipped_payment_ids?.length ?? 0;
            refresh();
            setNotice(`${batchName(data?.batch)} closed — ${swept} payment${swept === 1 ? "" : "s"} swept${data?.already_count ? ` (${data.already_count} already swept)` : ""}${skipped ? `, ${skipped} skipped (changed mid-close)` : ""}${data?.reused ? " — retried close converged on the same batch" : ""}.`);
          }}
        />
      )}
      {openId && (
        <BatchDetail
          sessionToken={sessionToken}
          invoke={invokeAction}
          batchId={openId}
          currentUser={currentUser}
          onClose={() => setOpenId("")}
          onChanged={(data) => {
            refresh();
            if (data?.batch?.status === "reopened") {
              setNotice(`${batchName(data.batch)} reopened — payments released back to the candidate pool.`);
            }
          }}
        />
      )}
    </div>
  );
}
