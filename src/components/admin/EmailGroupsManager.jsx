import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Trash2, Edit, Users, Mail, X } from "lucide-react";
import { createEmailGroupIfAbsent, deleteEmailGroupIfUnused, updateEmailGroupIfUnchanged } from "@/components/admin/emailGroupPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const EmailGroup = base44.entities.EmailGroup;
const AutomationRule = base44.entities.AutomationRule;

export default function EmailGroupsManager() {
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [newEmail, setNewEmail] = useState("");
  const [persistenceError, setPersistenceError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    emails: []
  });

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    setIsLoading(true);
    try {
      const data = await loadAllEntityRows({
        entity: EmailGroup,
        sort: "-created_date",
        label: "Email Groups admin catalog",
      });
      setGroups(data || []);
    } catch (error) {
      console.error("Error loading email groups:", error);
      setPersistenceError(error?.message || "Email groups could not be loaded safely.");
    } finally {
      setIsLoading(false);
    }
  };

  const openNewGroup = () => {
    setPersistenceError("");
    setEditingGroup(null);
    setFormData({ name: "", description: "", emails: [] });
    setNewEmail("");
    setIsDialogOpen(true);
  };

  const openEditGroup = (group) => {
    setPersistenceError("");
    setEditingGroup(group);
    setFormData({
      name: group.name || "",
      description: group.description || "",
      emails: group.emails || []
    });
    setNewEmail("");
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (isSaving || !formData.name || formData.emails.length === 0) return;
    setIsSaving(true);
    setPersistenceError("");
    try {
      if (editingGroup) {
        await updateEmailGroupIfUnchanged({
          entity: EmailGroup,
          group: editingGroup,
          nextFields: formData,
          label: `Email group ${editingGroup.name || editingGroup.id}`,
        });
      } else {
        const result = await createEmailGroupIfAbsent({
          entity: EmailGroup,
          data: formData,
          label: `Email group ${formData.name}`,
        });
        if (result.status === "existing") {
          throw new Error(`An email group named "${formData.name}" already exists. The existing group was kept instead of creating a duplicate.`);
        }
      }
      setIsDialogOpen(false);
      setEditingGroup(null);
      await loadGroups();
    } catch (error) {
      console.error("Email group save blocked:", error);
      setPersistenceError(error?.message || "The email group could not be saved safely.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (group) => {
    if (!group?.id || isSaving) return;
    setIsSaving(true);
    setPersistenceError("");
    try {
      await deleteEmailGroupIfUnused({
        entity: EmailGroup,
        automationRuleEntity: AutomationRule,
        group,
        label: `Email group ${group.name || group.id} deletion`,
      });
      setDeleteConfirm(null);
      await loadGroups();
    } catch (error) {
      console.error("Email group deletion blocked:", error);
      setPersistenceError(error?.message || "The email group changed or is still in use and was not deleted.");
      setDeleteConfirm(null);
      await loadGroups();
    } finally {
      setIsSaving(false);
    }
  };

  const addEmail = () => {
    if (newEmail && !formData.emails.includes(newEmail)) {
      setFormData({ ...formData, emails: [...formData.emails, newEmail] });
      setNewEmail("");
    }
  };

  const removeEmail = (email) => {
    setFormData({ ...formData, emails: formData.emails.filter(e => e !== email) });
  };

  return (
    <div className="clay-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-800">Email Groups</h2>
        </div>
        <Button
          onClick={openNewGroup}
          size="sm"
          className="clay-button border-none text-gray-800 h-8"
          style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}
        >
          <Plus className="w-4 h-4 mr-1" />
          New Group
        </Button>
      </div>

      {persistenceError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">Email group update blocked</div>
            <div className="mt-1 text-xs">{persistenceError}</div>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0 border-red-300 bg-white text-red-800" onClick={async () => { setPersistenceError(""); await loadGroups(); }}>Reload latest</Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading groups...</p>
      ) : groups.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No email groups yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div
              key={group.id}
              className="p-3 rounded-xl border bg-white/80 border-gray-200"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium text-gray-800">{group.name}</h4>
                  {group.description && (
                    <p className="text-xs text-gray-500 mt-1">{group.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {group.emails?.slice(0, 3).map((email) => (
                      <Badge key={email} variant="outline" className="text-xs">
                        {email}
                      </Badge>
                    ))}
                    {group.emails?.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{group.emails.length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditGroup(group)}
                    className="h-7 w-7"
                  >
                    <Edit className="w-3 h-3 text-blue-600" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteConfirm(group)}
                    className="h-7 w-7"
                  >
                    <Trash2 className="w-3 h-3 text-red-600" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="clay-card border-none max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? "Edit Email Group" : "Create Email Group"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Label>Group Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Sales Team"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description..."
                className="mt-1 min-h-16"
              />
            </div>

            <div>
              <Label>Email Addresses *</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@example.com"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
                />
                <Button onClick={addEmail} size="sm" className="h-10">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {formData.emails.map((email) => (
                  <Badge key={email} className="flex items-center gap-1 py-1 px-2">
                    <Mail className="w-3 h-3" />
                    {email}
                    <button onClick={() => removeEmail(email)} className="ml-1 hover:text-red-600">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || !formData.name || formData.emails.length === 0}
                className="clay-button border-none"
                style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}
              >
                {editingGroup ? "Update Group" : "Create Group"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Email Group?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete(deleteConfirm)}
              className="bg-red-600 text-white"
              disabled={isSaving}
            >
              {isSaving ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}