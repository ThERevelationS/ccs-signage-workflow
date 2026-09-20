import { useState, useEffect } from "react";
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
  Clock,
  ShieldAlert
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import UserQRCode from "@/components/timeclock/UserQRCode";
import FaceEnrollmentDialog from "@/components/timeclock/FaceEnrollmentDialog";
import UserHRDataForm from "@/components/user/UserHRDataForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createAuthorizedUserAdmin,
  deleteAuthorizedUserAdmin,
  listAccountDeletionRequestsAdmin,
  listAuthorizedUsersAdmin,
  resolveAccountDeletionRequestAdmin,
  updateAuthorizedUserAdmin,
  updateAuthorizedUserHrAdmin,
} from "@/components/admin/authorizedUserAdminPersistence";

export default function UserManagement() {
  const { sessionToken } = useAuth();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  const [formData, setFormData] = useState({
    full_name: "",
    username: "",
    password_hash: "",
    role: "user",
    sales_roles: ["Task Assigned"],
    can_import_export: false,
    can_view_resources: false,
    employment_type: "hourly",
    can_work_pause: false
  });
  const [sendingPasswordReset, setSendingPasswordReset] = useState(null);
  const [sendingOnboardingEmail, setSendingOnboardingEmail] = useState(null);
  const [faceEnrollUser, setFaceEnrollUser] = useState(null);
  const [userMutationError, setUserMutationError] = useState("");
  const [userMutationSaving, setUserMutationSaving] = useState(false);
  const [deletionRequests, setDeletionRequests] = useState([]);
  const [deletionRequestsLoading, setDeletionRequestsLoading] = useState(true);
  const [deletionRequestConfirm, setDeletionRequestConfirm] = useState(null);
  const [deletionRequestSaving, setDeletionRequestSaving] = useState(false);

  useEffect(() => {
    if (sessionToken) {
      loadUsers();
      loadDeletionRequests();
    } else {
      setUsers([]);
      setDeletionRequests([]);
      setIsLoading(false);
      setDeletionRequestsLoading(false);
    }
  }, [sessionToken]);

  const loadUsers = async () => {
    if (!sessionToken) return;
    setIsLoading(true);
    try {
      const allUsers = await listAuthorizedUsersAdmin({ sessionToken });
      setUsers(allUsers);
    } catch (error) {
      console.error("Error loading users:", error);
      setUsers([]);
      setUserMutationError(error?.message || "Authorized users could not be loaded safely.");
    }
    setIsLoading(false);
  };

  const loadDeletionRequests = async () => {
    if (!sessionToken) return;
    setDeletionRequestsLoading(true);
    try {
      const requests = await listAccountDeletionRequestsAdmin({ sessionToken });
      setDeletionRequests(requests);
    } catch (error) {
      console.error("Error loading account deletion requests:", error);
      setDeletionRequests([]);
      setUserMutationError(error?.message || "Account deletion requests could not be loaded safely.");
    }
    setDeletionRequestsLoading(false);
  };

  const handleResolveDeletionRequest = async () => {
    const request = deletionRequestConfirm?.request;
    const resolution = deletionRequestConfirm?.resolution;
    if (!request?.id || !resolution || deletionRequestSaving) return;

    setDeletionRequestSaving(true);
    setUserMutationError("");
    try {
      await resolveAccountDeletionRequestAdmin({
        request,
        resolution,
        sessionToken,
      });
      setDeletionRequestConfirm(null);
      await loadDeletionRequests();
    } catch (error) {
      console.error("Deletion request resolution blocked:", error);
      setUserMutationError(error?.message || "The deletion request changed in another session. Reload before resolving it.");
      setDeletionRequestConfirm(null);
      await loadDeletionRequests();
    } finally {
      setDeletionRequestSaving(false);
    }
  };

  const formatDeletionRequestDate = (value) => {
    const date = new Date(value || "");
    return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
  };

  const openEditUser = (user) => {
    setEditingUser(user);
    setFormData({
      full_name: user.full_name || "",
      username: user.username || "",
      password_hash: "", // Don't show existing password
      role: user.role || "user",
      sales_roles: user.sales_roles || ["Task Assigned"],
      can_import_export: user.can_import_export || false,
      can_view_resources: user.role === 'admin' || user.can_view_resources || false,
      employment_type: user.employment_type || "hourly",
      can_work_pause: user.can_work_pause === true
    });
    setIsDialogOpen(true);
  };

  const handleSendPasswordReset = async (user) => {
    if (!user.email || !sessionToken) return;

    setSendingPasswordReset(user.id);
    setUserMutationError("");
    try {
      const response = await base44.functions.invoke("issuePasswordReset", {
        session_token: sessionToken,
        target_email: user.email,
      });
      const result = response?.data || response;
      if (!result?.success) throw new Error(result?.error || "Password reset could not be issued.");
      alert(`Password reset email sent to ${user.email}`);
    } catch (err) {
      console.error("Error sending password reset:", err);
      const message = err?.response?.data?.error || err?.data?.error || err?.message || "Failed to issue the password reset safely.";
      setUserMutationError(message);
      alert(message);
    }
    setSendingPasswordReset(null);
  };

  const handleResendOnboarding = async (user) => {
    if (!user.email || !sessionToken) return;

    setSendingOnboardingEmail(user.id);
    setUserMutationError("");
    try {
      const response = await base44.functions.invoke("onboardingAccountAction", {
        action: "issue_invite",
        session_token: sessionToken,
        target_email: user.email,
      });
      const result = response?.data || response;
      if (!result?.success) throw new Error(result?.error || "Failed to issue the onboarding link safely.");
      alert(`New registration email sent to ${user.email}`);
      await loadUsers();
    } catch (err) {
      console.error("Error sending onboarding email:", err);
      const message = err?.response?.data?.error || err?.data?.error || err?.message || "Failed to issue the onboarding link safely.";
      setUserMutationError(message);
      alert(message);
    }
    setSendingOnboardingEmail(null);
  };

  const handleSave = async () => {
    if (!editingUser || userMutationSaving) return;
    setUserMutationError("");
    const requestedPassword = String(formData.password_hash || "");
    if (requestedPassword && requestedPassword.length < 8) {
      setUserMutationError("Password must be at least 8 characters, or leave it blank to keep the existing password.");
      return;
    }
    setUserMutationSaving(true);
    try {
      const dataToSave = { ...formData };
      const newPassword = dataToSave.password_hash;
      // Never send password_hash directly — use secure backend
      delete dataToSave.password_hash;
      const savedUser = await updateAuthorizedUserAdmin({
        record: editingUser,
        nextFields: dataToSave,
        sessionToken,
      });

      // If a new password was entered, save it securely via backend function
      if (newPassword) {
        try {
          const res = await setPasswordFn({
            user_email: savedUser.email,
            username: savedUser.username || editingUser.username,
            new_password: newPassword,
            session_token: sessionToken,
          });
          if (!res?.data?.success) {
            alert(`Password not saved: ${res?.data?.error || 'Unknown error'}`);
          }
        } catch (e) {
          alert(`Password save failed: ${e?.response?.data?.error || e?.message}`);
        }
      }
      await loadUsers();
      setIsDialogOpen(false);
      setEditingUser(null);
    } catch (error) {
      console.error("User update blocked:", error);
      setUserMutationError(error?.message || "This user changed in another session. Reload before saving.");
      await loadUsers();
    } finally {
      setUserMutationSaving(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      setInviteError("Please enter an email address");
      return;
    }

    setIsInviting(true);
    setInviteError("");
    setInviteSuccess("");

    try {
      const email = inviteEmail.trim().toLowerCase();
      
      const fullName = [inviteFirstName.trim(), inviteLastName.trim()].filter(Boolean).join(" ");

      // Add the authorized user first through the signed sign-shop admin boundary.
      // The server issues the invitation token only after this guarded identity create
      // succeeds, so no onboarding secret ever needs to exist in browser state.
      const inviteResult = await createAuthorizedUserAdmin({
        data: {
          email,
          full_name: fullName || null,
          role: inviteRole,
          sales_roles: ["Task Assigned"],
          employment_type: "hourly",
          can_work_pause: false,
          onboarding_complete: false
        },
        sessionToken,
      });
      if (inviteResult.status === "existing") {
        setInviteError("This email is already authorized");
        setIsInviting(false);
        return;
      }

      try {
        const response = await base44.functions.invoke("onboardingAccountAction", {
          action: "issue_invite",
          session_token: sessionToken,
          target_email: email,
        });
        const result = response?.data || response;
        if (!result?.success) throw new Error(result?.error || "Invitation email could not be sent.");
        setInviteSuccess(`User authorized and invitation email sent to ${email}`);
      } catch (emailError) {
        const message = emailError?.response?.data?.error || emailError?.data?.error || emailError?.message || "Invitation email could not be sent.";
        setInviteSuccess(`User authorized! Invitation email failed: ${message}`);
      }
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
      setInviteRole("user");
      loadUsers();
    } catch (error) {
      setInviteError(error.message || "Failed to add user");
    }
    setIsInviting(false);
  };

  const handleDelete = async (user) => {
    if (!user?.id || userMutationSaving) return;
    setUserMutationError("");
    setUserMutationSaving(true);
    try {
      await deleteAuthorizedUserAdmin({
        record: user,
        sessionToken,
      });
      setDeleteConfirm(null);
      await loadUsers();
    } catch (error) {
      console.error("User deletion blocked:", error);
      setUserMutationError(error?.message || "This user changed in another session and was not removed.");
      setDeleteConfirm(null);
      await loadUsers();
    } finally {
      setUserMutationSaving(false);
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

  return (
    <div className="space-y-6">
      {userMutationError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">User update blocked</div>
            <div className="mt-1 text-xs">{userMutationError}</div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button type="button" size="sm" variant="outline" className="h-7 border-red-300 bg-white text-red-800" onClick={async () => { await loadUsers(); setUserMutationError(""); }}>Reload latest</Button>
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
            disabled={isInviting}
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
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-50">
              <ShieldAlert className="w-5 h-5 text-red-700" />
            </div>
            <div>
              <h4 className="font-medium text-gray-800">Account Deletion Requests</h4>
              <p className="text-sm text-gray-500">
                {deletionRequests.filter((request) => request.status === "pending").length} pending review
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
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
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

                  {pending && (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={deletionRequestSaving}
                        onClick={() => setDeletionRequestConfirm({ request, resolution: "processed" })}
                      >
                        Mark Reviewed
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-700 hover:bg-red-50"
                        disabled={deletionRequestSaving}
                        onClick={() => setDeletionRequestConfirm({ request, resolution: "cancelled" })}
                      >
                        Cancel Request
                      </Button>
                    </div>
                  )}
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
              <p className="text-sm text-gray-500">{users.length} users in your organization</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No users yet. Invite your first team member above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 rounded-lg bg-white/50 hover:bg-white/80 transition-colors"
              >
                <div className="flex items-center gap-3">
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
                    {user.username && (
                      <span className="text-xs text-purple-600">@{user.username}</span>
                    )}
                    {user.sales_roles && user.sales_roles.length > 0 && (
                      <div className="flex items-center gap-1 mt-1">
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

                <div className="flex items-center gap-2">
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
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleSendPasswordReset(user)}
                    disabled={sendingPasswordReset === user.id}
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
                    disabled={sendingOnboardingEmail === user.id}
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
                    className="h-8 w-8"
                  >
                    <Edit className="w-4 h-4 text-blue-600" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteConfirm(user)}
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
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder="Enter full name"
                      className="mt-1"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Username (for Time Clock)</Label>
                      <Input
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
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
                        onChange={(e) => setFormData({ ...formData, password_hash: e.target.value })}
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
                      onValueChange={(val) => setFormData({ 
                        ...formData, 
                        role: val,
                        // Auto-enable resources for admins
                        can_view_resources: val === 'admin' ? true : formData.can_view_resources
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
                              const currentRoles = formData.sales_roles || [];
                              const newRoles = checked
                                ? [...currentRoles, role]
                                : currentRoles.filter(r => r !== role);
                              setFormData({ ...formData, sales_roles: newRoles });
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
                          onValueChange={(val) => setFormData({ ...formData, employment_type: val })}
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
                            onCheckedChange={(checked) => setFormData({ ...formData, can_work_pause: checked === true })}
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
                            setFormData({ ...formData, can_import_export: checked });
                          }}
                        />
                        <label className="text-sm">Can Import/Export Data</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={formData.role === 'admin' || formData.can_view_resources || false}
                          disabled={formData.role === 'admin'}
                          onCheckedChange={(checked) => {
                            setFormData({ ...formData, can_view_resources: checked });
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

              <TabsContent value="hr" className="mt-0">
                <div className="p-4 mb-4 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-sm text-amber-800">
                    <strong>Admin Access Only:</strong> This HR data is confidential and only accessible by office administrators.
                  </p>
                </div>
                {editingUser && (
                  <UserHRDataForm 
                    userData={editingUser} 
                    onUpdate={loadUsers}
                    onSave={(hrData) => updateAuthorizedUserHrAdmin({ record: editingUser, hrData, sessionToken })}
                    section="all"
                    isAdmin={true}
                  />
                )}
              </TabsContent>
            </div>
          </Tabs>

          <div className="flex justify-end gap-3 pt-4 border-t mt-4">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={userMutationSaving}
              className="clay-button border-none"
              style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}
            >
              Save Changes
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
              disabled={deletionRequestSaving}
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
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{deleteConfirm?.full_name || deleteConfirm?.email}"? 
              They will lose access to this application.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete(deleteConfirm)}
              disabled={userMutationSaving}
              className="bg-red-600 text-white"
            >
              Remove User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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