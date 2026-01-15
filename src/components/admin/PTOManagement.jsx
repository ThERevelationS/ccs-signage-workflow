import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  Copy,
  Users,
  Calendar,
  Clock,
  Palmtree,
  Stethoscope,
  Baby,
  Briefcase,
  Star,
  Check,
  X,
  Save,
  FileText
} from "lucide-react";

const PTOPolicy = base44.entities.PTOPolicy;
const UserPTOBalance = base44.entities.UserPTOBalance;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

const ACCRUAL_TYPES = [
  { value: "none", label: "No Accrual (Fixed Amount)" },
  { value: "hourly", label: "Per Hour Worked" },
  { value: "daily", label: "Per Day Worked" },
  { value: "weekly", label: "Weekly" },
  { value: "bi_weekly", label: "Bi-Weekly (Every 2 Weeks)" },
  { value: "semi_monthly", label: "Semi-Monthly (Twice a Month)" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly (Jan 1)" },
  { value: "anniversary", label: "Anniversary Date" }
];

const DEFAULT_TIME_OFF_TYPES = [
  { id: "vacation", name: "Vacation", color: "#3B82F6", accrual_type: "bi_weekly", accrual_rate: 3.08, accrual_cap: 160, starting_balance: 0, carryover_max: 40 },
  { id: "sick", name: "Sick Leave", color: "#EF4444", accrual_type: "monthly", accrual_rate: 4, accrual_cap: 48, starting_balance: 0, carryover_max: 0 },
  { id: "personal", name: "Personal Days", color: "#8B5CF6", accrual_type: "yearly", accrual_rate: 24, accrual_cap: 24, starting_balance: 0, carryover_max: 0 },
  { id: "bereavement", name: "Bereavement", color: "#6B7280", accrual_type: "none", accrual_rate: 0, accrual_cap: 0, starting_balance: 24, carryover_max: 0 },
  { id: "jury_duty", name: "Jury Duty", color: "#F59E0B", accrual_type: "none", accrual_rate: 0, accrual_cap: 0, starting_balance: 40, carryover_max: 0 },
  { id: "parental", name: "Parental Leave", color: "#EC4899", accrual_type: "none", accrual_rate: 0, accrual_cap: 0, starting_balance: 480, carryover_max: 0 }
];

const TYPE_ICONS = {
  vacation: Palmtree,
  sick: Stethoscope,
  personal: Star,
  bereavement: FileText,
  jury_duty: Briefcase,
  parental: Baby
};

export default function PTOManagement() {
  const [policies, setPolicies] = useState([]);
  const [userBalances, setUserBalances] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("policies");
  
  // Dialog states
  const [showPolicyDialog, setShowPolicyDialog] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  
  // Form states
  const [policyForm, setPolicyForm] = useState({
    name: "",
    is_template: true,
    time_off_types: [...DEFAULT_TIME_OFF_TYPES],
    holidays: [],
    floating_holidays_per_year: 2
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [policiesData, balancesData, usersData] = await Promise.all([
        PTOPolicy.list(),
        UserPTOBalance.list(),
        AuthorizedEmail.list()
      ]);
      setPolicies(policiesData);
      setUserBalances(balancesData);
      setUsers(usersData);
    } catch (err) {
      console.error("Error loading PTO data:", err);
    }
    setIsLoading(false);
  };

  const openNewPolicy = () => {
    setEditingPolicy(null);
    setPolicyForm({
      name: "",
      is_template: true,
      time_off_types: [...DEFAULT_TIME_OFF_TYPES],
      holidays: getDefaultHolidays(),
      floating_holidays_per_year: 2
    });
    setShowPolicyDialog(true);
  };

  const openEditPolicy = (policy) => {
    setEditingPolicy(policy);
    setPolicyForm({
      name: policy.name,
      is_template: policy.is_template !== false,
      time_off_types: policy.time_off_types || [...DEFAULT_TIME_OFF_TYPES],
      holidays: policy.holidays || [],
      floating_holidays_per_year: policy.floating_holidays_per_year || 0
    });
    setShowPolicyDialog(true);
  };

  const duplicatePolicy = (policy) => {
    setEditingPolicy(null);
    setPolicyForm({
      name: `${policy.name} (Copy)`,
      is_template: true,
      time_off_types: policy.time_off_types || [...DEFAULT_TIME_OFF_TYPES],
      holidays: policy.holidays || [],
      floating_holidays_per_year: policy.floating_holidays_per_year || 0
    });
    setShowPolicyDialog(true);
  };

  const getDefaultHolidays = () => {
    const year = new Date().getFullYear();
    return [
      { name: "New Year's Day", date: `${year}-01-01`, recurring: true, paid: true },
      { name: "Memorial Day", date: `${year}-05-27`, recurring: true, paid: true },
      { name: "Independence Day", date: `${year}-07-04`, recurring: true, paid: true },
      { name: "Labor Day", date: `${year}-09-02`, recurring: true, paid: true },
      { name: "Thanksgiving", date: `${year}-11-28`, recurring: true, paid: true },
      { name: "Day After Thanksgiving", date: `${year}-11-29`, recurring: true, paid: true },
      { name: "Christmas Eve", date: `${year}-12-24`, recurring: true, paid: true },
      { name: "Christmas Day", date: `${year}-12-25`, recurring: true, paid: true }
    ];
  };

  const handleSavePolicy = async () => {
    try {
      if (editingPolicy) {
        await PTOPolicy.update(editingPolicy.id, policyForm);
      } else {
        await PTOPolicy.create(policyForm);
      }
      setShowPolicyDialog(false);
      loadData();
    } catch (err) {
      console.error("Error saving policy:", err);
    }
  };

  const handleDeletePolicy = async () => {
    try {
      await PTOPolicy.delete(deleteConfirm.id);
      setDeleteConfirm(null);
      loadData();
    } catch (err) {
      console.error("Error deleting policy:", err);
    }
  };

  const addTimeOffType = () => {
    const newType = {
      id: `custom_${Date.now()}`,
      name: "New Time Off Type",
      color: "#6B7280",
      accrual_type: "yearly",
      accrual_rate: 0,
      accrual_cap: 0,
      starting_balance: 0,
      waiting_period_days: 0,
      carryover_max: 0,
      carryover_expiry_months: 0,
      can_go_negative: false,
      requires_approval: true
    };
    setPolicyForm(prev => ({
      ...prev,
      time_off_types: [...prev.time_off_types, newType]
    }));
  };

  const updateTimeOffType = (index, field, value) => {
    setPolicyForm(prev => ({
      ...prev,
      time_off_types: prev.time_off_types.map((t, i) => 
        i === index ? { ...t, [field]: value } : t
      )
    }));
  };

  const removeTimeOffType = (index) => {
    setPolicyForm(prev => ({
      ...prev,
      time_off_types: prev.time_off_types.filter((_, i) => i !== index)
    }));
  };

  const addHoliday = () => {
    setPolicyForm(prev => ({
      ...prev,
      holidays: [...prev.holidays, { name: "", date: "", recurring: true, paid: true }]
    }));
  };

  const updateHoliday = (index, field, value) => {
    setPolicyForm(prev => ({
      ...prev,
      holidays: prev.holidays.map((h, i) => 
        i === index ? { ...h, [field]: value } : h
      )
    }));
  };

  const removeHoliday = (index) => {
    setPolicyForm(prev => ({
      ...prev,
      holidays: prev.holidays.filter((_, i) => i !== index)
    }));
  };

  const assignPolicyToUser = async (userEmail, policyId) => {
    try {
      const policy = policies.find(p => p.id === policyId);
      const user = users.find(u => u.email === userEmail);
      
      // Check if user already has a balance record
      const existingBalance = userBalances.find(b => b.user_email === userEmail);
      
      // Initialize balances from policy
      const initialBalances = (policy.time_off_types || []).map(type => ({
        type_id: type.id,
        type_name: type.name,
        available_hours: type.starting_balance || 0,
        used_hours: 0,
        pending_hours: 0,
        accrued_ytd: 0,
        carryover_hours: 0,
        last_accrual_date: new Date().toISOString()
      }));
      
      if (existingBalance) {
        await UserPTOBalance.update(existingBalance.id, {
          policy_id: policyId,
          balances: initialBalances,
          floating_holidays_remaining: policy.floating_holidays_per_year || 0
        });
      } else {
        await UserPTOBalance.create({
          user_email: userEmail,
          user_name: user?.full_name || userEmail,
          policy_id: policyId,
          hire_date: new Date().toISOString().split('T')[0],
          balances: initialBalances,
          floating_holidays_remaining: policy.floating_holidays_per_year || 0
        });
      }
      
      setShowAssignDialog(false);
      setSelectedUser(null);
      loadData();
    } catch (err) {
      console.error("Error assigning policy:", err);
    }
  };

  const getUserBalance = (userEmail) => {
    return userBalances.find(b => b.user_email === userEmail);
  };

  const getPolicyName = (policyId) => {
    const policy = policies.find(p => p.id === policyId);
    return policy?.name || "No Policy";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">PTO Management</h2>
          <p className="text-gray-500 mt-1">Configure time off policies and assign to employees</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="policies" className="gap-2">
            <FileText className="w-4 h-4" />
            Policies
          </TabsTrigger>
          <TabsTrigger value="employees" className="gap-2">
            <Users className="w-4 h-4" />
            Employee Assignments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="mt-4">
          <div className="flex justify-end mb-4">
            <Button onClick={openNewPolicy} className="gap-2">
              <Plus className="w-4 h-4" />
              New Policy Template
            </Button>
          </div>

          {policies.length === 0 ? (
            <div className="clay-card p-12 text-center">
              <FileText className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-gray-700">No PTO Policies</h3>
              <p className="text-gray-500 mt-2">Create your first policy template to get started</p>
              <Button onClick={openNewPolicy} className="mt-4">Create Policy</Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {policies.map(policy => (
                <div key={policy.id} className="clay-card p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{policy.name}</h3>
                        {policy.is_template && (
                          <Badge className="bg-purple-100 text-purple-700">Template</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(policy.time_off_types || []).slice(0, 5).map(type => (
                          <Badge key={type.id} style={{ backgroundColor: type.color + '20', color: type.color }}>
                            {type.name}
                          </Badge>
                        ))}
                        {(policy.time_off_types || []).length > 5 && (
                          <Badge variant="outline">+{policy.time_off_types.length - 5} more</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-2">
                        {policy.holidays?.length || 0} holidays • {policy.floating_holidays_per_year || 0} floating holidays
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => duplicatePolicy(policy)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEditPolicy(policy)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(policy)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="employees" className="mt-4">
          <div className="clay-card overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Employee</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Assigned Policy</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Hire Date</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Current Balances</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const balance = getUserBalance(user.email);
                  return (
                    <tr key={user.email} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium">{user.full_name || user.email}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        {balance ? (
                          <Badge className="bg-green-100 text-green-700">
                            {getPolicyName(balance.policy_id)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-500">No Policy</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {balance?.hire_date || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {balance?.balances?.slice(0, 3).map(b => (
                          <span key={b.type_id} className="text-xs mr-2">
                            {b.type_name}: <strong>{b.available_hours}h</strong>
                          </span>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => { setSelectedUser(user); setShowAssignDialog(true); }}
                        >
                          {balance ? "Change Policy" : "Assign Policy"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Policy Dialog */}
      <Dialog open={showPolicyDialog} onOpenChange={setShowPolicyDialog}>
        <DialogContent className="clay-card border-none max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPolicy ? "Edit Policy" : "Create PTO Policy"}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Policy Name</Label>
                <Input
                  value={policyForm.name}
                  onChange={(e) => setPolicyForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Standard Full-Time"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Floating Holidays per Year</Label>
                <Input
                  type="number"
                  min="0"
                  value={policyForm.floating_holidays_per_year}
                  onChange={(e) => setPolicyForm(prev => ({ ...prev, floating_holidays_per_year: parseInt(e.target.value) || 0 }))}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Time Off Types */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Time Off Types</Label>
                <Button variant="outline" size="sm" onClick={addTimeOffType}>
                  <Plus className="w-3 h-3 mr-1" /> Add Type
                </Button>
              </div>
              
              <div className="space-y-4">
                {policyForm.time_off_types.map((type, index) => (
                  <div key={type.id} className="p-4 border rounded-lg bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={type.color}
                          onChange={(e) => updateTimeOffType(index, "color", e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer"
                        />
                        <Input
                          value={type.name}
                          onChange={(e) => updateTimeOffType(index, "name", e.target.value)}
                          className="w-48 font-medium"
                        />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeTimeOffType(index)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs">Accrual Type</Label>
                        <Select 
                          value={type.accrual_type} 
                          onValueChange={(v) => updateTimeOffType(index, "accrual_type", v)}
                        >
                          <SelectTrigger className="mt-1 h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ACCRUAL_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Accrual Rate (hrs/period)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={type.accrual_rate}
                          onChange={(e) => updateTimeOffType(index, "accrual_rate", parseFloat(e.target.value) || 0)}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Max Accrual Cap (hrs)</Label>
                        <Input
                          type="number"
                          value={type.accrual_cap}
                          onChange={(e) => updateTimeOffType(index, "accrual_cap", parseInt(e.target.value) || 0)}
                          className="mt-1 h-8 text-sm"
                          placeholder="0 = unlimited"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Starting Balance (hrs)</Label>
                        <Input
                          type="number"
                          value={type.starting_balance}
                          onChange={(e) => updateTimeOffType(index, "starting_balance", parseInt(e.target.value) || 0)}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Waiting Period (days)</Label>
                        <Input
                          type="number"
                          value={type.waiting_period_days || 0}
                          onChange={(e) => updateTimeOffType(index, "waiting_period_days", parseInt(e.target.value) || 0)}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Carryover Max (hrs)</Label>
                        <Input
                          type="number"
                          value={type.carryover_max}
                          onChange={(e) => updateTimeOffType(index, "carryover_max", parseInt(e.target.value) || 0)}
                          className="mt-1 h-8 text-sm"
                          placeholder="0 = none"
                        />
                      </div>
                      <div className="flex items-end gap-4">
                        <label className="flex items-center gap-1">
                          <Switch
                            checked={type.requires_approval !== false}
                            onCheckedChange={(v) => updateTimeOffType(index, "requires_approval", v)}
                          />
                          <span className="text-xs">Requires Approval</span>
                        </label>
                      </div>
                      <div className="flex items-end gap-4">
                        <label className="flex items-center gap-1">
                          <Switch
                            checked={type.can_go_negative === true}
                            onCheckedChange={(v) => updateTimeOffType(index, "can_go_negative", v)}
                          />
                          <span className="text-xs">Allow Negative</span>
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Holidays */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Company Holidays</Label>
                <Button variant="outline" size="sm" onClick={addHoliday}>
                  <Plus className="w-3 h-3 mr-1" /> Add Holiday
                </Button>
              </div>
              
              <div className="space-y-2">
                {policyForm.holidays.map((holiday, index) => (
                  <div key={index} className="flex items-center gap-3 p-2 border rounded bg-gray-50">
                    <Input
                      value={holiday.name}
                      onChange={(e) => updateHoliday(index, "name", e.target.value)}
                      placeholder="Holiday name"
                      className="flex-1 h-8 text-sm"
                    />
                    <Input
                      type="date"
                      value={holiday.date}
                      onChange={(e) => updateHoliday(index, "date", e.target.value)}
                      className="w-40 h-8 text-sm"
                    />
                    <label className="flex items-center gap-1 text-xs">
                      <Switch
                        checked={holiday.paid !== false}
                        onCheckedChange={(v) => updateHoliday(index, "paid", v)}
                      />
                      Paid
                    </label>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeHoliday(index)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowPolicyDialog(false)}>Cancel</Button>
              <Button onClick={handleSavePolicy} disabled={!policyForm.name}>
                <Save className="w-4 h-4 mr-2" />
                {editingPolicy ? "Update" : "Create"} Policy
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Policy Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="clay-card border-none max-w-md">
          <DialogHeader>
            <DialogTitle>Assign PTO Policy</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <p className="text-sm text-gray-600">
              Assign a PTO policy to <strong>{selectedUser?.full_name || selectedUser?.email}</strong>
            </p>
            
            <div className="space-y-2">
              {policies.map(policy => (
                <button
                  key={policy.id}
                  onClick={() => assignPolicyToUser(selectedUser.email, policy.id)}
                  className="w-full p-3 text-left border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="font-medium">{policy.name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {policy.time_off_types?.length || 0} time off types • {policy.holidays?.length || 0} holidays
                  </div>
                </button>
              ))}
            </div>
            
            <Button variant="outline" className="w-full" onClick={() => setShowAssignDialog(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Policy?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePolicy} className="bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}