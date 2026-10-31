import React, { useRef, useState } from "react";
import { FileCheck2, ExternalLink, History, Loader2, Upload } from "lucide-react";
import { UploadFile } from "@/integrations/Core";
import { transitionProductAndBuilderStatus } from "@/components/estimator/workOrderConversion";
import { openExternalHttpUrl, safeExternalHttpUrl } from "@/utils/safeExternalUrl";
import {
  canApproveProof,
  canRequestApproval,
  canRequestRevision,
  proofBadge,
  proofHistory,
  proofVersionOf,
  nextProofPatch,
} from "./proofModel";

const TONE = {
  wip: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
  blocked: "bg-rose-100 text-rose-800",
  muted: "bg-gray-100 text-gray-600",
};

const FIELD_LABELS = {
  proof_status: "Proof status",
  proof_file_url: "Proof file",
  proof_file_name: "Proof file name",
  proof_version: "Proof version",
  proof_approved_version: "Approved version",
};

const inp = "rounded border border-gray-300 bg-white px-1.5 py-1 text-xs";
const lab = "text-[10px] font-semibold uppercase tracking-wide text-gray-500";
const btn = `${inp} font-semibold`;

// Per-product proof panel: current proof file, approval/version badges and the
// send/approve/revise/supersede actions. Used by the ProductQueue row editor
// and reusable by any work-order product view.
export default function ProofPanel({ workOrderId, product, actor = "", disabled = false, onChanged }) {
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  const p = product || {};
  const badge = proofBadge(p);
  const fileUrl = safeExternalHttpUrl(p.proof_file_url);
  const fileName = String(p.proof_file_name || "").trim() || (fileUrl ? "View proof file" : "");
  const version = proofVersionOf(p);
  const history = proofHistory(p);
  const noId = !String(p.id || "").trim();
  const locked = disabled || busy || noId;

  const apply = async (action, extra = {}) => {
    setBusy(true);
    setError("");
    try {
      const patch = nextProofPatch(p, action, { leadTimeDays, ...extra });
      await transitionProductAndBuilderStatus({
        workOrderId,
        product: p,
        patch,
        actor,
        label: "Proof workflow",
      });
      onChanged?.();
    } catch (e) {
      setError(e?.message || "Proof update failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const result = await UploadFile({ file });
      await apply("supersede", {
        fileUrl: result?.file_url || "",
        fileName: file.name,
        fileVersion: version + 1,
      });
    } catch (uploadError) {
      setError(uploadError?.message || "The proof file could not be uploaded.");
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded border border-sky-100 bg-white/80 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={lab}>Proof</span>
        <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${TONE[badge.tone]}`}>
          {badge.label}
        </span>
        {version > 0 && (
          <span className="text-[10px] text-gray-500">
            file v{version}{p.proof_approved_version ? ` / approved v${p.proof_approved_version}` : ""}
          </span>
        )}
        {fileUrl ? (
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-[11px] text-sky-700 hover:underline"
            onClick={() => openExternalHttpUrl(fileUrl)}
            title={fileName}
          >
            <FileCheck2 className="h-3 w-3" />
            {fileName}
            <ExternalLink className="h-2.5 w-2.5" />
          </button>
        ) : (
          <span className="text-[11px] text-gray-400">no proof file</span>
        )}
        {busy && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className={`${btn} text-sky-700`}
          disabled={locked || !canRequestApproval(p)}
          title={noId ? "Product has no id — reopen the Work Order to repair it" : "Send this proof version to the customer for approval"}
          onClick={() => apply("send_proof")}
        >
          Send for Approval
        </button>
        <button
          type="button"
          className={`${btn} text-emerald-700`}
          disabled={locked || !canApproveProof(p)}
          title={noId ? "Product has no id — reopen the Work Order to repair it" : "Approve the current proof version"}
          onClick={() => apply("approve")}
        >
          Approve
        </button>
        <button
          type="button"
          className={`${btn} text-rose-700`}
          disabled={locked || !canRequestRevision(p)}
          title={noId ? "Product has no id — reopen the Work Order to repair it" : "Request changes; invalidates any approval"}
          onClick={() => apply("request_revision")}
        >
          Request Revision
        </button>
        <button
          type="button"
          className={`${btn} text-gray-700`}
          disabled={locked}
          title={noId ? "Product has no id — reopen the Work Order to repair it" : "Upload a new proof file version (supersedes the current one)"}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-0.5 inline h-3 w-3" />
          Upload New Version
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf"
          onChange={handleUpload}
        />
        <label className="flex items-center gap-1 text-[10px] text-gray-500" title="Part lead time used to recalculate the product due date on approval">
          Lead days
          <input
            className={`${inp} w-12`}
            type="number"
            min="0"
            disabled={disabled}
            value={leadTimeDays}
            onChange={(e) => setLeadTimeDays(Number(e.target.value) || 0)}
          />
        </label>
        {history.length > 0 && (
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-gray-500 hover:text-gray-700"
            onClick={() => setShowHistory((v) => !v)}
          >
            <History className="h-3 w-3" />
            {showHistory ? "Hide history" : `History (${history.length})`}
          </button>
        )}
      </div>

      {showHistory && history.length > 0 && (
        <div className="mt-1.5 max-h-24 overflow-y-auto rounded border border-gray-100 bg-gray-50/60 p-1.5">
          {history.slice().reverse().map((entry, i) => (
            <div key={`${entry.at}-${i}`} className="text-[10px] text-gray-500">
              {entry.at ? new Date(entry.at).toLocaleString() : "—"}
              {" · "}{FIELD_LABELS[entry.field] || entry.field}
              {entry.from !== "" || entry.to !== "" ? `: ${String(entry.from || "—")} → ${String(entry.to || "—")}` : ""}
              {entry.by ? ` · ${entry.by}` : ""}
            </div>
          ))}
        </div>
      )}

      {error && <div className="mt-1 text-xs text-rose-700">{error}</div>}
    </div>
  );
}
