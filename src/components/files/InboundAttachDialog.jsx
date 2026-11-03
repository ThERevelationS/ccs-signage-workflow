import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, FolderOpen, User } from "lucide-react";
import { Customer } from "@/api/gatedEntities";
import { fbCall, waitForCommand } from "./fileBridgeClient";

// _Inbound tray attach flow: pick a customer → pick one of their confirmed
// server folders → enqueue `move` (same-root move; inbound files are
// managed_by:bridge so the agent accepts, origin stays external).
export default function InboundAttachDialog({ open, onClose, rootKey, file, onAttached }) {
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null);
  const [folders, setFolders] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setQ(""); setCustomers([]); setPicked(null); setFolders(null); setBusy(""); setErr("");
  }, [open, file?.path]);

  // debounced customer search — Customer is staff-visible, stays out of the
  // bridge budget entirely.
  useEffect(() => {
    if (!open || picked) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const rows = await Customer.filter({}, "company_name", 200).catch(() => []);
        const needle = q.trim().toLowerCase();
        setCustomers((rows || [])
          .filter((c) => !needle || String(c.company_name || c.name || "").toLowerCase().includes(needle))
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
      setFolders((d?.links || []).map((l) => l.link).filter(Boolean));
    } catch (e) {
      setErr(String(e?.response?.data?.error || e?.message || e));
      setFolders([]);
    }
  };

  const attach = async (link) => {
    setBusy("moving…"); setErr("");
    try {
      const r = await fbCall("queue_move", { root_key: rootKey, src: file.path, dest_dir: link.folder_path });
      const d = r?.data ?? r;
      if (!d?.command_id) throw new Error(d?.error || "enqueue failed");
      const c = await waitForCommand(d.command_id, { timeoutMs: 60_000 });
      if (c?.status === "completed") { onAttached?.(c.result); onClose?.(); return; }
      setErr(`move ${c?.status || "failed"}: ${c?.error || ""}`);
    } catch (e) {
      setErr(String(e?.response?.data?.error || e?.message || e));
    } finally { setBusy(""); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Attach to customer folder</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground truncate -mt-2">{file?.path}</div>

        {!picked && (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…" className="pl-8" autoFocus />
            </div>
            <div className="max-h-64 overflow-auto divide-y rounded border">
              {searching && <div className="p-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> searching…</div>}
              {!searching && customers.length === 0 && <div className="p-3 text-xs text-muted-foreground">No customers found.</div>}
              {customers.map((c) => (
                <button key={c.id} type="button" onClick={() => pickCustomer(c)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" />
                  <span className="text-sm truncate">{c.company_name || c.name || c.id}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {picked && (
          <>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold truncate">{picked.company_name || picked.name}</div>
              <Button size="sm" variant="ghost" onClick={() => { setPicked(null); setFolders(null); }}>Change</Button>
            </div>
            <div className="divide-y rounded border max-h-64 overflow-auto">
              {folders === null && <div className="p-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> checking linked folders…</div>}
              {folders?.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground">
                  No confirmed server folder for this customer — confirm a folder link on the Server Files page first.
                </div>
              )}
              {(folders || []).map((l) => (
                <button key={l.id || l.folder_path} type="button" disabled={!!busy} onClick={() => attach(l)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2 disabled:opacity-50">
                  <FolderOpen className="h-4 w-4 text-amber-500" />
                  <span className="text-sm truncate flex-1">{l.folder_path}</span>
                  <span className="text-xs text-muted-foreground">{l.root_key}</span>
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
