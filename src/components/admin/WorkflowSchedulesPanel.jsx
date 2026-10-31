import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CalendarClock, RefreshCw, Loader2, AlertTriangle, Edit, ListChecks,
  ExternalLink, CheckCircle2, XCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { getStoredAdminSettingsCapability } from "@/components/auth/EmailGate";
import {
  listWorkflowSchedules, listWorkflowRuns, updateWorkflowSchedule,
  setWorkflowStatus, adoptExternalWorkflowChange, listWorkflowScheduleHistory,
} from "@/components/admin/workflowSchedulesPersistence";
import {
  describeCron, nextRuns, validateSchedule, firingMinutesOverlap, isValidTimeZone,
} from "@/shared/cronSchedule.mjs";
import { CcsTimeField } from "@/components/ui/ccs-date-field";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
];

const PRESETS = [
  { value: "every_n", label: "Every N minutes" },
  { value: "hourly", label: "Hourly at a minute" },
  { value: "daily", label: "Daily at a time" },
  { value: "weekdays", label: "Weekdays at a time" },
  { value: "weekly", label: "Weekly on day(s) at a time" },
  { value: "advanced", label: "Advanced cron" },
];

const EVERY_N_CHOICES = [5, 10, 15, 30];
const DOW_OPTIONS = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
  { value: "0", label: "Sun" },
];

function detectPreset(cron) {
  const text = String(cron || "").trim();
  let m;
  if ((m = /^\*\/(\d+) \* \* \* \*$/.exec(text))) {
    return { preset: "every_n", everyN: Number(m[1]), everyOffset: 0 };
  }
  if ((m = /^(\d+)-59\/(\d+) \* \* \* \*$/.exec(text))) {
    return { preset: "every_n", everyN: Number(m[2]), everyOffset: Number(m[1]) };
  }
  if ((m = /^(\d+) \* \* \* \*$/.exec(text))) {
    return { preset: "hourly", minute: Number(m[1]) };
  }
  if ((m = /^(\d+) (\d+) \* \* \*$/.exec(text))) {
    return { preset: "daily", time: `${m[2].padStart(2, "0")}:${m[1].padStart(2, "0")}` };
  }
  if ((m = /^(\d+) (\d+) \* \* 1-5$/.exec(text))) {
    return { preset: "weekdays", time: `${m[2].padStart(2, "0")}:${m[1].padStart(2, "0")}` };
  }
  if ((m = /^(\d+) (\d+) \* \* ([\d,]+)$/.exec(text))) {
    return { preset: "weekly", time: `${m[2].padStart(2, "0")}:${m[1].padStart(2, "0")}`, days: m[3].split(",").map((d) => String(Number(d) === 7 ? 0 : Number(d))) };
  }
  return { preset: "advanced" };
}

function buildCron({ preset, everyN, everyOffset, minute, time, days, advanced }) {
  if (preset === "every_n") {
    const n = Math.max(5, Number(everyN) || 5);
    const offset = Math.max(0, Math.min(n - 1, Number(everyOffset) || 0));
    return offset === 0 ? `*/${n} * * * *` : `${offset}-59/${n} * * * *`;
  }
  if (preset === "hourly") {
    const min = Math.max(0, Math.min(59, Number(minute) || 0));
    return `${min} * * * *`;
  }
  const [h, m] = String(time || "07:00").split(":").map((v) => Number(v));
  const safeH = Number.isFinite(h) ? h : 7;
  const safeM = Number.isFinite(m) ? m : 0;
  if (preset === "daily") return `${safeM} ${safeH} * * *`;
  if (preset === "weekdays") return `${safeM} ${safeH} * * 1-5`;
  if (preset === "weekly") {
    const list = (days || []).length ? days : ["1"];
    return `${safeM} ${safeH} * * ${list.join(",")}`;
  }
  return String(advanced || "").trim();
}

function conflictStatus(error) {
  return error?.code === "conflict" || error?.status === 409;
}

export default function WorkflowSchedulesPanel() {
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(null);
  const [pausing, setPausing] = useState(null);
  const [runsFor, setRunsFor] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const loadSeq = useRef(0);

  const capability = () => getStoredAdminSettingsCapability();

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await listWorkflowSchedules({ adminCapability: capability() });
      if (seq === loadSeq.current) setRows(result);
    } catch (error) {
      if (seq === loadSeq.current) setLoadError(error);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    listWorkflowScheduleHistory({ adminCapability: capability() })
      .then((result) => { if (!cancelled) setHistoryRows(result); })
      .catch(() => { if (!cancelled) setHistoryRows([]); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [rows]);

  const errorCode = loadError?.code;
  if (errorCode === "not_configured") {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 text-sm text-blue-950">
        <div className="font-semibold text-base mb-2">Scheduled Jobs needs a Base44 token</div>
        <p>Create a Base44 personal access token (Settings → Secrets → Personal access tokens → One app: CCS Signage Workflow → Full access) and save it as the app secret <code className="font-mono bg-blue-100 px-1 rounded">BASE44_WORKFLOWS_TOKEN</code>.</p>
      </div>
    );
  }
  if (errorCode === "base44_auth") {
    return (
      <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <div className="font-semibold">Base44 rejected the admin page's token</div>
        <p className="mt-1">Check that the <code className="font-mono bg-amber-100 px-1 rounded">BASE44_WORKFLOWS_TOKEN</code> app secret holds a current personal access token with access to this app.</p>
        <Button type="button" size="sm" variant="outline" className="mt-3 border-amber-500 bg-white" onClick={load}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold">Scheduled Jobs</h3>
          <span className="text-sm text-gray-500">Base44 workflow schedules, live from the Apps API</span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading} className="min-h-10">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {loadError && !errorCode && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{loadError?.message || "Scheduled jobs could not be loaded."}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="jobs" className="min-w-0 space-y-4">
        <TabsList>
          <TabsTrigger value="jobs" className="min-h-11">Jobs</TabsTrigger>
          <TabsTrigger value="history" className="min-h-11">History</TabsTrigger>
        </TabsList>
        <TabsContent value="jobs" className="min-w-0">
          <JobsTable
            rows={rows}
            loading={loading}
            onEdit={(row) => setEditing({ row, prefill: null })}
            onToggle={(row) => (row.status === "active" ? setPausing(row) : applyStatus(row, "active"))}
            onRuns={(row) => setRunsFor(row)}
            onExternal={(row) => setEditing({ row, external: true })}
          />
        </TabsContent>
        <TabsContent value="history" className="min-w-0">
          <HistoryTable rows={historyRows} loading={historyLoading} />
        </TabsContent>
      </Tabs>

      {editing?.external ? (
        <ExternalChangeDialog
          row={editing.row}
          onClose={() => setEditing(null)}
          onAdopt={async () => {
            await adoptExternalWorkflowChange({ workflowId: editing.row.id, adminCapability: capability() });
            setEditing(null);
            setNotice(`Accepted Base44's current settings for ${editing.row.name}.`);
            load();
          }}
          onReapply={() => setEditing({ row: editing.row, prefill: editing.row.last_applied })}
        />
      ) : editing && (
        <EditScheduleDialog
          row={editing.row}
          prefill={editing.prefill}
          allRows={rows || []}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); setNotice("Schedule updated in Base44."); await load(); }}
        />
      )}

      <AlertDialog open={!!pausing} onOpenChange={(open) => !open && setPausing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause {pausing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Pausing removes this job's schedule in Base44 until it is activated again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep running</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const row = pausing; setPausing(null); applyStatus(row, "inactive"); }}>
              Pause job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {runsFor && <RunsDialog row={runsFor} onClose={() => setRunsFor(null)} capability={capability} />}
    </div>
  );

  async function applyStatus(row, desired) {
    try {
      await setWorkflowStatus({
        workflowId: row.id,
        desiredStatus: desired,
        expectedStatus: row.status,
        adminCapability: capability(),
      });
      setNotice(`${row.name} is now ${desired}.`);
      await load();
    } catch (error) {
      if (conflictStatus(error)) {
        setLoadError(Object.assign(new Error("This job changed in Base44 since it was loaded. The list was reloaded."), { code: "conflict_ui" }));
        await load();
      } else {
        setLoadError(error);
      }
    }
  }
}

function JobsTable({ rows, loading, onEdit, onToggle, onRuns, onExternal }) {
  if (loading && !rows) {
    return <div className="flex items-center gap-2 text-sm text-gray-500 py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading scheduled jobs…</div>;
  }
  if (!rows?.length) {
    return <div className="text-sm text-gray-500 py-8">No scheduled jobs were returned by Base44.</div>;
  }
  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Next run</TableHead>
            <TableHead>Active</TableHead>
            <TableHead>Last run</TableHead>
            <TableHead>Flags</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const scheduled = row.trigger_type === "scheduled" && row.cron;
            return (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="font-medium">{row.name || row.id}</div>
                  {row.description && <div className="text-xs text-gray-500 max-w-xs truncate">{row.description}</div>}
                </TableCell>
                <TableCell>
                  {scheduled ? (
                    <>
                      <div className="text-sm">{row.schedule_text || row.cron}</div>
                      <div className="text-xs text-gray-500 font-mono">{row.cron}</div>
                      <div className="text-xs text-gray-500">{row.timezone}</div>
                    </>
                  ) : (
                    <span className="text-sm text-gray-500">Not on a cron schedule{row.trigger_type ? ` (${row.trigger_type})` : ""}</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {row.next_runs?.[0]
                    ? format(new Date(row.next_runs[0]), "MMM d, h:mm a")
                    : <span className="text-gray-400">—</span>}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={row.status === "active"}
                    disabled={row.status === "archived"}
                    onCheckedChange={() => onToggle(row)}
                    aria-label={`Toggle ${row.name}`}
                  />
                  {row.status_reason && <div className="text-xs text-amber-700 mt-1">{row.status_reason}</div>}
                </TableCell>
                <TableCell>
                  {row.last_run_at ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span>{formatDistanceToNow(new Date(row.last_run_at), { addSuffix: true })}</span>
                      {row.last_run_status === "success" && <Badge variant="outline" className="border-green-300 text-green-700">success</Badge>}
                      {row.last_run_status === "failed" && <Badge variant="destructive">failed</Badge>}
                      {row.consecutive_failures > 0 && (
                        <Badge variant="destructive">{row.consecutive_failures} in a row</Badge>
                      )}
                    </div>
                  ) : <span className="text-sm text-gray-400">Never</span>}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {row.collisions?.length > 0 && (
                      <Badge variant="outline" className="border-amber-400 text-amber-700 cursor-help"
                        title={`Fires at the same time as: ${row.collisions.map((c) => c.name).join(", ")} (next: ${row.collisions[0].next_shared ? format(new Date(row.collisions[0].next_shared), "MMM d, h:mm a") : "?"})`}>
                        <AlertTriangle className="h-3 w-3 mr-1" />Collides
                      </Badge>
                    )}
                    {row.external_change && (
                      <Badge variant="outline" className="border-purple-400 text-purple-700 cursor-pointer" onClick={() => onExternal(row)}>
                        <ExternalLink className="h-3 w-3 mr-1" />Changed outside the app
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button type="button" size="sm" variant="ghost" disabled={!scheduled} onClick={() => onEdit(row)} aria-label={`Edit ${row.name}`}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => onRuns(row)} aria-label={`Runs for ${row.name}`}>
                      <ListChecks className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function HistoryTable({ rows, loading }) {
  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-gray-500 py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading history…</div>;
  }
  if (!rows?.length) return <div className="text-sm text-gray-500 py-8">No schedule changes have been recorded yet.</div>;
  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Job</TableHead>
            <TableHead>Change</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead>By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="text-sm whitespace-nowrap">
                {(row.verified_at || row.created_date)
                  ? format(new Date(row.verified_at || row.created_date), "MMM d, h:mm a")
                  : "—"}
              </TableCell>
              <TableCell className="text-sm">{row.workflow_name || row.workflow_id}</TableCell>
              <TableCell className="text-sm">
                {row.action === "schedule_update" && (
                  <span><code className="font-mono">{row.previous_cron}</code> → <code className="font-mono">{row.new_cron}</code> ({row.new_timezone})</span>
                )}
                {row.action === "status_change" && <span>{row.previous_status} → {row.new_status}</span>}
                {row.action === "adopt_external" && <span>Accepted Base44's current settings</span>}
                {row.error && <div className="text-xs text-red-600 mt-0.5">{row.error}</div>}
              </TableCell>
                <TableCell>
                {row.outcome === "applied" && <Badge variant="outline" className="border-green-300 text-green-700">applied</Badge>}
                {row.outcome === "failed" && <Badge variant="destructive">failed</Badge>}
                {row.outcome === "conflict" && <Badge variant="outline" className="border-amber-400 text-amber-700">conflict</Badge>}
              </TableCell>
              <TableCell className="text-sm">{row.actor_name || row.actor_email || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EditScheduleDialog({ row, prefill, allRows, onClose, onSaved }) {
  const sourceCron = prefill?.cron || row.cron;
  const sourceTz = prefill?.timezone || row.timezone;
  const detected = useMemo(() => detectPreset(sourceCron), [sourceCron]);
  const [preset, setPreset] = useState(detected.preset);
  const [everyN, setEveryN] = useState(EVERY_N_CHOICES.includes(detected.everyN) ? detected.everyN : 15);
  const [everyOffset, setEveryOffset] = useState(detected.everyOffset || 0);
  const [minute, setMinute] = useState(detected.minute ?? 0);
  const [time, setTime] = useState(detected.time || "07:00");
  const [days, setDays] = useState(detected.days || ["1"]);
  const [advanced, setAdvanced] = useState(sourceCron || "");
  const [timezone, setTimezone] = useState(sourceTz || "America/New_York");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const requestIdRef = useRef(crypto.randomUUID());

  const cron = buildCron({ preset, everyN, everyOffset, minute, time, days, advanced });
  const validation = validateSchedule(cron, timezone);
  const tzOptions = TIMEZONES.includes(timezone) ? TIMEZONES : [...TIMEZONES, timezone];

  const previewRuns = useMemo(() => {
    if (!validation.ok) return [];
    return nextRuns(cron, timezone, new Date(), 5);
  }, [cron, timezone, validation.ok]);

  const collisions = useMemo(() => {
    if (!validation.ok) return [];
    return (allRows || [])
      .filter((other) => other.id !== row.id && other.status === "active" && other.trigger_type === "scheduled" && other.cron)
      .map((other) => {
        const overlap = firingMinutesOverlap(cron, timezone, other.cron, other.timezone || "UTC", new Date());
        return overlap.length ? { name: other.name, at: overlap[0] } : null;
      })
      .filter(Boolean);
  }, [cron, timezone, allRows, row.id, validation.ok]);

  const save = async () => {
    if (!validation.ok || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateWorkflowSchedule({
        workflowId: row.id,
        cronExpression: cron,
        timezone,
        expectedCron: row.cron,
        expectedTimezone: row.timezone,
        requestId: requestIdRef.current,
        adminCapability: getStoredAdminSettingsCapability(),
      });
      await onSaved();
    } catch (error) {
      setSaveError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit schedule — {row.name}</DialogTitle>
          <DialogDescription>Changes are written directly to Base44 for this app's main branch.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Schedule type</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {preset === "every_n" && (
            <div className="flex gap-3">
              <div className="flex-1">
                <Label>Every</Label>
                <Select value={String(everyN)} onValueChange={(v) => setEveryN(Number(v))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVERY_N_CHOICES.map((n) => <SelectItem key={n} value={String(n)}>{n} minutes</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label>Starting at minute</Label>
                <Select value={String(everyOffset)} onValueChange={(v) => setEveryOffset(Number(v))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: everyN }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>:{String(i).padStart(2, "0")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {preset === "hourly" && (
            <div>
              <Label>At minute</Label>
              <Input type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(e.target.value)} className="mt-1 w-28" />
            </div>
          )}

          {(preset === "daily" || preset === "weekdays" || preset === "weekly") && (
            <div>
              <Label>At local time</Label>
              <CcsTimeField value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 w-36" />
            </div>
          )}

          {preset === "weekly" && (
            <div>
              <Label>On days</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {DOW_OPTIONS.map((d) => {
                  const selected = days.includes(d.value);
                  return (
                    <Button
                      key={d.value} type="button" size="sm"
                      variant={selected ? "default" : "outline"}
                      onClick={() => setDays((prev) => selected ? prev.filter((v) => v !== d.value) : [...prev, d.value])}
                    >
                      {d.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {preset === "advanced" && (
            <div>
              <Label>Cron expression (5 fields)</Label>
              <Input value={advanced} onChange={(e) => setAdvanced(e.target.value)} className="mt-1 font-mono" placeholder="8,23,38,53 * * * *" />
            </div>
          )}

          <div>
            <Label>Time zone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {tzOptions.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md bg-gray-50 border p-3 text-sm space-y-1">
            {validation.ok ? (
              <>
                <div className="font-medium">{describeCron(cron)}</div>
                <div className="text-xs font-mono text-gray-500">{cron}</div>
                <div className="pt-1">
                  {previewRuns.map((d) => (
                    <div key={d.toISOString()} className="text-xs text-gray-600">
                      {format(d, "EEE MMM d, h:mm a")} local · {d.toISOString().replace("T", " ").slice(0, 16)}Z
                    </div>
                  ))}
                </div>
                {collisions.length > 0 && (
                  <div className="pt-1 text-amber-700 flex items-start gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Collides with {collisions.map((c) => `${c.name} (${format(c.at, "MMM d, h:mm a")})`).join(", ")}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-red-600 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />{validation.error}
              </div>
            )}
          </div>

          {saveError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between gap-2">
                <span>{saveError?.message || "The schedule could not be saved."}</span>
                {conflictStatus(saveError) && (
                  <Button type="button" size="sm" variant="outline" className="bg-white" onClick={onClose}>Reload</Button>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={save} disabled={!validation.ok || saving || !isValidTimeZone(timezone)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Update in Base44
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExternalChangeDialog({ row, onClose, onAdopt, onReapply }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{row.name} changed outside the app</DialogTitle>
          <DialogDescription>
            This job's settings in Base44 differ from what this page last applied or accepted. Keep Base44's current settings or re-apply the values this page saved.
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm space-y-1">
          <div><span className="text-gray-500">Base44 now:</span> <code className="font-mono">{row.cron}</code> ({row.timezone}) · {row.status}</div>
          {row.last_applied && (
            <div><span className="text-gray-500">Last applied here:</span> <code className="font-mono">{row.last_applied.cron}</code> ({row.last_applied.timezone}) · {row.last_applied.status}</div>
          )}
        </div>
        {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
        <DialogFooter className="gap-2">
          <Button
            type="button" variant="outline" disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try { await onAdopt(); } catch (e) { setError(e?.message || "Could not record this."); setBusy(false); }
            }}
          >
            Keep Base44's
          </Button>
          <Button type="button" disabled={busy || !row.last_applied?.cron} onClick={onReapply}>
            Re-apply mine
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunsDialog({ row, onClose, capability }) {
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    listWorkflowRuns({ workflowId: row.id, adminCapability: capability() })
      .then((result) => { if (!cancelled) setRuns(result); })
      .catch((e) => { if (!cancelled) setError(e); });
    return () => { cancelled = true; };
  }, [row.id, capability]);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Recent runs — {row.name}</DialogTitle>
        </DialogHeader>
        {!runs && !error && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading runs…</div>
        )}
        {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error?.message}</AlertDescription></Alert>}
        {runs && !runs.length && <div className="text-sm text-gray-500 py-6">No runs recorded for this job.</div>}
        {runs?.length > 0 && (
          <div className="rounded-lg border overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run, i) => (
                  <TableRow key={run.run_id || i}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {run.started_at ? format(new Date(run.started_at), "MMM d, h:mm:ss a") : "—"}
                    </TableCell>
                    <TableCell>
                      {run.status === "completed" || run.status === "success"
                        ? <Badge variant="outline" className="border-green-300 text-green-700"><CheckCircle2 className="h-3 w-3 mr-1" />{run.status}</Badge>
                        : run.status === "failed"
                          ? <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />failed</Badge>
                          : <Badge variant="outline">{run.status}</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">{run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : "—"}</TableCell>
                    <TableCell className="text-sm text-red-600 max-w-xs truncate">{run.error_message || ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
