import React, { useState, useEffect } from "react";
import { EmailNotificationSettings } from "@/entities/EmailNotificationSettings";
import { EmailGroup } from "@/entities/EmailGroup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import {
  Plus,
  Trash2,
  Edit,
  Mail,
  Bell,
  Settings,
  Copy,
  ChevronDown,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Users,
  ArrowRight
} from "lucide-react";
import EmailGroupsManager from "../components/admin/EmailGroupsManager";

const TRIGGER_TYPES = [
  { value: "work_order_created", label: "Work Order Created", category: "Work Orders" },
  { value: "work_order_completed", label: "Work Order Completed", category: "Work Orders" },
  { value: "work_order_deleted", label: "Work Order Deleted", category: "Work Orders" },
  { value: "rider_created", label: "Rider Created", category: "Work Orders" },
  { value: "stage_changed", label: "Stage Changed (Any)", category: "Stage Movement" },
  { value: "stage_entered", label: "Stage Entered (Specific)", category: "Stage Movement" },
  { value: "stage_exited", label: "Stage Exited (Specific)", category: "Stage Movement" },
  { value: "task_added", label: "Task Added", category: "Tasks" },
  { value: "task_completed", label: "Task Completed", category: "Tasks" },
  { value: "task_deleted", label: "Task Deleted", category: "Tasks" },
  { value: "note_added", label: "Note Added", category: "Notes" },
  { value: "note_deleted", label: "Note Deleted", category: "Notes" },
  { value: "image_uploaded", label: "Image Uploaded", category: "Media" },
  { value: "asap_toggled_on", label: "ASAP Toggled ON", category: "Priority" },
  { value: "asap_toggled_off", label: "ASAP Toggled OFF", category: "Priority" },
  { value: "due_date_approaching", label: "Due Date Approaching", category: "Dates" },
  { value: "due_date_passed", label: "Due Date Passed", category: "Dates" },
  { value: "assigned_to_changed", label: "Assignment Changed", category: "Assignment" },
  { value: "priority_changed", label: "Priority Changed", category: "Priority" },
  { value: "automation_triggered", label: "Automation Triggered", category: "Automations" }
];

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
  "{{note_text}}", "{{note_type}}", "{{changed_by}}", "{{timestamp}}", "{{work_order_id}}"
];

export default function AdminSettings() {
  const [notifications, setNotifications] = useState([]);
  const [emailGroups, setEmailGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [useIftttMode, setUseIftttMode] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    enabled: true,
    trigger_type: "",
    trigger_condition: {},
    recipients: [{ type: "email", value: "" }],
    email_subject: "",
    email_body: "",
    priority: 0
  });

  useEffect(() => {
    loadNotifications();
    loadEmailGroups();
  }, []);

  const loadEmailGroups = async () => {
    const groups = await EmailGroup.list();
    setEmailGroups(groups);
  };

  const loadNotifications = async () => {
    setIsLoading(true);
    const rules = await EmailNotificationSettings.list("-created_date");
    setNotifications(rules);
    setIsLoading(false);
  };

  const openNewRule = () => {
    setEditingRule(null);
    setUseIftttMode(false);
    setFormData({
      name: "",
      enabled: true,
      trigger_type: "",
      trigger_condition: {},
      recipients: [{ type: "email", value: "" }],
      email_subject: "",
      email_body: "",
      priority: 0
    });
    setIsDialogOpen(true);
  };

  const openEditRule = (rule) => {
    setEditingRule(rule);
    setUseIftttMode(false);
    setFormData({
      name: rule.name || "",
      enabled: rule.enabled !== false,
      trigger_type: rule.trigger_type || "",
      trigger_condition: rule.trigger_condition || {},
      recipients: rule.recipients?.length > 0 ? rule.recipients : [{ type: "email", value: "" }],
      email_subject: rule.email_subject || "",
      email_body: rule.email_body || "",
      priority: rule.priority || 0
    });
    setIsDialogOpen(true);
  };

  const duplicateRule = (rule) => {
    setEditingRule(null);
    setUseIftttMode(false);
    setFormData({
      name: `${rule.name} (Copy)`,
      enabled: true,
      trigger_type: rule.trigger_type || "",
      trigger_condition: rule.trigger_condition || {},
      recipients: rule.recipients || [{ type: "email", value: "" }],
      email_subject: rule.email_subject || "",
      email_body: rule.email_body || "",
      priority: rule.priority || 0
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (editingRule) {
      await EmailNotificationSettings.update(editingRule.id, formData);
    } else {
      await EmailNotificationSettings.create(formData);
    }
    setIsDialogOpen(false);
    loadNotifications();
  };

  const handleDelete = async (id) => {
    await EmailNotificationSettings.delete(id);
    setDeleteConfirm(null);
    loadNotifications();
  };

  const toggleEnabled = async (rule) => {
    await EmailNotificationSettings.update(rule.id, { enabled: !rule.enabled });
    loadNotifications();
  };

  const addRecipient = () => {
    setFormData({
      ...formData,
      recipients: [...formData.recipients, { type: "email", value: "" }]
    });
  };

  const removeRecipient = (index) => {
    const updated = formData.recipients.filter((_, i) => i !== index);
    setFormData({ ...formData, recipients: updated });
  };

  const updateRecipient = (index, field, value) => {
    const updated = [...formData.recipients];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, recipients: updated });
  };

  const updateCondition = (field, value) => {
    setFormData({
      ...formData,
      trigger_condition: { ...formData.trigger_condition, [field]: value }
    });
  };

  const insertVariable = (variable, field) => {
    setFormData({
      ...formData,
      [field]: formData[field] + variable
    });
  };

  const groupedTriggers = TRIGGER_TYPES.reduce((acc, trigger) => {
    if (!acc[trigger.category]) acc[trigger.category] = [];
    acc[trigger.category].push(trigger);
    return acc;
  }, {});

  const groupedNotifications = notifications.reduce((acc, rule) => {
    const trigger = TRIGGER_TYPES.find(t => t.value === rule.trigger_type);
    const category = trigger?.category || "Other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(rule);
    return acc;
  }, {});

  const needsStageCondition = ["stage_entered", "stage_exited"].includes(formData.trigger_type);
  const needsFromToStage = formData.trigger_type === "stage_changed";

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="clay-card p-3">
              <Settings className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Admin Settings</h1>
              <p className="text-gray-600 text-sm">Configure email notifications and groups</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="notifications" className="space-y-6">
          <TabsList className="clay-card border-none p-1">
            <TabsTrigger value="notifications" className="data-[state=active]:bg-white/80">
              <Bell className="w-4 h-4 mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="groups" className="data-[state=active]:bg-white/80">
              <Users className="w-4 h-4 mr-2" />
              Email Groups
            </TabsTrigger>
          </TabsList>

          <TabsContent value="groups">
            <EmailGroupsManager />
          </TabsContent>

          <TabsContent value="notifications">
            <div className="flex justify-end mb-4">
              <Button
                onClick={openNewRule}
                className="clay-button border-none text-gray-800"
                style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}
              >
                <Plus className="w-5 h-5 mr-2" />
                New Notification Rule
              </Button>
            </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="clay-card p-4">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-gray-800">{notifications.length}</p>
                <p className="text-xs text-gray-500">Total Rules</p>
              </div>
            </div>
          </div>
          <div className="clay-card p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-gray-800">
                  {notifications.filter(n => n.enabled).length}
                </p>
                <p className="text-xs text-gray-500">Active Rules</p>
              </div>
            </div>
          </div>
          <div className="clay-card p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <div>
                <p className="text-2xl font-bold text-gray-800">
                  {notifications.filter(n => !n.enabled).length}
                </p>
                <p className="text-xs text-gray-500">Disabled Rules</p>
              </div>
            </div>
          </div>
          <div className="clay-card p-4">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-purple-600" />
              <div>
                <p className="text-2xl font-bold text-gray-800">
                  {Object.keys(groupedNotifications).length}
                </p>
                <p className="text-xs text-gray-500">Categories</p>
              </div>
            </div>
          </div>
        </div>

        {/* Notification Rules by Category */}
        {isLoading ? (
          <div className="clay-card p-12 text-center">
            <p className="text-gray-500">Loading notification rules...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="clay-card p-12 text-center">
            <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Notification Rules</h3>
            <p className="text-gray-500 mb-4">Create your first rule to start receiving email notifications</p>
            <Button onClick={openNewRule} className="clay-button">
              <Plus className="w-4 h-4 mr-2" />
              Create First Rule
            </Button>
          </div>
        ) : (
          <Accordion type="multiple" className="space-y-4">
            {Object.entries(groupedNotifications).map(([category, rules]) => (
              <AccordionItem key={category} value={category} className="clay-card border-none">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      {rules.length}
                    </Badge>
                    <span className="font-semibold">{category}</span>
                    <span className="text-xs text-gray-400">
                      ({rules.filter(r => r.enabled).length} active)
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-3">
                    {rules.map((rule) => (
                      <div
                        key={rule.id}
                        className={`p-4 rounded-xl border transition-all ${
                          rule.enabled 
                            ? 'bg-white/80 border-gray-200' 
                            : 'bg-gray-100/50 border-gray-300 opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium text-gray-800">{rule.name}</h4>
                              <Badge 
                                className="text-xs"
                                style={{
                                  background: rule.enabled 
                                    ? 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' 
                                    : '#E5E7EB'
                                }}
                              >
                                {TRIGGER_TYPES.find(t => t.value === rule.trigger_type)?.label || rule.trigger_type}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">
                              Subject: {rule.email_subject?.substring(0, 60)}...
                            </p>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <Mail className="w-3 h-3" />
                              <span>
                                {rule.recipients?.map(r => 
                                  r.type === 'email' ? r.value : 
                                  RECIPIENT_TYPES.find(rt => rt.value === r.type)?.label
                                ).join(", ")}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={rule.enabled}
                              onCheckedChange={() => toggleEnabled(rule)}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => duplicateRule(rule)}
                              className="h-8 w-8"
                            >
                              <Copy className="w-4 h-4 text-gray-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditRule(rule)}
                              className="h-8 w-8"
                            >
                              <Edit className="w-4 h-4 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteConfirm(rule)}
                              className="h-8 w-8"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}

          </TabsContent>
        </Tabs>

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="clay-card border-none max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                {editingRule ? "Edit Notification Rule" : "Create Notification Rule"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 mt-4">
              {/* Mode Toggle */}
              {!editingRule && (
                <div className="clay-card p-3 bg-purple-50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-medium">Use IFTTT-style builder</span>
                  </div>
                  <Switch
                    checked={useIftttMode}
                    onCheckedChange={setUseIftttMode}
                  />
                </div>
              )}

              {/* IFTTT Mode */}
              {useIftttMode && !editingRule ? (
                <div className="space-y-4">
                  <div className="clay-card p-4 bg-gradient-to-r from-orange-50 to-yellow-50">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="bg-orange-100 text-orange-700 font-bold px-3 py-1 rounded-lg text-sm">IF</div>
                      <span className="text-gray-600 text-sm">this happens...</span>
                    </div>
                    <Select
                      value={formData.trigger_type}
                      onValueChange={(val) => setFormData({ ...formData, trigger_type: val, trigger_condition: {} })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a trigger event" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(groupedTriggers).map(([category, triggers]) => (
                          <div key={category}>
                            <div className="px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-100">
                              {category}
                            </div>
                            {triggers.map((trigger) => (
                              <SelectItem key={trigger.value} value={trigger.value}>
                                {trigger.label}
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Stage conditions for IFTTT */}
                    {needsStageCondition && (
                      <div className="mt-3">
                        <Select
                          value={formData.trigger_condition.stage || ""}
                          onValueChange={(val) => updateCondition("stage", val)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select specific stage" />
                          </SelectTrigger>
                          <SelectContent>
                            {STAGES.map((stage) => (
                              <SelectItem key={stage.value} value={stage.value}>
                                {stage.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-center">
                    <ArrowRight className="w-6 h-6 text-gray-400" />
                  </div>

                  <div className="clay-card p-4 bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded-lg text-sm">THEN</div>
                      <span className="text-gray-600 text-sm">send email to...</span>
                    </div>
                    <div className="space-y-2">
                      {formData.recipients.map((recipient, index) => (
                        <div key={index} className="flex gap-2">
                          <Select
                            value={recipient.type}
                            onValueChange={(val) => updateRecipient(index, "type", val)}
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RECIPIENT_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {recipient.type === "email" && (
                            <Input
                              placeholder="email@example.com"
                              value={recipient.value || ""}
                              onChange={(e) => updateRecipient(index, "value", e.target.value)}
                              className="flex-1"
                            />
                          )}
                          {recipient.type === "email_group" && (
                            <Select
                              value={recipient.value || ""}
                              onValueChange={(val) => updateRecipient(index, "value", val)}
                            >
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Select group" />
                              </SelectTrigger>
                              <SelectContent>
                                {emailGroups.map((group) => (
                                  <SelectItem key={group.id} value={group.id}>
                                    {group.name} ({group.emails?.length || 0} emails)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {recipient.type === "custom_list" && (
                            <Input
                              placeholder="email1@example.com, email2@example.com"
                              value={recipient.value || ""}
                              onChange={(e) => updateRecipient(index, "value", e.target.value)}
                              className="flex-1"
                            />
                          )}
                          {formData.recipients.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeRecipient(index)}
                              className="h-10 w-10"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button variant="ghost" size="sm" onClick={addRecipient} className="h-7 text-xs">
                        <Plus className="w-3 h-3 mr-1" />
                        Add Recipient
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Rule Name *</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Notify admin on completion"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Priority (lower = first)</Label>
                      <Input
                        type="number"
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Email Subject *</Label>
                    <Input
                      value={formData.email_subject}
                      onChange={(e) => setFormData({ ...formData, email_subject: e.target.value })}
                      placeholder="e.g., Work Order {{title}} has been completed"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Email Body *</Label>
                    <Textarea
                      value={formData.email_body}
                      onChange={(e) => setFormData({ ...formData, email_body: e.target.value })}
                      placeholder="Enter the email body content..."
                      className="mt-1 min-h-24"
                    />
                  </div>

                  <div className="clay-card p-3 bg-blue-50">
                    <Label className="text-xs font-medium mb-2 block">Variables (click to insert)</Label>
                    <div className="flex flex-wrap gap-1">
                      {TEMPLATE_VARIABLES.slice(0, 8).map((variable) => (
                        <Button
                          key={variable}
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs px-2"
                          onClick={() => insertVariable(variable, "email_body")}
                        >
                          {variable}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Standard Mode - Basic Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Rule Name *</Label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Notify admin on completion"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Priority (lower = first)</Label>
                      <Input
                        type="number"
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                        className="mt-1"
                      />
                    </div>
                  </div>

              {/* Trigger Type */}
              <div>
                <Label>Trigger Type *</Label>
                <Select
                  value={formData.trigger_type}
                  onValueChange={(val) => setFormData({ ...formData, trigger_type: val, trigger_condition: {} })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select when to send notification" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(groupedTriggers).map(([category, triggers]) => (
                      <div key={category}>
                        <div className="px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-100">
                          {category}
                        </div>
                        {triggers.map((trigger) => (
                          <SelectItem key={trigger.value} value={trigger.value}>
                            {trigger.label}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Conditional Fields based on trigger type */}
              {needsStageCondition && (
                <div>
                  <Label>Specific Stage</Label>
                  <Select
                    value={formData.trigger_condition.stage || ""}
                    onValueChange={(val) => updateCondition("stage", val)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map((stage) => (
                        <SelectItem key={stage.value} value={stage.value}>
                          {stage.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {needsFromToStage && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>From Stage (optional)</Label>
                    <Select
                      value={formData.trigger_condition.from_stage || ""}
                      onValueChange={(val) => updateCondition("from_stage", val)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Any stage" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>Any Stage</SelectItem>
                        {STAGES.map((stage) => (
                          <SelectItem key={stage.value} value={stage.value}>
                            {stage.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>To Stage (optional)</Label>
                    <Select
                      value={formData.trigger_condition.to_stage || ""}
                      onValueChange={(val) => updateCondition("to_stage", val)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Any stage" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>Any Stage</SelectItem>
                        {STAGES.map((stage) => (
                          <SelectItem key={stage.value} value={stage.value}>
                            {stage.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Additional Filters */}
              <div className="clay-card p-4 bg-gray-50">
                <Label className="text-sm font-medium mb-3 block">Additional Filters (Optional)</Label>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.trigger_condition.is_asap === true}
                      onCheckedChange={(checked) => updateCondition("is_asap", checked ? true : undefined)}
                    />
                    <Label className="text-sm">ASAP Only</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.trigger_condition.is_rider === true}
                      onCheckedChange={(checked) => updateCondition("is_rider", checked ? true : undefined)}
                    />
                    <Label className="text-sm">Riders Only</Label>
                  </div>
                  <div>
                    <Input
                      placeholder="Filter by assignee"
                      value={formData.trigger_condition.assigned_to || ""}
                      onChange={(e) => updateCondition("assigned_to", e.target.value || undefined)}
                      className="text-sm h-8"
                    />
                  </div>
                </div>
              </div>

              {/* Recipients */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Recipients *</Label>
                  <Button variant="ghost" size="sm" onClick={addRecipient} className="h-7 text-xs">
                    <Plus className="w-3 h-3 mr-1" />
                    Add Recipient
                  </Button>
                </div>
                <div className="space-y-2">
                  {formData.recipients.map((recipient, index) => (
                    <div key={index} className="flex gap-2">
                      <Select
                        value={recipient.type}
                        onValueChange={(val) => updateRecipient(index, "type", val)}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RECIPIENT_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {recipient.type === "email" && (
                        <Input
                          placeholder="email@example.com"
                          value={recipient.value || ""}
                          onChange={(e) => updateRecipient(index, "value", e.target.value)}
                          className="flex-1"
                        />
                      )}
                      {recipient.type === "custom_list" && (
                        <Input
                          placeholder="email1@example.com, email2@example.com"
                          value={recipient.value || ""}
                          onChange={(e) => updateRecipient(index, "value", e.target.value)}
                          className="flex-1"
                        />
                      )}
                      {recipient.type === "email_group" && (
                        <Select
                          value={recipient.value || ""}
                          onValueChange={(val) => updateRecipient(index, "value", val)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select group" />
                          </SelectTrigger>
                          <SelectContent>
                            {emailGroups.map((group) => (
                              <SelectItem key={group.id} value={group.id}>
                                {group.name} ({group.emails?.length || 0} emails)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {formData.recipients.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRecipient(index)}
                          className="h-10 w-10"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Email Template */}
              <div>
                <Label>Email Subject *</Label>
                <Input
                  value={formData.email_subject}
                  onChange={(e) => setFormData({ ...formData, email_subject: e.target.value })}
                  placeholder="e.g., Work Order {{title}} has been completed"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Email Body *</Label>
                <Textarea
                  value={formData.email_body}
                  onChange={(e) => setFormData({ ...formData, email_body: e.target.value })}
                  placeholder="Enter the email body content..."
                  className="mt-1 min-h-32"
                />
              </div>

              {/* Variable Helper */}
              <div className="clay-card p-3 bg-blue-50">
                <Label className="text-xs font-medium mb-2 block">Available Variables (click to insert)</Label>
                <div className="flex flex-wrap gap-1">
                  {TEMPLATE_VARIABLES.map((variable) => (
                    <Button
                      key={variable}
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => insertVariable(variable, "email_body")}
                    >
                      {variable}
                    </Button>
                  ))}
                </div>
              </div>

                </>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!formData.name || !formData.trigger_type || !formData.email_subject || !formData.email_body}
                  className="clay-button border-none"
                  style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}
                >
                  {editingRule ? "Update Rule" : "Create Rule"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <AlertDialogContent className="clay-card border-none">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Notification Rule?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleDelete(deleteConfirm?.id)}
                className="bg-red-600 text-white"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}