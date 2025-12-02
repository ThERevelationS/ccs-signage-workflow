import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
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
  Mail,
  Shield,
  User as UserIcon,
  UserPlus,
  Crown,
  Loader2
} from "lucide-react";

const TEAM_MEMBERS = ["Carl", "Twyla", "Brett", "Kyle", "Joe", "Aidin", "Kay", "Brian", "Chris"];

export default function UserManagement() {
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
    role: "user"
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const allUsers = await base44.entities.User.list();
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
      role: user.role || "user"
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (editingUser) {
      await base44.entities.User.update(editingUser.id, formData);
    }
    setIsDialogOpen(false);
    setEditingUser(null);
    loadUsers();
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
      const fullName = [inviteFirstName.trim(), inviteLastName.trim()].filter(Boolean).join(" ");
      
      // Use backend function to add user with service role
      const { addUser } = await import("@/functions/addUser");
      const result = await addUser({
        email: inviteEmail.trim(),
        full_name: fullName || null,
        role: inviteRole
      });
      
      if (result.data?.error) {
        setInviteError(result.data.error);
        setIsInviting(false);
        return;
      }
      
      setInviteSuccess(`User added! They can now log in with ${inviteEmail.trim()}`);
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
      setInviteRole("user");
      loadUsers();
    } catch (error) {
      setInviteError(error.response?.data?.error || error.message || "Failed to add user");
    }
    setIsInviting(false);
  };

  const handleDelete = async (userId) => {
    await base44.entities.User.delete(userId);
    setDeleteConfirm(null);
    loadUsers();
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
                  </div>
                </div>

                <div className="flex items-center gap-2">
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
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="clay-card border-none">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit User</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
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

            <div>
              <Label>Role</Label>
              <Select
                value={formData.role}
                onValueChange={(val) => setFormData({ ...formData, role: val })}
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

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="clay-button border-none"
                style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}
              >
                Save Changes
              </Button>
            </div>
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
              onClick={() => handleDelete(deleteConfirm?.id)}
              className="bg-red-600 text-white"
            >
              Remove User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}