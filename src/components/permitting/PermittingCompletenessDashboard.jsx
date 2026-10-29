import { readAllCountyChoices } from "./permittingCountyChoices.mjs";
import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import usePermittingQueueBrowse from "./usePermittingQueueBrowse";
import PermittingRecordedCoverage from "./PermittingRecordedCoverage";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Database, FileCheck2, ShieldCheck, AlertTriangle, Clock,
  ChevronDown, Search, Loader2, Layers, MapPin, FileText, Activity,
} from "lucide-react";
import { staffEntities } from "@/components/staff/staffEntities";
import { loadSingleGlobalSetting, saveGlobalSettingValueIfUnchanged } from "@/components/shared/globalSettingsPersistence";

const readQueuePage = (query, options) => staffEntities.SourceCollectionQueue.filter(query, options);

const STATUS_OPTIONS = [
  "not_started", "source_discovery", "sources_found", "archive_incomplete",
  "extraction_pending", "verification_pending", "verified_current",
  "partial_gaps", "blocked", "monitoring_enabled", "re_review_required",
];
const STALE_DAYS_OPTIONS = [30, 60, 90, 180, 365];

function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="clay-card p-4 flex items-start gap-3">
      <div className="rounded-xl p-2" style={{ background: accent || "#E0D4F7" }}>
        <Icon className="w-5 h-5 text-gray-700" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-gray-800 leading-tight">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
        {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children, defaultOpen = false, badge }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="clay-card border border-gray-100">
      <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-gray-50/50 transition-colors">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-600" />
          <span className="font-semibold text-gray-800 text-sm">{title}</span>
          {badge != null && <Badge variant="secondary" className="text-xs">{badge}</Badge>}
        </div>
        <ChevronDown className="w-4 h-4 text-gray-400 data-[state=open]:rotate-180 transition-transform" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 border-t border-gray-100">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function Row({ label, value, bar }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-gray-600 truncate pr-2">{label}</span>
      <span className="font-semibold text-gray-800 tabular-nums whitespace-nowrap">{value}</span>
    </div>
  );
}

export default function PermittingCompletenessDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    state: "all",
    jurisdiction_type: "all",
    status: "all",
    parent_county_name: "all",
    staleDays: 90,
  });
  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [taskBusy, setTaskBusy] = useState("");
  const [taskDone, setTaskDone] = useState(new Set());
  const createFollowupTask = async (f) => {
    if (taskBusy === f.id || taskDone.has(f.id)) return;
    setTaskBusy(f.id);
    try {
      await staffEntities.GeneralTask.create({
        text: `Permit follow-up: ${f.row_name || f.work_order_title || "Permit"} — ${f.locality_name || "office"} due ${f.next_followup_date}`,
        assigned_to: [], completed: false,
      });
      setTaskDone((cur) => new Set([...cur, f.id]));
    } catch { /* leave button retryable */ }
    finally { setTaskBusy(""); }
  };
  useEffect(() => {
    let alive = true;
    loadSingleGlobalSetting({ entity: staffEntities.GlobalSettings, settingKey: "completenessHistory", label: "Completeness history" })
      .then((r) => { if (alive && Array.isArray(r?.setting_value?.entries)) setHistory(r.setting_value.entries); })
      .catch(() => null);
    return () => { alive = false; };
  }, []);
  const [officeContacts, setOfficeContacts] = useState([]);
  const [queueSearch, setQueueSearch] = useState("");
  const { queuePage, loadingQueue, queueError, loadQueue } = usePermittingQueueBrowse(readQueuePage, filters, queueSearch);

  const metricsGeneration = useRef(0), metricsPending = useRef(null), currentDays = useRef(filters.staleDays);
  currentDays.current = filters.staleDays;
  useEffect(() => () => { metricsGeneration.current++; }, []);

  const loadMetrics = useCallback(async () => {
    const days = filters.staleDays;
    if (metricsPending.current?.days === days) return;
    const request = ++metricsGeneration.current; metricsPending.current = {days, request};
    const current = () => metricsGeneration.current === request && currentDays.current === days;
    setLoading(true);
    setError("");
    try {
      const staleThreshold = new Date(Date.now() - filters.staleDays * 86400000).toISOString();

      const [
        queueByState, queueByStatus, queueByType,
        profilesByState,
        rewriteVerified, rewriteAdoptionOnly, rewriteEffectiveOnly,
        sourcesByClass, sourcesTotal, sourcesStale,
        gapsCount, blockedCount,
        monitorTotal, monitorEnabled, monitorReviewRequired, monitorFailed,
        rulesTotal, rulesApproved, rulesNeedsReview,
      ] = await Promise.all([
        staffEntities.SourceCollectionQueue.aggregate({ groupBy: "state", count: true }),
        staffEntities.SourceCollectionQueue.aggregate({ groupBy: "status", count: true }),
        staffEntities.SourceCollectionQueue.aggregate({ groupBy: "jurisdiction_type", count: true }),
        base44.entities.JurisdictionProfile.aggregate({ groupBy: "state", count: true }),
        base44.entities.JurisdictionProfile.count({ "rewrite_authority.adoptionStatus": "verified", "rewrite_authority.effectiveDateStatus": "verified" }),
        base44.entities.JurisdictionProfile.count({ "rewrite_authority.adoptionStatus": "verified" }),
        base44.entities.JurisdictionProfile.count({ "rewrite_authority.effectiveDateStatus": "verified" }),
        staffEntities.PermittingSourceDocument.aggregate({ groupBy: "authority_classification", count: true }),
        staffEntities.PermittingSourceDocument.count({}),
        staffEntities.PermittingSourceDocument.count({ last_checked: { $lt: staleThreshold } }),
        staffEntities.SourceCollectionQueue.count({ missing_next: { $exists: true } }),
        staffEntities.SourceCollectionQueue.count({ status: "blocked" }),
        staffEntities.SourceMonitorState.count({}),
        staffEntities.SourceMonitorState.count({ monitor_enabled: true }),
        staffEntities.SourceMonitorState.count({ staff_review_required: true }),
        staffEntities.SourceMonitorState.count({ failure_count: { $gte: 3 } }),
        staffEntities.PermittingRule.count({}),
        staffEntities.PermittingRule.count({ status: "staff_approved" }),
        staffEntities.PermittingRule.count({ status: "needs_review" }),
      ]);

      const queueByStateMap = {};
      for (const r of queueByState.rows || []) queueByStateMap[r.state] = r.count;
      const profilesByStateMap = {};
      for (const r of profilesByState.rows || []) profilesByStateMap[r.state] = r.count;
      const statusMap = {};
      for (const r of queueByStatus.rows || []) statusMap[r.status] = r.count;
      const typeMap = {};
      for (const r of queueByType.rows || []) typeMap[r.jurisdiction_type] = r.count;
      const classMap = {};
      for (const r of sourcesByClass.rows || []) classMap[r.authority_classification] = r.count;

      const totalQueue = Object.values(queueByStateMap).reduce((a, b) => a + b, 0);
      const totalProfiles = Object.values(profilesByStateMap).reduce((a, b) => a + b, 0);

      if (!current()) return;
      const approvalPct = rulesTotal ? Math.round((rulesApproved / rulesTotal) * 100) : 0;
      const today = new Date().toISOString().slice(0, 10);
      setHistory((cur) => {
        if (cur.some((h) => h.at === today)) return cur;
        const next = [...cur, { at: today, pct: approvalPct }].slice(-30);
        (async () => {
          try {
            const row = await loadSingleGlobalSetting({ entity: staffEntities.GlobalSettings, settingKey: "completenessHistory", label: "Completeness history" });
            await saveGlobalSettingValueIfUnchanged({
              entity: staffEntities.GlobalSettings, loadedRecord: row, settingKey: "completenessHistory",
              nextValue: { entries: next }, label: "Completeness history",
            });
          } catch { /* snapshot is best-effort */ }
        })();
        return next;
      });
      setMetrics({
        staleDays: days,
        queueByState: queueByStateMap,
        profilesByState: profilesByStateMap,
        statusMap,
        typeMap,
        classMap,
        totalQueue,
        totalProfiles,
        sourcesTotal,
        sourcesStale,
        rewriteVerified,
        rewriteAdoptionOnly,
        rewriteEffectiveOnly,
        gapsCount,
        blockedCount,
        staleThreshold,
        monitorTotal,
        monitorEnabled,
        monitorReviewRequired,
        monitorFailed,
        rulesTotal,
        rulesApproved,
        rulesNeedsReview,
      });
    } catch (e) {
      console.error("Completeness dashboard load error:", e);
      if (current()) { setMetrics(null); setError(e?.message || "Failed to load completeness metrics."); }
    } finally {
      if (current()) { metricsPending.current = null; setLoading(false); }
    }
  }, [filters.staleDays]);

  useEffect(() => { loadMetrics(); }, [loadMetrics]);

  const [counties, setCounties] = useState([]), [countyError, setCountyError] = useState("");
  const [countyAttempt, setCountyAttempt] = useState(0);
  useEffect(() => {
    let active = true; setCounties([]); setCountyError("");
    readAllCountyChoices(cursor => staffEntities.SourceCollectionQueue.filter(
      { state: { $in: ["OH", "KY"] }, parent_county_name: { $exists: true } },
      { distinct: "parent_county_name", limit: 500, ...(cursor ? { cursor } : {}) }
    ), () => active).then(values => { if (active) setCounties(values); })
      .catch(e => { if (active) setCountyError(e.message || "County choices unavailable."); });
    return () => { active = false; };
  }, [countyAttempt]);

  useEffect(() => {
    let alive = true;
    staffEntities.PermitLineItem.filter({}, { limit: 300 })
      .then((rows) => {
        if (!alive) return;
        setFollowUps((Array.isArray(rows) ? rows : [])
          .filter((r) => r.next_followup_date)
          .sort((a, b) => String(a.next_followup_date).localeCompare(String(b.next_followup_date))));
      })
      .catch(() => null);
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    base44.entities.JurisdictionProfile.filter({}, { limit: 300 })
      .then((rows) => {
        if (!alive) return;
        setOfficeContacts((Array.isArray(rows) ? rows : [])
          .filter((r) => r.contact_info?.phone || r.contact_info?.email || r.website_url || r.permit_requirements?.fee_range || r.permit_requirements?.processing_time)
          .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))));
      })
      .catch(() => null);
    return () => { alive = false; };
  }, []);

  if ((loading && !metrics) || (metrics && metrics.staleDays !== filters.staleDays)) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500 text-sm">Loading completeness metrics…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="clay-card p-4 border border-red-200 bg-red-50">
        <div className="flex items-center gap-2 text-red-700 text-sm font-medium">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
        <Button variant="outline" size="sm" className="mt-3" onClick={loadMetrics}>Retry</Button>
      </div>
    );
  }

  const m = metrics;
  const states = Object.keys(m.queueByState).sort();

  return (
    <div className="space-y-4">
      {followUps.length > 0 && (
        <div className="clay-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Layers className="w-4 h-4" /> Permit follow-ups
            <span className="text-xs font-normal text-gray-400">
              {followUps.filter((f) => f.next_followup_date < new Date().toISOString().slice(0, 10)).length} overdue
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {followUps.slice(0, 10).map((f) => {
              const overdue = f.next_followup_date < new Date().toISOString().slice(0, 10);
              return (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white/70 px-3 py-1.5 text-xs">
                  <span className="font-medium text-gray-800">{f.work_order_id
                    ? <a href={`/MainWorkflow?wo=${f.work_order_id}`} className="underline hover:text-indigo-800" title="Open this work order">{f.row_name || f.work_order_title || "Permit"}</a>
                    : (f.row_name || f.work_order_title || "Permit")}</span>
                  <span className="text-gray-500">{f.locality_name || ""}</span>
                  <span className={`font-medium ${overdue ? "text-red-600" : "text-gray-600"}`}>{overdue ? "overdue " : "due "}{f.next_followup_date}</span>
                  <Button type="button" size="sm" variant="ghost" disabled={taskBusy === f.id || taskDone.has(f.id)}
                    onClick={() => createFollowupTask(f)} className="h-6 px-1.5 text-[10px] text-indigo-600">
                    {taskDone.has(f.id) ? "Task created" : taskBusy === f.id ? "Creating…" : "Create task"}
                  </Button>
                </li>
              );
            })}
          </ul>
          {followUps.length > 10 && <p className="mt-1 text-xs text-gray-400">...and {followUps.length - 10} more</p>}
        </div>
      )}

      {officeContacts.length > 0 && (
        <div className="clay-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Layers className="w-4 h-4" /> Office contacts
            <span className="text-xs font-normal text-gray-400">{officeContacts.length} jurisdiction{officeContacts.length === 1 ? "" : "s"} with contact info</span>
          </div>
          <ul className="mt-2 grid grid-cols-1 gap-1 md:grid-cols-2">
            {officeContacts.map((r) => (
              <li key={r.id} className="rounded-lg border border-gray-200 bg-white/70 px-3 py-1.5 text-xs">
                <span className="font-medium text-gray-800">{r.name || r.jurisdiction_name || "Office"}</span>
                {r.contact_info?.department && <span className="text-gray-500"> · {r.contact_info.department}</span>}
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-gray-500">
                  {r.contact_info?.phone && <span>{r.contact_info.phone}</span>}
                  {r.contact_info?.email && <span className="truncate">{r.contact_info.email}</span>}
                  {r.website_url && <span className="truncate text-sky-600">{r.website_url}</span>}
                </div>
                {(r.permit_requirements?.fee_range || r.permit_requirements?.processing_time) && (
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-gray-400">
                    {r.permit_requirements?.fee_range && <span>fees {r.permit_requirements.fee_range}</span>}
                    {r.permit_requirements?.processing_time && <span>~{r.permit_requirements.processing_time} processing</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Filter bar */}
      <div className="clay-card p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-700">
          <Layers className="w-4 h-4" /> Filters
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs text-gray-500">State</Label>
            <Select value={filters.state} onValueChange={(v) => setFilters(f => ({ ...f, state: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                {states.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Jurisdiction type</Label>
            <Select value={filters.jurisdiction_type} onValueChange={(v) => setFilters(f => ({ ...f, jurisdiction_type: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="county">County</SelectItem>
                <SelectItem value="city">City</SelectItem>
                <SelectItem value="village">Village</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Collection status</Label>
            <Select value={filters.status} onValueChange={(v) => setFilters(f => ({ ...f, status: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Parent county</Label>
            <Select value={filters.parent_county_name} onValueChange={(v) => setFilters(f => ({ ...f, parent_county_name: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All counties</SelectItem>
                {counties.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Stale threshold</Label>
            <Select value={String(filters.staleDays)} onValueChange={(v) => setFilters(f => ({ ...f, staleDays: Number(v) }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STALE_DAYS_OPTIONS.map(d => <SelectItem key={d} value={String(d)}>{d} days</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {countyError && <div role="alert" className="text-red-700">County filter unavailable: {countyError} <Button variant="outline" onClick={() => setCountyAttempt(value => value + 1)}>Retry county choices</Button></div>}
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Database} label="Recorded queue rows" value={m.totalQueue} accent="#D4E9F7" />
        <StatCard icon={MapPin} label="Jurisdiction profiles created" value={m.totalProfiles} sub="Record count; identity coverage checked below" accent="#C8F4E9" />
        <StatCard icon={FileText} label="Sources archived" value={m.sourcesTotal} sub={`${m.sourcesStale} stale (> ${filters.staleDays}d)`} accent="#FFE4D6" />
        <StatCard icon={ShieldCheck} label="Rewrite authority verified" value={m.rewriteVerified} sub={`${m.rewriteAdoptionOnly} adoption · ${m.rewriteEffectiveOnly} effective`} accent="#FFD6E8" />
      </div>

      <PermittingRecordedCoverage />

      {/* Queue vs Profiles by State */}
      <Section title="Queue vs. profiles by state" icon={MapPin} defaultOpen badge={`${states.length} states`}>
        <div className="space-y-3 pt-3">
          {states.map(s => {
            const q = m.queueByState[s] || 0;
            const p = m.profilesByState[s] || 0;
            return (
              <div key={s}>
                <Row label={s} value={`${p} / ${q} profiles`} />
                <p className="text-xs text-gray-500">Record counts only; not matched locality coverage.</p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Collection status distribution */}
      <Section title="Collection status distribution" icon={Database} badge={`${m.totalQueue} rows`}>
        <div className="space-y-1 pt-3">
          {STATUS_OPTIONS.map(s => {
            const count = m.statusMap[s] || 0;
            if (count === 0) return null;
            return <Row key={s} label={s.replace(/_/g, " ")} value={count} />;
          })}
          {Object.values(m.statusMap).every(v => v === 0) && (
            <p className="text-sm text-gray-400 py-2">No status data.</p>
          )}
        </div>
      </Section>

      {/* Authority mapping */}
      <Section title="Authority mapping (rewrite verification)" icon={ShieldCheck}>
        <div className="space-y-1 pt-3">
          <Row label="Adoption + effective both verified" value={m.rewriteVerified} />
          <Row label="Adoption verified (any effective)" value={m.rewriteAdoptionOnly} />
          <Row label="Effective verified (any adoption)" value={m.rewriteEffectiveOnly} />
          <Row label="Profiles without verified rewrite authority" value={Math.max(0, m.totalProfiles - m.rewriteVerified)} />
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Drafts never become authoritative. Verified means staff reviewed official adoption and effective-date evidence for that jurisdiction.
        </p>
      </Section>

      {/* Sources archived + classification */}
      <Section title="Sources archived & classification" icon={FileCheck2} badge={m.sourcesTotal}>
        <div className="space-y-1 pt-3">
          {Object.entries(m.classMap).sort((a, b) => b[1] - a[1]).map(([cls, count]) => (
            <Row key={cls} label={cls.replace(/_/g, " ")} value={count} />
          ))}
          {Object.keys(m.classMap).length === 0 && <p className="text-sm text-gray-400 py-2">No sources archived yet.</p>}
        </div>
      </Section>

      {/* Gaps & blocked */}
      <Section title="Explicit gaps & blocked sources" icon={AlertTriangle} badge={`${m.gapsCount} gaps · ${m.blockedCount} blocked`}>
        <div className="space-y-1 pt-3">
          <Row label="Queue rows with missing_next recorded" value={m.gapsCount} />
          <Row label="Queue rows blocked" value={m.blockedCount} />
        </div>
        <p className="text-xs text-gray-400 mt-3">
          See the queue browse view below for per-locality missing_next detail.
        </p>
      </Section>

      {/* Stale sources */}
      <Section title="Stale sources" icon={Clock} badge={`${m.sourcesStale} > ${filters.staleDays}d`}>
        <div className="space-y-1 pt-3">
          <Row label={`Sources not checked in ${filters.staleDays}+ days`} value={m.sourcesStale} />
          <Row label="Total sources archived" value={m.sourcesTotal} />
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Adjust the stale threshold in the filter bar. Re-checking is a later-phase action.
        </p>
      </Section>

      {/* Source monitor health */}
      <Section title="Source monitor health" icon={Activity} badge={`${m.monitorEnabled} active`}>
        <div className="space-y-1 pt-3">
          <Row label="Monitored sources (enabled)" value={m.monitorEnabled} />
          <Row label="Total monitor rows" value={m.monitorTotal} />
          <Row label="Sources needing staff review" value={m.monitorReviewRequired} />
          <Row label="Sources unavailable (3+ failures)" value={m.monitorFailed} />
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Cheap programmatic checks run daily. AI is only invoked when a source hash changes.
          Broken sources never erase previously verified data.
        </p>
      </Section>

      {/* Rules extracted & approved */}
      {history.length > 1 && (
        <div className="rounded-xl border border-gray-200 bg-white/70 p-3" aria-label="Approval trend">
          <p className="text-xs font-semibold text-gray-700">Rule-approval trend</p>
          <div className="mt-1 flex items-end gap-0.5" style={{ height: 28 }}>
            {history.map((h) => (
              <div key={h.at} title={`${h.at}: ${h.pct}% approved`}
                className={`w-2 rounded-sm ${h.pct >= 80 ? "bg-emerald-400" : h.pct >= 50 ? "bg-amber-400" : "bg-red-300"}`}
                style={{ height: `${Math.max(8, h.pct)}%` }} />
            ))}
          </div>
          <p className="mt-0.5 text-[10px] text-gray-400">Approved-rule share, one point per day · {history[0].at} → {history[history.length - 1].at}</p>
        </div>
      )}

      <Section title="Permitting rules extracted" icon={FileCheck2} badge={m.rulesTotal}>
        <div className="space-y-1 pt-3">
          <Row label="Total rules extracted" value={m.rulesTotal} />
          <Row label="Staff approved (operational)" value={m.rulesApproved} />
          <Row label="Needs review" value={m.rulesNeedsReview} />
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Every rule carries at least one citation. Only staff-approved rules from current-adopted
          sources are operational. Source changes flag affected rules for re-review.
        </p>
      </Section>

      {/* Queue admin browse */}
      <Section title="Queue admin browse" icon={Search} defaultOpen>
        <div className="pt-3 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search jurisdiction name…"
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => loadMetrics()} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>
          {queueError && <p role="alert" className="text-red-700">{queueError}</p>}
          <Button variant="outline" size="sm" onClick={() => loadQueue(true)} disabled={loadingQueue}>Refresh queue</Button>
          {loadingQueue && queuePage.items.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          ) : queuePage.items.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">{queueError ? "Queue results unavailable. Refresh to retry." : "No queue rows match the current filters."}</p>
          ) : (
            <div className="space-y-2">
              {queuePage.items.map((row) => (
                <div key={row.id} className="border border-gray-100 rounded-lg p-3 bg-white">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="secondary" className="text-[10px] capitalize whitespace-nowrap">
                        {row.jurisdiction_type || "—"}
                      </Badge>
                      <span className="font-medium text-gray-800 text-sm truncate">{row.jurisdiction_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400 whitespace-nowrap">
                      <span>{row.state}</span>
                      {row.parent_county_name && <span>· {row.parent_county_name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge
                      className="text-[10px]"
                      style={{
                        background: row.status === "verified_current" ? "#C8F4E9"
                          : row.status === "blocked" ? "#FFE4D6"
                          : row.status === "not_started" ? "#F1F5F9" : "#FEF3C7",
                        color: "#374151",
                      }}
                    >
                      {(row.status || "not_started").replace(/_/g, " ")}
                    </Badge>
                    {row.missing_next && (
                      <span className="text-xs text-gray-500 truncate">
                        Next: {row.missing_next}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {queuePage.has_more && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => loadQueue(false)} disabled={loadingQueue}>
                  {loadingQueue ? <Loader2 className="w-4 h-4 animate-spin" /> : "Load more"}
                </Button>
              )}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}