import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Loader2, ScanFace, Users } from "lucide-react";
import { formatCompanyDateTime } from "@/components/timeclock/timeClockCompanyTime";

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tc-roster-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

export default function AdminRosterPanels({ sessionToken }) {
  const [staff, setStaff] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const [whoRes, faceRes] = await Promise.all([
        base44.functions.invoke("timeClockAction", { action: "who_is_in", session_token: sessionToken, scope: "admin", request_id: newRequestId() }).catch(() => null),
        base44.functions.invoke("timeClockAction", { action: "list_face_enrollment", session_token: sessionToken, scope: "admin", request_id: newRequestId() }).catch(() => null),
      ]);
      const who = whoRes?.data || whoRes;
      const face = faceRes?.data || faceRes;
      if (who?.success !== true) throw new Error(who?.error || "Who's-in data could not be loaded.");
      setStaff(Array.isArray(who.staff) ? who.staff : []);
      setRoster(face?.success === true && Array.isArray(face.roster) ? face.roster : []);
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
    </div>
  );
}
