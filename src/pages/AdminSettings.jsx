import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { AUTOMATION_PRESETS, draftFromPreset, recordFilterFields, destinationWorkOrderId, draftProblems } from "@/components/admin/automationBuilderModel.mjs";
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
  Truck
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
import SyncConflictReview from '@/components/admin/SyncConflictReview';
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
import {
  getStoredAdminSettingsCapability,
  getStoredAdminSettingsCapabilityExpiry,
  hasStoredAdminSettingsAuthorization,
  storeAdminSettingsAuthorization,
  useAuth,
} from "@/components/auth/EmailGate";
import { verifyLogin } from "@/functions/verifyLogin";
import {
  createAutomationRuleIfAbsent,
  deleteAutomationRuleIfUnchanged,
  updateAutomationRuleIfUnchanged,
} from "@/components/admin/automationRulePersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { getAccessibleAdminGroups, getAccessibleAdminSubtab, getAccessibleAdminTab, getAdminCategoryKeyboardTarget, getAdminGroupForTab } from "@/components/admin/adminTabNavigation";
import AdminSettingsSearch from "@/components/admin/AdminSettingsSearch";
import { classifyAutomationCreateReceipt, reviewUncertainAutomationSave, snapshotUncertainAutomationReview, reviewedAutomationSnapshotIsCurrent } from "@/components/admin/automationSaveReconciliation";
import { AutomationReadTimeoutError, withAutomationReadDeadline } from "@/components/admin/automationReadDeadline";
import { reviewAutomationOperation } from "@/components/admin/automationOperationReconciliation";
import { getAdminNavigationStorageKey, readAdminNavigation, resolveAdminNavigation, storeAdminNavigation } from "@/components/admin/adminNavigationPersistence";
import { staffEntities } from "@/components/staff/staffEntities";

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
];

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

// Which advertised triggers actually fire today, and which actions can run
// for them. Three execution paths exist with different capabilities:
//   - workflowTriggerEngine (server): fires the WORKFLOW_ENGINE set -
//     client-emitted work-order events are routed there by
//     NotificationService, and permit events arrive via processWorkflowTriggers
//     and checkPermitFollowupReminders. Runs every advertised action.
//   - ORDER events also run through the engine but carry no Work Order, so
//     only send_email can execute for them.
//   - checkDeadlineReminders (daily job): fires the DEADLINE set and runs
//     send_email, set_asap, add_task and add_note only.
// Any trigger outside these sets cannot run yet - the editor marks it so
// nobody builds a rule that silently does nothing.
const WORKFLOW_ENGINE_TRIGGER_SET = new Set([
  "work_order_created", "work_order_completed", "work_order_deleted",
  "work_order_updated", "work_order_restored",
  "work_order_client_changed", "work_order_description_changed",
  "work_order_title_changed", "work_order_estimate_changed",
  "work_order_contact_changed", "work_order_install_location_changed",
  "work_order_permit_number_set", "work_order_permit_approved",
  "work_order_permit_submitted", "work_order_est_inv_set",
  "work_order_install_date_set", "work_order_project_health_changed",
  "work_order_production_type_changed", "work_order_file_uploaded",
  "stage_estimating_entered", "stage_sales_entered",
  "stage_permitting_entered", "stage_design_entered",
  "stage_production_entered", "stage_fabrication_entered",
  "stage_installation_entered", "stage_completed_entered",
  "project_health_on_track", "project_health_at_risk",
  "project_health_delayed", "project_health_blocked",
  "due_date_set", "due_date_cleared", "start_date_set",
  "site_survey_scheduled", "google_drive_linked", "file_attached",
  "permit_approved", "permit_receipt_confirmed",
  "priority_changed",
  "rider_created",
  "stage_changed", "stage_entered", "stage_exited",
  "task_added", "task_completed", "task_deleted",
  "task_uncompleted", "task_edited",
  "task_due_date_set", "task_assigned", "all_tasks_completed",
  "note_added", "note_deleted",
  "note_completed", "follow_up_added", "follow_up_completed",
  "sub_note_added", "sub_note_deleted",
  "rider_completed", "rider_all_tasks_completed", "rider_deleted",
  "rider_stage_changed", "rider_assigned_to_changed",
  "designer_assigned", "surveyor_assigned",
  "project_manager_assigned", "estimator_assigned",
  "sip_item_completed", "mmm_item_completed", "sip_item_revisit_set",
  "image_uploaded",
  "asap_toggled_on", "asap_toggled_off",
  "assigned_to_changed",
  "permit_submitted", "permit_received",
  "permit_followup_due", "permit_followup_overdue",
]);

const ORDER_TRIGGER_SET = new Set([
  "order_created", "order_ordered", "order_received", "order_cancelled",
  "order_customer_name_changed", "order_request_type_changed",
  "order_description_changed", "order_quantity_changed",
  "order_requestor_changed", "order_date_needed_changed",
  "order_date_ordered_changed", "order_vendor_changed",
  "order_date_received_changed",
]);

const DEADLINE_TRIGGER_SET = new Set([
  "due_date_approaching", "due_date_passed",
  "work_order_install_date_approaching", "work_order_install_date_passed",
  "site_survey_approaching",
  "task_due_date_approaching", "task_due_date_passed",
  "sip_revisit_date_approaching",
]);

// Fired by checkDeadlineReminders against Orders awaiting delivery - order
// context only, so send_email is the sole supported action.
const ORDER_DEADLINE_TRIGGER_SET = new Set([
  "order_date_needed_approaching", "order_date_needed_passed", "order_overdue",
]);

// Record events can email or append a task/note to an explicitly selected
// Work Order. Scheduled record reminders remain email-only.
const SALES_TRIGGER_SET = new Set([
  "sales_lead_created", "sales_status_changed", "sales_status_won",
  "sales_status_lost", "sales_status_on_hold", "sales_rep_changed",
]);

// Fired by checkDeadlineReminders against open Opportunities -
// send_email only.
const SALES_DEADLINE_TRIGGER_SET = new Set([
  "sales_follow_up_date_approaching", "sales_follow_up_date_passed",
  "sales_close_date_approaching",
]);

// Emitted server-side by timeClockAction after verified writes - carries a
// TimeEntry/TimeOffRequest/labor-segment record (not a Work Order), so only
// send_email can run.
const TIME_CLOCK_TRIGGER_SET = new Set([
  "time_clock_in", "time_clock_out", "time_clock_in_late", "time_clock_out_early",
  "time_entry_long_shift", "time_entry_no_clock_out", "time_entry_notes_updated",
  "time_off_requested", "time_off_updated", "time_off_approved", "time_off_denied",
  "time_off_cancelled", "job_allocation_added", "pto_balance_low",
]);

// Pending-import duplicate flags are created by detectSalesDuplicates. The
// approve/merge/reject statuses have no write path in the app (the Corebridge
// import pipeline is disabled), so those three stay unwired on purpose.
const PENDING_IMPORT_TRIGGER_SET = new Set([
  "pending_import_created", "duplicate_detected",
]);

// Emitted by manageFeatureReports after verified writes - FeatureReport
// record context, send_email only.
const FEATURE_REPORT_TRIGGER_SET = new Set([
  "feature_report_submitted", "feature_report_status_changed",
  "feature_report_completed",
]);

// Emitted by onboardingAccountAction, issuePasswordReset, the face-enroll
// dialog, and the User Management account save - AuthorizedEmail record
// context, send_email only.
const USER_TRIGGER_SET = new Set([
  "user_registered", "user_password_reset", "user_face_enrolled",
  "user_role_changed",
]);

// Emitted by monitorJurisdictionChanges and the jurisdiction persistence
// funnels - JurisdictionProfile / RegulationAlert record context.
const JURISDICTION_TRIGGER_SET = new Set([
  "jurisdiction_profile_created", "jurisdiction_profile_updated",
  "regulation_alert_created",
]);

const ORDER_SUPPORTED_ACTIONS = new Set(["send_email"]);
const RECORD_SUPPORTED_ACTIONS = new Set(["send_email", "add_task", "add_note"]);

const ENGINE_SUPPORTED_ACTIONS = new Set([
  "send_email", "change_stage", "set_asap", "assign_to",
  "add_task", "add_note", "set_due_date", "create_rider",
  "set_priority", "mark_complete",
]);

const DEADLINE_SUPPORTED_ACTIONS = new Set([
  "send_email", "set_asap", "add_task", "add_note",
]);

const getTriggerSupportedActions = (triggerType) => {
  if (WORKFLOW_ENGINE_TRIGGER_SET.has(triggerType)) return ENGINE_SUPPORTED_ACTIONS;
  if (ORDER_TRIGGER_SET.has(triggerType) || SALES_TRIGGER_SET.has(triggerType)) return RECORD_SUPPORTED_ACTIONS;
  if (ORDER_DEADLINE_TRIGGER_SET.has(triggerType) || SALES_DEADLINE_TRIGGER_SET.has(triggerType)) return ORDER_SUPPORTED_ACTIONS;
  if (TIME_CLOCK_TRIGGER_SET.has(triggerType)) return ORDER_SUPPORTED_ACTIONS;
  if (PENDING_IMPORT_TRIGGER_SET.has(triggerType) || FEATURE_REPORT_TRIGGER_SET.has(triggerType) ||
      USER_TRIGGER_SET.has(triggerType) || JURISDICTION_TRIGGER_SET.has(triggerType)) return RECORD_SUPPORTED_ACTIONS;
  if (DEADLINE_TRIGGER_SET.has(triggerType)) return DEADLINE_SUPPORTED_ACTIONS;
  return null;
};

const actionRunsForTriggers = (actionType, triggers) =>
  (triggers || []).some(t => getTriggerSupportedActions(t?.trigger_type)?.has(actionType));

const ruleIsRunnable = (rule) =>
  (rule?.triggers || []).some(t => getTriggerSupportedActions(t?.trigger_type)) &&
  (rule?.actions || []).some(a => actionRunsForTriggers(a?.action_type, rule?.triggers));

const triggerHasOrderFilters = (condition) =>
  !!(condition?.request_type || condition?.vendor || condition?.requestor ||
     condition?.min_quantity != null || condition?.max_quantity != null);

const describeAutomation = (triggers, actions) => {
  const triggerText = (triggers || [])
    .filter(t => t?.trigger_type)
    .map((t, i) => {
      const filters = Object.entries(t.trigger_condition || {}).filter(([, value]) => value != null && value !== "");
      const onlyIf = filters.length ? ` (only if ${filters.map(([key, value]) => `${key.replace(/^record_/, "").replace(/_/g, " ")} = ${value}`).join(" and ")})` : "";
      return `${i > 0 ? ` ${t.logic === "and" ? "and" : "or"} ` : ""}${TRIGGER_TYPES.find(tt => tt.value === t.trigger_type)?.label || t.trigger_type}${onlyIf}`;
    })
    .join("");
  const actionText = (actions || [])
    .filter(a => a?.action_type)
    .map(a => `${ACTION_TYPES.find(at => at.value === a.action_type)?.label || a.action_type}${a.action_config?.target_work_order_id ? ` to Work Order ${a.action_config.target_work_order_id}` : ""}`)
    .join(" and ");
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
  "{{title}}", "{{client_name}}", "{{description}}", "{{current_stage}}",
  "{{assigned_to}}", "{{due_date}}", "{{created_by}}", "{{is_rider}}",
  "{{is_asap}}", "{{previous_stage}}", "{{new_stage}}", "{{task_text}}",
  "{{note_text}}", "{{note_type}}", "{{changed_by}}", "{{timestamp}}",
  "{{employee_name}}", "{{clock_in_time}}", "{{clock_out_time}}", "{{total_hours}}",
  "{{time_off_type}}", "{{time_off_dates}}", "{{time_off_hours}}", "{{time_off_reason}}"
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
  smartsheet: GitBranch,
  resources: Users,
  permitting_completeness: ClipboardCheck,
  permitting_rules: Scale,
  permitting_tests: FlaskConical,
  task_assignments: UserCheck,
  calendar: CalendarDays,
  activity: Activity,
  fleet: Truck,
};

export default function AdminSettings() {
  const { currentUser, sessionToken } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const [isUnlocked, setIsUnlocked] = useState(() => hasStoredAdminSettingsAuthorization());
  const [capabilityExpiryLabel, setCapabilityExpiryLabel] = useState("");
  const navigationKey = getAdminNavigationStorageKey(currentUser);
  // Restore only after identity and Admin unlock are established; direct URLs win.
  const browserStorage = (() => {
    try { return typeof window === "undefined" ? null : window.localStorage; }
    catch { return null; }
  })();
  const savedNavigation = !searchParams.has("tab") && isUnlocked
    ? readAdminNavigation(browserStorage, navigationKey, isAdmin, currentUser)
    : null;
  const { tab: selectedAdminTab, subtab: selectedAdminSubtab } =
    resolveAdminNavigation(searchParams, savedNavigation, isAdmin, currentUser);
  useEffect(() => {
    if (isUnlocked && navigationKey) {
      storeAdminNavigation(browserStorage, navigationKey, {
        tab: selectedAdminTab, subtab: selectedAdminSubtab,
      }, isAdmin, currentUser);
    }
  }, [isUnlocked, navigationKey, selectedAdminTab, selectedAdminSubtab, isAdmin, browserStorage]);
  const availableAdminGroups = getAccessibleAdminGroups(isAdmin, currentUser);
  const activeAdminGroupId = getAdminGroupForTab(selectedAdminTab, isAdmin, currentUser);
  const activeAdminGroup = availableAdminGroups.find((group) => group.id === activeAdminGroupId) || availableAdminGroups[0];
  const categoryScrollerRef = useRef(null);
  const adminScrollRef = useRef(null);
  const nestedTabListsRef = useRef({});
  useEffect(() => {
    // Keep selected categories visible on deep links and after responsive
    // changes. Do not snap back while someone is swiping through categories.
    const scroller = categoryScrollerRef.current;
    const selected = [...(scroller?.querySelectorAll("[data-admin-category]") || [])]
      .find(button => button.getAttribute("data-admin-category") === activeAdminGroupId);
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
    const onExplore = () => { exploringCategories = true; };
    scroller.addEventListener("wheel", onExplore, { passive: true });
    scroller.addEventListener("touchmove", onExplore, { passive: true });
    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(onLayoutChange) : null;
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
    // Radix owns roving tab focus. History may switch the selected trigger
    // while keyboard focus is inside its list; never steal focus from search,
    // a form, or another section.
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
    // ResizeObserver catches orientation changes as well as dynamic header /
    // panel height changes. Only keep the tab visible if it was visible before
    // the change. Intentionally scrolling into a long panel is not a request
    // to jump back to its navigation on the next layout update.
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
        // A focused search field or form is in use. Never move its scroll
        // position to chase a tab during unrelated layout updates.
        const currentFocus = list.ownerDocument.activeElement;
        if (currentFocus && currentFocus !== list.ownerDocument.body &&
            !list.contains(currentFocus)) return;
        // Resizes must never call focus(), including during keyboard input.
        revealActive();
        keepVisible = activeIsVisible();
      });
    };
    scrollArea.addEventListener("wheel", onUserScroll, { passive: true });
    scrollArea.addEventListener("touchend", onUserScroll, { passive: true });
    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(onLayoutChange) : null;
    for (const element of [
      scrollArea, list, active, list.closest('[role="tabpanel"]'),
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
    if (getAccessibleAdminTab(nextTab, isAdmin, currentUser) !== nextTab) return;
    const validSubtab = nextSubtab && getAccessibleAdminSubtab(nextTab, nextSubtab, currentUser) === nextSubtab
      ? nextSubtab
      : null;
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
  const [emailGroups, setEmailGroups] = useState([]);
  const [emailGroupsLoading, setEmailGroupsLoading] = useState(true);
  const [emailGroupsLoadError, setEmailGroupsLoadError] = useState(false);
  const emailGroupsLoadSequence = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [automationLoadError, setAutomationLoadError] = useState(false);
  const automationLoadSequence = useRef(0);
  const [automationRecoveryListVerified, setAutomationRecoveryListVerified] = useState(false);

  // Password/Face ID protection state. A UI unlock is valid only while the
  // backend-issued Admin Settings capability is still present and unexpired.
  // Admin Settings authorization lives in sessionStorage; write paths read
  // the current value at dispatch time instead of holding a snapshot here.
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [sortBy, setSortBy] = useState("name"); // "name", "trigger", "action", "enabled"
  const [sortDirection, setSortDirection] = useState("asc");
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
  useEffect(() => () => { automationSessionEpoch.current += 1; }, []);

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

  // Keep unsaved Automation form state above individual Admin panel error
  // boundaries. Drafts stay in this mounted session only, never localStorage,
  // and a retry or resume never invokes a write.
  const automationDraftChanged = () => automationEditorBaseline.current !== null &&
    automationEditorBaseline.current !== JSON.stringify({ formData, triggers, actions });
  const closeAutomationEditor = (open) => {
    if (open) { setIsDialogOpen(true); return; }
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
    // An Admin session/identity change may not retain draft authority.
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
    setFormData({ name: "", enabled: true, priority: 0 });
    setTriggers([{ trigger_type: "", trigger_condition: {}, logic: "or" }]);
    setActions([{ action_type: "", action_config: {} }]);
    setAutomationSaveError("");
    setAutomationSaving(false);
  }, [sessionToken, navigationKey, isUnlocked]);

  useEffect(() => {
    // A capability that expires while the page sits open re-locks at the
    // moment of expiry rather than waiting for the next write to discover it.
    // Re-unlocking stores a fresh expiry and this effect re-arms itself.
    if (!isUnlocked) { setCapabilityExpiryLabel(""); return; }
    const expiresAt = getStoredAdminSettingsCapabilityExpiry();
    if (!Number.isFinite(expiresAt)) { setCapabilityExpiryLabel(""); return; }
    const relock = () => {
      setCapabilityExpiryLabel("");
      setPasswordError("Your Admin Settings authorization expired. Sign in again to continue.");
      setIsUnlocked(false);
    };
    if (expiresAt <= Date.now()) { relock(); return; }
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
        label: "Admin Settings email groups",
      });
      if (requestSequence === emailGroupsLoadSequence.current) {
        setEmailGroups(groups);
        setEmailGroupsLoadError(false);
      }
      return groups;
    } catch {
      // Unavailable group choices must not masquerade as an empty catalog.
      if (requestSequence === emailGroupsLoadSequence.current) setEmailGroupsLoadError(true);
      return null;
    } finally {
      if (requestSequence === emailGroupsLoadSequence.current) setEmailGroupsLoading(false);
    }
  };

  const loadAllUsers = async () => {
    const users = await loadAllEntityRows({
      entity: staffEntities.AuthorizedEmail,
      sort: null,
      label: "Admin Settings authorized users",
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
        if (loginData.user.role === 'admin' && loginData.token) {
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
        label: "Admin Settings automation rules",
      }));
      if (requestSequence !== automationLoadSequence.current ||
          ownerEpoch !== automationSessionEpoch.current) return null;
      if (!Array.isArray(rules)) throw new Error("Unverified Automation list response.");
      setAutomations(rules);
      setAutomationLoadError(false);
      return rules;
    } catch {
      // A failed read is never a verified empty list. Keep internal cache
      // inaccessible to editing until a complete, owned read succeeds.
      if (requestSequence === automationLoadSequence.current &&
          ownerEpoch === automationSessionEpoch.current) {
        setAutomationLoadError(true);
      }
      return null;
    } finally {
      if (requestSequence === automationLoadSequence.current &&
          ownerEpoch === automationSessionEpoch.current) {
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

  const openNewRule = async () => {
    if (automationSaveInFlight.current) return;
    if (automationUncertainRef.current) { setIsDialogOpen(true); setAutomationDraftParked(false); return; }
    if (automationDraftParked) { setIsDialogOpen(true); setAutomationDraftParked(false); return; }
    if (emailGroupsLoading) return;
    const ownerEpoch = automationSessionEpoch.current;
    setAutomationSaveError("");
    if (!(await loadEmailGroups()) || ownerEpoch !== automationSessionEpoch.current) return;
    setEditingRule(null);
    setTriggers([{ trigger_type: "", trigger_condition: {}, logic: "or" }]);
    setActions([{ action_type: "", action_config: {} }]);
    const nextForm = { name: "", enabled: true, priority: 0 };
    setFormData(nextForm);
    automationEditorBaseline.current = JSON.stringify({
      formData: nextForm,
      triggers: [{ trigger_type: "", trigger_condition: {}, logic: "or" }],
      actions: [{ action_type: "", action_config: {} }]
    });
    setAutomationDraftParked(false);
    setIsDialogOpen(true);
  };

  const openEditRule = async (rule) => {
    if (automationSaveInFlight.current) return;
    if (automationUncertainRef.current) { setIsDialogOpen(true); setAutomationDraftParked(false); return; }
    if (automationDraftParked) { setIsDialogOpen(true); setAutomationDraftParked(false); return; }
    if (emailGroupsLoading) return;
    const ownerEpoch = automationSessionEpoch.current;
    setAutomationSaveError("");
    if (!(await loadEmailGroups()) || ownerEpoch !== automationSessionEpoch.current) return;
    setEditingRule(rule);
    setTriggers(rule.triggers || [{ trigger_type: "", trigger_condition: {}, logic: "or" }]);
    setActions(rule.actions || [{ action_type: "", action_config: {} }]);
    const nextForm = {
      name: rule.name || "",
      enabled: rule.enabled !== false,
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

  const duplicateRule = async (rule) => {
    if (automationSaveInFlight.current) return;
    if (automationUncertainRef.current) { setIsDialogOpen(true); setAutomationDraftParked(false); return; }
    if (automationDraftParked) { setIsDialogOpen(true); setAutomationDraftParked(false); return; }
    if (emailGroupsLoading) return;
    const ownerEpoch = automationSessionEpoch.current;
    setAutomationSaveError("");
    if (!(await loadEmailGroups()) || ownerEpoch !== automationSessionEpoch.current) return;
    setEditingRule(null);
    setTriggers(rule.triggers || [{ trigger_type: "", trigger_condition: {}, logic: "or" }]);
    setActions(rule.actions || [{ action_type: "", action_config: {} }]);
    const names = new Set(automations.map(item => String(item.name || "").trim().toLowerCase()));
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
    if (problems.length) { setAutomationSaveError(problems.join(" ")); return; }
    if (automationUncertainRef.current || automationSaveInFlight.current || automationSaving || emailGroupsLoading ||
        emailGroupsLoadError || !formData.name?.trim() ||
        !triggers[0]?.trigger_type || !actions[0]?.action_type) return;
    // Reads the current stored authorization rather than the mount-time
    // snapshot, so an expired capability fails before dispatch instead of
    // sending a stale credential to the server. An expired authorization
    // re-locks Admin Settings so the message's instruction is actionable.
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
      triggers,
      actions: actions.map(action => action.action_config?.target_work_order_id ? {
        ...action, action_config: { ...action.action_config, target_work_order_id: destinationWorkOrderId(action.action_config.target_work_order_id) },
      } : action)
    };
    setAutomationSaveError("");
    setAutomationSaving(true);
    let writeDispatched = false;
    let createReceiptStatus = null;
    try {
      if (editingRule) {
        const duplicateName = automations.find(rule => rule.id !== editingRule.id && String(rule.name || "").trim().toLowerCase() === saveData.name.toLowerCase());
        if (duplicateName) throw new Error(`Another automation named "${saveData.name}" already exists.`);
        writeDispatched = true;
        const saved = await updateAutomationRuleIfUnchanged({
          record: editingRule,
          nextFields: saveData,
          exactVersion: true,
          adminCapability: writeCapability,
          label: `Automation Rule ${editingRule.name || editingRule.id}`,
        });
        if (ownerEpoch !== automationSessionEpoch.current) return;
        setAutomations(prev => prev.map(rule => rule.id === saved.id ? saved : rule));
      } else {
        writeDispatched = true;
        const result = await createAutomationRuleIfAbsent({
          data: saveData,
          adminCapability: writeCapability,
          label: `Automation Rule ${saveData.name}`,
        });
        if (ownerEpoch !== automationSessionEpoch.current) return;
        createReceiptStatus = classifyAutomationCreateReceipt(result, saveData);
        if (createReceiptStatus !== "created") {
          // Includes a pre-existing name, a concurrent winner, a recovered
          // response and missing/inconsistent receipts. None proves this
          // particular create safely completed. Require read-only review.
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
        // The response does not prove whether the server committed. Fence the
        // attempted draft; only an explicit read-only review may classify it.
        const attempt = {
          kind: editingRule ? "update" : "create",
          originalId: editingRule?.id || null,
          receiptStatus: editingRule ? null : createReceiptStatus,
          attempted: JSON.parse(JSON.stringify(saveData)),
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
    if (!pending || automationReviewInFlight.current || automationAckInFlight.current ||
        automationSaveInFlight.current) return;
    automationReviewInFlight.current = true;
    automationRecoveryFocusRequested.current = false;
    automationReviewSnapshotRef.current = null;
    const draftAtReviewStart = automationDraftFingerprintRef.current;
    const ownerEpoch = automationSessionEpoch.current;
    const reviewId = ++automationReviewOwner.current;
    setAutomationReviewLoading(true);
    setAutomationReviewStatus(null);
    try {
      // Read complete entity state only, without any mutation.
      const rows = await withAutomationReadDeadline(() => loadAllEntityRows({
        entity: AutomationRule, sort: "-created_date",
        label: "Admin Settings uncertain Automation verification",
      }));
      if (ownerEpoch !== automationSessionEpoch.current ||
          reviewId !== automationReviewOwner.current ||
          automationUncertainRef.current !== pending) return;
      const review = snapshotUncertainAutomationReview({ ...pending, rows });
      setAutomationRecoveryFailures(0);
      setAutomationRecoveryFailedStep(null);
      if (draftAtReviewStart !== automationDraftFingerprintRef.current) {
        setAutomationReviewStatus("stale_draft");
      } else {
        automationReviewSnapshotRef.current = review ? {
          pending, review, draftFingerprint: draftAtReviewStart,
        } : null;
        setAutomationReviewStatus(review?.status || reviewUncertainAutomationSave({ ...pending, rows }));
      }
    } catch (error) {
      if (ownerEpoch === automationSessionEpoch.current &&
          reviewId === automationReviewOwner.current &&
          automationUncertainRef.current === pending) {
        automationReviewSnapshotRef.current = null;
        setAutomationReviewStatus(error instanceof AutomationReadTimeoutError ? "timed_out" : "read_failed");
        setAutomationRecoveryFailures(count => Math.min(count + 1, 99));
        setAutomationRecoveryFailedStep("verification");
        automationRecoveryFocusRequested.current = true;
      }
    } finally {
      if (ownerEpoch === automationSessionEpoch.current &&
          reviewId === automationReviewOwner.current) {
        automationReviewInFlight.current = false;
        setAutomationReviewLoading(false);
      }
    }
  };
  const abandonUncertainAutomationAttempt = async () => {
    // Acknowledgment is a second, read-only check against the exact snapshot
    // previously reviewed. It never retries, rolls back or mutates a rule.
    const evidence = automationReviewSnapshotRef.current;
    const pending = automationUncertainRef.current;
    if (automationSaveInFlight.current || automationReviewInFlight.current ||
        automationAckInFlight.current || !pending || evidence?.pending !== pending ||
        !["matching", "different", "not_found", "ambiguous"].includes(automationReviewStatus)) return;
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
        entity: AutomationRule, sort: "-created_date",
        label: "Admin Settings uncertain Automation acknowledgment",
      }));
      if (ownerEpoch !== automationSessionEpoch.current ||
          reviewId !== automationReviewOwner.current ||
          automationUncertainRef.current !== pending ||
          automationReviewSnapshotRef.current !== evidence) return;
      const draftChanged = automationDraftFingerprintRef.current !== evidence.draftFingerprint;
      if (draftChanged || !reviewedAutomationSnapshotIsCurrent(evidence.review, { ...pending, rows })) {
        automationReviewSnapshotRef.current = null;
        setAutomationReviewStatus(draftChanged ? "stale_draft" : "stale");
        return;
      }
      // The acknowledgment's complete, fresh list read is authoritative for
      // this instant. Adopt it directly instead of issuing a third read that
      // could fail, and fence older in-flight list requests from replacing it.
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
      if (ownerEpoch === automationSessionEpoch.current &&
          reviewId === automationReviewOwner.current &&
          automationUncertainRef.current === pending) {
        automationReviewSnapshotRef.current = null;
        setAutomationReviewStatus(error instanceof AutomationReadTimeoutError ? "timed_out" : "read_failed");
        setAutomationRecoveryFailures(count => Math.min(count + 1, 99));
        setAutomationRecoveryFailedStep("acknowledgment");
        automationRecoveryFocusRequested.current = true;
      }
    } finally {
      if (ownerEpoch === automationSessionEpoch.current &&
          reviewId === automationReviewOwner.current) {
        automationAckInFlight.current = false;
        setAutomationAckLoading(false);
      }
    }
  };
  useEffect(() => {
    if (!automationRecoveryFocusRequested.current || automationReviewLoading || automationAckLoading ||
        !["timed_out", "read_failed"].includes(automationReviewStatus)) return;
    const button = automationRetryButtonRef.current;
    const active = document.activeElement;
    // Restore focus only for the recovery action; never take it from an
    // unsent editor field, search input or other navigation control.
    if (!button?.isConnected || button.disabled ||
        (active !== document.body && active !== button &&
          !active?.closest?.('[data-automation-recovery-controls]'))) return;
    automationRecoveryFocusRequested.current = false;
    button.focus({ preventScroll: true });
  }, [automationReviewStatus, automationRecoveryFailures, automationReviewLoading, automationAckLoading, isDialogOpen]);

  const uncertainAutomationReview = automationUncertain ? (
    <div role="alert" aria-label="Automation save outcome requires review"
      className="mb-4 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-semibold">Automation save result is uncertain</p>
      <p className="mt-1">The request might have succeeded. Your draft remains here, but saving it again is blocked. Checking status reads records only.</p>
      {automationUncertain?.kind === "create" &&
        ["existing", "recovered", "concurrent_duplicate_discarded"].includes(automationUncertain.receiptStatus) && (
        <p className="mt-2">
          {automationUncertain.receiptStatus === "existing"
            ? "A rule already used this name before the create could be confirmed."
            : automationUncertain.receiptStatus === "recovered"
              ? "The server located a rule after processing the request, but ownership of that result is uncertain."
              : "Concurrent creation left a different rule as the canonical record. Review it before proceeding."}
        </p>
      )}
      {automationReviewStatus && (
        <p className="mt-2" role="status">
          {automationReviewStatus === "matching"
            ? "A current rule matches the attempted values. This does not prove which request wrote it; do not resubmit."
            : automationReviewStatus === "timed_out"
              ? "The read-only check timed out. No result was verified; your draft is preserved. Verify again to start a fresh read."
              : automationReviewStatus === "stale"
                ? "The reviewed rule changed before acknowledgment. Your draft is preserved; verify again to review the latest state."
              : automationReviewStatus === "stale_draft"
                ? "The draft changed during review. Your edits are preserved; verify again before acknowledgment."
                : automationReviewStatus === "read_failed" || automationReviewStatus === "unverified"
                  ? "The rule list could not be verified. No new write is allowed."
              : automationReviewStatus === "not_found"
                ? "No matching rule was found. A delayed write is still possible; do not resubmit this attempt."
                : automationReviewStatus === "ambiguous"
                  ? "Multiple possible matches exist. No new write is allowed."
                  : "A rule exists but its values differ from the attempted save. Review the latest record before making changes."}
        </p>
      )}
      {automationRecoveryFailures >= 2 && (
        <div role="status" aria-label="Repeated Automation verification failures" className="mt-3 rounded-md border border-amber-300 bg-white p-2">
          <p className="font-semibold">{automationRecoveryFailures} consecutive read-only checks failed or timed out.</p>
          <p className="mt-1">Last affected step: {automationRecoveryFailedStep === "acknowledgment" ? "acknowledgment recheck" : "save verification"}. Your draft has not been discarded, and no Automation save was retried. You can verify again or close the editor and return to Automations; this draft remains available in this Admin session.</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2" data-automation-recovery-controls>
        <Button ref={automationRetryButtonRef} type="button" size="sm" variant="outline"
          disabled={automationReviewLoading || automationAckLoading || automationSaving}
          onClick={() => { void verifyUncertainAutomationSave(); }}>
          {automationReviewLoading ? "Checking rules..." : "Verify save status (read-only)"}
        </Button>
        {isDialogOpen && (
          <Button type="button" size="sm" variant="outline"
            disabled={automationReviewLoading || automationAckLoading || automationSaving}
            onClick={() => closeAutomationEditor(false)}>
            Return to Automations (keep draft)
          </Button>
        )}
        {["matching", "different", "not_found", "ambiguous"].includes(automationReviewStatus) && (
          <Button type="button" size="sm" variant="outline"
            disabled={automationReviewLoading || automationAckLoading || automationSaving}
            onClick={() => { void abandonUncertainAutomationAttempt(); }}>
            {automationAckLoading ? "Rechecking reviewed rule..." : "Acknowledge and discard this draft"}
          </Button>
        )}
      </div>
      <p className="mt-2 text-xs">Acknowledgment rechecks the reviewed rule and draft before discarding local changes. This is a point-in-time read, not a server-side cancellation or proof of who saved the rule.</p>
    </div>
  ) : null;

  const runAutomationOperation = async (kind, rule) => {
    if (!rule?.id || automationOperationRef.current || automationSaveInFlight.current ||
        automationUncertainRef.current || isLoading || automationLoadError) return;
    // Check stored authorization before acquiring the operation lock: an
    // expired capability must re-lock, never fence the panel behind an
    // unverifiable write that was never dispatched.
    const writeCapability = getStoredAdminSettingsCapability();
    if (!writeCapability) {
      setPasswordError("Your Admin Settings authorization expired. Sign in again to continue.");
      setIsUnlocked(false);
      return;
    }
    const operation = { kind, id: rule.id, name: rule.name || rule.id,
      enabled: !rule.enabled, settled: false, phase: "pending" };
    const epoch = automationSessionEpoch.current;
    const owns = () => epoch === automationSessionEpoch.current &&
      automationOperationRef.current === operation;
    // Acquire synchronously, before React can render or any request is dispatched.
    automationOperationRef.current = operation;
    setAutomationOperation({ ...operation });
    automationOperationEvidence.current = null;
    setAutomationOperationReview(null);
    setDeleteConfirm(null);
    setAutomationSaveError("");
    // Any list already in flight predates this write and cannot become current.
    automationLoadSequence.current += 1;
    setAutomationRecoveryListVerified(false);
    const write = Promise.resolve().then(() => kind === "delete"
      ? deleteAutomationRuleIfUnchanged({ record: rule, adminCapability: writeCapability,
          label: `Automation Rule ${operation.name} deletion` })
      : updateAutomationRuleIfUnchanged({ record: rule,
          nextFields: { enabled: operation.enabled }, exactVersion: false, adminCapability: writeCapability,
          label: `Automation Rule ${operation.name} enabled state` }));
    // A timeout does not cancel a server write. Late receipts never release the
    // fence or overwrite a newer snapshot. They only permit a new review.
    const settled = write.then(result => {
      operation.settled = true;
      return result;
    }, error => {
      operation.settled = true;
      throw error;
    });
    try {
      const result = await withAutomationReadDeadline(() => settled);
      if (!owns()) return;
      if (kind === "delete" ? result?.deleted !== true :
          result?.id !== rule.id || result.enabled !== operation.enabled || !result.updated_date) {
        throw new Error("Automation operation receipt could not be verified.");
      }
      await loadAutomations();
      if (!owns()) return;
      automationOperationRef.current = null;
      setAutomationOperation(null);
    } catch (error) {
      if (!owns()) return;
      if (error?.automationPreDispatch === true) {
        // A pre-dispatch validation failure cannot have reached the server, so
        // there is nothing to verify. Release the lock and surface the real
        // error instead of forcing an uncertain-outcome recovery.
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
    // Observe late completion without treating it as proof of current state.
    void settled.catch(() => {}).finally(() => {
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

  const reconcileAutomationOperation = async (acknowledge = false) => {
    const operation = automationOperationRef.current;
    if (!operation || operation.phase !== "uncertain" || automationOperationReadBusy.current) return;
    const evidence = automationOperationEvidence.current;
    if (acknowledge && (!operation.settled || !evidence)) return;
    const epoch = automationSessionEpoch.current;
    const owner = ++automationOperationReadOwner.current;
    const owns = () => epoch === automationSessionEpoch.current &&
      owner === automationOperationReadOwner.current && automationOperationRef.current === operation;
    automationOperationReadBusy.current = true;
    setAutomationOperationReading(true);
    try {
      const rows = await withAutomationReadDeadline(() => loadAllEntityRows({
        entity: AutomationRule, sort: "name",
        label: "Admin Settings Automation operation reconciliation",
      }));
      if (!owns()) return;
      const review = reviewAutomationOperation(operation, rows);
      if (acknowledge && review.snapshot !== evidence.snapshot) {
        automationOperationEvidence.current = null;
        setAutomationOperationReview("changed");
        return;
      }
      if (acknowledge) {
        // Adopt exactly the fresh complete list; invalidate older list requests.
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

  const ordinaryAutomationRecovery = automationOperation ? (
    <div role="alert" aria-label="Automation operation requires review"
      className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">{automationOperation.phase === "pending" ? "Automation operation in progress" : "Automation operation outcome is uncertain"}</p>
      <p className="mt-1">{automationOperation.kind === "delete" ? "Delete" : automationOperation.enabled ? "Enable" : "Disable"}: {automationOperation.name}.
        Automation writes are paused. Your editor draft is preserved.</p>
      <p className="mt-1">A list refresh cannot resolve this attempt. Verification reads current state only; it does not retry or cancel the request, or prove which request changed the rule.</p>
      {automationOperation.phase === "uncertain" && <>
        {!automationOperation.settled && <p className="mt-2">The original request is still pending. You can inspect current state; acknowledgment remains paused until it settles.</p>}
        <p role="status" className="mt-2">{
          automationOperationReview === "matching" ? "The rule currently has the requested enabled state." :
          automationOperationReview === "different" ? "The rule currently has a different enabled state." :
          automationOperationReview === "absent" ? "The rule is absent from the complete current list." :
          automationOperationReview === "present" ? "The rule is still present in the current list." :
          automationOperationReview === "changed" ? "The reviewed rule changed. Verify again before acknowledgment." :
          automationOperationReview === "failed" ? "Verification failed or timed out. No current state was verified. Try the read again." :
          "Verify the current rule before acknowledging this attempt."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={automationOperationReading}
            onClick={() => { void reconcileAutomationOperation(); }}>
            {automationOperationReading ? "Checking operation..." : "Verify operation status (read-only)"}
          </Button>
          <Button type="button" variant="outline"
            disabled={automationOperationReading || !automationOperation.settled || !automationOperationEvidence.current}
            onClick={() => { void reconcileAutomationOperation(true); }}>
            Acknowledge reviewed operation
          </Button>
        </div>
      </>}
    </div>
  ) : null;

  // Trigger helpers
  const addTrigger = () => setTriggers([...triggers, { trigger_type: "", trigger_condition: {}, logic: "or" }]);
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

  // Action helpers
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

  // Order-specific filter options
  const ORDER_REQUEST_TYPES = ["Substrate", "Vinyl", "Supplies", "Other"];
  const ORDER_VENDORS = ["Grimco", "Glantz", "JDS", "Kost", "Stock", "Other"];

  const needsRecordDestination = triggers.some(t => getTriggerSupportedActions(t.trigger_type) === RECORD_SUPPORTED_ACTIONS);
  const builderProblems = draftProblems(triggers, actions, needsRecordDestination);
  const applyAutomationPreset = (preset) => {
    const draft = draftFromPreset(preset);
    setFormData(draft.formData);
    setTriggers(draft.triggers);
    setActions(draft.actions);
    setAutomationSaveError("");
  };
  const groupedTriggers = TRIGGER_TYPES.filter(t => getTriggerSupportedActions(t.value)).reduce((acc, trigger) => {
    if (!acc[trigger.category]) acc[trigger.category] = [];
    acc[trigger.category].push(trigger);
    return acc;
  }, {});

  // Sort automations
  const sortedAutomations = [...automations].sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case "name":
        comparison = (a.name || "").localeCompare(b.name || "");
        break;
      case "trigger":
        const aTrigger = a.triggers?.[0]?.trigger_type || "";
        const bTrigger = b.triggers?.[0]?.trigger_type || "";
        const aTriggerLabel = TRIGGER_TYPES.find(t => t.value === aTrigger)?.category || aTrigger;
        const bTriggerLabel = TRIGGER_TYPES.find(t => t.value === bTrigger)?.category || bTrigger;
        comparison = aTriggerLabel.localeCompare(bTriggerLabel);
        break;
      case "action":
        const aAction = a.actions?.[0]?.action_type || "";
        const bAction = b.actions?.[0]?.action_type || "";
        const aActionLabel = ACTION_TYPES.find(t => t.value === aAction)?.label || aAction;
        const bActionLabel = ACTION_TYPES.find(t => t.value === bAction)?.label || bAction;
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

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDirection("asc");
    }
  };

  const renderRecordDestination = (config, index) => needsRecordDestination && (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
      <Label htmlFor={`record-destination-${index}`}>Destination Work Order *</Label>
      <Input id={`record-destination-${index}`} className="mt-1" value={config.target_work_order_id || ""}
        placeholder="Paste the Work Order link or ID"
        onChange={e => updateAction(index, "target_work_order_id", e.target.value)}
        onBlur={e => {
          const id = destinationWorkOrderId(e.target.value);
          if (id) updateAction(index, "target_work_order_id", id);
        }} />
      <p className="mt-1 text-xs text-blue-800">For record events, the task or note goes to this Work Order; saving verifies it is not in Trash. Work Order events in the same rule still use their original Work Order.</p>
    </div>
  );

  const renderActionConfig = (action, index) => {
    const config = action.action_config || {};
    
    switch (action.action_type) {
      case "send_email":
        return (
          <div className="space-y-3 mt-3 p-3 bg-white/50 rounded-lg">
            {/* AI Dynamic Email Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-500" />
                <div>
                  <Label className="text-sm font-medium">AI-Generated Email</Label>
                  <p className="text-xs text-gray-500">Dynamically generate email content based on actual order/work order data</p>
                </div>
              </div>
              <Switch 
                checked={config.use_ai === true} 
                onCheckedChange={(val) => updateAction(index, "use_ai", val)} 
              />
            </div>

            {config.use_ai && (
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100 text-xs text-purple-700">
                <div className="font-medium mb-1">How it works:</div>
                <p>When this automation triggers, AI will generate a personalized email using the actual data from the order/work order (customer name, description, items, dates, etc.) instead of using a fixed template.</p>
              </div>
            )}
            
            <div className="space-y-2">
              {(config.recipients || [{ type: "email", value: "" }]).map((recipient, rIndex) => (
                <div key={rIndex} className="flex gap-2">
                  <Select
                    value={recipient.type}
                    onValueChange={(val) => {
                      const newRecipients = [...(config.recipients || [{ type: "email", value: "" }])];
                      newRecipients[rIndex] = { ...newRecipients[rIndex], type: val };
                      updateAction(index, "recipients", newRecipients);
                    }}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECIPIENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}
                        disabled={needsRecordDestination && ["assigned_user", "creator"].includes(t.value)}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {recipient.type === "email" && (
                    <Input
                      placeholder="email@example.com"
                      value={recipient.value || ""}
                      onChange={(e) => {
                        const newRecipients = [...(config.recipients || [{ type: "email", value: "" }])];
                        newRecipients[rIndex] = { ...newRecipients[rIndex], value: e.target.value };
                        updateAction(index, "recipients", newRecipients);
                      }}
                      className="flex-1"
                    />
                  )}
                  {recipient.type === "email_group" && (
                    <Select
                      value={recipient.value || ""}
                      onValueChange={(val) => {
                        const newRecipients = [...(config.recipients || [{ type: "email", value: "" }])];
                        newRecipients[rIndex] = { ...newRecipients[rIndex], value: val };
                        updateAction(index, "recipients", newRecipients);
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select group" />
                      </SelectTrigger>
                      <SelectContent>
                        {emailGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => {
                const newRecipients = [...(config.recipients || []), { type: "email", value: "" }];
                updateAction(index, "recipients", newRecipients);
              }}>
                <Plus className="w-3 h-3 mr-1" /> Add Recipient
              </Button>
            </div>
            <Input
              placeholder="Email Subject"
              value={config.subject || ""}
              onChange={(e) => updateAction(index, "subject", e.target.value)}
            />
            <Textarea
              placeholder="Email Body"
              value={config.body || ""}
              onChange={(e) => updateAction(index, "body", e.target.value)}
              className="min-h-20"
            />
            {!config.use_ai && (
              <div className="flex flex-wrap gap-1">
                {TEMPLATE_VARIABLES.slice(0, 6).map(v => (
                  <Button key={v} variant="outline" size="sm" className="h-5 text-xs px-1"
                    onClick={() => updateAction(index, "body", (config.body || "") + v)}>
                    {v}
                  </Button>
                ))}
              </div>
            )}
          </div>
        );
      
      case "change_stage":
        return (
          <Select value={config.stage || ""} onValueChange={(val) => updateAction(index, "stage", val)}>
            <SelectTrigger className="mt-2"><SelectValue placeholder="Select stage" /></SelectTrigger>
            <SelectContent>
              {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      
      case "set_asap":
        return (
          <div className="flex items-center gap-2 mt-2">
            <Switch checked={config.asap === true} onCheckedChange={(val) => updateAction(index, "asap", val)} />
            <Label className="text-sm">{config.asap ? "Turn ASAP ON" : "Turn ASAP OFF"}</Label>
          </div>
        );
      
      case "assign_to":
        return (
          <Select value={config.assignee || ""} onValueChange={(val) => updateAction(index, "assignee", val)}>
            <SelectTrigger className="mt-2"><SelectValue placeholder="Select person" /></SelectTrigger>
            <SelectContent>
              {TEAM_MEMBERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      
      case "add_task":
        return <div className="space-y-2 mt-2">
          <Input aria-label="Task text" placeholder="What needs to be done?" value={config.task || ""} onChange={(e) => updateAction(index, "task", e.target.value)} />
          {renderRecordDestination(config, index)}
        </div>;
      
      case "add_note":
        return (
          <div className="space-y-2 mt-2">
            <Select value={config.note_type || "admin"} onValueChange={(val) => updateAction(index, "note_type", val)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["admin", "fabrication", "vinyl", "permitting", "design", "installation", "client", "other"].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea placeholder="Note text" value={config.note || ""} onChange={(e) => updateAction(index, "note", e.target.value)} />
            {renderRecordDestination(config, index)}
          </div>
        );
      
      case "set_due_date":
        return (
          <div className="flex gap-2 mt-2">
            <Input type="number" min="0" max="3650" step="1" placeholder="Days" value={config.days ?? ""} onChange={(e) => updateAction(index, "days", e.target.value)} className="w-20" />
            <Select value={config.direction || "after"} onValueChange={(val) => updateAction(index, "direction", val)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="after">days from today</SelectItem>
                <SelectItem value="before">days before today</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      
      case "create_rider":
        return (
          <div className="space-y-2 mt-2">
            <Input placeholder="Rider title (optional - defaults to 'Work order title - Rider')" value={config.title || ""} onChange={(e) => updateAction(index, "title", e.target.value)} />
            <Select value={config.rider_stage || ""} onValueChange={(val) => updateAction(index, "rider_stage", val)}>
              <SelectTrigger><SelectValue placeholder="Rider stage (defaults to current stage)" /></SelectTrigger>
              <SelectContent>
                {STAGES.filter(s => s.value !== "completed").map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="First task on the rider (optional)" value={config.task || ""} onChange={(e) => updateAction(index, "task", e.target.value)} />
            <p className="text-xs text-gray-500">The rider is named after its parent work order. If a rider with the same title already exists, a duplicate will not be created.</p>
          </div>
        );
      
      case "set_priority":
        return (
          <div className="flex items-center gap-2 mt-2">
            <Input type="number" placeholder="1" value={config.priority || ""} onChange={(e) => updateAction(index, "priority", e.target.value)} className="w-24" />
            <Label className="text-sm text-gray-600">Position in list - lower numbers sit higher</Label>
          </div>
        );
      
      default:
        return null;
    }
  };

  const handleFaceRecognized = async (recognizedUser, descriptor) => {
    const matched = allUsers.find(u => u.id === recognizedUser?.id || u.email === recognizedUser?.email);
    if (matched?.role !== 'admin') {
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
      if (!accessData?.success || !accessData?.capability || String(accessData?.user?.id || '') !== String(matched.id || '')) {
        throw new Error(accessData?.error || "Admin face could not be verified by the server.");
      }
      applyAdminAccess(accessData);
    } catch (error) {
      setPasswordError(error?.response?.data?.error || error?.message || "Admin face verification failed.");
    } finally {
      setIsVerifying(false);
    }
  };

  // Password protection screen
  if (!isUnlocked) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <div className="clay-card p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
              <Settings className="w-8 h-8 text-purple-700" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">Admin Settings</h2>
            <p className="text-sm text-gray-500 mt-1">Use Face ID or enter your credentials</p>
          </div>

          <div className="space-y-4">
            {/* Face Recognition - always visible, starts automatically */}
            <FaceRecognition
              allUsers={allUsers}
              onRecognized={handleFaceRecognized}
            />

            {passwordError && <p className="text-red-500 text-sm text-center">{passwordError}</p>}

            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">or enter credentials</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <div>
              <Label>Username</Label>
              <Input
                type="text"
                placeholder="Enter your username"
                value={usernameInput}
                onChange={(e) => { setUsernameInput(e.target.value); setPasswordError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                className="mt-1"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                placeholder="Enter your Time Clock password"
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                className="mt-1"
                autoComplete="new-password"
                data-lpignore="true"
                data-form-type="other"
              />
            </div>

            <Button
              onClick={handlePasswordSubmit}
              disabled={isVerifying}
              className="w-full clay-button border-none"
              style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}
            >
              {isVerifying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Unlock Admin Settings
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={adminScrollRef} data-admin-scroll-area className="min-h-full w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto p-3 sm:p-6">
      <div className="mx-auto w-full min-w-0 max-w-6xl pb-8">
        <Tabs value={selectedAdminTab} onValueChange={handleAdminTabChange} className="w-full min-w-0 max-w-full space-y-6">
          <div className="clay-card w-full min-w-0 max-w-full rounded-xl border border-red-200/70 p-2" style={{ background: '#FEE2E2' }}>
            <AdminSettingsSearch isAdmin={isAdmin} currentUser={currentUser} onNavigate={handleAdminTabChange} />
            {capabilityExpiryLabel && (
              <p data-admin-capability-expiry className="px-2 pb-1 text-right text-[11px] font-medium text-red-900/60">
                Admin authorization expires at {capabilityExpiryLabel}
              </p>
            )}
            <div ref={categoryScrollerRef} role="group" aria-label="Admin navigation categories" className="flex w-full min-w-0 max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto overscroll-x-contain border-b border-red-200/70 pb-2 [scrollbar-width:thin]">
              {availableAdminGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  data-admin-category={group.id}
                  aria-pressed={activeAdminGroup.id === group.id}
                  onClick={() => {
                    if (activeAdminGroup.id !== group.id) handleAdminTabChange(group.tabs[0].value);
                  }}
                  onKeyDown={(event) => {
                    const index = availableAdminGroups.findIndex((entry) => entry.id === group.id);
                    const targetIndex = getAdminCategoryKeyboardTarget(event.key, index, availableAdminGroups.length);
                    if (targetIndex === null) return;
                    event.preventDefault();
                    event.currentTarget.parentElement?.querySelectorAll("[data-admin-category]")[targetIndex]?.focus();
                  }}
                  className={`inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${activeAdminGroup.id === group.id ? "border-red-200 bg-white text-gray-900 shadow-sm" : "border-transparent bg-white/30 text-gray-700 hover:border-red-200 hover:bg-white/70"}`}
                >
                  {group.label}
                </button>
              ))}
            </div>
            <TabsList aria-label={`Admin ${activeAdminGroup.label} pages`} className="mt-2 grid h-auto min-h-10 w-full min-w-0 max-w-full grid-cols-2 items-stretch gap-1 bg-transparent p-1 sm:grid-cols-3 lg:grid-cols-4">
              {activeAdminGroup.tabs.map((tab) => {
                const TabIcon = ADMIN_TAB_ICONS[tab.value];
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="min-h-11 min-w-0 max-w-full gap-2 whitespace-normal break-words px-2 py-2 text-center text-xs sm:px-3 sm:text-sm focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 data-[state=active]:bg-white/80"
                  >
                    {TabIcon && <TabIcon className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    <span>{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <AdminPanelContent value="users">
            <UserManagement />
          </AdminPanelContent>

          {isAdmin && (
            <>
              <AdminPanelContent value="timeclock">
                <Tabs value={selectedAdminTab === "timeclock" ? selectedAdminSubtab : "entries"} onValueChange={(nextSubtab) => handleAdminTabChange("timeclock", nextSubtab)} className="min-w-0 space-y-4">
                  <TabsList ref={(node) => { nestedTabListsRef.current.timeclock = node; }} aria-label="Time Clock administration" className="grid h-auto min-h-10 w-full min-w-0 max-w-full grid-cols-2 items-stretch gap-1 p-1 sm:grid-cols-4">
                    <TabsTrigger value="entries" className="min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">Time Entries</TabsTrigger>
                    <TabsTrigger value="reports" className="min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">Reports</TabsTrigger>
                    <TabsTrigger value="pto" className="min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">PTO Policies</TabsTrigger>
                    <TabsTrigger value="overtime" className="min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">Overtime Rules</TabsTrigger>
                  </TabsList>
                  <AdminPanelContent value="entries">
                    <TimeClockAdmin />
                  </AdminPanelContent>
                  <AdminPanelContent value="reports">
                    <TimeClockReportsDashboard />
                  </AdminPanelContent>
                  <AdminPanelContent value="pto">
                    <PTOManagement />
                  </AdminPanelContent>
                  <AdminPanelContent value="overtime">
                    <OvertimeRulesManager />
                  </AdminPanelContent>
                </Tabs>
              </AdminPanelContent>

              <AdminPanelContent value="backend">
                <Tabs value={selectedAdminTab === "backend" ? selectedAdminSubtab : "backup"} onValueChange={(nextSubtab) => handleAdminTabChange("backend", nextSubtab)} className="min-w-0 space-y-4">
                  <TabsList ref={(node) => { nestedTabListsRef.current.backend = node; }} aria-label="Backend administration" className="grid h-auto min-h-10 w-full min-w-0 max-w-full grid-cols-2 items-stretch gap-1 p-1 sm:grid-cols-3 lg:grid-cols-4">
                    <TabsTrigger value="backup" className="min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">Data Backup</TabsTrigger>
                    <TabsTrigger value="client_trash" className="min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">Client Trash</TabsTrigger>
                    <TabsTrigger value="order_trash" className="min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">Order Trash</TabsTrigger>
                    <TabsTrigger value="default_sort" className="min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">Default Sort</TabsTrigger>
                    <TabsTrigger value="wip_import" className="min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">WIP Import</TabsTrigger>
                    <TabsTrigger value="permitting" className="min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">Permitting Repository</TabsTrigger>
                    <TabsTrigger value="monitoring" className="min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">Jurisdiction Monitoring</TabsTrigger>
                    <TabsTrigger value="scheduled_jobs" className="min-h-11 min-w-0 max-w-full whitespace-normal break-words px-2 py-2 text-center focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">Scheduled Jobs</TabsTrigger>
                  </TabsList>
                    <AdminPanelContent value="backup">
                    <BackupManager />
                  </AdminPanelContent>
                  <AdminPanelContent value="client_trash">
                    <ProjectTrash />
                  </AdminPanelContent>
                  <AdminPanelContent value="order_trash">
                    <OrderTrash />
                  </AdminPanelContent>
                  <AdminPanelContent value="default_sort">
                    <SalesPipelineDefaultSort />
                  </AdminPanelContent>
                  <AdminPanelContent value="wip_import">
                    <WipImporter />
                  </AdminPanelContent>
                  <AdminPanelContent value="permitting">
                    <PermittingRepositoryAdmin />
                  </AdminPanelContent>
                  <AdminPanelContent value="monitoring">
                    <JurisdictionMonitoringSettings />
                  </AdminPanelContent>
                  <AdminPanelContent value="scheduled_jobs">
                    <WorkflowSchedulesPanel />
                  </AdminPanelContent>
                  </Tabs>
                  </AdminPanelContent>

              <AdminPanelContent value="fleet">
                <FleetSettings embedded />
              </AdminPanelContent>

              <AdminPanelContent value="corebridge">
                <CorebridgeApiSettings sessionToken={sessionToken} />
              </AdminPanelContent>

              <AdminPanelContent value="opportunity_bridge">
                <OpportunityBridgeReview />
              </AdminPanelContent>

              <AdminPanelContent value="permitting_completeness">
                <PermittingCompletenessDashboard />
              </AdminPanelContent>
              <AdminPanelContent value="permitting_rules">
                <PermittingRulesReview sessionToken={sessionToken} />
              </AdminPanelContent>
              <AdminPanelContent value="permitting_tests">
                <div className="mb-3 flex justify-end">
                  <a href="/PermittingDocs" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100">
                    <BookOpen className="h-4 w-4" />
                    Staff Guide (opens new tab)
                  </a>
                </div>
                <PermittingTestSuite />
              </AdminPanelContent>

              <AdminPanelContent value="smartsheet">
                <SmartsheetSyncSettings sessionToken={sessionToken} />
              </AdminPanelContent>
              <AdminPanelContent value="sync_conflicts"><SyncConflictReview sessionToken={sessionToken}/></AdminPanelContent>
            </>
          )}

          <AdminPanelContent value="task_assignments">
            <TaskAssignmentRules />
          </AdminPanelContent>

          <AdminPanelContent value="calendar">
            <AdminCalendarSettings />
          </AdminPanelContent>

          <AdminPanelContent value="activity">
            <ActivityFeed />
          </AdminPanelContent>

          {isAdmin && (
            <AdminPanelContent value="resources">
              <ResourceAllocationView />
            </AdminPanelContent>
          )}

          <AdminPanelContent value="automations">
            {ordinaryAutomationRecovery}
            {!isLoading && !automationLoadError && automationRecoveryListVerified && (
              <div role="status" aria-label="Automation recovery list verified"
                className="mb-4 rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-950">
                The Automation list was refreshed from the complete, read-only acknowledgment snapshot.
                This confirms the displayed list at the time of the read, not which request saved the rule.
              </div>
            )}
            {!isDialogOpen && uncertainAutomationReview}
            {automationDraftParked && !isDialogOpen && (
              <div role="status" aria-label="Unsaved Automation draft" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-semibold">Unsaved Automation draft is still here</p>
                <p className="mt-1">Resume editing or discard this draft. Nothing was saved or retried automatically.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => { setIsDialogOpen(true); setAutomationDraftParked(false); }}
                    disabled={automationSaveInFlight.current} className="min-h-10 border-amber-500 bg-white">
                    Resume Automation draft
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={discardAutomationDraft}
                    disabled={automationSaveInFlight.current || !!automationUncertain} className="min-h-10 border-amber-500 bg-white">
                    Discard Automation draft
                  </Button>
                </div>
              </div>
            )}
            {/* Email Groups Section - moved under Automations */}
            <div className="mb-8">
              <GmailConnector sessionToken={sessionToken} />
              <div className="mt-6">
                <EmailGroupsManager />
              </div>
            </div>

            {emailGroupsLoadError && (
              <div role="alert" aria-label="Automation email groups unavailable" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <div className="font-semibold">Automation email group choices could not be loaded</div>
                <p className="mt-1">Rule editing is paused until recipient groups can be verified.</p>
                <Button type="button" size="sm" variant="outline" disabled={emailGroupsLoading}
                  className="mt-2 min-h-10 border-amber-500 bg-white text-amber-950"
                  onClick={() => { void loadEmailGroups(); }}>Retry group choices</Button>
              </div>
            )}

            {automationSaveError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">Automation update blocked</div>
                  <div className="mt-1 text-xs">{automationSaveError}</div>
                </div>
                <Button type="button" size="sm" variant="outline" className="shrink-0 border-red-300 bg-white text-red-800" onClick={async () => { const refreshed = await loadAutomations(); if (refreshed) setAutomationSaveError(""); }}>Reload rules</Button>
              </div>
            )}

            <div className="flex justify-between items-center mb-4">
              {/* Sort Controls */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Sort by:</span>
                <div className="flex gap-1">
                  <Button 
                    variant={sortBy === "name" ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => handleSort("name")}
                    className={`h-7 text-xs ${sortBy === "name" ? "bg-purple-100 text-purple-700 border-purple-200" : ""}`}
                  >
                    Name {sortBy === "name" && <SortAsc className={`w-3 h-3 ml-1 ${sortDirection === "desc" ? "rotate-180" : ""}`} />}
                  </Button>
                  <Button 
                    variant={sortBy === "trigger" ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => handleSort("trigger")}
                    className={`h-7 text-xs ${sortBy === "trigger" ? "bg-orange-100 text-orange-700 border-orange-200" : ""}`}
                  >
                    Trigger Type {sortBy === "trigger" && <SortAsc className={`w-3 h-3 ml-1 ${sortDirection === "desc" ? "rotate-180" : ""}`} />}
                  </Button>
                  <Button 
                    variant={sortBy === "action" ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => handleSort("action")}
                    className={`h-7 text-xs ${sortBy === "action" ? "bg-blue-100 text-blue-700 border-blue-200" : ""}`}
                  >
                    Action Type {sortBy === "action" && <SortAsc className={`w-3 h-3 ml-1 ${sortDirection === "desc" ? "rotate-180" : ""}`} />}
                  </Button>
                  <Button 
                    variant={sortBy === "enabled" ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => handleSort("enabled")}
                    className={`h-7 text-xs ${sortBy === "enabled" ? "bg-green-100 text-green-700 border-green-200" : ""}`}
                  >
                    Status {sortBy === "enabled" && <SortAsc className={`w-3 h-3 ml-1 ${sortDirection === "desc" ? "rotate-180" : ""}`} />}
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => { void loadAutomations(); }}
                  disabled={isLoading} aria-label="Refresh Automation rules (read-only)">
                  Refresh rules
                </Button>
              <Button onClick={openNewRule} disabled={isLoading || automationLoadError || emailGroupsLoading || emailGroupsLoadError} className="clay-button border-none text-gray-800"
                style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
                <Plus className="w-5 h-5 mr-2" /> New Automation
              </Button>
              </div>
            </div>

            {/* Stats are authoritative only after a complete successful read. */}
            {!isLoading && !automationLoadError && <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="clay-card p-4">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-purple-600" />
                  <div>
                    <p className="text-2xl font-bold text-gray-800">{automations.length}</p>
                    <p className="text-xs text-gray-500">Total Automations</p>
                  </div>
                </div>
              </div>
              <div className="clay-card p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold text-gray-800">{automations.filter(a => a.enabled).length}</p>
                    <p className="text-xs text-gray-500">Active</p>
                  </div>
                </div>
              </div>
              <div className="clay-card p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  <div>
                    <p className="text-2xl font-bold text-gray-800">{automations.filter(a => !a.enabled).length}</p>
                    <p className="text-xs text-gray-500">Disabled</p>
                  </div>
                </div>
              </div>
            </div>}

            {/* Automations List */}
            {isLoading ? (
              <div className="clay-card p-12 text-center"><p className="text-gray-500">Loading...</p></div>
            ) : automationLoadError ? (
              <div role="alert" aria-label="Automation rules unavailable" className="clay-card rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
                <h3 className="font-semibold">Automation rules could not be loaded</h3>
                <p className="mt-1 text-sm">
                  The current rule list could not be verified. An earlier verified snapshot, if any,
                  is not being shown as current. Editing is paused until a complete read succeeds.
                  No Automation write was retried.
                </p>
                <Button type="button" size="sm" variant="outline" disabled={isLoading}
                  onClick={() => { void loadAutomations(); }}
                  className="mt-3 min-h-10 border-amber-500 bg-white text-amber-950">
                  Retry loading rules
                </Button>
              </div>
            ) : automations.length === 0 ? (
              <div className="clay-card p-12 text-center">
                <Zap className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">No Automations</h3>
                <p className="text-gray-500 mb-4">Create your first automation to streamline your workflow</p>
                <Button onClick={openNewRule} disabled={emailGroupsLoading || emailGroupsLoadError} className="clay-button"><Plus className="w-4 h-4 mr-2" /> Create First Automation</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedAutomations.map((rule) => (
                  <div key={rule.id} className={`clay-card p-4 ${!rule.enabled ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium text-gray-800">{rule.name}</h4>
                          <Badge className="text-xs" style={{ background: rule.enabled ? 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' : '#E5E7EB' }}>
                            {rule.triggers?.length || 1} trigger{(rule.triggers?.length || 1) > 1 ? 's' : ''}
                          </Badge>
                          <Badge className="text-xs" style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #FFD6E8 100%)' }}>
                            {rule.actions?.length || 0} action{(rule.actions?.length || 0) !== 1 ? 's' : ''}
                          </Badge>
                          {!ruleIsRunnable(rule) && (
                            <Badge className="text-xs bg-amber-100 text-amber-800 border border-amber-300">
                              Won't run - not wired yet
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                          {rule.triggers?.slice(0, 2).map((t, i) => (
                            <span key={i} className="bg-orange-50 px-2 py-1 rounded">
                              {TRIGGER_TYPES.find(tt => tt.value === t.trigger_type)?.label || t.trigger_type}
                            </span>
                          ))}
                          {(rule.triggers?.length || 0) > 2 && <span className="text-gray-400">+{rule.triggers.length - 2} more</span>}
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                          {rule.actions?.slice(0, 2).map((a, i) => (
                            <span key={i} className="bg-blue-50 px-2 py-1 rounded">
                              {ACTION_TYPES.find(at => at.value === a.action_type)?.label || a.action_type}
                            </span>
                          ))}
                          {(rule.actions?.length || 0) > 2 && <span className="text-gray-400">+{rule.actions.length - 2} more</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch aria-label={`Toggle ${rule.name}`} disabled={!!automationOperation || automationSaving || !!automationUncertain} checked={rule.enabled} onCheckedChange={() => toggleEnabled(rule)} />
                        <Button variant="ghost" size="icon" aria-label={`Duplicate ${rule.name}`} disabled={emailGroupsLoading || emailGroupsLoadError} onClick={() => duplicateRule(rule)} className="h-8 w-8">
                          <Copy className="w-4 h-4 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Edit ${rule.name}`} disabled={emailGroupsLoading || emailGroupsLoadError} onClick={() => openEditRule(rule)} className="h-8 w-8">
                          <Edit className="w-4 h-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Delete ${rule.name}`} disabled={!!automationOperation || automationSaving || !!automationUncertain} onClick={() => setDeleteConfirm(rule)} className="h-8 w-8">
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminPanelContent>
        </Tabs>

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={closeAutomationEditor}>
          <DialogContent className="clay-card border-none max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                {editingRule ? "Edit Automation" : "Create Automation"}
              </DialogTitle>
            </DialogHeader>

            {ordinaryAutomationRecovery}
            {uncertainAutomationReview}
            <fieldset disabled={automationSaving} className="min-w-0 space-y-6 mt-4">
              {!editingRule && !formData.name && !triggers[0]?.trigger_type && (
                <section aria-label="Automation starters" className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <h3 className="font-semibold text-blue-950">Start with an example</h3>
                  <p className="mt-1 text-sm text-blue-800">Pick one, review it, then save. Examples start disabled so you can check them before turning them on.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {AUTOMATION_PRESETS.map(preset => (
                      <Button key={preset.trigger} variant="outline" className="h-auto justify-start whitespace-normal text-left"
                        onClick={() => applyAutomationPreset(preset)}>{preset.name}</Button>
                    ))}
                  </div>
                </section>
              )}
              {/* Name & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Automation Name *</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Auto-assign fabrication jobs" className="mt-1" />
                </div>
                <div>
                  <Label>Priority (lower = first)</Label>
                  <Input type="number" value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })} className="mt-1" />
                </div>
              </div>

              {/* IF - Triggers */}
              <div className="clay-card p-4 bg-gradient-to-r from-orange-50 to-yellow-50">
                <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-orange-100 text-orange-700 font-bold px-3 py-1 rounded-lg text-sm">WHEN</div>
                          <span className="text-gray-600 text-sm">this happens...</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={addTrigger} className="h-7 text-xs">
                          <Plus className="w-3 h-3 mr-1" /> Add Trigger
                        </Button>
                      </div>
                
                <div className="space-y-4">
                  {triggers.map((trigger, index) => (
                    <div key={index} className={index > 0 ? 'pt-4 border-t border-orange-200' : ''}>
                      {index > 0 && (
                                                    <div className="flex items-center justify-between mb-2">
                                                      <Select value={trigger.logic || "or"} onValueChange={(val) => updateTrigger(index, "logic", val)}>
                                                        <SelectTrigger className="w-20 h-6 text-xs text-orange-600 font-medium border-orange-200">
                                                          <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                          <SelectItem value="or">OR</SelectItem>
                                                          <SelectItem value="and">AND</SelectItem>
                                                        </SelectContent>
                                                      </Select>
                                                      <Button variant="ghost" size="icon" onClick={() => removeTrigger(index)} className="h-6 w-6">
                                                        <Trash2 className="w-3 h-3 text-red-600" />
                                                      </Button>
                                                    </div>
                                                  )}
                      <Select value={trigger.trigger_type} onValueChange={(val) => updateTrigger(index, "trigger_type", val)}>
                        <SelectTrigger><SelectValue placeholder="Select trigger" /></SelectTrigger>
                        <SelectContent>
                          {trigger.trigger_type && !getTriggerSupportedActions(trigger.trigger_type) && (
                            <SelectItem value={trigger.trigger_type} disabled>
                              {TRIGGER_TYPES.find(t => t.value === trigger.trigger_type)?.label || trigger.trigger_type} (not working yet)
                            </SelectItem>
                          )}
                          {Object.entries(groupedTriggers).map(([category, list]) => (
                            <div key={category}>
                              <div className="px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-100">{category}</div>
                              {list.map(t => <SelectItem key={t.value} value={t.value}>{t.label}{getTriggerSupportedActions(t.value) ? "" : " (not working yet)"}</SelectItem>)}
                            </div>
                          ))}
                        </SelectContent>
                      </Select>

                      {getTriggerNeedsStage(trigger.trigger_type) && (
                        <Select value={trigger.trigger_condition.stage || ""} onValueChange={(val) => updateTrigger(index, "stage", val)}>
                          <SelectTrigger className="mt-2"><SelectValue placeholder="Select stage" /></SelectTrigger>
                          <SelectContent>{STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                        </Select>
                      )}

                      {getTriggerNeedsFromTo(trigger.trigger_type) && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <Select value={trigger.trigger_condition.from_stage || ""} onValueChange={(val) => updateTrigger(index, "from_stage", val)}>
                            <SelectTrigger><SelectValue placeholder="From stage" /></SelectTrigger>
                            <SelectContent><SelectItem value={null}>Any</SelectItem>{STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                          </Select>
                          <Select value={trigger.trigger_condition.to_stage || ""} onValueChange={(val) => updateTrigger(index, "to_stage", val)}>
                            <SelectTrigger><SelectValue placeholder="To stage" /></SelectTrigger>
                            <SelectContent><SelectItem value={null}>Any</SelectItem>{STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      )}

                      {(WORKFLOW_ENGINE_TRIGGER_SET.has(trigger.trigger_type) || DEADLINE_TRIGGER_SET.has(trigger.trigger_type)) && (
                        <div className="flex flex-wrap gap-4 mt-2 pt-2 border-t border-orange-100">
                          <div className="flex items-center gap-1">
                            <Switch checked={trigger.trigger_condition.is_asap === true} onCheckedChange={(v) => updateTrigger(index, "is_asap", v || undefined)} />
                            <Label className="text-xs">ASAP Only</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-gray-500">Apply to:</Label>
                            <Select 
                              value={trigger.trigger_condition.is_rider === true ? "riders" : trigger.trigger_condition.is_rider === false ? "workorders" : "all"} 
                              onValueChange={(val) => {
                                if (val === "all") updateTrigger(index, "is_rider", undefined);
                                else if (val === "riders") updateTrigger(index, "is_rider", true);
                                else updateTrigger(index, "is_rider", false);
                              }}
                            >
                              <SelectTrigger className="h-6 w-36 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                <SelectItem value="workorders">Work Orders Only</SelectItem>
                                <SelectItem value="riders">Riders Only</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      {getTriggerSupportedActions(trigger.trigger_type) === RECORD_SUPPORTED_ACTIONS &&
                        ["is_asap", "is_rider", "stage", "assigned_to", "from_stage", "to_stage"].some(key => trigger.trigger_condition[key] != null) && (
                        <div role="status" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                          This saved event has Work Order filters that do not describe this record.
                          <Button variant="outline" size="sm" className="mt-2" onClick={() => setTriggers(current => current.map((item, i) =>
                            i !== index ? item : { ...item, trigger_condition: Object.fromEntries(Object.entries(item.trigger_condition).filter(([key]) =>
                              !["is_asap", "is_rider", "stage", "assigned_to", "from_stage", "to_stage"].includes(key))) }))}>
                            Remove incompatible filters
                          </Button>
                        </div>
                      )}

                      {getTriggerSupportedActions(trigger.trigger_type) === RECORD_SUPPORTED_ACTIONS && recordFilterFields(trigger.trigger_type).length > 0 && (
                        <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-3">
                          <p className="mb-2 text-xs font-semibold text-orange-900">IF (optional) - only when these fields match</p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {recordFilterFields(trigger.trigger_type).map(([key, label, values]) => (
                              <div key={key}>
                                <Label htmlFor={`record-filter-${index}-${key}`} className="text-xs">{label}</Label>
                                {values ? (
                                  <select id={`record-filter-${index}-${key}`} className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm"
                                    value={trigger.trigger_condition[key] || ""} onChange={e => updateTrigger(index, key, e.target.value || undefined)}>
                                    <option value="">Any</option>
                                    {values.map(value => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}
                                  </select>
                                ) : (
                                  <Input id={`record-filter-${index}-${key}`} className="mt-1" placeholder="Any"
                                    value={trigger.trigger_condition[key] || ""} onChange={e => updateTrigger(index, key, e.target.value || undefined)} />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Order-specific filters */}
                      {getTriggerIsOrderType(trigger.trigger_type) && (
                        <div className="mt-3 p-3 bg-orange-50/50 rounded-lg border border-orange-100 space-y-3">
                          <div className="text-xs font-medium text-orange-700 mb-2">Order Filters (optional - leave empty for all)</div>
                          
                          {/* Request Type Filter */}
                          <div>
                            <Label className="text-xs text-gray-600">Request Type</Label>
                            <Select 
                              value={trigger.trigger_condition.request_type || ""} 
                              onValueChange={(val) => updateTrigger(index, "request_type", val || undefined)}
                            >
                              <SelectTrigger className="mt-1 h-8 text-sm">
                                <SelectValue placeholder="Any request type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={null}>Any</SelectItem>
                                {ORDER_REQUEST_TYPES.map(t => (
                                  <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Vendor Filter */}
                          <div>
                            <Label className="text-xs text-gray-600">Vendor</Label>
                            <Select 
                              value={trigger.trigger_condition.vendor || ""} 
                              onValueChange={(val) => updateTrigger(index, "vendor", val || undefined)}
                            >
                              <SelectTrigger className="mt-1 h-8 text-sm">
                                <SelectValue placeholder="Any vendor" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={null}>Any</SelectItem>
                                {ORDER_VENDORS.map(v => (
                                  <SelectItem key={v} value={v}>{v}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Quantity Filter */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs text-gray-600">Min Quantity</Label>
                              <Input
                                type="number"
                                min="0"
                                placeholder="Any"
                                value={trigger.trigger_condition.min_quantity ?? ""}
                                onChange={(e) => updateTrigger(index, "min_quantity", e.target.value ? parseInt(e.target.value) : undefined)}
                                className="mt-1 h-8 text-sm"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-gray-600">Max Quantity</Label>
                              <Input
                                type="number"
                                min="0"
                                placeholder="Any"
                                value={trigger.trigger_condition.max_quantity ?? ""}
                                onChange={(e) => updateTrigger(index, "max_quantity", e.target.value ? parseInt(e.target.value) : undefined)}
                                className="mt-1 h-8 text-sm"
                              />
                            </div>
                          </div>

                          {/* Requestor Filter */}
                          <div>
                            <Label className="text-xs text-gray-600">Requestor</Label>
                            <Select 
                              value={trigger.trigger_condition.requestor || ""} 
                              onValueChange={(val) => updateTrigger(index, "requestor", val || undefined)}
                            >
                              <SelectTrigger className="mt-1 h-8 text-sm">
                                <SelectValue placeholder="Any requestor" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={null}>Any</SelectItem>
                                {TEAM_MEMBERS.map(m => (
                                  <SelectItem key={m} value={m}>{m}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {triggerHasOrderFilters(trigger.trigger_condition) && (
                            <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2">
                              Filters set - this rule only runs for orders matching them.
                            </div>
                          )}
                        </div>
                      )}

                      {trigger.trigger_type && !getTriggerSupportedActions(trigger.trigger_type) && (
                        <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                          This trigger isn't connected to anything yet, so a rule using it won't run.
                        </div>
                      )}
                    </div>
                  ))}

                  {triggers.some(t => t.logic === "and") && new Set(triggers.map(t => t.trigger_type).filter(Boolean)).size > 1 && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                      AND only works when the triggers can happen at the same moment - different events each happen one at a time, so this combination may never match. Use OR, or pick triggers that can match together.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-center"><ArrowDown className="w-6 h-6 text-gray-400" /></div>

              {/* THEN - Actions */}
              <div className="clay-card p-4 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded-lg text-sm">THEN</div>
                    <span className="text-gray-600 text-sm">do all of these...</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={addAction} className="h-7 text-xs">
                    <Plus className="w-3 h-3 mr-1" /> Add Action
                  </Button>
                </div>

                <div className="space-y-4">
                  {actions.map((action, index) => {
                    const actionType = ACTION_TYPES.find(t => t.value === action.action_type);
                    return (
                      <div key={index} className={index > 0 ? 'pt-4 border-t border-blue-200' : ''}>
                        {index > 0 && (
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-blue-600 font-medium">AND</span>
                            <Button variant="ghost" size="icon" onClick={() => removeAction(index)} className="h-6 w-6">
                              <Trash2 className="w-3 h-3 text-red-600" />
                            </Button>
                          </div>
                        )}
                        <Select value={action.action_type} onValueChange={(val) => updateAction(index, "action_type", val)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select action" />
                          </SelectTrigger>
                          <SelectContent>
                            {ACTION_TYPES.filter(t => actionRunsForTriggers(t.value, triggers) || t.value === action.action_type).map(t => (
                              <SelectItem key={t.value} value={t.value} disabled={!actionRunsForTriggers(t.value, triggers)}>
                                <div className="flex items-center gap-2">
                                  <t.icon className="w-4 h-4" />
                                  {t.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {renderActionConfig(action, index)}
                        {action.action_type && triggers.some(t => t.trigger_type) && !actionRunsForTriggers(action.action_type, triggers) && (
                          <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                            This action can't run for the selected trigger(s) yet - it will be skipped.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {triggers[0]?.trigger_type && actions[0]?.action_type && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700">
                  <span className="font-medium">In plain terms: </span>
                  {describeAutomation(triggers, actions)}
                </div>
              )}

              {automationSaveError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                  <div className="font-medium">Automation save blocked</div>
                  <div className="mt-1 text-xs">{automationSaveError}</div>
                </div>
              )}
              {builderProblems.length > 0 && triggers[0]?.trigger_type && (
                <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-medium">Before saving:</p>
                  {builderProblems.map(problem => <p key={problem} className="mt-1">{problem}</p>)}
                </div>
              )}

              {/* Validation Messages */}
              {(!formData.name || !triggers[0]?.trigger_type || !actions[0]?.action_type) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-1">
                    <AlertTriangle className="w-4 h-4" />
                    Missing required fields:
                  </div>
                  <ul className="text-xs text-amber-600 list-disc list-inside space-y-0.5">
                    {!formData.name && <li>Automation name is required</li>}
                    {!triggers[0]?.trigger_type && <li>At least one trigger must be selected</li>}
                    {!actions[0]?.action_type && <li>At least one action must be selected</li>}
                  </ul>
                </div>
              )}

              {/* Save */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" disabled={automationSaving} onClick={() => closeAutomationEditor(false)}>Close editor</Button>
                {!automationUncertain && <Button variant="outline" disabled={automationSaving} onClick={discardAutomationDraft}>Discard draft</Button>}
                <Button onClick={handleSave} disabled={builderProblems.length > 0 || !!automationUncertain || automationSaving || !!automationOperation || emailGroupsLoading || emailGroupsLoadError || !formData.name || !triggers[0]?.trigger_type || !actions[0]?.action_type}
                  className="clay-button border-none" style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
                  {automationSaving ? "Saving..." : `${editingRule ? "Update" : "Create"} Automation`}
                </Button>
              </div>
            </fieldset>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <AlertDialogContent className="clay-card border-none">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Automation?</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to delete "{deleteConfirm?.name}"?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={!!automationOperation || automationSaving || !!automationUncertain} onClick={() => handleDelete(deleteConfirm)} className="bg-red-600 text-white">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}