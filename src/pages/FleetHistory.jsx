import { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import FleetModuleNav from "@/components/fleet/FleetModuleNav";
import { listAllFleetRows } from "@/components/fleet/fleetEntityLoaders";
import { Activity, AlertTriangle, Bug, CheckCircle2, ExternalLink, FileText, History, Lightbulb, Loader2, Paperclip, Plus, RefreshCw, Search, Upload, Wrench, X } from "lucide-react";

const LOG_PAGE_SIZE = 200;
const REPORT_TYPES = [
  { value: "bug_report", label: "Bug Report", icon: Bug },
  { value: "feature_request", label: "Feature Request", icon: Lightbulb },
  { value: "change_request", label: "Change Request", icon: Wrench },
];
const REPORT_STATUSES = ["new", "in_review", "in_progress", "completed", "declined"];
const pretty = (value) => String(value || "—").replaceAll("_", " ");

export default function FleetHistory() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("logs");
  const [logs, setLogs] = useState([]);
  const [logHasMore, setLogHasMore] = useState(false);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [logLevel, setLogLevel] = useState("all");
  const [reportStatus, setReportStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", type: "bug_report", priority: "medium", attachment_urls: [] });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const currentUser = await base44.auth.me().catch(() => null);
      setUser(currentUser);
      if (currentUser?.role !== "admin") return;
      const [reportRows, logRows] = await Promise.all([
        listAllFleetRows(base44.entities.FleetSystemReport, "-created_date", { label: "Fleet system reports" }),
        base44.entities.FleetSystemLog.list("-created_date", LOG_PAGE_SIZE + 1, 0),
      ]);
      setReports(reportRows || []);
      setLogs((logRows || []).slice(0, LOG_PAGE_SIZE));
      setLogHasMore((logRows || []).length > LOG_PAGE_SIZE);
    } catch (e) {
      setError(e?.message || "Unable to load Fleet history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadMoreLogs = async () => {
    setLoadingMore(true);
    setError("");
    try {
      const next = await base44.entities.FleetSystemLog.list("-created_date", LOG_PAGE_SIZE + 1, logs.length);
      setLogs(current => [...current, ...(next || []).slice(0, LOG_PAGE_SIZE)]);
      setLogHasMore((next || []).length > LOG_PAGE_SIZE);
    } catch (e) {
      setError(e?.message || "Unable to load more Fleet logs.");
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter(row => {
      if (logLevel !== "all" && row.level !== logLevel) return false;
      if (!q) return true;
      return [row.source, row.level, row.message, JSON.stringify(row.details || {})].some(value => String(value || "").toLowerCase().includes(q));
    });
  }, [logs, search, logLevel]);

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter(row => {
      if (reportStatus !== "all" && row.status !== reportStatus) return false;
      if (!q) return true;
      return [row.title, row.description, row.type, row.priority, row.status, row.submitted_by_name, row.submitted_by_email].some(value => String(value || "").toLowerCase().includes(q));
    });
  }, [reports, search, reportStatus]);

  const uploadAttachments = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const remaining = 5 - form.attachment_urls.length;
    if (remaining <= 0) { setError("Fleet feedback supports up to 5 attachments."); return; }
    const selected = files.slice(0, remaining);
    const oversized = selected.find(file => file.size > 10 * 1024 * 1024);
    if (oversized) { setError(`${oversized.name} is larger than the 10 MB attachment limit.`); return; }
    setUploading(true);
    setError("");
    try {
      const uploaded = await Promise.all(selected.map(file => base44.integrations.Core.UploadFile({ file })));
      const urls = uploaded.map(result => result?.file_url).filter(Boolean);
      setForm(current => ({ ...current, attachment_urls: [...current.attachment_urls, ...urls].slice(0, 5) }));
    } catch (e) {
      setError(e?.message || "Unable to upload Fleet feedback attachment.");
    } finally {
      setUploading(false);
    }
  };

  const submitReport = async (event) => {
    event.preventDefault();
    const title = form.title.trim();
    const description = form.description.trim();
    if (!title || !description) { setError("Title and description are required."); return; }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const created = await base44.entities.FleetSystemReport.create({
        title,
        description,
        type: form.type,
        priority: form.priority,
        status: "new",
        submitted_by_email: user.email,
        submitted_by_name: user.full_name || user.name || user.email,
        attachment_urls: form.attachment_urls,
      });
      let notificationWarning = "";
      try {
        const response = await base44.functions.invoke("fleetNotificationDispatcher", { event_type: "system_report_created", target_id: created.id, event_token: `created:${created.id}` });
        if (response?.data?.error) notificationWarning = response.data.error;
      } catch (e) {
        notificationWarning = e?.message || "Notification queue invocation failed.";
      }
      setReports(current => [created, ...current]);
      setForm({ title: "", description: "", type: "bug_report", priority: "medium", attachment_urls: [] });
      setShowForm(false);
      setTab("feedback");
      setNotice(notificationWarning ? `Feedback saved. Notification warning: ${notificationWarning}` : "Fleet feedback saved and notification processing queued.");
    } catch (e) {
      setError(e?.message || "Unable to save Fleet feedback.");
    } finally {
      setSaving(false);
    }
  };

  const changeReportStatus = async (report, status) => {
    if (!REPORT_STATUSES.includes(status)) return;
    setError("");
    try {
      const updated = await base44.entities.FleetSystemReport.update(report.id, { status });
      setReports(current => current.map(row => row.id === report.id ? updated : row));
    } catch (e) {
      setError(e?.message || "Unable to update Fleet feedback status.");
    }
  };

  if (loading) return <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-950"><FleetModuleNav/><div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400"/></div></div>;
  if (user?.role !== "admin") return <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav/><div className="max-w-3xl mx-auto p-6"><div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-5 text-amber-800 dark:text-amber-200"><div className="font-semibold">Admin access required</div><p className="text-sm mt-1">Fleet logs and system feedback are restricted to CCS administrators.</p></div></div></div>;

  const levelCounts = { error: logs.filter(row => row.level === "error").length, warning: logs.filter(row => row.level === "warning").length };
  const openReports = reports.filter(row => !["completed", "declined"].includes(row.status)).length;

  return <div className="min-h-full bg-gray-50 dark:bg-slate-950"><FleetModuleNav/><div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2"><History className="w-6 h-6"/>Fleet History & Feedback</h1><p className="text-sm text-gray-500 dark:text-slate-400">Fleet-only automation/system logs plus the migrated FleetMaster bug, feature, and change-request workflow.</p></div><div className="flex gap-2"><button onClick={load} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700 text-sm inline-flex items-center gap-2"><RefreshCw className="w-4 h-4"/>Refresh</button><button onClick={()=>{setTab("feedback");setShowForm(true);}} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium inline-flex items-center gap-2"><Plus className="w-4 h-4"/>New Feedback</button></div></div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><Metric label="Loaded log rows" value={logs.length} icon={Activity}/><Metric label="Errors loaded" value={levelCounts.error} icon={AlertTriangle} attention={levelCounts.error>0}/><Metric label="Warnings loaded" value={levelCounts.warning} icon={AlertTriangle} attention={levelCounts.warning>0}/><Metric label="Open feedback" value={openReports} icon={FileText} attention={openReports>0}/></div>

    {error&&<div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}
    {notice&&<div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 px-4 py-3 text-sm">{notice}</div>}

    <div className="flex flex-col md:flex-row gap-3 md:items-center"><div className="inline-flex rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1"><TabButton active={tab==="logs"} onClick={()=>setTab("logs")} icon={Activity}>System Logs</TabButton><TabButton active={tab==="feedback"} onClick={()=>setTab("feedback")} icon={FileText}>Feedback</TabButton></div><div className="relative flex-1"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={tab==="logs"?"Search logs, source, details...":"Search feedback..."} className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"/></div>{tab==="logs"?<select value={logLevel} onChange={e=>setLogLevel(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"><option value="all">All levels</option><option value="error">Errors</option><option value="warning">Warnings</option><option value="info">Info</option></select>:<select value={reportStatus} onChange={e=>setReportStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700"><option value="all">All statuses</option>{REPORT_STATUSES.map(status=><option key={status} value={status}>{pretty(status)}</option>)}</select>}</div>

    {showForm&&<form onSubmit={submitReport} className="rounded-xl border border-indigo-200 bg-white dark:bg-slate-900 dark:border-indigo-900 p-4 shadow-sm space-y-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-gray-900 dark:text-slate-100">Submit Fleet Feedback</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Creates a FleetSystemReport and uses the durable Fleet notification queue for configured report recipients.</p></div><button type="button" onClick={()=>setShowForm(false)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-800"><X className="w-4 h-4"/></button></div><div className="grid md:grid-cols-2 gap-3"><label className="text-sm">Type<select value={form.type} onChange={e=>setForm(current=>({...current,type:e.target.value}))} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-950 dark:border-slate-700">{REPORT_TYPES.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}</select></label><label className="text-sm">Priority<select value={form.priority} onChange={e=>setForm(current=>({...current,priority:e.target.value}))} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-950 dark:border-slate-700"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div><label className="block text-sm">Title<input value={form.title} onChange={e=>setForm(current=>({...current,title:e.target.value}))} maxLength={200} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-950 dark:border-slate-700"/></label><label className="block text-sm">Description<textarea value={form.description} onChange={e=>setForm(current=>({...current,description:e.target.value}))} rows={5} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-950 dark:border-slate-700 resize-y"/></label><div><label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-700 cursor-pointer text-sm"><Upload className="w-4 h-4"/>{uploading?"Uploading…":"Add attachments"}<input type="file" multiple className="hidden" onChange={uploadAttachments} disabled={uploading||form.attachment_urls.length>=5}/></label><span className="ml-2 text-xs text-gray-400">Up to 5 files · 10 MB each</span>{form.attachment_urls.length>0&&<div className="mt-2 flex flex-wrap gap-2">{form.attachment_urls.map((url,index)=><span key={`${url}-${index}`} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-slate-800 text-xs"><Paperclip className="w-3 h-3"/>Attachment {index+1}<button type="button" onClick={()=>setForm(current=>({...current,attachment_urls:current.attachment_urls.filter((_,i)=>i!==index)}))}><X className="w-3 h-3"/></button></span>)}</div>}</div><div className="flex justify-end"><button type="submit" disabled={saving||uploading} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium inline-flex items-center gap-2 disabled:opacity-50">{saving?<Loader2 className="w-4 h-4 animate-spin"/>:<Plus className="w-4 h-4"/>}Submit Feedback</button></div></form>}

    {tab==="logs"?<div className="space-y-3">{filteredLogs.map(row=><div key={row.id} className={`rounded-xl border bg-white dark:bg-slate-900 p-4 ${row.level==="error"?"border-red-200 dark:border-red-900":row.level==="warning"?"border-amber-200 dark:border-amber-900":"border-gray-200 dark:border-slate-800"}`}><div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-gray-900 dark:text-slate-100">{row.source}</span><LevelBadge level={row.level}/></div><div className="text-sm text-gray-700 dark:text-slate-300 mt-1">{row.message}</div></div><div className="text-xs text-gray-400 whitespace-nowrap">{new Date(row.created_date).toLocaleString()}</div></div>{row.details&&Object.keys(row.details).length>0&&<pre className="mt-3 text-xs whitespace-pre-wrap break-words rounded-lg bg-gray-50 dark:bg-slate-950 p-3 text-gray-600 dark:text-slate-300 overflow-x-auto">{JSON.stringify(row.details,null,2)}</pre>}</div>)}{filteredLogs.length===0&&<Empty text="No Fleet logs match this filter."/>}{logHasMore&&<div className="text-center"><button onClick={loadMoreLogs} disabled={loadingMore} className="px-4 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-900 dark:border-slate-700 text-sm inline-flex items-center gap-2 disabled:opacity-50">{loadingMore?<Loader2 className="w-4 h-4 animate-spin"/>:<Plus className="w-4 h-4"/>}Load 200 more logs</button></div>}</div>:<div className="space-y-3">{filteredReports.map(report=>{const TypeIcon=REPORT_TYPES.find(type=>type.value===report.type)?.icon||FileText;return <div key={report.id} className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 p-4 shadow-sm"><div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3"><div className="flex gap-3"><TypeIcon className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0"/><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-gray-900 dark:text-slate-100">{report.title}</h2><span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800 capitalize">{pretty(report.type)}</span><span className={`text-xs font-medium capitalize ${report.priority==="high"?"text-red-600 dark:text-red-300":report.priority==="medium"?"text-amber-700 dark:text-amber-300":"text-gray-500"}`}>{report.priority} priority</span></div><div className="text-xs text-gray-400 mt-1">Submitted {new Date(report.created_date).toLocaleString()} by {report.submitted_by_name||report.submitted_by_email}</div></div></div><select value={report.status||"new"} onChange={e=>changeReportStatus(report,e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white dark:bg-slate-950 dark:border-slate-700 text-sm capitalize">{REPORT_STATUSES.map(status=><option key={status} value={status}>{pretty(status)}</option>)}</select></div><div className="mt-3 text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{report.description}</div>{report.attachment_urls?.length>0&&<div className="mt-3 flex flex-wrap gap-2">{report.attachment_urls.map((url,index)=><a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 dark:border-slate-700 text-xs text-indigo-600 dark:text-indigo-300"><Paperclip className="w-3 h-3"/>Attachment {index+1}<ExternalLink className="w-3 h-3"/></a>)}</div>}</div>})}{filteredReports.length===0&&<Empty text="No Fleet feedback reports match this filter."/>}</div>}
  </div></div>;
}

function TabButton({active,onClick,icon:Icon,children}){return <button type="button" onClick={onClick} className={`px-3 py-1.5 rounded-md text-sm inline-flex items-center gap-1.5 ${active?"bg-indigo-600 text-white":"text-gray-600 dark:text-slate-300"}`}><Icon className="w-4 h-4"/>{children}</button>}
function Metric({label,value,icon:Icon,attention=false}){return <div className={`rounded-xl border p-3 ${attention?"border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20":"border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}><div className="flex items-center justify-between gap-2"><span className="text-xs text-gray-400">{label}</span><Icon className="w-4 h-4 text-gray-400"/></div><div className={`text-2xl font-bold mt-1 ${attention?"text-amber-700 dark:text-amber-300":"text-gray-900 dark:text-slate-100"}`}>{value}</div></div>}
function LevelBadge({level}){const style=level==="error"?"bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300":level==="warning"?"bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300":"bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";return <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${style}`}>{level}</span>}
function Empty({text}){return <div className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 py-12 text-center text-gray-500"><CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-gray-300"/>{text}</div>}
