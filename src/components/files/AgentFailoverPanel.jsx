import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Server, ArrowUpCircle, ArrowDownCircle, ChevronDown, ChevronUp } from "lucide-react";

const ago = (ms) => {
  if (!ms) return "never";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
};

/**
 * Dual-agent health + failover controls. Admin-only actions (promote/demote);
 * the read view renders for any staff so operators can see who's serving.
 */
export default function AgentFailoverPanel({ agents = [], settings = {}, isAdmin, fbCall, onChanged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const primaryId = settings?.primary_agent_id || "";
  const primary = agents.find((a) => a.agent_id === primaryId) || agents.find((a) => a.role === "primary");

  const act = async (action, agent_id) => {
    setBusy(`${action}:${agent_id}`); setErr("");
    try {
      const r = await fbCall(action, { agent_id });
      if (!r?.ok && r?.error) setErr(r.error);
      await onChanged?.();
    } catch (e) { setErr(e?.message || String(e)); }
    setBusy("");
  };

  return (
    <Card>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <Server className="h-4 w-4" /> Bridge agents
          {primary && <Badge variant={primary.healthy ? "default" : "destructive"}>primary: {primary.display_name || primary.agent_id}{primary.healthy ? "" : " · offline"}</Badge>}
          {!primary && <Badge variant="destructive">no primary</Badge>}
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <CardContent className="pt-0 space-y-2">
          {err && <div className="text-xs text-red-600">{err}</div>}
          {!agents.length && <div className="text-xs text-muted-foreground">No agents checked in yet.</div>}
          {agents.map((a) => {
            const isPrimary = a.agent_id === primaryId || (!primaryId && a.role === "primary");
            const stats = a.index_stats || {};
            return (
              <div key={a.agent_id} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    {a.display_name || a.agent_id}
                    <Badge variant={isPrimary ? "default" : "secondary"}>{a.role}{isPrimary ? " (configured)" : ""}</Badge>
                    {!a.healthy && <Badge variant="destructive">offline</Badge>}
                    {a.state === "stale" && <Badge variant="outline">stale</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    last seen {ago(a.last_seen_ms)} · v{a.agent_version || "?"} · spool {a.spool_depth ?? 0}
                    {stats.files != null && ` · ${stats.files.toLocaleString()} files`}
                    {a.error && <span className="text-red-600"> · {a.error}</span>}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-2 shrink-0">
                    {!isPrimary && (
                      <Button size="sm" variant="outline" disabled={!!busy}
                        onClick={() => act("promote_agent", a.agent_id)}>
                        <ArrowUpCircle className="h-4 w-4 mr-1" />
                        {busy === `promote_agent:${a.agent_id}` ? "Promoting…" : "Promote to primary"}
                      </Button>
                    )}
                    {isPrimary && (
                      <Button size="sm" variant="outline" disabled={!!busy}
                        onClick={() => act("demote_agent", a.agent_id)}>
                        <ArrowDownCircle className="h-4 w-4 mr-1" />
                        {busy === `demote_agent:${a.agent_id}` ? "Demoting…" : "Demote"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div className="text-xs text-muted-foreground">
            Reads fail over automatically when the primary is offline. Promotion re-hands the write role;
            the demoted agent refuses mutations on its next handshake. Provenance survives via the upload ledger
            (agents verify with hourly manifest_sync drift checks).
          </div>
        </CardContent>
      )}
    </Card>
  );
}
