import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { Trash2, Link as LinkIcon, Copy } from "lucide-react";

const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

function DateCell({ woId, field, value, popoverKey, openDatePopover, setOpenDatePopover, setClearDateConfirm, updateWorkOrder, isRegistered }) {
  const displayDate = () => {
    if (!value) return "-";
    const parsed = parseLocalDate(value);
    if (!parsed || isNaN(parsed.getTime())) return "-";
    return format(parsed, "MM/dd/yy");
  };

  return (
    <Popover open={openDatePopover === popoverKey} onOpenChange={(open) => setOpenDatePopover(open ? popoverKey : null)}>
      <PopoverTrigger asChild disabled={!isRegistered}>
        <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
          {displayDate()}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        {value && (
          <div className="p-2 border-b">
            <Button size="sm" variant="outline" className="w-full text-xs"
              onClick={() => { setClearDateConfirm({ woId, field }); setOpenDatePopover(null); }}>
              Clear Date
            </Button>
          </div>
        )}
        <Calendar mode="single" selected={parseLocalDate(value)}
          onSelect={(date) => { updateWorkOrder(woId, field, date ? format(date, "yyyy-MM-dd") : ""); setOpenDatePopover(null); }} />
      </PopoverContent>
    </Popover>
  );
}

export default function SalesPipelineTableBody({
  virtualItems, filteredWorkOrders, isColumnVisible, focusedRowId, setFocusedRowId, setFocusedRowIndex,
  getTaskDescStyle, getDeadlineCellColor, calculateDays, openDatePopover, setOpenDatePopover,
  setClearDateConfirm, updateWorkOrder, isRegistered, isAdmin, selectedRows, toggleRowSelection,
  handleContextMenu, setSelectedWorkOrder, openCorbridgeDialog, handleDuplicateClient, deleteWorkOrder,
  leadSources, users, taskDescriptions, projectTypes, rowVirtualizer,
}) {
  const getTaskDescText = (item) => (typeof item === 'string' ? item : item?.text || '');

  return (
    <tbody>
      <tr style={{ height: `${virtualItems[0]?.start || 0}px` }}><td colSpan={100} /></tr>
      {virtualItems.map((virtualRow) => {
        const index = virtualRow.index;
        const wo = filteredWorkOrders[index];
        const daysFromInitial = calculateDays(wo.date_initial_contact);
        const daysEstSent = calculateDays(wo.date_initial_contact, wo.date_estimate_sent);
        const daysEstToOrder = calculateDays(wo.date_estimate_sent, wo.date_order_created);
        const daysOrderToPermit = calculateDays(wo.date_order_created, wo.permit_submitted_date);
        const daysPermitToApproved = calculateDays(wo.permit_submitted_date, wo.permit_approved_date);
        const daysOrderToInstall = calculateDays(wo.date_order_created, wo.project_install_date);
        const isFocused = focusedRowId === wo.id;
        const taskStyle = getTaskDescStyle(wo.current_task_description);

        return (
          <React.Fragment key={wo.id}>
            {isFocused && <tr><td colSpan={100} className="h-3 bg-transparent border-none"></td></tr>}
            <tr className={`border-b ${!taskStyle.backgroundColor && !isFocused ? 'hover:bg-gray-50' : ''} ${isFocused ? 'ring-2 ring-purple-400 ring-inset bg-purple-50/50' : ''} ${taskStyle.markOut ? 'line-through' : ''}`}
              style={{ backgroundColor: !isFocused && taskStyle.backgroundColor ? taskStyle.backgroundColor : undefined }}>
              <td className="px-0 py-0 border-r">
                <button onClick={() => { if (isFocused) { setFocusedRowId(null); setFocusedRowIndex(null); } else { setFocusedRowId(wo.id); setFocusedRowIndex(index); } }}
                  className={`w-full h-full px-2 py-1.5 text-center font-medium transition-colors ${isFocused ? 'bg-purple-500 text-white' : 'text-gray-500 hover:bg-purple-100 hover:text-purple-700'}`}>
                  {index + 1}
                </button>
              </td>
              {isColumnVisible("client_name") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "client_name", "Customer", wo.client_name)}>
                  <button onClick={() => setSelectedWorkOrder(wo)} className="h-7 w-full text-xs text-left px-1 hover:bg-blue-50 rounded flex items-center gap-1 text-blue-600">
                    <LinkIcon className="w-3 h-3 flex-shrink-0" /><span className="truncate">{wo.client_name || "Unnamed"}</span>
                  </button>
                </td>
              )}
              {isColumnVisible("description") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "description", "Job Description", wo.description)}>
                  <Input value={wo.description || ""} onChange={(e) => updateWorkOrder(wo.id, "description", e.target.value)} className="h-7 text-xs border-0 bg-transparent px-1" placeholder="-" disabled={!isRegistered} />
                </td>
              )}
              {isColumnVisible("lead_source") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "lead_source", "Source", wo.lead_source)}>
                  <Select value={wo.lead_source || ""} onValueChange={(val) => updateWorkOrder(wo.id, "lead_source", val)} disabled={!isRegistered}>
                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1"><SelectValue placeholder="-" /></SelectTrigger>
                    <SelectContent>{leadSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
              )}
              {isColumnVisible("current_task_deadline") && (
                <td className="px-1 py-0.5 border-r" style={{ backgroundColor: getDeadlineCellColor(wo.current_task_deadline) }} onContextMenu={(e) => handleContextMenu(e, wo, "current_task_deadline", "Deadline", wo.current_task_deadline)}>
                  <DateCell woId={wo.id} field="current_task_deadline" value={wo.current_task_deadline} popoverKey={`deadline-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
                </td>
              )}
              {isColumnVisible("current_task_assigned_to") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "current_task_assigned_to", "Task Assigned", wo.current_task_assigned_to)}>
                  <Select value={wo.current_task_assigned_to || ""} onValueChange={(val) => updateWorkOrder(wo.id, "current_task_assigned_to", val)} disabled={!isRegistered}>
                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1"><SelectValue placeholder="-">{wo.current_task_assigned_to || "-"}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {wo.current_task_assigned_to && !users.some(u => u.full_name === wo.current_task_assigned_to && u.sales_roles?.includes("Task Assigned")) && <SelectItem key={wo.current_task_assigned_to} value={wo.current_task_assigned_to}>{wo.current_task_assigned_to}</SelectItem>}
                      {users.filter(u => u.sales_roles?.includes("Task Assigned")).map(u => <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
              )}
              {isColumnVisible("designer") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "designer", "Designer", wo.designer)}>
                  <Select value={wo.designer || ""} onValueChange={(val) => updateWorkOrder(wo.id, "designer", val)} disabled={!isRegistered}>
                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1"><SelectValue placeholder="-">{wo.designer || "-"}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {wo.designer && !users.some(u => u.full_name === wo.designer && u.sales_roles?.includes("Designer")) && <SelectItem key={wo.designer} value={wo.designer}>{wo.designer}</SelectItem>}
                      {users.filter(u => u.sales_roles?.includes("Designer")).map(u => <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
              )}
              {isColumnVisible("project_manager") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "project_manager", "Project Manager", wo.project_manager)}>
                  <Select value={wo.project_manager || ""} onValueChange={(val) => updateWorkOrder(wo.id, "project_manager", val)} disabled={!isRegistered}>
                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1"><SelectValue placeholder="-">{wo.project_manager || "-"}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {wo.project_manager && !users.some(u => u.full_name === wo.project_manager && (u.sales_roles?.includes("Project Manager") || u.sales_roles?.includes("PM"))) && <SelectItem key={wo.project_manager} value={wo.project_manager}>{wo.project_manager}</SelectItem>}
                      {users.filter(u => u.sales_roles?.includes("Project Manager") || u.sales_roles?.includes("PM")).map(u => <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
              )}
              {isColumnVisible("estimator") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "estimator", "Estimator", wo.estimator)}>
                  <Select value={wo.estimator || ""} onValueChange={(val) => updateWorkOrder(wo.id, "estimator", val)} disabled={!isRegistered}>
                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1"><SelectValue placeholder="-">{wo.estimator || "-"}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {wo.estimator && !users.some(u => u.full_name === wo.estimator && u.sales_roles?.includes("Estimator")) && <SelectItem key={wo.estimator} value={wo.estimator}>{wo.estimator}</SelectItem>}
                      {users.filter(u => u.sales_roles?.includes("Estimator")).map(u => <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
              )}
              {isColumnVisible("est_inv_at") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "est_inv_at", "Est/Inv #", wo.est_inv_at)}>
                  <div className="flex items-center gap-1">
                    {wo.corbridge_link ? (
                      <a href={wo.corbridge_link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate flex-1">{wo.corbridge_invoice_number || wo.est_inv_at || "Link"}</a>
                    ) : (
                      <Input value={wo.est_inv_at || ""} onChange={(e) => updateWorkOrder(wo.id, "est_inv_at", e.target.value)} className="h-7 text-xs border-0 bg-transparent px-1 flex-1" placeholder="-" disabled={!isRegistered} />
                    )}
                    {isRegistered && <button onClick={() => openCorbridgeDialog(wo)} className="flex-shrink-0" title="Add link"><LinkIcon className="w-2.5 h-2.5 text-gray-400 hover:text-blue-600" /></button>}
                  </div>
                </td>
              )}
              {isColumnVisible("estimate_amount") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "estimate_amount", "Estimate Amount", wo.estimate_amount)}>
                  <div className="relative flex items-center">
                    <span className="absolute left-1 text-xs text-gray-500">$</span>
                    <Input type="number" value={wo.estimate_amount || ""} onChange={(e) => updateWorkOrder(wo.id, "estimate_amount", parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0)} className="h-7 text-xs border-0 bg-transparent pl-3 pr-1" placeholder="0" disabled={!isRegistered} min="0" step="0.01" />
                  </div>
                </td>
              )}
              {isColumnVisible("current_task_description") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "current_task_description", "Task Description", wo.current_task_description)}>
                  <Select value={wo.current_task_description || ""} onValueChange={(val) => updateWorkOrder(wo.id, "current_task_description", val)} disabled={!isRegistered}>
                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1"><SelectValue placeholder="-" /></SelectTrigger>
                    <SelectContent>{taskDescriptions.map(desc => <SelectItem key={getTaskDescText(desc)} value={getTaskDescText(desc)}>{getTaskDescText(desc)}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
              )}
              {isColumnVisible("date_initial_contact") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "date_initial_contact", "Initial Contact", wo.date_initial_contact)}>
                  <DateCell woId={wo.id} field="date_initial_contact" value={wo.date_initial_contact} popoverKey={`initial-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
                </td>
              )}
              {isColumnVisible("site_survey_date") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "site_survey_date", "Site Survey", wo.site_survey_date)}>
                  <DateCell woId={wo.id} field="site_survey_date" value={wo.site_survey_date} popoverKey={`survey-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
                </td>
              )}
              {isColumnVisible("date_estimate_sent") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "date_estimate_sent", "Estimate Sent", wo.date_estimate_sent)}>
                  <DateCell woId={wo.id} field="date_estimate_sent" value={wo.date_estimate_sent} popoverKey={`estsent-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
                </td>
              )}
              {isColumnVisible("date_order_created") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "date_order_created", "Order Created", wo.date_order_created)}>
                  <DateCell woId={wo.id} field="date_order_created" value={wo.date_order_created} popoverKey={`ordercreated-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
                </td>
              )}
              {isColumnVisible("project_install_date") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "project_install_date", "Install Date", wo.project_install_date)}>
                  <DateCell woId={wo.id} field="project_install_date" value={wo.project_install_date} popoverKey={`install-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
                </td>
              )}
              {isColumnVisible("permit_submitted_date") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "permit_submitted_date", "Permit Submitted", wo.permit_submitted_date)}>
                  <DateCell woId={wo.id} field="permit_submitted_date" value={wo.permit_submitted_date} popoverKey={`permitsub-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
                </td>
              )}
              {isColumnVisible("permit_receipt_confirmed_date") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "permit_receipt_confirmed_date", "Permit Confirmed", wo.permit_receipt_confirmed_date)}>
                  <DateCell woId={wo.id} field="permit_receipt_confirmed_date" value={wo.permit_receipt_confirmed_date} popoverKey={`permitconf-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
                </td>
              )}
              {isColumnVisible("permit_number") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "permit_number", "Permit Number", wo.permit_number)}>
                  <Input value={wo.permit_number || ""} onChange={(e) => updateWorkOrder(wo.id, "permit_number", e.target.value)} className="h-7 text-xs border-0 bg-transparent px-1" placeholder="-" disabled={!isRegistered} />
                </td>
              )}
              {isColumnVisible("permit_approved_date") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "permit_approved_date", "Permit Approved", wo.permit_approved_date)}>
                  <DateCell woId={wo.id} field="permit_approved_date" value={wo.permit_approved_date} popoverKey={`permitappr-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
                </td>
              )}
              {isColumnVisible("days_init_today") && <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysFromInitial ?? "-"}</td>}
              {isColumnVisible("days_req_est") && <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysEstSent ?? "-"}</td>}
              {isColumnVisible("days_est_ord") && <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysEstToOrder ?? "-"}</td>}
              {isColumnVisible("days_ord_prm") && <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysOrderToPermit ?? "-"}</td>}
              {isColumnVisible("days_prm_app") && <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysPermitToApproved ?? "-"}</td>}
              {isColumnVisible("days_ord_ins") && <td className="px-1 py-0.5 border-r bg-yellow-50 text-center">{daysOrderToInstall ?? "-"}</td>}
              {isColumnVisible("quote_date") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "quote_date", "Quote Date", wo.quote_date)}>
                  <DateCell woId={wo.id} field="quote_date" value={wo.quote_date} popoverKey={`quote-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
                </td>
              )}
              {isColumnVisible("follow_up_date") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "follow_up_date", "Follow Up Date", wo.follow_up_date)}>
                  <DateCell woId={wo.id} field="follow_up_date" value={wo.follow_up_date} popoverKey={`followup-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
                </td>
              )}
              {isColumnVisible("close_date") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "close_date", "Close Date", wo.close_date)}>
                  <DateCell woId={wo.id} field="close_date" value={wo.close_date} popoverKey={`close-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
                </td>
              )}
              {isColumnVisible("probability") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "probability", "Probability", wo.probability)}>
                  <Input type="number" value={wo.probability || ""} onChange={(e) => updateWorkOrder(wo.id, "probability", parseInt(e.target.value) || 0)} className="h-7 text-xs border-0 bg-transparent px-1" placeholder="0" min="0" max="100" disabled={!isRegistered} />
                </td>
              )}
              {isColumnVisible("start_date") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "start_date", "Start Date", wo.start_date)}>
                  <DateCell woId={wo.id} field="start_date" value={wo.start_date} popoverKey={`start-${wo.id}`} openDatePopover={openDatePopover} setOpenDatePopover={setOpenDatePopover} setClearDateConfirm={setClearDateConfirm} updateWorkOrder={updateWorkOrder} isRegistered={isRegistered} />
                </td>
              )}
              {isColumnVisible("project_type") && (
                <td className="px-1 py-0.5 border-r" onContextMenu={(e) => handleContextMenu(e, wo, "project_type", "Project Type", wo.project_type)}>
                  <Select value={wo.project_type || ""} onValueChange={(val) => updateWorkOrder(wo.id, "project_type", val)} disabled={!isRegistered}>
                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 px-1"><SelectValue placeholder="-" /></SelectTrigger>
                    <SelectContent>{projectTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
              )}
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
            </tr>
            {isFocused && <tr><td colSpan={100} className="h-3 bg-transparent border-none"></td></tr>}
          </React.Fragment>
        );
      })}
      <tr style={{ height: `${rowVirtualizer.getTotalSize() - (rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1]?.end || 0)}px` }}><td colSpan={100} /></tr>
    </tbody>
  );
}