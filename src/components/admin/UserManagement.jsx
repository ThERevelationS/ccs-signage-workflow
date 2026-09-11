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
  Scan
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import UserQRCode from "@/components/timeclock/UserQRCode";
import FaceEnrollmentDialog from "@/components/timeclock/FaceEnrollmentDialog";
import UserHRDataForm from "@/components/user/UserHRDataForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createAuthorizedEmailIfAbsent,
  deleteAuthorizedEmailIfUnchanged,
  updateAuthorizedEmailIfUnchanged,
} from "@/components/admin/authorizedEmailPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const TEAM_MEMBERS = ["Carl", "Twyla", "Brett", "Kyle", "Joe", "Aidin", "Kay", "Brian", "Chris"];

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
    can_view_resources: false
  });
  const [sendingPasswordReset, setSendingPasswordReset] = useState(null);
  const [sendingOnboardingEmail, setSendingOnboardingEmail] = useState(null);
  const [faceEnrollUser, setFaceEnrollUser] = useState(null);
  const [userMutationError, setUserMutationError] = useState("");
  const [userMutationSaving, setUserMutationSaving] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const allUsers = await loadAllEntityRows({
        entity: base44.entities.AuthorizedEmail,
        sort: null,
        label: "User Management authorized users",
      });
      setUsers(allUsers);
    } catch (error) {
      console.error("Error loading users:", error);
      setUsers([]);
    }
    setIsLoading(false);
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
      can_view_resources: user.role === 'admin' || user.can_view_resources || false
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
      const savedUser = await updateAuthorizedEmailIfUnchanged({
        entity: base44.entities.AuthorizedEmail,
        record: editingUser,
        nextFields: dataToSave,
        exactVersion: false,
        enforceIdentity: true,
        label: `Authorized user ${editingUser.full_name || editingUser.email}`
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
      
      // Check if already authorized
      const existing = await base44.entities.AuthorizedEmail.filter({ email });
      if (existing.length > 0) {
        setInviteError("This email is already authorized");
        setIsInviting(false);
        return;
      }
      
      const fullName = [inviteFirstName.trim(), inviteLastName.trim()].filter(Boolean).join(" ");

      // Add the authorized user first. The server issues the invitation token only
      // after this guarded identity create succeeds, so no onboarding secret ever
      // needs to exist in browser state.
      const inviteResult = await createAuthorizedEmailIfAbsent({
        entity: base44.entities.AuthorizedEmail,
        data: {
          email,
          full_name: fullName || null,
          role: inviteRole,
          sales_roles: ["Task Assigned"],
          onboarding_complete: false
        },
        label: `Authorized user invitation ${email}`
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
      await deleteAuthorizedEmailIfUnchanged({
        entity: base44.entities.AuthorizedEmail,
        record: user,
        label: `Authorized user ${user.full_name || user.email} deletion`
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
                    title={user.face_descriptors?.length ? "Re-enroll Face ID" : "Enroll Face ID"}
                  >
                    {user.face_descriptors?.length ? (
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