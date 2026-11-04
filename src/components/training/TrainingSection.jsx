import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  GraduationCap, BookOpen, Play, FileText, Award, ClipboardList,
  CheckCircle2, ExternalLink, Loader2, ChevronDown, ChevronRight,
} from "lucide-react";
import { trainingBootstrap, trainingComplete } from "./trainingService";

// "Assigned training" — the specialized row section on My Workflow and the top
// of /sop. Fetches its own bootstrap (manageTraining) and renders nothing at
// all when the viewer has no assignments. Pending rows deep-link to the SOP or
// external material and can be marked done in place; a sop_ack on the SOP page
// also closes the assignment server-side.

const TYPE_ICONS = {
  sop: BookOpen,
  video: Play,
  document: FileText,
  certification: Award,
  custom: ClipboardList,
};

const fmtShort = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}`;
};

const fmtValid = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
};

const daysUntil = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return Infinity;
  return (d.getTime() - Date.now()) / 86400000;
};

function DueBadge({ row }) {
  if (row.overdue) {
    return <Badge variant="secondary" className="bg-red-100 text-red-700 text-[10px]">Overdue</Badge>;
  }
  if (!row.due_date) return null;
  const soon = daysUntil(row.due_date) <= 7;
  return (
    <Badge variant="secondary" className={`text-[10px] ${soon ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
      Due {fmtShort(row.due_date)}
    </Badge>
  );
}

export default function TrainingSection({ compact = false }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await trainingBootstrap();
      setRows(Array.isArray(res?.my_assignments) ? res.my_assignments : []);
      setError("");
    } catch (e) {
      setError(e?.message || "Could not load training.");
      setRows([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markDone = async (row) => {
    setBusyId(row.id);
    try {
      await trainingComplete({ id: row.id, expectedUpdatedDate: row.updated_date });
      await load();
    } catch (e) {
      setError(e?.message || "Could not mark this training done.");
      await load();
    }
    setBusyId("");
  };

  // Render nothing until we know there is something to show — the section is
  // invisible for staff with no assignments rather than an empty card.
  if (!rows) return null;
  const pending = rows.filter((r) => r.status === "pending");
  const completed = rows.filter((r) => r.status === "completed").slice(0, 3);
  if (!pending.length && !completed.length) return null;

  return (
    <div className={`rounded-lg border border-slate-200 bg-white ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-center gap-2 mb-2">
        <GraduationCap className={`${compact ? "h-4 w-4" : "h-5 w-5"} text-slate-600`} />
        <h2 className={`${compact ? "text-sm" : "text-base"} font-semibold text-slate-800`}>Assigned training</h2>
        {pending.length > 0 && (
          <Badge variant="secondary" className="bg-indigo-100 text-indigo-800 text-[10px]">{pending.length} pending</Badge>
        )}
        {error && <span className="ml-auto text-xs text-red-600">{error}</span>}
      </div>

      <div className="space-y-1.5">
        {pending.map((row) => {
          const Icon = TYPE_ICONS[row.training_type] || ClipboardList;
          const openUrl = row.url || row.file_url || "";
          const busy = busyId === row.id;
          return (
            <div key={row.id} className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
              <Icon className="h-4 w-4 shrink-0 text-slate-500" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium text-slate-800 truncate">{row.training_title || "Training"}</span>
                  <DueBadge row={row} />
                </div>
                {row.notes && <p className="text-xs text-slate-500 truncate" title={row.notes}>{row.notes}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {row.training_type === "sop" && row.sop_id && (
                  <Button asChild size="sm" className="h-7 px-2.5 text-xs">
                    <Link to={`/sop?sop=${encodeURIComponent(row.sop_id)}`}>Open SOP</Link>
                  </Button>
                )}
                {row.training_type !== "sop" && openUrl && (
                  <Button asChild size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1">
                    <a href={openUrl} target="_blank" rel="noopener noreferrer">
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                )}
                <Button
                  type="button" size="sm" variant={row.training_type === "sop" ? "outline" : "default"}
                  className="h-7 px-2.5 text-xs"
                  disabled={busy}
                  onClick={() => markDone(row)}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Mark done"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {completed.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
            onClick={() => setShowDone((v) => !v)}
          >
            {showDone ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Completed ({completed.length})
          </button>
          {showDone && (
            <div className="mt-1 space-y-1">
              {completed.map((row) => (
                <div key={row.id} className="flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50/50 px-2.5 py-1">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span className="text-xs text-slate-600 truncate flex-1">{row.training_title || "Training"}</span>
                  {row.renewal_due && <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[10px]">renewal due</Badge>}
                  {row.expires_at && <span className="text-[10px] text-slate-400 shrink-0">valid until {fmtValid(row.expires_at)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
