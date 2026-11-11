import { useMemo, useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ListFilter, ArrowUpDown, RotateCcw, Trash2, Download, Upload, Copy, Archive, Briefcase, Layers } from "lucide-react";
import { convertEstimateToWorkOrder, convertEstimatesToSharedWorkOrder } from "@/components/estimator/estimateConversionService";
import { localDateStamp, formatInCompanyTz, quoteExpirationDate } from "@/components/estimator/quoteLifecycle";
import { restoreEstimateFromLoadedTrashSnapshot, permanentlyDeleteTrashedEstimate, softDeleteEstimateFromLoadedSnapshot, expectedEstimateFields, replaceEstimateFieldsIfUnchanged } from "@/components/estimator/estimatePersistence";
import { duplicateEstimate, newEstimateCreationKey } from "@/components/estimator/estimateCreationService";
import { ensureEstimateLifecycleRevision } from "@/components/estimator/estimateRevisionService";
import { isEstimateStatusTransitionAllowed, statusTransitionMap, allEstimateStatuses } from "@/components/estimator/estimateStatusTransitions";
import { staffEntities } from "@/components/staff/staffEntities";
import { fetchEstimateQueueBundle, loadFullEstimateRow } from "@/components/queues/queueFeedClient";
import { loadAllEntityRows } from "@/lib/loadAllEntityRows";
import { useAuth } from "@/components/auth/EmailGate";
import SavedViews from "@/components/workflow/SavedViews";
import { ExportEstimatesButton } from "@/components/importer/ImportExportButtons";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { estimateMatchesSearch, useEstimateDeepLink } from "@/components/estimator/deepLinks";
import QueueFilterBar from "@/components/queues/QueueFilterBar";
import {
  DEFAULT_QUEUE_FILTERS,
  filterQueueRows,
} from "@/components/queues/productQueueModel";

const STATUSES = [
  { key: "", label: "All" },
  { key: "draft", label: "In Draft" },
  { key: "calculated", label: "Calculated" },
  { key: "sent", label: "Awaiting Approval" },
  { key: "approved", label: "Approved" },
  { key: "archived", label: "Archived" },
  { key: "cancelled", label: "Cancelled" },
  { key: "sync_issues", label: "Sync Issues" },
  { key: "trash", label: "Trash" },
];

const SORTS = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "value_desc", label: "$ high â†’ low" },
  { key: "expiring", label: "Expiring first" },
];

const csvCell = (value) => {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const downloadJson = (filename, payload) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

const downloadCsv = (filename, headers, rows) => {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const money0 = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const compact = (n) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : money0(n));
const today = () => localDateStamp();

function expiryOf(e) {
  const override = String(e?.quote_expiration_date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  const validDays = e.quote_valid_days ?? e.valid_days;
  if ((e.status || "draft") !== "sent" || !e.quote_issue_date || !validDays) return null;
  // quote_issue_date is date-only; the shared helper parses it as local
  // midnight (a bare new Date would shift the result one day early).
  return quoteExpirationDate(e.quote_issue_date, Number(validDays)) || null;
}

// The EXPIRED badge is computed at read, but reporting needs a persisted
// flag — sweep a bounded slice of stale rows each load so `quote_expired`
// stays a truthful filter without a dedicated cron job.
const EXPIRY_FLAG_SWEEP_LIMIT = 10;
function syncExpiredFlags(rows) {
  const now = today();
  const stale = (Array.isArray(rows) ? rows : []).filter((e) => {
    const expired = Boolean(expiryOf(e) && expiryOf(e) < now);
    return Boolean(e?.id) && expired !== (e?.quote_expired === true);
  }).slice(0, EXPIRY_FLAG_SWEEP_LIMIT);
  for (const e of stale) {
    const expired = Boolean(expiryOf(e) && expiryOf(e) < now);
    // Best-effort sweep stays swallowed — a stale anchor just no-ops and
    // the next load retries (update() is not an allowed op on estimates).
    staffEntities.AllInOneEstimate.updateMany(
      { id: e.id, updated_date: e.updated_date },
      { $set: { quote_expired: expired } },
    ).catch(() => {});
  }
}

function daysSince(dateStr) {
  const d = Date.parse(dateStr || "");
  if (!Number.isFinite(d)) return null;
  return Math.max(0, Math.floor((Date.now() - d) / 86400000));
}

const TAG_DOT = { red: "bg-red-500", amber: "bg-amber-400", green: "bg-emerald-500", blue: "bg-sky-500", violet: "bg-violet-500" };

export default function EstimatorQueues() {
  const { user } = useAuth();
  const myEmail = String(user?.email || "").trim().toLowerCase();
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const status = params.get("status") || "";
  // ?mine=1 scopes every bucket to the signed-in user's estimates.
  // Queues default to all rows; this is the admin "my estimates" toggle.
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // C-01 — the shared queue filter bar owns the search box + filter selects
  // now; its `search` key is seeded from ?q= so deep links keep working.
  const [queueFilters, setQueueFilters] = useState(() => ({
    ...DEFAULT_QUEUE_FILTERS,
    search: params.get("q") || "",
  }));
  const [sort, setSort] = useState(params.get("sort") || "newest");
  const [trashBusyId, setTrashBusyId] = useState("");
  const [trashError, setTrashError] = useState("");
  const [quoteDefaultsFailed, setQuoteDefaultsFailed] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkStatus, setBulkStatus] = useState("sent");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [convertBusy, setConvertBusy] = useState("");
  const [convertResults, setConvertResults] = useState(null);
  const mine = params.get("mine") === "1";
  const [me, setMe] = useState(null);
  const [companyTz, setCompanyTz] = useState("");
  const [statusMap, setStatusMap] = useState(null);
  const [customStatuses, setCustomStatuses] = useState([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const importEstRef = useRef(null);
  // #302 — /EstimatorQueues?estimate=<id> forwards to the estimate detail.
  useEstimateDeepLink();
  // Per-row retry anchors for the inline quick actions — a retried duplicate
  // reuses its creation key instead of minting a second estimate.
  const quickKeysRef = useRef({});
  // Re-import an exported estimate bundle (#451): creates a new draft with
  // its parts/products re-pointed, then opens it.
  const importEstimateJson = async (file) => {
    if (!file) return;
    try {
      const bundle = JSON.parse(await file.text());
      if (!bundle?.estimate?.project_name) throw new Error("Not an estimate export — expected { estimate, products, parts }.");
      const sessionToken = localStorage.getItem("signShopSessionToken") || sessionStorage.getItem("signShopSessionToken") || "";
      const res = await base44.functions.invoke("opportunityWorkspaceAction", { session_token: sessionToken, action: "import_estimate", bundle });
      const d = res?.data || res;
      if (!d?.success || !d?.estimate_id) throw new Error(d?.error || "Import failed.");
      window.alert(`Estimate imported as a new draft (${d.imported_parts || 0} parts).`);
      navigate(`/EstimateDetail?id=${d.estimate_id}`);
    } catch (e) { window.alert(e?.message || "Import failed."); }
    finally { if (importEstRef.current) importEstRef.current.value = ""; }
  };
  useEffect(() => { base44.auth.me().then(setMe).catch(() => {}); }, []);
  // Company timezone (#488): QuoteDefaults.display_timezone drives the date
  // displays; blank falls back to the browser's zone. The row rides the
  // composed queueFeed bundle (M-03) — this helper is the single point the
  // legacy fallback read converges on too.
  const applyQuoteDefaults = (d) => {
    const row = d || {};
    setCompanyTz(row.display_timezone || "");
    let cs = [], tr = {};
    try { cs = JSON.parse(row.custom_statuses || "[]") || []; } catch {}
    try { tr = JSON.parse(row.status_transitions || "{}") || {}; } catch {}
    setCustomStatuses(Array.isArray(cs) ? cs : []);
    setStatusMap(statusTransitionMap(cs, tr));
  };
  const loadQuoteDefaultsLegacy = () =>
    staffEntities.QuoteDefaults.filter({ config_name: "default" }, undefined, 1)
      .then((rows) => { setQuoteDefaultsFailed(false); applyQuoteDefaults(Array.isArray(rows) ? rows[0] : null); })
      .catch(() => setQuoteDefaultsFailed(true));

  const toggleSelected = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const applyBulkStatus = async () => {
    if (!selectedIds.size || bulkBusy) return;
    setBulkBusy(true); setBulkError("");
    const failures = [];
    const skipped = [];
    for (const id of selectedIds) {
      const row = estimates.find((e) => e.id === id);
      if (!isEstimateStatusTransitionAllowed(row?.status, bulkStatus, statusMap)) {
        skipped.push(`${row?.estimate_number || id} (${row?.status || "draft"} → ${bulkStatus})`);
        continue;
      }
      try {
        // update() is not an allowed op on estimates — anchor the write to
        // the loaded row's updated_date; a zero-match means the row changed
        // since the queue loaded and must surface as a failure, not a no-op.
        const bulkResult = await staffEntities.AllInOneEstimate.updateMany(
          { id, updated_date: row?.updated_date },
          { $set: { status: bulkStatus } },
        );
        if (!bulkResult || bulkResult.updated !== 1) throw new Error("estimate changed in another session — reload and retry");
      } catch (error) {
        failures.push(`${id}: ${error?.message || "update failed"}`);
      }
    }
    setBulkBusy(false);
    setSelectedIds(new Set());
    const notes = [];
    if (skipped.length) notes.push(`${skipped.length} skipped — status change not allowed: ${skipped.slice(0, 3).join(" · ")}${skipped.length > 3 ? ` (+${skipped.length - 3} more)` : ""}`);
    if (failures.length) notes.push(`Bulk update partially failed: ${failures.slice(0, 3).join(" · ")}${failures.length > 3 ? ` (+${failures.length - 3} more)` : ""}`);
    if (notes.length) setBulkError(notes.join(" "));
    // Delta refetch — the feed store merges the touched rows onto the cached
    // set instead of re-paging the whole table (same path as the mount load).
    try { const b = await fetchEstimateQueueBundle(); setEstimates(b.estimates || []); } catch {}
  };

  // (#192 / #180) Queue-level conversion through the same shared pipeline as
  // ConvertToWorkOrder: separate-jobs bulk mode converts each Approved pick
  // independently; combined mode merges every pick onto ONE canonical Work
  // Order. Credit holds block non-interactively here — a hold/limit override
  // still happens in Estimate Detail where the confirm is interactive. Every
  // estimate reports its own outcome; nothing fails silently.
  const runBulkConvert = async (combine = false) => {
    if (convertBusy || bulkBusy) return;
    const picks = [...selectedIds].map((id) => estimates.find((e) => e.id === id)).filter(Boolean);
    const eligible = picks.filter((e) => e?.deleted !== true && (e.status || "draft") === "approved");
    const ineligible = picks.length - eligible.length;
    if (!eligible.length || (combine && eligible.length < 2)) {
      setConvertResults({
        errors: [combine && eligible.length < 2
          ? "Combined conversion needs at least two selected Approved estimates."
          : "Select at least one Approved estimate to convert."],
        rows: [],
        skipped: ineligible,
      });
      return;
    }
    if (combine && !window.confirm(
      `Combine ${eligible.length} approved estimates into ONE shared Work Order?\n\n` +
      "Sections, tasks and material manifests merge on the job and every estimate links to it. " +
      "All picks must resolve to the same customer.",
    )) return;
    setConvertBusy(combine ? "combine" : "bulk");
    setConvertResults(null);
    setTrashError("");
    try {
      const sessionToken = queueSessionToken();
      const ents = { Estimate: staffEntities.AllInOneEstimate, WorkOrder: staffEntities.WorkOrder };
      // Feed rows are projected — the shared conversion consumes full docs.
      const eligibleFull = await Promise.all(eligible.map(loadFullEstimateRow));
      if (combine) {
        const res = await convertEstimatesToSharedWorkOrder({
          estimates: eligibleFull,
          sessionToken,
          currentUser: me || user,
          entities: ents,
        });
        setConvertResults({
          workOrderId: res.work_order_id || "",
          reason: res.reason || "",
          rows: [...(res.results || []), ...(res.rejected || []).map((r) => ({ ...r, status: "rejected" }))],
          skipped: ineligible,
        });
      } else {
        const out = [];
        for (const e of eligible) {
          try {
            // Feed rows are projected — conversion reads the full document
            // (line items drive the WO products), so re-fetch it first.
            const fullEstimate = await loadFullEstimateRow(e);
            const r = await convertEstimateToWorkOrder({
              estimate: fullEstimate,
              pricing: { quoteTotal: Number.isFinite(Number(e.quote_total)) ? Number(e.quote_total) : undefined },
              sessionToken,
              currentUser: me || user,
              entities: ents,
            });
            out.push({
              estimate_id: e.id,
              estimate_number: e.estimate_number || e.project_name || e.id.slice(0, 8),
              status: r.status,
              work_order_id: r.workOrder?.id || "",
              reason: r.reason || "",
            });
          } catch (err) {
            out.push({
              estimate_id: e.id,
              estimate_number: e.estimate_number || e.project_name || e.id.slice(0, 8),
              status: "failed",
              reason: err?.message || "Conversion failed.",
            });
          }
        }
        setConvertResults({ rows: out, skipped: ineligible });
      }
      setSelectedIds(new Set());
      // Delta refetch merges the touched rows instead of re-paging the table.
      try { const b = await fetchEstimateQueueBundle(); setEstimates(b.estimates || []); } catch {}
    } catch (err) {
      setConvertResults({ errors: [err?.message || "Conversion failed."], rows: [], skipped: ineligible });
    } finally {
      setConvertBusy("");
    }
  };

  const writeParams = (key, value) => {
    try {
      const next = new URLSearchParams(window.location.search);
      if (value && value !== "newest") next.set(key, value); else next.delete(key);
      window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
    } catch {}
  };

  // QueueFilterBar is stateless — the page owns the filter object and keeps
  // ?q= write-back for the search key (same convention the old input used).
  const handleQueueFiltersChange = (next) => {
    setQueueFilters(next);
    if ((next?.search || "") !== (queueFilters.search || "")) writeParams("q", next?.search || "");
  };

  useEffect(() => {
    const load = async () => {
      try {
        // M-03 — one composed queueFeed call returns the projected estimate
        // rows plus QuoteDefaults; on failure the fetch falls back internally
        // to the paged gateway read + the legacy defaults read.
        const bundle = await fetchEstimateQueueBundle();
        setEstimates(bundle.estimates || []);
        syncExpiredFlags(bundle.estimates || []);
        applyQuoteDefaults(bundle.quoteDefaults);
      } catch (err) {
        console.error("Estimate queues could not be loaded:", err);
        setLoadError(err?.message || "Estimates could not be loaded.");
        // Defaults are independent of the estimate rows — the timezone must
        // not stay blank just because the table read failed.
        loadQuoteDefaultsLegacy();
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleRestore = async (e) => {
    if (trashBusyId) return;
    setTrashBusyId(e.id);
    setTrashError("");
    try {
      // The feed row is projected — re-fetch the full doc so the CAS baseline
      // and the record restored into state are complete.
      const fullEstimate = await loadFullEstimateRow(e);
      const saved = await restoreEstimateFromLoadedTrashSnapshot({
        entity: staffEntities.AllInOneEstimate,
        estimate: fullEstimate,
        label: "Estimate Trash recovery",
      });
      setEstimates((prev) => prev.map((row) => (row.id === e.id ? { ...e, ...saved } : row)));
    } catch (err) {
      setTrashError(err?.message || "The estimate could not be restored. Reload Trash before retrying.");
    } finally {
      setTrashBusyId("");
    }
  };

  const handlePermanentDelete = async (e) => {
    if (trashBusyId) return;
    // The linked-records warning read must fail CLOSED: a transient failure
    // resolving to "no acceptances" would skip the only warning on an
    // irreversible delete. Block the delete and say why instead.
    let acceptances;
    try {
      acceptances = await staffEntities.EstimateAcceptance
        .filter({ estimate_id: e.id }, "-created_date", 5);
    } catch (err) {
      setTrashError(
        "Linked records could not be verified, so the estimate was not permanently deleted. Try again." +
        (err?.message ? ` (${err.message})` : "")
      );
      return;
    }
    const linked = [];
    if (e.work_order_id) linked.push("a linked Work Order");
    if (Array.isArray(acceptances) && acceptances.length) {
      linked.push(`${acceptances.length} recorded customer acceptance${acceptances.length === 1 ? "" : "s"}`);
    }
    const cascade = linked.length
      ? `\n\nWARNING: this estimate has ${linked.join(" and ")}. Linked records are NOT deleted automatically and will keep pointing at a removed estimate.`
      : "";
    if (!window.confirm(`Permanently delete — this cannot be undone${cascade}`)) return;
    setTrashBusyId(e.id);
    setTrashError("");
    try {
      const fullEstimate = await loadFullEstimateRow(e);
      await permanentlyDeleteTrashedEstimate({
        entity: staffEntities.AllInOneEstimate,
        estimate: fullEstimate,
        label: "Estimate Trash permanent delete",
      });
      setEstimates((prev) => prev.filter((row) => row.id !== e.id));
    } catch (err) {
      setTrashError(err?.message || "The estimate could not be permanently deleted. Reload Trash before retrying.");
    } finally {
      setTrashBusyId("");
    }
  };

  const queueSessionToken = () => localStorage.getItem("signShopSessionToken") || sessionStorage.getItem("signShopSessionToken") || "";

  // Inline quick actions: duplicate / archive / trash straight from the queue
  // row. All reuse the same CAS-safe helpers as EstimateDetail — nothing here
  // touches inventory.
  const handleQuickDuplicate = async (e) => {
    if (trashBusyId || !e?.id || e.deleted === true) return;
    setTrashBusyId(e.id);
    setTrashError("");
    try {
      const key = `duplicate:${e.id}`;
      quickKeysRef.current[key] = quickKeysRef.current[key] || newEstimateCreationKey();
      // The feed row is projected — duplicate copies the whole document.
      const fullEstimate = await loadFullEstimateRow(e);
      const created = await duplicateEstimate({
        source: fullEstimate,
        sessionToken: queueSessionToken(),
        creationKey: quickKeysRef.current[key],
        keepEstimateNumber: false,
      });
      delete quickKeysRef.current[key];
      navigate(`/EstimateDetail?id=${created.id}`);
    } catch (err) {
      setTrashError(err?.message || "The estimate could not be duplicated.");
    } finally {
      setTrashBusyId("");
    }
  };

  const handleQuickArchive = async (e) => {
    if (trashBusyId || !e?.id || e.deleted === true) return;
    if (!isEstimateStatusTransitionAllowed(e.status, "archived", statusMap)) {
      setTrashError(`This estimate cannot go from ${e.status || "draft"} to archived directly.`);
      return;
    }
    if (!window.confirm(`Archive "${e.project_name || "this estimate"}"? It stays restorable from the Archived queue.`)) return;
    setTrashBusyId(e.id);
    setTrashError("");
    try {
      // The feed row is projected — the CAS baseline and the restorable
      // lifecycle snapshot both need the full document.
      const fullEstimate = await loadFullEstimateRow(e);
      const nextFields = {
        status: "archived",
        archived_at: new Date().toISOString(),
        archived_reason: "Archived from estimate queue",
      };
      const saved = await replaceEstimateFieldsIfUnchanged({
        entity: staffEntities.AllInOneEstimate,
        estimateId: e.id,
        expectedFields: expectedEstimateFields(fullEstimate, nextFields),
        guardFields: { updated_date: fullEstimate.updated_date },
        nextFields,
        label: "Estimate archive",
      });
      setEstimates((prev) => prev.map((row) => (row.id === e.id ? { ...e, ...saved } : row)));
      // Best-effort lifecycle audit row — same shape the merge path records,
      // never blocks the archive itself.
      try {
        await ensureEstimateLifecycleRevision({
          idempotencyKey: `queue_archive:${e.id}:${e.updated_date || "unknown"}`,
          sessionToken: queueSessionToken(),
          estimateBefore: fullEstimate,
          estimateAfter: { ...fullEstimate, ...(saved || {}), ...nextFields },
          reason: "Archived from estimate queue",
          revisionType: "status_transition",
          quoteTotalBefore: e.quote_total,
          quoteTotalAfter: e.quote_total,
          internalCostBefore: e.total_cost,
          internalCostAfter: e.total_cost,
        });
      } catch {}
    } catch (err) {
      setTrashError(err?.message || "The estimate could not be archived.");
    } finally {
      setTrashBusyId("");
    }
  };

  const handleQuickTrash = async (e) => {
    if (trashBusyId || !e?.id || e.deleted === true) return;
    if (e.work_order_id) {
      // Same Work Order guard as EstimateDetail — blocked, but not a dead end.
      if (window.confirm("This estimate is linked to a Work Order and cannot be moved to Trash. Open the job in Job Workspace?")) {
        navigate(`/JobWorkspace?wo=${e.work_order_id}`);
      }
      return;
    }
    setTrashBusyId(e.id);
    setTrashError("");
    try {
      // The open-revision trash guard must fail CLOSED. getOpenEstimateRevision
      // swallows read errors into null (a detection-probe posture for its
      // advisory callers), which would let an estimate with an open revision
      // be trashed on a transient failure. This identical bounded read
      // rethrows, so the catch below reports "not moved" instead of silently
      // skipping the guard.
      const openRevision = (await loadAllEntityRows({
        entity: base44.entities.EstimateRevision,
        query: { estimate_id: e.id, revision_status: "open" },
        sort: "-revision_number",
        limit: 50,
        label: "Open estimate revision",
      }) || [])[0] || null;
      if (openRevision?.id) {
        setTrashError("This estimate has an open revision — save it from Estimate Detail before moving it to Trash.");
        return;
      }
      if (!window.confirm(`Move "${e.project_name || "this estimate"}" to Trash? It will be hidden from all estimate lists until it is restored.`)) return;
      // The feed row is projected — the CAS baseline needs the full doc.
      const fullEstimate = await loadFullEstimateRow(e);
      const saved = await softDeleteEstimateFromLoadedSnapshot({
        entity: staffEntities.AllInOneEstimate,
        estimate: fullEstimate,
        deletedBy: myEmail || me?.email || "unknown",
        label: "Estimate trash",
      });
      setEstimates((prev) => prev.map((row) => (row.id === e.id ? { ...e, ...saved } : row)));
    } catch (err) {
      setTrashError(err?.message || "The estimate could not be moved to Trash.");
    } finally {
      setTrashBusyId("");
    }
  };

  const buckets = useMemo(() => {
    const by = {};
    for (const s of STATUSES) by[s.key] = { count: 0, total: 0 };
    for (const e of estimates) {
      if (e?.deleted === true) {
        by.trash.count += 1;
        by.trash.total += Number(e.quote_total || e.total_cost || 0);
        continue;
      }
      const bucketKey = e.pipeline_sync_pending === true ? "sync_issues" : (e.status || "draft");
      if (by[bucketKey]) { by[bucketKey].count += 1; by[bucketKey].total += Number(e.quote_total || e.total_cost || 0); }
      by[""].count += 1;
      by[""].total += Number(e.quote_total || e.total_cost || 0);
    }
    return by;
  }, [estimates]);

  const q = queueFilters.search.trim().toLowerCase();

  // C-01 — estimates mapped onto the product-queue row contract so the shared
  // QueueFilterBar keys run through the same filterQueueRows model (status and
  // free search stay page-owned: status pills + estimateMatchesSearch cover
  // line items, pseudo-statuses and the trash bucket the model can't express).
  const queueRows = useMemo(() => (estimates || []).map((e) => ({
    workOrderId: e.id, // reuses the row→record id slot for the id set
    ref: e.estimate_number || e.project_name || e.job_name || e.id,
    company: e.client_name || "",
    productName: e.project_name || "",
    status: e.deleted === true ? "trash" : (e.pipeline_sync_pending === true ? "sync_issues" : (e.status || "draft")),
    substatus: "",
    designer: "",
    assignedTo: e.assigned_to || "",
    responsibility: "",
    category: "",
    moduleKey: e.source_module || "",
    due: e.due_date || e.target_install_date || "",
    woDue: "",
    hardDue: false,
    machine: "",
    part: "",
    salesperson: e.salesperson_email || e.salesperson || "",
    enteredBy: e.created_by || "",
    rush: String(e.priority || "").trim().toLowerCase() === "rush",
  })), [estimates]);

  const queueOptions = useMemo(() => {
    const uniq = (key) =>
      [...new Set(queueRows.map((r) => r[key]).filter((v) => String(v || "").trim()))]
        .sort((a, b) => String(a).localeCompare(String(b)))
        .map((v) => ({ value: v, label: v }));
    return {
      assignees: uniq("assignedTo"),
      salespeople: uniq("salesperson"),
      enteredBys: uniq("enteredBy"),
      moduleKeys: uniq("moduleKey"),
    };
  }, [queueRows]);

  // Bar selects/due presets pass through the model; search + status are
  // forced inert here because the page's own controls own them.
  const barFilteredIds = useMemo(
    () => new Set(
      filterQueueRows(queueRows, { ...queueFilters, search: "", status: "all" }).map((r) => r.workOrderId)
    ),
    [queueRows, queueFilters]
  );

  const [visibleCount, setVisibleCount] = useState(() => DEFAULT_QUEUE_FILTERS.pageSize);
  const PAGE = queueFilters.pageSize;
  // Incremental render-window (#404-408): large queues render the first PAGE
  // rows and grow on "Load more" — resets whenever the filters change.
  useEffect(() => { setVisibleCount(PAGE); }, [status, queueFilters, sort, mine]);
  const rows = useMemo(() => {
    let list = status === "trash"
      ? estimates.filter((e) => e?.deleted === true)
      : status === "sync_issues"
        ? estimates.filter((e) => e?.deleted !== true && e.pipeline_sync_pending === true)
        : status
          ? estimates.filter((e) => e?.deleted !== true && (e.status || "draft") === status)
          : estimates.filter((e) => e?.deleted !== true);
    if (mine && me?.email) {
      const mineEmail = String(me.email).toLowerCase();
      list = list.filter((e) => String(e.salesperson_email || e.created_by || "").toLowerCase() === mineEmail);
    }
    // C-01 — bar selects (salesperson/entered-by/assigned/module) + due
    // presets incl. "Rush Jobs" narrow the bucket via the queue model.
    list = list.filter((e) => barFilteredIds.has(e.id));
    // #301 — global estimate search: header fields + notes + every loaded
    // line item (title/name/description/module_key — see deepLinks.js).
    if (q) {
      list = list.filter((e) => estimateMatchesSearch(e, q));
    }
    const val = (e) => Number(e.quote_total || e.total_cost || 0);
    const exp = (e) => expiryOf(e) || "9999-12-31";
    const sorted = [...list];
    if (sort === "oldest") sorted.sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)));
    else if (sort === "value_desc") sorted.sort((a, b) => val(b) - val(a));
    else if (sort === "expiring") sorted.sort((a, b) => exp(a).localeCompare(exp(b)));
    else sorted.sort((a, b) => String(b.created_date).localeCompare(String(a.created_date)));
    return sorted;
  }, [estimates, status, q, sort, mine, me, barFilteredIds]);

  const visibleTotal = rows.reduce((s, e) => s + Number(e.quote_total || e.total_cost || 0), 0);

  // Full estimate backup (#468): dumps estimates plus their builder tree and
  // audit trail (revisions, acceptances, deliveries) to one JSON file. Admin-only
  // because it exports every estimate, not just the filtered view.
  // Full-data backup (#484): server-side admin-gated dump of EVERY real
  // entity — estimates, customers, inventory, work orders, admin records.
  const exportBackup = async () => {
    if (backupBusy || me?.role !== "admin") return;
    setBackupBusy(true);
    try {
      const sessionToken = localStorage.getItem("signShopSessionToken") || sessionStorage.getItem("signShopSessionToken") || "";
      const res = await base44.functions.invoke("opportunityWorkspaceAction", { action: "full_backup", session_token: sessionToken });
      const d = res?.data || res;
      if (!d?.success) throw new Error(d?.error || "Backup export failed.");
      downloadJson(`full-backup-${new Date().toISOString().slice(0, 10)}.json`, {
        exported_at: d.exported_at,
        app: "ccs-signage-workflow",
        entity_count: d.entity_count,
        entities: d.entities,
        errors: d.errors,
      });
    } catch (e) {
      window.alert(e?.message || "The full backup could not be exported.");
    } finally {
      setBackupBusy(false);
    }
  };

  const exportCsv = () => {
    downloadCsv("estimates.csv",
      ["Estimate #", "Project", "Customer", "Status", "Quote Total", "Cost Total", "Salesperson", "Source", "Updated", "Due Date"],
      rows.map((e) => [
        e.estimate_number || e.job_name || "",
        e.project_name || "",
        e.client_name || "",
        e.status || "",
        e.quote_total ?? "",
        e.cost_total ?? "",
        e.salesperson_email || e.created_by || "",
        e.source_module || "",
        e.updated_date || "",
        e.due_date || "",
      ]));
  };

  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-3">
        {/* Sticky queue header — toolbar, status pills, filters and sort stay
            pinned at the top of the scroll container while rows scroll under.
            Negative margins bleed to the page padding edge so the band is
            flush when stuck; inner padding restores the visual offset. */}
        <div className="sticky top-0 z-20 -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 px-4 sm:px-6 pt-4 sm:pt-6 pb-2 space-y-3 bg-rose-50/95 backdrop-blur-sm border-b border-rose-100/60">
        <div className="bg-white px-4 py-3 flex items-center gap-2">
          <ListFilter className="w-4 h-4 text-red-500" aria-hidden="true" />
          <h1 className="text-xs font-bold tracking-wide text-gray-600">ESTIMATE QUEUES</h1>
          <button type="button" onClick={exportCsv} disabled={rows.length === 0} className="ml-auto h-6 px-2 rounded border border-gray-300 bg-white text-[10px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1"><Download className="w-3 h-3" aria-hidden="true" /> CSV</button>
          <ExportEstimatesButton estimates={rows} />
          {me?.role === "admin" && <button type="button" onClick={exportBackup} disabled={backupBusy} className="h-6 px-2 rounded border border-violet-300 bg-violet-50 text-[10px] font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50 inline-flex items-center gap-1"><Download className="w-3 h-3" aria-hidden="true" />{backupBusy ? " Exporting…" : " Backup (JSON)"}</button>}
          <button type="button" onClick={() => importEstRef.current?.click()} className="h-6 px-2 rounded border border-emerald-300 bg-emerald-50 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 inline-flex items-center gap-1" title="Import an exported estimate JSON bundle (#451)"><Upload className="w-3 h-3" aria-hidden="true" />Import estimate</button>
          <input ref={importEstRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => importEstimateJson(e.target.files?.[0])} />
          <button type="button" onClick={async () => {
            const moduleKey = window.prompt("Module key? (foundation, metal, channel_letters, vinyl, cnc, brick_stone, maintenance, laser, sign_hardware, digital_print)", "");
            if (!moduleKey) return;
            const projectId = window.prompt("Module project id?", "");
            if (!projectId) return;
            try {
              const sessionToken = localStorage.getItem("signShopSessionToken") || sessionStorage.getItem("signShopSessionToken") || "";
              const res = await base44.functions.invoke("opportunityWorkspaceAction", { session_token: sessionToken, action: "estimate_from_module", module_key: moduleKey.trim(), project_id: projectId.trim() });
              const d = res?.data || res;
              if (!d?.success || !d?.estimate_id) throw new Error(d?.error || "Wrap failed.");
              navigate(`/EstimateDetail?id=${d.estimate_id}`);
            } catch (e) { window.alert(e?.message || "Wrap failed."); }
          }}
            className="h-6 px-2 rounded border border-sky-300 bg-sky-50 text-[10px] font-bold text-sky-700 hover:bg-sky-100 inline-flex items-center gap-1" title="Wrap a standalone module project into a new AIO estimate (#455)">From project</button>
          <span className="text-xs text-gray-400">{rows.length} shown · {compact(visibleTotal)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Estimate status filter"
          onKeyDown={(e) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
            const tabs = [...e.currentTarget.querySelectorAll('a[role="tab"]')];
            const i = tabs.indexOf(document.activeElement);
            if (i < 0) return;
            e.preventDefault();
            const next = e.key === "Home" ? tabs[0] : e.key === "End" ? tabs[tabs.length - 1] : tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
            next?.focus();
          }}>
          {STATUSES.map((s) => {
            const b = buckets[s.key] || { count: 0, total: 0 };
            return (
              <Link
                key={s.key || "all"}
                role="tab"
                aria-selected={status === s.key}
                to={`/EstimatorQueues?${(() => { const p = new URLSearchParams(); if (s.key) p.set("status", s.key); if (q) p.set("q", q); if (sort && sort !== "newest") p.set("sort", sort); if (mine) p.set("mine", "1"); return p.toString(); })()}`}
                aria-current={status === s.key ? "true" : undefined}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  status === s.key
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-white/70 text-gray-600 border-gray-200 hover:border-red-300"
                }`}
                title={`${b.count} · ${money0(b.total)}`}
              >
                {s.label}
                <span className={`ml-1.5 ${status === s.key ? "text-red-100" : "text-gray-400"}`}>
                  {b.count}{b.total > 0 ? ` · ${compact(b.total)}` : ""}
                </span>
              </Link>
            );
          })}
          <Link
            to={`/EstimatorQueues?${(() => { const p = new URLSearchParams(); if (status) p.set("status", status); if (q) p.set("q", q); if (sort && sort !== "newest") p.set("sort", sort); if (!mine) p.set("mine", "1"); return p.toString(); })()}`}
            aria-pressed={mine}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              mine ? "bg-slate-700 text-white border-slate-700" : "bg-white/70 text-gray-600 border-gray-200 hover:border-slate-400"
            }`}
            title="Show only my estimates"
          >
            Mine
          </Link>
        </div>

        <QueueFilterBar
          compact
          filters={queueFilters}
          onChange={handleQueueFiltersChange}
          options={queueOptions}
          pageSize={queueFilters.pageSize}
          onPageSizeChange={(n) => setQueueFilters((f) => ({ ...f, pageSize: n }))}
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
            <select
              value={sort}
              onChange={(e) => { const v = e.target.value; setSort(v); writeParams("sort", v); }}
              aria-label="Sort estimates"
              className="rounded-lg border border-gray-200 bg-white/80 px-2 py-2 text-xs font-semibold text-gray-600 outline-none focus:border-red-300"
            >
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <SavedViews
            storageKey="views.estimator_queues"
            autoApply={!status && !params.get("q") && !params.get("sort") && !mine}
            getState={() => ({ q: queueFilters.search, status, sort, mine })}
            onApply={(s) => {
              const nextQ = s?.q || ""; const nextSort = s?.sort || "newest"; const nextStatus = s?.status || "";
              setQueueFilters((f) => ({ ...f, search: nextQ })); setSort(nextSort);
              const p = new URLSearchParams();
              if (nextStatus) p.set("status", nextStatus);
              if (nextQ) p.set("q", nextQ);
              if (nextSort !== "newest") p.set("sort", nextSort);
              if (s?.mine) p.set("mine", "1");
              navigate(`/EstimatorQueues${p.size ? `?${p.toString()}` : ""}`, { replace: true });
            }}
          />
        </div>

        {quoteDefaultsFailed && (
          <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 flex items-center justify-between gap-3">
            <span>Custom statuses could not be loaded — showing default statuses only.</span>
            <button type="button" onClick={() => { setQuoteDefaultsFailed(false); loadQuoteDefaultsLegacy(); }} className="text-amber-700 font-bold">Retry</button>
          </div>
        )}
        {trashError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 flex items-center justify-between gap-3">
            <span>{trashError}</span>
            <button type="button" onClick={() => setTrashError("")} className="text-red-500 font-bold">Dismiss</button>
          </div>
        )}
        </div>

        <div className="bg-white">
          {loading ? (
            <ListSkeleton rows={8} />
          ) : loadError ? (
            <div role="alert" className="px-4 py-10 text-center text-sm text-red-600">{loadError}</div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">Nothing in this queue.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-red-50/60 border-b border-red-100">
                  <span className="text-[11px] font-bold text-red-700">{selectedIds.size} selected</span>
                  <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} aria-label="Bulk status to apply" className="h-7 rounded border border-gray-300 bg-white px-2 text-[11px] font-semibold text-gray-700">
                    {allEstimateStatuses(customStatuses).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button type="button" onClick={applyBulkStatus} disabled={bulkBusy || !!convertBusy} className="h-7 px-3 rounded bg-red-600 text-white text-[11px] font-bold hover:bg-red-700 disabled:opacity-50">{bulkBusy ? "Applying…" : "Apply status"}</button>
                  <button type="button" onClick={() => runBulkConvert(false)} disabled={bulkBusy || !!convertBusy} title="Convert each selected Approved estimate to its own Work Order (per-estimate results below)" className="h-7 px-3 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 disabled:opacity-50 inline-flex items-center gap-1"><Briefcase className="w-3 h-3" aria-hidden="true" />{convertBusy === "bulk" ? "Converting…" : "Convert to Work Orders"}</button>
                  <button type="button" onClick={() => runBulkConvert(true)} disabled={bulkBusy || !!convertBusy} title="Merge all selected Approved estimates (same customer) into one shared Work Order" className="h-7 px-3 rounded border border-sky-300 bg-sky-50 text-sky-700 text-[11px] font-bold hover:bg-sky-100 disabled:opacity-50 inline-flex items-center gap-1"><Layers className="w-3 h-3" aria-hidden="true" />{convertBusy === "combine" ? "Combining…" : "Combine into one WO"}</button>
                  <button type="button" onClick={() => setSelectedIds(new Set())} className="h-7 px-2 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 hover:border-red-300">Clear</button>
                  {bulkError && <span role="status" className="text-[10px] text-red-600">{bulkError}</span>}
                </div>
              )}
              {convertResults && (
                <div role="status" className="px-4 py-2.5 bg-emerald-50/50 border-b border-emerald-100 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-emerald-800">
                      Work Order conversion results
                      {convertResults.workOrderId ? ` · shared WO ${String(convertResults.workOrderId).slice(0, 8)}` : ""}
                    </span>
                    <button type="button" onClick={() => setConvertResults(null)} className="text-emerald-600 font-bold">Dismiss</button>
                  </div>
                  {(convertResults.errors || []).map((err, i) => (
                    <div key={`e${i}`} className="mt-1 text-red-700">{err}</div>
                  ))}
                  {convertResults.reason ? <div className="mt-1 text-amber-700">{convertResults.reason}</div> : null}
                  {convertResults.skipped ? <div className="mt-1 text-gray-500">{convertResults.skipped} selected row{convertResults.skipped === 1 ? "" : "s"} skipped — only Approved estimates convert.</div> : null}
                  <ul className="mt-1 space-y-0.5">
                    {(convertResults.rows || []).map((r) => (
                      <li key={r.estimate_id || r.estimate_number} className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-700">{r.estimate_number || String(r.estimate_id || "").slice(0, 8)}</span>
                        <span className={r.status === "converted" || r.status === "linked" ? "text-emerald-700 font-bold" : "text-red-700 font-semibold"}>
                          {r.status === "converted" ? "→ Work Order created/linked" : r.status === "linked" ? "→ linked to shared Work Order" : r.status}
                        </span>
                        {r.work_order_id && <span className="text-gray-400">WO {String(r.work_order_id).slice(0, 8)}</span>}
                        {r.reason && <span className="text-gray-500">— {r.reason}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {rows.slice(0, visibleCount).map((e) => {
                const expires = expiryOf(e);
                const expired = expires && expires < today();
                const expiringSoon = expires && !expired && expires <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
                const age = daysSince(e.updated_date || e.created_date);
                if (status === "trash") {
                  return (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/EstimateDetail?id=${e.id}`}
                          className="text-sm font-semibold text-gray-800 truncate hover:text-red-600 block"
                        >
                          {e.project_name}
                        </Link>
                        <div className="text-xs text-gray-500 truncate">
                          {e.client_name}
                          {e.estimate_number ? ` · ${e.estimate_number}` : ""}
                          {e.priority && e.priority !== "normal" ? ` · ${String(e.priority).toUpperCase()} PRIORITY` : ""}
                          {e.deleted_at ? ` · deleted ${formatInCompanyTz(e.deleted_at, companyTz)}` : ""}
                          {e.deleted_by ? ` by ${e.deleted_by}` : ""}
                        </div>
                      </div>
                      <div className="text-sm font-bold text-gray-800 w-24 text-right flex-shrink-0">
                        {money0(e.quote_total || e.total_cost)}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRestore(e)}
                          disabled={!!trashBusyId}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 disabled:opacity-40"
                        >
                          <RotateCcw className="w-3 h-3" aria-hidden="true" /> Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePermanentDelete(e)}
                          disabled={!!trashBusyId}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border border-red-200 bg-red-50 text-red-700 hover:border-red-300 disabled:opacity-40"
                        >
                          <Trash2 className="w-3 h-3" aria-hidden="true" /> Delete permanently
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={e.id} className="flex items-center gap-2 px-4 py-3 hover:bg-red-50/50">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(e.id)}
                      onChange={() => toggleSelected(e.id)}
                      aria-label={`Select ${e.project_name || "estimate"}`}
                      className="w-4 h-4 shrink-0 accent-red-600"
                    />
                    <Link
                      to={`/EstimateDetail?id=${e.id}`}
                      className="flex items-center gap-3 min-w-0 flex-1"
                    >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-800 truncate flex items-center gap-1.5">{myEmail && e.personal_tags?.[myEmail]?.color ? <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${TAG_DOT[e.personal_tags[myEmail].color] || ""}`} title={`My label: ${e.personal_tags[myEmail].color}`} /> : null}{e.project_name}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {e.client_name}
                        {e.estimate_number ? ` · ${e.estimate_number}` : ""}
                          {e.priority && e.priority !== "normal" ? ` · ${String(e.priority).toUpperCase()} PRIORITY` : ""}
                        {age != null ? ` · ${age}d open` : ""}
                        {e.status === "archived" && e.archived_reason ? ` · ${e.archived_reason}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {expired && <span className="text-[9px] font-bold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">EXPIRED</span>}
                      {!expired && e.status === "sent" && age != null && age >= 7 && <span className="text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5" title={`Sent ${age} days ago without a response`}>FOLLOW UP</span>}
                      {expiringSoon && <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">EXPIRES {formatInCompanyTz(expires, companyTz)}</span>}
                      {e.pipeline_sync_pending && <span className="text-[9px] font-bold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">SYNC ISSUE</span>}
                      <span className="text-xs font-medium text-gray-500 capitalize">
                        {e.status || "draft"}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-gray-800 w-24 text-right flex-shrink-0">
                      {money0(e.quote_total || e.total_cost)}
                    </div>
                    <div className="text-xs text-gray-400 w-16 text-right hidden sm:block flex-shrink-0">
                      {e.created_date ? formatInCompanyTz(e.created_date, companyTz) : ""}
                    </div>
                    </Link>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button type="button"
                        onClick={() => handleQuickDuplicate(e)}
                        disabled={!!trashBusyId}
                        title="Duplicate as a new draft"
                        aria-label={`Duplicate ${e.project_name || "estimate"}`}
                        className="w-7 h-7 inline-flex items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:border-red-300 hover:text-gray-800 disabled:opacity-40"
                      >
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      {e.status !== "archived" && isEstimateStatusTransitionAllowed(e.status, "archived", statusMap) && (
                        <button type="button"
                          onClick={() => handleQuickArchive(e)}
                          disabled={!!trashBusyId}
                          title="Archive this estimate"
                          aria-label={`Archive ${e.project_name || "estimate"}`}
                          className="w-7 h-7 inline-flex items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:border-amber-300 hover:text-amber-700 disabled:opacity-40"
                        >
                          <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                      <button type="button"
                        onClick={() => handleQuickTrash(e)}
                        disabled={!!trashBusyId}
                        title={e.work_order_id ? "Linked to a Work Order — open the job" : "Move to Trash"}
                        aria-label={`Move ${e.project_name || "estimate"} to Trash`}
                        className="w-7 h-7 inline-flex items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:border-red-300 hover:text-red-700 disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {visibleCount < rows.length && (
            <div className="border-t border-gray-100 py-2 text-center">
              <button type="button" onClick={() => setVisibleCount((c) => c + PAGE)} className="h-[30px] px-3 rounded border border-gray-300 bg-white text-[10px] font-bold text-gray-600 hover:bg-gray-50">Show {Math.min(PAGE, rows.length - visibleCount)} more ({rows.length - visibleCount} remaining)</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}