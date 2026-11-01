import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HardDrive, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { LEGACY_PUBLIC_ASSET_PATHS } from "@/shared/publicAssetPaths";
import { loadHostedAssetManifest } from "@/shared/hostedAssetUrl";

const MIME = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  svg: "image/svg+xml", pdf: "application/pdf", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const mimeFor = (path) => MIME[String(path.split(".").pop() || "").toLowerCase()] || "application/octet-stream";
const fileNameFor = (path) => path.split("/").pop() || "asset";

/**
 * One-time migration: copies legacy public/ assets (fleet photos, permitting
 * evidence) into Base44 file storage and records a path→URL manifest via
 * hostedAssetManifest. Idempotent — already-migrated paths are skipped.
 * After this runs, the dirs can leave public/ (deploy cap fix).
 */
export default function AssetMigrationPanel() {
  const { sessionToken, isRegistered } = useAuth();
  const [status, setStatus] = useState("idle"); // idle | loading | running | done | error
  const [manifest, setManifest] = useState({});
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);

  const migratedCount = useMemo(
    () => LEGACY_PUBLIC_ASSET_PATHS.filter((p) => manifest[p]).length,
    [manifest]
  );

  const load = async () => {
    setStatus("loading");
    const m = await loadHostedAssetManifest();
    setManifest({ ...m });
    setStatus("idle");
  };
  React.useEffect(() => { load(); }, []);

  const run = async () => {
    setStatus("running");
    setSaved(false);
    setErrors([]);
    const pending = LEGACY_PUBLIC_ASSET_PATHS.filter((p) => !manifest[p]);
    const next = { ...manifest };
    const errs = [];
    setProgress({ done: 0, total: pending.length });
    for (let i = 0; i < pending.length; i++) {
      const path = pending[i];
      try {
        const resp = await fetch(path);
        if (!resp.ok) throw new Error(`fetch ${resp.status}`);
        const blob = await resp.blob();
        const file = new File([blob], fileNameFor(path), { type: mimeFor(path) });
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        if (!file_url) throw new Error("no file_url returned");
        next[path] = file_url;
      } catch (e) {
        errs.push(`${path}: ${e?.message || e}`);
      }
      setProgress({ done: i + 1, total: pending.length });
      setManifest({ ...next });
    }
    setErrors(errs);

    if (Object.keys(next).length > 0) {
      try {
        const res = await base44.functions.invoke("hostedAssetManifest", {
          op: "save_manifest",
          session_token: sessionToken,
          manifest: next,
        });
        if (!res?.data?.saved) throw new Error(res?.data?.error || "save rejected");
        setSaved(true);
      } catch (e) {
        errs.push(`manifest save failed: ${e?.message || e}`);
        setErrors([...errs]);
      }
    }
    setStatus(errs.length ? "error" : "done");
  };

  return (
    <Card className="mt-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-indigo-600" />
          Legacy Site Asset Migration
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        <p className="text-slate-600">
          Copies <code>/fleet-assets</code> and <code>/permitting-evidence</code> files into file storage so they no
          longer ship inside the site bundle (the 50&nbsp;MB deploy cap cause). Existing links keep working via the
          hosted-asset resolver.
        </p>
        <div className="flex items-center gap-3">
          <span className="text-slate-700 font-medium">{migratedCount} / {LEGACY_PUBLIC_ASSET_PATHS.length} migrated</span>
          {status === "running" && (
            <span className="text-slate-500 inline-flex items-center gap-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {progress.done}/{progress.total}
            </span>
          )}
          {saved && status === "done" && (
            <span className="text-green-700 inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Manifest saved</span>
          )}
        </div>
        {status === "running" && (
          <div className="h-1.5 rounded bg-slate-100 overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        )}
        {errors.length > 0 && (
          <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 max-h-32 overflow-y-auto">
            <div className="flex items-center gap-1 font-medium mb-1"><AlertTriangle className="w-3.5 h-3.5" /> {errors.length} error(s)</div>
            {errors.slice(0, 20).map((e, i) => <div key={i} className="truncate">{e}</div>)}
          </div>
        )}
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={run} disabled={!isRegistered || status === "running" || status === "loading" || migratedCount === LEGACY_PUBLIC_ASSET_PATHS.length}>
            {status === "running" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {migratedCount === LEGACY_PUBLIC_ASSET_PATHS.length ? "All migrated" : migratedCount > 0 ? "Resume migration" : "Run migration"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={load} disabled={status === "loading" || status === "running"}>
            <RefreshCw className={`w-4 h-4 mr-1 ${status === "loading" ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
