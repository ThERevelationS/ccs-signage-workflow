import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, FolderCog, Plus, Trash2, Check } from "lucide-react";

const PURPOSES = [
  { v: "customer_folders", label: "Customer folders (auto-match company names)" },
  { v: "general", label: "General files" },
  { v: "inbound", label: "Inbound drop zone" },
];

const emptyForm = { root_key: "", display_name: "", rel_root: "", unc_path: "", purpose: "general", scan_priority: 100, enabled: true, inbound_restricted: false, extraction_enabled: false };

/**
 * Admin root management: configured roots CRUD + agent-detected share
 * suggestions → save_root. Backend-only RLS means this UI is the only
 * staff-facing way to provision roots.
 */
export default function RootSetupWizard({ agents = [], roots = [], isAdmin, fbCall, onChanged }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  if (!isAdmin) return null;

  const defaultAgent = agentId || agents.find((a) => a.role === "primary")?.agent_id || agents[0]?.agent_id || "";
  const detected = agents.find((a) => a.agent_id === defaultAgent)?.index_stats?.detected_shares || {};
  const configured = roots.filter((r) => r.agent_id === defaultAgent);
  const suggestions = Object.entries(detected).flatMap(([mount, dirs]) =>
    (Array.isArray(dirs) ? dirs : []).map((d) => ({ mount, name: d }))
      .filter((s) => !configured.some((r) => r.root_key === s.name || r.rel_root === s.name)),
  );

  const save = async () => {
    if (!form.root_key.trim() || !form.rel_root.trim()) { setErr("root_key + rel_root required"); return; }
    setBusy("save"); setErr("");
    try {
      const r = await fbCall("save_root", { ...form, agent_id: defaultAgent });
      if (r?.error) { setErr(r.error); setBusy(""); return; }
      setForm(emptyForm); await onChanged?.();
    } catch (e) { setErr(e?.message || String(e)); }
    setBusy("");
  };
  const del = async (r) => {
    if (!window.confirm(`Remove root "${r.root_key}"? Index config only — no files are deleted.`)) return;
    setBusy(`del:${r.root_key}`);
    await fbCall("delete_root", { agent_id: r.agent_id, root_key: r.root_key }).catch(() => null);
    await onChanged?.(); setBusy("");
  };

  const F = (k, opts = {}) => (
    <Input value={form[k]} placeholder={opts.ph || k} type={opts.type || "text"} className="h-8 text-sm"
      onChange={(e) => setForm((f) => ({ ...f, [k]: opts.num ? Number(e.target.value) : e.target.value }))} />
  );

  return (
    <Card>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold">
        <span className="flex items-center gap-2"><FolderCog className="h-4 w-4" /> Share roots ({configured.length} on {defaultAgent || "—"})</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <CardContent className="pt-0 space-y-3">
          {agents.length > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Agent:</span>
              <select className="border rounded px-2 py-1" value={defaultAgent} onChange={(e) => setAgentId(e.target.value)}>
                {agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.display_name || a.agent_id} ({a.role})</option>)}
              </select>
            </div>
          )}

          {/* detected share suggestions */}
          {suggestions.length > 0 && (
            <div className="rounded border border-blue-200 bg-blue-50/50 p-2">
              <div className="text-xs font-medium text-blue-800 mb-1">Detected on this agent — click to prefill:</div>
              <div className="flex flex-wrap gap-1">
                {suggestions.map((s) => (
                  <Button key={`${s.mount}/${s.name}`} size="sm" variant="outline" className="h-6 text-xs"
                    onClick={() => setForm((f) => ({ ...f, root_key: s.name.replace(/[^\w-]/g, "_"), display_name: s.name, rel_root: s.name }))}>
                    <Plus className="h-3 w-3 mr-1" />{s.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* configured roots */}
          <div className="divide-y rounded border">
            {configured.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No roots configured for this agent.</div>}
            {configured.map((r) => (
              <div key={r.id || r.root_key} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <Badge variant={r.enabled !== false ? "default" : "secondary"}>{r.root_key}</Badge>
                <span className="text-muted-foreground truncate flex-1">{r.rel_root}{r.unc_path ? ` · ${r.unc_path}` : ""}</span>
                <Badge variant="outline">{r.purpose}</Badge>
                {r.purpose === "inbound" && r.inbound_restricted && <Badge variant="destructive">restricted</Badge>}
                <span className="text-xs text-muted-foreground">prio {r.scan_priority ?? 100}</span>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Toggle enabled"
                  onClick={() => fbCall("save_root", { agent_id: r.agent_id, root_key: r.root_key, enabled: r.enabled === false }).then(() => onChanged?.())}>
                  <Check className={`h-3.5 w-3.5 ${r.enabled !== false ? "text-emerald-600" : "text-slate-300"}`} />
                </Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" disabled={busy === `del:${r.root_key}`}
                  onClick={() => del(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>

          {/* add/edit form */}
          <div className="rounded border p-2 space-y-2">
            <div className="text-xs font-medium">Add / update root</div>
            {err && <div className="text-xs text-red-600">{err}</div>}
            <div className="grid grid-cols-2 gap-2">
              {F("root_key", { ph: "root_key (e.g. customer_files)" })}
              {F("display_name", { ph: "Display name" })}
              {F("rel_root", { ph: "Share path (e.g. Customer Files)" })}
              {F("unc_path", { ph: "UNC path (optional, e.g. \\\\TOWER\\share)" })}
              <select className="border rounded px-2 h-8 text-sm" value={form.purpose}
                onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}>
                {PURPOSES.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
              </select>
              {F("scan_priority", { ph: "Scan priority (lower first)", num: true })}
            </div>
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} /> Enabled</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.inbound_restricted} onChange={(e) => setForm((f) => ({ ...f, inbound_restricted: e.target.checked }))} /> Inbound restricted (admin-only tray)</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.extraction_enabled} onChange={(e) => setForm((f) => ({ ...f, extraction_enabled: e.target.checked }))} /> Content extraction (deep search)</label>
              <Button size="sm" className="ml-auto" disabled={busy === "save"} onClick={save}>{busy === "save" ? "Saving…" : "Save root"}</Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Saving bumps config_version — the agent picks up root changes on its next handshake (≤2min), then scans hot roots first.
          </div>
        </CardContent>
      )}
    </Card>
  );
}
