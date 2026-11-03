import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Folder, File as FileIcon, FileText, FileImage, FileVideo, FileAudio,
  FileSpreadsheet, Palette, Archive, Type, Upload, RefreshCw, Search,
  ChevronRight, HardDrive, Server, Download, Trash2, Undo2, FolderPlus,
  CheckCircle2, XCircle, Loader2, Link2, AlertTriangle, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fbCall, waitForCommand, uploadToStaging, fmtBytes, kindOfExt } from "@/components/files/fileBridgeClient";
import AgentFailoverPanel from "@/components/files/AgentFailoverPanel";
import FileViewerDialog from "@/components/files/FileViewerDialog";
import InboundAttachDialog from "@/components/files/InboundAttachDialog";
import { useAuth } from "@/components/auth/EmailGate";

const ICONS = {
  dir: Folder, pdf: FileText, image: FileImage, video: FileVideo, audio: FileAudio,
  doc: FileText, sheet: FileSpreadsheet, design: Palette, archive: Archive,
  font: Type, file: FileIcon,
};

const crumbOf = (p) => (p ? p.split("/") : []);

export default function ServerFiles() {
  const [health, setHealth] = useState(null);
  const [healthErr, setHealthErr] = useState("");
  const [rootKey, setRootKey] = useState("");
  const [dir, setDir] = useState("");
  const [entries, setEntries] = useState([]);
  const [listSrc, setListSrc] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState({}); // path|command_id -> label
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState("hot"); // hot | deep
  const [searchHits, setSearchHits] = useState(null);
  const [links, setLinks] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [viewer, setViewer] = useState(null); // {url,name,ext,size,sha256}
  const [attachRow, setAttachRow] = useState(null);
  const fileInput = useRef(null);
  const { currentUser } = useAuth();

  const currentRoot = (health?.roots || []).find((r) => r.root_key === rootKey);
  const isInbound = currentRoot?.purpose === "inbound";
  const inboundBlocked = isInbound && currentRoot?.inbound_restricted && currentUser?.role !== "admin";

  const loadHealth = useCallback(async () => {
    try {
      const r = await fbCall("get_health");
      const h = r?.data ?? r;
      setHealth(h); setHealthErr("");
      setLinks((await fbCall("link_review").then((x) => x?.data ?? x).catch(() => null))?.suggestions || []);
      if (!rootKey && h?.roots?.length) setRootKey(h.roots[0].root_key);
    } catch (e) {
      setHealthErr(String(e?.response?.data?.error || e?.message || e));
    }
  }, [rootKey]);

  useEffect(() => { loadHealth(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDir = useCallback(async (rk = rootKey, p = dir, refresh = false) => {
    if (!rk) return;
    setLoading(true);
    try {
      const r = await fbCall("list_folder", { root_key: rk, path: p, limit: 1000, refresh });
      const d = r?.data ?? r;
      if (d?.source === "index") {
        setEntries(d.entries || []); setListSrc("index");
      } else if (d?.command_id) {
        setListSrc("command");
        const c = await waitForCommand(d.command_id, { timeoutMs: 60_000 });
        setEntries(c?.result?.entries || []); setListSrc(c?.result?.source || "agent");
      } else {
        setEntries([]); setListSrc("empty");
      }
    } catch (e) {
      setEntries([]); setListSrc("error");
    } finally { setLoading(false); }
  }, [rootKey, dir]);

  useEffect(() => { if (rootKey) loadDir(rootKey, dir); }, [rootKey, dir]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSearch = async () => {
    const q = query.trim();
    if (!q) { setSearchHits(null); return; }
    setLoading(true);
    try {
      if (searchMode === "hot") {
        const r = await fbCall("search_hot", { query: q, root_key: rootKey || undefined, limit: 100 });
        setSearchHits((r?.data ?? r)?.hits || []);
      } else {
        const r = await fbCall("queue_deep_search", { query: q });
        const d = r?.data ?? r;
        if (d?.command_id) {
          const c = await waitForCommand(d.command_id, { timeoutMs: 120_000 });
          setSearchHits(c?.result?.hits || []);
        } else setSearchHits([]);
      }
    } catch (e) { setSearchHits([]); }
    finally { setLoading(false); }
  };

  const openFile = async (row) => {
    const key = `open:${row.path}`;
    setBusy((b) => ({ ...b, [key]: "fetching…" }));
    try {
      // already-delivered small files keep a permanent URL
      if (row.delivered_url && !(row.delivered_at_ms && row.mtime_ms > row.delivered_at_ms)) {
        setViewer({ url: row.delivered_url, name: row.name, ext: row.ext, size: row.size, sha256: row.sha256 });
        return;
      }
      const r = await fbCall("queue_fetch", { root_key: rootKey, path: row.path, sha256: row.sha256, size: row.size });
      const d = r?.data ?? r;
      if (!d?.command_id) throw new Error(d?.error || "enqueue failed");
      const c = await waitForCommand(d.command_id, { timeoutMs: 300_000, onTick: (t) => setBusy((b) => ({ ...b, [key]: t?.progress ? `fetching ${Math.round(((t.progress.done || 0) / (t.progress.total || 1)) * 100)}%` : "fetching…" })) });
      if (c?.result?.file_url) setViewer({ url: c.result.file_url, name: row.name, ext: row.ext, size: row.size, sha256: c.result.sha256 || row.sha256 });
      else setBusy((b) => ({ ...b, [key]: `failed: ${c?.error || c?.status || "unknown"}` }));
    } catch (e) {
      setBusy((b) => ({ ...b, [key]: `failed: ${String(e?.response?.data?.error || e.message || e).slice(0, 80)}` }));
    } finally {
      setBusy((b) => { const n = { ...b }; if (!String(n[key] || "").startsWith("failed")) delete n[key]; return n; });
    }
  };

  const deleteFile = async (row) => {
    const key = `del:${row.path}`;
    setBusy((b) => ({ ...b, [key]: "deleting…" }));
    try {
      const r = await fbCall("queue_delete", { root_key: rootKey, paths: [row.path] });
      const d = r?.data ?? r;
      if (d?.command_id) {
        const c = await waitForCommand(d.command_id, { timeoutMs: 60_000 });
        if (c?.status === "completed") { loadDir(); return; }
        setBusy((b) => ({ ...b, [key]: `failed: ${c?.error || c?.status}` }));
      } else setBusy((b) => ({ ...b, [key]: `failed: ${d?.error || "enqueue"}` }));
    } catch (e) {
      setBusy((b) => ({ ...b, [key]: `blocked: ${String(e?.response?.data?.error || e.message || e).slice(0, 80)}` }));
    }
  };

  const emailFile = async (row) => {
    const to = window.prompt(`Email "${row.name}" to:`);
    if (!to?.trim()) return;
    const key = `mail:${row.path}`;
    setBusy((b) => ({ ...b, [key]: "sending…" }));
    const send = () => fbCall("send_file_email", { root_key: rootKey, path: row.path, to: to.trim() }).then((x) => x?.data ?? x);
    try {
      let r = await send();
      if (r?.needs_delivery) {
        setBusy((b) => ({ ...b, [key]: "fetching for email…" }));
        const q = await fbCall("queue_fetch", { root_key: rootKey, path: row.path, sha256: row.sha256, size: row.size });
        const d = q?.data ?? q;
        if (!d?.command_id) throw new Error(d?.error || "enqueue failed");
        const c = await waitForCommand(d.command_id, { timeoutMs: 300_000 });
        if (c?.status !== "completed") throw new Error(`delivery ${c?.status}`);
        r = await send();
      }
      if (r?.ok) setBusy((b) => ({ ...b, [key]: `sent to ${to.trim()}` }));
      else setBusy((b) => ({ ...b, [key]: `failed: ${r?.error || "unknown"}` }));
    } catch (e) {
      setBusy((b) => ({ ...b, [key]: `failed: ${String(e?.response?.data?.error || e.message || e).slice(0, 60)}` }));
    }
  };

  const restoreFile = async (row) => {
    const r = await fbCall("queue_restore", { root_key: rootKey, path: row.path });
    const d = r?.data ?? r;
    if (d?.command_id) { await waitForCommand(d.command_id, { timeoutMs: 60_000 }); loadDir(); }
  };

  const mkdir = async () => {
    const name = window.prompt("New folder name:");
    if (!name?.trim()) return;
    const p = dir ? `${dir}/${name.trim()}` : name.trim();
    const r = await fbCall("queue_mkdir", { root_key: rootKey, path: p });
    const d = r?.data ?? r;
    if (d?.command_id) { await waitForCommand(d.command_id, { timeoutMs: 60_000 }); loadDir(rootKey, dir, true); }
  };

  const uploadFiles = async (files) => {
    for (const f of files) {
      const id = `${Date.now()}-${f.name}`;
      setUploads((u) => [...u, { id, name: f.name, state: "staging…" }]);
      try {
        const staged = await uploadToStaging(f);
        setUploads((u) => u.map((x) => x.id === id ? { ...x, state: "queued…" } : x));
        const r = await fbCall("queue_upload", {
          root_key: rootKey, dest_dir: dir, name: f.name.normalize("NFC"),
          size: staged.size, sha256: staged.sha256, file_url: staged.file_url,
        });
        const d = r?.data ?? r;
        if (!d?.command_id) throw new Error(d?.error || "enqueue failed");
        const c = await waitForCommand(d.command_id, { timeoutMs: 300_000 });
        setUploads((u) => u.map((x) => x.id === id
          ? { ...x, state: c?.status === "completed" ? `applied → ${c?.result?.path || ""}` : `failed: ${c?.error || c?.status}` }
          : x));
        if (c?.status === "completed") loadDir(rootKey, dir, true);
      } catch (e) {
        setUploads((u) => u.map((x) => x.id === id ? { ...x, state: `failed: ${String(e?.response?.data?.error || e.message || e).slice(0, 80)}` } : x));
      }
    }
  };

  const decideLink = async (l, decision) => {
    await fbCall("link_decide", { link_id: l.id, decision }).catch(() => null);
    setLinks((ls) => ls.filter((x) => x.id !== l.id));
  };

  const agents = health?.agents || [];
  const roots = health?.roots || [];
  const crumbs = crumbOf(dir);
  const servedByBackup = useMemo(() => agents.some((a) => a.role === "backup" && a.healthy) && !agents.some((a) => a.role === "primary" && a.healthy), [agents]);
  const canDelete = (row) => row.origin === "bridge";

  if (healthErr) return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2"><HardDrive className="h-6 w-6" /> Server Files</h1>
      <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 flex gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">File Bridge unavailable</div>
          <div className="text-sm mt-1">{healthErr}</div>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadHealth}><RefreshCw className="h-4 w-4 mr-1" /> Retry</Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      {/* header + health */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2"><HardDrive className="h-6 w-6" /> Server Files</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {agents.map((a) => (
            <Badge key={a.agent_id} variant={a.healthy ? "default" : "destructive"} className="gap-1">
              <Server className="h-3 w-3" /> {a.display_name || a.agent_id} · {a.role}{a.healthy ? "" : " · offline"}
            </Badge>
          ))}
          {servedByBackup && <Badge variant="secondary">served by backup replica</Badge>}
          <Button size="sm" variant="outline" onClick={() => fbCall("queue_index_now", { root_key: rootKey }).then(() => loadDir(rootKey, dir, true))}>
            <RefreshCw className="h-4 w-4 mr-1" /> Re-index
          </Button>
        </div>
      </div>

      {health && !agents.length && (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          No file-bridge agents have checked in. Install the agent on the primary Unraid server
          (see <code>docs/unraid-filebridge-setup.md</code>) — once it handshakes, shares appear here.
        </div>
      )}

      <AgentFailoverPanel agents={agents} settings={health?.settings}
        isAdmin={currentUser?.role === "admin"} fbCall={fbCall} onChanged={loadHealth} />

      {/* link review queue */}
      {links.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
          <div className="font-semibold text-sm flex items-center gap-2 mb-2"><Link2 className="h-4 w-4" /> Customer folder matches to review ({links.length})</div>
          <div className="space-y-1">
            {links.slice(0, 8).map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-sm bg-white rounded px-2 py-1.5 border">
                <span className="font-medium truncate">{l.folder_path}</span>
                <span className="text-muted-foreground">→</span>
                <span className="truncate">{l.customer_name || l.customer_id}</span>
                <Badge variant="outline" className="ml-auto shrink-0">{Math.round((l.confidence || 0) * 100)}%</Badge>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => decideLink(l, "confirm")}><CheckCircle2 className="h-4 w-4 text-green-600" /></Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => decideLink(l, "reject")}><XCircle className="h-4 w-4 text-red-500" /></Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* root tabs + toolbar */}
      {roots.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap border-b pb-2">
          {roots.map((r) => (
            <Button key={r.root_key} size="sm" variant={rootKey === r.root_key ? "default" : "ghost"}
              onClick={() => { setRootKey(r.root_key); setDir(""); setSearchHits(null); }}>
              {r.display_name || r.root_key}
            </Button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder={searchMode === "hot" ? "Search indexed files… (ext:pdf folder:acme)" : "Deep search the whole server…"}
            value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} />
        </div>
        <Button size="sm" variant={searchMode === "hot" ? "default" : "outline"} onClick={() => setSearchMode("hot")}>Hot index</Button>
        <Button size="sm" variant={searchMode === "deep" ? "default" : "outline"} onClick={() => setSearchMode("deep")}>Deep search</Button>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={mkdir}><FolderPlus className="h-4 w-4 mr-1" /> New folder</Button>
          <Button size="sm" onClick={() => fileInput.current?.click()}><Upload className="h-4 w-4 mr-1" /> Upload</Button>
          <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { uploadFiles([...(e.target.files || [])]); e.target.value = ""; }} />
        </div>
      </div>

      {/* inbound tray banner */}
      {isInbound && (
        <div className={`rounded-lg border px-3 py-2 text-sm flex items-center gap-2 ${inboundBlocked ? "border-amber-300 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
          <Link2 className="h-4 w-4 shrink-0" />
          {inboundBlocked
            ? "Inbound tray is admin-restricted — you can browse but not attach files."
            : "Inbound drop zone — use Attach on a file to move it into a customer's linked folder. Files here stay non-deletable."}
        </div>
      )}

      {/* breadcrumbs */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
        <button className="hover:underline font-medium" onClick={() => setDir("")}>{rootKey || "root"}</button>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            <ChevronRight className="h-3.5 w-3.5" />
            <button className="hover:underline" onClick={() => setDir(crumbs.slice(0, i + 1).join("/"))}>{c}</button>
          </React.Fragment>
        ))}
      </div>

      {/* uploads */}
      {uploads.length > 0 && (
        <div className="rounded border divide-y text-sm">
          {uploads.map((u) => (
            <div key={u.id} className="px-3 py-1.5 flex items-center gap-2">
              {u.state.includes("failed") ? <XCircle className="h-4 w-4 text-red-500" /> : u.state.startsWith("applied") ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Loader2 className="h-4 w-4 animate-spin" />}
              <span className="font-medium">{u.name}</span><span className="text-muted-foreground">{u.state}</span>
            </div>
          ))}
        </div>
      )}

      {/* listing / search results */}
      {searchHits !== null ? (
        <div className="rounded-lg border">
          <div className="px-3 py-2 border-b text-sm font-medium flex items-center justify-between">
            <span>Search results ({searchHits.length})</span>
            <Button size="sm" variant="ghost" onClick={() => setSearchHits(null)}>Back to folder</Button>
          </div>
          <EntryTable entries={searchHits} busy={busy} canDelete={canDelete}
            onOpen={openFile} onDelete={deleteFile} onRestore={restoreFile}
            onNavigate={(p) => { setSearchHits(null); const parts = p.split("/"); setDir(parts.slice(0, -1).join("/")); }} />
        </div>
      ) : (
        <div className="rounded-lg border min-h-[200px]">
          {loading && entries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading{listSrc === "command" ? " (asking the server…)" : "…"}
            </div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {listSrc === "error" ? "Couldn't load this folder — the agent may be offline." : "Empty folder."}
            </div>
          ) : (
            <EntryTable entries={entries} busy={busy} canDelete={canDelete}
              onOpen={openFile} onDelete={deleteFile} onRestore={restoreFile} onEmail={emailFile}
              onAttach={isInbound && !inboundBlocked ? (r) => setAttachRow(r) : null}
              onNavigate={(p) => setDir(p)} />
          )}
        </div>
      )}
      {listSrc && listSrc !== "index" && listSrc !== "empty" && entries.length > 0 && (
        <div className="text-xs text-muted-foreground">Served {listSrc === "agent" || listSrc === "command" ? "live from the server" : `via ${listSrc}`} · {fmtBytes(entries.reduce((s, e) => s + (e.size || 0), 0))} visible</div>
      )}
      <FileViewerDialog open={!!viewer} file={viewer} onClose={() => setViewer(null)} />
      <InboundAttachDialog open={!!attachRow} rootKey={rootKey} file={attachRow}
        onClose={() => setAttachRow(null)} onAttached={() => { setAttachRow(null); loadDir(rootKey, dir, true); }} />
    </div>
  );
}

function EntryTable({ entries, busy, onOpen, onDelete, onRestore, onNavigate, onAttach, onEmail, canDelete }) {
  return (
    <div className="divide-y">
      {entries.map((r) => {
        const kind = r.kind || kindOfExt(r.ext, r.is_dir);
        const Icon = ICONS[kind] || FileIcon;
        const openBusy = busy[`open:${r.path}`]; const delBusy = busy[`del:${r.path}`];
        return (
          <div key={r.path_key || r.path} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 group">
            <Icon className={`h-5 w-5 shrink-0 ${r.is_dir ? "text-amber-500" : "text-slate-500"}`} />
            <button className="font-medium text-sm truncate hover:underline text-left flex-1 min-w-0"
              onClick={() => (r.is_dir ? onNavigate(r.path) : onOpen(r))}>
              {r.name}
            </button>
            {r.missing ? <Badge variant="outline" className="text-red-600 border-red-300">deleted</Badge> : null}
            <span className="text-xs text-muted-foreground w-20 text-right shrink-0">
              {r.is_dir ? (r.dir_size_bytes ? fmtBytes(r.dir_size_bytes) : "") : fmtBytes(r.size)}
            </span>
            <span className="text-xs text-muted-foreground w-32 text-right shrink-0 hidden md:block">
              {r.mtime_ms ? new Date(r.mtime_ms).toLocaleDateString() : ""}
            </span>
            <span className="w-44 text-xs shrink-0 text-right">
              {openBusy && <span className="text-blue-600">{openBusy}</span>}
              {delBusy && <span className="text-red-600">{delBusy}</span>}
              {busy[`mail:${r.path}`] && <span className="text-emerald-600">{busy[`mail:${r.path}`]}</span>}
            </span>
            <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              {onAttach && !r.is_dir && !r.missing && (
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" title="Attach to a customer folder" onClick={() => onAttach(r)}>
                  <Link2 className="h-3.5 w-3.5 mr-1" /> Attach
                </Button>
              )}
              {onEmail && !r.is_dir && !r.missing && (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Email a link to this file" onClick={() => onEmail(r)}>
                  <Mail className="h-4 w-4" />
                </Button>
              )}
              {!r.is_dir && !r.missing && (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Open" onClick={() => onOpen(r)}>
                  <Download className="h-4 w-4" />
                </Button>
              )}
              {r.missing && r.trash_path ? (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Restore from trash" onClick={() => onRestore(r)}>
                  <Undo2 className="h-4 w-4" />
                </Button>
              ) : null}
              {canDelete(r) && !r.missing && (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" title="Move to server trash (bridge-created file)" onClick={() => onDelete(r)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
