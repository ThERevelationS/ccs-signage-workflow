import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, ExternalLink, ShieldCheck, ShieldAlert, AlertTriangle, FileText } from "lucide-react";
import { assessRewriteAuthorityPromotion } from "./jurisdictionAuthorityGate";

const VERIFIED = "verified";

function hasAnyAuthorityData(authority) {
  if (!authority || typeof authority !== "object") return false;
  return Object.values(authority).some((v) => {
    if (v == null || v === "") return false;
    if (typeof v === "string" && v.trim() === "") return false;
    return true;
  });
}

function hasRewriteSignalInNotes(jurisdiction) {
  const haystacks = [jurisdiction?.notes, jurisdiction?.ai_summary].filter((v) => typeof v === "string" && v.trim());
  if (!haystacks.length) return false;
  // Simple, conservative signal: mentions "rewrite"/"replacement" alongside zoning/code/ordinance, or "draft" + "zoning".
  return haystacks.some((text) =>
    /\b(?:rewrite|replacement)\b.{0,60}\b(?:zoning|sign|code|ordinance|regulation)/i.test(text) ||
    /\b(?:zoning|sign|code|ordinance|regulation)\b.{0,60}\b(?:rewrite|replacement)\b/i.test(text) ||
    /\bdraft\b.{0,80}\b(?:zoning|sign|code|ordinance|regulation)/i.test(text)
  );
}

function formatDate(value) {
  if (!value) return null;
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return null;
  }
}

function StatusRow({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="shrink-0 font-medium text-gray-600">{label}:</span>
      <span className="min-w-0 break-words text-gray-800">{value}</span>
    </div>
  );
}

export default function JurisdictionAuthorityStatus({ jurisdiction }) {
  const [expanded, setExpanded] = useState(false);

  const authority = jurisdiction?.rewrite_authority || null;
  const authorityPresent = hasAnyAuthorityData(authority);
  const notesSignal = hasRewriteSignalInNotes(jurisdiction);
  const rewriteEvidenceExists = authorityPresent || notesSignal;

  const assessment = assessRewriteAuthorityPromotion({
    candidate: { jurisdiction_id: jurisdiction?.id, jurisdiction_name: jurisdiction?.name },
    authority: authority || {},
  });
  const promotable = assessment?.promotable === true;

  // Headline: plain-language answer to "which law is currently authoritative"
  const headline = promotable
    ? "Verified rewrite authority now in effect"
    : `Current authority: adopted sign & zoning regulations for ${jurisdiction?.name || "this jurisdiction"}, ${jurisdiction?.state || ""}`.replace(/,\s*$/, "");

  // Show the amber warning when rewrite evidence exists but is not yet authoritative
  const showWarning = rewriteEvidenceExists && !promotable;

  // Don't render the section at all if there's zero authority data and no rewrite signals —
  // nothing meaningful to show beyond what the trust badge already covers.
  if (!rewriteEvidenceExists) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-700">Current sign-law authority</p>
            <p className="mt-0.5 text-xs text-slate-600">
              {headline}. No pending rewrite authority evidence is recorded for this jurisdiction.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      {/* Headline */}
      <div className="flex items-start gap-2">
        {promotable ? (
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
        ) : (
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-800">Current sign-law authority</p>
          <p className="mt-0.5 text-xs text-gray-700">{headline}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          aria-expanded={expanded}
          aria-label={expanded ? "Hide authority details" : "Show authority details"}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          <span>{expanded ? "Hide" : "Details"}</span>
        </button>
      </div>

      {/* Amber warning: rewrite in progress but not yet law */}
      {showWarning && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
            <p className="text-[11px] leading-relaxed text-amber-900">
              A zoning/sign-regulation rewrite is in progress for {jurisdiction?.name || "this jurisdiction"} but is <strong>not yet law</strong>. The currently adopted rules still apply. Nothing here implies the rewrite is currently effective or applicable.
            </p>
          </div>
        </div>
      )}

      {/* Expandable status rows */}
      {expanded && (
        <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs">
          {/* Adoption status */}
          <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
            <span className="shrink-0 font-medium text-gray-600">Adoption status:</span>
            <Badge className={
              authority?.adoptionStatus === VERIFIED
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-600"
            }>
              {authority?.adoptionStatus === VERIFIED ? "Verified" : "Not verified"}
            </Badge>
          </div>

          {/* Effective-date status */}
          <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
            <span className="shrink-0 font-medium text-gray-600">Effective-date status:</span>
            <Badge className={
              authority?.effectiveDateStatus === VERIFIED
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-600"
            }>
              {authority?.effectiveDateStatus === VERIFIED ? "Verified" : "Not verified"}
            </Badge>
          </div>

          {/* Ordinance/action reference */}
          <StatusRow label="Ordinance / action reference" value={authority?.adoption_evidence_reference} />

          {/* Effective date */}
          <StatusRow label="Effective date" value={formatDate(authority?.effective_date)} />

          {/* Adoption evidence link */}
          {authority?.adoption_evidence_url && (
            <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <span className="shrink-0 font-medium text-gray-600">Adoption evidence:</span>
              <a
                href={authority.adoption_evidence_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 min-w-0 items-center gap-1 break-all text-blue-700 hover:underline"
              >
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                <span className="min-w-0 break-all">{authority.adoption_evidence_url}</span>
              </a>
            </div>
          )}

          {/* Effective-date evidence link */}
          {authority?.effective_date_evidence_url && (
            <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <span className="shrink-0 font-medium text-gray-600">Effective-date evidence:</span>
              <a
                href={authority.effective_date_evidence_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 min-w-0 items-center gap-1 break-all text-blue-700 hover:underline"
              >
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                <span className="min-w-0 break-all">{authority.effective_date_evidence_url}</span>
              </a>
            </div>
          )}

          {/* Verification date + reviewer */}
          {authority?.adoption_verified_at && (
            <StatusRow
              label="Adoption verified"
              value={`${formatDate(authority.adoption_verified_at)}${authority.adoption_verified_by ? ` by ${authority.adoption_verified_by}` : ""}`}
            />
          )}
          {authority?.effective_date_verified_at && (
            <StatusRow
              label="Effective-date verified"
              value={`${formatDate(authority.effective_date_verified_at)}${authority.effective_date_verified_by ? ` by ${authority.effective_date_verified_by}` : ""}`}
            />
          )}

          {/* Verification notes */}
          {authority?.verification_notes && (
            <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <span className="shrink-0 font-medium text-gray-600">Notes:</span>
              <span className="min-w-0 whitespace-pre-wrap break-words text-gray-700">{authority.verification_notes}</span>
            </div>
          )}

          {/* Source of the signal when authority object is absent but notes mention a rewrite */}
          {!authorityPresent && notesSignal && (
            <div className="flex items-start gap-1.5 pt-1 text-[11px] text-gray-500">
              <FileText className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span>Rewrite activity mentioned in this jurisdiction's notes. No formal authority evidence has been recorded yet.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}