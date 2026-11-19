import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, FolderOpen, User, FolderInput } from "lucide-react";
import { Customer } from "@/api/gatedEntities";
import { fbCall, waitForCommand } from "./fileBridgeClient";

// Move/rename flow for bridge-managed files (origin|managed_by bridge — the
// agent refuses anything else). Destinations: free path under the same root,
// or a customer's confirmed linked folder. Optional new_name renames on the
// way (single file only); collisions auto-suffix server-side.
export default function MoveFileDialog({ open, onClose, rootKey, files, currentDir, onMoved }) {
  const list = Array.isArray(files) ? files : files ? [files] : [];
  const single = list.length === 1 ? list[0] : null;
  const [destDir, setDestDir] = useState("");
  const [newName, setNewName] = useState("");
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null);
  const [folders, setFolders] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setDestDir(currentDir || ""); setNewName(""); setQ(""); setCustomers([]);
    setPicked(null); setFolders(null); setBusy(""); setErr("");
  }, [open, currentDir, files]);

  useEffect(() => {
    if (!open || picked) return;
    const t = setTimeout(async () => {
      if (!q.trim()) { setCustomers([]); return; }
      setSearching(true);
      try {
        const rows = await Customer.filter({}, "company_name", 200).catch(() => []);
        const needle = q.trim().toLowerCase();
        setCustomers((rows || [])
          .filter((c) => String(c.company_name || c.name || "").toLowerCase().includes(needle))
          .slice(0, 15));
      } finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open, picked]);

  const pickCustomer = async (c) => {
    setPicked(c); setFolders(null); setErr("");
    try {
      const r = await fbCall("get_customer_files", { customer_id: c.id, limit: 1 });
      const d = r?.data ?? r;
      // same-root destinations only — cross-root move isn't supported
      setFolders((d?.links || []).map((l) => l.link).filter((l) => l && l.root_key === rootKey));
    } catch (e) {
      setErr(String(e?.response?.data?.error || e?.message || e));
      setFolders([]);
    }
  };

  const doMove = async (dest, name) => {
    const d = String(dest || "").trim().replace(/^\/+|\/+$/g, "");
    setBusy("moving…"); setErr("");
    try {
      let failed = 0;
      for (const f of list) {
        const r = await fbCall("queue_move", {
          root_key: rootKey, src: f.path, dest_dir: d,
          new_name: list.length === 1 ? (name || undefined) : undefined,
        });
        const dd = r?.data ?? r;
        if (!dd?.command_id) { failed += 1; setErr(dd?.error || "enqueue failed"); continue; }
        const c = await waitForCommand(dd.command_id, { timeoutMs: 60_000 });
        if (c?.status !== "completed") { failed += 1; setErr(`${f.name}: ${c?.error || c?.status}`); }
      }
      if (failed === 0) { onMoved?.(); onClose?.(); return; }
      onMoved?.();
    } catch (e) {
      setErr(String(e?.response?.data?.error || e?.message || e));
    } finally { setBusy(""); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <FolderInput className="h-4 w-4" /> Move {list.length > 1 ? `${list.length} files` : "file"}
          </DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground truncate -mt-2">
          {single ? single.path : `${list.length} items selected`}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Destination folder (under {rootKey})</label>
          <div className="flex gap-2 mt-1">
            <Input value={destDir} onChange={(e) => setDestDir(e.target.value)} placeholder="e.g. Acme Sign Co/2026" />
            <Button size="sm" disabled={!!busy} onClick={() => doMove(destDir, newName.trim() || undefined)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Move"}
            </Button>
          </div>
        </div>

        {single && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Rename to (optional)</label>
            <Input className="mt-1" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={single.name} />
          </div>
        )}

        {!picked ? (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="…or pick a customer folder" className="pl-8" />
            </div>
            {customers.length > 0 && (
              <div className="max-h-44 overflow-auto divide-y rounded border">
                {searching && <div className="p-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> searching…</div>}
                {customers.map((c) => (
                  <button key={c.id} type="button" onClick={() => pickCustomer(c)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2">
                    <User className="h-4 w-4 text-slate-400" />
                    <span className="text-sm truncate">{c.company_name || c.name || c.id}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold truncate">{picked.company_name || picked.name}</div>
              <Button size="sm" variant="ghost" onClick={() => { setPicked(null); setFolders(null); }}>Change</Button>
            </div>
            <div className="divide-y rounded border max-h-44 overflow-auto">
              {folders === null && <div className="p-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> checking linked folders…</div>}
              {folders?.length === 0 && <div className="p-3 text-xs text-muted-foreground">No confirmed folder on this root — confirm a link first, or type a path above.</div>}
              {(folders || []).map((l) => (
                <button key={l.id || l.folder_path} type="button" disabled={!!busy}
                  onClick={() => { setDestDir(l.folder_path); doMove(l.folder_path, newName.trim() || undefined); }}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2 disabled:opacity-50">
                  <FolderOpen className="h-4 w-4 text-amber-500" />
                  <span className="text-sm truncate flex-1">{l.folder_path}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {err && <div className="text-xs text-red-600">{err}</div>}
        {busy && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {busy}</div>}
      </DialogContent>
    </Dialog>
  );
}
