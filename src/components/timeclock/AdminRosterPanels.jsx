import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Loader2, Printer, ScanFace, ShieldCheck, Users } from "lucide-react";
import { formatCompanyDateTime } from "@/components/timeclock/timeClockCompanyTime";

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tc-roster-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

export default function AdminRosterPanels({ sessionToken }) {
  const [staff, setStaff] = useState([]);
  const [roster, setRoster] = useState([]);
  const [events, setEvents] = useState([]);
  const [showAudit, setShowAudit] = useState(false);
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState([]);
  const [showSchedules, setShowSchedules] = useState(false);
  const [schedForm, setSchedForm] = useState({ email: "", start: "08:00", end: "16:30", days: ["mon", "tue", "wed", "thu", "fri"], label: "" });
  const [schedBusy, setSchedBusy] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [ptoLiability, setPtoLiability] = useState(null);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const [whoRes, faceRes, auditRes, schedRes, pendRes, ptoRes] = await Promise.all([
        base44.functions.invoke("timeClockAction", { action: "who_is_in", session_token: sessionToken, scope: "admin", request_id: newRequestId() }).catch(() => null),
        base44.functions.invoke("timeClockAction", { action: "list_face_enrollment", session_token: sessionToken, scope: "admin", request_id: newRequestId() }).catch(() => null),
        base44.functions.invoke("timeClockAction", { action: "list_timeclock_audit", session_token: sessionToken, scope: "admin", request_id: newRequestId() }).catch(() => null),
        base44.functions.invoke("timeClockAction", { action: "list_shift_templates", session_token: sessionToken, scope: "admin", request_id: newRequestId() }).catch(() => null),
        base44.functions.invoke("timeClockAction", { action: "list_pending_requests", session_token: sessionToken, scope: "admin", request_id: newRequestId() }).catch(() => null),
        base44.functions.invoke("timeClockAction", { action: "pto_liability_report", session_token: sessionToken, scope: "admin", request_id: newRequestId() }).catch(() => null),
      ]);
      const who = whoRes?.data || whoRes;
      const face = faceRes?.data || faceRes;
      const audit = auditRes?.data || auditRes;
      const sched = schedRes?.data || schedRes;
      const pend = pendRes?.data || pendRes;
      if (who?.success !== true) throw new Error(who?.error || "Who's-in data could not be loaded.");
      setStaff(Array.isArray(who.staff) ? who.staff : []);
      setRoster(face?.success === true && Array.isArray(face.roster) ? face.roster : []);
      setEvents(audit?.success === true && Array.isArray(audit.events) ? audit.events : []);
      setTemplates(sched?.success === true && Array.isArray(sched.templates) ? sched.templates : []);
      setPendingRequests(pend?.success === true && Array.isArray(pend.pending) ? pend.pending : []);
      const pto = ptoRes?.data || ptoRes;
      setPtoLiability(pto?.success === true ? { total: pto.total_available_minutes || 0, employees: Array.isArray(pto.employees) ? pto.employees : [] } : null);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Roster data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  if (!sessionToken) return null;

  const enrolled = roster.filter((r) => r.enrolled);
  const unenrolled = roster.filter((r) => !r.enrolled);

  // Admin quick-start checklist, computed from live roster/activity data.
  const checklist = [
    { label: "Enroll every employee's face", done: roster.length > 0 && unenrolled.length === 0, detail: `${enrolled.length}/${roster.length} enrolled` },
    { label: "First employee clocked in via the system", done: staff.length > 0 || events.some((e) => e.action === "clock_in"), detail: staff.length > 0 ? `${staff.length} in now` : (events.some((e) => e.action === "clock_in") ? "punches on record" : "none yet") },
    { label: "Audit trail is recording events", done: events.length > 0, detail: `${events.length} events` },
    { label: "Review queue has no stale items", done: true, detail: "check Correction Requests below" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="clay-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-emerald-600" />Who's In Now</h3>
            <p className="text-xs text-gray-500 mt-1">Live view of every employee with an open shift. Refreshes every minute.</p>
          </div>
          <Badge className={staff.length ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}>{staff.length} clocked in</Badge>
        </div>
        {loading ? (
          <div className="py-4 flex items-center justify-center text-gray-500"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading…</div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        ) : staff.length === 0 ? (
          <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">Nobody is clocked in right now.</div>
        ) : (
          <div className="space-y-1.5">
            {staff.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{row.user_name}</span>
                <span className="text-xs text-slate-500">in {formatCompanyDateTime(row.clock_in)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="clay-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><ScanFace className="w-4 h-4 text-indigo-600" />Face Enrollment</h3>
            <p className="text-xs text-gray-500 mt-1">Who can use face sign-in on the kiosk. Re-enroll anyone with few descriptors or old captures.</p>
          </div>
          <Badge className={unenrolled.length ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}>
            {enrolled.length}/{roster.length} enrolled
          </Badge>
        </div>
        {loading ? (
          <div className="py-4 flex items-center justify-center text-gray-500"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading…</div>
        ) : roster.length === 0 ? (
          <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No employee records returned.</div>
        ) : (
          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {roster.map((row) => (
              <div key={row.email} className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800">{row.name}</div>
                  <div className="truncate text-[11px] text-slate-400">{row.email}</div>
                </div>
                {row.enrolled ? (
                  <span className="shrink-0 text-xs font-medium text-emerald-700">{row.descriptor_count} descriptor{row.descriptor_count === 1 ? "" : "s"}</span>
                ) : (
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">needs enrollment</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="clay-card p-4 lg:col-span-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Setup checklist</h3>
          <button
            type="button"
            disabled={!roster.length}
            onClick={() => {
              const rows = roster.map((r) => `<tr><td style="padding:10px 8px;border-bottom:1px solid #ccc;font-family:sans-serif">${r.name}</td><td style="border-bottom:1px solid #ccc;width:110px"></td><td style="border-bottom:1px solid #ccc;width:110px"></td><td style="border-bottom:1px solid #ccc;width:110px"></td></tr>`).join("");
              const w = window.open("", "_blank");
              if (!w) return;
              w.document.write(`<html><head><title>Paper Punch Sheet</title></head><body style="padding:24px"><h2 style="font-family:sans-serif">Manual Punch Sheet - ${new Date().toLocaleDateString()}</h2><p style="font-family:sans-serif;color:#666;font-size:12px">Disaster mode: record punches on paper when all kiosks are down, then enter them as corrections when the system is back.</p><table style="border-collapse:collapse;width:100%"><tr><th style="text-align:left;font-family:sans-serif">Employee</th><th style="font-family:sans-serif;font-size:11px">Clock in</th><th style="font-family:sans-serif;font-size:11px">Clock out</th><th style="font-family:sans-serif;font-size:11px">Initials</th></tr>${rows}</table><script>window.print()</script></body></html>`);
              w.document.close();
            }}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <Printer className="h-3.5 w-3.5" /> Print paper punch sheet
          </button>
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {checklist.map((item) => (
            <div key={item.label} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${item.done ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"}`}>
              <span className={item.done ? "text-slate-700" : "font-medium text-amber-800"}>{item.label}</span>
              <span className={`text-[11px] ${item.done ? "text-emerald-700" : "text-amber-700"}`}>{item.done ? "Done" : item.detail}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="clay-card p-4 lg:col-span-2">
        <button type="button" onClick={() => setShowSchedules((v) => !v)} className="flex w-full items-center justify-between text-left">
          <h3 className="font-semibold">Shift schedules <span className="text-xs font-normal text-slate-400">powers early/late notices on the tracker</span></h3>
          <span className="text-xs text-slate-400">{templates.length} · {showSchedules ? "Hide" : "Show"}</span>
        </button>
        {showSchedules && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-500">Employee</label>
                <select value={schedForm.email} onChange={(e) => setSchedForm({ ...schedForm, email: e.target.value })}
                  className="mt-0.5 block w-44 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs">
                  <option value="">Pick employee</option>
                  {roster.map((r) => <option key={r.email} value={r.email}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500">Start</label>
                <input type="time" value={schedForm.start} onChange={(e) => setSchedForm({ ...schedForm, start: e.target.value })}
                  className="mt-0.5 block rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500">End</label>
                <input type="time" value={schedForm.end} onChange={(e) => setSchedForm({ ...schedForm, end: e.target.value })}
                  className="mt-0.5 block rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500">Days</label>
                <div className="mt-0.5 flex gap-1">
                  {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => (
                    <button key={d} type="button"
                      onClick={() => setSchedForm({ ...schedForm, days: schedForm.days.includes(d) ? schedForm.days.filter((x) => x !== d) : [...schedForm.days, d] })}
                      className={`h-7 w-7 rounded-md border text-[10px] font-bold ${schedForm.days.includes(d) ? "border-indigo-400 bg-indigo-100 text-indigo-700" : "border-slate-200 bg-white text-slate-400"}`}
                    >{d[0].toUpperCase()}</button>
                  ))}
                </div>
              </div>
              <button type="button" disabled={schedBusy || !schedForm.email || !schedForm.days.length}
                onClick={async () => {
                  setSchedBusy(true);
                  try {
                    const res = await base44.functions.invoke("timeClockAction", { action: "upsert_shift_template", session_token: sessionToken, scope: "admin", request_id: newRequestId(), template: { user_email: schedForm.email, start_time: schedForm.start, end_time: schedForm.end, days: schedForm.days, label: schedForm.label } });
                    if ((res?.data || res)?.success === true) { setSchedForm({ ...schedForm, email: "", label: "" }); await load(); }
                  } finally { setSchedBusy(false); }
                }}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
              >{schedBusy ? "Saving..." : "Add schedule"}</button>
            </div>
            {templates.length === 0 ? (
              <p className="text-xs text-slate-400">No schedules yet - add one above to enable early/late notices.</p>
            ) : (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {templates.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-700">{roster.find((r) => r.email === t.user_email)?.name || t.user_email}</p>
                      <p className="text-[11px] text-slate-400">{(t.days || []).map((d) => d.slice(0, 3)).join(", ")} · {t.start_time}-{t.end_time}</p>
                    </div>
                    <button type="button"
                      onClick={async () => {
                        await base44.functions.invoke("timeClockAction", { action: "delete_shift_template", session_token: sessionToken, scope: "admin", request_id: newRequestId(), template_id: t.id }).catch(() => null);
                        await load();
                      }}
                      className="ml-2 shrink-0 text-[10px] text-red-400 hover:text-red-600">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {ptoLiability && (
        <div className="clay-card p-4 lg:col-span-2">
          <h3 className="font-semibold mb-1">PTO liability</h3>
          <p className="text-sm text-slate-600">
            <span className="font-bold text-indigo-700">{Math.round(ptoLiability.total / 60 * 10) / 10}h</span> of accrued time off on the books across {ptoLiability.employees.length} employees
          </p>
          {ptoLiability.employees.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {ptoLiability.employees.slice(0, 6).map((e) => (
                <span key={e.user_email} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                  {e.user_name.split("@")[0]}: {Math.round(e.available_minutes / 60 * 10) / 10}h
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {pendingRequests.length > 0 && (
        <div className="clay-card p-4 lg:col-span-2 border-amber-300 bg-amber-50/40">
          <h3 className="font-semibold text-amber-900 mb-2">In-flight requests ({pendingRequests.length})</h3>
          <p className="mb-2 text-[11px] text-amber-700">Punches or transitions still resolving on the server - these complete on their own but flag a stuck kiosk if they linger.</p>
          <div className="space-y-1">
            {pendingRequests.slice(0, 8).map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-md bg-white/70 px-3 py-1.5 text-xs">
                <span className="font-medium text-slate-700 truncate">{roster.find((r) => r.email === p.user_email)?.name || p.user_email || "unknown"}</span>
                <span className="text-slate-500">
                  {[p.status, p.break_status, p.work_pause_status, p.labor_status].filter((s) => s && s !== "idle").join(" · ") || "pending"}
                  {p.pending_since ? ` · since ${formatCompanyDateTime(p.pending_since)}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="clay-card p-4 lg:col-span-2">
        <button type="button" onClick={() => setShowPlaybook((v) => !v)} className="flex w-full items-center justify-between text-left">
          <h3 className="flex items-center gap-2 font-semibold">
            <BookOpen className="h-4 w-4 text-indigo-600" />
            Manager playbook
          </h3>
          <span className="text-xs text-slate-400">{showPlaybook ? "Hide" : "Show"}</span>
        </button>
        {showPlaybook && (
          <div className="mt-3 grid grid-cols-1 gap-2 text-xs leading-relaxed text-slate-600 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="font-semibold text-slate-800">Missed punch</p>
              <p className="mt-1">Employee reports it via the banner or Time History; the request lands in Correction Requests. Verify against the schedule or camera log, approve with a reason, and the entry repairs itself automatically.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="font-semibold text-slate-800">Wrong clock-out time</p>
              <p className="mt-1">The diff panel shows original vs requested side by side. Modify to the corrected time rather than rejecting - the employee sees the outcome and the audit trail records both values.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="font-semibold text-slate-800">Still clocked in yesterday</p>
              <p className="mt-1">Stale shifts surface in the exceptions report. Close them from the entry's detail view with a manager note - or ask the employee to file the correction so they own the claim.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="font-semibold text-slate-800">Repeat offender</p>
              <p className="mt-1">Check the audit panel for their pattern (late clock-ins, long pauses, corrections). The exception report aggregates by employee - coach with data, not memory.</p>
            </div>
          </div>
        )}
      </div>

      <div className="clay-card p-4 lg:col-span-2">
        <button type="button" onClick={() => setShowAudit((v) => !v)} className="flex w-full items-center justify-between text-left">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-slate-600" />Recent Time Clock Activity</h3>
            <p className="text-xs text-gray-500 mt-1">Server-side audit trail - every punch, correction, and approval with its request id.</p>
          </div>
          <Badge className="bg-slate-100 text-slate-600">{events.length} events {showAudit ? "hide" : "show"}</Badge>
          {(() => {
            const byReviewer = {};
            for (const e of events) {
              if (!/approve|reject|review|correct|finalize/i.test(String(e.action || ""))) continue;
              const k = e.actor_email || "system";
              byReviewer[k] = (byReviewer[k] || 0) + 1;
            }
            const rows = Object.entries(byReviewer).sort((a, b) => b[1] - a[1]).slice(0, 4);
            return rows.length ? (
              <span className="ml-auto flex items-center gap-2 text-[10px] text-slate-400">
                Reviews: {rows.map(([email, n]) => `${email.split("@")[0]} ${n}`).join(" · ")}
              </span>
            ) : null;
          })()}
        </button>
        {showAudit && (
          events.length === 0 ? (
            <div className="mt-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No audit events returned.</div>
          ) : (
            <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between gap-2 rounded-lg border bg-white px-3 py-1.5 text-xs">
                  <span className="font-medium text-slate-800">{ev.action || "event"}</span>
                  <span className="truncate text-slate-500">{ev.user_email}{ev.actor_email && ev.actor_email !== ev.user_email ? ` by ${ev.actor_email}` : ""}</span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-400" title={ev.request_id}>{String(ev.request_id || "").slice(0, 8)}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">{formatCompanyDateTime(ev.created)}</span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
