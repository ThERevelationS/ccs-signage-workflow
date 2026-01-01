import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
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
  ArrowUpDown,
  SortAsc
} from "lucide-react";
import EmailGroupsManager from "../components/admin/EmailGroupsManager";
import GmailConnector from "../components/admin/GmailConnector";
import UserManagement from "../components/admin/UserManagement";
import ProjectTrash from "../components/admin/ProjectTrash";
import OrderTrash from "../components/admin/OrderTrash";

const AutomationRule = base44.entities.AutomationRule;
const EmailGroup = base44.entities.EmailGroup;



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
  { value: "order_created", label: "Order Created", category: "Orders" },
  { value: "order_ordered", label: "Order Placed (Ordered)", category: "Orders" },
  { value: "order_received", label: "Order Received", category: "Orders" },
  { value: "order_date_needed_approaching", label: "Order Date Needed Approaching", category: "Orders" },
  { value: "order_customer_name_changed", label: "Customer Name Changed", category: "Order Fields" },
  { value: "order_request_type_changed", label: "Request Type Changed", category: "Order Fields" },
  { value: "order_description_changed", label: "Description Changed", category: "Order Fields" },
  { value: "order_quantity_changed", label: "Quantity Changed", category: "Order Fields" },
  { value: "order_requestor_changed", label: "Requestor Changed", category: "Order Fields" },
  { value: "order_date_needed_changed", label: "Date Needed Changed", category: "Order Fields" },
  { value: "order_date_ordered_changed", label: "Date Ordered Changed", category: "Order Fields" },
  { value: "order_vendor_changed", label: "Vendor Changed", category: "Order Fields" },
  { value: "order_date_received_changed", label: "Date Received Changed", category: "Order Fields" }
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
  { value: "mark_complete", label: "Mark Complete", icon: CheckCircle2, color: "emerald" }
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
  "{{note_text}}", "{{note_type}}", "{{changed_by}}", "{{timestamp}}"
];

const TEAM_MEMBERS = ["Carl", "Twyla", "Brett", "Kyle", "Joe", "Aidin", "Kay", "Brian", "Chris"];

export default function AdminSettings() {
  const [automations, setAutomations] = useState([]);
  const [emailGroups, setEmailGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [sortBy, setSortBy] = useState("name"); // "name", "trigger", "action", "enabled"
  const [sortDirection, setSortDirection] = useState("asc");
  
  const [formData, setFormData] = useState({
    name: "",
    enabled: true,
    priority: 0
  });
  
  const [triggers, setTriggers] = useState([{ trigger_type: "", trigger_condition: {}, logic: "or" }]);
  const [actions, setActions] = useState([{ action_type: "", action_config: {} }]);

  const loadEmailGroups = async () => {
    const groups = await EmailGroup.list();
    setEmailGroups(groups);
  };

  const loadAutomations = async () => {
    setIsLoading(true);
    const rules = await AutomationRule.list("-created_date");
    setAutomations(rules);
    setIsLoading(false);
  };

  useEffect(() => {
    loadAutomations();
    loadEmailGroups();
  }, []);

  const openNewRule = async () => {
    setEditingRule(null);
    await loadEmailGroups();
    setTriggers([{ trigger_type: "", trigger_condition: {}, logic: "or" }]);
    setActions([{ action_type: "", action_config: {} }]);
    setFormData({ name: "", enabled: true, priority: 0 });
    setIsDialogOpen(true);
  };

  const openEditRule = async (rule) => {
    setEditingRule(rule);
    await loadEmailGroups();
    setTriggers(rule.triggers || [{ trigger_type: "", trigger_condition: {}, logic: "or" }]);
    setActions(rule.actions || [{ action_type: "", action_config: {} }]);
    setFormData({
      name: rule.name || "",
      enabled: rule.enabled !== false,
      priority: rule.priority || 0
    });
    setIsDialogOpen(true);
  };

  const duplicateRule = async (rule) => {
    setEditingRule(null);
    await loadEmailGroups();
    setTriggers(rule.triggers || [{ trigger_type: "", trigger_condition: {}, logic: "or" }]);
    setActions(rule.actions || [{ action_type: "", action_config: {} }]);
    setFormData({
      name: `${rule.name} (Copy)`,
      enabled: true,
      priority: rule.priority || 0
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    const saveData = {
      ...formData,
      triggers,
      actions
    };
    
    if (editingRule) {
      await AutomationRule.update(editingRule.id, saveData);
    } else {
      await AutomationRule.create(saveData);
    }
    setIsDialogOpen(false);
    loadAutomations();
  };

  const handleDelete = async (id) => {
    await AutomationRule.delete(id);
    setDeleteConfirm(null);
    loadAutomations();
  };

  const toggleEnabled = async (rule) => {
    await AutomationRule.update(rule.id, { enabled: !rule.enabled });
    loadAutomations();
  };

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

  const groupedTriggers = TRIGGER_TYPES.reduce((acc, trigger) => {
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
                      {RECIPIENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
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
        return <Input className="mt-2" placeholder="Task text" value={config.task || ""} onChange={(e) => updateAction(index, "task", e.target.value)} />;
      
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
          </div>
        );
      
      case "set_due_date":
        return (
          <div className="flex gap-2 mt-2">
            <Input type="number" placeholder="Days" value={config.days || ""} onChange={(e) => updateAction(index, "days", e.target.value)} className="w-20" />
            <Select value={config.direction || "after"} onValueChange={(val) => updateAction(index, "direction", val)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="after">days from now</SelectItem>
                <SelectItem value="before">days before trigger</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      
      case "create_rider":
        return (
          <Select value={config.rider_stage || ""} onValueChange={(val) => updateAction(index, "rider_stage", val)}>
            <SelectTrigger className="mt-2"><SelectValue placeholder="Rider stage" /></SelectTrigger>
            <SelectContent>
              {STAGES.filter(s => s.value !== "completed").map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">


        <Tabs defaultValue="automations" className="space-y-6">
          <TabsList className="clay-card border-none p-2" style={{ background: '#FEE2E2' }}>
                          <TabsTrigger value="automations" className="data-[state=active]:bg-white/80 px-6 py-3 text-base">
                            <Zap className="w-6 h-6 mr-3" />
                            Automations
                          </TabsTrigger>
                          <TabsTrigger value="groups" className="data-[state=active]:bg-white/80 px-6 py-3 text-base">
                            <Mail className="w-6 h-6 mr-3" />
                            Email Groups
                          </TabsTrigger>
                          <TabsTrigger value="users" className="data-[state=active]:bg-white/80 px-6 py-3 text-base">
                            <Users className="w-6 h-6 mr-3" />
                            Users
                          </TabsTrigger>
                          <TabsTrigger value="project_trash" className="data-[state=active]:bg-white/80 px-6 py-3 text-base">
                            <Trash2 className="w-6 h-6 mr-3" />
                            Client Trash
                          </TabsTrigger>
                          <TabsTrigger value="order_trash" className="data-[state=active]:bg-white/80 px-6 py-3 text-base">
                            <Trash2 className="w-6 h-6 mr-3" />
                            Order Trash
                          </TabsTrigger>
                        </TabsList>

          <TabsContent value="groups">
                          <div className="space-y-6">
                            <GmailConnector />
                            <EmailGroupsManager />
                          </div>
                        </TabsContent>

                        <TabsContent value="users">
                          <UserManagement />
                        </TabsContent>

                        <TabsContent value="project_trash">
                          <ProjectTrash />
                        </TabsContent>

                        <TabsContent value="order_trash">
                          <OrderTrash />
                        </TabsContent>

          <TabsContent value="automations">
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
              <Button onClick={openNewRule} className="clay-button border-none text-gray-800"
                style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
                <Plus className="w-5 h-5 mr-2" /> New Automation
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
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
            </div>

            {/* Automations List */}
            {isLoading ? (
              <div className="clay-card p-12 text-center"><p className="text-gray-500">Loading...</p></div>
            ) : automations.length === 0 ? (
              <div className="clay-card p-12 text-center">
                <Zap className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">No Automations</h3>
                <p className="text-gray-500 mb-4">Create your first automation to streamline your workflow</p>
                <Button onClick={openNewRule} className="clay-button"><Plus className="w-4 h-4 mr-2" /> Create First Automation</Button>
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
                        <Switch checked={rule.enabled} onCheckedChange={() => toggleEnabled(rule)} />
                        <Button variant="ghost" size="icon" onClick={() => duplicateRule(rule)} className="h-8 w-8">
                          <Copy className="w-4 h-4 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditRule(rule)} className="h-8 w-8">
                          <Edit className="w-4 h-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(rule)} className="h-8 w-8">
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="clay-card border-none max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                {editingRule ? "Edit Automation" : "Create Automation"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 mt-4">
              {/* Name & Priority */}
              <div className="grid grid-cols-2 gap-4">
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
                          <div className="bg-orange-100 text-orange-700 font-bold px-3 py-1 rounded-lg text-sm">IF</div>
                          <span className="text-gray-600 text-sm">these conditions are met...</span>
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
                          {Object.entries(groupedTriggers).map(([category, list]) => (
                            <div key={category}>
                              <div className="px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-100">{category}</div>
                              {list.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
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

                      {trigger.trigger_type && (
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
                    </div>
                  ))}
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
                            {ACTION_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value}>
                                <div className="flex items-center gap-2">
                                  <t.icon className="w-4 h-4" />
                                  {t.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {renderActionConfig(action, index)}
                      </div>
                    );
                  })}
                </div>
              </div>

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
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={!formData.name || !triggers[0]?.trigger_type || !actions[0]?.action_type}
                  className="clay-button border-none" style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
                  {editingRule ? "Update" : "Create"} Automation
                </Button>
              </div>
            </div>
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
              <AlertDialogAction onClick={() => handleDelete(deleteConfirm?.id)} className="bg-red-600 text-white">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}