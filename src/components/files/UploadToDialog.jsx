import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, FolderOpen, User, Upload } from "lucide-react";
import { Customer } from "@/api/gatedEntities";
import { fbCall } from "./fileBridgeClient";

// "Upload to…" destination picker — choose where staged files land before the
// file dialog opens: a customer's confirmed folder (stamps customer_id
// provenance on the upload ledger) or a free path under the current root.
export default function UploadToDialog({ open, onClose, rootKey, onPicked }) {
  const [pathMode, setPathMode] = useState(false);
  const [freePath, setFreePath] = useState("");
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null);
  const [folders, setFolders] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setPathMode(false); setFreePath(""); setQ(""); setCustomers([]);
    setPicked(null); setFolders(null); setErr("");
  }, [open]);

  useEffect(() => {
    if (!open || picked || pathMode) return;
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
  }, [q, open, picked, pathMode]);

  const pickCustomer = async (c) => {
    setPicked(c); setFolders(null); setErr("");
    try {
      const r = await fbCall("get_customer_files", { customer_id: c.id, limit: 1 });
      const d = r?.data ?? r;
      setFolders((d?.links || []).map((l) => l.link).filter((l) => l && l.root_key === rootKey));
    } catch (e) {
      setErr(String(e?.response?.data?.error || e?.message || e));
      setFolders([]);
    }
  };

  const pickLink = (l) => {
    onPicked?.({ dest_dir: l.folder_path, customer_id: l.customer_id, label: `${picked.company_name || picked.name} → ${l.folder_path}` });
    onClose?.();
  };

  const pickPath = () => {
    const d = freePath.trim().replace(/^\/+|\/+$/g, "");
    onPicked?.({ dest_dir: d, customer_id: "", label: `${rootKey}/${d || ""}` });
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" /> Upload to server folder</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Button size="sm" variant={!pathMode ? "default" : "outline"} onClick={() => setPathMode(false)}>Customer folder</Button>
          <Button size="sm" variant={pathMode ? "default" : "outline"} onClick={() => setPathMode(true)}>Type a path</Button>
        </div>

        {pathMode ? (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Folder under {rootKey}</label>
            <div className="flex gap-2 mt-1">
              <Input value={freePath} onChange={(e) => setFreePath(e.target.value)} placeholder="e.g. Acme Sign Co/Artwork" />
              <Button size="sm" onClick={pickPath}>Choose files…</Button>
            </div>
            <div className="text-xs text-muted-foreground mt-1">The folder is created by the agent if missing.</div>
          </div>
        ) : !picked ? (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…" className="pl-8" autoFocus />
            </div>
            <div className="max-h-64 overflow-auto divide-y rounded border">
              {searching && <div className="p-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> searching…</div>}
              {!searching && q.trim() && customers.length === 0 && <div className="p-3 text-xs text-muted-foreground">No customers found.</div>}
              {customers.map((c) => (
                <button key={c.id} type="button" onClick={() => pickCustomer(c)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" />
                  <span className="text-sm truncate">{c.company_name || c.name || c.id}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold truncate">{picked.company_name || picked.name}</div>
              <Button size="sm" variant="ghost" onClick={() => { setPicked(null); setFolders(null); }}>Change</Button>
            </div>
            <div className="divide-y rounded border max-h-64 overflow-auto">
              {folders === null && <div className="p-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> checking linked folders…</div>}
              {folders?.length === 0 && <div className="p-3 text-xs text-muted-foreground">No confirmed folder on this root — confirm a folder link on the Server Files page first.</div>}
              {(folders || []).map((l) => (
                <button key={l.id || l.folder_path} type="button" onClick={() => pickLink(l)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-amber-500" />
                  <span className="text-sm truncate flex-1">{l.folder_path}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {err && <div className="text-xs text-red-600">{err}</div>}
      </DialogContent>
    </Dialog>
  );
}
