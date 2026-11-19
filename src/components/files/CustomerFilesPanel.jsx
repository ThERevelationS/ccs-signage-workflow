import React, { useCallback, useEffect, useState } from "react";
import { Folder, FolderOpen, Loader2, Download, RefreshCw, Link2, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fbCall, waitForCommand, fmtBytes, kindOfExt } from "./fileBridgeClient";

// Customer360 embed: the customer's linked server folders + their files.
// Reads stay inside fileBridgeAction — entities are backend-only.
export default function CustomerFilesPanel({ customerId, customerName }) {
  const [data, setData] = useState(null); // [{link, files}]
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const r = await fbCall("get_customer_files", { customer_id: customerId, limit: 100 });
      const d = r?.data ?? r;
      setData(d?.links || []);
      setErr("");
    } catch (e) {
      setErr(String(e?.response?.data?.error || e?.message || e));
      setData([]);
    } finally { setLoading(false); }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  const openFile = async (row, root_key) => {
    const key = `open:${row.path}`;
    setBusy((b) => ({ ...b, [key]: "fetching…" }));
    try {
      if (row.delivered_url && !(row.delivered_at_ms && row.mtime_ms > row.delivered_at_ms)) {
        window.open(row.delivered_url, "_blank", "noopener");
        return;
      }
      const r = await fbCall("queue_fetch", { root_key, path: row.path, sha256: row.sha256, size: row.size });
      const d = r?.data ?? r;
      if (!d?.command_id) throw new Error(d?.error || "enqueue failed");
      const c = await waitForCommand(d.command_id, { timeoutMs: 300_000 });
      if (c?.result?.file_url) window.open(c.result.file_url, "_blank", "noopener");
      else setBusy((b) => ({ ...b, [key]: `failed: ${c?.error || c?.status}` }));
    } catch (e) {
      setBusy((b) => ({ ...b, [key]: `failed: ${String(e?.response?.data?.error || e.message || e).slice(0, 60)}` }));
    } finally {
      setBusy((b) => { const n = { ...b }; if (!String(n[key] || "").startsWith("failed")) delete n[key]; return n; });
    }
  };

  if (loading) return (
    <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" /> Checking server folders…
    </div>
  );

  if (err) return (
    <div className="p-6 text-sm text-amber-700 bg-amber-50 rounded-lg border border-amber-200">
      Server files unavailable: {err}
      <Button size="sm" variant="outline" className="ml-3" onClick={load}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry</Button>
    </div>
  );

  const groups = data || [];
  if (!groups.length) return (
    <div className="p-6 text-sm text-muted-foreground rounded-lg border border-dashed">
      <HardDrive className="h-5 w-5 mb-2 text-slate-400" />
      No server folder linked to {customerName || "this customer"} yet.
      When a matching folder is found on the file server it will appear here (or in the review queue on the Server Files page).
    </div>
  );

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.link?.id || g.link?.folder_path} className="rounded-lg border">
          <div className="px-3 py-2 border-b flex items-center gap-2 bg-muted/30">
            <FolderOpen className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold truncate">{g.link?.folder_path}</span>
            <Badge variant="outline" className="ml-auto">{g.link?.root_key}</Badge>
          </div>
          <div className="divide-y">
            {(g.files || []).length === 0 && (
              <div className="px-3 py-3 text-xs text-muted-foreground">Folder is empty (or not yet indexed).</div>
            )}
            {(g.files || []).map((f) => {
              const kind = kindOfExt(f.ext, false);
              const b = busy[`open:${f.path}`];
              return (
                <div key={f.path_key || f.path} className="flex items-center gap-3 px-3 py-1.5 hover:bg-muted/40">
                  <Folder className="h-4 w-4 text-slate-400" />
                  <span className="text-sm truncate flex-1">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{fmtBytes(f.size)}</span>
                  <span className="text-xs w-36 text-right">{b || (f.mtime_ms ? new Date(f.mtime_ms).toLocaleDateString() : "")}</span>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Open from server" onClick={() => openFile(f, g.link?.root_key)}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Link2 className="h-3 w-3" /> Files live on the shop file server — opened on demand via the File Bridge.
      </div>
    </div>
  );
}
