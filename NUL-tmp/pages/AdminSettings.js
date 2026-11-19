import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { AUTOMATION_PRESETS, draftFromPreset, recordFilterFields, destinationWorkOrderId, draftProblems } from "@/components/admin/automationBuilderModel.mjs";
import DataExportPanel from "@/components/admin/DataExportPanel";
import AssetMigrationPanel from "@/components/admin/AssetMigrationPanel";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminPanelContent from "@/components/admin/AdminPanelContent";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Trash2,
  Edit,
  Mail,
  Settings,
  Copy,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Users,
  ArrowDown,
  ArrowRight,
  Calendar,
  User,
  Flag,
  FileText,
  GitBranch,
  Sparkles,
  Loader2,
  RotateCcw,
  SortAsc,
  Clock,
  Activity,
  Bot,
  UserCheck,
  CalendarDays,
  ClipboardCheck,
  Scale,
  FlaskConical,
  BookOpen,
  Truck,
  Braces
} from "lucide-react";
import FaceRecognition from "@/components/timeclock/FaceRecognition";
import EmailGroupsManager from "../components/admin/EmailGroupsManager";
import GmailConnector from "../components/admin/GmailConnector";
import UserManagement from "../components/admin/UserManagement";
import ProjectTrash from "../components/admin/ProjectTrash";
import OrderTrash from "../components/admin/OrderTrash";
import TimeClockAdmin from "../components/timeclock/TimeClockAdmin";
import FleetSettings from "@/pages/FleetSettings";
import TimeClockReportsDashboard from "../components/timeclock/TimeClockReportsDashboard";
import ActivityFeed from "../components/admin/ActivityFeed";
import PTOManagement from "../components/admin/PTOManagement";
import BackupManager from "../components/admin/BackupManager";
import OvertimeRulesManager from "../components/admin/OvertimeRulesManager";
import SalesPipelineDefaultSort from "@/components/admin/SalesPipelineDefaultSort";
import ResourceAllocationView from "@/components/workflow/ResourceAllocationView";
import CorebridgeApiSettings from "@/components/admin/CorebridgeApiSettings";
import SmartsheetSyncSettings from "@/components/admin/SmartsheetSyncSettings";
import SyncConflictReview from "@/components/admin/SyncConflictReview";
import OpportunityBridgeReview from "@/components/admin/OpportunityBridgeReview";
import TaskAssignmentRules from "@/components/admin/TaskAssignmentRules";
import WipImporter from "@/components/admin/WipImporter";
import PermittingRepositoryAdmin from "@/components/permitting/PermittingRepositoryAdmin.jsx";
import PermittingCompletenessDashboard from "@/components/permitting/PermittingCompletenessDashboard.jsx";
import PermittingRulesReview from "@/components/admin/PermittingRulesReview";
import PermittingTestSuite from "@/components/permitting/PermittingTestSuite";
import JurisdictionMonitoringSettings from "@/components/admin/JurisdictionMonitoringSettings";
import WorkflowSchedulesPanel from "@/components/admin/WorkflowSchedulesPanel";
import AdminCalendarSettings from "@/components/admin/AdminCalendarSettings";
import IntegrationsPanel from "@/components/admin/IntegrationsPanel";
import {
  getStoredAdminSettingsCapability,
  getStoredAdminSettingsCapabilityExpiry,
  hasStoredAdminSettingsAuthorization,
  storeAdminSettingsAuthorization,
  useAuth
} from "@/components/auth/EmailGate";
import { verifyLogin } from "@/functions/verifyLogin";
import { IDENTIFY_CAMERA_BLURB } from "@/components/timeclock/timeClockIdentifyCopy";
import {
  createAutomationRuleIfAbsent,
  deleteAutomationRuleIfUnchanged,
  updateAutomationRuleIfUnchanged
} from "@/components/admin/automationRulePersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { getAccessibleAdminGroups, getAccessibleAdminSubtab, getAccessibleAdminTab, getAdminCategoryKeyboardTarget, getAdminGroupForTab } from "@/components/admin/adminTabNavigation";
import AdminSettingsSearch from "@/components/admin/AdminSettingsSearch";
import { createFeatureReportWithRecovery } from "@/components/reports/featureReportPersistence";
import { classifyAutomationCreateReceipt, reviewUncertainAutomationSave, snapshotUncertainAutomationReview, reviewedAutomationSnapshotIsCurrent } from "@/components/admin/automationSaveReconciliation";
import { AutomationReadTimeoutError, withAutomationReadDeadline } from "@/components/admin/automationReadDeadline";
import { reviewAutomationOperation } from "@/components/admin/automationOperationReconciliation";
import { getAdminNavigationStorageKey, readAdminNavigation, resolveAdminNavigation, storeAdminNavigation } from "@/components/admin/adminNavigationPersistence";
import { staffEntities } from "@/components/staff/staffEntities";
import { loadSingleGlobalSetting, saveGlobalSettingValueIfUnchanged } from "@/components/shared/globalSettingsPersistence";
import { CcsTimeField } from "@/components/ui/ccs-date-field";
import { sendStaffEmail } from "@/components/comms/sendStaffEmail";
const AutomationRule = base44.entities.AutomationRule;
const EmailGroup = base44.entities.EmailGroup;
const TRIGGER_TYPES = [
  // -- Work Orders --
  { value: "work_order_created", label: "Work Order Created", category: "Work Orders" },
  { value: "work_order_updated", label: "Work Order Updated (Any Field)", category: "Work Orders" },
  { value: "work_order_completed", label: "Work Order Completed", category: "Work Orders" },
  { value: "work_order_deleted", label: "Work Order Deleted / Trashed", category: "Work Orders" },
  { value: "work_order_restored", label: "Work Order Restored from Trash", category: "Work Orders" },
  { value: "work_order_client_changed", label: "Client Name Changed", category: "Work Orders" },
  { value: "work_order_description_changed", label: "Description Changed", category: "Work Orders" },
  { value: "work_order_title_changed", label: "Title Changed", category: "Work Orders" },
  { value: "work_order_estimate_changed", label: "Estimate Amount Changed", category: "Work Orders" },
  { value: "work_order_contact_changed", label: "Contact Info Changed", category: "Work Orders" },
  { value: "work_order_install_location_changed", label: "Install Location Changed", category: "Work Orders" },
  { value: "work_order_permit_number_set", label: "Permit Number Set", category: "Work Orders" },
  { value: "work_order_permit_approved", label: "Permit Approved Date Set", category: "Work Orders" },
  { value: "work_order_permit_submitted", label: "Permit Submitted Date Set", category: "Work Orders" },
  { value: "work_order_est_inv_set", label: "Est/Inv Number Set", category: "Work Orders" },
  { value: "work_order_install_date_set", label: "Install Date Set", category: "Work Orders" },
  { value: "work_order_install_date_approaching", label: "Install Date Approaching", category: "Work Orders" },
  { value: "work_order_install_date_passed", label: "Install Date Passed", category: "Work Orders" },
  { value: "work_order_project_health_changed", label: "Project Health Changed", category: "Work Orders" },
  { value: "work_order_production_type_changed", label: "Production Type Changed (In-house/Outsource)", category: "Work Orders" },
  { value: "work_order_file_uploaded", label: "File Uploaded to Work Order", category: "Work Orders" },
  // -- Riders --
  { value: "rider_created", label: "Rider Created", category: "Riders" },
  { value: "rider_completed", label: "Rider Completed", category: "Riders" },
  { value: "rider_deleted", label: "Rider Deleted", category: "Riders" },
  { value: "rider_all_tasks_completed", label: "Rider - All Tasks Completed", category: "Riders" },
  { value: "rider_stage_changed", label: "Rider Stage Changed", category: "Riders" },
  { value: "rider_assigned_to_changed", label: "Rider Assignment Changed", category: "Riders" },
  // -- Stage Movement --
  { value: "stage_changed", label: "Stage Changed (Any)", category: "Stage Movement" },
  { value: "stage_entered", label: "Stage Entered (Specific)", category: "Stage Movement" },
  { value: "stage_exited", label: "Stage Exited (Specific)", category: "Stage Movement" },
  { value: "stage_estimating_entered", label: "Entered Estimating Stage", category: "Stage Movement" },
  { value: "stage_sales_entered", label: "Entered Sales Stage", category: "Stage Movement" },
  { value: "stage_permitting_entered", label: "Entered Permitting Stage", category: "Stage Movement" },
  { value: "stage_design_entered", label: "Entered Design Stage", category: "Stage Movement" },
  { value: "stage_production_entered", label: "Entered Production Stage", category: "Stage Movement" },
  { value: "stage_fabrication_entered", label: "Entered Fabrication Stage", category: "Stage Movement" },
  { value: "stage_installation_entered", label: "Entered Installation Stage", category: "Stage Movement" },
  { value: "stage_completed_entered", label: "Entered Completed Stage", category: "Stage Movement" },
  // -- Tasks --
  { value: "task_added", label: "Task Added", category: "Tasks" },
  { value: "task_completed", label: "Task Completed", category: "Tasks" },
  { value: "task_uncompleted", label: "Task Marked Incomplete", category: "Tasks" },
  { value: "task_edited", label: "Task Text Edited", category: "Tasks" },
  { value: "task_deleted", label: "Task Deleted", category: "Tasks" },
  { value: "task_due_date_set", label: "Task Due Date Set", category: "Tasks" },
  { value: "task_due_date_approaching", label: "Task Due Date Approaching", category: "Tasks" },
  { value: "task_due_date_passed", label: "Task Due Date Passed (Overdue)", category: "Tasks" },
  { value: "task_assigned", label: "Task Assigned to Person", category: "Tasks" },
  { value: "all_tasks_completed", label: "All Tasks Completed on Work Order", category: "Tasks" },
  // -- Notes --
  { value: "note_added", label: "Note Added", category: "Notes" },
  { value: "note_deleted", label: "Note Deleted", category: "Notes" },
  { value: "note_completed", label: "Note Marked Complete", category: "Notes" },
  { value: "sub_note_added", label: "Sub-Note Added", category: "Notes" },
  { value: "sub_note_deleted", label: "Sub-Note Deleted", category: "Notes" },
  { value: "follow_up_added", label: "Follow-Up Item Added", category: "Notes" },
  { value: "follow_up_completed", label: "Follow-Up Item Completed", category: "Notes" },
  // -- Sales Pipeline --
  { value: "sales_status_changed", label: "Sales Status Changed", category: "Sales Pipeline" },
  { value: "sales_lead_created", label: "New Lead Created in Pipeline", category: "Sales Pipeline" },
  { value: "sales_status_won", label: "Status Changed to WON", category: "Sales Pipeline" },
  { value: "sales_status_lost", label: "Status Changed to LOST", category: "Sales Pipeline" },
  { value: "sales_status_on_hold", label: "Status Changed to ON HOLD", category: "Sales Pipeline" },
  { value: "sales_follow_up_date_approaching", label: "Follow-Up Date Approaching", category: "Sales Pipeline" },
  { value: "sales_follow_up_date_passed", label: "Follow-Up Date Passed", category: "Sales Pipeline" },
  { value: "sales_close_date_approaching", label: "Close Date Approaching", category: "Sales Pipeline" },
  { value: "sales_rep_changed", label: "Sales Rep Changed", category: "Sales Pipeline" },
  // -- Pending Imports --
  { value: "pending_import_created", label: "New Pending Import Arrived", category: "Pending Imports" },
  { value: "duplicate_detected", label: "Duplicate Record Detected", category: "Pending Imports" },
  // -- Priority / ASAP --
  { value: "asap_toggled_on", label: "ASAP Toggled ON", category: "Priority" },
  { value: "asap_toggled_off", label: "ASAP Toggled OFF", category: "Priority" },
  { value: "priority_changed", label: "Row Priority Changed", category: "Priority" },
  { value: "project_health_at_risk", label: "Project Health -> At Risk", category: "Priority" },
  { value: "project_health_delayed", label: "Project Health -> Delayed", category: "Priority" },
  { value: "project_health_blocked", label: "Project Health -> Blocked", category: "Priority" },
  { value: "project_health_on_track", label: "Project Health -> On Track", category: "Priority" },
  // -- Assignment --
  { value: "assigned_to_changed", label: "Work Order Assignment Changed", category: "Assignment" },
  { value: "designer_assigned", label: "Designer Assigned", category: "Assignment" },
  { value: "surveyor_assigned", label: "Surveyor Assigned", category: "Assignment" },
  { value: "project_manager_assigned", label: "Project Manager Assigned", category: "Assignment" },
  { value: "estimator_assigned", label: "Estimator Assigned", category: "Assignment" },
  // -- Dates --
  { value: "due_date_approaching", label: "Due Date Approaching", category: "Dates" },
  { value: "due_date_passed", label: "Due Date Passed", category: "Dates" },
  { value: "due_date_set", label: "Due Date Set / Changed", category: "Dates" },
  { value: "due_date_cleared", label: "Due Date Cleared", category: "Dates" },
  { value: "start_date_set", label: "Start Date Set / Changed", category: "Dates" },
  { value: "site_survey_scheduled", label: "Site Survey Date Scheduled", category: "Dates" },
  { value: "site_survey_approaching", label: "Site Survey Date Approaching", category: "Dates" },
  // -- Media --
  { value: "image_uploaded", label: "Image Uploaded to Work Order", category: "Media" },
  { value: "file_attached", label: "File Attached to Work Order", category: "Media" },
  { value: "google_drive_linked", label: "Google Drive Folder Linked", category: "Media" },
  // -- Orders --
  { value: "order_created", label: "Order Created", category: "Orders" },
  { value: "order_ordered", label: "Order Placed (Ordered)", category: "Orders" },
  { value: "order_received", label: "Order Received", category: "Orders" },
  { value: "order_cancelled", label: "Order Cancelled", category: "Orders" },
  { value: "order_date_needed_approaching", label: "Order Date Needed Approaching", category: "Orders" },
  { value: "order_date_needed_passed", label: "Order Date Needed Passed", category: "Orders" },
  { value: "order_overdue", label: "Order Overdue (Not Received)", category: "Orders" },
  { value: "order_customer_name_changed", label: "Order Customer Name Updated", category: "Order Fields" },
  { value: "order_request_type_changed", label: "Order Request Type Updated", category: "Order Fields" },
  { value: "order_description_changed", label: "Order Description Updated", category: "Order Fields" },
  { value: "order_quantity_changed", label: "Order Quantity Updated", category: "Order Fields" },
  { value: "order_requestor_changed", label: "Order Requestor Updated", category: "Order Fields" },
  { value: "order_date_needed_changed", label: "Order Date Needed Updated", category: "Order Fields" },
  { value: "order_date_ordered_changed", label: "Order Date Ordered Updated", category: "Order Fields" },
  { value: "order_vendor_changed", label: "Order Vendor Updated", category: "Order Fields" },
  { value: "order_date_received_changed", label: "Order Date Received Updated", category: "Order Fields" },
  // -- Time Clock --
  { value: "time_clock_in", label: "Employee Clocked In", category: "Time Clock" },
  { value: "time_clock_out", label: "Employee Clocked Out", category: "Time Clock" },
  { value: "time_clock_in_late", label: "Employee Clocked In Late (after 8am)", category: "Time Clock" },
  { value: "time_clock_out_early", label: "Employee Clocked Out Early", category: "Time Clock" },
  { value: "time_entry_notes_updated", label: "Time Entry Notes Updated", category: "Time Clock" },
  { value: "time_entry_long_shift", label: "Shift Exceeds 10 Hours", category: "Time Clock" },
  { value: "time_entry_no_clock_out", label: "No Clock-Out Detected (forgot)", category: "Time Clock" },
  { value: "job_allocation_added", label: "Job Time Allocation Added", category: "Time Clock" },
  { value: "time_off_requested", label: "Time Off Requested", category: "Time Clock" },
  { value: "time_off_approved", label: "Time Off Approved", category: "Time Clock" },
  { value: "time_off_denied", label: "Time Off Denied", category: "Time Clock" },
  { value: "time_off_updated", label: "Time Off Request Updated", category: "Time Clock" },
  { value: "time_off_cancelled", label: "Time Off Request Cancelled", category: "Time Clock" },
  { value: "pto_balance_low", label: "PTO Balance Running Low", category: "Time Clock" },
  // -- Users / HR --
  { value: "user_registered", label: "New User Registered / Onboarded", category: "Users" },
  { value: "user_role_changed", label: "User Role Changed", category: "Users" },
  { value: "user_face_enrolled", label: "User Face ID Enrolled", category: "Users" },
  { value: "user_password_reset", label: "User Password Reset Requested", category: "Users" },
  // -- SIPs / Monday Meeting --
  { value: "sip_item_completed", label: "SIP Item Marked Complete", category: "SIPs / Meetings" },
  { value: "sip_item_revisit_set", label: "SIP Revisit Date Set", category: "SIPs / Meetings" },
  { value: "sip_revisit_date_approaching", label: "SIP Revisit Date Approaching", category: "SIPs / Meetings" },
  { value: "mmm_item_completed", label: "Monday Meeting Item Completed", category: "SIPs / Meetings" },
  // -- Permitting --
  { value: "jurisdiction_profile_created", label: "Jurisdiction Profile Created", category: "Permitting" },
  { value: "jurisdiction_profile_updated", label: "Jurisdiction Profile Updated", category: "Permitting" },
  { value: "regulation_alert_created", label: "Regulation Alert / Change Detected", category: "Permitting" },
  { value: "permit_submitted", label: "Permit Submitted (Submitted Date Set)", category: "Permitting" },
  { value: "permit_approved", label: "Permit Approved", category: "Permitting" },
  { value: "permit_received", label: "Permit Received (Line Complete)", category: "Permitting" },
  { value: "permit_receipt_confirmed", label: "Permit Receipt Confirmed", category: "Permitting" },
  { value: "permit_followup_due", label: "Permit Follow-up Date Reached", category: "Permitting" },
  { value: "permit_followup_overdue", label: "Permit Follow-up Overdue", category: "Permitting" },
  // -- Financials / Reports --
  { value: "feature_report_submitted", label: "Feature / Bug Report Submitted", category: "Reports" },
  { value: "feature_report_status_changed", label: "Feature Report Status Changed", category: "Reports" },
  { value: "feature_report_completed", label: "Feature Report Marked Complete", category: "Reports" },
  // -- Proofs / Products (unified alerts) --
  { value: "proof_sent", label: "Proof Sent for Approval", category: "Proofs" },
  { value: "proof_approved", label: "Proof Approved", category: "Proofs" },
  { value: "product_transition", label: "Product Status Changed", category: "Products" },
  // -- CRM / Purchasing / Invoicing / Reconciliation (unified alerts) --
  { value: "crm_event_completed", label: "CRM Event Completed", category: "CRM" },
  { value: "po_received", label: "Purchase Order Fully Received", category: "Purchasing" },
  { value: "po_backordered", label: "Purchase Order Partially Received (Backordered)", category: "Purchasing" },
  { value: "invoice_overdue", label: "Invoice Overdue", category: "Invoices" },
  { value: "recon_variance", label: "Reconciliation Closed with Variance", category: "Reconciliation" }
];
const TRIGGER_ENTITY = {
  work_order: "WorkOrder",
  stage: "WorkOrder",
  task: "WorkOrder",
  note: "WorkOrder",
  sub_note: "WorkOrder",
  follow_up: "WorkOrder",
  rider: "Rider",
  order: "Order",
  sales: "Opportunity",
  opportunity: "Opportunity",
  general_task: "GeneralTask",
  time_entry: "TimeEntry",
  permit_line: "PermitLineItem",
  jurisdiction_profile: "JurisdictionProfile",
  user: "AuthorizedEmail",
  estimate: "Estimate",
  quote: "Quote",
  email_group: "EmailGroup",
  automation: "AutomationRule",
  pending_import: "PendingImport",
  monitor_scan: "MonitorScanRun",
  proof: "WorkOrder",
  product: "WorkOrder",
  crm_event: "OpportunityActivity",
  po: "PurchaseOrder",
  invoice: "Invoice",
  recon: "ReconciliationBatch"
};
const entityForTrigger = (triggerType) => {
  const prefix = String(triggerType || "").split("_").slice(0, 2).join("_");
  const first = String(triggerType || "").split("_")[0];
  return TRIGGER_ENTITY[prefix] || TRIGGER_ENTITY[first] || null;
};
const TRIGGER_HELP = {
  work_order_created: "Fires the moment a brand-new work order appears in the pipeline.",
  work_order_completed: "Fires when a work order is marked complete.",
  work_order_deleted: "Fires when a work order is moved to trash.",
  work_order_client_changed: "Fires only when the client name on a work order changes.",
  work_order_install_date_set: "Fires when an install date gets entered for the first time or changed.",
  work_order_install_date_approaching: "Fires a few days before the install date - great reminder rules.",
  work_order_install_date_passed: "Fires when an install date slips by without completion.",
  work_order_permit_approved: "Fires the moment a permit gets its approved date.",
  work_order_file_uploaded: "Fires when someone attaches a file to a work order.",
  rider_created: "Fires when a new rider (change request) gets created.",
  rider_completed: "Fires when a rider is finished.",
  rider_all_tasks_completed: "Fires when every task on a rider is done - handy for notify-the-office rules.",
  stage_entered: "Fires when a work order moves INTO the stage you pick.",
  stage_exited: "Fires when a work order moves OUT of the stage you pick.",
  stage_changed: "Fires on any stage move, forward or backward.",
  asap_toggled_on: "Fires when the ASAP flag gets switched ON for a work order.",
  asap_toggled_off: "Fires when the ASAP flag gets switched OFF.",
  time_off_approved: "Fires when a time-off request gets approved.",
  time_off_denied: "Fires when a time-off request gets denied.",
  time_entry_missing_clockout: "Fires when an employee forgets to clock out.",
  time_entry_long_shift: "Fires when a shift runs unusually long.",
  punch_exception: "Fires when a punch problem needs admin attention.",
  proof_sent: "Fires when a product proof is sent to the customer for approval.",
  proof_approved: "Fires when a product proof version is approved.",
  product_transition: "Fires when a work-order product's operational status changes.",
  crm_event_completed: "Fires when a CRM event is closed with an outcome.",
  po_received: "Fires when a purchase order is fully received.",
  po_backordered: "Fires when a purchase order receipt leaves open quantity on backorder.",
  invoice_overdue: "Computed in the attention feed (due date passed with an open balance) - nothing emits this event yet.",
  recon_variance: "Fires when a reconciliation batch closes with a non-zero variance."
};
const GROUP_HELP = {
  workflow: "Workflow: automation rules, task assignments, calendar, and the activity feed",
  people: "People: users and permissions, time clock, and resource capacity",
  integrations: "Integrations: service status, Smartsheet sync, CoreBridge history, and conflict review",
  permitting: "Permitting: completeness dashboards, rule review, and test results",
  system: "System: backend tools (backup, trash, imports, jobs, export) and fleet settings"
};
const ACTION_TYPES = [
  { value: "send_email", label: "Send Email", icon: Mail, color: "blue" },
  { value: "change_stage", label: "Move to Stage", icon: ArrowRight, color: "purple" },
  { value: "set_asap", label: "Set ASAP Status", icon: Flag, color: "red" },
  { value: "assign_to", label: "Assign To", icon: User, color: "green" },
  { value: "add_task", label: "Add Task", icon: CheckCircle2, color: "teal" },
  { value: "add_note", label: "Add Note", icon: FileText, color: "orange" },
  { value: "set_due_date", label: "Set Due Date", icon: Calendar, color: "pink" },
  { value: "create_rider", label: "Create Rider", icon: GitBranch, color: "indigo" },
  { value: "set_priority", label: "Set List Position", icon: SortAsc, color: "cyan" },
  { value: "mark_complete", label: "Mark Complete", icon: CheckCircle2, color: "emerald" }
];
const WORKFLOW_ENGINE_TRIGGER_SET = /* @__PURE__ */ new Set([
  "work_order_created",
  "work_order_completed",
  "work_order_deleted",
  "work_order_updated",
  "work_order_restored",
  "work_order_client_changed",
  "work_order_description_changed",
  "work_order_title_changed",
  "work_order_estimate_changed",
  "work_order_contact_changed",
  "work_order_install_location_changed",
  "work_order_permit_number_set",
  "work_order_permit_approved",
  "work_order_permit_submitted",
  "work_order_est_inv_set",
  "work_order_install_date_set",
  "work_order_project_health_changed",
  "work_order_production_type_changed",
  "work_order_file_uploaded",
  "stage_estimating_entered",
  "stage_sales_entered",
  "stage_permitting_entered",
  "stage_design_entered",
  "stage_production_entered",
  "stage_fabrication_entered",
  "stage_installation_entered",
  "stage_completed_entered",
  "project_health_on_track",
  "project_health_at_risk",
  "project_health_delayed",
  "project_health_blocked",
  "due_date_set",
  "due_date_cleared",
  "start_date_set",
  "site_survey_scheduled",
  "google_drive_linked",
  "file_attached",
  "permit_approved",
  "permit_receipt_confirmed",
  "priority_changed",
  "rider_created",
  "stage_changed",
  "stage_entered",
  "stage_exited",
  "task_added",
  "task_completed",
  "task_deleted",
  "task_uncompleted",
  "task_edited",
  "task_due_date_set",
  "task_assigned",
  "all_tasks_completed",
  "note_added",
  "note_deleted",
  "note_completed",
  "follow_up_added",
  "follow_up_completed",
  "sub_note_added",
  "sub_note_deleted",
  "rider_completed",
  "rider_all_tasks_completed",
  "rider_deleted",
  "rider_stage_changed",
  "rider_assigned_to_changed",
  "designer_assigned",
  "surveyor_assigned",
  "project_manager_assigned",
  "estimator_assigned",
  "sip_item_completed",
  "mmm_item_completed",
  "sip_item_revisit_set",
  "image_uploaded",
  "asap_toggled_on",
  "asap_toggled_off",
  "assigned_to_changed",
  "permit_submitted",
  "permit_received",
  "permit_followup_due",
  "permit_followup_overdue",
  "proof_sent",
  "proof_approved",
  "product_transition"
]);
const ORDER_TRIGGER_SET = /* @__PURE__ */ new Set([
  "order_created",
  "order_ordered",
  "order_received",
  "order_cancelled",
  "order_customer_name_changed",
  "order_request_type_changed",
  "order_description_changed",
  "order_quantity_changed",
  "order_requestor_changed",
  "order_date_needed_changed",
  "order_date_ordered_changed",
  "order_vendor_changed",
  "order_date_received_changed"
]);
const DEADLINE_TRIGGER_SET = /* @__PURE__ */ new Set([
  "due_date_approaching",
  "due_date_passed",
  "work_order_install_date_approaching",
  "work_order_install_date_passed",
  "site_survey_approaching",
  "task_due_date_approaching",
  "task_due_date_passed",
  "sip_revisit_date_approaching"
]);
const ORDER_DEADLINE_TRIGGER_SET = /* @__PURE__ */ new Set([
  "order_date_needed_approaching",
  "order_date_needed_passed",
  "order_overdue"
]);
const SALES_TRIGGER_SET = /* @__PURE__ */ new Set([
  "sales_lead_created",
  "sales_status_changed",
  "sales_status_won",
  "sales_status_lost",
  "sales_status_on_hold",
  "sales_rep_changed"
]);
const SALES_DEADLINE_TRIGGER_SET = /* @__PURE__ */ new Set([
  "sales_follow_up_date_approaching",
  "sales_follow_up_date_passed",
  "sales_close_date_approaching"
]);
const TIME_CLOCK_TRIGGER_SET = /* @__PURE__ */ new Set([
  "time_clock_in",
  "time_clock_out",
  "time_clock_in_late",
  "time_clock_out_early",
  "time_entry_long_shift",
  "time_entry_no_clock_out",
  "time_entry_notes_updated",
  "time_off_requested",
  "time_off_updated",
  "time_off_approved",
  "time_off_denied",
  "time_off_cancelled",
  "job_allocation_added",
  "pto_balance_low"
]);
const PENDING_IMPORT_TRIGGER_SET = /* @__PURE__ */ new Set([
  "pending_import_created",
  "duplicate_detected"
]);
const FEATURE_REPORT_TRIGGER_SET = /* @__PURE__ */ new Set([
  "feature_report_submitted",
  "feature_report_status_changed",
  "feature_report_completed"
]);
const USER_TRIGGER_SET = /* @__PURE__ */ new Set([
  "user_registered",
  "user_password_reset",
  "user_face_enrolled",
  "user_role_changed"
]);
const JURISDICTION_TRIGGER_SET = /* @__PURE__ */ new Set([
  "jurisdiction_profile_created",
  "jurisdiction_profile_updated",
  "regulation_alert_created"
]);
const OPS_RECORD_TRIGGER_SET = /* @__PURE__ */ new Set([
  "crm_event_completed",
  "po_received",
  "po_backordered",
  "recon_variance"
]);
const ORDER_SUPPORTED_ACTIONS = /* @__PURE__ */ new Set(["send_email"]);
const RECORD_SUPPORTED_ACTIONS = /* @__PURE__ */ new Set(["send_email", "add_task", "add_note"]);
const ENGINE_SUPPORTED_ACTIONS = /* @__PURE__ */ new Set([
  "send_email",
  "change_stage",
  "set_asap",
  "assign_to",
  "add_task",
  "add_note",
  "set_due_date",
  "create_rider",
  "set_priority",
  "mark_complete"
]);
const DEADLINE_SUPPORTED_ACTIONS = /* @__PURE__ */ new Set([
  "send_email",
  "set_asap",
  "add_task",
  "add_note"
]);
const getTriggerSupportedActions = (triggerType) => {
  if (WORKFLOW_ENGINE_TRIGGER_SET.has(triggerType)) return ENGINE_SUPPORTED_ACTIONS;
  if (ORDER_TRIGGER_SET.has(triggerType) || SALES_TRIGGER_SET.has(triggerType)) return RECORD_SUPPORTED_ACTIONS;
  if (ORDER_DEADLINE_TRIGGER_SET.has(triggerType) || SALES_DEADLINE_TRIGGER_SET.has(triggerType)) return ORDER_SUPPORTED_ACTIONS;
  if (TIME_CLOCK_TRIGGER_SET.has(triggerType)) return ORDER_SUPPORTED_ACTIONS;
  if (PENDING_IMPORT_TRIGGER_SET.has(triggerType) || FEATURE_REPORT_TRIGGER_SET.has(triggerType) || USER_TRIGGER_SET.has(triggerType) || JURISDICTION_TRIGGER_SET.has(triggerType) || OPS_RECORD_TRIGGER_SET.has(triggerType)) return RECORD_SUPPORTED_ACTIONS;
  if (DEADLINE_TRIGGER_SET.has(triggerType)) return DEADLINE_SUPPORTED_ACTIONS;
  return null;
};
const actionRunsForTriggers = (actionType, triggers) => (triggers || []).some((t) => getTriggerSupportedActions(t?.trigger_type)?.has(actionType));
const ruleIsRunnable = (rule) => (rule?.triggers || []).some((t) => getTriggerSupportedActions(t?.trigger_type)) && (rule?.actions || []).some((a) => actionRunsForTriggers(a?.action_type, rule?.triggers));
const triggerHasOrderFilters = (condition) => !!(condition?.request_type || condition?.vendor || condition?.requestor || condition?.min_quantity != null || condition?.max_quantity != null);
const describeAutomation = (triggers, actions) => {
  const triggerText = (triggers || []).filter((t) => t?.trigger_type).map((t, i) => {
    const filters = Object.entries(t.trigger_condition || {}).filter(([, value]) => value != null && value !== "");
    const onlyIf = filters.length ? ` (only if ${filters.map(([key, value]) => `${key.replace(/^record_/, "").replace(/_/g, " ")} = ${value}`).join(" and ")})` : "";
    return `${i > 0 ? ` ${t.logic === "and" ? "and" : "or"} ` : ""}${TRIGGER_TYPES.find((tt) => tt.value === t.trigger_type)?.label || t.trigger_type}${onlyIf}`;
  }).join("");
  const actionText = (actions || []).filter((a) => a?.action_type).map((a) => `${ACTION_TYPES.find((at) => at.value === a.action_type)?.label || a.action_type}${a.action_config?.target_work_order_id ? ` to Work Order ${a.action_config.target_work_order_id}` : ""}`).join(" and ");
  return triggerText && actionText ? `When ${triggerText}, then ${actionText}.` : "";
};
const STAGES = [
  { value: "estimating", label: "Estimating" },
  { value: "sales", label: "Sales" },
  { value: "permitting", label: "Permitting" },
  { value: "design", label: "Design" },
  { value: "production", label: "Production" },
  { value: "fabrication", label: "Fabrication" },
  { value: "installation", label: "Installation" },
  { value: "completed", label: "Completed" }
];
const RECIPIENT_TYPES = [
  { value: "email", label: "Specific Email" },
  { value: "assigned_user", label: "Assigned User" },
  { value: "creator", label: "Work Order Creator" },
  { value: "all_admins", label: "All Admins" },
  { value: "custom_list", label: "Custom Email List" },
  { value: "email_group", label: "Email Group" }
];
const TEMPLATE_VARIABLES = [
  "{{title}}",
  "{{client_name}}",
  "{{description}}",
  "{{current_stage}}",
  "{{assigned_to}}",
  "{{due_date}}",
  "{{created_by}}",
  "{{is_rider}}",
  "{{is_asap}}",
  "{{previous_stage}}",
  "{{new_stage}}",
  "{{task_text}}",
  "{{note_text}}",
  "{{note_type}}",
  "{{changed_by}}",
  "{{timestamp}}",
  "{{employee_name}}",
  "{{clock_in_time}}",
  "{{clock_out_time}}",
  "{{total_hours}}",
  "{{time_off_type}}",
  "{{time_off_dates}}",
  "{{time_off_hours}}",
  "{{time_off_reason}}"
];
const TEAM_MEMBERS = ["Carl", "Twyla", "Brett", "Kyle", "Joe", "Aidin", "Kay", "Brian", "Chris"];
const ADMIN_TAB_ICONS = {
  automations: Zap,
  users: Users,
  timeclock: Clock,
  backend: Settings,
  corebridge: Bot,
  opportunity_bridge: GitBranch,
  sync_conflicts: AlertTriangle,
  integrations: Braces,
  smartsheet: GitBranch,
  resources: Users,
  permitting_completeness: ClipboardCheck,
  permitting_rules: Scale,
  permitting_tests: FlaskConical,
  task_assignments: UserCheck,
  calendar: CalendarDays,
  activity: Activity,
  fleet: Truck
};
const AUTOMATION_DRAFT_KEY = "admin-automation-editor-draft";
const ADMIN_INTEGRATIONS_TAB = { value: "integrations", label: "Integrations" };
const withAdminIntegrationsTab = (groups, isAdminFlag) => {
  if (!isAdminFlag || !Array.isArray(groups)) return groups;
  return groups.map((group) => group.id === "integrations" && !group.tabs.some((t) => t.value === ADMIN_INTEGRATIONS_TAB.value) ? { ...group, tabs: [ADMIN_INTEGRATIONS_TAB, ...group.tabs] } : group);
};
export default function AdminSettings() {
  const { currentUser, sessionToken } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const [isUnlocked, setIsUnlocked] = useState(() => hasStoredAdminSettingsAuthorization());
  const [accessRequestState, setAccessRequestState] = useState("");
  const [adminSidebar, setAdminSidebar] = useState(() => {
    try {
      return localStorage.getItem("admin_nav_layout") === "sidebar";
    } catch {
      return false;
    }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const toggleSidebarNav = () => {
    setAdminSidebar((cur) => {
      const next = !cur;
      try {
        localStorage.setItem("admin_nav_layout", next ? "sidebar" : "top");
      } catch {
      }
      return next;
    });
  };
  const submitAccessRequest = async () => {
    if (!sessionToken || accessRequestState === "busy") return;
    setAccessRequestState("busy");
    try {
      const r = await base44.functions.invoke("accessRequestAction", { session_token: sessionToken, action: "submit" });
      const data = r?.data || r;
      setAccessRequestState(data?.success ? "sent" : "error");
    } catch {
      setAccessRequestState("error");
    }
  };
  const [capabilityExpiryLabel, setCapabilityExpiryLabel] = useState("");
  const navigationKey = getAdminNavigationStorageKey(currentUser);
  const browserStorage = (() => {
    try {
      return typeof window === "undefined" ? null : window.localStorage;
    } catch {
      return null;
    }
  })();
  const savedNavigation = !searchParams.has("tab") && isUnlocked ? readAdminNavigation(browserStorage, navigationKey, isAdmin, currentUser) : null;
  const resolvedAdminNavigation = resolveAdminNavigation(searchParams, savedNavigation, isAdmin, currentUser);
  const selectedAdminTab = isAdmin && searchParams.get("tab") === ADMIN_INTEGRATIONS_TAB.value ? ADMIN_INTEGRATIONS_TAB.value : resolvedAdminNavigation.tab;
  const selectedAdminSubtab = resolvedAdminNavigation.subtab;
  useEffect(() => {
    if (isUnlocked && navigationKey) {
      storeAdminNavigation(browserStorage, navigationKey, {
        tab: selectedAdminTab,
        subtab: selectedAdminSubtab
      }, isAdmin, currentUser);
    }
  }, [isUnlocked, navigationKey, selectedAdminTab, selectedAdminSubtab, isAdmin, browserStorage]);
  const [emailGroups, setEmailGroups] = useState([]);
  const [emailGroupsLoading, setEmailGroupsLoading] = useState(true);
  const [emailGroupsLoadError, setEmailGroupsLoadError] = useState(false);
  const emailGroupsLoadSequence = useRef(0);
  const userTeamSections = useMemo(() => {
    const email = String(currentUser?.email || "").toLowerCase();
    if (!email || !Array.isArray(emailGroups)) return [];
    return [...new Set(emailGroups.filter((g) => Array.isArray(g?.emails) && g.emails.map((e) => String(e).toLowerCase()).includes(email)).flatMap((g) => Array.isArray(g?.permission_sections) ? g.permission_sections : []))];
  }, [currentUser?.email, emailGroups]);
  const availableAdminGroups = withAdminIntegrationsTab(
    getAccessibleAdminGroups(isAdmin, currentUser, userTeamSections),
    isAdmin
  );
  const requestedDeepLinkTab = searchParams.get("tab");
  const requestedDeepLinkSubtab = searchParams.get("subtab");
  const deniedDeepLinkTab = isUnlocked && requestedDeepLinkTab && requestedDeepLinkTab !== selectedAdminTab;
  const deniedDeepLinkSubtab = isUnlocked && !deniedDeepLinkTab && requestedDeepLinkSubtab && requestedDeepLinkSubtab !== selectedAdminSubtab;
  const resolvedTabLabel = availableAdminGroups.flatMap((g) => g.tabs).find((t) => t.value === selectedAdminTab)?.label || selectedAdminTab;
  const activeAdminGroupId = availableAdminGroups.find((group) => group.tabs.some((t) => t.value === selectedAdminTab))?.id || getAdminGroupForTab(selectedAdminTab, isAdmin, currentUser);
  const activeAdminGroup = availableAdminGroups.find((group) => group.id === activeAdminGroupId) || availableAdminGroups[0];
  const categoryScrollerRef = useRef(null);
  const adminScrollRef = useRef(null);
  const nestedTabListsRef = useRef({});
  useEffect(() => {
    const scroller = categoryScrollerRef.current;
    const selected = [...scroller?.querySelectorAll("[data-admin-category]") || []].find((button) => button.getAttribute("data-admin-category") === activeAdminGroupId);
    if (!selected) return;
    let exploringCategories = false;
    let frame = null;
    const revealSelected = () => {
      const bounds = scroller.getBoundingClientRect();
      const target = selected.getBoundingClientRect();
      if (target.left < bounds.left) scroller.scrollLeft -= bounds.left - target.left + 4;
      else if (target.right > bounds.right) scroller.scrollLeft += target.right - bounds.right + 4;
    };
    const onLayoutChange = () => {
      if (exploringCategories || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (scroller.isConnected && selected.isConnected) revealSelected();
      });
    };
    revealSelected();
    const onExplore = () => {
      exploringCategories = true;
    };
    scroller.addEventListener("wheel", onExplore, { passive: true });
    scroller.addEventListener("touchmove", onExplore, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onLayoutChange) : null;
    observer?.observe(scroller);
    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("orientationchange", onLayoutChange);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", onLayoutChange);
      window.removeEventListener("orientationchange", onLayoutChange);
      scroller.removeEventListener("wheel", onExplore);
      scroller.removeEventListener("touchmove", onExplore);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [activeAdminGroupId]);
  useEffect(() => {
    if (!isUnlocked || !isAdmin) return;
    const list = nestedTabListsRef.current[selectedAdminTab];
    const scrollArea = adminScrollRef.current;
    const active = list?.querySelector('[role="tab"][data-state="active"]');
    if (!active || !scrollArea) return;
    const focused = list.ownerDocument.activeElement;
    if (list.contains(focused) && focused !== active) {
      active.focus({ preventScroll: true });
    }
    const margin = 8;
    const revealActive = () => {
      const tabBounds = active.getBoundingClientRect();
      const areaBounds = scrollArea.getBoundingClientRect();
      if (tabBounds.top < areaBounds.top + margin) {
        scrollArea.scrollTop -= areaBounds.top + margin - tabBounds.top;
      } else if (tabBounds.bottom > areaBounds.bottom - margin) {
        scrollArea.scrollTop += tabBounds.bottom - areaBounds.bottom + margin;
      }
    };
    const activeIsVisible = () => {
      const tab = active.getBoundingClientRect();
      const area = scrollArea.getBoundingClientRect();
      return tab.top >= area.top - 2 && tab.bottom <= area.bottom + 2;
    };
    revealActive();
    let keepVisible = activeIsVisible();
    let frame = null;
    let userScrollFrame = null;
    const onUserScroll = () => {
      if (userScrollFrame !== null) cancelAnimationFrame(userScrollFrame);
      userScrollFrame = requestAnimationFrame(() => {
        userScrollFrame = null;
        if (scrollArea.isConnected && active.isConnected) keepVisible = activeIsVisible();
      });
    };
    const onLayoutChange = () => {
      if (frame !== null || !keepVisible) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (!scrollArea.isConnected || !active.isConnected || !keepVisible) return;
        const currentFocus = list.ownerDocument.activeElement;
        if (currentFocus && currentFocus !== list.ownerDocument.body && !list.contains(currentFocus)) return;
        revealActive();
        keepVisible = activeIsVisible();
      });
    };
    scrollArea.addEventListener("wheel", onUserScroll, { passive: true });
    scrollArea.addEventListener("touchend", onUserScroll, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onLayoutChange) : null;
    for (const element of [
      scrollArea,
      list,
      active,
      list.closest('[role="tabpanel"]'),
      categoryScrollerRef.current?.parentElement
    ]) {
      if (element) observer?.observe(element);
    }
    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("orientationchange", onLayoutChange);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", onLayoutChange);
      window.removeEventListener("orientationchange", onLayoutChange);
      scrollArea.removeEventListener("wheel", onUserScroll);
      scrollArea.removeEventListener("touchend", onUserScroll);
      if (userScrollFrame !== null) cancelAnimationFrame(userScrollFrame);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [isUnlocked, isAdmin, selectedAdminTab, selectedAdminSubtab]);
  const handleAdminTabChange = (nextTab, nextSubtab = null) => {
    const pageLocalTab = nextTab === ADMIN_INTEGRATIONS_TAB.value && isAdmin;
    if (!pageLocalTab && getAccessibleAdminTab(nextTab, isAdmin, currentUser) !== nextTab) return;
    const validSubtab = nextSubtab && getAccessibleAdminSubtab(nextTab, nextSubtab, currentUser) === nextSubtab ? nextSubtab : null;
    if (nextTab === selectedAdminTab && validSubtab === (searchParams.get("subtab") || null)) return;
    setSearchParams((previous) => {
      const updated = new URLSearchParams(previous);
      updated.set("tab", nextTab);
      if (validSubtab) updated.set("subtab", validSubtab);
      else updated.delete("subtab");
      return updated;
    });
  };
  const [automations, setAutomations] = useState([]);
  const [automationsPaused, setAutomationsPaused] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportDraft, setReportDraft] = useState({ title: "", type: "bug", description: "" });
  const [reportBusy, setReportBusy] = useState(false);
  const [reportMsg, setReportMsg] = useState("");
  const [quietSettingRow, setQuietSettingRow] = useState(null);
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState("20:00");
  const [quietEnd, setQuietEnd] = useState("07:00");
  const [quietBusy, setQuietBusy] = useState(false);
  const [pauseSettingRow, setPauseSettingRow] = useState(null);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [pauseError, setPauseError] = useState("");
  const [openExceptionCount, setOpenExceptionCount] = useState(0);
  const [openConflictCount, setOpenConflictCount] = useState(0);
  const [offline, setOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  const [tourSeen, setTourSeen] = useState(() => {
    try {
      return localStorage.getItem("admin_tour_seen") === "1";
    } catch {
      return true;
    }
  });
  const [pinnedTabs, setPinnedTabs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("admin_pinned_tabs") || "[]");
    } catch {
      return [];
    }
  });
  const togglePin = (tabValue) => {
    setPinnedTabs((prev) => {
      const next = prev.includes(tabValue) ? prev.filter((v) => v !== tabValue) : [...prev, tabValue];
      try {
        localStorage.setItem("admin_pinned_tabs", JSON.stringify(next));
      } catch {
      }
      return next;
    });
  };
  const [testEmailAddr, setTestEmailAddr] = useState("");
  const [testEmailBusy, setTestEmailBusy] = useState(false);
  const [testEmailMsg, setTestEmailMsg] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [automationLoadError, setAutomationLoadError] = useState(false);
  const automationLoadSequence = useRef(0);
  const [automationRecoveryListVerified, setAutomationRecoveryListVerified] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [sortBy, setSortBy] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");
  const [ruleFilter, setRuleFilter] = useState("all");
  const [ruleSearch, setRuleSearch] = useState("");
  const [automationSaveError, setAutomationSaveError] = useState("");
  const [automationSaving, setAutomationSaving] = useState(false);
  const automationSaveInFlight = useRef(false);
  const automationSessionEpoch = useRef(0);
  const automationOperationRef = useRef(null);
  const [automationOperation, setAutomationOperation] = useState(null);
  const automationOperationReadOwner = useRef(0);
  const automationOperationReadBusy = useRef(false);
  const [automationOperationReading, setAutomationOperationReading] = useState(false);
  const [automationOperationReview, setAutomationOperationReview] = useState(null);
  const automationOperationEvidence = useRef(null);
  useEffect(() => () => {
    automationSessionEpoch.current += 1;
  }, []);
  const automationEditorBaseline = useRef(null);
  const [automationDraftParked, setAutomationDraftParked] = useState(false);
  const automationUncertainRef = useRef(null);
  const [automationUncertain, setAutomationUncertain] = useState(null);
  const [automationReviewStatus, setAutomationReviewStatus] = useState(null);
  const [automationReviewLoading, setAutomationReviewLoading] = useState(false);
  const automationReviewOwner = useRef(0);
  const automationReviewInFlight = useRef(false);
  const automationReviewSnapshotRef = useRef(null);
  const automationAckInFlight = useRef(false);
  const [automationAckLoading, setAutomationAckLoading] = useState(false);
  const [automationRecoveryFailures, setAutomationRecoveryFailures] = useState(0);
  const [automationRecoveryFailedStep, setAutomationRecoveryFailedStep] = useState(null);
  const automationRetryButtonRef = useRef(null);
  const automationRecoveryFocusRequested = useRef(false);
  const [formData, setFormData] = useState({
    name: "",
    enabled: true,
    priority: 0
  });
  const [triggers, setTriggers] = useState([{ trigger_type: "", trigger_condition: {}, logic: "or" }]);
  const [actions, setActions] = useState([{ action_type: "", action_config: {} }]);
  useEffect(() => {
    if (!isDialogOpen || editingRule) return;
    try {
      localStorage.setItem(AUTOMATION_DRAFT_KEY, JSON.stringify({ formData, triggers, actions, saved_at: Date.now() }));
    } catch {
    }
  }, [formData, triggers, actions, isDialogOpen, editingRule]);
  const automationDraftFingerprintRef = useRef(null);
  automationDraftFingerprintRef.current = JSON.stringify({ formData, triggers, actions });
  const applyAdminAccess = (data) => {
    const capability = String(data?.capability || "").trim();
    const expiresAt = String(data?.expires_at || "").trim();
    if (!capability || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) {
      throw new Error("Admin Settings authorization could not be verified.");
    }
    storeAdminSettingsAuthorization(capability, expiresAt);
    setIsUnlocked(true);
  };
  const automationDraftChanged = () => automationEditorBaseline.current !== null && automationEditorBaseline.current !== JSON.stringify({ formData, triggers, actions });
  const closeAutomationEditor = (open) => {
    if (open) {
      setIsDialogOpen(true);
      return;
    }
    if (automationSaveInFlight.current || automationAckInFlight.current) return;
    setAutomationDraftParked(Boolean(automationUncertainRef.current) || automationDraftChanged());
    setIsDialogOpen(false);
  };
  const discardAutomationDraft = () => {
    if (automationSaveInFlight.current || automationUncertainRef.current) return;
    automationEditorBaseline.current = null;
    setAutomationDraftParked(false);
    setIsDialogOpen(false);
    setAutomationSaveError("");
  };
  useEffect(() => {
    automationSessionEpoch.current += 1;
    automationLoadSequence.current += 1;
    automationOperationRef.current = null;
    setAutomationOperation(null);
    automationOperationReadOwner.current += 1;
    automationOperationReadBusy.current = false;
    setAutomationOperationReading(false);
    automationOperationEvidence.current = null;
    setAutomationOperationReview(null);
    setDeleteConfirm(null);
    setAutomationRecoveryListVerified(false);
    setAutomations([]);
    setAutomationLoadError(true);
    setIsLoading(true);
    automationReviewOwner.current += 1;
    automationReviewInFlight.current = false;
    automationReviewSnapshotRef.current = null;
    automationAckInFlight.current = false;
    setAutomationAckLoading(false);
    setAutomationRecoveryFailures(0);
    setAutomationRecoveryFailedStep(null);
    automationRecoveryFocusRequested.current = false;
    automationUncertainRef.current = null;
    setAutomationUncertain(null);
    setAutomationReviewStatus(null);
    setAutomationReviewLoading(false);
    automationEditorBaseline.current = null;
    automationSaveInFlight.current = false;
    setAutomationDraftParked(false);
    setIsDialogOpen(false);
    setEditingRule(null);
    setFormData({ name: "", enabled: true, priority: 0, group: "" });
    setTriggers([{ trigger_type: "", trigger_condition: {}, logic: "or" }]);
    setActions([{ action_type: "", action_config: {} }]);
    setAutomationSaveError("");
    setAutomationSaving(false);
  }, [sessionToken, navigationKey, isUnlocked]);
  useEffect(() => {
    if (!isUnlocked) {
      setCapabilityExpiryLabel("");
      return;
    }
    const expiresAt = getStoredAdminSettingsCapabilityExpiry();
    if (!Number.isFinite(expiresAt)) {
      setCapabilityExpiryLabel("");
      return;
    }
    const relock = () => {
      setCapabilityExpiryLabel("");
      setPasswordError("Your Admin Settings authorization expired. Sign in again to continue.");
      setIsUnlocked(false);
    };
    if (expiresAt <= Date.now()) {
      relock();
      return;
    }
    setCapabilityExpiryLabel(new Date(expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    const timer = setTimeout(relock, expiresAt - Date.now());
    return () => clearTimeout(timer);
  }, [isUnlocked]);
  const loadEmailGroups = async () => {
    const requestSequence = ++emailGroupsLoadSequence.current;
    setEmailGroupsLoading(true);
    try {
      const groups = await loadAllEntityRows({
        entity: EmailGroup,
        sort: null,
        cacheTtlMs: 3e4,
        label: "Admin Settings email groups"
      });
      if (requestSequence === emailGroupsLoadSequence.current) {
        setEmailGroups(groups);
        setEmailGroupsLoadError(false);
      }
      return groups;
    } catch {
      if (requestSequence === emailGroupsLoadSequence.current) setEmailGroupsLoadError(true);
      return null;
    } finally {
      if (requestSequence === emailGroupsLoadSequence.current) setEmailGroupsLoading(false);
    }
  };
  const sendTestEmail = async () => {
    const to = testEmailAddr.trim();
    if (!to || !to.includes("@") || testEmailBusy) return;
    setTestEmailBusy(true);
    setTestEmailMsg("");
    const body = "This is a test email sent from Admin Settings to verify notification delivery is working.";
    const subject = "CCS Signage - test notification";
    try {
      if (sessionToken) {
        await sendStaffEmail({ sessionToken, to, subject, body, kind: "admin_test" });
      } else {
        const response = await base44.functions.invoke("sendGmail", { to, subject, body });
        if (response?.data?.error) throw new Error(response.data.error);
      }
      setTestEmailMsg(`Test email sent to ${to}.`);
    } catch (e) {
      setTestEmailMsg(e?.response?.data?.error || e?.message || "Send failed - check the Gmail connection.");
    } finally {
      setTestEmailBusy(false);
    }
  };
  const loadAllUsers = async () => {
    const users = await loadAllEntityRows({
      entity: staffEntities.AuthorizedEmail,
      sort: null,
      cacheTtlMs: 3e4,
      label: "Admin Settings authorized users"
    });
    setAllUsers(users);
  };
  const handlePasswordSubmit = async () => {
    if (!usernameInput.trim() || !passwordInput.trim()) {
      setPasswordError("Please enter both username and password");
      return;
    }
    setIsVerifying(true);
    setPasswordError("");
    try {
      const res = await verifyLogin({ username: usernameInput.trim(), password: passwordInput });
      const loginData = res?.data || res;
      if (loginData?.success && loginData.user) {
        if (loginData.user.role === "admin" && loginData.token) {
          const accessRes = await base44.functions.invoke("issueAdminSettingsAccess", { session_token: loginData.token });
          const accessData = accessRes?.data || accessRes;
          if (!accessData?.success || !accessData?.capability) {
            throw new Error(accessData?.error || "Admin Settings authorization could not be issued.");
          }
          applyAdminAccess(accessData);
          setUsernameInput("");
          setPasswordInput("");
        } else {
          setPasswordError("Access denied - admin privileges required");
        }
      } else {
        setPasswordError(loginData?.error || "Invalid username or password");
      }
    } catch (e) {
      setPasswordError(e?.response?.data?.error || e?.message || "Login failed");
    }
    setIsVerifying(false);
  };
  const loadAutomations = async () => {
    const requestSequence = ++automationLoadSequence.current;
    const ownerEpoch = automationSessionEpoch.current;
    setIsLoading(true);
    setAutomationRecoveryListVerified(false);
    try {
      const rules = await withAutomationReadDeadline(() => loadAllEntityRows({
        entity: AutomationRule,
        sort: "-created_date",
        cacheTtlMs: 3e4,
        label: "Admin Settings automation rules"
      }));
      if (requestSequence !== automationLoadSequence.current || ownerEpoch !== automationSessionEpoch.current) return null;
      if (!Array.isArray(rules)) throw new Error("Unverified Automation list response.");
      setAutomations(rules);
      setAutomationLoadError(false);
      return rules;
    } catch {
      if (requestSequence === automationLoadSequence.current && ownerEpoch === automationSessionEpoch.current) {
        setAutomationLoadError(true);
      }
      return null;
    } finally {
      if (requestSequence === automationLoadSequence.current && ownerEpoch === automationSessionEpoch.current) {
        setIsLoading(false);
      }
    }
  };
  useEffect(() => {
    void loadAutomations();
  }, [sessionToken, navigationKey, isUnlocked]);
  useEffect(() => {
    void loadEmailGroups();
    void loadAllUsers();
  }, []);
  const copyRuleJson = async (rule) => {
    const payload = JSON.stringify({
      name: `${rule.name || ""} (imported)`,
      group: rule.group || "",
      enabled: rule.enabled !== false,
      priority: rule.priority || 0,
      triggers: rule.triggers || [],
      actions: rule.actions || []
    }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setRuleMessage?.("Rule JSON copied to clipboard.");
    } catch {
      window.prompt("Copy this rule JSON:", payload);
    }
  };
  const [importJsonText, setImportJsonText] = useState(null);
  const [importJsonError, setImportJsonError] = useState("");
  const applyRuleJson = () => {
    setImportJsonError("");
    try {
      const parsed = JSON.parse(importJsonText);
      if (!parsed || !parsed.name && !Array.isArray(parsed.triggers) && !Array.isArray(parsed.actions)) {
        setImportJsonError("That doesn't look like a rule \u2014 expected { name, triggers, actions }.");
        return;
      }
      setFormData({
        name: parsed.name || "",
        enabled: parsed.enabled !== false,
        priority: parsed.priority || 0,
        group: parsed.group || ""
      });
      if (Array.isArray(parsed.triggers) && parsed.triggers.length) setTriggers(parsed.triggers);
      if (Array.isArray(parsed.actions) && parsed.actions.length) setActions(parsed.actions);
      setImportJsonText("");
    } catch {
      setImportJsonError("Could not parse that JSON.");
    }
  };
  const openNewRule = async () => {
    if (automationSaveInFlight.current) return;
    if (automationUncertainRef.current) {
      setIsDialogOpen(true);
      setAutomationDraftParked(false);
      return;
    }
    if (automationDraftParked) {
      setIsDialogOpen(true);
      setAutomationDraftParked(false);
      return;
    }
    if (emailGroupsLoading) return;
    const ownerEpoch = automationSessionEpoch.current;
    setAutomationSaveError("");
    if (!await loadEmailGroups() || ownerEpoch !== automationSessionEpoch.current) return;
    setEditingRule(null);
    let draft = null;
    try {
      const raw = localStorage.getItem(AUTOMATION_DRAFT_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.formData && Array.isArray(parsed.triggers) && Array.isArray(parsed.actions)) draft = parsed;
    } catch {
    }
    const nextForm = draft?.formData || { name: "", enabled: true, priority: 0, group: "" };
    setTriggers(draft?.triggers || [{ trigger_type: "", trigger_condition: {}, logic: "or" }]);
    setActions(draft?.actions || [{ action_type: "", action_config: {} }]);
    setFormData(nextForm);
    setDraftRestored(!!draft);
    automationEditorBaseline.current = JSON.stringify({
      formData: nextForm,
      triggers: draft?.triggers || [{ trigger_type: "", trigger_condition: {}, logic: "or" }],
      actions: draft?.actions || [{ action_type: "", action_config: {} }]
    });
    setAutomationDraftParked(false);
    setIsDialogOpen(true);
  };
  const openEditRule = async (rule) => {
    if (automationSaveInFlight.current) return;
    if (automationUncertainRef.current) {
      setIsDialogOpen(true);
      setAutomationDraftParked(false);
      return;
    }
    if (automationDraftParked) {
      setIsDialogOpen(true);
      setAutomationDraftParked(false);
      return;
    }
    if (emailGroupsLoading) return;
    const ownerEpoch = automationSessionEpoch.current;
    setAutomationSaveError("");
    if (!await loadEmailGroups() || ownerEpoch !== automationSessionEpoch.current) return;
    setEditingRule(rule);
    setTriggers(rule.triggers || [{ trigger_type: "", trigger_condition: {}, logic: "or" }]);
    setActions(rule.actions || [{ action_type: "", action_config: {} }]);
    const nextForm = {
      name: rule.name || "",
      enabled: rule.enabled !== false,
      priority: rule.priority || 0,
      group: rule.group || ""
    };
    setFormData(nextForm);
    automationEditorBaseline.current = JSON.stringify({
      formData: nextForm,
      triggers: rule.triggers || [{ trigger_type: "", trigger_condition: {}, logic: "or" }],
      actions: rule.actions || [{ action_type: "", action_config: {} }]
    });
    setAutomationDraftParked(false);
    setIsDialogOpen(true);
  };
  const restoreRuleVersion = async (rule) => {
    const history = Array.isArray(rule.history) ? rule.history : [];
    const snapshot = history[history.length - 1]?.snapshot;
    if (!snapshot) return;
    if (automationSaveInFlight.current || emailGroupsLoading) return;
    const ownerEpoch = automationSessionEpoch.current;
    setAutomationSaveError("");
    if (!await loadEmailGroups() || ownerEpoch !== automationSessionEpoch.current) return;
    setEditingRule(rule);
    setTriggers(snapshot.triggers || [{ trigger_type: "", trigger_condition: {}, logic: "or" }]);
    setActions(snapshot.actions || [{ action_type: "", action_config: {} }]);
    const nextForm = {
      name: snapshot.name || rule.name || "",
      enabled: snapshot.enabled !== false,
      priority: snapshot.priority || 0,
      group: snapshot.group || rule.group || ""
    };
    setFormData(nextForm);
    automationEditorBaseline.current = JSON.stringify({
      formData: nextForm,
      triggers: snapshot.triggers || [],
      actions: snapshot.actions || []
    });
    setAutomationDraftParked(false);
    setIsDialogOpen(true);
  };
  const duplicateRule = async (rule) => {
    if (automationSaveInFlight.current) return;
    if (automationUncertainRef.current) {
      setIsDialogOpen(true);
      setAutomationDraftParked(false);
      return;
    }
    if (automationDraftParked) {
      setIsDialogOpen(true);
      setAutomationDraftParked(false);
      return;
    }
    if (emailGroupsLoading) return;
    const ownerEpoch = automationSessionEpoch.current;
    setAutomationSaveError("");
    if (!await loadEmailGroups() || ownerEpoch !== automationSessionEpoch.current) return;
    setEditingRule(null);
    setTriggers(rule.triggers || [{ trigger_type: "", trigger_condition: {}, logic: "or" }]);
    setActions(rule.actions || [{ action_type: "", action_config: {} }]);
    const names = new Set(automations.map((item) => String(item.name || "").trim().toLowerCase()));
    let copyName = `${rule.name} (Copy)`;
    let suffix = 2;
    while (names.has(copyName.toLowerCase())) copyName = `${rule.name} (Copy ${suffix++})`;
    const nextForm = {
      name: copyName,
      enabled: true,
      priority: rule.priority || 0
    };
    setFormData(nextForm);
    automationEditorBaseline.current = JSON.stringify({
      formData: nextForm,
      triggers: rule.triggers || [{ trigger_type: "", trigger_condition: {}, logic: "or" }],
      actions: rule.actions || [{ action_type: "", action_config: {} }]
    });
    setAutomationDraftParked(false);
    setIsDialogOpen(true);
  };
  const handleSave = async () => {
    if (automationOperationRef.current) return;
    const problems = draftProblems(triggers, actions, needsRecordDestination);
    if (problems.length) {
      setAutomationSaveError(problems.join(" "));
      return;
    }
    if (automationUncertainRef.current || automationSaveInFlight.current || automationSaving || emailGroupsLoading || emailGroupsLoadError || !formData.name?.trim() || !triggers[0]?.trigger_type || !actions[0]?.action_type) return;
    if (currentUser?.admin_permissions?.read_only === true) {
      setAutomationSaveError("Read-only admin \u2014 saves are disabled for this account.");
      return;
    }
    const writeCapability = getStoredAdminSettingsCapability();
    if (!writeCapability) {
      setPasswordError("Your Admin Settings authorization expired. Sign in again to continue.");
      setIsUnlocked(false);
      return;
    }
    automationSaveInFlight.current = true;
    const ownerEpoch = automationSessionEpoch.current;
    const saveData = {
      ...formData,
      name: String(formData.name || "").trim(),
      group: String(formData.group || "").trim(),
      triggers,
      actions: actions.map((action) => action.action_config?.target_work_order_id ? {
        ...action,
        action_config: { ...action.action_config, target_work_order_id: destinationWorkOrderId(action.action_config.target_work_order_id) }
      } : action)
    };
    setAutomationSaveError("");
    setAutomationSaving(true);
    let writeDispatched = false;
    let createReceiptStatus = null;
    try {
      if (editingRule) {
        const duplicateName = automations.find((rule) => rule.id !== editingRule.id && String(rule.name || "").trim().toLowerCase() === saveData.name.toLowerCase());
        if (duplicateName) throw new Error(`Another automation named "${saveData.name}" already exists.`);
        writeDispatched = true;
        const saved = await updateAutomationRuleIfUnchanged({
          record: editingRule,
          nextFields: saveData,
          exactVersion: true,
          adminCapability: writeCapability,
          label: `Automation Rule ${editingRule.name || editingRule.id}`
        });
        if (ownerEpoch !== automationSessionEpoch.current) return;
        setAutomations((prev) => prev.map((rule) => rule.id === saved.id ? saved : rule));
      } else {
        writeDispatched = true;
        const result = await createAutomationRuleIfAbsent({
          data: saveData,
          adminCapability: writeCapability,
          label: `Automation Rule ${saveData.name}`
        });
        if (ownerEpoch !== automationSessionEpoch.current) return;
        createReceiptStatus = classifyAutomationCreateReceipt(result, saveData);
        if (createReceiptStatus !== "created") {
          throw new Error("Automation create receipt needs review.");
        }
      }
      automationEditorBaseline.current = null;
      setAutomationDraftParked(false);
      setIsDialogOpen(false);
      await loadAutomations();
    } catch (error) {
      if (ownerEpoch !== automationSessionEpoch.current) return;
      if (writeDispatched && error?.automationPreDispatch !== true) {
        const attempt = {
          kind: editingRule ? "update" : "create",
          originalId: editingRule?.id || null,
          receiptStatus: editingRule ? null : createReceiptStatus,
          attempted: JSON.parse(JSON.stringify(saveData))
        };
        automationUncertainRef.current = attempt;
        automationReviewOwner.current += 1;
        automationReviewInFlight.current = false;
        automationReviewSnapshotRef.current = null;
        automationAckInFlight.current = false;
        setAutomationAckLoading(false);
        setAutomationRecoveryFailures(0);
        setAutomationRecoveryFailedStep(null);
        automationRecoveryFocusRequested.current = false;
        setAutomationUncertain(attempt);
        setAutomationReviewStatus(null);
        setAutomationSaveError("");
      } else {
        setAutomationSaveError(error?.message || "This automation could not be saved.");
      }
    } finally {
      if (ownerEpoch === automationSessionEpoch.current) {
        automationSaveInFlight.current = false;
        setAutomationSaving(false);
      }
    }
  };
  const verifyUncertainAutomationSave = async () => {
    const pending = automationUncertainRef.current;
    if (!pending || automationReviewInFlight.current || automationAckInFlight.current || automationSaveInFlight.current) return;
    automationReviewInFlight.current = true;
    automationRecoveryFocusRequested.current = false;
    automationReviewSnapshotRef.current = null;
    const draftAtReviewStart = automationDraftFingerprintRef.current;
    const ownerEpoch = automationSessionEpoch.current;
    const reviewId = ++automationReviewOwner.current;
    setAutomationReviewLoading(true);
    setAutomationReviewStatus(null);
    try {
      const rows = await withAutomationReadDeadline(() => loadAllEntityRows({
        entity: AutomationRule,
        sort: "-created_date",
        label: "Admin Settings uncertain Automation verification"
      }));
      if (ownerEpoch !== automationSessionEpoch.current || reviewId !== automationReviewOwner.current || automationUncertainRef.current !== pending) return;
      const review = snapshotUncertainAutomationReview({ ...pending, rows });
      setAutomationRecoveryFailures(0);
      setAutomationRecoveryFailedStep(null);
      if (draftAtReviewStart !== automationDraftFingerprintRef.current) {
        setAutomationReviewStatus("stale_draft");
      } else {
        automationReviewSnapshotRef.current = review ? {
          pending,
          review,
          draftFingerprint: draftAtReviewStart
        } : null;
        setAutomationReviewStatus(review?.status || reviewUncertainAutomationSave({ ...pending, rows }));
      }
    } catch (error) {
      if (ownerEpoch === automationSessionEpoch.current && reviewId === automationReviewOwner.current && automationUncertainRef.current === pending) {
        automationReviewSnapshotRef.current = null;
        setAutomationReviewStatus(error instanceof AutomationReadTimeoutError ? "timed_out" : "read_failed");
        setAutomationRecoveryFailures((count) => Math.min(count + 1, 99));
        setAutomationRecoveryFailedStep("verification");
        automationRecoveryFocusRequested.current = true;
      }
    } finally {
      if (ownerEpoch === automationSessionEpoch.current && reviewId === automationReviewOwner.current) {
        automationReviewInFlight.current = false;
        setAutomationReviewLoading(false);
      }
    }
  };
  const abandonUncertainAutomationAttempt = async () => {
    const evidence = automationReviewSnapshotRef.current;
    const pending = automationUncertainRef.current;
    if (automationSaveInFlight.current || automationReviewInFlight.current || automationAckInFlight.current || !pending || evidence?.pending !== pending || !["matching", "different", "not_found", "ambiguous"].includes(automationReviewStatus)) return;
    if (automationDraftFingerprintRef.current !== evidence.draftFingerprint) {
      automationReviewSnapshotRef.current = null;
      setAutomationReviewStatus("stale_draft");
      return;
    }
    automationAckInFlight.current = true;
    automationRecoveryFocusRequested.current = false;
    const ownerEpoch = automationSessionEpoch.current;
    const reviewId = ++automationReviewOwner.current;
    setAutomationAckLoading(true);
    try {
      const rows = await withAutomationReadDeadline(() => loadAllEntityRows({
        entity: AutomationRule,
        sort: "-created_date",
        label: "Admin Settings uncertain Automation acknowledgment"
      }));
      if (ownerEpoch !== automationSessionEpoch.current || reviewId !== automationReviewOwner.current || automationUncertainRef.current !== pending || automationReviewSnapshotRef.current !== evidence) return;
      const draftChanged = automationDraftFingerprintRef.current !== evidence.draftFingerprint;
      if (draftChanged || !reviewedAutomationSnapshotIsCurrent(evidence.review, { ...pending, rows })) {
        automationReviewSnapshotRef.current = null;
        setAutomationReviewStatus(draftChanged ? "stale_draft" : "stale");
        return;
      }
      automationLoadSequence.current += 1;
      setAutomations(rows);
      setAutomationLoadError(false);
      setIsLoading(false);
      setAutomationRecoveryListVerified(true);
      automationReviewSnapshotRef.current = null;
      automationRecoveryFocusRequested.current = false;
      setAutomationRecoveryFailures(0);
      setAutomationRecoveryFailedStep(null);
      automationUncertainRef.current = null;
      setAutomationUncertain(null);
      setAutomationReviewStatus(null);
      automationEditorBaseline.current = null;
      setAutomationDraftParked(false);
      setIsDialogOpen(false);
      setEditingRule(null);
      setAutomationSaveError("");
    } catch (error) {
      if (ownerEpoch === automationSessionEpoch.current && reviewId === automationReviewOwner.current && automationUncertainRef.current === pending) {
        automationReviewSnapshotRef.current = null;
        setAutomationReviewStatus(error instanceof AutomationReadTimeoutError ? "timed_out" : "read_failed");
        setAutomationRecoveryFailures((count) => Math.min(count + 1, 99));
        setAutomationRecoveryFailedStep("acknowledgment");
        automationRecoveryFocusRequested.current = true;
      }
    } finally {
      if (ownerEpoch === automationSessionEpoch.current && reviewId === automationReviewOwner.current) {
        automationAckInFlight.current = false;
        setAutomationAckLoading(false);
      }
    }
  };
  useEffect(() => {
    if (!automationRecoveryFocusRequested.current || automationReviewLoading || automationAckLoading || !["timed_out", "read_failed"].includes(automationReviewStatus)) return;
    const button = automationRetryButtonRef.current;
    const active = document.activeElement;
    if (!button?.isConnected || button.disabled || active !== document.body && active !== button && !active?.closest?.("[data-automation-recovery-controls]")) return;
    automationRecoveryFocusRequested.current = false;
    button.focus({ preventScroll: true });
  }, [automationReviewStatus, automationRecoveryFailures, automationReviewLoading, automationAckLoading, isDialogOpen]);
  const uncertainAutomationReview = automationUncertain ? /* @__PURE__ */ jsxs(
    "div",
    {
      role: "alert",
      "aria-label": "Automation save outcome requires review",
      className: "mb-4 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950",
      children: [
        /* @__PURE__ */ jsx("p", { className: "font-semibold", children: "Automation save result is uncertain" }),
        /* @__PURE__ */ jsx("p", { className: "mt-1", children: "The request might have succeeded. Your draft remains here, but saving it again is blocked. Checking status reads records only." }),
        automationUncertain?.kind === "create" && ["existing", "recovered", "concurrent_duplicate_discarded"].includes(automationUncertain.receiptStatus) && /* @__PURE__ */ jsx("p", { className: "mt-2", children: automationUncertain.receiptStatus === "existing" ? "A rule already used this name before the create could be confirmed." : automationUncertain.receiptStatus === "recovered" ? "The server located a rule after processing the request, but ownership of that result is uncertain." : "Concurrent creation left a different rule as the canonical record. Review it before proceeding." }),
        automationReviewStatus && /* @__PURE__ */ jsx("p", { className: "mt-2", role: "status", children: automationReviewStatus === "matching" ? "A current rule matches the attempted values. This does not prove which request wrote it; do not resubmit." : automationReviewStatus === "timed_out" ? "The read-only check timed out. No result was verified; your draft is preserved. Verify again to start a fresh read." : automationReviewStatus === "stale" ? "The reviewed rule changed before acknowledgment. Your draft is preserved; verify again to review the latest state." : automationReviewStatus === "stale_draft" ? "The draft changed during review. Your edits are preserved; verify again before acknowledgment." : automationReviewStatus === "read_failed" || automationReviewStatus === "unverified" ? "The rule list could not be verified. No new write is allowed." : automationReviewStatus === "not_found" ? "No matching rule was found. A delayed write is still possible; do not resubmit this attempt." : automationReviewStatus === "ambiguous" ? "Multiple possible matches exist. No new write is allowed." : "A rule exists but its values differ from the attempted save. Review the latest record before making changes." }),
        automationRecoveryFailures >= 2 && /* @__PURE__ */ jsxs("div", { role: "status", "aria-label": "Repeated Automation verification failures", className: "mt-3 rounded-md border border-amber-300 bg-white p-2", children: [
          /* @__PURE__ */ jsxs("p", { className: "font-semibold", children: [
            automationRecoveryFailures,
            " consecutive read-only checks failed or timed out."
          ] }),
          /* @__PURE__ */ jsxs("p", { className: "mt-1", children: [
            "Last affected step: ",
            automationRecoveryFailedStep === "acknowledgment" ? "acknowledgment recheck" : "save verification",
            ". Your draft has not been discarded, and no Automation save was retried. You can verify again or close the editor and return to Automations; this draft remains available in this Admin session."
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "mt-3 flex flex-wrap gap-2", "data-automation-recovery-controls": true, children: [
          /* @__PURE__ */ jsx(
            Button,
            {
              ref: automationRetryButtonRef,
              type: "button",
              size: "sm",
              variant: "outline",
              disabled: automationReviewLoading || automationAckLoading || automationSaving,
              onClick: () => {
                void verifyUncertainAutomationSave();
              },
              children: automationReviewLoading ? "Checking rules..." : "Verify save status (read-only)"
            }
          ),
          isDialogOpen && /* @__PURE__ */ jsx(
            Button,
            {
              type: "button",
              size: "sm",
              variant: "outline",
              disabled: automationReviewLoading || automationAckLoading || automationSaving,
              onClick: () => closeAutomationEditor(false),
              children: "Return to Automations (keep draft)"
            }
          ),
          ["matching", "different", "not_found", "ambiguous"].includes(automationReviewStatus) && /* @__PURE__ */ jsx(
            Button,
            {
              type: "button",
              size: "sm",
              variant: "outline",
              disabled: automationReviewLoading || automationAckLoading || automationSaving,
              onClick: () => {
                void abandonUncertainAutomationAttempt();
              },
              children: automationAckLoading ? "Rechecking reviewed rule..." : "Acknowledge and discard this draft"
            }
          )
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs", children: "Acknowledgment rechecks the reviewed rule and draft before discarding local changes. This is a point-in-time read, not a server-side cancellation or proof of who saved the rule." })
      ]
    }
  ) : null;
  const runAutomationOperation = async (kind, rule) => {
    if (!rule?.id || automationOperationRef.current || automationSaveInFlight.current || automationUncertainRef.current || isLoading || automationLoadError) return;
    if (currentUser?.admin_permissions?.read_only === true) {
      setAutomationSaveError("Read-only admin \u2014 saves are disabled for this account.");
      return;
    }
    const writeCapability = getStoredAdminSettingsCapability();
    if (!writeCapability) {
      setPasswordError("Your Admin Settings authorization expired. Sign in again to continue.");
      setIsUnlocked(false);
      return;
    }
    const operation = {
      kind,
      id: rule.id,
      name: rule.name || rule.id,
      enabled: !rule.enabled,
      settled: false,
      phase: "pending"
    };
    const epoch = automationSessionEpoch.current;
    const owns = () => epoch === automationSessionEpoch.current && automationOperationRef.current === operation;
    automationOperationRef.current = operation;
    setAutomationOperation({ ...operation });
    automationOperationEvidence.current = null;
    setAutomationOperationReview(null);
    setDeleteConfirm(null);
    setAutomationSaveError("");
    automationLoadSequence.current += 1;
    setAutomationRecoveryListVerified(false);
    const write = Promise.resolve().then(() => kind === "delete" ? deleteAutomationRuleIfUnchanged({
      record: rule,
      adminCapability: writeCapability,
      label: `Automation Rule ${operation.name} deletion`
    }) : updateAutomationRuleIfUnchanged({
      record: rule,
      nextFields: { enabled: operation.enabled },
      exactVersion: false,
      adminCapability: writeCapability,
      label: `Automation Rule ${operation.name} enabled state`
    }));
    const settled = write.then((result) => {
      operation.settled = true;
      return result;
    }, (error) => {
      operation.settled = true;
      throw error;
    });
    try {
      const result = await withAutomationReadDeadline(() => settled);
      if (!owns()) return;
      if (kind === "delete" ? result?.deleted !== true : result?.id !== rule.id || result.enabled !== operation.enabled || !result.updated_date) {
        throw new Error("Automation operation receipt could not be verified.");
      }
      await loadAutomations();
      if (!owns()) return;
      automationOperationRef.current = null;
      setAutomationOperation(null);
    } catch (error) {
      if (!owns()) return;
      if (error?.automationPreDispatch === true) {
        automationOperationRef.current = null;
        setAutomationOperation(null);
        automationOperationEvidence.current = null;
        setAutomationOperationReview(null);
        setAutomationSaveError(error?.message || "This automation operation could not be started.");
        return;
      }
      operation.phase = "uncertain";
      setAutomationOperation({ ...operation });
    }
    void settled.catch(() => {
    }).finally(() => {
      if (!owns() || operation.phase !== "uncertain") return;
      automationOperationReadOwner.current += 1;
      automationOperationReadBusy.current = false;
      setAutomationOperationReading(false);
      automationOperationEvidence.current = null;
      setAutomationOperationReview(null);
      setAutomationOperation({ ...operation });
    });
  };
  const handleDelete = (rule) => runAutomationOperation("delete", rule);
  const toggleEnabled = (rule) => runAutomationOperation("toggle", rule);
  const approveRule = async (rule) => {
    if (currentUser?.admin_permissions?.read_only === true) {
      setAutomationSaveError("Read-only admin \u2014 saves are disabled for this account.");
      return;
    }
    const writeCapability = getStoredAdminSettingsCapability();
    if (!writeCapability) return;
    try {
      const saved = await updateAutomationRuleIfUnchanged({
        record: rule,
        nextFields: { approval_status: "approved" },
        adminCapability: writeCapability
      });
      if (saved?.id) setAutomations((prev) => prev.map((r) => r.id === saved.id ? saved : r));
    } catch (err) {
      setPauseError(`Rule "${rule?.name || rule?.id}" could not be approved: ${err?.message || err}`);
    }
  };
  const reconcileAutomationOperation = async (acknowledge = false) => {
    const operation = automationOperationRef.current;
    if (!operation || operation.phase !== "uncertain" || automationOperationReadBusy.current) return;
    const evidence = automationOperationEvidence.current;
    if (acknowledge && (!operation.settled || !evidence)) return;
    const epoch = automationSessionEpoch.current;
    const owner = ++automationOperationReadOwner.current;
    const owns = () => epoch === automationSessionEpoch.current && owner === automationOperationReadOwner.current && automationOperationRef.current === operation;
    automationOperationReadBusy.current = true;
    setAutomationOperationReading(true);
    try {
      const rows = await withAutomationReadDeadline(() => loadAllEntityRows({
        entity: AutomationRule,
        sort: "name",
        label: "Admin Settings Automation operation reconciliation"
      }));
      if (!owns()) return;
      const review = reviewAutomationOperation(operation, rows);
      if (acknowledge && review.snapshot !== evidence.snapshot) {
        automationOperationEvidence.current = null;
        setAutomationOperationReview("changed");
        return;
      }
      if (acknowledge) {
        automationLoadSequence.current += 1;
        setAutomations(rows);
        setAutomationLoadError(false);
        setIsLoading(false);
        setAutomationRecoveryListVerified(true);
        automationOperationReadBusy.current = false;
        setAutomationOperationReading(false);
        automationOperationRef.current = null;
        setAutomationOperation(null);
        automationOperationEvidence.current = null;
        setAutomationOperationReview(null);
      } else {
        automationOperationEvidence.current = operation.settled ? review : null;
        setAutomationOperationReview(review.status);
      }
    } catch {
      if (!owns()) return;
      automationOperationEvidence.current = null;
      setAutomationOperationReview("failed");
    } finally {
      if (owns()) {
        automationOperationReadBusy.current = false;
        setAutomationOperationReading(false);
      }
    }
  };
  const ordinaryAutomationRecovery = automationOperation ? /* @__PURE__ */ jsxs(
    "div",
    {
      role: "alert",
      "aria-label": "Automation operation requires review",
      className: "mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950",
      children: [
        /* @__PURE__ */ jsx("p", { className: "font-semibold", children: automationOperation.phase === "pending" ? "Automation operation in progress" : "Automation operation outcome is uncertain" }),
        /* @__PURE__ */ jsxs("p", { className: "mt-1", children: [
          automationOperation.kind === "delete" ? "Delete" : automationOperation.enabled ? "Enable" : "Disable",
          ": ",
          automationOperation.name,
          ". Automation writes are paused. Your editor draft is preserved."
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-1", children: "A list refresh cannot resolve this attempt. Verification reads current state only; it does not retry or cancel the request, or prove which request changed the rule." }),
        automationOperation.phase === "uncertain" && /* @__PURE__ */ jsxs(Fragment, { children: [
          !automationOperation.settled && /* @__PURE__ */ jsx("p", { className: "mt-2", children: "The original request is still pending. You can inspect current state; acknowledgment remains paused until it settles." }),
          /* @__PURE__ */ jsx("p", { role: "status", className: "mt-2", children: automationOperationReview === "matching" ? "The rule currently has the requested enabled state." : automationOperationReview === "different" ? "The rule currently has a different enabled state." : automationOperationReview === "absent" ? "The rule is absent from the complete current list." : automationOperationReview === "present" ? "The rule is still present in the current list." : automationOperationReview === "changed" ? "The reviewed rule changed. Verify again before acknowledgment." : automationOperationReview === "failed" ? "Verification failed or timed out. No current state was verified. Try the read again." : "Verify the current rule before acknowledging this attempt." }),
          /* @__PURE__ */ jsxs("div", { className: "mt-3 flex flex-wrap gap-2", children: [
            /* @__PURE__ */ jsx(
              Button,
              {
                type: "button",
                variant: "outline",
                disabled: automationOperationReading,
                onClick: () => {
                  void reconcileAutomationOperation();
                },
                children: automationOperationReading ? "Checking operation..." : "Verify operation status (read-only)"
              }
            ),
            /* @__PURE__ */ jsx(
              Button,
              {
                type: "button",
                variant: "outline",
                disabled: automationOperationReading || !automationOperation.settled || !automationOperationEvidence.current,
                onClick: () => {
                  void reconcileAutomationOperation(true);
                },
                children: "Acknowledge reviewed operation"
              }
            )
          ] })
        ] })
      ]
    }
  ) : null;
  const addTrigger = () => setTriggers([...triggers, { trigger_type: "", trigger_condition: {}, logic: "or" }]);
  const [condTest, setCondTest] = useState(null);
  const [condTestBusy, setCondTestBusy] = useState(false);
  const transferRuleOwner = async (rule, owner) => {
    if (currentUser?.admin_permissions?.read_only === true) {
      setAutomationSaveError("Read-only admin \u2014 saves are disabled for this account.");
      return;
    }
    const writeCapability = getStoredAdminSettingsCapability();
    if (!writeCapability || !rule?.id) return;
    try {
      const saved = await updateAutomationRuleIfUnchanged({
        record: rule,
        nextFields: { owner },
        exactVersion: true,
        adminCapability: writeCapability,
        label: `Automation Rule ${rule.name || rule.id}`
      });
      setAutomations((prev) => prev.map((r) => r.id === saved.id ? saved : r));
    } catch {
    }
  };
  const runConditionTest = async () => {
    if (condTestBusy) return;
    const t = triggers.find((x) => x?.trigger_type);
    if (!t) {
      setCondTest("Pick a trigger first.");
      return;
    }
    const entity = entityForTrigger(t.trigger_type);
    if (!entity || !staffEntities[entity]) {
      setCondTest("No record list to test against for this trigger.");
      return;
    }
    setCondTestBusy(true);
    setCondTest(null);
    try {
      const rows = await staffEntities[entity].list("-created_date", 25).catch(() => []);
      const conds = Object.entries(t.trigger_condition || {}).filter(([, v]) => v != null && v !== "");
      const match = (row) => conds.every(([f, v]) => {
        const rv = row?.[f];
        if (rv == null) return false;
        return String(rv) === String(v) || String(rv).toLowerCase().includes(String(v).toLowerCase());
      });
      const hits = rows.filter(match).length;
      setCondTest(conds.length ? `${hits} of ${rows.length} recent ${entity} records match these conditions (preview only \u2014 no actions ran).` : `${rows.length} recent ${entity} records would fire this trigger (no conditions set \u2014 preview only).`);
    } catch {
      setCondTest("Could not load records for the test.");
    } finally {
      setCondTestBusy(false);
    }
  };
  const removeTrigger = (index) => triggers.length > 1 && setTriggers(triggers.filter((_, i) => i !== index));
  const updateTrigger = (index, field, value) => {
    const updated = [...triggers];
    if (field === "trigger_type") {
      updated[index] = { trigger_type: value, trigger_condition: {}, logic: updated[index].logic || "or" };
    } else if (field === "logic") {
      updated[index] = { ...updated[index], logic: value };
    } else {
      updated[index] = { ...updated[index], trigger_condition: { ...updated[index].trigger_condition, [field]: value } };
    }
    setTriggers(updated);
  };
  const addAction = () => setActions([...actions, { action_type: "", action_config: {} }]);
  const removeAction = (index) => actions.length > 1 && setActions(actions.filter((_, i) => i !== index));
  const updateAction = (index, field, value) => {
    const updated = [...actions];
    if (field === "action_type") {
      updated[index] = { action_type: value, action_config: {} };
    } else {
      updated[index] = { ...updated[index], action_config: { ...updated[index].action_config, [field]: value } };
    }
    setActions(updated);
  };
  const getTriggerNeedsStage = (type) => ["stage_entered", "stage_exited"].includes(type);
  const getTriggerNeedsFromTo = (type) => type === "stage_changed";
  const getTriggerIsOrderType = (type) => type && type.startsWith("order_");
  const ORDER_REQUEST_TYPES = ["Substrate", "Vinyl", "Supplies", "Other"];
  const ORDER_VENDORS = ["Grimco", "Glantz", "JDS", "Kost", "Stock", "Other"];
  const needsRecordDestination = triggers.some((t) => getTriggerSupportedActions(t.trigger_type) === RECORD_SUPPORTED_ACTIONS);
  const builderProblems = draftProblems(triggers, actions, needsRecordDestination);
  const applyAutomationPreset = (preset) => {
    const draft = draftFromPreset(preset);
    setFormData(draft.formData);
    setTriggers(draft.triggers);
    setActions(draft.actions);
    setAutomationSaveError("");
  };
  const ruleOrphanedTargets = (rule) => {
    const missing = [];
    for (const a of rule.actions || []) {
      const config = a.action_config || {};
      if (a.action_type === "send_email") {
        for (const r of config.recipients || []) {
          if (r?.type === "email_group" && r.value && !emailGroups.some((g) => g.id === r.value)) missing.push("email group");
        }
      }
      if (a.action_type === "assign_to" && config.assignee && !TEAM_MEMBERS.includes(config.assignee)) missing.push(`assignee "${config.assignee}"`);
      if (a.action_type === "change_stage" && config.stage && !STAGES.some((st) => st.value === config.stage)) missing.push("target stage");
      if (a.action_type === "create_rider" && config.rider_stage && !STAGES.some((st) => st.value === config.rider_stage)) missing.push("rider stage");
    }
    return [...new Set(missing)];
  };
  const describeAutomationRule = (rule) => {
    const triggers2 = (rule.triggers || []).map((t) => {
      const label = TRIGGER_TYPES.find((x) => x.value === t.trigger_type)?.label || t.trigger_type;
      const filters = Object.values(t.trigger_condition || {}).filter((v) => v != null && v !== "").length;
      return filters ? `${label} (filtered)` : label;
    });
    const actions2 = (rule.actions || []).map((a) => ACTION_TYPES.find((x) => x.value === a.action_type)?.label || a.action_type);
    const when = triggers2.length ? `When ${triggers2.join(" or ")}` : "When triggered";
    const then = actions2.length ? `then ${actions2.join(" and ")}` : "no action is set up yet";
    return `${when}  -  ${then}${rule.enabled === false ? " (currently turned off)" : ""}.`;
  };
  const groupedTriggers = TRIGGER_TYPES.filter((t) => getTriggerSupportedActions(t.value)).reduce((acc, trigger) => {
    if (!acc[trigger.category]) acc[trigger.category] = [];
    acc[trigger.category].push(trigger);
    return acc;
  }, {});
  const sortedAutomations = [...automations].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case "name":
        comparison = (a.name || "").localeCompare(b.name || "");
        break;
      case "trigger":
        const aTrigger = a.triggers?.[0]?.trigger_type || "";
        const bTrigger = b.triggers?.[0]?.trigger_type || "";
        const aTriggerLabel = TRIGGER_TYPES.find((t) => t.value === aTrigger)?.category || aTrigger;
        const bTriggerLabel = TRIGGER_TYPES.find((t) => t.value === bTrigger)?.category || bTrigger;
        comparison = aTriggerLabel.localeCompare(bTriggerLabel);
        break;
      case "action":
        const aAction = a.actions?.[0]?.action_type || "";
        const bAction = b.actions?.[0]?.action_type || "";
        const aActionLabel = ACTION_TYPES.find((t) => t.value === aAction)?.label || aAction;
        const bActionLabel = ACTION_TYPES.find((t) => t.value === bAction)?.label || bAction;
        comparison = aActionLabel.localeCompare(bActionLabel);
        break;
      case "enabled":
        comparison = (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0);
        break;
      default:
        comparison = 0;
    }
    return sortDirection === "asc" ? comparison : -comparison;
  });
  const loadAutomationPauseState = async () => {
    try {
      const row = await loadSingleGlobalSetting({ entity: staffEntities.GlobalSettings, settingKey: "automations_paused", label: "Automation pause state" });
      loadSingleGlobalSetting({ entity: staffEntities.GlobalSettings, settingKey: "notificationQuietHours", label: "Notification quiet hours" }).then((qh) => {
        setQuietSettingRow(qh);
        const v = qh?.setting_value;
        if (v) {
          setQuietEnabled(v.enabled === true);
          if (v.start) setQuietStart(v.start);
          if (v.end) setQuietEnd(v.end);
        }
      }).catch(() => null);
      setPauseSettingRow(row || null);
      setAutomationsPaused(row?.setting_value?.paused === true);
    } catch {
    }
  };
  useEffect(() => {
    if (!isUnlocked) return;
    void loadAutomationPauseState();
    staffEntities.TimeClockPunchException.filter({ status: "open" }).then((rows) => setOpenExceptionCount(Array.isArray(rows) ? rows.length : 0)).catch(() => setOpenExceptionCount(0));
    staffEntities.SyncConflict.filter({ status: "open" }).then((rows) => setOpenConflictCount(Array.isArray(rows) ? rows.length : 0)).catch(() => setOpenConflictCount(0));
  }, [isUnlocked]);
  const toggleAutomationPause = async () => {
    if (pauseBusy) return;
    setPauseBusy(true);
    setPauseError("");
    const next = !automationsPaused;
    try {
      const saved = await saveGlobalSettingValueIfUnchanged({
        entity: staffEntities.GlobalSettings,
        loadedRecord: pauseSettingRow,
        settingKey: "automations_paused",
        nextValue: { paused: next, paused_at: (/* @__PURE__ */ new Date()).toISOString() },
        label: "Automation pause state"
      });
      setPauseSettingRow(saved);
      setAutomationsPaused(next);
    } catch (err) {
      setPauseError(err?.message || "Pause state could not be saved.");
      await loadAutomationPauseState().catch(() => null);
    } finally {
      setPauseBusy(false);
    }
  };
  const saveQuietHours = async (patch) => {
    if (quietBusy) return;
    setQuietBusy(true);
    try {
      const saved = await saveGlobalSettingValueIfUnchanged({
        entity: staffEntities.GlobalSettings,
        loadedRecord: quietSettingRow,
        settingKey: "notificationQuietHours",
        nextValue: { enabled: patch.enabled ?? quietEnabled, start: patch.start ?? quietStart, end: patch.end ?? quietEnd },
        label: "Notification quiet hours"
      });
      setQuietSettingRow(saved);
      if (patch.enabled !== void 0) setQuietEnabled(patch.enabled);
      if (patch.start) setQuietStart(patch.start);
      if (patch.end) setQuietEnd(patch.end);
    } catch (err) {
      setPauseError(`Quiet hours not saved: ${err?.message || err}`);
    } finally {
      setQuietBusy(false);
    }
  };
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDirection("asc");
    }
  };
  const uncoveredTriggerTypes = TRIGGER_TYPES.filter(
    (t) => getTriggerSupportedActions(t.value) && !automations.some((r) => r.enabled !== false && (r.triggers || []).some((tr) => tr.trigger_type === t.value))
  );
  const sig = (list, key) => [...new Set((list || []).map((x) => x?.[key]).filter(Boolean))].sort().join("|");
  const currentRuleSig = `${sig(triggers, "trigger_type")}->${sig(actions, "action_type")}`;
  const nearDuplicateRule = currentRuleSig !== "->" ? automations.find(
    (rule) => rule.id !== editingRule?.id && `${sig(rule.triggers, "trigger_type")}->${sig(rule.actions, "action_type")}` === currentRuleSig
  ) : null;
  const visibleAutomations = sortedAutomations.filter((rule) => {
    const isEnabled = rule.enabled !== false;
    if (ruleFilter === "enabled" && !isEnabled) return false;
    if (ruleFilter === "disabled" && isEnabled) return false;
    const q = ruleSearch.trim().toLowerCase();
    if (!q) return true;
    const trigger = TRIGGER_TYPES.find((t) => t.value === (rule.triggers?.[0]?.trigger_type || ""));
    const action = ACTION_TYPES.find((t) => t.value === (rule.actions?.[0]?.action_type || ""));
    return [rule.name, trigger?.label, trigger?.category, action?.label].filter(Boolean).join(" ").toLowerCase().includes(q);
  });
  const renderRecordDestination = (config, index) => needsRecordDestination && /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-blue-200 bg-blue-50 p-3", children: [
    /* @__PURE__ */ jsx(Label, { htmlFor: `record-destination-${index}`, children: "Destination Work Order *" }),
    /* @__PURE__ */ jsx(
      Input,
      {
        id: `record-destination-${index}`,
        className: "mt-1",
        value: config.target_work_order_id || "",
        placeholder: "Paste the Work Order link or ID",
        onChange: (e) => updateAction(index, "target_work_order_id", e.target.value),
        onBlur: (e) => {
          const id = destinationWorkOrderId(e.target.value);
          if (id) updateAction(index, "target_work_order_id", id);
        }
      }
    ),
    /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-blue-800", children: "For record events, the task or note goes to this Work Order; saving verifies it is not in Trash. Work Order events in the same rule still use their original Work Order." })
  ] });
  const renderActionConfig = (action, index) => {
    const config = action.action_config || {};
    switch (action.action_type) {
      case "send_email":
        return /* @__PURE__ */ jsxs("div", { className: "space-y-3 mt-3 p-3 bg-white/50 rounded-lg", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between p-3 rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(Sparkles, { className: "w-4 h-4 text-purple-500" }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx(Label, { className: "text-sm font-medium", children: "AI-Generated Email" }),
                /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-500", children: "Dynamically generate email content based on actual order/work order data" })
              ] })
            ] }),
            /* @__PURE__ */ jsx(
              Switch,
              {
                "aria-label": "Use AI for this action",
                checked: config.use_ai === true,
                onCheckedChange: (val) => updateAction(index, "use_ai", val)
              }
            )
          ] }),
          config.use_ai && /* @__PURE__ */ jsxs("div", { className: "p-3 bg-purple-50 rounded-lg border border-purple-100 text-xs text-purple-700", children: [
            /* @__PURE__ */ jsx("div", { className: "font-medium mb-1", children: "How it works:" }),
            /* @__PURE__ */ jsx("p", { children: "When this automation triggers, AI will generate a personalized email using the actual data from the order/work order (customer name, description, items, dates, etc.) instead of using a fixed template." })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
            (config.recipients || [{ type: "email", value: "" }]).map((recipient, rIndex) => /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ jsxs(
                Select,
                {
                  value: recipient.type,
                  onValueChange: (val) => {
                    const newRecipients = [...config.recipients || [{ type: "email", value: "" }]];
                    newRecipients[rIndex] = { ...newRecipients[rIndex], type: val };
                    updateAction(index, "recipients", newRecipients);
                  },
                  children: [
                    /* @__PURE__ */ jsx(SelectTrigger, { className: "w-40", children: /* @__PURE__ */ jsx(SelectValue, {}) }),
                    /* @__PURE__ */ jsx(SelectContent, { children: RECIPIENT_TYPES.map((t) => /* @__PURE__ */ jsx(
                      SelectItem,
                      {
                        value: t.value,
                        disabled: needsRecordDestination && ["assigned_user", "creator"].includes(t.value),
                        children: t.label
                      },
                      t.value
                    )) })
                  ]
                }
              ),
              recipient.type === "email" && /* @__PURE__ */ jsx(
                Input,
                {
                  placeholder: "email@example.com",
                  value: recipient.value || "",
                  onChange: (e) => {
                    const newRecipients = [...config.recipients || [{ type: "email", value: "" }]];
                    newRecipients[rIndex] = { ...newRecipients[rIndex], value: e.target.value };
                    updateAction(index, "recipients", newRecipients);
                  },
                  className: "flex-1"
                }
              ),
              recipient.type === "email_group" && /* @__PURE__ */ jsxs(
                Select,
                {
                  value: recipient.value || "",
                  onValueChange: (val) => {
                    const newRecipients = [...config.recipients || [{ type: "email", value: "" }]];
                    newRecipients[rIndex] = { ...newRecipients[rIndex], value: val };
                    updateAction(index, "recipients", newRecipients);
                  },
                  children: [
                    /* @__PURE__ */ jsx(SelectTrigger, { className: "flex-1", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Select group" }) }),
                    /* @__PURE__ */ jsx(SelectContent, { children: emailGroups.map((g) => /* @__PURE__ */ jsx(SelectItem, { value: g.id, children: g.name }, g.id)) })
                  ]
                }
              )
            ] }, rIndex)),
            /* @__PURE__ */ jsxs(Button, { variant: "ghost", size: "sm", className: "h-6 text-xs", onClick: () => {
              const newRecipients = [...config.recipients || [], { type: "email", value: "" }];
              updateAction(index, "recipients", newRecipients);
            }, children: [
              /* @__PURE__ */ jsx(Plus, { className: "w-3 h-3 mr-1" }),
              " Add Recipient"
            ] })
          ] }),
          /* @__PURE__ */ jsx(
            Input,
            {
              placeholder: "Email Subject",
              value: config.subject || "",
              onChange: (e) => updateAction(index, "subject", e.target.value)
            }
          ),
          /* @__PURE__ */ jsx(
            Textarea,
            {
              placeholder: "Email Body",
              value: config.body || "",
              onChange: (e) => updateAction(index, "body", e.target.value),
              className: "min-h-20"
            }
          ),
          !config.use_ai && /* @__PURE__ */ jsx("div", { className: "flex flex-wrap gap-1", children: TEMPLATE_VARIABLES.slice(0, 6).map((v) => /* @__PURE__ */ jsx(
            Button,
            {
              variant: "outline",
              size: "sm",
              className: "h-5 text-xs px-1",
              onClick: () => updateAction(index, "body", (config.body || "") + v),
              children: v
            },
            v
          )) })
        ] });
      case "change_stage":
        return /* @__PURE__ */ jsxs(Select, { value: config.stage || "", onValueChange: (val) => updateAction(index, "stage", val), children: [
          /* @__PURE__ */ jsx(SelectTrigger, { className: "mt-2", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Select stage" }) }),
          /* @__PURE__ */ jsx(SelectContent, { children: STAGES.map((s) => /* @__PURE__ */ jsx(SelectItem, { value: s.value, children: s.label }, s.value)) })
        ] });
      case "set_asap":
        return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mt-2", children: [
          /* @__PURE__ */ jsx(Switch, { "aria-label": "Toggle ASAP", checked: config.asap === true, onCheckedChange: (val) => updateAction(index, "asap", val) }),
          /* @__PURE__ */ jsx(Label, { className: "text-sm", children: config.asap ? "Turn ASAP ON" : "Turn ASAP OFF" })
        ] });
      case "assign_to":
        return /* @__PURE__ */ jsxs(Select, { value: config.assignee || "", onValueChange: (val) => updateAction(index, "assignee", val), children: [
          /* @__PURE__ */ jsx(SelectTrigger, { className: "mt-2", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Select person" }) }),
          /* @__PURE__ */ jsx(SelectContent, { children: TEAM_MEMBERS.map((m) => /* @__PURE__ */ jsx(SelectItem, { value: m, children: m }, m)) })
        ] });
      case "add_task":
        return /* @__PURE__ */ jsxs("div", { className: "space-y-2 mt-2", children: [
          /* @__PURE__ */ jsx(Input, { "aria-label": "Task text", placeholder: "What needs to be done?", value: config.task || "", onChange: (e) => updateAction(index, "task", e.target.value) }),
          renderRecordDestination(config, index)
        ] });
      case "add_note":
        return /* @__PURE__ */ jsxs("div", { className: "space-y-2 mt-2", children: [
          /* @__PURE__ */ jsxs(Select, { value: config.note_type || "admin", onValueChange: (val) => updateAction(index, "note_type", val), children: [
            /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, {}) }),
            /* @__PURE__ */ jsx(SelectContent, { children: ["admin", "fabrication", "vinyl", "permitting", "design", "installation", "client", "other"].map((t) => /* @__PURE__ */ jsx(SelectItem, { value: t, children: t }, t)) })
          ] }),
          /* @__PURE__ */ jsx(Textarea, { placeholder: "Note text", value: config.note || "", onChange: (e) => updateAction(index, "note", e.target.value) }),
          renderRecordDestination(config, index)
        ] });
      case "set_due_date":
        return /* @__PURE__ */ jsxs("div", { className: "flex gap-2 mt-2", children: [
          /* @__PURE__ */ jsx(Input, { type: "number", min: "0", max: "3650", step: "1", placeholder: "Days", value: config.days ?? "", onChange: (e) => updateAction(index, "days", e.target.value), className: "w-20" }),
          /* @__PURE__ */ jsxs(Select, { value: config.direction || "after", onValueChange: (val) => updateAction(index, "direction", val), children: [
            /* @__PURE__ */ jsx(SelectTrigger, { className: "w-32", children: /* @__PURE__ */ jsx(SelectValue, {}) }),
            /* @__PURE__ */ jsxs(SelectContent, { children: [
              /* @__PURE__ */ jsx(SelectItem, { value: "after", children: "days from today" }),
              /* @__PURE__ */ jsx(SelectItem, { value: "before", children: "days before today" })
            ] })
          ] })
        ] });
      case "create_rider":
        return /* @__PURE__ */ jsxs("div", { className: "space-y-2 mt-2", children: [
          /* @__PURE__ */ jsx(Input, { placeholder: "Rider title (optional - defaults to 'Work order title - Rider')", value: config.title || "", onChange: (e) => updateAction(index, "title", e.target.value) }),
          /* @__PURE__ */ jsxs(Select, { value: config.rider_stage || "", onValueChange: (val) => updateAction(index, "rider_stage", val), children: [
            /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Rider stage (defaults to current stage)" }) }),
            /* @__PURE__ */ jsx(SelectContent, { children: STAGES.filter((s) => s.value !== "completed").map((s) => /* @__PURE__ */ jsx(SelectItem, { value: s.value, children: s.label }, s.value)) })
          ] }),
          /* @__PURE__ */ jsx(Input, { placeholder: "First task on the rider (optional)", value: config.task || "", onChange: (e) => updateAction(index, "task", e.target.value) }),
          /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-500", children: "The rider is named after its parent work order. If a rider with the same title already exists, a duplicate will not be created." })
        ] });
      case "set_priority":
        return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mt-2", children: [
          /* @__PURE__ */ jsx(Input, { type: "number", placeholder: "1", value: config.priority || "", onChange: (e) => updateAction(index, "priority", e.target.value), className: "w-24" }),
          /* @__PURE__ */ jsx(Label, { className: "text-sm text-gray-600", children: "Position in list - lower numbers sit higher" })
        ] });
      default:
        return null;
    }
  };
  const handleFaceRecognized = async (recognizedUser, descriptor) => {
    const matched = allUsers.find((u) => u.id === recognizedUser?.id || u.email === recognizedUser?.email);
    if (matched?.role !== "admin") {
      setPasswordError("Face recognized but admin privileges required");
      return;
    }
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      setPasswordError("Admin face verification could not be completed safely. Please use your password.");
      return;
    }
    if (!sessionToken) {
      setPasswordError("Face ID needs an active Time Clock sign-in on this device. Sign in with your username and password to start one.");
      return;
    }
    if (currentUser?.email && String(matched.email || "").toLowerCase() !== String(currentUser.email).toLowerCase()) {
      setPasswordError("This face belongs to a different admin than the signed-in session. Sign in again as that user.");
      return;
    }
    setIsVerifying(true);
    setPasswordError("");
    try {
      const accessRes = await base44.functions.invoke("issueAdminSettingsAccess", { session_token: sessionToken, face_descriptor: descriptor });
      const accessData = accessRes?.data || accessRes;
      if (!accessData?.success || !accessData?.capability || String(accessData?.user?.id || "") !== String(matched.id || "")) {
        throw new Error(accessData?.error || "Admin face could not be verified by the server.");
      }
      applyAdminAccess(accessData);
    } catch (error) {
      setPasswordError(error?.response?.data?.error || error?.message || "Admin face verification failed.");
    } finally {
      setIsVerifying(false);
    }
  };
  const handleBadgeScanned = async (decodedText) => {
    const code = String(decodedText || "").trim();
    if (!code.startsWith("TIMECLOCK2:")) {
      setPasswordError("This is an old or invalid Time Clock badge. Generate a new secure badge from Time Clock Settings.");
      return;
    }
    setIsVerifying(true);
    setPasswordError("");
    try {
      const accessRes = await base44.functions.invoke("issueAdminSettingsAccess", { badge_code: code });
      const accessData = accessRes?.data || accessRes;
      if (!accessData?.success || !accessData?.capability) {
        throw new Error(accessData?.error || "Badge could not be verified by the server.");
      }
      applyAdminAccess(accessData);
    } catch (error) {
      setPasswordError(error?.response?.data?.error || error?.message || "Badge verification failed.");
    } finally {
      setIsVerifying(false);
    }
  };
  if (!isUnlocked) {
    return /* @__PURE__ */ jsx("div", { className: "min-h-screen p-6 flex items-center justify-center", children: /* @__PURE__ */ jsxs("div", { className: "clay-card p-8 max-w-md w-full", children: [
      /* @__PURE__ */ jsxs("div", { className: "text-center mb-6", children: [
        /* @__PURE__ */ jsx("div", { className: "w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center", style: { background: "linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)" }, children: /* @__PURE__ */ jsx(Settings, { className: "w-8 h-8 text-purple-700" }) }),
        /* @__PURE__ */ jsx("h2", { className: "text-xl font-bold text-gray-800", children: "Admin Settings" }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 mt-1", children: IDENTIFY_CAMERA_BLURB })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsx(
          FaceRecognition,
          {
            allUsers,
            onRecognized: handleFaceRecognized,
            onQrScan: handleBadgeScanned
          }
        ),
        passwordError && /* @__PURE__ */ jsx("p", { className: "text-red-500 text-sm text-center", children: passwordError }),
        /* @__PURE__ */ jsxs("div", { className: "relative flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "flex-1 h-px bg-gray-200" }),
          /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-400", children: "or enter credentials" }),
          /* @__PURE__ */ jsx("div", { className: "flex-1 h-px bg-gray-200" })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx(Label, { children: "Username" }),
          /* @__PURE__ */ jsx(
            Input,
            {
              type: "text",
              placeholder: "Enter your username",
              value: usernameInput,
              onChange: (e) => {
                setUsernameInput(e.target.value);
                setPasswordError("");
              },
              onKeyDown: (e) => e.key === "Enter" && handlePasswordSubmit(),
              className: "mt-1",
              autoComplete: "off",
              "data-lpignore": "true",
              "data-form-type": "other"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx(Label, { children: "Password" }),
          /* @__PURE__ */ jsx(
            Input,
            {
              type: "password",
              placeholder: "Enter your Time Clock password",
              value: passwordInput,
              onChange: (e) => {
                setPasswordInput(e.target.value);
                setPasswordError("");
              },
              onKeyDown: (e) => e.key === "Enter" && handlePasswordSubmit(),
              className: "mt-1",
              autoComplete: "new-password",
              "data-lpignore": "true",
              "data-form-type": "other"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs(
          Button,
          {
            onClick: handlePasswordSubmit,
            disabled: isVerifying,
            className: "w-full clay-button border-none",
            style: { background: "linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)" },
            children: [
              isVerifying ? /* @__PURE__ */ jsx(Loader2, { className: "w-4 h-4 animate-spin mr-2" }) : null,
              "Unlock Admin Settings"
            ]
          }
        ),
        currentUser && currentUser.role !== "admin" && /* @__PURE__ */ jsxs("div", { className: "border-t border-gray-100 pt-3 text-center", children: [
          /* @__PURE__ */ jsxs("p", { className: "text-xs text-gray-500", children: [
            "Signed in as ",
            currentUser.email,
            " \u2014 this account is not an admin."
          ] }),
          accessRequestState === "sent" ? /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs font-medium text-green-600", children: "Access request sent \u2014 an admin will review it." }) : /* @__PURE__ */ jsx(
            Button,
            {
              variant: "link",
              size: "sm",
              disabled: accessRequestState === "busy",
              onClick: submitAccessRequest,
              className: "text-xs text-indigo-600",
              children: accessRequestState === "busy" ? "Sending\u2026" : accessRequestState === "error" ? "Request failed \u2014 try again" : "Request admin access"
            }
          )
        ] })
      ] })
    ] }) });
  }
  return /* @__PURE__ */ jsx("div", { ref: adminScrollRef, "data-admin-scroll-area": true, id: "admin-print-root", className: "min-h-full w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto p-3 sm:p-6", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto w-full min-w-0 max-w-6xl pb-8", children: [
    (deniedDeepLinkTab || deniedDeepLinkSubtab) && /* @__PURE__ */ jsx("div", { className: "mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800", role: "status", children: deniedDeepLinkTab ? `The Admin page "${requestedDeepLinkTab}" isn't available for your account  -  showing ${resolvedTabLabel} instead.` : `The Admin sub-page "${requestedDeepLinkSubtab}" isn't available for your account.` }),
    (() => {
      const tabLabel = activeAdminGroup.tabs.find((t) => t.value === selectedAdminTab)?.label || "";
      const SUBTAB_LABELS = {
        entries: "Time Entries",
        reports: "Reports",
        pto: "PTO Policies",
        overtime: "Overtime Rules",
        backup: "Data Backup",
        client_trash: "Client Trash",
        order_trash: "Order Trash"
      };
      const subLabel = SUBTAB_LABELS[selectedAdminSubtab] || "";
      const crumbs = ["Admin", activeAdminGroup.label, tabLabel, subLabel].filter(Boolean);
      return /* @__PURE__ */ jsx("nav", { "aria-label": "Breadcrumb", className: "mb-2 text-xs text-gray-500", children: crumbs.map((c, i) => /* @__PURE__ */ jsxs("span", { children: [
        i > 0 && /* @__PURE__ */ jsx("span", { className: "mx-1 text-gray-300", children: "/" }),
        /* @__PURE__ */ jsx("span", { className: i === crumbs.length - 1 ? "font-semibold text-gray-800" : "", children: c })
      ] }, i)) });
    })(),
    /* @__PURE__ */ jsxs("div", { className: "mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4", "aria-label": "Admin overview", children: [
      /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-gray-200 bg-white/70 px-3 py-2", children: [
        /* @__PURE__ */ jsx("p", { className: "text-[11px] text-gray-500", children: "Automation rules" }),
        /* @__PURE__ */ jsxs("p", { className: "text-lg font-bold text-gray-800", children: [
          automations.length,
          /* @__PURE__ */ jsxs("span", { className: "ml-1 text-xs font-medium text-green-700", children: [
            automations.filter((r) => r.enabled !== false).length,
            " on"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-gray-200 bg-white/70 px-3 py-2", children: [
        /* @__PURE__ */ jsx("p", { className: "text-[11px] text-gray-500", children: "Open punch exceptions" }),
        /* @__PURE__ */ jsx("p", { className: `text-lg font-bold ${openExceptionCount ? "text-red-700" : "text-gray-800"}`, children: openExceptionCount })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-gray-200 bg-white/70 px-3 py-2", children: [
        /* @__PURE__ */ jsx("p", { className: "text-[11px] text-gray-500", children: "Sync conflicts" }),
        /* @__PURE__ */ jsx("p", { className: `text-lg font-bold ${openConflictCount ? "text-amber-700" : "text-gray-800"}`, children: openConflictCount })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-gray-200 bg-white/70 px-3 py-2", children: [
        /* @__PURE__ */ jsx("p", { className: "text-[11px] text-gray-500", children: "Automations" }),
        /* @__PURE__ */ jsx("p", { className: `text-lg font-bold ${automationsPaused ? "text-red-700" : "text-green-700"}`, children: automationsPaused ? "PAUSED" : "Live" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("style", { children: `@media print {
          #admin-print-root button, #admin-print-root nav, #admin-print-root [role="tablist"],
          #admin-print-root input, #admin-print-root select, #admin-print-root [role="dialog"],
          #admin-print-root [role="alertdialog"] { display: none !important; }
          #admin-print-root .clay-card { break-inside: avoid; }
          #admin-print-root table { font-size: 11px; }
        }` }),
    offline && /* @__PURE__ */ jsx("div", { className: "mb-3 rounded-lg border border-red-400 bg-red-100 px-3 py-2 text-xs font-semibold text-red-900", role: "alert", children: "You appear to be offline  -  admin changes will not save until your connection returns." }),
    (() => {
      const failingRules = automations.filter((r) => Array.isArray(r.recent_runs) && r.recent_runs.slice(-3).length === 3 && r.recent_runs.slice(-3).every((x) => x?.status === "error"));
      const checks = [
        { ok: !automationsPaused, label: automationsPaused ? "Automations paused" : "Automations running" },
        { ok: emailGroups.length > 0, label: emailGroups.length ? `${emailGroups.length} email group${emailGroups.length === 1 ? "" : "s"}` : "No email groups" },
        { ok: uncoveredTriggerTypes.length === 0, label: uncoveredTriggerTypes.length ? `${uncoveredTriggerTypes.length} uncovered trigger type${uncoveredTriggerTypes.length === 1 ? "" : "s"}` : "All triggers covered" },
        { ok: failingRules.length === 0, label: failingRules.length ? `${failingRules.length} rule${failingRules.length === 1 ? "" : "s"} failing` : "No failing rules" }
      ];
      return /* @__PURE__ */ jsx("div", { className: "mb-3 flex flex-wrap gap-1.5", "aria-label": "Setup checks", children: checks.map((c) => /* @__PURE__ */ jsxs("span", { className: `rounded-full border px-2 py-0.5 text-[11px] font-medium ${c.ok ? "border-green-300 bg-green-50 text-green-800" : "border-amber-300 bg-amber-50 text-amber-800"}`, children: [
        c.ok ? "OK" : "!",
        " ",
        c.label
      ] }, c.label)) });
    })(),
    !tourSeen && /* @__PURE__ */ jsx("div", { className: "mb-3 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3", role: "note", "aria-label": "Admin quick tour", children: /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-2", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-indigo-900", children: "New to Admin? Three things to know:" }),
        /* @__PURE__ */ jsxs("ol", { className: "mt-1 list-decimal pl-4 text-xs text-indigo-800 space-y-0.5", children: [
          /* @__PURE__ */ jsxs("li", { children: [
            /* @__PURE__ */ jsx("b", { children: "Ctrl+K" }),
            " or the search box jumps to any admin page or setting."
          ] }),
          /* @__PURE__ */ jsx("li", { children: "Tabs are grouped by job \u2014 People, Work, Integrations, Permitting, System." }),
          /* @__PURE__ */ jsx("li", { children: "Green setup-check chips above flag anything missing; fix amber ones first." })
        ] })
      ] }),
      /* @__PURE__ */ jsx(
        Button,
        {
          type: "button",
          size: "sm",
          variant: "ghost",
          className: "h-7 text-xs text-indigo-700",
          onClick: () => {
            setTourSeen(true);
            try {
              localStorage.setItem("admin_tour_seen", "1");
            } catch {
            }
          },
          children: "Got it"
        }
      )
    ] }) }),
    /* @__PURE__ */ jsxs(Tabs, { value: selectedAdminTab, onValueChange: handleAdminTabChange, className: `w-full min-w-0 max-w-full space-y-6 ${adminSidebar ? "lg:flex lg:items-start lg:gap-4 lg:space-y-0" : ""}`, children: [
      /* @__PURE__ */ jsxs("div", { className: `clay-card sticky top-0 z-20 w-full min-w-0 max-w-full rounded-xl border border-red-200/70 p-2 shadow-sm ${adminSidebar ? "lg:w-56 lg:shrink-0" : ""}`, style: { background: "#FEE2E2" }, children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-2", children: [
          /* @__PURE__ */ jsx("div", { className: "min-w-0 flex-1", children: /* @__PURE__ */ jsx(AdminSettingsSearch, { isAdmin, currentUser, onNavigate: handleAdminTabChange }) }),
          /* @__PURE__ */ jsxs(
            Button,
            {
              type: "button",
              variant: "outline",
              size: "sm",
              className: "shrink-0 gap-1 text-xs",
              onClick: () => {
                setReportMsg("");
                setReportOpen(true);
              },
              "aria-label": "Report an issue or idea",
              children: [
                /* @__PURE__ */ jsx(Flag, { className: "h-3.5 w-3.5", "aria-hidden": "true" }),
                " Report"
              ]
            }
          )
        ] }),
        capabilityExpiryLabel && /* @__PURE__ */ jsxs("p", { "data-admin-capability-expiry": true, className: "px-2 pb-1 text-right text-[11px] font-medium text-red-900/60", children: [
          "Admin authorization expires at ",
          capabilityExpiryLabel
        ] }),
        /* @__PURE__ */ jsx(Dialog, { open: reportOpen, onOpenChange: setReportOpen, children: /* @__PURE__ */ jsxs(DialogContent, { children: [
          /* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsx(DialogTitle, { children: "Report an issue or idea" }) }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-3 pt-1", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx(Label, { className: "text-xs", children: "Short title" }),
              /* @__PURE__ */ jsx(Input, { value: reportDraft.title, onChange: (e) => setReportDraft((d) => ({ ...d, title: e.target.value })), placeholder: "What happened or what would help?", className: "mt-1" })
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx(Label, { className: "text-xs", children: "Kind" }),
              /* @__PURE__ */ jsxs(Select, { value: reportDraft.type, onValueChange: (v) => setReportDraft((d) => ({ ...d, type: v })), children: [
                /* @__PURE__ */ jsx(SelectTrigger, { className: "mt-1", children: /* @__PURE__ */ jsx(SelectValue, {}) }),
                /* @__PURE__ */ jsxs(SelectContent, { children: [
                  /* @__PURE__ */ jsx(SelectItem, { value: "bug", children: "Something is broken" }),
                  /* @__PURE__ */ jsx(SelectItem, { value: "improvement", children: "Could be better" }),
                  /* @__PURE__ */ jsx(SelectItem, { value: "feature", children: "New idea" })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx(Label, { className: "text-xs", children: "Details" }),
              /* @__PURE__ */ jsx(Textarea, { rows: 4, value: reportDraft.description, onChange: (e) => setReportDraft((d) => ({ ...d, description: e.target.value })), placeholder: "Steps, what you expected, which page you were on\u2026", className: "mt-1" })
            ] }),
            reportMsg && /* @__PURE__ */ jsx("p", { className: `text-xs ${reportMsg.startsWith("Saved") ? "text-emerald-600" : "text-red-600"}`, children: reportMsg }),
            /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-2", children: [
              /* @__PURE__ */ jsx(Button, { type: "button", variant: "outline", size: "sm", onClick: () => setReportOpen(false), children: "Cancel" }),
              /* @__PURE__ */ jsx(
                Button,
                {
                  type: "button",
                  size: "sm",
                  disabled: reportBusy || !reportDraft.title.trim() || !sessionToken,
                  onClick: async () => {
                    setReportBusy(true);
                    setReportMsg("");
                    try {
                      await createFeatureReportWithRecovery({
                        data: { title: reportDraft.title.trim(), type: reportDraft.type, description: reportDraft.description.trim() },
                        sessionToken,
                        label: "Admin feedback"
                      });
                      setReportMsg("Saved \u2014 thank you.");
                      setReportDraft({ title: "", type: "bug", description: "" });
                    } catch (err) {
                      setReportMsg(err?.message || "Report could not be saved.");
                    } finally {
                      setReportBusy(false);
                    }
                  },
                  children: reportBusy ? "Saving\u2026" : "Send report"
                }
              )
            ] })
          ] })
        ] }) }),
        /* @__PURE__ */ jsxs("div", { ref: categoryScrollerRef, role: "group", "aria-label": "Admin navigation categories", className: `flex w-full min-w-0 max-w-full ${adminSidebar ? "flex-col items-stretch gap-1 border-b-0" : "flex-nowrap items-center gap-1.5 overflow-x-auto overscroll-x-contain border-b border-red-200/70"} pb-2 [scrollbar-width:thin]`, children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: toggleSidebarNav,
              className: "hidden lg:inline-flex min-h-8 items-center justify-center rounded-lg border border-transparent bg-white/30 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-white/70",
              title: "Switch navigation layout",
              children: adminSidebar ? "\u21F1 Top nav" : "\u21F2 Sidebar"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => setMobileNavOpen(true),
              className: "lg:hidden inline-flex min-h-8 items-center justify-center rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700",
              "aria-label": "Open all admin pages",
              children: "\u2630 Pages"
            }
          ),
          availableAdminGroups.map((group) => /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              "data-admin-category": group.id,
              title: GROUP_HELP[group.id] || group.label,
              "aria-pressed": activeAdminGroup.id === group.id,
              onClick: () => {
                if (activeAdminGroup.id !== group.id) handleAdminTabChange(group.tabs[0].value);
              },
              onKeyDown: (event) => {
                const index = availableAdminGroups.findIndex((entry) => entry.id === group.id);
                const targetIndex = getAdminCategoryKeyboardTarget(event.key, index, availableAdminGroups.length);
                if (targetIndex === null) return;
                event.preventDefault();
                event.currentTarget.parentElement?.querySelectorAll("[data-admin-category]")[targetIndex]?.focus();
              },
              className: `inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${activeAdminGroup.id === group.id ? "border-red-200 bg-white text-gray-900 shadow-sm" : "border-transparent bg-white/30 text-gray-700 hover:border-red-200 hover:bg-white/70"}`,
              children: group.label
            },
            group.id
          ))
        ] }),
        /* @__PURE__ */ jsx(TabsList, { "aria-label": `Admin ${activeAdminGroup.label} pages`, className: `mt-2 grid h-auto min-h-10 w-full min-w-0 max-w-full items-stretch gap-1 bg-transparent p-1 ${adminSidebar ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`, children: [...activeAdminGroup.tabs].sort((a, b) => (pinnedTabs.includes(b.value) ? 1 : 0) - (pinnedTabs.includes(a.value) ? 1 : 0)).map((tab) => {
          const TabIcon = ADMIN_TAB_ICONS[tab.value];
          return /* @__PURE__ */ jsxs(
            TabsTrigger,
            {
              value: tab.value,
              className: "min-h-11 min-w-0 max-w-full gap-2 whitespace-normal break-words px-2 py-2 text-center text-xs sm:px-3 sm:text-sm focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 data-[state=active]:bg-white/80",
              children: [
                TabIcon && /* @__PURE__ */ jsx(TabIcon, { className: "h-4 w-4 shrink-0", "aria-hidden": "true" }),
                /* @__PURE__ */ jsx("span", { children: tab.label }),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    "aria-label": pinnedTabs.includes(tab.value) ? `Unpin ${tab.label}` : `Pin ${tab.label}`,
                    onClick: (e) => {
                      e.stopPropagation();
                      togglePin(tab.value);
                    },
                    className: `ml-0.5 text-[10px] leading-none ${pinnedTabs.includes(tab.value) ? "text-amber-500" : "text-gray-300 hover:text-amber-500"}`,
                    children: pinnedTabs.includes(tab.value) ? "*" : "-"
                  }
                ),
                tab.value === "timeclock" && openExceptionCount > 0 && /* @__PURE__ */ jsx(
                  "span",
                  {
                    className: "ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white",
                    title: `${openExceptionCount} open punch exception${openExceptionCount === 1 ? "" : "s"}`,
                    children: openExceptionCount
                  }
                ),
                tab.value === "sync_conflicts" && openConflictCount > 0 && /* @__PURE__ */ jsx(
                  "span",
                  {
                    className: "ml-1 rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white",
                    title: `${openConflictCount} unresolved sync conflict${openConflictCount === 1 ? "" : "s"}`,
                    children: openConflictCount
                  }
                )
              ]
            },
            tab.value
          );
        }) })
      ] }),
      mobileNavOpen && /* @__PURE__ */ jsxs("div", { className: "fixed inset-0 z-50 lg:hidden", role: "dialog", "aria-modal": "true", "aria-label": "Admin pages", children: [
        /* @__PURE__ */ jsx("div", { className: "absolute inset-0 bg-black/40", onClick: () => setMobileNavOpen(false) }),
        /* @__PURE__ */ jsxs("div", { className: "absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl", children: [
          /* @__PURE__ */ jsxs("div", { className: "mb-2 flex items-center justify-between", children: [
            /* @__PURE__ */ jsx("p", { className: "text-sm font-semibold text-gray-800", children: "All admin pages" }),
            /* @__PURE__ */ jsx(Button, { type: "button", variant: "ghost", size: "sm", onClick: () => setMobileNavOpen(false), className: "h-7 text-xs", children: "Close" })
          ] }),
          availableAdminGroups.map((group) => /* @__PURE__ */ jsxs("div", { className: "mb-2", children: [
            /* @__PURE__ */ jsx("p", { className: "mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400", children: group.label }),
            /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 gap-1", children: group.tabs.map((tab) => /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => {
                  setMobileNavOpen(false);
                  handleAdminTabChange(tab.value);
                },
                className: `rounded-lg border px-2 py-2 text-left text-sm ${tab.value === selectedAdminTab ? "border-red-300 bg-red-50 font-semibold" : "border-gray-200 bg-white"}`,
                children: tab.label
              },
              tab.value
            )) })
          ] }, group.id))
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: adminSidebar ? "min-w-0 flex-1 space-y-6" : "contents", children: [
        /* @__PURE__ */ jsx(AdminPanelContent, { value: "users", children: /* @__PURE__ */ jsx(UserManagement, {}) }),
        isAdmin && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(AdminPanelContent, { value: "timeclock", children: /* @__PURE__ */ jsxs(Tabs, { value: selectedAdminTab === "timeclock" ? selectedAdminSubtab : "entries", onValueChange: (nextSubtab) => handleAdminTabChange("timeclock", nextSubtab), className: "min-w-0 space-y-4", children: [
            /* @__PURE__ */ jsxs(TabsList, { ref: (node) => {
              nestedTabListsRef.current.timeclock = node;
            }, "aria-label": "Time Clock administration", className: "grid h-auto min-h-10 w-full min-w-0 max-w-full grid-cols-2 items-stretch gap-1 p-1 sm:grid-cols-4 lg:grid-cols-8", children: [
              /* @__PURE__ */ jsx(TabsTrigger, { value: "entries", className: "min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2", children: "Time Entries" }),
              /* @__PURE__ */ jsx(TabsTrigger, { value: "live_status", className: "min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2", children: "Live Status" }),
              /* @__PURE__ */ jsx(TabsTrigger, { value: "pay_periods", className: "min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2", children: "Pay Periods" }),
              /* @__PURE__ */ jsx(TabsTrigger, { value: "punch_locations", className: "min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2", children: "Punch Locations" }),
              /* @__PURE__ */ jsx(TabsTrigger, { value: "devices", className: "min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2", children: "Devices" }),
              /* @__PURE__ */ jsx(TabsTrigger, { value: "reports", className: "min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2", children: "Reports" }),
              /* @__PURE__ */ jsx(TabsTrigger, { value: "pto", className: "min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2", children: "PTO Policies" }),
              /* @__PURE__ */ jsx(TabsTrigger, { value: "overtime", className: "min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2", children: "Overtime Rules" })
            ] }),
            /* @__PURE__ */ jsx(AdminPanelContent, { value: "entries", children: /* @__PURE__ */ jsx(TimeClockAdmin, {}) }),
            /* @__PURE__ */ jsx(AdminPanelContent, { value: "live_status", children: /* @__PURE__ */ jsx(TimeClockAdmin, { view: "live_status" }) }),
            /* @__PURE__ */ jsx(AdminPanelContent, { value: "pay_periods", children: /* @__PURE__ */ jsx(TimeClockAdmin, { view: "pay_periods" }) }),
            /* @__PURE__ */ jsx(AdminPanelContent, { value: "punch_locations", children: /* @__PURE__ */ jsx(TimeClockAdmin, { view: "punch_locations" }) }),
            /* @__PURE__ */ jsx(AdminPanelContent, { value: "devices", children: /* @__PURE__ */ jsx(TimeClockAdmin, { view: "devices" }) }),
            /* @__PURE__ */ jsx(AdminPanelContent, { value: "reports", children: /* @__PURE__ */ jsx(TimeClockReportsDashboard, {}) }),
            /* @__PURE__ */ jsx(AdminPanelContent, { value: "pto", children: /* @__PURE__ */ jsx(PTOManagement, {}) }),
            /* @__PURE__ */ jsx(AdminPanelContent, { value: "overtime", children: /* @__PURE__ */ jsx(OvertimeRulesManager, {}) })
          ] }) }),
          /* @__PURE__ */ jsx(AdminPanelContent, { value: "backend", children: /* @__PURE__ */ jsxs(Tabs, { value: selectedAdminTab === "backend" ? selectedAdminSubtab : "backup", onValueChange: (nextSubtab) => handleAdminTabChange("backend", nextSubtab), className: "min-w-0 space-y-4", children: [
            /* @__PURE__ */ jsxs(TabsList, { ref: (node) => {
              nestedTabListsRef.current.backend = node;
            }, "aria-label": "Backend administration", className: "grid h-auto min-h-10 w-full min-w-0 max-w-full grid-cols-2 items-stretch gap-1 p-1 sm:grid-cols-3 lg:grid-cols-4", children: [
              /* @__PURE__ */ jsx(TabsTrigger, { value: "backup", className: "min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2", children: "Data Backup" }),
              /* @__PURE__ */ jsx(TabsTrigger, { value: "client_trash", className: "min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2", children: "Client Trash" }),
              /* @__PURE__ */ jsx(TabsTrigger, { value: "order_trash", className: "min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2", children: "Order Trash" }),
              /* @__PURE__ */ jsx(TabsTrigger, { value: "default_sort", className: "min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2", children: "Default Sort" }),
              /* @__PURE__ */ jsx(TabsTrigger, { value: "wip_import", className: "min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2", children: "WIP Import" }),
              /* @__PURE__ */ jsx(TabsTrigger, { value: "permitting", className: "min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2", children: "Permitting Repository" }),
              /* @__PURE__ */ jsx(TabsTrigger, { value: "monitoring", className: "min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2", children: "Jurisdiction Monitoring" }),
              /* @__PURE__ */ jsx(TabsTrigger, { value: "scheduled_jobs", className: "min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2", children: "Scheduled Jobs" })
            ] }),
            /* @__PURE__ */ jsxs(AdminPanelContent, { value: "backup", children: [
              /* @__PURE__ */ jsx(BackupManager, {}),
              /* @__PURE__ */ jsx(DataExportPanel, {}),
              /* @__PURE__ */ jsx(AssetMigrationPanel, {})
            ] }),
            /* @__PURE__ */ jsx(AdminPanelContent, { value: "client_trash", children: /* @__PURE__ */ jsx(ProjectTrash, {}) }),
            /* @__PURE__ */ jsx(AdminPanelContent, { value: "order_trash", children: /* @__PURE__ */ jsx(OrderTrash, {}) }),
            /* @__PURE__ */ jsx(AdminPanelContent, { value: "default_sort", children: /* @__PURE__ */ jsx(SalesPipelineDefaultSort, {}) }),
            /* @__PURE__ */ jsx(AdminPanelContent, { value: "wip_import", children: /* @__PURE__ */ jsx(WipImporter, {}) }),
            /* @__PURE__ */ jsx(AdminPanelContent, { value: "permitting", children: /* @__PURE__ */ jsx(PermittingRepositoryAdmin, {}) }),
            /* @__PURE__ */ jsx(AdminPanelContent, { value: "monitoring", children: /* @__PURE__ */ jsx(JurisdictionMonitoringSettings, {}) }),
            /* @__PURE__ */ jsx(AdminPanelContent, { value: "scheduled_jobs", children: /* @__PURE__ */ jsx(WorkflowSchedulesPanel, {}) })
          ] }) }),
          /* @__PURE__ */ jsx(AdminPanelContent, { value: "fleet", children: /* @__PURE__ */ jsx(FleetSettings, { embedded: true }) }),
          /* @__PURE__ */ jsx(AdminPanelContent, { value: "corebridge", children: /* @__PURE__ */ jsx(CorebridgeApiSettings, { sessionToken }) }),
          /* @__PURE__ */ jsx(AdminPanelContent, { value: "opportunity_bridge", children: /* @__PURE__ */ jsx(OpportunityBridgeReview, {}) }),
          /* @__PURE__ */ jsx(AdminPanelContent, { value: "permitting_completeness", children: /* @__PURE__ */ jsx(PermittingCompletenessDashboard, {}) }),
          /* @__PURE__ */ jsx(AdminPanelContent, { value: "permitting_rules", children: /* @__PURE__ */ jsx(PermittingRulesReview, { sessionToken }) }),
          /* @__PURE__ */ jsxs(AdminPanelContent, { value: "permitting_tests", children: [
            /* @__PURE__ */ jsx("div", { className: "mb-3 flex justify-end", children: /* @__PURE__ */ jsxs("a", { href: "/PermittingDocs", target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100", children: [
              /* @__PURE__ */ jsx(BookOpen, { className: "h-4 w-4" }),
              "Staff Guide (opens new tab)"
            ] }) }),
            /* @__PURE__ */ jsx(PermittingTestSuite, {})
          ] }),
          /* @__PURE__ */ jsx(AdminPanelContent, { value: "integrations", children: /* @__PURE__ */ jsx(IntegrationsPanel, { sessionToken }) }),
          /* @__PURE__ */ jsx(AdminPanelContent, { value: "smartsheet", children: /* @__PURE__ */ jsx(SmartsheetSyncSettings, { sessionToken }) }),
          /* @__PURE__ */ jsx(AdminPanelContent, { value: "sync_conflicts", children: /* @__PURE__ */ jsx(SyncConflictReview, { sessionToken }) })
        ] }),
        /* @__PURE__ */ jsx(AdminPanelContent, { value: "task_assignments", children: /* @__PURE__ */ jsx(TaskAssignmentRules, {}) }),
        /* @__PURE__ */ jsx(AdminPanelContent, { value: "calendar", children: /* @__PURE__ */ jsx(AdminCalendarSettings, {}) }),
        /* @__PURE__ */ jsx(AdminPanelContent, { value: "activity", children: /* @__PURE__ */ jsx(ActivityFeed, {}) }),
        isAdmin && /* @__PURE__ */ jsx(AdminPanelContent, { value: "resources", children: /* @__PURE__ */ jsx(ResourceAllocationView, {}) }),
        /* @__PURE__ */ jsxs(AdminPanelContent, { value: "automations", children: [
          ordinaryAutomationRecovery,
          !isLoading && !automationLoadError && automationRecoveryListVerified && /* @__PURE__ */ jsx(
            "div",
            {
              role: "status",
              "aria-label": "Automation recovery list verified",
              className: "mb-4 rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-950",
              children: "The Automation list was refreshed from the complete, read-only acknowledgment snapshot. This confirms the displayed list at the time of the read, not which request saved the rule."
            }
          ),
          !isDialogOpen && uncertainAutomationReview,
          automationDraftParked && !isDialogOpen && /* @__PURE__ */ jsxs("div", { role: "status", "aria-label": "Unsaved Automation draft", className: "mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950", children: [
            /* @__PURE__ */ jsx("p", { className: "font-semibold", children: "Unsaved Automation draft is still here" }),
            /* @__PURE__ */ jsx("p", { className: "mt-1", children: "Resume editing or discard this draft. Nothing was saved or retried automatically." }),
            /* @__PURE__ */ jsxs("div", { className: "mt-2 flex flex-wrap gap-2", children: [
              /* @__PURE__ */ jsx(
                Button,
                {
                  type: "button",
                  size: "sm",
                  variant: "outline",
                  onClick: () => {
                    setIsDialogOpen(true);
                    setAutomationDraftParked(false);
                  },
                  disabled: automationSaveInFlight.current,
                  className: "min-h-10 border-amber-500 bg-white",
                  children: "Resume Automation draft"
                }
              ),
              /* @__PURE__ */ jsx(
                Button,
                {
                  type: "button",
                  size: "sm",
                  variant: "outline",
                  onClick: discardAutomationDraft,
                  disabled: automationSaveInFlight.current || !!automationUncertain,
                  className: "min-h-10 border-amber-500 bg-white",
                  children: "Discard Automation draft"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "mb-8", children: [
            /* @__PURE__ */ jsx(GmailConnector, { sessionToken }),
            /* @__PURE__ */ jsxs("div", { className: "mt-6", children: [
              /* @__PURE__ */ jsx(EmailGroupsManager, {}),
              /* @__PURE__ */ jsxs("div", { className: "mt-4 flex flex-wrap items-center gap-2", children: [
                /* @__PURE__ */ jsx(
                  Input,
                  {
                    value: testEmailAddr,
                    onChange: (e) => setTestEmailAddr(e.target.value),
                    placeholder: "Send test notification to email...",
                    type: "email",
                    className: "h-8 w-60 text-xs",
                    "aria-label": "Test email address"
                  }
                ),
                /* @__PURE__ */ jsx(
                  Button,
                  {
                    type: "button",
                    size: "sm",
                    variant: "outline",
                    disabled: testEmailBusy || !testEmailAddr.trim(),
                    onClick: sendTestEmail,
                    className: "h-8 text-xs",
                    children: testEmailBusy ? "Sending..." : "Send test email"
                  }
                ),
                testEmailMsg && /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-600", children: testEmailMsg })
              ] })
            ] })
          ] }),
          emailGroupsLoadError && /* @__PURE__ */ jsxs("div", { role: "alert", "aria-label": "Automation email groups unavailable", className: "mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950", children: [
            /* @__PURE__ */ jsx("div", { className: "font-semibold", children: "Automation email group choices could not be loaded" }),
            /* @__PURE__ */ jsx("p", { className: "mt-1", children: "Rule editing is paused until recipient groups can be verified." }),
            /* @__PURE__ */ jsx(
              Button,
              {
                type: "button",
                size: "sm",
                variant: "outline",
                disabled: emailGroupsLoading,
                className: "mt-2 min-h-10 border-amber-500 bg-white text-amber-950",
                onClick: () => {
                  void loadEmailGroups();
                },
                children: "Retry group choices"
              }
            )
          ] }),
          automationSaveError && /* @__PURE__ */ jsxs("div", { className: "mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("div", { className: "font-medium", children: "Automation update blocked" }),
              /* @__PURE__ */ jsx("div", { className: "mt-1 text-xs", children: automationSaveError })
            ] }),
            /* @__PURE__ */ jsx(Button, { type: "button", size: "sm", variant: "outline", className: "shrink-0 border-red-300 bg-white text-red-800", onClick: async () => {
              const refreshed = await loadAutomations();
              if (refreshed) setAutomationSaveError("");
            }, children: "Reload rules" })
          ] }),
          automationsPaused && /* @__PURE__ */ jsx("div", { className: "mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800", role: "alert", children: "All automations are PAUSED  -  no rules will run until resumed." }),
          pauseError && /* @__PURE__ */ jsx("div", { className: "mb-2 text-xs text-red-600", children: pauseError }),
          uncoveredTriggerTypes.length > 0 && /* @__PURE__ */ jsxs("div", { className: "mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800", children: [
            /* @__PURE__ */ jsx("span", { className: "font-semibold", children: "No active rule uses:" }),
            " ",
            uncoveredTriggerTypes.map((t) => t.label).join(", ")
          ] }),
          (() => {
            const cutoff = Date.now() - 90 * 864e5;
            const stale = automations.filter(
              (r) => r.enabled === false && !r.last_run_at && r.created_date && new Date(r.created_date) < cutoff
            );
            if (!stale.length) return null;
            return /* @__PURE__ */ jsxs("div", { className: "mb-3 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs", children: [
              /* @__PURE__ */ jsx("span", { className: "font-semibold text-gray-800", children: "Cleanup suggestions:" }),
              " ",
              /* @__PURE__ */ jsxs("span", { className: "text-gray-600", children: [
                stale.length,
                " disabled rule",
                stale.length === 1 ? "" : "s",
                " created 90+ days ago that never ran:"
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "mt-1.5 flex flex-wrap gap-1.5", children: [
                stale.slice(0, 6).map((r) => /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-0.5", children: [
                  /* @__PURE__ */ jsx("span", { className: "text-gray-700", children: r.name }),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      type: "button",
                      className: "text-red-600 font-semibold",
                      "aria-label": `Delete stale rule ${r.name}`,
                      onClick: () => setDeleteConfirm(r),
                      children: "x"
                    }
                  )
                ] }, r.id)),
                stale.length > 6 && /* @__PURE__ */ jsxs("span", { className: "text-gray-500", children: [
                  "+",
                  stale.length - 6,
                  " more"
                ] })
              ] })
            ] });
          })(),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2 mb-3", children: [
            /* @__PURE__ */ jsx(
              Input,
              {
                value: ruleSearch,
                onChange: (e) => setRuleSearch(e.target.value),
                placeholder: "Search rules...",
                className: "h-8 w-44 text-xs",
                "aria-label": "Search automation rules"
              }
            ),
            /* @__PURE__ */ jsx("span", { className: "text-sm text-gray-500", children: "Show:" }),
            /* @__PURE__ */ jsx("div", { className: "flex gap-1", children: [["all", "All"], ["enabled", "Enabled"], ["disabled", "Disabled"]].map(([value, label]) => /* @__PURE__ */ jsx(
              Button,
              {
                type: "button",
                size: "sm",
                variant: ruleFilter === value ? "default" : "outline",
                onClick: () => setRuleFilter(value),
                className: "h-7 text-xs",
                children: label
              },
              value
            )) }),
            /* @__PURE__ */ jsxs("span", { className: "text-xs text-gray-400 ml-auto", children: [
              visibleAutomations.length,
              " of ",
              automations.length,
              " rules"
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center mb-4", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx("span", { className: "text-sm text-gray-500", children: "Sort by:" }),
              /* @__PURE__ */ jsxs("div", { className: "flex gap-1", children: [
                /* @__PURE__ */ jsxs(
                  Button,
                  {
                    variant: sortBy === "name" ? "default" : "outline",
                    size: "sm",
                    onClick: () => handleSort("name"),
                    className: `h-7 text-xs ${sortBy === "name" ? "bg-purple-100 text-purple-700 border-purple-200" : ""}`,
                    children: [
                      "Name ",
                      sortBy === "name" && /* @__PURE__ */ jsx(SortAsc, { className: `w-3 h-3 ml-1 ${sortDirection === "desc" ? "rotate-180" : ""}` })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs(
                  Button,
                  {
                    variant: sortBy === "trigger" ? "default" : "outline",
                    size: "sm",
                    onClick: () => handleSort("trigger"),
                    className: `h-7 text-xs ${sortBy === "trigger" ? "bg-orange-100 text-orange-700 border-orange-200" : ""}`,
                    children: [
                      "Trigger Type ",
                      sortBy === "trigger" && /* @__PURE__ */ jsx(SortAsc, { className: `w-3 h-3 ml-1 ${sortDirection === "desc" ? "rotate-180" : ""}` })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs(
                  Button,
                  {
                    variant: sortBy === "action" ? "default" : "outline",
                    size: "sm",
                    onClick: () => handleSort("action"),
                    className: `h-7 text-xs ${sortBy === "action" ? "bg-blue-100 text-blue-700 border-blue-200" : ""}`,
                    children: [
                      "Action Type ",
                      sortBy === "action" && /* @__PURE__ */ jsx(SortAsc, { className: `w-3 h-3 ml-1 ${sortDirection === "desc" ? "rotate-180" : ""}` })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs(
                  Button,
                  {
                    variant: sortBy === "enabled" ? "default" : "outline",
                    size: "sm",
                    onClick: () => handleSort("enabled"),
                    className: `h-7 text-xs ${sortBy === "enabled" ? "bg-green-100 text-green-700 border-green-200" : ""}`,
                    children: [
                      "Status ",
                      sortBy === "enabled" && /* @__PURE__ */ jsx(SortAsc, { className: `w-3 h-3 ml-1 ${sortDirection === "desc" ? "rotate-180" : ""}` })
                    ]
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-end gap-2", children: [
              /* @__PURE__ */ jsx(
                Button,
                {
                  type: "button",
                  size: "sm",
                  variant: "outline",
                  onClick: () => {
                    void loadAutomations();
                  },
                  disabled: isLoading,
                  "aria-label": "Refresh Automation rules (read-only)",
                  children: "Refresh rules"
                }
              ),
              /* @__PURE__ */ jsx(
                Button,
                {
                  type: "button",
                  size: "sm",
                  variant: automationsPaused ? "default" : "outline",
                  onClick: toggleAutomationPause,
                  disabled: pauseBusy || automationSaving,
                  className: automationsPaused ? "bg-red-600 text-white" : "",
                  "aria-label": automationsPaused ? "Resume all automations" : "Pause all automations",
                  children: pauseBusy ? "Working..." : automationsPaused ? "Resume all" : "Pause all"
                }
              ),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white/70 px-2 py-1", title: "During quiet hours, automation emails are skipped", children: [
                /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-1 text-xs text-gray-600", children: [
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      type: "checkbox",
                      checked: quietEnabled,
                      disabled: quietBusy,
                      onChange: (e) => saveQuietHours({ enabled: e.target.checked })
                    }
                  ),
                  "Quiet hours"
                ] }),
                /* @__PURE__ */ jsx(
                  CcsTimeField,
                  {
                    value: quietStart,
                    disabled: quietBusy || !quietEnabled,
                    onChange: (e) => saveQuietHours({ start: e.target.value }),
                    className: "h-6 rounded border border-input bg-transparent px-1 text-xs",
                    "aria-label": "Quiet hours start"
                  }
                ),
                /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-400", children: "to" }),
                /* @__PURE__ */ jsx(
                  CcsTimeField,
                  {
                    value: quietEnd,
                    disabled: quietBusy || !quietEnabled,
                    onChange: (e) => saveQuietHours({ end: e.target.value }),
                    className: "h-6 rounded border border-input bg-transparent px-1 text-xs",
                    "aria-label": "Quiet hours end"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs(
                Button,
                {
                  onClick: openNewRule,
                  disabled: isLoading || automationLoadError || emailGroupsLoading || emailGroupsLoadError,
                  className: "clay-button border-none text-gray-800",
                  style: { background: "linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)" },
                  children: [
                    /* @__PURE__ */ jsx(Plus, { className: "w-5 h-5 mr-2" }),
                    " New Automation"
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("p", { className: "mt-1 text-right text-[10px] text-gray-400", children: [
              "Global settings keys: ",
              /* @__PURE__ */ jsx("code", { children: "automations_paused" }),
              " and ",
              /* @__PURE__ */ jsx("code", { children: "notificationQuietHours" }),
              " (controls above);",
              " ",
              /* @__PURE__ */ jsx("code", { children: "productStatusDrivesStage" }),
              " = ",
              /* @__PURE__ */ jsx("code", { children: "off | suggest | auto" }),
              " (reserved: product-status to work-order stage coupling). Per-notification-type toggles are each rule's own Enabled flag - the trigger registry has no per-type switch."
            ] })
          ] }),
          !isLoading && !automationLoadError && /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6", children: [
            /* @__PURE__ */ jsx("div", { className: "clay-card p-4", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsx(Zap, { className: "w-5 h-5 text-purple-600" }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("p", { className: "text-2xl font-bold text-gray-800", children: automations.length }),
                /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-500", children: "Total Automations" })
              ] })
            ] }) }),
            /* @__PURE__ */ jsx("div", { className: "clay-card p-4", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsx(CheckCircle2, { className: "w-5 h-5 text-green-600" }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("p", { className: "text-2xl font-bold text-gray-800", children: automations.filter((a) => a.enabled).length }),
                /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-500", children: "Active" })
              ] })
            ] }) }),
            /* @__PURE__ */ jsx("div", { className: "clay-card p-4", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsx(AlertTriangle, { className: "w-5 h-5 text-orange-600" }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("p", { className: "text-2xl font-bold text-gray-800", children: automations.filter((a) => !a.enabled).length }),
                /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-500", children: "Disabled" })
              ] })
            ] }) })
          ] }),
          isLoading ? /* @__PURE__ */ jsx("div", { className: "clay-card p-12 text-center", children: /* @__PURE__ */ jsx("p", { className: "text-gray-500", children: "Loading..." }) }) : automationLoadError ? /* @__PURE__ */ jsxs("div", { role: "alert", "aria-label": "Automation rules unavailable", className: "clay-card rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950", children: [
            /* @__PURE__ */ jsx("h3", { className: "font-semibold", children: "Automation rules could not be loaded" }),
            /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm", children: "The current rule list could not be verified. An earlier verified snapshot, if any, is not being shown as current. Editing is paused until a complete read succeeds. No Automation write was retried." }),
            /* @__PURE__ */ jsx(
              Button,
              {
                type: "button",
                size: "sm",
                variant: "outline",
                disabled: isLoading,
                onClick: () => {
                  void loadAutomations();
                },
                className: "mt-3 min-h-10 border-amber-500 bg-white text-amber-950",
                children: "Retry loading rules"
              }
            )
          ] }) : automations.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "clay-card p-12 text-center", children: [
            /* @__PURE__ */ jsx(Zap, { className: "w-12 h-12 text-gray-400 mx-auto mb-4" }),
            /* @__PURE__ */ jsx("h3", { className: "text-lg font-semibold text-gray-700 mb-2", children: "No Automations" }),
            /* @__PURE__ */ jsx("p", { className: "text-gray-500 mb-4", children: "Create your first automation to streamline your workflow" }),
            /* @__PURE__ */ jsxs(Button, { onClick: openNewRule, disabled: emailGroupsLoading || emailGroupsLoadError, className: "clay-button", children: [
              /* @__PURE__ */ jsx(Plus, { className: "w-4 h-4 mr-2" }),
              " Create First Automation"
            ] })
          ] }) : /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
            visibleAutomations.length === 0 && /* @__PURE__ */ jsx("div", { className: "text-center py-6 text-sm text-gray-500", children: "No rules match the current filter." }),
            visibleAutomations.map((rule) => /* @__PURE__ */ jsx("div", { className: `clay-card p-4 ${!rule.enabled ? "opacity-60" : ""}`, children: /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
                  /* @__PURE__ */ jsx("h4", { className: "font-medium text-gray-800", children: rule.name }),
                  /* @__PURE__ */ jsxs(Badge, { className: "text-xs", style: { background: rule.enabled ? "linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)" : "#E5E7EB" }, children: [
                    rule.triggers?.length || 1,
                    " trigger",
                    (rule.triggers?.length || 1) > 1 ? "s" : ""
                  ] }),
                  /* @__PURE__ */ jsxs(Badge, { className: "text-xs", style: { background: "linear-gradient(135deg, #E0D4F7 0%, #FFD6E8 100%)" }, children: [
                    rule.actions?.length || 0,
                    " action",
                    (rule.actions?.length || 0) !== 1 ? "s" : ""
                  ] }),
                  rule.approval_status === "pending" && /* @__PURE__ */ jsx(Badge, { className: "text-xs bg-amber-500 text-white border border-amber-600", title: "Proposed rule \u2014 never runs until approved", children: "Pending approval" }),
                  !ruleIsRunnable(rule) && /* @__PURE__ */ jsx(Badge, { className: "text-xs bg-amber-100 text-amber-800 border border-amber-300", children: "Won't run \u2014 not wired yet" }),
                  (() => {
                    const recent = Array.isArray(rule.recent_runs) ? rule.recent_runs.slice(-3) : [];
                    return recent.length === 3 && recent.every((r) => r?.status === "error") ? /* @__PURE__ */ jsx(Badge, { className: "text-xs bg-red-600 text-white border border-red-700", children: "Failing  -  last 3 runs errored" }) : null;
                  })(),
                  (() => {
                    const recent = Array.isArray(rule.recent_runs) ? rule.recent_runs : [];
                    const dayAgo = Date.now() - 864e5;
                    const firedToday = recent.filter((r) => Date.parse(r?.at || "") > dayAgo).length;
                    return firedToday >= 10 ? /* @__PURE__ */ jsxs(Badge, { className: "text-xs bg-purple-100 text-purple-800 border border-purple-300", children: [
                      "High volume  -  ",
                      firedToday,
                      " runs in 24h"
                    ] }) : null;
                  })(),
                  ruleOrphanedTargets(rule).length > 0 && /* @__PURE__ */ jsxs(Badge, { className: "text-xs bg-red-100 text-red-800 border border-red-300", children: [
                    "Missing: ",
                    ruleOrphanedTargets(rule).join(", ")
                  ] })
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2 text-xs text-gray-600", children: [
                  rule.triggers?.slice(0, 2).map((t, i) => /* @__PURE__ */ jsx("span", { className: "bg-orange-50 px-2 py-1 rounded", children: TRIGGER_TYPES.find((tt) => tt.value === t.trigger_type)?.label || t.trigger_type }, i)),
                  (rule.triggers?.length || 0) > 2 && /* @__PURE__ */ jsxs("span", { className: "text-gray-400", children: [
                    "+",
                    rule.triggers.length - 2,
                    " more"
                  ] }),
                  /* @__PURE__ */ jsx(ArrowRight, { className: "w-3 h-3 text-gray-400" }),
                  rule.actions?.slice(0, 2).map((a, i) => /* @__PURE__ */ jsx("span", { className: "bg-blue-50 px-2 py-1 rounded", children: ACTION_TYPES.find((at) => at.value === a.action_type)?.label || a.action_type }, i)),
                  (rule.actions?.length || 0) > 2 && /* @__PURE__ */ jsxs("span", { className: "text-gray-400", children: [
                    "+",
                    rule.actions.length - 2,
                    " more"
                  ] })
                ] }),
                /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs text-gray-500 italic", children: describeAutomationRule(rule) }),
                /* @__PURE__ */ jsx("p", { className: "mt-1 text-[11px] text-gray-400", children: rule.last_run_at ? /* @__PURE__ */ jsxs(Fragment, { children: [
                  "Last run ",
                  new Date(rule.last_run_at).toLocaleString(),
                  "  -  ",
                  /* @__PURE__ */ jsx("span", { className: rule.last_run_status === "error" ? "text-red-600 font-medium" : rule.last_run_status === "partial" ? "text-amber-600 font-medium" : "text-green-600 font-medium", children: rule.last_run_status || "success" }),
                  rule.last_run_detail ? ` (${rule.last_run_detail})` : "",
                  rule.run_count ? `  -  ${rule.group && /* @__PURE__ */ jsx(Badge, { className: "text-xs bg-indigo-100 text-indigo-700 border border-indigo-300 mr-1", children: rule.group })}
                          {rule.run_count} runs` : ""
                ] }) : "Never run" }),
                /* @__PURE__ */ jsxs("p", { className: "text-[11px] text-gray-400", children: [
                  "Added by ",
                  rule.created_by || "unknown",
                  rule.created_date ? `  -  ${new Date(rule.created_date).toLocaleDateString()}` : ""
                ] }),
                /* @__PURE__ */ jsxs("label", { className: "mt-0.5 flex items-center gap-1 text-[11px] text-gray-400", children: [
                  "Owner:",
                  /* @__PURE__ */ jsxs(
                    "select",
                    {
                      "aria-label": `Transfer ownership of ${rule.name}`,
                      value: rule.owner || "",
                      onChange: (e) => transferRuleOwner(rule, e.target.value),
                      className: "rounded border border-gray-200 bg-white px-1 py-0 text-[11px] text-gray-700",
                      children: [
                        /* @__PURE__ */ jsx("option", { value: "", children: "Unassigned" }),
                        TEAM_MEMBERS.map((m) => /* @__PURE__ */ jsx("option", { value: m, children: m }, m))
                      ]
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                rule.approval_status === "pending" && /* @__PURE__ */ jsx(
                  Button,
                  {
                    variant: "outline",
                    size: "sm",
                    disabled: !!automationOperation || automationSaving,
                    onClick: () => approveRule(rule),
                    className: "h-8 text-xs text-amber-700 border-amber-300",
                    children: "Approve"
                  }
                ),
                /* @__PURE__ */ jsx(Switch, { "aria-label": `Toggle ${rule.name}`, disabled: !!automationOperation || automationSaving || !!automationUncertain, checked: rule.enabled, onCheckedChange: () => toggleEnabled(rule) }),
                /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", "aria-label": `Duplicate ${rule.name}`, disabled: emailGroupsLoading || emailGroupsLoadError, onClick: () => duplicateRule(rule), className: "h-8 w-8", children: /* @__PURE__ */ jsx(Copy, { className: "w-4 h-4 text-gray-500" }) }),
                (rule.history?.length || 0) > 0 && /* @__PURE__ */ jsx(
                  Button,
                  {
                    variant: "ghost",
                    size: "icon",
                    "aria-label": `Restore previous version of ${rule.name}`,
                    title: `Restore previous version (${rule.history.length} saved)`,
                    disabled: emailGroupsLoading || emailGroupsLoadError,
                    onClick: () => restoreRuleVersion(rule),
                    className: "h-8 w-8",
                    children: /* @__PURE__ */ jsx(RotateCcw, { className: "w-4 h-4 text-purple-600" })
                  }
                ),
                /* @__PURE__ */ jsx(
                  Button,
                  {
                    variant: "ghost",
                    size: "icon",
                    "aria-label": `Copy JSON for ${rule.name}`,
                    title: "Copy rule as JSON",
                    disabled: emailGroupsLoading || emailGroupsLoadError,
                    onClick: () => copyRuleJson(rule),
                    className: "h-8 w-8",
                    children: /* @__PURE__ */ jsx(Braces, { className: "w-4 h-4 text-indigo-600" })
                  }
                ),
                /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", "aria-label": `Edit ${rule.name}`, disabled: emailGroupsLoading || emailGroupsLoadError, onClick: () => openEditRule(rule), className: "h-8 w-8", children: /* @__PURE__ */ jsx(Edit, { className: "w-4 h-4 text-blue-600" }) }),
                /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", "aria-label": `Delete ${rule.name}`, disabled: !!automationOperation || automationSaving || !!automationUncertain, onClick: () => setDeleteConfirm(rule), className: "h-8 w-8", children: /* @__PURE__ */ jsx(Trash2, { className: "w-4 h-4 text-red-600" }) })
              ] })
            ] }) }, rule.id))
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Dialog, { open: isDialogOpen, onOpenChange: closeAutomationEditor, children: /* @__PURE__ */ jsxs(DialogContent, { className: "clay-card border-none max-w-3xl max-h-[90vh] overflow-y-auto", children: [
      /* @__PURE__ */ jsx(DialogHeader, { children: /* @__PURE__ */ jsx(DialogTitle, { className: "text-xl font-bold", children: editingRule ? "Edit Automation" : "Create Automation" }) }),
      ordinaryAutomationRecovery,
      uncertainAutomationReview,
      /* @__PURE__ */ jsxs("fieldset", { disabled: automationSaving, className: "min-w-0 space-y-6 mt-4", children: [
        draftRestored && !editingRule && /* @__PURE__ */ jsxs("div", { className: "mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs text-blue-900", children: [
          /* @__PURE__ */ jsx("span", { children: "Draft restored from your last unsaved rule." }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "font-semibold underline", onClick: () => {
            try {
              localStorage.removeItem(AUTOMATION_DRAFT_KEY);
            } catch {
            }
            setFormData({ name: "", enabled: true, priority: 0, group: "" });
            setTriggers([{ trigger_type: "", trigger_condition: {}, logic: "or" }]);
            setActions([{ action_type: "", action_config: {} }]);
            setDraftRestored(false);
          }, children: "Discard draft" })
        ] }),
        !editingRule && /* @__PURE__ */ jsxs("div", { className: "mb-2", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: "text-xs text-indigo-700 underline",
              onClick: () => setImportJsonText(importJsonText === null ? "" : null),
              children: "Import from JSON"
            }
          ),
          importJsonText !== null && /* @__PURE__ */ jsxs("div", { className: "mt-1 space-y-1", children: [
            /* @__PURE__ */ jsx(
              Textarea,
              {
                value: importJsonText,
                onChange: (e) => setImportJsonText(e.target.value),
                placeholder: 'Paste rule JSON: {"name":"...", "triggers":[...], "actions":[...]}',
                className: "min-h-20 text-xs font-mono"
              }
            ),
            importJsonError && /* @__PURE__ */ jsx("p", { className: "text-xs text-red-600", children: importJsonError }),
            /* @__PURE__ */ jsx(Button, { type: "button", size: "sm", variant: "outline", onClick: applyRuleJson, className: "h-7 text-xs", children: "Apply JSON" })
          ] })
        ] }),
        !editingRule && !formData.name && !triggers[0]?.trigger_type && /* @__PURE__ */ jsxs("section", { "aria-label": "Automation starters", className: "rounded-xl border border-blue-200 bg-blue-50 p-4", children: [
          /* @__PURE__ */ jsx("h3", { className: "font-semibold text-blue-950", children: "Start with an example" }),
          /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm text-blue-800", children: "Pick one, review it, then save. Examples start disabled so you can check them before turning them on." }),
          /* @__PURE__ */ jsx("div", { className: "mt-3 grid gap-2 sm:grid-cols-2", children: AUTOMATION_PRESETS.map((preset) => /* @__PURE__ */ jsx(
            Button,
            {
              variant: "outline",
              className: "h-auto justify-start whitespace-normal text-left",
              onClick: () => applyAutomationPreset(preset),
              children: preset.name
            },
            preset.trigger
          )) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx(Label, { children: "Automation Name *" }),
            /* @__PURE__ */ jsx(
              Input,
              {
                value: formData.name,
                onChange: (e) => setFormData({ ...formData, name: e.target.value }),
                placeholder: "e.g., Auto-assign fabrication jobs",
                className: "mt-1"
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx(Label, { children: "Priority (lower = first)" }),
            /* @__PURE__ */ jsx(Input, { type: "number", value: formData.priority, onChange: (e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 }), className: "mt-1" })
          ] })
        ] }),
        "                ",
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx(Label, { children: "Group (optional)" }),
          /* @__PURE__ */ jsx(
            Input,
            {
              value: formData.group || "",
              onChange: (e) => setFormData({ ...formData, group: e.target.value }),
              placeholder: "e.g., Payroll, Sales",
              className: "mt-1"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "clay-card p-4 bg-gradient-to-r from-orange-50 to-yellow-50", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsx("div", { className: "bg-orange-100 text-orange-700 font-bold px-3 py-1 rounded-lg text-sm", children: "WHEN" }),
              /* @__PURE__ */ jsx("span", { className: "text-gray-600 text-sm", children: "this happens..." })
            ] }),
            /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "sm", onClick: runConditionTest, disabled: condTestBusy, className: "h-7 text-xs", children: condTestBusy ? "Testing\u2026" : "Test conditions" }),
            /* @__PURE__ */ jsxs(Button, { variant: "ghost", size: "sm", onClick: addTrigger, className: "h-7 text-xs", children: [
              /* @__PURE__ */ jsx(Plus, { className: "w-3 h-3 mr-1" }),
              " Add Trigger"
            ] })
          ] }),
          condTest && /* @__PURE__ */ jsx("p", { className: "mt-2 rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-800", role: "status", children: condTest }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
            triggers.map((trigger, index) => /* @__PURE__ */ jsxs("div", { className: index > 0 ? "pt-4 border-t border-orange-200" : "", children: [
              index > 0 && /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-2", children: [
                /* @__PURE__ */ jsxs(Select, { value: trigger.logic || "or", onValueChange: (val) => updateTrigger(index, "logic", val), children: [
                  /* @__PURE__ */ jsx(SelectTrigger, { className: "w-20 h-6 text-xs text-orange-600 font-medium border-orange-200", children: /* @__PURE__ */ jsx(SelectValue, {}) }),
                  /* @__PURE__ */ jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsx(SelectItem, { value: "or", children: "OR" }),
                    /* @__PURE__ */ jsx(SelectItem, { value: "and", children: "AND" })
                  ] })
                ] }),
                /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", onClick: () => removeTrigger(index), className: "h-6 w-6", children: /* @__PURE__ */ jsx(Trash2, { className: "w-3 h-3 text-red-600" }) })
              ] }),
              /* @__PURE__ */ jsxs(Select, { value: trigger.trigger_type, onValueChange: (val) => updateTrigger(index, "trigger_type", val), children: [
                /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Select trigger" }) }),
                /* @__PURE__ */ jsxs(SelectContent, { children: [
                  trigger.trigger_type && !getTriggerSupportedActions(trigger.trigger_type) && /* @__PURE__ */ jsxs(SelectItem, { value: trigger.trigger_type, disabled: true, children: [
                    TRIGGER_TYPES.find((t) => t.value === trigger.trigger_type)?.label || trigger.trigger_type,
                    " (not working yet)"
                  ] }),
                  Object.entries(groupedTriggers).map(([category, list]) => /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsx("div", { className: "px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-100", children: category }),
                    list.map((t) => /* @__PURE__ */ jsxs(SelectItem, { value: t.value, children: [
                      t.label,
                      getTriggerSupportedActions(t.value) ? "" : " (not working yet)"
                    ] }, t.value))
                  ] }, category))
                ] })
              ] }),
              TRIGGER_HELP[trigger.trigger_type] && /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-blue-700", children: TRIGGER_HELP[trigger.trigger_type] }),
              getTriggerNeedsStage(trigger.trigger_type) && /* @__PURE__ */ jsxs(Select, { value: trigger.trigger_condition.stage || "", onValueChange: (val) => updateTrigger(index, "stage", val), children: [
                /* @__PURE__ */ jsx(SelectTrigger, { className: "mt-2", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Select stage" }) }),
                /* @__PURE__ */ jsx(SelectContent, { children: STAGES.map((s) => /* @__PURE__ */ jsx(SelectItem, { value: s.value, children: s.label }, s.value)) })
              ] }),
              getTriggerNeedsFromTo(trigger.trigger_type) && /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-2 mt-2", children: [
                /* @__PURE__ */ jsxs(Select, { value: trigger.trigger_condition.from_stage || "", onValueChange: (val) => updateTrigger(index, "from_stage", val), children: [
                  /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "From stage" }) }),
                  /* @__PURE__ */ jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsx(SelectItem, { value: null, children: "Any" }),
                    STAGES.map((s) => /* @__PURE__ */ jsx(SelectItem, { value: s.value, children: s.label }, s.value))
                  ] })
                ] }),
                /* @__PURE__ */ jsxs(Select, { value: trigger.trigger_condition.to_stage || "", onValueChange: (val) => updateTrigger(index, "to_stage", val), children: [
                  /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "To stage" }) }),
                  /* @__PURE__ */ jsxs(SelectContent, { children: [
                    /* @__PURE__ */ jsx(SelectItem, { value: null, children: "Any" }),
                    STAGES.map((s) => /* @__PURE__ */ jsx(SelectItem, { value: s.value, children: s.label }, s.value))
                  ] })
                ] })
              ] }),
              (WORKFLOW_ENGINE_TRIGGER_SET.has(trigger.trigger_type) || DEADLINE_TRIGGER_SET.has(trigger.trigger_type)) && /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-4 mt-2 pt-2 border-t border-orange-100", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
                  /* @__PURE__ */ jsx(Switch, { "aria-label": "ASAP only", checked: trigger.trigger_condition.is_asap === true, onCheckedChange: (v) => updateTrigger(index, "is_asap", v || void 0) }),
                  /* @__PURE__ */ jsx(Label, { className: "text-xs", children: "ASAP Only" })
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsx(Label, { className: "text-xs text-gray-500", children: "Apply to:" }),
                  /* @__PURE__ */ jsxs(
                    Select,
                    {
                      value: trigger.trigger_condition.is_rider === true ? "riders" : trigger.trigger_condition.is_rider === false ? "workorders" : "all",
                      onValueChange: (val) => {
                        if (val === "all") updateTrigger(index, "is_rider", void 0);
                        else if (val === "riders") updateTrigger(index, "is_rider", true);
                        else updateTrigger(index, "is_rider", false);
                      },
                      children: [
                        /* @__PURE__ */ jsx(SelectTrigger, { className: "h-6 w-36 text-xs", children: /* @__PURE__ */ jsx(SelectValue, {}) }),
                        /* @__PURE__ */ jsxs(SelectContent, { children: [
                          /* @__PURE__ */ jsx(SelectItem, { value: "all", children: "All" }),
                          /* @__PURE__ */ jsx(SelectItem, { value: "workorders", children: "Work Orders Only" }),
                          /* @__PURE__ */ jsx(SelectItem, { value: "riders", children: "Riders Only" })
                        ] })
                      ]
                    }
                  )
                ] })
              ] }),
              getTriggerSupportedActions(trigger.trigger_type) === RECORD_SUPPORTED_ACTIONS && ["is_asap", "is_rider", "stage", "assigned_to", "from_stage", "to_stage"].some((key) => trigger.trigger_condition[key] != null) && /* @__PURE__ */ jsxs("div", { role: "status", className: "mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900", children: [
                "This saved event has Work Order filters that do not describe this record.",
                /* @__PURE__ */ jsx(Button, { variant: "outline", size: "sm", className: "mt-2", onClick: () => setTriggers((current) => current.map((item, i) => i !== index ? item : { ...item, trigger_condition: Object.fromEntries(Object.entries(item.trigger_condition).filter(([key]) => !["is_asap", "is_rider", "stage", "assigned_to", "from_stage", "to_stage"].includes(key))) })), children: "Remove incompatible filters" })
              ] }),
              getTriggerSupportedActions(trigger.trigger_type) === RECORD_SUPPORTED_ACTIONS && recordFilterFields(trigger.trigger_type).length > 0 && /* @__PURE__ */ jsxs("div", { className: "mt-3 rounded-lg border border-orange-200 bg-orange-50 p-3", children: [
                /* @__PURE__ */ jsx("p", { className: "mb-2 text-xs font-semibold text-orange-900", children: "IF (optional) - only when these fields match" }),
                /* @__PURE__ */ jsx("div", { className: "grid gap-3 sm:grid-cols-2", children: recordFilterFields(trigger.trigger_type).map(([key, label, values]) => /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx(Label, { htmlFor: `record-filter-${index}-${key}`, className: "text-xs", children: label }),
                  values ? /* @__PURE__ */ jsxs(
                    "select",
                    {
                      id: `record-filter-${index}-${key}`,
                      className: "mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm",
                      value: trigger.trigger_condition[key] || "",
                      onChange: (e) => updateTrigger(index, key, e.target.value || void 0),
                      children: [
                        /* @__PURE__ */ jsx("option", { value: "", children: "Any" }),
                        values.map((value) => /* @__PURE__ */ jsx("option", { value, children: value.replace(/_/g, " ") }, value))
                      ]
                    }
                  ) : /* @__PURE__ */ jsx(
                    Input,
                    {
                      id: `record-filter-${index}-${key}`,
                      className: "mt-1",
                      placeholder: "Any",
                      value: trigger.trigger_condition[key] || "",
                      onChange: (e) => updateTrigger(index, key, e.target.value || void 0)
                    }
                  )
                ] }, key)) })
              ] }),
              getTriggerIsOrderType(trigger.trigger_type) && /* @__PURE__ */ jsxs("div", { className: "mt-3 p-3 bg-orange-50/50 rounded-lg border border-orange-100 space-y-3", children: [
                /* @__PURE__ */ jsx("div", { className: "text-xs font-medium text-orange-700 mb-2", children: "Order Filters (optional - leave empty for all)" }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx(Label, { className: "text-xs text-gray-600", children: "Request Type" }),
                  /* @__PURE__ */ jsxs(
                    Select,
                    {
                      value: trigger.trigger_condition.request_type || "",
                      onValueChange: (val) => updateTrigger(index, "request_type", val || void 0),
                      children: [
                        /* @__PURE__ */ jsx(SelectTrigger, { className: "mt-1 h-8 text-sm", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Any request type" }) }),
                        /* @__PURE__ */ jsxs(SelectContent, { children: [
                          /* @__PURE__ */ jsx(SelectItem, { value: null, children: "Any" }),
                          ORDER_REQUEST_TYPES.map((t) => /* @__PURE__ */ jsx(SelectItem, { value: t, children: t }, t))
                        ] })
                      ]
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx(Label, { className: "text-xs text-gray-600", children: "Vendor" }),
                  /* @__PURE__ */ jsxs(
                    Select,
                    {
                      value: trigger.trigger_condition.vendor || "",
                      onValueChange: (val) => updateTrigger(index, "vendor", val || void 0),
                      children: [
                        /* @__PURE__ */ jsx(SelectTrigger, { className: "mt-1 h-8 text-sm", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Any vendor" }) }),
                        /* @__PURE__ */ jsxs(SelectContent, { children: [
                          /* @__PURE__ */ jsx(SelectItem, { value: null, children: "Any" }),
                          ORDER_VENDORS.map((v) => /* @__PURE__ */ jsx(SelectItem, { value: v, children: v }, v))
                        ] })
                      ]
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
                  /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsx(Label, { className: "text-xs text-gray-600", children: "Min Quantity" }),
                    /* @__PURE__ */ jsx(
                      Input,
                      {
                        type: "number",
                        min: "0",
                        placeholder: "Any",
                        value: trigger.trigger_condition.min_quantity ?? "",
                        onChange: (e) => updateTrigger(index, "min_quantity", e.target.value ? parseInt(e.target.value) : void 0),
                        className: "mt-1 h-8 text-sm"
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsx(Label, { className: "text-xs text-gray-600", children: "Max Quantity" }),
                    /* @__PURE__ */ jsx(
                      Input,
                      {
                        type: "number",
                        min: "0",
                        placeholder: "Any",
                        value: trigger.trigger_condition.max_quantity ?? "",
                        onChange: (e) => updateTrigger(index, "max_quantity", e.target.value ? parseInt(e.target.value) : void 0),
                        className: "mt-1 h-8 text-sm"
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx(Label, { className: "text-xs text-gray-600", children: "Requestor" }),
                  /* @__PURE__ */ jsxs(
                    Select,
                    {
                      value: trigger.trigger_condition.requestor || "",
                      onValueChange: (val) => updateTrigger(index, "requestor", val || void 0),
                      children: [
                        /* @__PURE__ */ jsx(SelectTrigger, { className: "mt-1 h-8 text-sm", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Any requestor" }) }),
                        /* @__PURE__ */ jsxs(SelectContent, { children: [
                          /* @__PURE__ */ jsx(SelectItem, { value: null, children: "Any" }),
                          TEAM_MEMBERS.map((m) => /* @__PURE__ */ jsx(SelectItem, { value: m, children: m }, m))
                        ] })
                      ]
                    }
                  )
                ] }),
                triggerHasOrderFilters(trigger.trigger_condition) && /* @__PURE__ */ jsx("div", { className: "text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2", children: "Filters set - this rule only runs for orders matching them." })
              ] }),
              trigger.trigger_type && /* @__PURE__ */ jsxs("details", { className: "mt-2 rounded-md border border-slate-200 bg-slate-50/60 p-2 text-xs", children: [
                /* @__PURE__ */ jsx("summary", { className: "cursor-pointer font-medium text-slate-600", children: "Advanced \u2014 check another record too" }),
                /* @__PURE__ */ jsxs("div", { className: "mt-2 grid grid-cols-2 gap-2", children: [
                  /* @__PURE__ */ jsx(
                    Input,
                    {
                      "aria-label": "Related entity",
                      placeholder: "Entity (e.g. WorkOrder)",
                      value: trigger.trigger_condition.related_entity || "",
                      onChange: (e) => updateTrigger(index, "related_entity", e.target.value || void 0)
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    Input,
                    {
                      "aria-label": "Match field",
                      placeholder: "Match field (e.g. id)",
                      value: trigger.trigger_condition.related_match_field || "",
                      onChange: (e) => updateTrigger(index, "related_match_field", e.target.value || void 0)
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    Input,
                    {
                      "aria-label": "Field to check",
                      placeholder: "Field on it (e.g. current_stage)",
                      value: trigger.trigger_condition.related_field || "",
                      onChange: (e) => updateTrigger(index, "related_field", e.target.value || void 0)
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    Input,
                    {
                      "aria-label": "Required value",
                      placeholder: "Must equal (e.g. Approved)",
                      value: trigger.trigger_condition.related_value || "",
                      onChange: (e) => updateTrigger(index, "related_value", e.target.value || void 0)
                    }
                  )
                ] }),
                /* @__PURE__ */ jsx("p", { className: "mt-1.5 text-[10px] text-slate-500", children: "The rule only runs when the matching record's field equals this value. If the lookup fails, the rule stays quiet." })
              ] }),
              trigger.trigger_type && !getTriggerSupportedActions(trigger.trigger_type) && /* @__PURE__ */ jsx("div", { className: "mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2", children: "This trigger isn't connected to anything yet, so a rule using it won't run." })
            ] }, index)),
            triggers.some((t) => t.logic === "and") && new Set(triggers.map((t) => t.trigger_type).filter(Boolean)).size > 1 && /* @__PURE__ */ jsx("div", { className: "text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2", children: "AND only works when the triggers can happen at the same moment - different events each happen one at a time, so this combination may never match. Use OR, or pick triggers that can match together." })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex justify-center", children: /* @__PURE__ */ jsx(ArrowDown, { className: "w-6 h-6 text-gray-400" }) }),
        /* @__PURE__ */ jsxs("div", { className: "clay-card p-4 bg-gradient-to-r from-blue-50 to-indigo-50", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsx("div", { className: "bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded-lg text-sm", children: "THEN" }),
              /* @__PURE__ */ jsx("span", { className: "text-gray-600 text-sm", children: "do all of these..." })
            ] }),
            /* @__PURE__ */ jsxs(Button, { variant: "ghost", size: "sm", onClick: addAction, className: "h-7 text-xs", children: [
              /* @__PURE__ */ jsx(Plus, { className: "w-3 h-3 mr-1" }),
              " Add Action"
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "space-y-4", children: actions.map((action, index) => {
            const actionType = ACTION_TYPES.find((t) => t.value === action.action_type);
            return /* @__PURE__ */ jsxs("div", { className: index > 0 ? "pt-4 border-t border-blue-200" : "", children: [
              index > 0 && /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-2", children: [
                /* @__PURE__ */ jsx("span", { className: "text-xs text-blue-600 font-medium", children: "AND" }),
                /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", onClick: () => removeAction(index), className: "h-6 w-6", children: /* @__PURE__ */ jsx(Trash2, { className: "w-3 h-3 text-red-600" }) })
              ] }),
              /* @__PURE__ */ jsxs(Select, { value: action.action_type, onValueChange: (val) => updateAction(index, "action_type", val), children: [
                /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Select action" }) }),
                /* @__PURE__ */ jsx(SelectContent, { children: ACTION_TYPES.filter((t) => actionRunsForTriggers(t.value, triggers) || t.value === action.action_type).map((t) => /* @__PURE__ */ jsx(SelectItem, { value: t.value, disabled: !actionRunsForTriggers(t.value, triggers), children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsx(t.icon, { className: "w-4 h-4" }),
                  t.label
                ] }) }, t.value)) })
              ] }),
              renderActionConfig(action, index),
              action.action_type && triggers.some((t) => t.trigger_type) && !actionRunsForTriggers(action.action_type, triggers) && /* @__PURE__ */ jsx("div", { className: "mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2", children: "This action can't run for the selected trigger(s) yet - it will be skipped." })
            ] }, index);
          }) })
        ] }),
        triggers[0]?.trigger_type && actions[0]?.action_type && /* @__PURE__ */ jsxs("div", { className: "bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700", children: [
          /* @__PURE__ */ jsx("span", { className: "font-medium", children: "In plain terms: " }),
          describeAutomation(triggers, actions)
        ] }),
        automationSaveError && /* @__PURE__ */ jsxs("div", { className: "bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800", children: [
          /* @__PURE__ */ jsx("div", { className: "font-medium", children: "Automation save blocked" }),
          /* @__PURE__ */ jsx("div", { className: "mt-1 text-xs", children: automationSaveError })
        ] }),
        builderProblems.length > 0 && triggers[0]?.trigger_type && /* @__PURE__ */ jsxs("div", { role: "status", className: "rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900", children: [
          /* @__PURE__ */ jsx("p", { className: "font-medium", children: "Before saving:" }),
          builderProblems.map((problem) => /* @__PURE__ */ jsx("p", { className: "mt-1", children: problem }, problem))
        ] }),
        nearDuplicateRule && /* @__PURE__ */ jsx("div", { className: "bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-amber-700 text-sm font-medium", children: [
          /* @__PURE__ */ jsx(AlertTriangle, { className: "w-4 h-4" }),
          '"',
          nearDuplicateRule.name,
          '" already uses this exact trigger and action combination  -  you may be creating a duplicate.'
        ] }) }),
        (!formData.name || !triggers[0]?.trigger_type || !actions[0]?.action_type) && /* @__PURE__ */ jsxs("div", { className: "bg-amber-50 border border-amber-200 rounded-lg p-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-amber-700 text-sm font-medium mb-1", children: [
            /* @__PURE__ */ jsx(AlertTriangle, { className: "w-4 h-4" }),
            "Missing required fields:"
          ] }),
          /* @__PURE__ */ jsxs("ul", { className: "text-xs text-amber-600 list-disc list-inside space-y-0.5", children: [
            !formData.name && /* @__PURE__ */ jsx("li", { children: "Automation name is required" }),
            !triggers[0]?.trigger_type && /* @__PURE__ */ jsx("li", { children: "At least one trigger must be selected" }),
            !actions[0]?.action_type && /* @__PURE__ */ jsx("li", { children: "At least one action must be selected" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex justify-end gap-3 pt-4 border-t", children: [
          /* @__PURE__ */ jsx(Button, { variant: "outline", disabled: automationSaving, onClick: () => closeAutomationEditor(false), children: "Close editor" }),
          !automationUncertain && /* @__PURE__ */ jsx(Button, { variant: "outline", disabled: automationSaving, onClick: discardAutomationDraft, children: "Discard draft" }),
          /* @__PURE__ */ jsx(
            Button,
            {
              onClick: handleSave,
              disabled: builderProblems.length > 0 || !!automationUncertain || automationSaving || !!automationOperation || emailGroupsLoading || emailGroupsLoadError || !formData.name || !triggers[0]?.trigger_type || !actions[0]?.action_type,
              className: "clay-button border-none",
              style: { background: "linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)" },
              children: automationSaving ? "Saving..." : `${editingRule ? "Update" : "Create"} Automation`
            }
          )
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(AlertDialog, { open: !!deleteConfirm, onOpenChange: () => setDeleteConfirm(null), children: /* @__PURE__ */ jsxs(AlertDialogContent, { className: "clay-card border-none", children: [
      /* @__PURE__ */ jsxs(AlertDialogHeader, { children: [
        /* @__PURE__ */ jsx(AlertDialogTitle, { children: "Delete Automation?" }),
        /* @__PURE__ */ jsxs(AlertDialogDescription, { children: [
          'Are you sure you want to delete "',
          deleteConfirm?.name,
          '"?'
        ] })
      ] }),
      /* @__PURE__ */ jsxs(AlertDialogFooter, { children: [
        /* @__PURE__ */ jsx(AlertDialogCancel, { className: "clay-button", children: "Cancel" }),
        /* @__PURE__ */ jsx(AlertDialogAction, { disabled: !!automationOperation || automationSaving || !!automationUncertain, onClick: () => handleDelete(deleteConfirm), className: "bg-red-600 text-white", children: "Delete" })
      ] })
    ] }) })
  ] }) });
}
