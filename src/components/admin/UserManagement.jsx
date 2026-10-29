import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { setPassword as setPasswordFn } from "@/functions/setPassword";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Users,
  Plus,
  Edit,
  Trash2,
  User as UserIcon,
  UserPlus,
  Crown,
  Loader2,
  Briefcase,
  Key,
  Send,
  Camera,
  Scan,
  ShieldCheck,
  Clock,
  ShieldAlert
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import UserQRCode from "@/components/timeclock/UserQRCode";
import FaceEnrollmentDialog from "@/components/timeclock/FaceEnrollmentDialog";
import AdminAccessDialog from "@/components/admin/AdminAccessDialog";
import { getAdminAccessSummary, getAccessibleAdminTab, ADMIN_TAB_GROUPS } from "@/components/admin/adminTabNavigation";
import UserHRDataForm from "@/components/user/UserHRDataForm";
import { createAdminAccountDraft, getChangedAdminAccountFields, hasUnsavedAdminAccountDraft } from "./adminAccountDraft.js";
import { compareUnverifiedAccountSave, rebaseAppliedAccountDraft, isSameVerifiedAccountSnapshot } from "./unverifiedAccountSave.js";
import { planAccountFieldResolution } from "./accountFieldResolution.js";
import { rejectedAdminAccountField } from "./accountSaveConflict.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createAuthorizedUserAdmin,
  deleteAuthorizedUserAdmin,
  getAccountDeletionImpactAdmin,
  getUserDeletionImpactAdmin,
  listAccountDeletionRequestsAdmin,
  listAuthorizedUsersAdmin,
  resolveAccountDeletionRequestAdmin,
  updateAuthorizedUserAdmin,
  updateAuthorizedUserHrAdmin,
} from "@/components/admin/authorizedUserAdminPersistence";
import { getDeletionImpactRetryState } from "@/components/admin/deletionImpactRetryCoordinator";
import { triggerNotification } from "@/components/workflow/NotificationService";

export default function UserManagement() {
  const { sessionToken, currentUser } = useAuth();
  const selfEmail = (currentUser?.email || "").toLowerCase();
  // Track the identity on render, before effects run, to fence late responses.
  const activeSessionToken = useRef(sessionToken);
  activeSessionToken.current = sessionToken;
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userDirectoryError, setUserDirectoryError] = useState(false);
  const userLoadSequence = useRef(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteImpact, setDeleteImpact] = useState(null);
  const [deleteImpactError, setDeleteImpactError] = useState("");
  const [importRows, setImportRows] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [lastDeletedUser, setLastDeletedUser] = useState(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [deletionSaving, setDeletionSaving] = useState(false);
  const deletionInFlight = useRef(false);
  const deletionOwner = useRef(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviteManager, setInviteManager] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const inviteInFlight = useRef(false);
  const inviteOwner = useRef(null);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  const [formData, setFormData] = useState({
    full_name: "",
    username: "",
    password_hash: "",
    role: "user",
    sales_roles: ["Task Assigned"],
    can_import_export: false,
    can_order_export: false,
    can_view_resources: false,
    employment_type: "hourly",
    can_work_pause: false
  });
  const activeAccountDraft = useRef(formData);
  activeAccountDraft.current = formData;
  // Keep an immediate draft reference for Account editor events. State renders
  // may be batched while a successful Save is awaiting its final directory read.
  const changeAccountDraft = changes => {
    const next = { ...activeAccountDraft.current, ...changes };
    activeAccountDraft.current = next;
    setFormData(next);
  };
  const [sendingPasswordReset, setSendingPasswordReset] = useState(null);
  const passwordResetInFlight = useRef(false);
  const passwordResetOwner = useRef(null);
  const [sendingOnboardingEmail, setSendingOnboardingEmail] = useState(null);
  const onboardingResendInFlight = useRef(false);
  const onboardingResendOwner = useRef(null);
  const [faceEnrollUser, setFaceEnrollUser] = useState(null);
  const [accessUser, setAccessUser] = useState(null);
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all"); // all | admin | user | full_admin
  const [userSort, setUserSort] = useState("name"); // name | name_desc | email | role
  const [selectedUserIds, setSelectedUserIds] = useState(() => new Set());
  const [bulkRoleBusy, setBulkRoleBusy] = useState(false);
  const [bulkRoleError, setBulkRoleError] = useState("");
  const [userMutationError, setUserMutationError] = useState("");
  const [userMutationSaving, setUserMutationSaving] = useState(false);
  const [accountSaveRecovery, setAccountSaveRecovery] = useState(null);
  const [accountWriteRecovery, setAccountWriteRecovery] = useState(null);
  const [confirmAccountReconciliation, setConfirmAccountReconciliation] = useState(false);
  const [accountFieldChoices, setAccountFieldChoices] = useState({});
  const [passwordRetryConfirmed, setPasswordRetryConfirmed] = useState(false);
  const [accountSaveNotice, setAccountSaveNotice] = useState("");
  const [postSaveRefreshPending, setPostSaveRefreshPending] = useState(null);
  const userUpdateInFlight = useRef(false);
  const userUpdateOwner = useRef(null);
  const hrSaveInFlight = useRef(false);
  const hrSaveOwner = useRef(null);
  const [hrMutationSaving, setHrMutationSaving] = useState(false);
  const hrReloadOwner = useRef(null);
  const hrReloadInFlight = useRef(false);
  const [hrReloadLoading, setHrReloadLoading] = useState(false);
  const [hasUnsavedHrData, setHasUnsavedHrData] = useState(false);
  const hrDraftStatus = useRef(null);
  // Exit confirmation guards both confidential HR and Account-tab drafts.
  const [pendingHrExit, setPendingHrExit] = useState(null);
  const accountDraftBaseline = useRef(null);
  const activeEditingUser = useRef(editingUser);
  activeEditingUser.current = editingUser;
  const recordHrDraftStatus = useCallback(status => {
    const current = activeEditingUser.current;
    if (!status || activeSessionToken.current !== status.saveScope ||
        current?.id !== status.id || current?.email !== status.email) return;
    hrDraftStatus.current = { id: status.id, email: status.email,
      sessionToken: status.saveScope, dirty: status.dirty === true };
    setHasUnsavedHrData(previous => previous === status.dirty ? previous : status.dirty === true);
  }, []);
  const [deletionRequests, setDeletionRequests] = useState([]);
  const [deletionRequestsLoading, setDeletionRequestsLoading] = useState(true);
  const [deletionRequestsError, setDeletionRequestsError] = useState(false);
  const deletionRequestLoadSequence = useRef(0);
  const [deletionRequestConfirm, setDeletionRequestConfirm] = useState(null);
  const [deletionRequestSaving, setDeletionRequestSaving] = useState(false);
  const deletionResolutionInFlight = useRef(false);
  const deletionResolutionOwner = useRef(null);
  const [deletionImpactRequest, setDeletionImpactRequest] = useState(null);
  const [deletionImpactReport, setDeletionImpactReport] = useState(null);
  const [deletionImpactLoading, setDeletionImpactLoading] = useState(false);
  const [deletionImpactError, setDeletionImpactError] = useState("");
  const deletionImpactSequence = useRef(0);
  const [deletionImpactRetry, setDeletionImpactRetry] = useState({ inFlight: false, retryInMs: 0 });

  // A timed-out SDK request may still be running. Show when retry is safe,
  // and keep the control disabled until both ownership and cooldown clear.
  useEffect(() => {
    if (!deletionImpactRequest || !deletionImpactError) return;
    const refreshRetry = () => setDeletionImpactRetry(getDeletionImpactRetryState());
    refreshRetry();
    const refreshTimer = setInterval(refreshRetry, 1000);
    return () => clearInterval(refreshTimer);
  }, [deletionImpactRequest?.id, deletionImpactError]);

  useEffect(() => {
    // A previous Admin session may still have a user update or password save in
    // flight. Revoke its editor ownership, clear any password draft, and let
    // only the new session control the loading/error UI.
    userUpdateOwner.current = null;
    userUpdateInFlight.current = false;
    setUserMutationSaving(false);
    setAccountSaveRecovery(null);
    setAccountWriteRecovery(null);
    setConfirmAccountReconciliation(false);
    setAccountFieldChoices({});
    setPasswordRetryConfirmed(false);
    setAccountSaveNotice("");
    setPostSaveRefreshPending(null);
    hrSaveOwner.current = null;
    hrSaveInFlight.current = false;
    setHrMutationSaving(false);
    hrReloadOwner.current = null;
    hrReloadInFlight.current = false;
    setHrReloadLoading(false);
    hrDraftStatus.current = null;
    accountDraftBaseline.current = null;
    setHasUnsavedHrData(false);
    setPendingHrExit(null);
    // A previous session may have a deletion in flight. The server decides
    // its outcome; only the owning session may change this confirmation UI.
    deletionOwner.current = null;
    deletionInFlight.current = false;
    setDeletionSaving(false);
    setDeleteConfirm(null);
    setEditingUser(null);
    setIsDialogOpen(false);
    setFormData({
      full_name: "", username: "", password_hash: "", role: "user",
      sales_roles: ["Task Assigned"], can_import_export: false,
      can_order_export: false, can_view_resources: false,
      employment_type: "hourly", can_work_pause: false,
    });
    // A prior session may still have an invitation in flight. Release only its
    // UI ownership; never let it resume onboarding or Smartsheet actions.
    inviteOwner.current = null;
    inviteInFlight.current = false;
    setIsInviting(false);
    setInviteError("");
    setInviteSuccess("");
    setInviteEmail("");
    setInviteFirstName("");
    setInviteLastName("");
    setInviteRole("user");
    // Revoke old reset/resend UI ownership without cancelling backend effects.
    passwordResetOwner.current = null;
    passwordResetInFlight.current = false;
    setSendingPasswordReset(null);
    onboardingResendOwner.current = null;
    onboardingResendInFlight.current = false;
    setSendingOnboardingEmail(null);
    // Revoke UI ownership from a pending previous-session resolution.
    // The backend's authorized CAS may finish, but it cannot update this UI.
    deletionResolutionOwner.current = null;
    deletionResolutionInFlight.current = false;
    setDeletionRequestSaving(false);
    setDeletionRequestConfirm(null);
    setUserMutationError("");
    // Every session change invalidates read-only scans from the previous
    // identity, even when a new session token replaces the old one directly.
    ++deletionImpactSequence.current;
    setDeletionImpactRequest(null);
    setDeletionImpactReport(null);
    setDeletionImpactError("");
    setDeletionImpactLoading(false);
    if (sessionToken) {
      void loadUsers();
      void loadDeletionRequests();
    } else {
      ++userLoadSequence.current;
      ++deletionRequestLoadSequence.current;
      setUsers([]);
      setUserDirectoryError(true);
      setDeletionRequests([]);
      setDeletionRequestsError(true);
      setDeletionRequestConfirm(null);
      setIsLoading(false);
      setDeletionRequestsLoading(false);
    }
    // Revoke ownership on both session transitions and component unmounts;
    // a pending email callback cannot alert after Admin is left behind.
    return () => {
      hrReloadOwner.current = null;
      hrReloadInFlight.current = false;
      hrDraftStatus.current = null;
      accountDraftBaseline.current = null;
      hrSaveOwner.current = null;
      hrSaveInFlight.current = false;
      deletionOwner.current = null;
      deletionInFlight.current = false;
      passwordResetOwner.current = null;
      passwordResetInFlight.current = false;
      onboardingResendOwner.current = null;
      onboardingResendInFlight.current = false;
      ++userLoadSequence.current;
      ++deletionRequestLoadSequence.current;
      ++deletionImpactSequence.current;
    };
  }, [sessionToken]);

  const applyRoleToSelected = async (role) => {
    const targets = visibleUsers.filter((u) => selectedUserIds.has(u.id) && u.role !== role);
    if (!targets.length || !sessionToken) return;
    setBulkRoleBusy(true); setBulkRoleError("");
    const failed = [];
    for (const record of targets) {
      try {
        const saved = await updateAuthorizedUserAdmin({ record, nextFields: { role }, sessionToken });
        if (saved?.id) setUsers((current) => current.map((row) => (row.id === saved.id ? { ...row, ...saved } : row)));
      } catch (err) {
        failed.push(record.full_name || record.email || record.id);
      }
    }
    if (failed.length) setBulkRoleError(`Could not update: ${failed.join(", ")}`);
    else setSelectedUserIds(new Set());
    setBulkRoleBusy(false);
  };

  const bulkRemove = async () => {
    if (bulkRoleBusy || !sessionToken) return;
    const targets = visibleUsers.filter((u) => selectedUserIds.has(u.id) && u.email?.toLowerCase() !== selfEmail);
    if (!targets.length) { setBulkRoleError("Nothing to remove (your own account is skipped)."); return; }
    if (!window.confirm(`Remove ${targets.length} selected user${targets.length === 1 ? "" : "s"}? They lose access immediately. Review ownership impacts first.`)) return;
    setBulkRoleBusy(true); setBulkRoleError("");
    const failed = [];
    for (const u of targets) {
      try { await deleteAuthorizedUserAdmin({ record: u, sessionToken }); }
      catch (e) { failed.push(`${u.email}: ${e?.message || "failed"}`); }
    }
    setSelectedUserIds(new Set());
    setBulkRoleError(failed.length ? `${targets.length - failed.length} removed; ${failed.length} failed (${failed.slice(0, 2).join("; ")}${failed.length > 2 ? "…" : ""})` : "");
    setBulkRoleBusy(false);
    await loadUsers();
  };

  const exportUsersCsv = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["Name", "Email", "Role", "Full Admin", "Sales Roles", "Pages Access"],
      ...visibleUsers.map((u) => [
        u.full_name || "", u.email || "", u.role || "",
        u.is_full_admin === true ? "yes" : "",
        (Array.isArray(u.sales_roles) ? u.sales_roles : []).join("; "),
        u.role === "admin" ? getAdminAccessSummary(u) : "",
      ]),
    ].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "users.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportAccessMatrixCsv = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const tabs = ADMIN_TAB_GROUPS.flatMap((g) => g.tabs.map((t) => ({ label: `${g.label}: ${t.label}`, value: t.value })));
    const rows = [
      ["Name", "Email", "Role", "Full Admin", ...tabs.map(t => t.label)],
      ...visibleUsers.map((u) => [
        u.full_name || "", u.email || "", u.role || "",
        u.is_full_admin === true ? "yes" : "",
        ...tabs.map((t) => {
          if (u.is_full_admin === true) return "yes";
          if (u.role !== "admin") return "";
          return getAccessibleAdminTab(t.value, true, u) ? "yes" : "no";
        }),
      ]),
    ].map((r) => r.map(esc).join(",")).join(String.fromCharCode(10));
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "access-matrix.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const exportAuditBundleCsv = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const tabs = ADMIN_TAB_GROUPS.flatMap((g) => g.tabs.map((t) => ({ label: `${g.label}: ${t.label}`, value: t.value })));
    const userRows = visibleUsers.map((u) => [
      u.full_name || "", u.email || "", u.role || "",
      u.is_full_admin === true ? "yes" : "",
      (Array.isArray(u.sales_roles) ? u.sales_roles : []).join("; "),
      u.role === "admin" ? getAdminAccessSummary(u) : "",
    ]);
    const matrixRows = visibleUsers.map((u) => [
      u.full_name || "", u.email || "",
      ...tabs.map((t) => {
        if (u.is_full_admin === true) return "yes";
        if (u.role !== "admin") return "";
        return getAccessibleAdminTab(t.value, true, u) ? "yes" : "no";
      }),
    ]);
    const NL = String.fromCharCode(10);
    const csv = [
      "=== USERS ===",
      ["Name", "Email", "Role", "Full Admin", "Sales Roles", "Pages Access"].map(esc).join(","),
      ...userRows.map((r) => r.map(esc).join(",")),
      "",
      "=== ACCESS MATRIX ===",
      ["Name", "Email", ...tabs.map((t) => t.label)].map(esc).join(","),
      ...matrixRows.map((r) => r.map(esc).join(",")),
      "",
      `Exported ${new Date().toISOString()} · ${visibleUsers.length} users`,
    ].join(NL);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "admin-audit-bundle.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const userSearchQ = userSearch.trim().toLowerCase();
  const visibleUsers = users.filter((u) => {
    if (userFilter === "admin" && u.role !== "admin") return false;
    if (userFilter === "user" && u.role === "admin") return false;
    if (userFilter === "full_admin" && u.is_full_admin !== true) return false;
    if (!userSearchQ) return true;
    const hay = [u.full_name, u.email, ...(Array.isArray(u.sales_roles) ? u.sales_roles : [])]
      .filter(Boolean).join(" ").toLowerCase();
    return hay.includes(userSearchQ);
  });
  visibleUsers.sort((a, b) => {
    const an = String(a.full_name || a.email || "").toLowerCase();
    const bn = String(b.full_name || b.email || "").toLowerCase();
    switch (userSort) {
      case "name_desc": return bn.localeCompare(an);
      case "email": return String(a.email || "").localeCompare(String(b.email || ""));
      case "role": return String(a.role || "").localeCompare(String(b.role || "")) || an.localeCompare(bn);
      default: return an.localeCompare(bn);
    }
  });

  const loadUsers = async () => {
    // A stale mutation must not even start a read with its previous token.
    if (activeSessionToken.current !== sessionToken) return null;
    const requestSequence = ++userLoadSequence.current;
    const ownsRead = () => requestSequence === userLoadSequence.current &&
      activeSessionToken.current === sessionToken;
    if (!sessionToken) {
      setUserDirectoryError(true);
      setIsLoading(false);
      return null;
    }
    setIsLoading(true);
    try {
      const allUsers = await listAuthorizedUsersAdmin({ sessionToken });
      if (ownsRead()) {
        setUsers(allUsers);
        setUserDirectoryError(false);
      }
      return ownsRead() ? allUsers : null;
    } catch {
      // A failed authenticated read is not an empty directory. Preserve the
      // previously verified rows internally but never offer them for editing.
      if (ownsRead()) setUserDirectoryError(true);
      return null;
    } finally {
      if (ownsRead()) setIsLoading(false);
    }
  };

  const loadDeletionRequests = async () => {
    // A completion from an older auth token must not start a read or invalidate
    // the current session's request list.
    if (activeSessionToken.current !== sessionToken) return null;
    const requestSequence = ++deletionRequestLoadSequence.current;
    const ownsRead = () => requestSequence === deletionRequestLoadSequence.current &&
      activeSessionToken.current === sessionToken;
    // A prior confirmation or impact scan cannot survive a refresh of its
    // source record, including refreshes that fail or return a newer version.
    ++deletionImpactSequence.current;
    setDeletionImpactRequest(null);
    setDeletionImpactReport(null);
    setDeletionImpactError("");
    setDeletionImpactLoading(false);
    setDeletionRequestConfirm(null);
    if (!sessionToken) {
      setDeletionRequestsError(true);
      setDeletionRequestsLoading(false);
      return null;
    }
    setDeletionRequestsLoading(true);
    try {
      const requests = await listAccountDeletionRequestsAdmin({ sessionToken });
      if (ownsRead()) {
        setDeletionRequests(requests);
        setDeletionRequestsError(false);
      }
      return ownsRead() ? requests : null;
    } catch {
      // An incomplete authenticated read cannot prove there are no requests.
      // Retain the last verified list internally, but block all stale actions.
      if (ownsRead()) setDeletionRequestsError(true);
      return null;
    } finally {
      if (ownsRead()) setDeletionRequestsLoading(false);
    }
  };

  const handleLoadDeletionImpact = async (request) => {
    // Only the currently verified request version may be scanned. A closed or
    // superseded read never restores its report or error into a different view.
    const verifiedRequest = deletionRequests.find(item =>
      item.id === request?.id && item.updated_date === request?.updated_date);
    if (!verifiedRequest || deletionImpactLoading || deletionRequestsLoading ||
        deletionRequestsError || !sessionToken) return;
    const requestSequence = ++deletionImpactSequence.current;
    setDeletionImpactRequest(verifiedRequest);
    setDeletionImpactReport(null);
    setDeletionImpactError("");
    setDeletionImpactLoading(true);
    try {
      const impact = await getAccountDeletionImpactAdmin({ request: verifiedRequest, sessionToken });
      if (requestSequence === deletionImpactSequence.current) {
        setDeletionImpactReport(impact);
      }
    } catch (error) {
      if (requestSequence === deletionImpactSequence.current) {
        // Never display arbitrary backend details that may expose identities.
        // The known client deadline has a distinct, safe recovery explanation.
        const timedOut = error?.message === "Account deletion impact scan timed out. No report was verified.";
        setDeletionImpactError(timedOut
          ? "The impact scan took too long. No report was verified. Retry is paused to avoid overlapping requests. No records were changed."
          : "The read-only impact scan could not be verified. No records were changed. Retry the scan or close this review.");
      }
    } finally {
      if (requestSequence === deletionImpactSequence.current) {
        setDeletionImpactLoading(false);
      }
    }
  };

  const closeDeletionImpact = () => {
    ++deletionImpactSequence.current;
    setDeletionImpactRequest(null);
    setDeletionImpactReport(null);
    setDeletionImpactError("");
    setDeletionImpactLoading(false);
  };

  const formatImpactEntity = (name) => String(name || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ");

  const handleResolveDeletionRequest = async () => {
    const request = deletionRequestConfirm?.request;
    const resolution = deletionRequestConfirm?.resolution;
    const verifiedRequest = deletionRequests.find(item =>
      item.id === request?.id &&
      item.updated_date === request?.updated_date &&
      item.authorized_email_id === request?.authorized_email_id &&
      item.user_email === request?.user_email &&
      item.status === "pending");
    if (!verifiedRequest || !resolution || deletionResolutionInFlight.current ||
        deletionRequestsLoading || deletionRequestsError || !sessionToken ||
        activeSessionToken.current !== sessionToken) return;

    // A unique owner prevents late completion from a previous Admin session
    // from clearing the new session's saving state, error or request list.
    const owner = { sessionToken };
    deletionResolutionOwner.current = owner;
    const ownsResolution = () => deletionResolutionOwner.current === owner &&
      activeSessionToken.current === sessionToken;
    deletionResolutionInFlight.current = true;
    setDeletionRequestSaving(true);
    setUserMutationError("");
    try {
      await resolveAccountDeletionRequestAdmin({
        request: verifiedRequest,
        resolution,
        sessionToken,
      });
      if (!ownsResolution()) return;
      setDeletionRequestConfirm(null);
      await loadDeletionRequests();
    } catch (error) {
      if (!ownsResolution()) return;
      console.error("Deletion request resolution blocked:", error);
      setUserMutationError(error?.message || "The deletion request changed in another session. Reload before resolving it.");
      setDeletionRequestConfirm(null);
      await loadDeletionRequests();
    } finally {
      if (ownsResolution()) {
        deletionResolutionOwner.current = null;
        deletionResolutionInFlight.current = false;
        setDeletionRequestSaving(false);
      }
    }
  };

  const formatDeletionRequestDate = (value) => {
    const date = new Date(value || "");
    return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
  };

  const hasProtectedHrDraft = () => {
    const current = activeEditingUser.current;
    const status = hrDraftStatus.current;
    return !!(status?.dirty && current &&
      status.id === current.id && status.email === current.email &&
      status.sessionToken === activeSessionToken.current);
  };

  const hasProtectedAccountDraft = () => {
    const current = activeEditingUser.current;
    const baseline = accountDraftBaseline.current;
    return !!(baseline && current &&
      baseline.id === current.id && baseline.email === current.email &&
      baseline.sessionToken === activeSessionToken.current &&
      hasUnsavedAdminAccountDraft(baseline.values, formData));
  };

  const clearHrDraftTracking = () => {
    hrDraftStatus.current = null;
    setHasUnsavedHrData(false);
  };

  const clearEditorDraftTracking = () => {
    clearHrDraftTracking();
    accountDraftBaseline.current = null;
    // Explicit editor exit must not retain a typed Time Clock password in
    // component state after the employee's draft has been discarded or saved.
    setFormData(current => ({ ...current, password_hash: "" }));
    setAccountSaveRecovery(null);
    setAccountWriteRecovery(null);
    setConfirmAccountReconciliation(false);
    setAccountFieldChoices({});
    setPasswordRetryConfirmed(false);
    setAccountSaveNotice("");
    setPostSaveRefreshPending(null);
  };

  const hasProtectedEditorDraft = () => hasProtectedHrDraft() || hasProtectedAccountDraft();
  const accountResolutionPreview = accountWriteRecovery?.stage === "review" &&
    accountWriteRecovery.comparison?.status !== "applied"
    ? planAccountFieldResolution({
        baseline: accountWriteRecovery.baseline,
        attempted: accountWriteRecovery.attempted,
        latest: accountWriteRecovery.latest,
        draft: formData,
        choices: accountFieldChoices
      })
    : null;
  const postSaveResolutionPreview = postSaveRefreshPending?.stage === "review" &&
    postSaveRefreshPending.latest && postSaveRefreshPending.saved
    ? planAccountFieldResolution({
        baseline: postSaveRefreshPending.saved,
        attempted: postSaveRefreshPending.attempted,
        latest: postSaveRefreshPending.latest,
        draft: formData,
        choices: accountFieldChoices
      })
    : null;
  const choosePostSaveField = (field, value) => {
    if (!postSaveResolutionPreview?.fields.some(item => item.key === field) ||
        !["latest", "mine"].includes(value) || userUpdateInFlight.current) return;
    setAccountFieldChoices(current => ({...current,[field]:value}));
    setConfirmAccountReconciliation(false);
  };
  const chooseAccountField = (field, value) => {
    if (!accountResolutionPreview?.fields.some(item => item.key === field) ||
        !["latest", "mine"].includes(value) || userUpdateInFlight.current) return;
    setAccountFieldChoices(current => ({...current,[field]:value}));
    setConfirmAccountReconciliation(false);
  };
  const hasUnsavedAccountData = isDialogOpen && hasProtectedAccountDraft();
  useEffect(() => {
    // An explicit acknowledgment covers only the fields as they stood at
    // confirmation time. Later Account edits require fresh review.
    if (accountWriteRecovery?.stage === "review" || postSaveRefreshPending?.stage === "review") {
      setConfirmAccountReconciliation(false);
    }
  }, [formData]);

  const requestCloseUserEditor = () => {
    if (!isDialogOpen || hrSaveInFlight.current || hrReloadInFlight.current ||
        userUpdateInFlight.current || deletionInFlight.current ||
        activeSessionToken.current !== sessionToken) return;
    if (hasProtectedEditorDraft()) {
      setPendingHrExit({
        kind: "close", sessionToken,
        sourceId: editingUser?.id, sourceEmail: editingUser?.email
      });
      return;
    }
    clearEditorDraftTracking();
    setEditingUser(null);
    setIsDialogOpen(false);
  };

  const openEditUser = (user, discardConfirmed = false) => {
    if (!user?.id || !user.email || isLoading || userDirectoryError || !sessionToken ||
        hrSaveInFlight.current || hrReloadInFlight.current ||
        userUpdateInFlight.current || deletionInFlight.current ||
        activeSessionToken.current !== sessionToken) return;
    if (isDialogOpen && editingUser?.id === user.id && editingUser?.email === user.email) return;
    if (isDialogOpen && hasProtectedEditorDraft() && !discardConfirmed) {
      setPendingHrExit({
        kind: "switch", sessionToken, sourceId: editingUser?.id,
        sourceEmail: editingUser?.email,
        targetId: user.id, targetEmail: user.email, targetVersion: user.updated_date
      });
      return;
    }
    clearEditorDraftTracking();
    setAccountSaveRecovery(null);
    setAccountWriteRecovery(null);
    setConfirmAccountReconciliation(false);
    setAccountFieldChoices({});
    setPasswordRetryConfirmed(false);
    setAccountSaveNotice("");
    setPostSaveRefreshPending(null);
    const initialAccountDraft = createAdminAccountDraft(user);
    accountDraftBaseline.current = {
      sessionToken, id: user.id, email: user.email, values: initialAccountDraft
    };
    setEditingUser(user);
    setFormData(initialAccountDraft);
    setIsDialogOpen(true);
  };

  const confirmDiscardHrDraft = () => {
    const pending = pendingHrExit;
    if (!pending || !isDialogOpen || !sessionToken ||
        pending.sessionToken !== sessionToken ||
        activeSessionToken.current !== sessionToken ||
        activeEditingUser.current?.id !== pending.sourceId ||
        activeEditingUser.current?.email !== pending.sourceEmail ||
        hrSaveInFlight.current || hrReloadInFlight.current || userUpdateInFlight.current ||
        deletionInFlight.current || isLoading || userDirectoryError) return;
    if (pending.kind === "switch") {
      const verifiedTarget = users.find(row =>
        row.id === pending.targetId && row.email === pending.targetEmail &&
        row.updated_date === pending.targetVersion);
      if (!verifiedTarget) {
        setPendingHrExit(null);
        return;
      }
      setPendingHrExit(null);
      openEditUser(verifiedTarget, true);
    } else if (pending.kind === "close") {
      setPendingHrExit(null);
      clearEditorDraftTracking();
      setEditingUser(null);
      setIsDialogOpen(false);
    }
  };

  const handleSendPasswordReset = async (user) => {
    if (!user?.id || !user.email || !sessionToken || isLoading || userDirectoryError ||
        passwordResetInFlight.current || activeSessionToken.current !== sessionToken) return;

    const owner = { sessionToken };
    passwordResetOwner.current = owner;
    const ownsReset = () => passwordResetOwner.current === owner &&
      activeSessionToken.current === sessionToken;
    passwordResetInFlight.current = true;
    setSendingPasswordReset(user.id);
    setUserMutationError("");
    try {
      const response = await base44.functions.invoke("issuePasswordReset", {
        session_token: sessionToken,
        target_email: user.email,
      });
      if (!ownsReset()) return;
      const result = response?.data || response;
      if (!result?.success) throw new Error(result?.error || "Password reset could not be issued.");
      alert(`Password reset email sent to ${user.email}`);
    } catch (err) {
      if (!ownsReset()) return;
      console.error("Error sending password reset:", err);
      const message = err?.response?.data?.error || err?.data?.error || err?.message || "Failed to issue the password reset safely.";
      setUserMutationError(message);
      alert(message);
    } finally {
      if (ownsReset()) {
        passwordResetOwner.current = null;
        passwordResetInFlight.current = false;
        setSendingPasswordReset(null);
      }
    }
  };

  const handleResendOnboarding = async (user) => {
    if (!user?.id || !user.email || !sessionToken || isLoading || userDirectoryError ||
        onboardingResendInFlight.current || activeSessionToken.current !== sessionToken) return;

    const owner = { sessionToken };
    onboardingResendOwner.current = owner;
    const ownsResend = () => onboardingResendOwner.current === owner &&
      activeSessionToken.current === sessionToken;
    onboardingResendInFlight.current = true;
    setSendingOnboardingEmail(user.id);
    setUserMutationError("");
    try {
      const response = await base44.functions.invoke("onboardingAccountAction", {
        action: "issue_invite",
        session_token: sessionToken,
        target_email: user.email,
      });
      if (!ownsResend()) return;
      const result = response?.data || response;
      if (!result?.success) throw new Error(result?.error || "Failed to issue the onboarding link safely.");
      alert(`New registration email sent to ${user.email}`);
      // Never schedule an old-session directory refresh.
      if (!ownsResend()) return;
      await loadUsers();
    } catch (err) {
      if (!ownsResend()) return;
      console.error("Error sending onboarding email:", err);
      const message = err?.response?.data?.error || err?.data?.error || err?.message || "Failed to issue the onboarding link safely.";
      setUserMutationError(message);
      alert(message);
    } finally {
      if (ownsResend()) {
        onboardingResendOwner.current = null;
        onboardingResendInFlight.current = false;
        setSendingOnboardingEmail(null);
      }
    }
  };

  const reloadHrRecord = async (record) => {
    if (!record?.id || !record?.email || hrReloadInFlight.current ||
        hrSaveInFlight.current || userUpdateInFlight.current ||
        deletionInFlight.current || isLoading || !sessionToken ||
        !isDialogOpen || activeSessionToken.current !== sessionToken ||
        activeEditingUser.current?.id !== record.id ||
        activeEditingUser.current?.email !== record.email) {
      throw new Error("The Admin session or employee editor changed. Reopen it before reloading HR information.");
    }
    const owner = { sessionToken, recordId: record.id };
    hrReloadOwner.current = owner;
    hrReloadInFlight.current = true;
    setHrReloadLoading(true);
    const ownsReload = () => hrReloadOwner.current === owner &&
      activeSessionToken.current === sessionToken &&
      activeEditingUser.current?.id === record.id &&
      activeEditingUser.current?.email === record.email;
    try {
      const latestUsers = await listAuthorizedUsersAdmin({ sessionToken });
      if (!ownsReload()) return null;
      const latest = latestUsers.find(row => row.id === record.id && row.email === record.email);
      if (!latest?.updated_date || !latest.hr_data ||
          typeof latest.hr_data !== "object" || Array.isArray(latest.hr_data)) {
        throw new Error("The employee record could not be verified. Reopen the directory before trying again.");
      }
      // Invalidate older directory reads before applying the fresh version.
      ++userLoadSequence.current;
      setUsers(latestUsers);
      setUserDirectoryError(false);
      setEditingUser(current =>
        current?.id === record.id && current?.email === record.email ? latest : current);
      return latest;
    } finally {
      if (ownsReload()) {
        hrReloadOwner.current = null;
        hrReloadInFlight.current = false;
        setHrReloadLoading(false);
      }
    }
  };

  const handleSaveHrData = async (hrData, record) => {
    // Confirm the exact editor record is still backed by this session's
    // verified directory, rather than trusting a retired form's closure.
    const verifiedUser = users.find(row =>
      row.id === record?.id && row.email === record?.email &&
      row.updated_date === record?.updated_date);
    if (!verifiedUser || !isDialogOpen || isLoading || userDirectoryError ||
        !sessionToken || activeSessionToken.current !== sessionToken ||
        hrSaveInFlight.current || hrReloadInFlight.current || userUpdateInFlight.current ||
        deletionInFlight.current || userMutationSaving) {
      throw new Error("The user directory or editor has changed. Reload before saving HR data.");
    }
    const currentEditor = activeEditingUser.current;
    if (currentEditor?.id !== record.id || currentEditor?.email !== record.email ||
        currentEditor?.updated_date !== record.updated_date) {
      throw new Error("The employee editor has changed. Reopen the correct employee before saving.");
    }

    const owner = { sessionToken, recordId: record.id };
    hrSaveOwner.current = owner;
    const ownsHrSave = () => hrSaveOwner.current === owner &&
      activeSessionToken.current === sessionToken &&
      activeEditingUser.current?.id === record.id &&
      activeEditingUser.current?.email === record.email;
    hrSaveInFlight.current = true;
    setHrMutationSaving(true);
    try {
      const saved = await updateAuthorizedUserHrAdmin({ record: verifiedUser, hrData, sessionToken });
      if (!ownsHrSave()) return false;
      // Only a verified server receipt may advance the HR compare-and-swap
      // baseline. Without it, another save could overwrite newer HR data.
      // Match the backend's structural comparison: object key order is not
      // an HR change, while array order and actual values still matter.
      const normalizeHr = value => Array.isArray(value) ? value.map(normalizeHr) :
        value && typeof value === "object"
          ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalizeHr(value[key])]))
          : value;
      if (saved?.id !== record.id || saved?.email !== record.email ||
          !saved?.updated_date || !saved?.hr_data ||
          typeof saved.hr_data !== "object" || Array.isArray(saved.hr_data) ||
          JSON.stringify(normalizeHr(saved.hr_data)) !== JSON.stringify(normalizeHr(hrData))) {
        setUserDirectoryError(true);
        throw new Error("The saved HR record could not be verified. Reload the directory before saving again.");
      }
      // A directory read started before the write must not reinstate its
      // previous HR version. The form keeps its draft during this refresh.
      ++userLoadSequence.current;
      setUsers(current => current.map(row =>
        row.id === record.id && row.email === record.email &&
        row.updated_date === record.updated_date ? saved : row));
      setEditingUser(current =>
        current?.id === record.id && current?.email === record.email &&
        current?.updated_date === record.updated_date ? saved : current);
      return true;
    } catch (error) {
      if (!ownsHrSave()) return false;
      throw error;
    } finally {
      if (ownsHrSave()) {
        hrSaveOwner.current = null;
        hrSaveInFlight.current = false;
        setHrMutationSaving(false);
      }
    }
  };

  const handleSave = async () => {
    // Account saves close the whole editor. Do not implicitly discard HR edits.
    if (hasProtectedHrDraft()) {
      setUserMutationError("Save your HR data separately or choose Cancel and confirm discarding it before saving account changes.");
      return;
    }
    if (accountSaveRecovery || accountWriteRecovery || postSaveRefreshPending) {
      setUserMutationError("Resolve the Account verification or Time Clock password recovery before another Account write. A confirmed save must not be submitted again.");
      return;
    }
    if (!editingUser || userUpdateInFlight.current || hrSaveInFlight.current || hrReloadInFlight.current || deletionInFlight.current || isLoading || userDirectoryError ||
        !sessionToken || activeSessionToken.current !== sessionToken) return;
    setUserMutationError("");
    setAccountSaveNotice("");
    setPostSaveRefreshPending(null);
    const requestedPassword = String(formData.password_hash || "");
    if (requestedPassword && requestedPassword.length < 8) {
      setUserMutationError("Password must be at least 8 characters, or leave it blank to keep the existing password.");
      return;
    }
    // Capture a unique save owner before the first await. A session change
    // revokes only UI ownership; server-side changes remain server-controlled.
    const owner = { sessionToken };
    userUpdateOwner.current = owner;
    const ownsUpdate = () => userUpdateOwner.current === owner &&
      activeSessionToken.current === sessionToken;
    userUpdateInFlight.current = true;
    const record = editingUser;
    let verifiedAccountReceipt = false;
    let accountAttempt = null;
    let accountWriteSent = false;
    setUserMutationSaving(true);
    try {
      const dataToSave = { ...formData };
      const newPassword = dataToSave.password_hash;
      // Never send password_hash directly — use the separate secure backend.
      delete dataToSave.password_hash;
      const changedFields = getChangedAdminAccountFields(record, dataToSave);
      // Recovery needs the full original draft to compare individual fields;
      // the backend receives ONLY the genuinely changed fields.
      accountAttempt = { ...dataToSave, sales_roles: [...(dataToSave.sales_roles || [])] };
      accountWriteSent = Object.keys(changedFields).length > 0;
      const savedUser = accountWriteSent
        ? await updateAuthorizedUserAdmin({
            record,
            nextFields: changedFields,
            sessionToken,
          })
        : record;
      // Never continue follow-up changes from a superseded Admin session.
      if (!ownsUpdate()) return;
      if (!savedUser?.updated_date || savedUser.id !== record.id ||
          savedUser.email !== record.email) {
        throw new Error("The saved account receipt could not be verified. Reload the employee before another Account write.");
      }

      verifiedAccountReceipt = true;
      if (accountWriteSent && savedUser.role !== record.role) {
        triggerNotification("user_role_changed", null, {
          recordData: savedUser,
          eventDescription: "User role changed",
        });
      }
      // The confirmed receipt may include remote-only field changes which
      // were never in our changed-field patch. Adopt those values instead of
      // treating the stale submitted form as fresh local edits. Keep only
      // fields actually edited after Save began, and retain the local password
      // draft independently of the Account receipt.
      const savedAccountDraft = createAdminAccountDraft(savedUser);
      const rebasedReceiptDraft = rebaseAppliedAccountDraft({
        latest: savedUser, attempted: accountAttempt,
        current: activeAccountDraft.current
      });
      activeAccountDraft.current = rebasedReceiptDraft;
      setFormData(rebasedReceiptDraft);
      // Advance the baseline even when the separate password result later
      // needs manual recovery; this prevents re-sending confirmed changes.
      accountDraftBaseline.current = {
        sessionToken, id: savedUser.id, email: savedUser.email,
        values: savedAccountDraft
      };
      if (accountWriteSent) {
        ++userLoadSequence.current;
        setUsers(current => current.map(row =>
          row.id === record.id && row.email === record.email &&
          row.updated_date === record.updated_date ? savedUser : row));
        setEditingUser(current =>
          current?.id === record.id && current?.email === record.email &&
          current?.updated_date === record.updated_date ? savedUser : current);
      }

      // Password changes are a separate backend operation, with no atomic
      // guarantee together with the Account write. A failure or lost
      // acknowledgement must not close the editor or retry either write.
      if (newPassword) {
        try {
          const res = await setPasswordFn({
            user_email: savedUser.email,
            username: savedUser.username || record.username,
            new_password: newPassword,
            session_token: sessionToken,
          });
          if (!ownsUpdate()) return;
          if (!res?.data?.success) throw new Error("Password result unverified");
        } catch {
          if (!ownsUpdate()) return;
          setAccountSaveRecovery({
            sessionToken, id: savedUser.id, email: savedUser.email,
            updated_date: savedUser.updated_date,
            ...(!accountWriteSent ? { accountUnchanged: true } : {})
          });
          setPasswordRetryConfirmed(false);
          setUserMutationError(accountWriteSent
            ? "Account changes were saved, but the Time Clock password result is unverified. Check whether it already changed before attempting a password-only retry."
            : "No Account fields required updating, but the Time Clock password result is unverified. Check whether it already changed before attempting a password-only retry.");
          return;
        }
      }
      if (!ownsUpdate()) return;
      // Account controls can receive edits while a network request is pending.
      // Never close and silently discard changes made after this save began.
      const currentDraft = activeAccountDraft.current;
      const remainingDraft = {
        ...currentDraft,
        password_hash: currentDraft.password_hash === newPassword ? "" : currentDraft.password_hash
      };
      if (hasUnsavedAdminAccountDraft(accountDraftBaseline.current.values, remainingDraft)) {
        setFormData(current => ({
          ...current, password_hash: current.password_hash === newPassword ? "" : current.password_hash
        }));
        setAccountSaveNotice("The requested changes were confirmed. New edits made during saving remain in your draft.");
        return;
      }
      // Directory verification is read-only; a failed or superseded refresh
      // cannot authorize closing the editor after a confirmed Account save.
      let refreshedRows = null;
      try {
        refreshedRows = await loadUsers();
      } catch {
        // Treat unexpected reader errors just like a failed, incomplete read.
        // The Account/password acknowledgement remains confirmed.
      }
      if (!ownsUpdate()) return;
      const verifiedRows = refreshedRows?.filter(row =>
        row.id === savedUser.id && row.email === savedUser.email && row.updated_date);
      if (!verifiedRows || verifiedRows.length !== 1) {
        setPostSaveRefreshPending({
          sessionToken, id: savedUser.id, email: savedUser.email,
          saved: savedUser, attempted: savedAccountDraft, stage: "needs_read"
        });
        // A confirmed password must not be resent after a failed directory
        // refresh. Clear only that confirmed password draft, never newer edits.
        setFormData(current => ({
          ...current, password_hash: current.password_hash === newPassword ? "" : current.password_hash
        }));
        setUserMutationError("Your changes were confirmed, but the employee directory refresh could not be verified. The editor and any newer drafts are preserved. Retry the directory read without resending any changes.");
        return;
      }
      // A newer version must be explicitly reviewed, not silently accepted
      // as the version that was just confirmed. Include semantic field checks
      // for backends that do not always advance updated_date.
      if (!isSameVerifiedAccountSnapshot(savedUser, verifiedRows[0])) {
        setPostSaveRefreshPending({
          sessionToken, id: savedUser.id, email: savedUser.email,
          saved: savedUser, attempted: savedAccountDraft,
          stage: "review", latest: verifiedRows[0]
        });
        setConfirmAccountReconciliation(false);
        setAccountFieldChoices({});
        setFormData(current => ({
          ...current, password_hash: current.password_hash === newPassword ? "" : current.password_hash
        }));
        setAccountSaveNotice("Your Account changes were confirmed, but the directory now shows a newer version. Review field-level differences before using its values.");
        return;
      }
      // A user might have edited an Account field while the directory request
      // was pending. Re-evaluate *after* the await, not just before it.
      const afterRefresh = activeAccountDraft.current;
      const remainingAfterRefresh = {
        ...afterRefresh,
        password_hash: afterRefresh.password_hash === newPassword ? "" : afterRefresh.password_hash
      };
      if (hasUnsavedAdminAccountDraft(accountDraftBaseline.current.values, remainingAfterRefresh) ||
          hasProtectedHrDraft()) {
        setFormData(current => ({
          ...current, password_hash: current.password_hash === newPassword ? "" : current.password_hash
        }));
        setAccountSaveNotice("Your changes were confirmed and the directory was refreshed. Edits made while refreshing remain in this editor.");
        return;
      }
      clearEditorDraftTracking();
      setIsDialogOpen(false);
      setEditingUser(null);
    } catch (error) {
      if (!ownsUpdate()) return;
      if (!verifiedAccountReceipt && accountAttempt) {
        const rejectedField = rejectedAdminAccountField(error);
        // Only the backend's exact field-precondition rejection confirms that
        // this Account write was blocked. Ambiguous/network errors still
        // require explicit read-only recovery; neither is ever auto-retried.
        const pending = {
          stage: "needs_read", sessionToken, id: record.id, email: record.email,
          baseline: createAdminAccountDraft(record), attempted: accountAttempt,
          ...(rejectedField ? { rejectedField } : {})
        };
        setAccountWriteRecovery(pending);
        setConfirmAccountReconciliation(false);
        setAccountFieldChoices({});
        if (rejectedField) {
          try {
            // Safe immediate field-level review for a confirmed backend
            // precondition rejection. Never start another Account/password
            // write, even when the read fails or an admin session changes.
            const rows = await listAuthorizedUsersAdmin({ sessionToken });
            if (!ownsUpdate()) return;
            const matching = rows?.filter(row => row.id === record.id &&
              row.email === record.email && row.updated_date);
            if (!matching || matching.length !== 1) {
              throw new Error("Conflicted Account could not be verified.");
            }
            const latest = matching[0];
            const comparison = compareUnverifiedAccountSave({
              baseline: pending.baseline, attempted: pending.attempted, latest
            });
            setAccountWriteRecovery({ ...pending, stage: "review", latest, comparison });
            setUserMutationError("");
          } catch {
            if (!ownsUpdate()) return;
            setUserMutationError(
              "Account changed in another session. The latest Account could not be verified; your draft is preserved. Read latest Account before resolving fields."
            );
          }
        } else {
          setUserMutationError(
            "Account save outcome unverified. Use the read-only verification below before attempting another Account save. Time Clock password was not sent."
          );
        }
        return;
      }
      setUserMutationError("Account save could not be completed or verified. Review the latest directory record before retrying.");
    } finally {
      if (ownsUpdate()) {
        userUpdateOwner.current = null;
        userUpdateInFlight.current = false;
        setUserMutationSaving(false);
      }
    }
  };

  const verifyInterruptedAccountSave = async () => {
    const pending = accountWriteRecovery;
    const current = activeEditingUser.current;
    if (!pending || !sessionToken || pending.sessionToken !== sessionToken ||
        activeSessionToken.current !== sessionToken ||
        current?.id !== pending.id || current?.email !== pending.email ||
        userUpdateInFlight.current || hrSaveInFlight.current || hrReloadInFlight.current ||
        deletionInFlight.current || isLoading) return;
    const owner = { sessionToken };
    userUpdateOwner.current = owner;
    userUpdateInFlight.current = true;
    setUserMutationSaving(true);
    const ownsVerification = () => userUpdateOwner.current === owner &&
      activeSessionToken.current === sessionToken &&
      activeEditingUser.current?.id === pending.id &&
      activeEditingUser.current?.email === pending.email;
    try {
      // Authorized, read-only directory query. An incomplete or competing
      // read is not evidence that the previous Account write did not occur.
      const rows = await loadUsers();
      if (!ownsVerification()) return;
      const matching = rows?.filter(row => row.id === pending.id &&
        row.email === pending.email && row.updated_date);
      if (!matching || matching.length !== 1) {
        throw new Error("The latest Account record could not be verified.");
      }
      const latest = matching[0];
      const comparison = compareUnverifiedAccountSave({
        baseline: pending.baseline, attempted: pending.attempted, latest
      });
      setAccountWriteRecovery({
        ...pending, stage: "review", latest, comparison
      });
      setConfirmAccountReconciliation(false);
      setAccountFieldChoices({});
      setUserMutationError("");
    } catch {
      if (ownsVerification()) {
        setAccountWriteRecovery({ ...pending, stage: "needs_read" });
        setConfirmAccountReconciliation(false);
        setAccountFieldChoices({});
        setUserMutationError("Unable to verify the Account save. No retry was sent. Reload the verified directory before resolving.");
      }
    } finally {
      if (ownsVerification()) {
        userUpdateOwner.current = null;
        userUpdateInFlight.current = false;
        setUserMutationSaving(false);
      }
    }
  };

  const acceptVerifiedAccountSave = async () => {
    const pending = accountWriteRecovery;
    if (!pending || pending.stage !== "review" || !pending.latest ||
        !pending.comparison || !sessionToken ||
        pending.sessionToken !== sessionToken ||
        activeSessionToken.current !== sessionToken ||
        activeEditingUser.current?.id !== pending.id ||
        activeEditingUser.current?.email !== pending.email ||
        userUpdateInFlight.current || hrSaveInFlight.current || hrReloadInFlight.current ||
        deletionInFlight.current || isLoading || userDirectoryError ||
        (pending.comparison.status !== "applied" &&
          (!confirmAccountReconciliation || !accountResolutionPreview))) return;
    // Review choices remain local. Before adopting the reviewed baseline,
    // obtain a new authorized read and prove that its entire editable Account
    // surface and version still match the record displayed for approval.
    const owner = { sessionToken };
    const draftAtApproval = activeAccountDraft.current;
    userUpdateOwner.current = owner;
    userUpdateInFlight.current = true;
    setUserMutationSaving(true);
    const ownsApproval = () => userUpdateOwner.current === owner &&
      activeSessionToken.current === sessionToken &&
      activeEditingUser.current?.id === pending.id &&
      activeEditingUser.current?.email === pending.email;
    try {
      const rows = await listAuthorizedUsersAdmin({ sessionToken });
      if (!ownsApproval()) return;
      const matching = rows?.filter(row => row.id === pending.id && row.email === pending.email);
      if (!matching || matching.length !== 1 ||
          !isSameVerifiedAccountSnapshot(pending.latest, matching[0]) ||
          activeAccountDraft.current !== draftAtApproval) {
        throw new Error("Reconciliation must be reviewed against the latest Account.");
      }
      const latest = matching[0];
      accountDraftBaseline.current = {
        sessionToken, id: latest.id, email: latest.email,
        values: createAdminAccountDraft(latest)
      };
      if (pending.comparison.status === "applied") {
        setFormData(current => rebaseAppliedAccountDraft({
          latest, attempted: pending.attempted, current
        }));
        if (String(draftAtApproval?.password_hash || "").length > 0) {
          // No password write was started by the interrupted Account request.
          setAccountSaveRecovery({
            sessionToken, id: latest.id, email: latest.email,
            updated_date: latest.updated_date, passwordNotSent: true
          });
        }
        setAccountSaveNotice("Verified Account values still match the requested changes. No Account retry was sent.");
      } else {
        // Choices are calculated from the original verified snapshot and the
        // draft as it stood at approval. Concurrent changes invalidate review.
        const resolved = accountResolutionPreview.draft;
        setFormData(current => ({...resolved, password_hash: current.password_hash || ""}));
        setAccountSaveNotice(
          "Field choices applied to the local draft only after verifying no intervening Account changes. Review roles and permissions before a separate Save."
        );
      }
      setEditingUser(current =>
        current?.id === pending.id && current?.email === pending.email ? latest : current);
      setAccountWriteRecovery(null);
      setConfirmAccountReconciliation(false);
      setAccountFieldChoices({});
      setUserMutationError("");
    } catch {
      if (!ownsApproval()) return;
      // The previous preview cannot be trusted after a failed, changed, or
      // ambiguous read. Keep all unsaved fields and password draft unchanged.
      setAccountWriteRecovery({ ...pending, stage: "needs_read", latest: null, comparison: null });
      setConfirmAccountReconciliation(false);
      setAccountFieldChoices({});
      setUserMutationError("Account verification changed or could not be confirmed. No choices were applied and no write was sent. Read latest Account again.");
    } finally {
      if (ownsApproval()) {
        userUpdateOwner.current = null;
        userUpdateInFlight.current = false;
        setUserMutationSaving(false);
      }
    }
  };

  const retryUnverifiedAccountPassword = async () => {
    const recovery = accountSaveRecovery;
    const record = activeEditingUser.current;
    if (!recovery || !passwordRetryConfirmed || !sessionToken ||
        recovery.sessionToken !== sessionToken ||
        activeSessionToken.current !== sessionToken ||
        record?.id !== recovery.id || record?.email !== recovery.email ||
        record?.updated_date !== recovery.updated_date ||
        userUpdateInFlight.current || hrSaveInFlight.current || hrReloadInFlight.current ||
        deletionInFlight.current || isLoading || userDirectoryError) return;
    const password = String(formData.password_hash || "");
    if (password.length < 8) {
      setUserMutationError("Enter a Time Clock password with at least 8 characters before retrying.");
      return;
    }
    const owner = { sessionToken };
    userUpdateOwner.current = owner;
    userUpdateInFlight.current = true;
    setUserMutationSaving(true);
    setPasswordRetryConfirmed(false);
    const ownsRetry = () => userUpdateOwner.current === owner &&
      activeSessionToken.current === sessionToken &&
      activeEditingUser.current?.id === recovery.id &&
      activeEditingUser.current?.email === recovery.email &&
      activeEditingUser.current?.updated_date === recovery.updated_date;
    try {
      const result = await setPasswordFn({
        user_email: recovery.email,
        username: record.username,
        new_password: password,
        session_token: sessionToken,
      });
      if (!ownsRetry()) return;
      if (!result?.data?.success) throw new Error("Password result unverified");
      setFormData(current => ({
        ...current, password_hash: current.password_hash === password ? "" : current.password_hash
      }));
      setAccountSaveRecovery(null);
      setUserMutationError("");
      setAccountSaveNotice("Time Clock password update confirmed. Account details were already saved. Review any remaining edits before leaving.");
    } catch {
      if (!ownsRetry()) return;
      setUserMutationError("Time Clock password outcome is still unverified. Check whether it changed before another manually confirmed attempt.");
    } finally {
      if (ownsRetry()) {
        userUpdateOwner.current = null;
        userUpdateInFlight.current = false;
        setUserMutationSaving(false);
      }
    }
  };

  const stopUnverifiedAccountPasswordRetry = () => {
    const recovery = accountSaveRecovery;
    if (!recovery || userUpdateInFlight.current ||
        recovery.sessionToken !== sessionToken ||
        activeSessionToken.current !== sessionToken ||
        activeEditingUser.current?.id !== recovery.id ||
        activeEditingUser.current?.email !== recovery.email ||
        activeEditingUser.current?.updated_date !== recovery.updated_date) return;
    setFormData(current => ({ ...current, password_hash: "" }));
    setAccountSaveRecovery(null);
    setPasswordRetryConfirmed(false);
    setUserMutationError("");
    setAccountSaveNotice("Account details remain saved. The Time Clock password result was not verified; no retry was sent.");
  };

  const handleInvite = async () => {
    if (inviteInFlight.current || isLoading || userDirectoryError || !sessionToken ||
        activeSessionToken.current !== sessionToken) return;
    if (!inviteEmail.trim()) {
      setInviteError("Please enter an email address");
      return;
    }

    // Ownership is captured before the first await. Session changes revoke it
    // so late completions cannot mutate a different administrator's form.
    const owner = { sessionToken };
    inviteOwner.current = owner;
    const ownsInvite = () => inviteOwner.current === owner &&
      activeSessionToken.current === sessionToken;
    inviteInFlight.current = true;
    setIsInviting(true);
    setInviteError("");
    setInviteSuccess("");

    try {
      const email = inviteEmail.trim().toLowerCase();
      const fullName = [inviteFirstName.trim(), inviteLastName.trim()].filter(Boolean).join(" ");

      // Keep the established server-side identity create and invitation order.
      const inviteResult = await createAuthorizedUserAdmin({
        data: {
          email,
          full_name: fullName || null,
          role: inviteRole,
          reports_to: inviteManager.trim() || null,
          sales_roles: ["Task Assigned"],
          employment_type: "hourly",
          can_work_pause: false,
          onboarding_complete: false
        },
        sessionToken,
      });
      // The create may have committed server-side. Do not start any follow-up
      // action under an invalidated session, even if its response arrived late.
      if (!ownsInvite()) return;
      if (inviteResult.status === "existing") {
        setInviteError("This email is already authorized");
        return;
      }

      try {
        const response = await base44.functions.invoke("onboardingAccountAction", {
          action: "issue_invite",
          session_token: sessionToken,
          target_email: email,
        });
        if (!ownsInvite()) return;
        const result = response?.data || response;
        if (!result?.success) throw new Error(result?.error || "Invitation email could not be sent.");
        setInviteSuccess(`User authorized and invitation email sent to ${email}`);
      } catch (emailError) {
        if (!ownsInvite()) return;
        const message = emailError?.response?.data?.error || emailError?.data?.error || emailError?.message || "Invitation email could not be sent.";
        setInviteSuccess(`User authorized! Invitation email failed: ${message}`);
      }

      // Order Form only: append the saved user to the Smartsheet Requestor
      // CONTACT_LIST, preserving the existing independent sync outcome.
      if (!ownsInvite()) return;
      try {
        const contactResponse = await base44.functions.invoke("smartsheetSyncAction", {
          action: "order_requestor_contact_sync",
          session_token: sessionToken,
          user_email: email,
        });
        if (!ownsInvite()) return;
        const contactResult = contactResponse?.data || contactResponse;
        if (!contactResult?.success) {
          throw new Error(contactResult?.error || "Requestor contact update could not be verified.");
        }
        setInviteSuccess((previous) => ownsInvite()
          ? `${previous} · Order Requestor verified in Smartsheet.` : previous);
      } catch (contactError) {
        if (!ownsInvite()) return;
        const detail = contactError?.response?.data?.error || contactError?.data?.error ||
          contactError?.message || "Could not verify the Smartsheet Requestor dropdown.";
        setInviteSuccess((previous) => ownsInvite()
          ? `${previous} · Order Requestor Smartsheet sync needs attention: ${detail}` : previous);
      }
      if (!ownsInvite()) return;
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
      setInviteRole("user");
      void loadUsers();
    } catch (error) {
      if (ownsInvite()) setInviteError(error?.message || "Failed to add user");
    } finally {
      if (ownsInvite()) {
        inviteOwner.current = null;
        inviteInFlight.current = false;
        setIsInviting(false);
      }
    }
  };

  // Pre-delete impact check (read-only): warn before removing users who
  // still own live work or history. Failures never block the delete path.
  useEffect(() => {
    setDeleteImpact(null); setDeleteImpactError("");
    const target = deleteConfirm;
    if (!target?.id || !sessionToken) return;
    let cancelled = false;
    (async () => {
      try {
        const impact = await getUserDeletionImpactAdmin({ user: target, sessionToken });
        if (!cancelled) setDeleteImpact(impact);
      } catch (err) {
        if (!cancelled) setDeleteImpactError(err?.message || "Impact check unavailable.");
      }
    })();
    return () => { cancelled = true; };
  }, [deleteConfirm, sessionToken]);

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result || "").split(String.fromCharCode(10)).map(l => l.trim()).filter(Boolean);
      const rows = [];
      for (const line of lines.slice(0, 51)) {
        const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
        const email = (cols[0] || "").toLowerCase();
        if (!email || !email.includes("@") || email === "email") continue;
        rows.push({ email, full_name: cols[1] || "", role: cols[2] === "admin" ? "admin" : "user" });
      }
      if (!rows.length) { setImportMsg("No valid email rows found (expected: email,name,role)."); return; }
      setImportRows(rows); setImportMsg("");
    };
    reader.readAsText(file);
  };
  const runImport = async () => {
    if (!importRows?.length || importBusy || !sessionToken) return;
    setImportBusy(true); setImportMsg("");
    const failed = [];
    for (const row of importRows) {
      try { await createAuthorizedUserAdmin({ data: row, sessionToken }); }
      catch (err) { failed.push(`${row.email}: ${err?.message || "failed"}`); }
    }
    setImportMsg(failed.length ? `${importRows.length - failed.length} imported; ${failed.length} failed (${failed.slice(0, 2).join("; ")}${failed.length > 2 ? "…" : ""})` : `${importRows.length} users imported.`);
    setImportRows(null); setImportBusy(false);
    await loadUsers();
  };

  const restoreDeletedUser = async () => {
    if (!lastDeletedUser || restoreBusy || !sessionToken) return;
    setRestoreBusy(true); setRestoreError("");
    try {
      await createAuthorizedUserAdmin({ data: lastDeletedUser, sessionToken });
      setLastDeletedUser(null);
      await loadUsers();
    } catch (err) {
      setRestoreError(err?.message || "The user could not be restored.");
    } finally {
      setRestoreBusy(false);
    }
  };

  const handleDelete = async (user) => {
    // The confirmed row must still be present in the verified directory at
    // the exact version shown to this administrator.
    const verifiedUser = users.find(row =>
      row.id === user?.id && row.email === user?.email &&
      row.updated_date === user?.updated_date);
    if (!verifiedUser || !user?.updated_date || !deleteConfirm ||
        deleteConfirm.id !== user.id || deleteConfirm.email !== user.email ||
        deleteConfirm.updated_date !== user.updated_date ||
        deletionInFlight.current || userUpdateInFlight.current || hrSaveInFlight.current || userMutationSaving ||
        isLoading || userDirectoryError || !sessionToken ||
        activeSessionToken.current !== sessionToken) return;

    // An old response can finish server-side, but never own the next
    // session's confirmation, error, loading state, or directory refresh.
    const owner = { sessionToken };
    deletionOwner.current = owner;
    const ownsDeletion = () => deletionOwner.current === owner &&
      activeSessionToken.current === sessionToken;
    deletionInFlight.current = true;
    setDeletionSaving(true);
    setUserMutationError("");
    try {
      await deleteAuthorizedUserAdmin({
        record: verifiedUser,
        sessionToken,
      });
      if (!ownsDeletion()) return;
      setDeleteConfirm(null);
      setLastDeletedUser({
        email: verifiedUser.email,
        full_name: verifiedUser.full_name || "",
        role: verifiedUser.role || "user",
        sales_roles: Array.isArray(verifiedUser.sales_roles) ? verifiedUser.sales_roles : [],
        is_full_admin: verifiedUser.is_full_admin === true,
        admin_permissions: verifiedUser.admin_permissions && typeof verifiedUser.admin_permissions === "object" ? verifiedUser.admin_permissions : {},
      });
      await loadUsers();
    } catch (error) {
      if (!ownsDeletion()) return;
      console.error("User deletion blocked:", error);
      setUserMutationError(error?.message || "This user changed in another session and was not removed.");
      setDeleteConfirm(null);
      await loadUsers();
    } finally {
      if (ownsDeletion()) {
        deletionOwner.current = null;
        deletionInFlight.current = false;
        setDeletionSaving(false);
      }
    }
  };

  const getRoleBadge = (role) => {
    if (role === "admin") {
      return (
        <Badge className="bg-purple-100 text-purple-700 flex items-center gap-1">
          <Crown className="w-3 h-3" />
          Admin
        </Badge>
      );
    }
    return (
      <Badge className="bg-blue-100 text-blue-700 flex items-center gap-1">
        <UserIcon className="w-3 h-3" />
        User
      </Badge>
    );
  };

  const retryPostSaveDirectoryRefresh = async () => {
    const pending = postSaveRefreshPending;
    if (!pending || !sessionToken || pending.sessionToken !== sessionToken ||
        activeSessionToken.current !== sessionToken ||
        activeEditingUser.current?.id !== pending.id ||
        activeEditingUser.current?.email !== pending.email ||
        userUpdateInFlight.current || hrSaveInFlight.current || hrReloadInFlight.current ||
        deletionInFlight.current || isLoading) return;
    const owner = { sessionToken };
    userUpdateOwner.current = owner;
    userUpdateInFlight.current = true;
    setUserMutationSaving(true);
    const ownsRead = () => userUpdateOwner.current === owner &&
      activeSessionToken.current === sessionToken &&
      activeEditingUser.current?.id === pending.id &&
      activeEditingUser.current?.email === pending.email;
    try {
      const rows = await loadUsers();
      if (!ownsRead()) return;
      const verified = rows?.filter(row =>
        row.id === pending.id && row.email === pending.email && row.updated_date);
      if (!verified || verified.length !== 1) {
        setPostSaveRefreshPending({ ...pending, stage: "needs_read", latest: null });
        setConfirmAccountReconciliation(false);
        setAccountFieldChoices({});
        setUserMutationError("The saved Account is still not verified in the directory. Your draft remains here. No Account or password request was resent.");
        return;
      }
      if (!isSameVerifiedAccountSnapshot(pending.saved, verified[0])) {
        setPostSaveRefreshPending({ ...pending, stage: "review", latest: verified[0] });
        setConfirmAccountReconciliation(false);
        setAccountFieldChoices({});
        setUserMutationError("");
        setAccountSaveNotice("A newer Account version was found. Review each field before adopting the latest baseline; no changes were resent.");
        return;
      }
      setPostSaveRefreshPending(null);
      setUserMutationError("");
      setAccountSaveNotice("Employee directory verified. Your local draft was preserved. Review it before saving again or closing.");
    } catch {
      if (ownsRead()) {
        setPostSaveRefreshPending({ ...pending, stage: "needs_read", latest: null });
        setConfirmAccountReconciliation(false);
        setAccountFieldChoices({});
        setUserMutationError("Directory refresh failed again. No Account or password request was resent; your draft remains available.");
      }
    } finally {
      if (ownsRead()) {
        userUpdateOwner.current = null;
        userUpdateInFlight.current = false;
        setUserMutationSaving(false);
      }
    }
  };

  const acceptPostSaveAccountReview = async () => {
    const pending = postSaveRefreshPending;
    if (!pending || pending.stage !== "review" || !pending.latest ||
        !postSaveResolutionPreview || !confirmAccountReconciliation ||
        !sessionToken || pending.sessionToken !== sessionToken ||
        activeSessionToken.current !== sessionToken ||
        activeEditingUser.current?.id !== pending.id ||
        activeEditingUser.current?.email !== pending.email ||
        userUpdateInFlight.current || hrSaveInFlight.current || hrReloadInFlight.current ||
        deletionInFlight.current || isLoading || userDirectoryError) return;
    const owner = { sessionToken };
    const draftAtApproval = activeAccountDraft.current;
    userUpdateOwner.current = owner;
    userUpdateInFlight.current = true;
    setUserMutationSaving(true);
    const ownsApproval = () => userUpdateOwner.current === owner &&
      activeSessionToken.current === sessionToken &&
      activeEditingUser.current?.id === pending.id &&
      activeEditingUser.current?.email === pending.email;
    try {
      // Reverify the exact reviewed version and every editable field. An
      // administrator may have changed permissions since the preview loaded.
      const rows = await listAuthorizedUsersAdmin({ sessionToken });
      if (!ownsApproval()) return;
      const matching = rows?.filter(row => row.id === pending.id && row.email === pending.email);
      if (!matching || matching.length !== 1 ||
          !isSameVerifiedAccountSnapshot(pending.latest, matching[0]) ||
          activeAccountDraft.current !== draftAtApproval) {
        throw new Error("The post-save Account preview changed.");
      }
      const latest = matching[0];
      const resolved = postSaveResolutionPreview.draft;
      accountDraftBaseline.current = {
        sessionToken, id: latest.id, email: latest.email,
        values: createAdminAccountDraft(latest)
      };
      // Local-only adoption. Never resubmit the confirmed Account or password
      // request from a post-save reconciliation.
      setFormData(current => ({ ...resolved, password_hash: current.password_hash || "" }));
      setEditingUser(current =>
        current?.id === pending.id && current?.email === pending.email ? latest : current);
      setPostSaveRefreshPending(null);
      setConfirmAccountReconciliation(false);
      setAccountFieldChoices({});
      setUserMutationError("");
      setAccountSaveNotice("Post-save field choices applied to the local draft only. Review remaining role and permission edits before any separate Save.");
    } catch {
      if (!ownsApproval()) return;
      setPostSaveRefreshPending({ ...pending, stage: "needs_read", latest: null });
      setConfirmAccountReconciliation(false);
      setAccountFieldChoices({});
      setUserMutationError("Latest Account changed or could not be verified. No field choices were applied; read the directory again.");
    } finally {
      if (ownsApproval()) {
        userUpdateOwner.current = null;
        userUpdateInFlight.current = false;
        setUserMutationSaving(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      {userMutationError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">User update blocked</div>
            <div className="mt-1 text-xs">{userMutationError}</div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button type="button" size="sm" variant="outline" className="h-7 border-red-300 bg-white text-red-800" onClick={async () => { const refreshed = await loadUsers(); if (refreshed) setUserMutationError(""); }}>Reload latest</Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-red-800" onClick={() => setUserMutationError("")}>Dismiss</Button>
          </div>
        </div>
      )}

      {/* Invite New User Section */}
      <div className="clay-card p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl" style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}>
            <UserPlus className="w-5 h-5 text-teal-700" />
          </div>
          <div>
            <h4 className="font-medium text-gray-800">Add New User</h4>
            <p className="text-sm text-gray-500">Add a new team member to the system</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <Label className="text-xs text-gray-500">First Name</Label>
            <Input
              placeholder="John"
              value={inviteFirstName}
              onChange={(e) => setInviteFirstName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Last Name</Label>
            <Input
              placeholder="Doe"
              value={inviteLastName}
              onChange={(e) => setInviteLastName(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Label className="text-xs text-gray-500">Email Address</Label>
            <Input
              type="email"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                setInviteError("");
              }}
              className="mt-1"
            />
          </div>
          <div className="w-40">
            <Label className="text-xs text-gray-500">Reports to</Label>
            <Input value={inviteManager} onChange={(e) => setInviteManager(e.target.value)}
              placeholder="Manager name or email" className="mt-1" />
          </div>
          <div className="w-32">
            <Label className="text-xs text-gray-500">Role</Label>
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleInvite}
            disabled={isInviting || isLoading || userDirectoryError || !sessionToken}
            className="clay-button border-none text-gray-800"
            style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}
          >
            {isInviting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Add User
              </>
            )}
          </Button>
        </div>
        {inviteError && (
          <p className="text-red-500 text-sm mt-2">{inviteError}</p>
        )}
        {inviteSuccess && (
          <p className="text-green-600 text-sm mt-2">{inviteSuccess}</p>
        )}
      </div>

      {/* Account Deletion Requests */}
      <div className="clay-card p-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="p-2 rounded-xl bg-red-50">
              <ShieldAlert className="w-5 h-5 text-red-700" />
            </div>
            <div>
              <h4 className="font-medium text-gray-800">Account Deletion Requests</h4>
              <p className="text-sm text-gray-500">
                {deletionRequestsLoading ? "Loading requests..." : deletionRequestsError
                  ? "Pending request count unavailable"
                  : `${deletionRequests.filter((request) => request.status === "pending").length} pending review`}
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={loadDeletionRequests}
            disabled={deletionRequestsLoading || deletionRequestSaving}
          >
            {deletionRequestsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          Reviewing or cancelling a request only records the admin decision. It does not remove the authorized account or delete company data.
        </p>

        {deletionRequestsLoading ? (
          <div role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            Loading account deletion requests...
          </div>
        ) : deletionRequestsError ? (
          <div role="alert" aria-label="Account deletion requests unavailable" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <h3 className="font-semibold">Account deletion requests could not be loaded</h3>
            <p className="mt-1 text-sm">
              The request list could not be verified. Impact reviews and request decisions are paused until a successful refresh.
              No request status was changed by this failed read.
            </p>
            <Button type="button" size="sm" variant="outline" disabled={!sessionToken}
              onClick={() => { void loadDeletionRequests(); }}
              className="mt-3 min-h-10 border-amber-500 bg-white text-amber-950">
              Retry loading requests
            </Button>
          </div>
        ) : deletionRequests.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white/50 p-4 text-sm text-gray-500">
            No account deletion requests have been submitted.
          </div>
        ) : (
          <div className="space-y-2">
            {deletionRequests.map((request) => {
              const pending = request.status === "pending";
              const statusLabel = request.status === "processed"
                ? "Reviewed — no deletion performed"
                : request.status === "cancelled"
                  ? "Cancelled"
                  : "Pending";
              const statusClass = pending
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : request.status === "cancelled"
                  ? "border-gray-200 bg-gray-50 text-gray-700"
                  : "border-blue-200 bg-blue-50 text-blue-800";

              return (
                <div
                  key={request.id}
                  className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-800">
                        {request.user_name || request.user_email || "Unknown user"}
                      </span>
                      <Badge variant="outline" className={statusClass}>{statusLabel}</Badge>
                    </div>
                    <div className="text-sm text-gray-500">{request.user_email}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      Requested {formatDeletionRequestDate(request.requested_at)}
                      {!pending && request.processed_by ? " • Resolved by " + request.processed_by : ""}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={deletionImpactLoading || deletionRequestSaving || deletionRequestsLoading || deletionRequestsError || !sessionToken}
                      onClick={() => handleLoadDeletionImpact(request)}
                    >
                      Review Impact
                    </Button>
                    {pending && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={deletionRequestSaving || deletionRequestsLoading || deletionRequestsError || !sessionToken}
                          onClick={() => setDeletionRequestConfirm({ request, resolution: "processed" })}
                        >
                          Mark Reviewed
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-700 hover:bg-red-50"
                          disabled={deletionRequestSaving || deletionRequestsLoading || deletionRequestsError || !sessionToken}
                          onClick={() => setDeletionRequestConfirm({ request, resolution: "cancelled" })}
                        >
                          Cancel Request
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Users List */}
      <div className="clay-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
              <Users className="w-5 h-5 text-purple-700" />
            </div>
            <div>
              <h4 className="font-medium text-gray-800">Team Members</h4>
              <p className="text-sm text-gray-500">
                {isLoading ? "Loading team directory..." : userDirectoryError ? "User count unavailable" : `${users.length} users in your organization`}
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            Loading team directory...
          </div>
        ) : userDirectoryError ? (
          <div role="alert" aria-label="User directory unavailable" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <h3 className="font-semibold">Team directory could not be loaded</h3>
            <p className="mt-1 text-sm">
              The user list could not be verified. Account changes are paused until a successful read.
              Existing user accounts have not been changed by this failed load.
            </p>
            <Button type="button" size="sm" variant="outline" disabled={!sessionToken}
              onClick={() => { void loadUsers(); }}
              className="mt-3 min-h-10 border-amber-500 bg-white text-amber-950">
              Retry loading users
            </Button>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No users yet. Invite your first team member above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(() => {
              const dupes = [];
              const seen = {};
              for (const u of visibleUsers) {
                const key = String(u.full_name || "").trim().toLowerCase().replace(/\s+/g, " ");
                if (!key) continue;
                if (seen[key]) dupes.push(seen[key].full_name + " / " + u.full_name);
                else seen[key] = u;
              }
              return dupes.length ? (
                <div className="mb-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                  Possible duplicate accounts: {dupes.slice(0, 3).join("; ")}{dupes.length > 3 ? ` (+${dupes.length - 3} more)` : ""} — same display name on multiple records.
                </div>
              ) : null;
            })()}
            {lastDeletedUser && (
              <div className="flex flex-wrap items-center gap-2 mb-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                <span className="text-xs font-semibold text-amber-900">
                  Removed {lastDeletedUser.full_name || lastDeletedUser.email}
                </span>
                <Button type="button" size="sm" variant="outline" disabled={restoreBusy || !sessionToken}
                  onClick={restoreDeletedUser} className="h-7 text-xs bg-white/80">
                  {restoreBusy ? "Restoring…" : "Undo remove"}
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={restoreBusy}
                  onClick={() => { setLastDeletedUser(null); setRestoreError(""); }} className="h-7 text-xs">
                  Dismiss
                </Button>
                {restoreError && <span className="text-xs text-red-600">{restoreError}</span>}
              </div>
            )}
            {importRows && (
              <div className="mb-1 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2">
                <p className="text-xs font-semibold text-blue-900">Import preview — {importRows.length} users</p>
                <div className="mt-1 max-h-24 overflow-y-auto text-xs text-blue-800">
                  {importRows.map((r, i) => <p key={i}>{r.email} · {r.full_name || "no name"} · {r.role}</p>)}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" onClick={runImport} disabled={importBusy} className="h-7 text-xs">{importBusy ? "Importing…" : "Import all"}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setImportRows(null)} className="h-7 text-xs">Cancel</Button>
                </div>
              </div>
            )}
            {importMsg && <p className="mb-1 text-xs text-gray-600">{importMsg}</p>}
            <div className="mb-1">
              <label className="cursor-pointer rounded-md border border-input bg-white/70 px-3 py-1 text-xs font-medium hover:bg-gray-50">
                Import CSV
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
              </label>
            </div>
            {selectedUserIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                <span className="text-xs font-semibold text-indigo-900">{selectedUserIds.size} selected</span>
                <Button type="button" size="sm" variant="outline" disabled={bulkRoleBusy}
                  onClick={() => applyRoleToSelected("admin")} className="h-7 text-xs">
                  {bulkRoleBusy ? "Working…" : "Grant admin"}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={bulkRoleBusy}
                  onClick={() => applyRoleToSelected("user")} className="h-7 text-xs">
                  {bulkRoleBusy ? "Working…" : "Revoke admin"}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={bulkRoleBusy}
                  onClick={bulkRemove} className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50">
                  Remove
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={bulkRoleBusy}
                  onClick={() => { setSelectedUserIds(new Set()); setBulkRoleError(""); }} className="h-7 text-xs">
                  Clear
                </Button>
                {bulkRoleError && <span className="text-xs text-red-600">{bulkRoleError}</span>}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search name, email, or role…"
                className="h-8 w-56 text-xs"
                aria-label="Search users"
              />
              <div className="flex gap-1">
                {[["all", "All"], ["admin", "Admins"], ["user", "Users"], ["full_admin", "Full admins"]].map(([v, label]) => (
                  <Button key={v} type="button" size="sm"
                    variant={userFilter === v ? "default" : "outline"}
                    onClick={() => setUserFilter(v)}
                    className="h-7 text-xs">
                    {label}
                  </Button>
                ))}
              </div>
              <Select value={userSort} onValueChange={setUserSort}>
                <SelectTrigger className="h-7 w-32 text-xs" aria-label="Sort users">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name A–Z</SelectItem>
                  <SelectItem value="name_desc">Name Z–A</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="role">Role</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" size="sm" variant="outline" onClick={exportAuditBundleCsv}
                className="h-7 text-xs" title="Download users + access matrix in one audit file">
                Audit bundle
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={exportAccessMatrixCsv}
                className="h-7 text-xs" title="Export every user's page access as a matrix">
                Access matrix
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={exportUsersCsv}
                className="h-7 text-xs" title="Export the filtered user list to CSV">
                Export
              </Button>
              {(userSearch || userFilter !== "all") && (
                <span className="text-xs text-gray-400 ml-auto">{visibleUsers.length} of {users.length}</span>
              )}
            </div>
            {visibleUsers.length === 0 && (
              <div className="text-center py-6 text-sm text-gray-500">No users match the current filter.</div>
            )}
            {visibleUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between gap-2 p-3 rounded-lg bg-white/50 hover:bg-white/80 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedUserIds.has(user.id)}
                    onCheckedChange={(checked) => setSelectedUserIds((prev) => {
                      const next = new Set(prev);
                      if (checked === true) next.add(user.id); else next.delete(user.id);
                      return next;
                    })}
                    aria-label={`Select ${user.full_name || user.email}`}
                  />
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white"
                    style={{
                      background: user.role === 'admin'
                        ? 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)'
                        : 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)'
                    }}
                  >
                    {(user.full_name || user.email || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">
                        {user.full_name || "No name set"}
                      </span>
                      {getRoleBadge(user.role)}
                    </div>
                    <span className="text-sm text-gray-500">{user.email}</span>
                    {user.reports_to && <span className="text-[11px] text-gray-400">reports to {user.reports_to}</span>}
                    {user.username && (
                      <span className="text-xs text-purple-600">@{user.username}</span>
                    )}
                    {user.sales_roles && user.sales_roles.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <Briefcase className="w-3 h-3 text-gray-400" />
                        {user.sales_roles.map(role => (
                          <Badge key={role} variant="outline" className="text-xs">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <UserQRCode user={user} />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setFaceEnrollUser(user)}
                    className="h-8 w-8"
                    title={user.has_face_enrollment ? "Re-enroll Face ID" : "Enroll Face ID"}
                  >
                    {user.has_face_enrollment ? (
                      <Scan className="w-4 h-4 text-green-600" />
                    ) : (
                      <Camera className="w-4 h-4 text-gray-400" />
                    )}
                  </Button>
                  {user.role === 'admin' && (
                    <span className="text-[10px] font-medium text-gray-400 whitespace-nowrap" title="Current admin page access">
                      {getAdminAccessSummary(user)}
                    </span>
                  )}
                  {user.role === 'admin' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAccessUser(user)}
                      className="h-8 gap-1 border-indigo-300 px-2 text-xs font-medium text-indigo-700"
                      title="Admin page access"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Access
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleSendPasswordReset(user)}
                    disabled={passwordResetInFlight.current || isLoading || userDirectoryError}
                    className="h-8 w-8"
                    title="Send Password Reset Email"
                  >
                    {sendingPasswordReset === user.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                    ) : (
                      <Key className="w-4 h-4 text-purple-600" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleResendOnboarding(user)}
                    disabled={onboardingResendInFlight.current || isLoading || userDirectoryError}
                    className="h-8 w-8"
                    title="Resend New User Setup Form"
                  >
                    {sendingOnboardingEmail === user.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                    ) : (
                      <Send className="w-4 h-4 text-teal-600" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditUser(user)}
                    aria-label={`Edit ${user.full_name || user.email}`}
                    className="h-8 w-8"
                  >
                    <Edit className="w-4 h-4 text-blue-600" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { if (!deletionInFlight.current && !userUpdateInFlight.current) setDeleteConfirm(user); }}
                    disabled={deletionSaving || userMutationSaving || hrMutationSaving || isLoading || userDirectoryError || !sessionToken}
                    className="h-8 w-8"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit User Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={() => {}} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogContent className="clay-card border-none max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit User: {editingUser?.full_name || editingUser?.email}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="account" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="mb-4">
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="hr">HR Data</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto">
              <TabsContent value="account" className="mt-0">
                <div className="space-y-4">
                  <div>
                    <Label>Email</Label>
                    <Input
                      value={editingUser?.email || ""}
                      disabled
                      className="mt-1 bg-gray-100"
                    />
                    <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                  </div>

                  <div>
                    <Label>Full Name</Label>
                    <Input
                      value={formData.full_name}
                      onChange={(e) => changeAccountDraft({ full_name: e.target.value })}
                      placeholder="Enter full name"
                      className="mt-1"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Username (for Time Clock)</Label>
                      <Input
                        value={formData.username}
                        onChange={(e) => changeAccountDraft({ username: e.target.value.toLowerCase().replace(/\s/g, '') })}
                        placeholder="e.g., jsmith"
                        className="mt-1"
                      />
                      <p className="text-xs text-gray-500 mt-1">Used for quick clock in/out</p>
                    </div>
                    <div>
                      <Label>Password (for Time Clock)</Label>
                      <Input
                        type="password"
                        value={formData.password_hash}
                        onChange={(e) => {
                          changeAccountDraft({ password_hash: e.target.value });
                          setPasswordRetryConfirmed(false);
                        }}
                        placeholder={formData.password_hash ? "••••••••" : "Set password"}
                        className="mt-1"
                      />
                      <p className="text-xs text-gray-500 mt-1">Leave blank to keep existing password; new passwords require at least 8 characters</p>
                    </div>
                  </div>

                  <div>
                    <Label>Role</Label>
                    <Select
                      value={formData.role}
                      onValueChange={(val) => changeAccountDraft({
                        role: val,
                        can_order_export: val === 'admin' ? activeAccountDraft.current.can_order_export : false,
                        // Auto-enable resources for admins
                        can_view_resources: val === 'admin' ? true : activeAccountDraft.current.can_view_resources
                      })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">
                          <div className="flex items-center gap-2">
                            <UserIcon className="w-4 h-4" />
                            User
                          </div>
                        </SelectItem>
                        <SelectItem value="admin">
                          <div className="flex items-center gap-2">
                            <Crown className="w-4 h-4" />
                            Admin
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Sales Pipeline Roles</Label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {["Task Assigned", "Designer", "Project Manager", "Estimator", "Installer", "Fabricator", "CNC Router Operator", "CNC Laser Operator", "Painter", "Office Administration", "Accounting"].map((role) => (
                        <div key={role} className="flex items-center gap-2">
                          <Checkbox
                            checked={formData.sales_roles?.includes(role) || false}
                            onCheckedChange={(checked) => {
                              const currentRoles = activeAccountDraft.current.sales_roles || [];
                              const newRoles = checked
                                ? [...currentRoles, role]
                                : currentRoles.filter(r => r !== role);
                              changeAccountDraft({ sales_roles: newRoles });
                            }}
                          />
                          <label className="text-sm">{role}</label>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Select which sales pipeline roles this user can be assigned to</p>
                  </div>

                  <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-4 h-4 text-purple-700" />
                      <Label className="font-semibold text-purple-900">Time Clock Settings</Label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm">Employment Type</Label>
                        <Select
                          value={formData.employment_type || "hourly"}
                          onValueChange={(val) => changeAccountDraft({ employment_type: val })}
                        >
                          <SelectTrigger className="mt-1 bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hourly">Hourly</SelectItem>
                            <SelectItem value="salary">Salary</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500 mt-1">Classification only. Salary does not automatically enable Work Pause.</p>
                      </div>
                      <div className="rounded-lg border border-purple-200 bg-white p-3">
                        <div className="flex items-start gap-2">
                          <Checkbox
                            checked={formData.can_work_pause === true}
                            onCheckedChange={(checked) => changeAccountDraft({ can_work_pause: checked === true })}
                          />
                          <div>
                            <label className="text-sm font-medium">Allow Work Pause</label>
                            <p className="text-xs text-gray-500 mt-1">Lets this user pause counted work time without clocking out. Default is OFF and must be assigned individually.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label>Permissions</Label>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={formData.can_import_export || false}
                          onCheckedChange={(checked) => {
                            changeAccountDraft({ can_import_export: checked });
                          }}
                        />
                        <label className="text-sm">Can Import/Export Data</label>
                      </div>
                      {formData.role === "admin" && (
                        <div className="flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50/60 p-3">
                          <Checkbox
                            id="admin-order-form-export"
                            checked={formData.can_order_export === true}
                            onCheckedChange={(checked) => changeAccountDraft({ can_order_export: checked === true })}
                          />
                          <div>
                            <label htmlFor="admin-order-form-export" className="text-sm font-medium">Order Form: Show Export button</label>
                            <p className="mt-1 text-xs text-gray-600">Admin only. OFF until assigned here. The general Import/Export permission does not grant this button.</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={formData.role === 'admin' || formData.can_view_resources || false}
                          disabled={formData.role === 'admin'}
                          onCheckedChange={(checked) => {
                            changeAccountDraft({ can_view_resources: checked });
                          }}
                        />
                        <label className="text-sm">Can View Resources Page</label>
                        {formData.role === 'admin' && (
                          <span className="text-xs text-gray-400">(auto-enabled for admins)</span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Control access to specific pages and features</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="hr" forceMount className="mt-0 data-[state=inactive]:hidden">
                <div className="p-4 mb-4 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-sm text-amber-800">
                    <strong>Admin Access Only:</strong> This HR data is confidential and only accessible by office administrators.
                  </p>
                </div>
                {editingUser && (
                  <UserHRDataForm
                    key={`${sessionToken}:${editingUser.id}:${editingUser.email}`}
                    userData={editingUser}
                    saveScope={sessionToken}
                    onDraftStatusChange={recordHrDraftStatus}
                    preserveDraftOnRecordRefresh={true}
                    onReloadLatest={() => reloadHrRecord(editingUser)}
                    onUpdate={() => { if (activeSessionToken.current === sessionToken) void loadUsers(); }}
                    onSave={(hrData) => handleSaveHrData(hrData, editingUser)}
                    section="all"
                    isAdmin={true}
                  />
                )}
              </TabsContent>
            </div>
          </Tabs>

          {accountWriteRecovery && (
            <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 space-y-3 text-sm" role="alert">
              <p className="font-semibold text-amber-950">
                {accountWriteRecovery.rejectedField
                  ? "Account save rejected — review concurrent field changes"
                  : "Account save outcome needs verification"}
              </p>
              <p className="text-amber-900">
                {accountWriteRecovery.rejectedField
                  ? `The server rejected this Account update because ${accountWriteRecovery.rejectedField.replaceAll("_", " ")} changed in another session. Review the current fields before manually deciding what to keep.`
                  : "The Account request ended without a verified receipt. It might have succeeded."}
                {" "}Your unsaved draft is preserved; the Time Clock password was not sent.
                No automatic Account retry will occur.
              </p>
              {accountWriteRecovery.stage === "review" && accountWriteRecovery.comparison ? (
                <>
                  <p className="font-medium text-amber-950">
                    {accountWriteRecovery.comparison.status === "applied"
                      ? "Verified Account fields match the requested changes."
                      : accountWriteRecovery.comparison.status === "unchanged"
                        ? "Requested Account changes are not visible in the verified record."
                        : "Verified Account fields include partial, different, or concurrent changes."}
                  </p>
                  <p className="text-amber-900">
                    {accountWriteRecovery.comparison.appliedCount} requested fields match;
                    {" "}{accountWriteRecovery.comparison.unchangedCount} remain at their previous values;
                    {" "}{accountWriteRecovery.comparison.divergentCount} have different values.
                    A matching value does not prove which request wrote it.
                  </p>
                  {accountResolutionPreview && (
                    <p className="text-amber-950">
                      Field choices: {accountResolutionPreview.counts.useLatest} use latest,
                      {" "}{accountResolutionPreview.counts.useMine} keep my draft.
                      {accountResolutionPreview.counts.privilegedMine > 0 &&
                        ` ${accountResolutionPreview.counts.privilegedMine} explicit role/permission choices will require a separate authorized Save.`}
                      All choices below affect only this local draft.
                    </p>
                  )}
                  <div className="max-h-56 overflow-auto rounded border border-amber-200 bg-white">
                    <table className="w-full text-xs text-left">
                      <thead className="sticky top-0 bg-gray-100">
                        <tr>
                          <th scope="col" className="p-2">Account field</th>
                          <th scope="col" className="p-2">Verified outcome</th>
                          {accountResolutionPreview && <th scope="col" className="p-2">Keep in my draft</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {(accountResolutionPreview?.fields || accountWriteRecovery.comparison.fields).map(field => (
                          <tr key={field.key} className="border-t border-gray-100">
                            <td className="p-2 font-medium">
                              {field.label}
                              {field.sensitive && <span className="block text-amber-700">Admin authority / permission</span>}
                            </td>
                            <td className="p-2">
                              {field.outcome === "applied" ? "Matches requested" :
                                field.outcome === "unchanged" ? "Still original" :
                                  field.outcome === "different" ? "Different from both" :
                                    field.editedLater ? "Updated after request" :
                                      field.remoteChanged ? "Latest record changed" : "Original request"}
                            </td>
                            {accountResolutionPreview && (
                              <td className="p-2">
                                <div className="flex flex-wrap gap-1" role="group" aria-label={`Resolve ${field.label}`}>
                                  <Button type="button" size="sm" variant={field.selected === "latest" ? "default" : "outline"}
                                    aria-pressed={field.selected === "latest"}
                                    disabled={userMutationSaving || isLoading}
                                    onClick={() => chooseAccountField(field.key, "latest")}>
                                    Use latest
                                  </Button>
                                  <Button type="button" size="sm" variant={field.selected === "mine" ? "default" : "outline"}
                                    aria-pressed={field.selected === "mine"}
                                    disabled={userMutationSaving || isLoading}
                                    onClick={() => chooseAccountField(field.key, "mine")}>
                                    Keep my draft
                                  </Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {accountResolutionPreview?.adjustments.length > 0 && (
                    <div role="status" className="text-amber-950">
                      {accountResolutionPreview.adjustments.map(message => <p key={message}>{message}</p>)}
                    </div>
                  )}
                  {accountWriteRecovery.comparison.status !== "applied" && (
                    <label className="flex items-start gap-2 text-amber-950">
                      <input type="checkbox" className="mt-1"
                        checked={confirmAccountReconciliation}
                        disabled={userMutationSaving || isLoading}
                        onChange={event => setConfirmAccountReconciliation(event.target.checked)} />
                      I reviewed each Account field and any role/permission adjustments. Apply these
                      choices to my local draft against the verified latest baseline. A later Save is
                      separate, permission-checked, and may replace fields I explicitly chose to keep.
                    </label>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline"
                      disabled={userMutationSaving || isLoading ||
                        (accountWriteRecovery.comparison.status !== "applied" && !confirmAccountReconciliation)}
                      onClick={acceptVerifiedAccountSave}>
                      {accountWriteRecovery.comparison.status === "applied"
                        ? "Use verified Account values (no retry)"
                        : "Apply reviewed field choices (local only)"}
                    </Button>
                    <Button type="button" size="sm" variant="outline"
                      disabled={userMutationSaving || isLoading}
                      onClick={verifyInterruptedAccountSave}>
                      Verify latest again
                    </Button>
                  </div>
                </>
              ) : (
                <Button type="button" size="sm" variant="outline"
                  disabled={userMutationSaving || isLoading}
                  onClick={verifyInterruptedAccountSave}>
                  {userMutationSaving ? "Verifying latest Account..." : "Read latest Account (no writes)"}
                </Button>
              )}
              <p className="text-xs text-amber-900">Only field names and outcomes are shown here. No Account or password data is written during verification.</p>
            </div>
          )}
          {accountSaveRecovery && (
            <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 space-y-2 text-sm" role="alert">
              <p className="font-semibold text-amber-950">
                {accountSaveRecovery.passwordNotSent
                  ? "Account values verified; Time Clock password not sent"
                  : accountSaveRecovery.accountUnchanged
                    ? "Account unchanged; Time Clock password outcome unverified"
                    : "Account saved; Time Clock password outcome unverified"}
              </p>
              <p className="text-amber-900">
                {accountSaveRecovery.passwordNotSent
                  ? "The Account fields match your requested changes. No Time Clock password request was sent. You may authorize a separate password-only request."
                  : accountSaveRecovery.accountUnchanged
                    ? "No Account fields were written. The separate password request may or may not have completed. Check whether it was applied before retrying."
                    : "Your Account details were saved. The password request may or may not have completed. Check whether it was applied before retrying."}
                {" "}Your password draft is still in this editor. Nothing has been retried.
              </p>
              <label className="flex items-start gap-2 text-amber-950">
                <input type="checkbox" className="mt-1" checked={passwordRetryConfirmed}
                  disabled={userMutationSaving}
                  onChange={event => setPasswordRetryConfirmed(event.target.checked)} />
                {accountSaveRecovery.passwordNotSent
                  ? "I authorize a separate Time Clock password-only request."
                  : "I verified the password was not changed and authorize a new password-only attempt."}
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline"
                  disabled={!passwordRetryConfirmed || userMutationSaving ||
                    String(formData.password_hash || "").length < 8}
                  onClick={retryUnverifiedAccountPassword}>
                  {userMutationSaving ? "Checking password result..." : "Retry password only"}
                </Button>
                <Button type="button" size="sm" variant="outline"
                  disabled={userMutationSaving}
                  onClick={stopUnverifiedAccountPasswordRetry}>
                  Stop retrying password (keep saved Account)
                </Button>
              </div>
              <p className="text-xs text-amber-900">
                No Account update runs from these controls. Stopping removes the password draft;
                it does not undo the saved Account changes.
              </p>
            </div>
          )}
          {postSaveRefreshPending && (
            <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-3 text-sm text-amber-950">
              <p className="font-medium">
                {postSaveResolutionPreview
                  ? "Changes confirmed; newer Account fields require review"
                  : "Changes confirmed; directory refresh needs verification"}
              </p>
              <p>The employee editor and local drafts remain open. Neither Account fields nor Time Clock passwords will be resent by these review controls.</p>
              {postSaveResolutionPreview && (
                <>
                  <p>
                    {postSaveResolutionPreview.fields.length} Account fields need comparison;
                    {" "}{postSaveResolutionPreview.counts.useLatest} use latest and
                    {" "}{postSaveResolutionPreview.counts.useMine} keep my draft.
                    {" "}Role and permission choices affect the local draft only; a separate Save requires backend authorization.
                  </p>
                  <div className="max-h-56 overflow-auto rounded border border-amber-200 bg-white">
                    <table className="w-full text-xs text-left">
                      <thead className="sticky top-0 bg-gray-100"><tr>
                        <th scope="col" className="p-2">Account field</th>
                        <th scope="col" className="p-2">Latest directory</th>
                        <th scope="col" className="p-2">Local choice</th>
                      </tr></thead>
                      <tbody>
                        {postSaveResolutionPreview.fields.map(field => (
                          <tr key={field.key} className="border-t border-gray-100">
                            <td className="p-2 font-medium">
                              {field.label}
                              {field.sensitive && <span className="block text-amber-700">Admin authority / permission</span>}
                            </td>
                            <td className="p-2">
                              {field.remoteChanged ? "Changed since confirmed save" : "Same as saved"}
                              {field.editedLater && <span className="block">Local draft changed after submit</span>}
                            </td>
                            <td className="p-2">
                              <div className="flex flex-wrap gap-1" role="group" aria-label={`Resolve post-save ${field.label}`}>
                                <Button type="button" size="sm" variant={field.selected === "latest" ? "default" : "outline"}
                                  aria-pressed={field.selected === "latest"}
                                  disabled={userMutationSaving || isLoading}
                                  onClick={() => choosePostSaveField(field.key, "latest")}>Use latest</Button>
                                <Button type="button" size="sm" variant={field.selected === "mine" ? "default" : "outline"}
                                  aria-pressed={field.selected === "mine"}
                                  disabled={userMutationSaving || isLoading}
                                  onClick={() => choosePostSaveField(field.key, "mine")}>Keep my draft</Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {postSaveResolutionPreview.adjustments.map(message => (
                    <p key={message}>{message}</p>
                  ))}
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1"
                      checked={confirmAccountReconciliation}
                      disabled={userMutationSaving || isLoading}
                      onChange={event => setConfirmAccountReconciliation(event.target.checked)} />
                    I reviewed the newer Account version and these field choices. Apply them to my local draft only.
                    No save or password request will be submitted.
                  </label>
                  <Button type="button" size="sm" variant="outline"
                    disabled={!confirmAccountReconciliation || userMutationSaving || isLoading}
                    onClick={acceptPostSaveAccountReview}>
                    Apply post-save field choices (local only)
                  </Button>
                </>
              )}
              <Button type="button" size="sm" variant="outline"
                disabled={userMutationSaving || isLoading || !sessionToken}
                onClick={retryPostSaveDirectoryRefresh}>
                {userMutationSaving ? "Checking directory..." : "Retry directory read (no writes)"}
              </Button>
            </div>
          )}
          {accountSaveNotice && (
            <p className="text-sm text-blue-800" role="status">{accountSaveNotice}</p>
          )}
          {(hasUnsavedHrData || hasUnsavedAccountData) && (
            <p role="status" className="text-sm text-amber-800">
              {hasUnsavedHrData
                ? "Unsaved HR changes are protected. Save HR data in its tab before saving account changes."
                : "Unsaved Account changes are protected, including roles, permissions and a newly entered password."}
              {" "}Use Cancel to review discarding any unsaved editor changes.
            </p>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t mt-4">
            <Button variant="outline" disabled={hrMutationSaving || hrReloadLoading}
              onClick={requestCloseUserEditor}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={userMutationSaving || hrMutationSaving || hrReloadLoading || hasUnsavedHrData || !!accountSaveRecovery || !!accountWriteRecovery || !!postSaveRefreshPending || isLoading || userDirectoryError || !sessionToken}
              className="clay-button border-none"
              style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}
            >
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Explicit discard gate for HR and Account drafts, including an employee switch. */}
      <AlertDialog open={!!pendingHrExit} onOpenChange={open => { if (!open) setPendingHrExit(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved employee changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Unsaved Account or HR changes (including a new password) will be
              discarded if you continue. Nothing will be saved automatically.
              {pendingHrExit?.kind === "switch"
                ? " The other employee will open after you confirm."
                : " The employee editor will close after you confirm."}
              No saved employee records will be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscardHrDraft}
              className="bg-red-700 text-white hover:bg-red-800">
              Discard unsaved changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Account Deletion Impact Review */}
      <Dialog open={!!deletionImpactRequest} onOpenChange={(open) => { if (!open) closeDeletionImpact(); }}>
        <DialogContent className="clay-card border-none max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Account Deletion Impact: {deletionImpactRequest?.user_name || deletionImpactRequest?.user_email || "User"}
            </DialogTitle>
          </DialogHeader>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            Read-only review only. No account, payroll, estimate, work order, assignment, or company record is changed by this scan.
          </div>

          {deletionImpactLoading ? (
            <div role="status" aria-label="Account impact scan in progress"
              className="space-y-3 rounded-xl border border-gray-200 bg-white/60 p-4 text-sm text-gray-600">
              <div className="flex items-center gap-2 font-medium text-gray-800">
                <Loader2 className="w-5 h-5 animate-spin text-purple-600" aria-hidden="true" />
                Reviewing account impact...
              </div>
              <p>Checking these read-only areas before showing any findings:</p>
              <ul aria-label="Impact checks included" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  "User identity and account match",
                  "Payroll and timekeeping history",
                  "Account state and credentials",
                  "Estimator record ownership",
                  "Work order, task and calendar references",
                ].map((category) => (
                  <li key={category} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                    {category}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-500">
                The server returns one complete, verified report. Individual completion percentages are unavailable.
                You can close this scan without changing any records.
              </p>
            </div>
          ) : deletionImpactError ? (
            <div role="alert" aria-label="Account deletion impact unavailable" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <p>{deletionImpactError}</p>
              {(deletionImpactRetry.inFlight || deletionImpactRetry.retryInMs > 0) && (
                <p role="status" className="mt-2 text-xs text-amber-900">
                  {deletionImpactRetry.inFlight
                    ? "A previous server response is still pending. Retry will be enabled after it finishes and the safety pause ends."
                    : `Retry available in ${Math.ceil(deletionImpactRetry.retryInMs / 1000)} seconds.`}
                </p>
              )}
              <Button type="button" size="sm" variant="outline"
                disabled={!sessionToken || deletionRequestsLoading || deletionRequestsError ||
                  deletionImpactRetry.inFlight || deletionImpactRetry.retryInMs > 0}
                onClick={() => { void handleLoadDeletionImpact(deletionImpactRequest); }}
                className="mt-3 min-h-10 border-amber-500 bg-white text-amber-950">
                Retry impact scan
              </Button>
            </div>
          ) : deletionImpactReport ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border bg-white/60 p-3">
                  <div className="text-xs text-gray-500">Authorized account</div>
                  <div className="font-semibold text-gray-800">
                    {deletionImpactReport.target?.authorized_email_exists ? "Present" : "Missing / mismatch"}
                  </div>
                </div>
                <div className="rounded-lg border bg-white/60 p-3">
                  <div className="text-xs text-gray-500">Base44 User identities</div>
                  <div className="font-semibold text-gray-800">{deletionImpactReport.target?.base44_user_count ?? 0}</div>
                </div>
                <div className="rounded-lg border bg-white/60 p-3">
                  <div className="text-xs text-gray-500">Workflow references</div>
                  <div className="font-semibold text-gray-800">
                    {Object.values(deletionImpactReport.assignments || {}).reduce((sum, count) => sum + Number(count || 0), 0)}
                  </div>
                </div>
              </div>

              <div>
                <h5 className="text-sm font-semibold text-gray-800 mb-2">Safety blockers</h5>
                {deletionImpactReport.blockers?.length ? (
                  <div className="space-y-1">
                    {deletionImpactReport.blockers.map((blocker) => (
                      <div key={blocker} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        {blocker}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No known blockers were found by the current scanner.</div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border p-3">
                  <h5 className="text-sm font-semibold text-gray-800 mb-2">Payroll / historical records — preserve</h5>
                  <div className="space-y-1 text-sm">
                    {(deletionImpactReport.history || []).filter((item) => item.count > 0).map((item) => (
                      <div key={item.entity} className="flex justify-between gap-3">
                        <span>{formatImpactEntity(item.entity)}</span>
                        <span className="font-medium">{item.count}</span>
                      </div>
                    ))}
                    {!(deletionImpactReport.history || []).some((item) => item.count > 0) && (
                      <div className="text-gray-500">None found.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <h5 className="text-sm font-semibold text-gray-800 mb-2">Account state — review for cleanup</h5>
                  <div className="space-y-1 text-sm">
                    {(deletionImpactReport.account_state || []).filter((item) => item.count > 0).map((item) => (
                      <div key={item.entity} className="flex justify-between gap-3">
                        <span>{formatImpactEntity(item.entity)}</span>
                        <span className="font-medium">{item.count}</span>
                      </div>
                    ))}
                    {!(deletionImpactReport.account_state || []).some((item) => item.count > 0) && (
                      <div className="text-gray-500">None found.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <h5 className="text-sm font-semibold text-gray-800 mb-2">Estimator ownership — preserve or transfer</h5>
                  <div className="space-y-1 text-sm">
                    {(deletionImpactReport.ownership || []).filter((item) => item.count > 0).map((item) => (
                      <div key={item.entity} className="flex justify-between gap-3">
                        <span>{formatImpactEntity(item.entity)}</span>
                        <span className="font-medium">{item.count}</span>
                      </div>
                    ))}
                    {!(deletionImpactReport.ownership || []).some((item) => item.count > 0) && (
                      <div className="text-gray-500">None found.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <h5 className="text-sm font-semibold text-gray-800 mb-2">Live assignments / references</h5>
                  <div className="space-y-1 text-sm">
                    {Object.entries(deletionImpactReport.assignments || {}).map(([entity, count]) => (
                      <div key={entity} className="flex justify-between gap-3">
                        <span>{formatImpactEntity(entity)}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="text-xs text-gray-500">
                This report intentionally separates historical records that should normally remain intact from account-state records that may later be eligible for cleanup. No cleanup is implemented in this phase.
              </div>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={closeDeletionImpact}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Account Deletion Request Resolution */}
      <AlertDialog
        open={!!deletionRequestConfirm}
        onOpenChange={(open) => {
          if (!open && !deletionRequestSaving) setDeletionRequestConfirm(null);
        }}
      >
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletionRequestConfirm?.resolution === "cancelled" ? "Cancel deletion request?" : "Mark deletion request reviewed?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletionRequestConfirm?.resolution === "cancelled"
                ? "This only cancels the pending review request. It does not remove the user's authorized account or delete company data."
                : "This records that an administrator reviewed the request. It does not remove the user's authorized account or delete company data."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletionRequestSaving}>Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResolveDeletionRequest}
              disabled={deletionRequestSaving || deletionRequestsLoading || deletionRequestsError || !sessionToken}
              className={deletionRequestConfirm?.resolution === "cancelled" ? "bg-red-600 text-white" : ""}
            >
              {deletionRequestSaving
                ? "Saving..."
                : deletionRequestConfirm?.resolution === "cancelled"
                  ? "Cancel Request"
                  : "Mark Reviewed"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open && !deletionInFlight.current) setDeleteConfirm(null); }}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{deleteConfirm?.full_name || deleteConfirm?.email}"? 
              They will lose access to this application.
            </AlertDialogDescription>
            {selfEmail && deleteConfirm?.email?.toLowerCase() === selfEmail && (
              <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-2 text-xs font-semibold text-red-800">
                This is your own account - removing it locks you out. Ask another admin to do this.
              </p>
            )}
            {deleteConfirm && !deleteImpact && !deleteImpactError && (
              <p className="mt-2 text-xs text-gray-400">Checking what this user still owns…</p>
            )}
            {deleteImpactError && (
              <p className="mt-2 text-xs text-gray-400">Impact check unavailable — review their assignments manually.</p>
            )}
            {deleteImpact && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 space-y-1">
                {(deleteImpact.blockers || []).length > 0 ? (
                  deleteImpact.blockers.map((b, i) => <p key={i} className="font-medium">Warning: {b}</p>)
                ) : (
                  <p>No blocking records found for this user.</p>
                )}
                {(() => {
                  const a = deleteImpact.assignments || {};
                  const refs = (a.WorkOrder || 0) + (a.GeneralTask || 0) + (a.CalendarEvent || 0);
                  const hist = (deleteImpact.history || []).reduce((sum, r) => sum + (r.count || 0), 0);
                  if (!refs && !hist) return null;
                  return (
                    <p>
                      {refs > 0 ? `${refs} live assignment${refs === 1 ? "" : "s"} (work orders, tasks, calendar)` : ""}
                      {refs > 0 && hist > 0 ? " · " : ""}
                      {hist > 0 ? `${hist} history record${hist === 1 ? "" : "s"} preserved` : ""}
                    </p>
                  );
                })()}
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletionSaving} className="clay-button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (!(selfEmail && deleteConfirm?.email?.toLowerCase() === selfEmail)) handleDelete(deleteConfirm); }}
              disabled={deletionSaving || userMutationSaving || hrMutationSaving || isLoading || userDirectoryError || !sessionToken || (selfEmail && deleteConfirm?.email?.toLowerCase() === selfEmail)}
              className="bg-red-600 text-white"
            >
              {deletionSaving ? "Removing..." : "Remove User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin Access Dialog */}
      <AdminAccessDialog
        user={accessUser}
        open={!!accessUser}
        onOpenChange={(open) => { if (!open) setAccessUser(null); }}
        sessionToken={sessionToken}
        admins={users.filter((u) => u.role === 'admin' && u.id !== accessUser?.id)}
        onSaved={(saved) => {
          if (saved?.id) setUsers((current) => current.map((row) => (row.id === saved.id ? { ...row, ...saved } : row)));
        }}
      />

      {/* Face Enrollment Dialog */}
      <FaceEnrollmentDialog
        isOpen={!!faceEnrollUser}
        onClose={() => setFaceEnrollUser(null)}
        user={faceEnrollUser}
        onSuccess={loadUsers}
      />
    </div>
  );
}