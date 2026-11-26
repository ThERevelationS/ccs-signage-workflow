import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { PermitChecklist } from "./PermitChecklist";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, differenceInDays } from "date-fns";
import { ChevronDown, ChevronRight, ExternalLink, Info, Loader2, MapPin, ShieldAlert, Trash2, UserRoundPlus } from "lucide-react";
import PermitLineLifecycleDetails from "./PermitLineLifecycleDetails";
import { firstIncompleteStep, getPermitLineHandoffReadiness, isPermitLineEffectivelyComplete } from "./permitQueue";
import { loadAllEntityRows } from "@/lib/loadAllEntityRows";
import { normalizePermitJurisdictionName } from "./jurisdictionPermitBridge";
import { assessJurisdictionTrust, isJurisdictionPlaceholder } from "./jurisdictionTrust";

const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Office type color coding — supports multiple types via array
const officeTypeColors = {
  "Zoning": { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
  "Building": { bg: '#DBEAFE', text: '#1E40AF', border: '#3B82F6' },
  "Electrical Inspectors": { bg: '#FCE7F3', text: '#9D174D', border: '#EC4899' },
  "Electrical": { bg: '#FCE7F3', text: '#9D174D', border: '#EC4899' },
};
const getTypeStyle = (t) => officeTypeColors[t] || { bg: '#F3F4F6', text: '#374151', border: '#9CA3AF' };

// Normalize lineItem's office types to array
const getOfficeTypes = (lineItem) => {
  if (Array.isArray(lineItem?.office_types) && lineItem.office_types.length) return lineItem.office_types;
  if (lineItem?.office_type) return [lineItem.office_type];
  return [];
};

export default function PermitSpreadsheetRow({
  lineItem,
  onOpenStep,
  onUpdateField,
  onShowLocalityInfo,
  onShowJurisdictionInfo,
  localityState,
  locality = null,
  officeAuthority,
  legacyOfficeOptions = [],
  onLinkLegacyOffice,
  onDeleteLine,
  isRegistered,
  users,
  currentUser,
  today,
  expanded,
  onToggle: toggleExpanded,
  installDate = ""
}) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [linkOfficeOpen, setLinkOfficeOpen] = useState(false);
  const [selectedOfficeId, setSelectedOfficeId] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [jurisdictionPreviewOpen, setJurisdictionPreviewOpen] = useState(false);
  const [jurisdictionPreviewLoading, setJurisdictionPreviewLoading] = useState(false);
  const [jurisdictionPreviewError, setJurisdictionPreviewError] = useState("");
  const [jurisdictionMatches, setJurisdictionMatches] = useState(null);
  const linkOfficeTriggerRef = useRef(null);
  const linkOfficeSelectRef = useRef(null);

  const isCompleted = isPermitLineEffectivelyComplete(lineItem);
  const blockers = getPermitLineHandoffReadiness(lineItem, today).blockers;

  useEffect(() => {
    if (linkOfficeOpen && !linkSaving) {
      requestAnimationFrame(() => linkOfficeSelectRef.current?.focus());
    }
  }, [linkOfficeOpen, linkSaving]);

  useEffect(() => {
    setJurisdictionMatches(null);
    setJurisdictionPreviewError("");
    setJurisdictionPreviewOpen(false);
  }, [lineItem.locality_name, localityState]);

  // Follow-up highlighting
  const getFollowupStyle = () => {
    if (isCompleted) return {};
    const followupDate = lineItem.next_followup_date;
    if (!followupDate || !today) return {};
    const fd = parseLocalDate(followupDate);
    const td = parseLocalDate(today);
    if (!fd || !td) return {};
    const diff = differenceInDays(fd, td);
    if (diff < -7) return { borderLeft: '4px solid #dc2626', backgroundColor: '#fef2f2' };
    if (diff < 0) return { borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb' };
    if (diff <= 3) return { borderLeft: '4px solid #3b82f6', backgroundColor: '#eff6ff' };
    return {};
  };

  const officeTypes = getOfficeTypes(lineItem);
  const followupStyle = getFollowupStyle();
  const expectedReplyOverdue = (() => {
    if (isCompleted || !today || !lineItem.expected_response_date) return false;
    const ed = parseLocalDate(lineItem.expected_response_date);
    const td = parseLocalDate(today);
    return !!(ed && td && differenceInDays(ed, td) < 0);
  })();
  const permitExpired = (() => {
    if (isCompleted || !today || !lineItem.permit_expiration_date) return false;
    const ed = parseLocalDate(lineItem.permit_expiration_date);
    const td = parseLocalDate(today);
    return !!(ed && td && differenceInDays(ed, td) < 0);
  })();
  const permitExpiresBeforeInstall = (() => {
    if (isCompleted || !installDate || !lineItem.permit_expiration_date) return false;
    const ed = parseLocalDate(lineItem.permit_expiration_date);
    const id = parseLocalDate(installDate);
    return !!(ed && id && differenceInDays(ed, id) < 0);
  })();
  const localityLabel = lineItem.locality_name || "—";
  const appliedByLabel = (() => {
    const who = lineItem.applied_by || lineItem.created_by || "";
    const when = lineItem.applied_date || lineItem.created_date || "";
    if (!who && !when) return "";
    const date = when ? (() => { try { return format(new Date(when), "MMM d"); } catch { return when.slice(0, 10); } })() : "";
    return `Linked by ${who || "unknown"}${date ? ` · ${date}` : ""}`;
  })();
  const currentUserOwnerLabel = currentUser?.full_name || currentUser?.email || "";
  const ownerOptions = [...new Set((users || []).map((user) => user.full_name || user.email).filter(Boolean))].sort();
  if (currentUserOwnerLabel && !ownerOptions.includes(currentUserOwnerLabel)) ownerOptions.unshift(currentUserOwnerLabel);
  if (lineItem.assigned_to && !ownerOptions.includes(lineItem.assigned_to)) ownerOptions.unshift(lineItem.assigned_to);
  const canAssignToMe = isRegistered && !isCompleted && !String(lineItem.assigned_to || "").trim() && !!currentUserOwnerLabel;

  const loadJurisdictionPreview = async () => {
    if (jurisdictionMatches !== null || jurisdictionPreviewLoading || !lineItem.locality_name) return;
    setJurisdictionPreviewLoading(true);
    setJurisdictionPreviewError("");
    try {
      const rows = await loadAllEntityRows({
        entity: base44.entities.JurisdictionProfile,
        sort: "name",
        label: `Jurisdiction preview ${lineItem.locality_name}`,
      });
      const normalizedName = normalizePermitJurisdictionName(lineItem.locality_name);
      const normalizedState = String(localityState || "").trim().toLowerCase();
      const matches = (Array.isArray(rows) ? rows : []).filter((jurisdiction) => {
        if (normalizePermitJurisdictionName(jurisdiction?.name) !== normalizedName) return false;
        if (!normalizedState) return true;
        return String(jurisdiction?.state || "").trim().toLowerCase() === normalizedState;
      });
      setJurisdictionMatches(matches);
    } catch (error) {
      console.error("Could not load jurisdiction knowledge preview:", error);
      setJurisdictionPreviewError("Jurisdiction knowledge could not be loaded. Open the full Jurisdictions view to retry.");
    } finally {
      setJurisdictionPreviewLoading(false);
    }
  };

  return (
    <div
      className={`group/line px-3 py-2 transition-colors ${isCompleted ? 'opacity-60 bg-gray-50/40' : 'hover:bg-gray-50/40'}`}
      style={followupStyle}
    >
      {!expanded ? (() => {
        const next = firstIncompleteStep(lineItem);
        return <button type="button" onClick={toggleExpanded} aria-expanded={false}
          className="grid w-full min-w-0 gap-2 rounded py-2 text-left text-xs sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,.8fr)] sm:items-center">
          <span className="flex min-w-0 items-start gap-2"><ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-purple-700" /><span className="min-w-0">
            <strong className="block break-words text-sm text-slate-900">{lineItem.row_name || officeAuthority?.office_name || officeTypes.join(", ") || "Permit"}</strong>
            <span className="text-slate-600">{localityLabel}{lineItem.permit_number && ` · #${lineItem.permit_number}`}</span>
          </span></span>
          <span className="pl-6 sm:pl-0"><span className="block text-slate-500">Current step</span>{isCompleted ? "Complete" : next?.name || "Review permit"}
            {blockers.length > 0 && <strong className="block text-red-800">{blockers[0]}</strong>}
            {(expectedReplyOverdue || permitExpired) && <strong className="block text-amber-800">{permitExpired ? "Renewal needed" : "Reply overdue"}</strong>}
          </span>
          <span className="pl-6 text-slate-700 sm:pl-0">{lineItem.assigned_to || "Unassigned"}<span className="block text-slate-500">Follow-up: {lineItem.next_followup_date || "Not scheduled"}</span></span>
        </button>;
      })() : (
      <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={toggleExpanded} aria-expanded={true} title="Collapse permit"
          className="flex min-h-10 min-w-0 items-center gap-2 rounded text-left font-semibold text-slate-900 hover:text-purple-800">
          <ChevronDown className="h-4 w-4 shrink-0" />
          {lineItem.row_name || officeAuthority?.office_name || "Permit details"} · {localityLabel}
        </button>
        <div className="flex flex-wrap items-center gap-1">
          {expectedReplyOverdue && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full leading-tight" style={{ backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }} title="The office's stated reply date has passed — time to call them.">PAST DUE</span>
          )}
          {permitExpired && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full leading-tight" style={{ backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #dc2626' }} title="This permit has expired — start the renewal before the install.">RENEWAL NEEDED</span>
          )}
          {permitExpiresBeforeInstall && !permitExpired && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full leading-tight" style={{ backgroundColor: '#fff7ed', color: '#9a3412', border: '1px solid #ea580c' }} title="The permit expires before the install date — renew or extend it first.">EXPIRES BEFORE INSTALL</span>
          )}
          {officeTypes.length === 0 ? (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#F3F4F6', color: '#374151', border: '1px solid #9CA3AF' }}
            >—</span>
          ) : officeTypes.map((t, i) => {
            const st = getTypeStyle(t);
            return (
              <span
                key={`${t}-${i}`}
                className="text-[10px] font-bold px-2 py-0.5 rounded-full leading-tight text-center"
                style={{ backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}`, maxWidth: '120px', whiteSpace: 'normal' }}
              >
                {t}
              </span>
            );
          })}
        </div>

      </div>

      {blockers.length > 0 && <ul aria-label="Permit blockers" className="mb-2 border-l-4 border-red-500 bg-red-50 px-3 py-2 text-xs text-red-900">{blockers.map(message => <li key={message}>{message}</li>)}</ul>}
      <p className="mb-2 text-xs text-slate-600">Owner: {lineItem.assigned_to || "Unassigned"} · Follow-up: {lineItem.next_followup_date || "Not scheduled"}</p>
      <PermitChecklist line={lineItem} canEdit={isRegistered} onOpen={onOpenStep} />
      <details className="mt-2 rounded border px-3 py-2"><summary className="cursor-pointer text-xs font-semibold text-slate-700">Permit actions &amp; office settings</summary>
        <div className="space-y-2 pt-2">
            <div className="flex items-center gap-1.5">
              <span
                className="truncate font-medium text-gray-800 text-[13px]"
                title={localityLabel}
              >
                {localityLabel}
                {appliedByLabel && <span className="block text-[9px] text-gray-400 font-normal">{appliedByLabel}</span>}
              </span>
              {lineItem.locality_id && (
                <button type="button"
                  onClick={() => onShowLocalityInfo(lineItem.locality_id)}
                  className="h-6 w-6 flex items-center justify-center rounded-md bg-blue-50 hover:bg-blue-100 border border-blue-200 flex-shrink-0"
                  title="View configured tracker locality"
                  aria-label={`View configured tracker locality for ${localityLabel}`}
                >
                  <Info className="w-4 h-4 text-blue-600" />
                </button>
              )}
              {lineItem.locality_name && onShowJurisdictionInfo && (
                <Popover
                  open={jurisdictionPreviewOpen}
                  onOpenChange={(open) => {
                    setJurisdictionPreviewOpen(open);
                    if (open) loadJurisdictionPreview();
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="h-6 w-6 flex items-center justify-center rounded-md bg-purple-50 hover:bg-purple-100 border border-purple-200 flex-shrink-0"
                      title="Preview jurisdiction knowledge"
                      aria-label={`Preview jurisdiction knowledge for ${localityLabel}`}
                    >
                      <MapPin className="w-3.5 h-3.5 text-purple-700" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[360px] max-w-[calc(100vw-2rem)] p-3 text-xs">
                    <div className="font-semibold text-gray-900">Jurisdiction knowledge</div>
                    <div className="mt-0.5 text-[11px] text-gray-500">{localityLabel}{localityState ? `, ${localityState}` : ""}</div>

                    {jurisdictionPreviewLoading ? (
                      <div className="mt-3 flex items-center gap-2 text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading reference data…
                      </div>
                    ) : jurisdictionPreviewError ? (
                      <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">{jurisdictionPreviewError}</div>
                    ) : jurisdictionMatches?.length === 1 ? (() => {
                      const jurisdiction = jurisdictionMatches[0];
                      const trust = assessJurisdictionTrust(jurisdiction, 1);
                      const documentCount = Array.isArray(jurisdiction.documents) ? jurisdiction.documents.length : 0;
                      const contact = jurisdiction.contact_info || {};
                      const requirements = jurisdiction.permit_requirements || {};
                      const usableText = (value) => {
                        const text = String(value ?? "").trim();
                        return text && !isJurisdictionPlaceholder(text) ? text : "";
                      };
                      const department = usableText(contact.department);
                      const phone = usableText(contact.phone);
                      const email = usableText(contact.email);
                      const address = usableText(contact.address);
                      const feeRange = usableText(requirements.fee_range);
                      const processingTime = usableText(requirements.processing_time);
                      const maxArea = usableText(requirements.max_sign_area_sqft);
                      const maxHeight = usableText(requirements.max_height_ft);
                      const hasVerifiedDetails = trust.key === "verified" && (department || phone || email || address || requirements.requires_permit !== undefined || feeRange || processingTime || maxArea || maxHeight);
                      return (
                        <div className="mt-3 space-y-2">
                          <div className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${trust.className}`} title={trust.description}>
                            <ShieldAlert className="h-3 w-3" /> {trust.label}
                          </div>
                          {jurisdiction.ai_summary && <div className="line-clamp-3 text-gray-600">{jurisdiction.ai_summary}</div>}

                          {hasVerifiedDetails ? (
                            <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-2.5">
                              <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">Verified reference details</div>
                              {(department || phone || email || address) && (
                                <div className="space-y-1 text-[11px] text-gray-700">
                                  {department && <div><span className="font-semibold">Dept:</span> {department}</div>}
                                  {phone && <div><span className="font-semibold">Phone:</span> <a href={`tel:${phone}`} className="text-blue-700 hover:underline">{phone}</a></div>}
                                  {email && <div><span className="font-semibold">Email:</span> <a href={`mailto:${email}`} className="break-all text-blue-700 hover:underline">{email}</a></div>}
                                  {address && <div><span className="font-semibold">Address:</span> {address}</div>}
                                </div>
                              )}
                              {(requirements.requires_permit !== undefined || feeRange || processingTime || maxArea || maxHeight) && (
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-emerald-200 pt-2 text-[11px] text-gray-700">
                                  {requirements.requires_permit !== undefined && <div className="col-span-2"><span className="font-semibold">Permit required:</span> {requirements.requires_permit ? "Yes" : "No"}</div>}
                                  {feeRange && <div><span className="font-semibold">Typical fees:</span> {feeRange}</div>}
                                  {processingTime && <div><span className="font-semibold">Processing:</span> {processingTime}</div>}
                                  {maxArea && <div><span className="font-semibold">Max area:</span> {maxArea} sq ft</div>}
                                  {maxHeight && <div><span className="font-semibold">Max height:</span> {maxHeight} ft</div>}
                                  {usableText(jurisdiction.required_documents) && <div className="col-span-2"><span className="font-semibold">Office wants:</span> {usableText(jurisdiction.required_documents)}</div>}
                                  {usableText(jurisdiction.ordinance_citation) && <div className="col-span-2"><span className="font-semibold">Code:</span> {usableText(jurisdiction.ordinance_citation)}</div>}
                                </div>
                              )}
                            </div>
                          ) : trust.key !== "verified" ? (
                            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
                              Contact and requirement details are kept in the full Jurisdictions view until staff verification is current.
                            </div>
                          ) : null}

                          <div className="text-[11px] text-gray-500">{documentCount} source document{documentCount === 1 ? "" : "s"} stored</div>
                          {jurisdiction.permitting_url && (
                            <a href={jurisdiction.permitting_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline">
                              <ExternalLink className="h-3 w-3" /> Official permitting page
                            </a>
                          )}
                        </div>
                      );
                    })() : jurisdictionMatches?.length > 1 ? (
                      <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-amber-800">
                        {jurisdictionMatches.length} repository profiles match this locality. Open the full Jurisdictions view to review the duplicates; no profile was chosen automatically.
                      </div>
                    ) : jurisdictionMatches ? (
                      <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-2 text-slate-600">No repository profile exactly matches this configured locality.</div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        setJurisdictionPreviewOpen(false);
                        onShowJurisdictionInfo(lineItem.locality_id, lineItem.locality_name);
                      }}
                      className="mt-3 inline-flex min-h-8 w-full items-center justify-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-3 font-semibold text-purple-800 hover:bg-purple-100"
                    >
                      <MapPin className="h-3.5 w-3.5" /> Open full Jurisdictions
                    </button>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            {officeAuthority && (
              <div
                role="status"
                title={officeAuthority.reason || "Only these configured-office authority roles have staff verification; additional legal responsibilities may exist."}
                className={`mt-1 rounded border px-1.5 py-1 text-[10px] leading-snug break-words ${officeAuthority.status === 'staff_verified' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
              >
                <span className="font-semibold">{officeAuthority.office_name}: </span>
                {officeAuthority.status === 'staff_verified' ? (
                  <span>Staff-verified roles: {officeAuthority.verified_roles.join(', ').replaceAll('_', ' ')}.</span>
                ) : officeAuthority.status === 'needs_verification' ? (
                  <span>Authority needs staff review{officeAuthority.roles_needing_review.length > 0 ? `: ${officeAuthority.roles_needing_review.join(', ').replaceAll('_', ' ')}` : '.'}</span>
                ) : (
                  <span>Office mapping needs review. {officeAuthority.reason}</span>
                )}
              </div>
            )}
            {isRegistered && onLinkLegacyOffice && legacyOfficeOptions.length > 0 && (
              <button type="button" ref={linkOfficeTriggerRef} className="mt-1 rounded border border-purple-300 bg-purple-50 px-2 py-1 text-[11px] font-semibold text-purple-900"
                onClick={() => { setSelectedOfficeId(""); setLinkError(""); setLinkOfficeOpen(true); }}>
                {lineItem.locality_office_id ? "Fix this line's office link" : "Link this line to an office"}
              </button>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-gray-500">
              <span className="flex-shrink-0">Owner:</span>
              <Select
                value={lineItem.assigned_to || "__unassigned__"}
                onValueChange={(value) => {
                  const next = value === "__unassigned__" ? "" : value;
                  if (lineItem.assigned_to && lineItem.assigned_to !== next && !( (()=>{try{return localStorage.getItem("permitting_skip_confirms")==="1";}catch{return false;}})() || window.confirm(`This line belongs to ${lineItem.assigned_to} — give it to ${next || "nobody"} instead?`))) return;
                  onUpdateField(lineItem.id, 'assigned_to', next);
                }}
                disabled={!isRegistered}
              >
                <SelectTrigger className="h-7 min-w-0 w-[140px] border-gray-200 px-2 text-[11px] shadow-none">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {ownerOptions.map((owner) => (
                    <SelectItem key={owner} value={owner}>{owner}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(lineItem.submission_method || lineItem.confirmation_number) && (
                <button
                  type="button"
                  className="text-[10px] font-semibold text-indigo-700 underline"
                  title="Copy this application&#039;s submission details to paste into the office portal for resubmit"
                  onClick={async () => {
                    const parts = [`Job: ${lineItem.work_order_title || ''}`, `Office: ${lineItem.locality_name || ''}`, `Submitted via: ${lineItem.submission_method || '—'}`, `Confirmation #: ${lineItem.confirmation_number || '—'}`, `Application ref: ${lineItem.application_reference_number || '—'}`, `Revision: ${lineItem.application_revision || 1}`];
                    try { await navigator.clipboard.writeText(parts.join('\n')); } catch {}
                  }}
                >
                  Copy submission details
                </button>
              )}
              {isRegistered && lineItem.permit_number && (
                <button
                  type="button"
                  className="inline-flex min-h-7 items-center gap-1 rounded-md border border-gray-300 bg-white px-2 text-[10px] font-semibold text-gray-700 hover:bg-gray-50"
                  title="Print this permit's details for the job folder"
                  onClick={() => {
                    const rows = [
                      ["Permit #", lineItem.permit_number], ["Job", lineItem.work_order_title || ""], ["Office", lineItem.locality_name || ""],
                      ["Permit type", lineItem.permit_type || ""], ["Issued", lineItem.permit_issue_date || ""], ["Expires", lineItem.permit_expiration_date || ""],
                      ["Inspection", lineItem.inspection_date || ""], ["Inspector", lineItem.inspector_contact || ""],
                      ["App ref", lineItem.application_reference_number || ""], ["Document", lineItem.permit_document_url || ""],
                    ].filter(([, v]) => v);
                    const win = window.open("", "_blank", "width=620,height=800");
                    if (!win) return;
                    win.document.write(`<html><head><title>Permit ${lineItem.permit_number}</title><style>body{font-family:sans-serif;padding:24px}h1{font-size:18px;margin:0 0 12px}table{border-collapse:collapse;width:100%}td{border:1px solid #ccc;padding:6px 10px;font-size:12px}td:first-child{font-weight:600;width:140px;color:#555}</style></head><body><h1>Permit packet — ${lineItem.work_order_title || lineItem.row_name || "Permit"}</h1><table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table></body></html>`);
                    win.document.close(); win.print();
                  }}
                >
                  Print packet
                </button>
              )}
              {canAssignToMe && (
                <button
                  type="button"
                  onClick={() => onUpdateField(lineItem.id, 'assigned_to', currentUserOwnerLabel)}
                  className="inline-flex min-h-7 items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 text-[10px] font-semibold text-purple-800 hover:bg-purple-100"
                  title={`Assign this permit line to ${currentUserOwnerLabel}`}
                >
                  <UserRoundPlus className="h-3 w-3" /> Assign to me
                </button>
              )}
            </div>
        {isRegistered && onDeleteLine && (
          <button type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="ml-auto shrink-0 rounded p-2 text-gray-500 hover:bg-red-50"
            title="Delete this line"
          >
            Delete permit line
          </button>
        )}
        </div>
      </details>
      <details className="mt-1 rounded border px-3 py-2"><summary className="cursor-pointer text-xs font-semibold text-slate-700">Fees, inspections &amp; closeout</summary>
      <PermitLineLifecycleDetails
        lineItem={lineItem}
        locality={locality}
        onUpdateField={onUpdateField}
        isRegistered={isRegistered}
        today={today}
      /></details>
      </>
      )}

      <AlertDialog open={linkOfficeOpen} onOpenChange={open => {
        if (linkSaving) return;
        setLinkOfficeOpen(open);
        if (!open) {
          setSelectedOfficeId(""); setLinkError("");
          requestAnimationFrame(() => linkOfficeTriggerRef.current?.focus());
        }
      }}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>{lineItem.locality_office_id ? "Fix this line's missing office?" : "Link this line to an office?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {lineItem.locality_office_id && (
                <>The office this line was pointing to is gone. Check the office list and pick a new one. </>
              )}
              Pick which office this line belongs to. This only changes this line — it does not
              change the offices, other lines, notes, or past permits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="text-sm font-semibold" htmlFor={"office-link-" + lineItem.id}>Pick the office</label>
          <select ref={linkOfficeSelectRef} id={"office-link-" + lineItem.id} value={selectedOfficeId}
            onChange={event => setSelectedOfficeId(event.target.value)}
            disabled={linkSaving} aria-describedby={"office-link-help-" + lineItem.id} className="min-h-10 w-full rounded border px-2 text-sm">
            <option value="">Choose the exact office</option>
            {legacyOfficeOptions.map(office =>
              <option key={office.id} value={office.id}>{office.label}</option>
            )}
          </select>
          <p id={"office-link-help-" + lineItem.id} className="text-xs text-gray-600">Office IDs are shown so similarly named offices can be distinguished safely.</p>
          {linkError && <p role="alert" aria-live="assertive" className="text-sm text-red-700">{linkError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={linkSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!selectedOfficeId || linkSaving || !isRegistered}
              onClick={async event => {
                event.preventDefault();
                if (!selectedOfficeId || linkSaving) return;
                setLinkSaving(true); setLinkError("");
                try {
                  const selectedSnapshot = legacyOfficeOptions.find(office => office.id === selectedOfficeId)?.snapshot;
                  const saved = await onLinkLegacyOffice(lineItem.id, selectedOfficeId, selectedSnapshot);
                  if (saved === true) setLinkOfficeOpen(false);
                  else if (saved === "saved_needs_review") {
                    setSelectedOfficeId("");
                    setLinkError("Office link saved, but current authority needs review. Reload the locality before relying on it.");
                    requestAnimationFrame(() => linkOfficeSelectRef.current?.focus());
                  } else {
                    setLinkError("Office link was not saved. Review the latest permit line and locality.");
                    requestAnimationFrame(() => linkOfficeSelectRef.current?.focus());
                  }
                } catch (error) {
                  setLinkError(error?.message || "Office link could not be saved.");
                  requestAnimationFrame(() => linkOfficeSelectRef.current?.focus());
                } finally {
                  setLinkSaving(false);
                }
              }}>
              {linkSaving ? "Linking..." : "Confirm this office link"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this permit line?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {lineItem.row_name || lineItem.office_type || "permit"} line and its recorded workflow values from this Work Order. Other permit lines and the Work Order will not be deleted. If you need it back, re-add it with "Edit permit setup…" on the job card.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDeleteLine(lineItem.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Permit Line
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}