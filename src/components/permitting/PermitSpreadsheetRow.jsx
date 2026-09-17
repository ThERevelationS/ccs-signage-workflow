import { useEffect, useRef, useState } from "react";
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
import { Info, Trash2, UserRoundPlus } from "lucide-react";
import PermitLineLifecycleDetails from "./PermitLineLifecycleDetails";
import { isPermitLineEffectivelyComplete } from "./permitQueue";

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

  useEffect(() => {
    setDraft(normalizedValue);
  }, [normalizedValue]);

  const commit = () => {
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
  onDeleteLine,
  isRegistered,
  users,
  currentUser,
  today
}) {
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const headerScrollRef = useRef(null);
  const dataScrollRef = useRef(null);
  const syncingScrollRef = useRef(false);

  const isCompleted = isPermitLineEffectivelyComplete(lineItem);
  const steps = lineItem.steps || [];

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
  const localityLabel = lineItem.locality_name || "—";
  const currentUserOwnerLabel = currentUser?.full_name || currentUser?.email || "";
  const ownerOptions = [...new Set((users || []).map((user) => user.full_name || user.email).filter(Boolean))].sort();
  if (currentUserOwnerLabel && !ownerOptions.includes(currentUserOwnerLabel)) ownerOptions.unshift(currentUserOwnerLabel);
  if (lineItem.assigned_to && !ownerOptions.includes(lineItem.assigned_to)) ownerOptions.unshift(lineItem.assigned_to);
  const canAssignToMe = isRegistered && !isCompleted && !String(lineItem.assigned_to || "").trim() && !!currentUserOwnerLabel;

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
          <button
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
              </span>
              {lineItem.locality_id && (
                <button
                  onClick={() => onShowLocalityInfo(lineItem.locality_id)}
                  className="h-6 w-6 flex items-center justify-center rounded-md bg-blue-50 hover:bg-blue-100 border border-blue-200 flex-shrink-0"
                  title="View locality info"
                >
                  <Info className="w-4 h-4 text-blue-600" />
                </button>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-gray-500">
              <span className="flex-shrink-0">Owner:</span>
              <Select
                value={lineItem.assigned_to || "__unassigned__"}
                onValueChange={(value) => onUpdateField(lineItem.id, 'assigned_to', value === "__unassigned__" ? "" : value)}
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
                      <button className={`h-7 w-full text-[13px] text-center hover:bg-gray-100 rounded font-medium ${isFollowup && dateVal ? 'text-amber-700' : step.type === 'permit_received_date' && dateVal ? 'text-green-700' : ''}`}>
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
                          <button
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
        onUpdateField={onUpdateField}
        isRegistered={isRegistered}
        today={today}
      />

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this permit line?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {lineItem.row_name || lineItem.office_type || "permit"} line and its recorded workflow values from this Work Order. Other permit lines and the Work Order will not be deleted.
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