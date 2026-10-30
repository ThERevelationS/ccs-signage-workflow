import React, { memo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { CheckCircle2, Trash2, Link as LinkIcon, Copy } from "lucide-react";
import { getStageAgingState } from "@/components/sales/salesStageAging";
import { getQuoteAgingState } from "@/components/sales/salesQuoteAging";
import { getActionableSalesAttentionItems } from "@/components/sales/salesAttention";
import { isLikelySalesPlaceholder } from "@/components/sales/salesPlaceholder";
import { openExternalHttpUrl, safeExternalHttpUrl } from "@/utils/safeExternalUrl";
import TaskAssigneeSelect from "@/components/sales/TaskAssigneeSelect";
import { buildSalesPersonSelectModel } from "@/components/sales/salesPersonIdentity.mjs";
import { salesOpportunityDisplayName } from "@/components/sales/salesOpportunityIdentity.mjs";
import { classifySalesTaskStatusAudit } from "../../../base44/shared/salesTaskStatusAudit.mjs";
import { isUnverifiedSmartsheetSalesStage, salesStageDisplayValue, salesStageDisplayLabel } from "@/components/sales/salesStageTrust.mjs";

const SALES_STATUSES = [
  { value: "lead", label: "Lead", className: "bg-blue-50 text-blue-700" },
  { value: "quoted", label: "Quoted", className: "bg-yellow-50 text-yellow-700" },
  { value: "follow_up", label: "Follow Up", className: "bg-orange-50 text-orange-700" },
  { value: "won", label: "Won", className: "bg-green-50 text-green-700" },
  { value: "lost", label: "Lost", className: "bg-red-50 text-red-700" },
  { value: "on_hold", label: "On Hold", className: "bg-gray-100 text-gray-700" },
];

const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  if (dateString instanceof Date) return isNaN(dateString.getTime()) ? undefined : dateString;
  if (typeof dateString !== 'string') return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const DateCell = memo(function DateCell({ woId, field, value, popoverKey, openDatePopover, setOpenDatePopover, setClearDateConfirm, updateWorkOrder, isRegistered, allowClear = true }) {
  const preventsFutureDate = field === "date_estimate_sent" || field === "close_date";
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const displayDate = () => {
    if (!value) return "-";
    const parsed = parseLocalDate(value);
    if (!parsed || isNaN(parsed.getTime())) return "-";
    return format(parsed, "MM/dd/yy");
  };

  return (
    <Popover open={openDatePopover === popoverKey} onOpenChange={(open) => setOpenDatePopover(open ? popoverKey : null)}>
      <PopoverTrigger asChild disabled={!isRegistered}>
        <button type="button" className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
          {displayDate()}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        {value && allowClear && (
          <div className="p-2 border-b">
            <Button size="sm" variant="outline" className="w-full text-xs"
              onClick={() => { setClearDateConfirm({ woId, field }); setOpenDatePopover(null); }}>
              Clear Date
            </Button>
          </div>
        )}
        <Calendar mode="single" selected={parseLocalDate(value)} disabled={preventsFutureDate ? { after: today } : undefined}
          onSelect={(date) => { if (date && preventsFutureDate && date > today) return; updateWorkOrder(woId, field, date ? format(date, "yyyy-MM-dd") : ""); setOpenDatePopover(null); }} />
      </PopoverContent>
    </Popover>
  );
});

// Keep the clicked row pinned under the pointer while the focus gaps and
// cell growth animate around it: re-anchor the clicked element's center on
// screen every frame through the nearest vertical scroller.
const anchorFocusedRow = (el) => {
  if (!el?.isConnected) return;
  let scroller = el.parentElement;
  while (scroller && (!/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) || scroller.scrollHeight <= scroller.clientHeight)) {
    scroller = scroller.parentElement;
  }
  const target = scroller || document.scrollingElement;
  if (!target) return;
  const beforeRect = el.getBoundingClientRect();
  const beforeCenter = beforeRect.top + beforeRect.height / 2;
  const start = performance.now();
  const tick = () => {
    if (!el.isConnected) return;
    const r = el.getBoundingClientRect();
    const drift = r.top + r.height / 2 - beforeCenter;
    if (Math.abs(drift) > 0.5) target.scrollTop += drift;
    if (performance.now() - start < 220) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setTimeout(() => {
    if (!el.isConnected) return;
    const r = el.getBoundingClientRect();
    const drift = r.top + r.height / 2 - beforeCenter;
    if (Math.abs(drift) > 0.5) target.scrollTop += drift;
  }, 240);
};

const SalesPipelineRow = memo(function SalesPipelineRow({
  wo, index, visibleColumnIds, focusedRowId, setFocusedRowId, setFocusedRowIndex,
  getTaskDescStyle, getDeadlineCellColor, calculateDays, openDatePopover, setOpenDatePopover,
  setClearDateConfirm, updateWorkOrder, isRegistered, isAdmin, selectedRows, toggleRowSelection,
  handleContextMenu, setSelectedWorkOrder, onCompleteFollowUp, openCorbridgeDialog,
  handleDuplicateClient, deleteWorkOrder, leadSources, users, taskDescriptions, projectTypes,
}) {
  const getTaskDescText = (item) => (typeof item === 'string' ? item : item?.text || '');
  const salesOwnerSelect = buildSalesPersonSelectModel(wo.sales_rep, users);
  const designerSelect = buildSalesPersonSelectModel(wo.designer, users, 'Designer');
  const projectManagerSelect = buildSalesPersonSelectModel(wo.project_manager, users, 'PM');
  const estimatorSelect = buildSalesPersonSelectModel(wo.estimator, users, 'Estimator');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStamp = format(today, "yyyy-MM-dd");
  const nearCloseDate = new Date(today);
  nearCloseDate.setDate(nearCloseDate.getDate() + 14);
  const nearCloseStamp = format(nearCloseDate, "yyyy-MM-dd");

  const daysFromInitial = calculateDays(wo.date_initial_contact);
  const daysEstSent = calculateDays(wo.date_initial_contact, wo.date_estimate_sent);
  const daysEstToOrder = calculateDays(wo.date_estimate_sent, wo.date_order_created);
  const daysOrderToPermit = calculateDays(wo.date_order_created, wo.permit_submitted_date);
  const daysPermitToApproved = calculateDays(wo.permit_submitted_date, wo.permit_approved_date);
  const daysOrderToInstall = calculateDays(wo.date_order_created, wo.project_install_date);
  const isFocused = focusedRowId === wo.id;
  const taskStyle = getTaskDescStyle(wo.current_task_description);
  const stageAging = getStageAgingState(wo);
  const quoteAging = getQuoteAgingState(wo);
  const attentionItems = getActionableSalesAttentionItems(wo);
  const likelyPlaceholder = isLikelySalesPlaceholder(wo);
  const opportunityDisplayName = salesOpportunityDisplayName(wo, "Unnamed customer");
  const taskStatusAudit = classifySalesTaskStatusAudit(wo);
  const unverifiedStage = isUnverifiedSmartsheetSalesStage(wo);
  const stageDisplayValue = salesStageDisplayValue(wo);
  const stageDisplayLabel = salesStageDisplayLabel(wo);
  const coreBridgeUrl = safeExternalHttpUrl(wo.corbridge_link);
  const expectedCloseStamp = String(wo.expected_close_date || "").slice(0, 10);
  const isOpen = !["won", "lost"].includes(wo.sales_status);
  const expectedCloseOverdue = Boolean(expectedCloseStamp && expectedCloseStamp < todayStamp && isOpen);
  const expectedCloseNear = Boolean(expectedCloseStamp && expectedCloseStamp >= todayStamp && expectedCloseStamp <= nearCloseStamp && isOpen);

  return [
      isFocused && <tr key="focus-gap-top" className="sales-focus-gap" aria-hidden="true"><td colSpan={100}><div className="sales-focus-gap-inner" /></td></tr>,
      <tr key="row" className={`sales-board-row border-b ${!taskStyle.backgroundColor && !isFocused ? 'hover:bg-gray-50' : ''} ${isFocused ? 'sales-focus-row' : ''} ${taskStyle.markOut ? 'line-through' : ''}`}
        style={{ backgroundColor: !isFocused && taskStyle.backgroundColor ? taskStyle.backgroundColor : undefined }}>
        <td className="px-0 py-0 border-r">
          <button type="button" aria-label={`${isFocused ? 'Unfocus' : 'Focus'} sales row ${index + 1}: ${opportunityDisplayName}`} aria-pressed={isFocused}
            onClick={(e) => { anchorFocusedRow(e.currentTarget); if (isFocused) { setFocusedRowId(null); setFocusedRowIndex(null); } else { setFocusedRowId(wo.id); setFocusedRowIndex(index); } }}
            className={`w-full h-full px-2 py-1.5 text-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${isFocused ? 'sales-focus-num text-white' : 'text-gray-500 hover:bg-blue-50 hover:text-blue-700'}`}>
            {index + 1}
          </button>
        </td>
        {visibleColumnIds.map((columnId) => {
            switch (columnId) {
              case "client_name": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "client_name", "Customer", wo.client_name)}>
            <button type="button" onClick={() => setSelectedWorkOrder(wo)} className="h-7 w-full text-xs text-left px-1 hover:bg-blue-50 rounded flex items-center gap-1 text-blue-600">
              <LinkIcon className="w-3 h-3 flex-shrink-0" /><span className="min-w-0 flex-1 truncate">{opportunityDisplayName}</span>
              {likelyPlaceholder && <span className="flex-shrink-0 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800" title="Exact placeholder customer name detected. Review before removing from Current Pipeline.">TEST</span>}
              {taskStatusAudit.kind !== 'none' && <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${taskStatusAudit.kind === 'modern_review' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`} title={taskStatusAudit.reason} aria-label={taskStatusAudit.kind === 'modern_review' ? 'Task and status need review' : 'Legacy task context'}>{taskStatusAudit.kind === 'modern_review' ? 'T/S' : 'Legacy'}</span>}
              {attentionItems.length > 0 && <span className="flex-shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" title={`Needs attention: ${attentionItems.map((item) => item.label).join(", ")}`}>!{attentionItems.length}</span>}
            </button>
          </td>
              );
              case "sales_status": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "sales_status", "Sales Status", wo.sales_status)}>
            <span
              className={`flex h-7 w-full items-center rounded px-2 text-xs font-medium ${stageDisplayValue === "closed_neutral" ? "bg-slate-100 text-slate-700" : SALES_STATUSES.find((status) => status.value === stageDisplayValue)?.className || "bg-slate-50 text-slate-700"}`}
              title={unverifiedStage ? "Sales Status is read-only. Stage Timing Missing; change Task Description to move stages." : "Sales Status is read-only here. Change Task Description to move the Sales stage."}
              aria-label={`Sales Status: ${stageDisplayLabel}${unverifiedStage ? ". Stage Timing Missing" : ""}`}
            >
              <span className="truncate">{stageDisplayLabel}</span>
            </span>
          </td>
              );
              case "stage_age": return (
                <td key={columnId} className="px-1 py-0.5 border-r text-center">
            {stageAging.tracked ? (
              <span className={`inline-flex min-w-[42px] justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${stageAging.aged ? "bg-rose-50 text-rose-700" : wo.sales_status === "on_hold" ? "bg-gray-100 text-gray-600" : "bg-slate-50 text-slate-600"}`} title={wo.sales_status === "on_hold" ? "Stage timing tracked; On Hold is not flagged as stalled." : "Days since the last verified Sales Pipeline stage change."}>{stageAging.ageDays}d</span>
            ) : (
              <span className="text-[11px] text-gray-400" title="Stage timing begins with a verified stage change.">—</span>
            )}
          </td>
              );
              case "sales_rep": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "sales_rep", "Salesperson / Owner", wo.sales_rep)}>
            <Select value={salesOwnerSelect.canonical} onValueChange={(val) => updateWorkOrder(wo.id, "sales_rep", val)} disabled={!isRegistered}>
              <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1"><SelectValue placeholder="Unassigned">{salesOwnerSelect.canonical || "Unassigned"}</SelectValue></SelectTrigger>
              <SelectContent>
                {salesOwnerSelect.legacy && <SelectItem value={salesOwnerSelect.legacy}>{salesOwnerSelect.legacy}</SelectItem>}
                {salesOwnerSelect.options.map((u) => <SelectItem key={u.email || u.full_name} value={u.full_name}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </td>
              );
              case "description": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "description", "Job Description", wo.description)}>
            <Input value={wo.description || ""} onChange={(e) => updateWorkOrder(wo.id, "description", e.target.value)} className="h-7 text-xs border-0 bg-transparent px-1" placeholder="-" disabled={!isRegistered} />
          </td>
              );
              case "lead_source": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "lead_source", "Source", wo.lead_source)}>
            <Select value={wo.lead_source || ""} onValueChange={(val) => updateWorkOrder(wo.id, "lead_source", val)} disabled={!isRegistered}>
              <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1"><SelectValue placeholder="-" /></SelectTrigger>
              <SelectContent>{leadSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </td>
              );
              case "current_task_deadline": return (
                <td key={columnId} className="px-1 py-0.5 border-r" style={{ backgroundColor: getDeadlineCellColor(wo.current_task_deadline) }} onContextMenu={(e) => handleContextMenu(e, wo, "current_task_deadline", "Deadline", wo.current_task_deadline)}>
            <DateCell woId={wo.id} field="current_task_deadline" value={wo.current_task_deadline} popoverKey={`deadline-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered && isOpen} />
          </td>
              );
              case "current_task_assigned_to": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "current_task_assigned_to", "Task Assigned", wo.current_task_assigned_to)}>
            <TaskAssigneeSelect key={wo.id} value={wo.current_task_assigned_to || ""} users={users} onChange={(val) => updateWorkOrder(wo.id, "current_task_assigned_to", val)} disabled={!isRegistered || !isOpen} className="h-7 text-xs border-0 bg-transparent px-1" context={wo.client_name || "this opportunity"} />
          </td>
              );
              case "designer": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "designer", "Designer", wo.designer)}>
            <Select value={designerSelect.canonical} onValueChange={(val) => updateWorkOrder(wo.id, "designer", val)} disabled={!isRegistered}>
              <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1"><SelectValue placeholder="-">{designerSelect.canonical || "-"}</SelectValue></SelectTrigger>
              <SelectContent>
                {designerSelect.legacy && <SelectItem value={designerSelect.legacy}>{designerSelect.legacy}</SelectItem>}
                {designerSelect.options.map((u) => <SelectItem key={u.email || u.full_name} value={u.full_name}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </td>
              );
              case "project_manager": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "project_manager", "Project Manager", wo.project_manager)}>
            <Select value={projectManagerSelect.canonical} onValueChange={(val) => updateWorkOrder(wo.id, "project_manager", val)} disabled={!isRegistered}>
              <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1"><SelectValue placeholder="-">{projectManagerSelect.canonical || "-"}</SelectValue></SelectTrigger>
              <SelectContent>
                {projectManagerSelect.legacy && <SelectItem value={projectManagerSelect.legacy}>{projectManagerSelect.legacy}</SelectItem>}
                {projectManagerSelect.options.map((u) => <SelectItem key={u.email || u.full_name} value={u.full_name}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </td>
              );
              case "estimator": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "estimator", "Estimator", wo.estimator)}>
            <Select value={estimatorSelect.canonical} onValueChange={(val) => updateWorkOrder(wo.id, "estimator", val)} disabled={!isRegistered}>
              <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1"><SelectValue placeholder="-">{estimatorSelect.canonical || "-"}</SelectValue></SelectTrigger>
              <SelectContent>
                {estimatorSelect.legacy && <SelectItem value={estimatorSelect.legacy}>{estimatorSelect.legacy}</SelectItem>}
                {estimatorSelect.options.map((u) => <SelectItem key={u.email || u.full_name} value={u.full_name}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </td>
              );
              case "est_inv_at": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "est_inv_at", "Est/Inv #", wo.est_inv_at)}>
            <div className="flex items-center gap-1">
              {coreBridgeUrl ? (
                <button type="button" onClick={() => openExternalHttpUrl(coreBridgeUrl)} className="min-w-0 flex-1 truncate text-left text-xs text-blue-600 hover:underline" title="Open CoreBridge">{wo.est_inv_at || "Link"}</button>
              ) : wo.corbridge_link ? (
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-amber-700" title="CoreBridge link is present but is not a usable http/https URL. Use the link button to correct it.">{wo.est_inv_at || "Invalid link"}</span>
              ) : (
                <Input value={wo.est_inv_at || ""} onChange={(e) => updateWorkOrder(wo.id, "est_inv_at", e.target.value)} className="h-7 text-xs border-0 bg-transparent px-1 flex-1" placeholder="-" disabled={!isRegistered} />
              )}
              {isRegistered && <button type="button" onClick={() => openCorbridgeDialog(wo)} className="flex-shrink-0" title="Add link"><LinkIcon className="w-2.5 h-2.5 text-gray-400 hover:text-blue-600" /></button>}
            </div>
          </td>
              );
              case "estimate_amount": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "estimate_amount", "Estimate Amount", wo.estimate_amount)}>
            <div className="relative flex items-center">
              <span className="absolute left-1 text-xs text-gray-500">$</span>
              <Input type="number" value={wo.estimate_amount || ""} onChange={(e) => updateWorkOrder(wo.id, "estimate_amount", parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0)} className="h-7 text-xs border-0 bg-transparent pl-3 pr-1" placeholder="0" disabled={!isRegistered} min="0" step="0.01" />
            </div>
          </td>
              );
              case "current_task_description": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "current_task_description", "Task Description", wo.current_task_description)}>
            <Select value={wo.current_task_description || ""} onValueChange={(val) => updateWorkOrder(wo.id, "current_task_description", val)} disabled={!isRegistered || (!isOpen && wo.in_pipeline !== true) || stageDisplayValue === "closed_neutral"}>
              <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1"><SelectValue placeholder="-" /></SelectTrigger>
              <SelectContent>{taskDescriptions.map(desc => <SelectItem key={getTaskDescText(desc)} value={getTaskDescText(desc)}>{getTaskDescText(desc)}</SelectItem>)}</SelectContent>
            </Select>
          </td>
              );
              case "date_initial_contact": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "date_initial_contact", "Initial Contact", wo.date_initial_contact)}>
            <DateCell woId={wo.id} field="date_initial_contact" value={wo.date_initial_contact} popoverKey={`initial-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
          </td>
              );
              case "site_survey_date": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "site_survey_date", "Site Survey", wo.site_survey_date)}>
            <DateCell woId={wo.id} field="site_survey_date" value={wo.site_survey_date} popoverKey={`survey-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
          </td>
              );
              case "date_estimate_sent": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "date_estimate_sent", "Estimate Sent", wo.date_estimate_sent)}>
            <DateCell woId={wo.id} field="date_estimate_sent" value={wo.date_estimate_sent} popoverKey={`estsent-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered && isOpen} />
          </td>
              );
              case "date_order_created": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "date_order_created", "Order Created", wo.date_order_created)}>
            <DateCell woId={wo.id} field="date_order_created" value={wo.date_order_created} popoverKey={`ordercreated-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
          </td>
              );
              case "project_install_date": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "project_install_date", "Install Date", wo.project_install_date)}>
            <DateCell woId={wo.id} field="project_install_date" value={wo.project_install_date} popoverKey={`install-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
          </td>
              );
              case "permit_submitted_date": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "permit_submitted_date", "Permit Submitted", wo.permit_submitted_date)}>
            <DateCell woId={wo.id} field="permit_submitted_date" value={wo.permit_submitted_date} popoverKey={`permitsub-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
          </td>
              );
              case "permit_receipt_confirmed_date": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "permit_receipt_confirmed_date", "Permit Confirmed", wo.permit_receipt_confirmed_date)}>
            <DateCell woId={wo.id} field="permit_receipt_confirmed_date" value={wo.permit_receipt_confirmed_date} popoverKey={`permitconf-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
          </td>
              );
              case "permit_number": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "permit_number", "Permit Number", wo.permit_number)}>
            <Input value={wo.permit_number || ""} onChange={(e) => updateWorkOrder(wo.id, "permit_number", e.target.value)} className="h-7 text-xs border-0 bg-transparent px-1" placeholder="-" disabled={!isRegistered} />
          </td>
              );
              case "permit_approved_date": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "permit_approved_date", "Permit Approved", wo.permit_approved_date)}>
            <DateCell woId={wo.id} field="permit_approved_date" value={wo.permit_approved_date} popoverKey={`permitappr-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
          </td>
              );
              case "days_init_today": return (
                <td key={columnId} className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysFromInitial ?? "-"}</td>
              );
              case "days_req_est": return (
                <td key={columnId} className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysEstSent ?? "-"}</td>
              );
              case "days_est_ord": return (
                <td key={columnId} className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysEstToOrder ?? "-"}</td>
              );
              case "days_ord_prm": return (
                <td key={columnId} className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysOrderToPermit ?? "-"}</td>
              );
              case "days_prm_app": return (
                <td key={columnId} className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysPermitToApproved ?? "-"}</td>
              );
              case "days_ord_ins": return (
                <td key={columnId} className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysOrderToInstall ?? "-"}</td>
              );
              case "quote_age": return (
                <td key={columnId} className="px-1 py-0.5 border-r text-center">
            {quoteAging.awaitingResponse ? (
              quoteAging.tracked ? (
                <span className={`inline-flex min-w-[42px] justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${quoteAging.veryAged ? "bg-rose-50 text-rose-700" : quoteAging.aged ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"}`} title={`Days since explicit estimate-sent date (${quoteAging.sentDate}).`}>{quoteAging.ageDays}d</span>
              ) : (
                <span className="text-[11px] font-medium text-amber-600" title="Quoted/Follow Up opportunity has no explicit estimate-sent date.">Missing</span>
              )
            ) : <span className="text-[11px] text-gray-300">—</span>}
          </td>
              );
              case "follow_up_date": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "follow_up_date", "Follow Up Date", wo.follow_up_date)}>
            <div className="flex items-center gap-0.5">
              <div className="min-w-0 flex-1"><DateCell woId={wo.id} field="follow_up_date" value={wo.follow_up_date} popoverKey={`followup-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered && isOpen} /></div>
              {isRegistered && !["won", "lost"].includes(wo.sales_status) && <button type="button" onClick={() => onCompleteFollowUp?.(wo)} className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-emerald-600 hover:bg-emerald-50" title="Complete / log sales follow-up"><CheckCircle2 className="h-3.5 w-3.5" /></button>}
            </div>
          </td>
              );
              case "expected_close_date": return (
                <td key={columnId}
            className={`px-1 py-0.5 border-r ${expectedCloseOverdue ? "bg-rose-50" : expectedCloseNear ? "bg-cyan-50" : ""}`}
            title={expectedCloseOverdue ? "Expected close is overdue. Review the forecast or resolve the opportunity." : expectedCloseNear ? "Expected close is within the next 14 days." : undefined}
            onContextMenu={(e) => handleContextMenu(e, wo, "expected_close_date", "Expected Close Date", wo.expected_close_date)}
          >
            <DateCell woId={wo.id} field="expected_close_date" value={wo.expected_close_date} popoverKey={`expectedclose-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered && isOpen} />
          </td>
              );
              case "close_date": return (
                <td key={columnId}
            className="px-1 py-0.5 border-r"
            title="Close date is set by the Won/Lost workflow. Active records with a stale close date can be cleared from the cell context menu."
            onContextMenu={(e) => handleContextMenu(e, wo, "close_date", "Close Date", wo.close_date)}
          >
            <DateCell woId={wo.id} field="close_date" value={wo.close_date} popoverKey={`close-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={false} allowClear={false} />
          </td>
              );
              case "start_date": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "start_date", "Start Date", wo.start_date)}>
            <DateCell woId={wo.id} field="start_date" value={wo.start_date} popoverKey={`start-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
          </td>
              );
              case "project_type": return (
                <td key={columnId} className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "project_type", "Project Type", wo.project_type)}>
            <Select value={wo.project_type || ""} onValueChange={(val) => updateWorkOrder(wo.id, "project_type", val)} disabled={!isRegistered}>
              <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1"><SelectValue placeholder="-" /></SelectTrigger>
              <SelectContent>{projectTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </td>
              );
              default: return null;
            }
          })}
        <td className="px-1 py-0.5 text-center">
          <div className="flex items-center justify-center gap-0.5">
            {isAdmin && <Checkbox checked={selectedRows.has(wo.id)} onCheckedChange={() => toggleRowSelection(wo.id)} className="h-3.5 w-3.5" />}
            {isRegistered && (
              <>
                <Button variant="ghost" size="icon" onClick={() => handleDuplicateClient(wo)} className="h-6 w-6" title="Duplicate client"><Copy className="w-3 h-3 text-blue-500" /></Button>
                <Button variant="ghost" size="icon" onClick={() => deleteWorkOrder(wo)} className="h-6 w-6" title="Delete"><Trash2 className="w-3 h-3 text-red-500" /></Button>
              </>
            )}
          </div>
        </td>
      </tr>,
      isFocused && <tr key="focus-gap-bottom" className="sales-focus-gap" aria-hidden="true"><td colSpan={100}><div className="sales-focus-gap-inner" /></td></tr>
    ];
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if the row data or relevant props changed
  return (
    prevProps.wo === nextProps.wo &&
    prevProps.index === nextProps.index &&
    prevProps.focusedRowId === nextProps.focusedRowId &&
    prevProps.openDatePopover === nextProps.openDatePopover &&
    prevProps.selectedRows === nextProps.selectedRows &&
    prevProps.isRegistered === nextProps.isRegistered &&
    prevProps.visibleColumnIds === nextProps.visibleColumnIds &&
    prevProps.getTaskDescStyle === nextProps.getTaskDescStyle &&
    prevProps.getDeadlineCellColor === nextProps.getDeadlineCellColor &&
    prevProps.calculateDays === nextProps.calculateDays &&
    prevProps.leadSources === nextProps.leadSources &&
    prevProps.users === nextProps.users &&
    prevProps.taskDescriptions === nextProps.taskDescriptions &&
    prevProps.projectTypes === nextProps.projectTypes
  );
});

export default SalesPipelineRow;