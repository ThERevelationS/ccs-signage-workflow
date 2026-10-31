import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
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
import { ExternalLink, Info, Loader2, MapPin, ShieldAlert, Trash2, UserRoundPlus } from "lucide-react";
import PermitLineLifecycleDetails from "./PermitLineLifecycleDetails";
import { isPermitLineEffectivelyComplete } from "./permitQueue";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { normalizePermitJurisdictionName } from "./jurisdictionPermitBridge";
import { assessJurisdictionTrust, isJurisdictionPlaceholder } from "./jurisdictionTrust";

const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const stepTypeIcon = (type) => {
  switch (type) {
    case 'checkbox': return '☑';
    case 'submitted_date': return '📅';
    case 'followup_date': return '🔔';
    case 'permit_received_date': return '✅';
    case 'text': return '📝';
    default: return '';
  }
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

// Dynamic column width — checkboxes compact, date/text scale with label
const getColWidth = (step) => {
  const name = step?.name || "";
  if (step.type === 'checkbox') {
    return Math.max(64, Math.min(200, name.length * 7.5 + 20));
  }
  return Math.max(100, Math.min(220, name.length * 7.5 + 30));
};

function CommitStepTextInput({ value, disabled, onCommit }) {
  const normalizedValue = value || "";
  const [draft, setDraft] = useState(normalizedValue);
  const cancelCommitRef = useRef(false);

  useEffect(() => {
    setDraft(normalizedValue);
  }, [normalizedValue]);

  const commit = () => {
    if (cancelCommitRef.current) {
      cancelCommitRef.current = false;
      return;
    }
    if (draft === normalizedValue) return;
    onCommit(draft);
  };

  return (
    <Input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelCommitRef.current = true;
          setDraft(normalizedValue);
          event.currentTarget.blur();
        }
      }}
      disabled={disabled}
      placeholder="…"
      className="h-7 border-none p-0 px-1 text-[13px] shadow-none placeholder:text-gray-300 hover:bg-gray-100 focus:bg-white"
    />
  );
}

export default function PermitSpreadsheetRow({
  lineItem,
  onUpdateStep,
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
  installDate = ""
}) {
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [linkOfficeOpen, setLinkOfficeOpen] = useState(false);
  const [selectedOfficeId, setSelectedOfficeId] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [jurisdictionPreviewOpen, setJurisdictionPreviewOpen] = useState(false);
  const [jurisdictionPreviewLoading, setJurisdictionPreviewLoading] = useState(false);
  const [jurisdictionPreviewError, setJurisdictionPreviewError] = useState("");
  const [jurisdictionMatches, setJurisdictionMatches] = useState(null);
  const headerScrollRef = useRef(null);
  const dataScrollRef = useRef(null);
  const linkOfficeTriggerRef = useRef(null);
  const linkOfficeSelectRef = useRef(null);
  const syncingScrollRef = useRef(false);

  const isCompleted = isPermitLineEffectivelyComplete(lineItem);
  const steps = lineItem.steps || [];

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

  const syncHorizontalScroll = (sourceRef, targetRef) => {
    if (syncingScrollRef.current) return;
    const source = sourceRef.current;
    const target = targetRef.current;
    if (!source || !target || source.scrollLeft === target.scrollLeft) return;
    syncingScrollRef.current = true;
    target.scrollLeft = source.scrollLeft;
    requestAnimationFrame(() => { syncingScrollRef.current = false; });
  };

  return (
    <div
      className={`group/line px-3 py-2 transition-colors ${isCompleted ? 'opacity-60 bg-gray-50/40' : 'hover:bg-gray-50/40'}`}
      style={followupStyle}
    >
      {/* MICRO HEADER — office-type badges + column labels */}
      <div
        className="mb-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1.5 sm:grid-cols-[130px_minmax(0,1fr)_auto] sm:gap-x-3"
        style={{ fontSize: '12px' }}
      >
        {/* Office type badges (possibly multiple) */}
        <div className="col-start-1 row-start-1 flex min-w-0 flex-wrap gap-1 pt-0.5 sm:w-[130px] sm:flex-shrink-0">
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

        <div
          ref={headerScrollRef}
          onScroll={() => syncHorizontalScroll(headerScrollRef, dataScrollRef)}
          className="col-span-2 row-start-2 flex min-w-0 items-end overflow-x-auto overscroll-x-contain sm:col-span-1 sm:col-start-2 sm:row-start-1"
        >
          <div className="w-[200px] flex-shrink-0 px-1 font-semibold text-gray-500 uppercase tracking-wide text-[11px]">Office / Locality</div>
          {steps.map(step => (
            <div
              key={step.id}
              className="flex-shrink-0 px-1 text-center font-semibold text-gray-500"
              style={{ width: `${getColWidth(step)}px` }}
            >
              <div className="text-[12px] leading-tight whitespace-normal break-words" title={step.name}>{step.name}</div>
              <div className="text-[10px] text-gray-400">{stepTypeIcon(step.type)}</div>
            </div>
          ))}
        </div>

        {isRegistered && onDeleteLine && (
          <button type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="col-start-2 row-start-1 flex-shrink-0 rounded p-1.5 opacity-100 transition-opacity hover:bg-red-50 sm:col-start-3 sm:p-0.5 sm:opacity-0 sm:group-hover/line:opacity-100"
            title="Delete this line"
          >
            <Trash2 className="w-3 h-3 text-red-400 hover:text-red-600" />
          </button>
        )}
      </div>

      {/* DATA ROW */}
      <div className="flex items-center gap-0 sm:gap-3" style={{ fontSize: '13px' }}>
        {/* Desktop spacer keeps the data row aligned with the office-type badge column. */}
        <div className="hidden flex-shrink-0 invisible sm:block" style={{ width: '130px' }}>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full">—</span>
        </div>

        <div
          ref={dataScrollRef}
          onScroll={() => syncHorizontalScroll(dataScrollRef, headerScrollRef)}
          className="flex min-w-0 flex-1 items-center overflow-x-auto overscroll-x-contain"
        >
          {/* Office / Locality — static text + large info button */}
          <div className="w-[200px] flex-shrink-0 px-1">
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
                    const doc = win.document;
                    doc.open(); doc.write("<!DOCTYPE html><html><head></head><body></body></html>"); doc.close();
                    doc.title = `Permit ${lineItem.permit_number}`;
                    const style = doc.createElement("style");
                    style.textContent = "body{font-family:sans-serif;padding:24px}h1{font-size:18px;margin:0 0 12px}table{border-collapse:collapse;width:100%}td{border:1px solid #ccc;padding:6px 10px;font-size:12px}td:first-child{font-weight:600;width:140px;color:#555}";
                    doc.head.appendChild(style);
                    const heading = doc.createElement("h1");
                    heading.textContent = `Permit packet — ${lineItem.work_order_title || lineItem.row_name || "Permit"}`;
                    const table = doc.createElement("table");
                    rows.forEach(([k, v]) => {
                      const tr = table.insertRow();
                      tr.insertCell().textContent = String(k);
                      tr.insertCell().textContent = String(v);
                    });
                    doc.body.append(heading, table);
                    win.print();
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
          </div>

          {/* Step cells */}
          {steps.map(step => {
            const w = getColWidth(step);
            // If this step is tied to a checkbox and that checkbox is checked, dim it to show "completed via tie"
            const tiedStep = step.tied_to_step_id ? steps.find(s => s.id === step.tied_to_step_id) : null;
            const tiedComplete = tiedStep?.checked;
            if (step.type === 'checkbox') {
              return (
                <div key={step.id} className="flex-shrink-0 px-1 flex flex-col items-center" style={{ width: `${w}px` }}>
                  <Checkbox
                    checked={step.checked || false}
                    onCheckedChange={(checked) => onUpdateStep(lineItem.id, step.id, { checked })}
                    disabled={!isRegistered}
                    className="h-4 w-4"
                  />
                  {step.checked && step.checked_date && (
                    <span className="text-[9px] text-green-600 mt-0.5">{step.checked_date.slice(5)}</span>
                  )}
                </div>
              );
            }

            if (step.type === 'submitted_date' || step.type === 'followup_date' || step.type === 'permit_received_date') {
              const dateVal = step.value;
              const popoverId = `step-${lineItem.id}-${step.id}`;
              const isFollowup = step.type === 'followup_date';
              const bgColor = tiedComplete ? '#f3f4f6' : isFollowup && dateVal ? '#fef9c3' : step.type === 'permit_received_date' && dateVal ? '#dcfce7' : 'transparent';

              return (
                <div key={step.id} className={`flex-shrink-0 px-1 ${tiedComplete ? 'opacity-60' : ''}`} style={{ width: `${w}px`, background: bgColor }}>
                  <Popover
                    open={openDatePopover === popoverId}
                    onOpenChange={(open) => setOpenDatePopover(open ? popoverId : null)}
                  >
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button type="button" className={`h-7 w-full text-[13px] text-center hover:bg-gray-100 rounded font-medium ${isFollowup && dateVal ? 'text-amber-700' : step.type === 'permit_received_date' && dateVal ? 'text-green-700' : ''}`}>
                        {dateVal ? (() => { const d = parseLocalDate(dateVal); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "—"; })() : "—"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={parseLocalDate(dateVal)}
                        onSelect={(date) => {
                          const newVal = date ? format(date, "yyyy-MM-dd") : "";
                          onUpdateStep(lineItem.id, step.id, { value: newVal });
                          setOpenDatePopover(null);
                        }}
                      />
                      {dateVal && (
                        <div className="p-2 border-t">
                          <button type="button"
                            onClick={() => { onUpdateStep(lineItem.id, step.id, { value: "" }); setOpenDatePopover(null); }}
                            className="text-xs text-red-500 hover:underline w-full text-center"
                          >
                            Clear date
                          </button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              );
            }

            // Free-text workflow steps edit locally and commit once, avoiding a backend save per keystroke.
            return (
              <div key={step.id} className={`flex-shrink-0 px-1 ${tiedComplete ? 'opacity-60 bg-gray-100' : ''}`} style={{ width: `${w}px` }}>
                <CommitStepTextInput
                  value={step.value}
                  disabled={!isRegistered}
                  onCommit={(value) => onUpdateStep(lineItem.id, step.id, { value })}
                />
              </div>
            );
          })}
        </div>
      </div>

      <PermitLineLifecycleDetails
        lineItem={lineItem}
        locality={locality}
        onUpdateField={onUpdateField}
        isRegistered={isRegistered}
        today={today}
      />

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
              This removes the {lineItem.row_name || lineItem.office_type || "permit"} line and its recorded workflow values from this Work Order. Other permit lines and the Work Order will not be deleted. If you need it back, re-add it from "Choose jurisdiction" — the pick will recreate the line.
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