import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Edit, Copy, CheckCircle2, AlertTriangle, Loader2, UserCheck, ChevronDown, ChevronUp } from "lucide-react";
import { loadSingleGlobalSetting, saveGlobalSettingValueIfUnchanged } from "@/components/shared/globalSettingsPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { staffEntities } from "@/components/staff/staffEntities";

const GlobalSettings = staffEntities.GlobalSettings;
const AuthorizedEmail = staffEntities.AuthorizedEmail;
const WorkOrder = staffEntities.WorkOrder;

const SETTING_KEY = "taskAssignmentRules";

const STAGES = [
  { value: "estimating", label: "Estimating" },
  { value: "sales", label: "Sales" },
  { value: "permitting", label: "Permitting" },
  { value: "design", label: "Design" },
  { value: "production", label: "Production" },
  { value: "fabrication", label: "Fabrication" },
  { value: "installation", label: "Installation" },
  { value: "completed", label: "Completed" },
];

const ASSIGNABLE_FIELDS = [
  { value: "current_task_assigned_to", label: "Task Assigned To" },
  { value: "designer", label: "Designer" },
  { value: "project_manager", label: "Project Manager" },
  { value: "estimator", label: "Estimator" },
  { value: "surveyor", label: "Surveyor" },
  { value: "sales_rep", label: "Sales Rep" },
];

const CONDITION_FIELDS = [
  { value: "current_task_description", label: "Task Description" },
  { value: "current_stage", label: "Stage" },
  { value: "sales_status", label: "Sales Status" },
  { value: "lead_source", label: "Lead Source" },
  { value: "current_task_assigned_to", label: "Task Assigned To" },
  { value: "designer", label: "Designer" },
  { value: "project_manager", label: "Project Manager" },
  { value: "estimator", label: "Estimator" },
  { value: "production_type", label: "Production Type" },
];

const CONDITION_OPERATORS = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "equals" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "not_contains", label: "does not contain" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

const ONLY_IF_OPTS = [
  { value: "always", label: "Always overwrite" },
  { value: "if_empty", label: "Only if field is currently empty" },
  { value: "if_unchanged", label: "Only if field was not manually set" },
];

const defaultRule = () => ({
  id: crypto.randomUUID(),
  name: "",
  enabled: true,
  priority: 0,
  conditions: [{ field: "current_task_description", operator: "contains", value: "", logic: "and" }],
  assignments: [{ field: "current_task_assigned_to", person: "", only_if: "if_empty" }],
  apply_on: ["update", "create"],
});

function ConditionRow({ cond, index, users, onChange, onRemove, isFirst }) {
  return (
    <div className="flex flex-wrap gap-2 items-center p-2 bg-orange-50/60 rounded-lg border border-orange-100">
      {!isFirst && (
        <Select value={cond.logic || "and"} onValueChange={(v) => onChange("logic", v)}>
          <SelectTrigger className="w-16 h-7 text-xs border-orange-200 font-bold text-orange-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="and">AND</SelectItem>
            <SelectItem value="or">OR</SelectItem>
          </SelectContent>
        </Select>
      )}
      <Select value={cond.field} onValueChange={(v) => onChange("field", v)}>
        <SelectTrigger className="w-44 h-7 text-xs">
          <SelectValue placeholder="Field" />
        </SelectTrigger>
        <SelectContent>
          {CONDITION_FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={cond.operator} onValueChange={(v) => onChange("operator", v)}>
        <SelectTrigger className="w-36 h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CONDITION_OPERATORS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {!["is_empty", "is_not_empty"].includes(cond.operator) && (
        cond.field === "current_stage" ? (
          <Select value={cond.value} onValueChange={(v) => onChange("value", v)}>
            <SelectTrigger className="w-36 h-7 text-xs">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={cond.value || ""}
            onChange={(e) => onChange("value", e.target.value)}
            placeholder="Value..."
            className="h-7 text-xs w-40"
          />
        )
      )}
      <button onClick={onRemove} className="ml-auto text-red-400 hover:text-red-600 p-1">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function AssignmentRow({ assign, index, users, onChange, onRemove }) {
  return (
    <div className="flex flex-wrap gap-2 items-center p-2 bg-blue-50/60 rounded-lg border border-blue-100">
      <Select value={assign.field} onValueChange={(v) => onChange("field", v)}>
        <SelectTrigger className="w-44 h-7 text-xs">
          <SelectValue placeholder="Assign field" />
        </SelectTrigger>
        <SelectContent>
          {ASSIGNABLE_FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <span className="text-xs text-gray-500">â†’</span>
      <Select value={assign.person} onValueChange={(v) => onChange("person", v)}>
        <SelectTrigger className="w-44 h-7 text-xs">
          <SelectValue placeholder="Person" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__clear__">Clear / Remove</SelectItem>
          {users.map(u => <SelectItem key={u.id} value={u.full_name || u.email}>{u.full_name || u.email}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={assign.only_if || "if_empty"} onValueChange={(v) => onChange("only_if", v)}>
        <SelectTrigger className="w-48 h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ONLY_IF_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <button onClick={onRemove} className="ml-auto text-red-400 hover:text-red-600 p-1">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function RuleCard({ rule, users, onEdit, onDuplicate, onDelete, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`clay-card p-4 ${!rule.enabled ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-gray-800 text-sm">{rule.name || "Unnamed Rule"}</span>
            <Badge className="text-xs bg-orange-50 text-orange-700">{rule.conditions?.length || 0} condition{rule.conditions?.length !== 1 ? "s" : ""}</Badge>
            <Badge className="text-xs bg-blue-50 text-blue-700">{rule.assignments?.length || 0} assignment{rule.assignments?.length !== 1 ? "s" : ""}</Badge>
            {rule.priority > 0 && <Badge className="text-xs bg-gray-100 text-gray-600">Priority {rule.priority}</Badge>}
          </div>
          {!expanded && (
            <div className="flex flex-wrap gap-1 text-xs text-gray-500 mt-1">
              {rule.assignments?.slice(0, 3).map((a, i) => {
                const fieldLabel = ASSIGNABLE_FIELDS.find(f => f.value === a.field)?.label || a.field;
                return <span key={i} className="bg-blue-50 px-1.5 py-0.5 rounded">{fieldLabel} â†’ {a.person === "__clear__" ? "Clear" : a.person}</span>;
              })}
            </div>
          )}
          {expanded && (
            <div className="mt-3 space-y-2 text-xs">
              <p className="font-medium text-gray-600">Conditions:</p>
              {rule.conditions?.map((c, i) => {
                const fieldLabel = CONDITION_FIELDS.find(f => f.value === c.field)?.label || c.field;
                const opLabel = CONDITION_OPERATORS.find(o => o.value === c.operator)?.label || c.operator;
                return (
                  <div key={i} className="flex items-center gap-1 text-gray-600">
                    {i > 0 && <span className="font-bold text-orange-600 w-6">{c.logic?.toUpperCase()}</span>}
                    <span className="bg-orange-50 px-2 py-0.5 rounded">{fieldLabel} <em>{opLabel}</em> {c.value && `"${c.value}"`}</span>
                  </div>
                );
              })}
              <p className="font-medium text-gray-600 mt-2">Assignments:</p>
              {rule.assignments?.map((a, i) => {
                const fieldLabel = ASSIGNABLE_FIELDS.find(f => f.value === a.field)?.label || a.field;
                const onlyIfLabel = ONLY_IF_OPTS.find(o => o.value === a.only_if)?.label || a.only_if;
                return (
                  <div key={i} className="bg-blue-50 px-2 py-0.5 rounded text-gray-600">
                    {fieldLabel} â†’ <strong>{a.person === "__clear__" ? "Clear" : a.person}</strong> <span className="text-gray-400">({onlyIfLabel})</span>
                  </div>
                );
              })}
              <p className="text-gray-400 mt-1">Applies on: {rule.apply_on?.join(", ") || "update, create"}</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setExpanded(!expanded)} className="p-1 text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <Switch checked={rule.enabled} onCheckedChange={() => onToggle(rule)} />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDuplicate(rule)}><Copy className="w-3.5 h-3.5 text-gray-500" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(rule)}><Edit className="w-3.5 h-3.5 text-blue-600" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(rule)}><Trash2 className="w-3.5 h-3.5 text-red-600" /></Button>
        </div>
      </div>
    </div>
  );
}

export default function TaskAssignmentRules() {
  const [rules, setRules] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [settingRecord, setSettingRecord] = useState(null);
  const [settingsError, setSettingsError] = useState("");

  // Form state
  const [form, setForm] = useState(defaultRule());

  const load = async () => {
    setLoading(true);
    try {
      const [record, usersData] = await Promise.all([
        loadSingleGlobalSetting({ entity: GlobalSettings, settingKey: SETTING_KEY, label: "Task assignment rules" }),
        loadAllEntityRows({ entity: AuthorizedEmail, sort: null, label: "Task assignment authorized users" })
      ]);
      setSettingRecord(record);
      setRules(record?.setting_value?.rules || []);
      setUsers(usersData);
    } catch (error) {
      console.error("Error loading task assignment rules:", error);
      setSettingsError(error?.message || "Task assignment rules could not be loaded safely.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const persist = async (updatedRules) => {
    setSaving(true);
    setSettingsError("");
    try {
      const saved = await saveGlobalSettingValueIfUnchanged({
        entity: GlobalSettings,
        loadedRecord: settingRecord,
        settingKey: SETTING_KEY,
        nextValue: { rules: updatedRules },
        label: "Task assignment rules",
      });
      setSettingRecord(saved);
      setRules(saved?.setting_value?.rules || updatedRules);
      return true;
    } catch (error) {
      console.error("Task assignment rules save blocked:", error);
      setSettingsError(error?.message || "Task assignment rules changed in another session. Reload before saving.");
      await load();
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openNew = () => {
    setEditingRule(null);
    setForm(defaultRule());
    setTestResult(null);
    setDialogOpen(true);
  };

  const openEdit = (rule) => {
    setEditingRule(rule);
    setForm({ ...rule });
    setTestResult(null);
    setDialogOpen(true);
  };

  const openDuplicate = (rule) => {
    setEditingRule(null);
    setForm({ ...rule, id: crypto.randomUUID(), name: `${rule.name} (Copy)` });
    setTestResult(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const updated = editingRule
      ? rules.map(r => r.id === editingRule.id ? form : r)
      : [...rules, form];
    const saved = await persist(updated);
    if (saved) setDialogOpen(false);
  };

  const handleToggle = async (rule) => {
    const updated = rules.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r);
    await persist(updated);
  };

  const handleDelete = async (rule) => {
    const updated = rules.filter(r => r.id !== rule.id);
    const saved = await persist(updated);
    if (saved) setDeleteConfirm(null);
  };

  // Condition helpers
  const addCondition = () => setForm(f => ({ ...f, conditions: [...f.conditions, { field: "current_task_description", operator: "contains", value: "", logic: "and" }] }));
  const removeCondition = (i) => setForm(f => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }));
  const updateCondition = (i, key, val) => setForm(f => {
    const updated = [...f.conditions];
    updated[i] = { ...updated[i], [key]: val };
    return { ...f, conditions: updated };
  });

  // Assignment helpers
  const addAssignment = () => setForm(f => ({ ...f, assignments: [...f.assignments, { field: "current_task_assigned_to", person: "", only_if: "if_empty" }] }));
  const removeAssignment = (i) => setForm(f => ({ ...f, assignments: f.assignments.filter((_, idx) => idx !== i) }));
  const updateAssignment = (i, key, val) => setForm(f => {
    const updated = [...f.assignments];
    updated[i] = { ...updated[i], [key]: val };
    return { ...f, assignments: updated };
  });

  // Run test against real work orders
  const runTest = async () => {
    setTestLoading(true);
    setTestResult(null);
    const wos = await WorkOrder.filter({ deleted: { $ne: true }, completed: { $ne: true } }, "-updated_date", 50);
    let matched = 0;
    const examples = [];

    for (const wo of wos) {
      if (matchesRule(form, wo)) {
        matched++;
        if (examples.length < 3) {
          const preview = {};
          for (const assign of form.assignments) {
            const current = wo[assign.field];
            const shouldApply = assign.only_if === "always" || (assign.only_if === "if_empty" && !current);
            preview[assign.field] = { current, wouldSet: assign.person === "__clear__" ? "" : assign.person, applies: shouldApply };
          }
          examples.push({ title: wo.title || wo.client_name, preview });
        }
      }
    }
    setTestResult({ matched, total: wos.length, examples });
    setTestLoading(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>;
  }

  const enabledCount = rules.filter(r => r.enabled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-blue-600" />
            Task Assignment Rules
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Automatically assign team members to fields when conditions are met on save.
          </p>
        </div>
        <Button onClick={openNew} className="clay-button border-none text-gray-800"
          style={{ background: "linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)" }}>
          <Plus className="w-4 h-4 mr-1" /> New Rule
        </Button>
      </div>

      {settingsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">Task assignment rules update blocked</div>
            <div className="mt-1 text-xs">{settingsError}</div>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0 border-red-300 bg-white text-red-800" onClick={async () => { setSettingsError(""); await load(); }}>Reload latest</Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="clay-card p-4 flex items-center gap-3">
          <UserCheck className="w-5 h-5 text-blue-600" />
          <div><p className="text-2xl font-bold">{rules.length}</p><p className="text-xs text-gray-500">Total Rules</p></div>
        </div>
        <div className="clay-card p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <div><p className="text-2xl font-bold">{enabledCount}</p><p className="text-xs text-gray-500">Active</p></div>
        </div>
        <div className="clay-card p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          <div><p className="text-2xl font-bold">{rules.length - enabledCount}</p><p className="text-xs text-gray-500">Disabled</p></div>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">How it works:</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-700 text-xs">
          <li>Rules are evaluated whenever a work order is <strong>created or updated</strong> in the Sales Pipeline.</li>
          <li>Conditions are matched against the work order's current field values.</li>
          <li>When matched, assignments are applied based on the "Only if" setting you choose.</li>
          <li>Rules with lower priority numbers run first. Multiple rules can apply to the same record.</li>
        </ul>
      </div>

      {/* Rules List */}
      {rules.length === 0 ? (
        <div className="clay-card p-12 text-center">
          <UserCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No rules yet</p>
          <p className="text-gray-400 text-sm mt-1">Create a rule to automatically assign team members based on task descriptions, stages, and more.</p>
          <Button onClick={openNew} className="mt-4 clay-button border-none text-gray-700" style={{ background: "linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)" }}>
            <Plus className="w-4 h-4 mr-1" /> Create First Rule
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {[...rules].sort((a, b) => (a.priority || 0) - (b.priority || 0)).map(rule => (
            <RuleCard key={rule.id} rule={rule} users={users}
              onEdit={openEdit} onDuplicate={openDuplicate}
              onDelete={(r) => setDeleteConfirm(r)} onToggle={handleToggle} />
          ))}
        </div>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="clay-card border-none max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-blue-600" />
              {editingRule ? "Edit Rule" : "New Assignment Rule"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Name & Priority */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Rule Name *</Label>
                <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Assign Designer on Design tasks" className="mt-1" />
              </div>
              <div>
                <Label>Priority (lower = first)</Label>
                <Input type="number" value={form.priority || 0}
                  onChange={(e) => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
                  className="mt-1" />
              </div>
            </div>

            {/* Apply On */}
            <div>
              <Label className="text-sm font-medium">Apply On</Label>
              <div className="flex gap-4 mt-2">
                {["create", "update"].map(evt => (
                  <label key={evt} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox"
                      checked={(form.apply_on || ["create", "update"]).includes(evt)}
                      onChange={(e) => {
                        const cur = form.apply_on || ["create", "update"];
                        setForm(f => ({ ...f, apply_on: e.target.checked ? [...cur, evt] : cur.filter(v => v !== evt) }));
                      }}
                      className="rounded"
                    />
                    <span className="text-sm capitalize">{evt}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Conditions */}
            <div className="rounded-xl p-4 border border-orange-200 bg-gradient-to-br from-orange-50 to-yellow-50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded text-sm">IF</span>
                  <span className="text-sm text-gray-600">these conditions match...</span>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addCondition}>
                  <Plus className="w-3 h-3 mr-1" /> Add Condition
                </Button>
              </div>
              {form.conditions.map((cond, i) => (
                <ConditionRow key={i} cond={cond} index={i} users={users} isFirst={i === 0}
                  onChange={(k, v) => updateCondition(i, k, v)}
                  onRemove={() => removeCondition(i)} />
              ))}
              {form.conditions.length === 0 && (
                <p className="text-xs text-orange-400 italic">No conditions = rule always applies (use carefully)</p>
              )}
            </div>

            {/* Assignments */}
            <div className="rounded-xl p-4 border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded text-sm">THEN</span>
                  <span className="text-sm text-gray-600">apply these assignments...</span>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addAssignment}>
                  <Plus className="w-3 h-3 mr-1" /> Add Assignment
                </Button>
              </div>
              {form.assignments.map((assign, i) => (
                <AssignmentRow key={i} assign={assign} index={i} users={users}
                  onChange={(k, v) => updateAssignment(i, k, v)}
                  onRemove={() => removeAssignment(i)} />
              ))}
              {form.assignments.length === 0 && (
                <p className="text-xs text-blue-400 italic">Add at least one assignment</p>
              )}
            </div>

            {/* Test Section */}
            <div className="border rounded-xl p-4 bg-gray-50 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-gray-700">Test Against Live Data</Label>
                <Button variant="outline" size="sm" onClick={runTest} disabled={testLoading} className="h-8 text-xs">
                  {testLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Run Test (last 50 records)
                </Button>
              </div>
              {testResult && (
                <div className="text-sm space-y-2">
                  <p className="font-medium text-gray-700">
                    Matched <span className="text-green-600 font-bold">{testResult.matched}</span> of {testResult.total} records
                  </p>
                  {testResult.examples.map((ex, i) => (
                    <div key={i} className="bg-white rounded-lg border p-3 text-xs space-y-1">
                      <p className="font-semibold text-gray-700">{ex.title}</p>
                      {Object.entries(ex.preview).map(([field, info]) => {
                        const label = ASSIGNABLE_FIELDS.find(f => f.value === field)?.label || field;
                        return (
                          <div key={field} className={`flex items-center gap-2 ${info.applies ? "text-green-700" : "text-gray-400"}`}>
                            <span>{label}:</span>
                            <span className="line-through text-gray-400">{info.current || "empty"}</span>
                            {info.applies ? <span>â†’ <strong>{info.wouldSet || "clear"}</strong></span> : <span className="text-xs italic">(skip - not empty)</span>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={!form.name.trim() || form.assignments.length === 0 || saving}
                className="clay-button border-none text-gray-800"
                style={{ background: "linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)" }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {editingRule ? "Update" : "Create"} Rule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <TaskLoadPanel users={users} />

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rule?</AlertDialogTitle>
            <AlertDialogDescription>Delete "{deleteConfirm?.name}"? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDelete(deleteConfirm)} className="bg-red-600 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Open-task workload panel: per-assignee counts, overdue flags, unassigned
// queue, and bulk reassignment between people.
function TaskLoadPanel({ users }) {
  const [tasks, setTasks] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fromUser, setFromUser] = useState("");
  const [toUser, setToUser] = useState("");
  const [reassignBusy, setReassignBusy] = useState(false);
  const [reassignMsg, setReassignMsg] = useState("");
  const [doneTasks, setDoneTasks] = useState([]);

  const loadTasks = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const rows = await loadAllEntityRows({ entity: staffEntities.GeneralTask, query: { completed: { $ne: true } }, sort: null, label: "Open general tasks" });
      setTasks(Array.isArray(rows) ? rows : []);
      const doneRows = await staffEntities.GeneralTask.filter({ completed: true }, "-updated_date", 100).catch(() => []);
      setDoneTasks(Array.isArray(doneRows) ? doneRows : []);
    } catch (e) { setErr(e?.message || "Task load could not be loaded."); }
    finally { setBusy(false); }
  };

  const today = new Date().toISOString().slice(0, 10);
  const openTasks = tasks || [];
  const byAssignee = {};
  const unassigned = [];
  for (const t of openTasks) {
    const people = Array.isArray(t.assigned_to) ? t.assigned_to.filter(Boolean) : [];
    if (!people.length) { unassigned.push(t); continue; }
    for (const p of people) {
      byAssignee[p] = byAssignee[p] || { name: p, open: 0, overdue: 0, tasks: [] };
      byAssignee[p].open += 1;
      if (t.due_date && t.due_date < today) byAssignee[p].overdue += 1;
      byAssignee[p].tasks.push(t);
    }
  }
  const blockedTasks = openTasks.filter(t => t.blocked === true);
  const toggleBlocked = async (t) => {
    const next = !t.blocked;
    const reason = next ? (prompt("Why is this task blocked?") || "").trim() : "";
    if (next && !reason) return;
    try {
      await staffEntities.GeneralTask.update(t.id, { blocked: next, blocked_reason: reason });
      await loadTasks();
    } catch (e) { setErr(e?.message || "Could not update the task."); }
  };

  const closeDaysByAssignee = {};
  for (const t of doneTasks) {
    const days = (new Date(t.updated_date) - new Date(t.created_date)) / 86400e3;
    if (!Number.isFinite(days) || days < 0) continue;
    for (const p of (Array.isArray(t.assigned_to) ? t.assigned_to : [])) {
      const c = closeDaysByAssignee[p] = closeDaysByAssignee[p] || { sum: 0, n: 0 };
      c.sum += days; c.n += 1;
    }
  }

  const rows = Object.values(byAssignee).sort((a, b) => b.open - a.open);
  const reassignTargets = users.map(u => u.full_name || u.email).filter(Boolean);

  const reassign = async () => {
    if (!fromUser || !toUser || fromUser === toUser || reassignBusy) return;
    const moving = openTasks.filter(t => Array.isArray(t.assigned_to) && t.assigned_to.includes(fromUser));
    if (!moving.length) { setReassignMsg(`No open tasks assigned to ${fromUser}.`); return; }
    if (!window.confirm(`Move ${moving.length} open task${moving.length === 1 ? "" : "s"} from ${fromUser} to ${toUser}?`)) return;
    setReassignBusy(true); setReassignMsg("");
    let failed = 0;
    for (const t of moving) {
      const next = t.assigned_to.map(n => n === fromUser ? toUser : n);
      try { await staffEntities.GeneralTask.update(t.id, { assigned_to: next }); }
      catch { failed++; }
    }
    setReassignMsg(failed ? `${moving.length - failed} moved, ${failed} failed — review remaining tasks.` : `${moving.length} tasks reassigned to ${toUser}.`);
    setReassignBusy(false);
    await loadTasks();
  };

  return (
    <div className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-indigo-950">Open task load</h3>
          <p className="text-xs text-indigo-800/70">Current open general tasks by assignee — overloaded people, overdue work, and unassigned items.</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={loadTasks} className="bg-white/80">
          {busy ? "Loading…" : tasks === null ? "Load task load" : "Refresh"}
        </Button>
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      {tasks !== null && (
        <div className="mt-3 space-y-3">
          {unassigned.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
              <p className="text-xs font-semibold text-amber-900">{unassigned.length} unassigned open task{unassigned.length === 1 ? "" : "s"}</p>
              <div className="mt-1 space-y-1">
                {unassigned.slice(0, 5).map(t => (
                  <p key={t.id} className="text-xs text-amber-800">· {t.text}{t.due_date ? ` (due ${t.due_date})` : ""}</p>
                ))}
                {unassigned.length > 5 && <p className="text-xs text-amber-700">…and {unassigned.length - 5} more</p>}
              </div>
            </div>
          )}
          {blockedTasks.length > 0 && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2">
              <p className="text-xs font-semibold text-red-900">{blockedTasks.length} blocked task{blockedTasks.length === 1 ? "" : "s"}</p>
              <div className="mt-1 space-y-1">
                {blockedTasks.map(t => (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-red-800">
                    <span>· {t.text} — {t.blocked_reason || "no reason given"}</span>
                    <button type="button" onClick={() => toggleBlocked(t)} className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] font-medium">Unblock</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {rows.map(r => (
              <div key={r.name} className="rounded-lg border border-gray-200 bg-white p-2">
                <p className="truncate text-sm font-medium text-gray-800">{r.name}</p>
                <p className="text-lg font-bold text-indigo-700">{r.open}</p>
                {r.overdue > 0 && <p className="text-[11px] font-semibold text-red-600">{r.overdue} overdue</p>}
                {closeDaysByAssignee[r.name]?.n > 0 && (
                  <p className="text-[11px] text-gray-500">avg {(closeDaysByAssignee[r.name].sum / closeDaysByAssignee[r.name].n).toFixed(1)}d to close</p>
                )}
              </div>
            ))}
            {rows.length === 0 && unassigned.length === 0 && <p className="col-span-full py-3 text-center text-xs text-gray-500">No open tasks.</p>}
          </div>
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-indigo-200 bg-white/70 p-3">
            <div>
              <Label className="text-xs">Move open tasks from</Label>
              <Select value={fromUser} onValueChange={setFromUser}>
                <SelectTrigger className="mt-1 h-9 w-48"><SelectValue placeholder="Person" /></SelectTrigger>
                <SelectContent>{rows.map(r => <SelectItem key={r.name} value={r.name}>{r.name} ({r.open})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">to</Label>
              <Select value={toUser} onValueChange={setToUser}>
                <SelectTrigger className="mt-1 h-9 w-48"><SelectValue placeholder="Person" /></SelectTrigger>
                <SelectContent>{reassignTargets.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={reassignBusy || !fromUser || !toUser || fromUser === toUser} onClick={reassign} className="bg-white">
              {reassignBusy ? "Moving…" : "Reassign"}
            </Button>
            {reassignMsg && <p className="w-full text-xs text-indigo-800">{reassignMsg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper exported for use in spreadsheet
export function matchesRule(rule, wo) {
  if (!rule.enabled) return false;
  const conditions = rule.conditions || [];
  if (conditions.length === 0) return true;

  let result = true;
  for (let i = 0; i < conditions.length; i++) {
    const c = conditions[i];
    const fieldVal = (wo[c.field] || "").toString().toLowerCase();
    const condVal = (c.value || "").toString().toLowerCase();
    let match = false;

    switch (c.operator) {
      case "contains": match = fieldVal.includes(condVal); break;
      case "equals": match = fieldVal === condVal; break;
      case "starts_with": match = fieldVal.startsWith(condVal); break;
      case "ends_with": match = fieldVal.endsWith(condVal); break;
      case "not_contains": match = !fieldVal.includes(condVal); break;
      case "is_empty": match = !wo[c.field]; break;
      case "is_not_empty": match = !!wo[c.field]; break;
      default: match = false;
    }

    if (i === 0) {
      result = match;
    } else {
      result = c.logic === "and" ? result && match : result || match;
    }
  }
  return result;
}

export function applyRules(rules, wo) {
  const updates = {};
  const sortedRules = [...rules].filter(r => r.enabled).sort((a, b) => (a.priority || 0) - (b.priority || 0));

  for (const rule of sortedRules) {
    if (!matchesRule(rule, wo)) continue;
    for (const assign of rule.assignments || []) {
      const current = wo[assign.field] || updates[assign.field] || "";
      const shouldApply = assign.only_if === "always" || (assign.only_if === "if_empty" && !current);
      if (shouldApply) {
        updates[assign.field] = assign.person === "__clear__" ? "" : assign.person;
      }
    }
  }
  return updates;
}