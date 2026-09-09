import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2, Check, ArrowUp, ArrowDown } from "lucide-react";
import { loadSingleGlobalSetting, saveGlobalSettingValueIfUnchanged } from "@/components/shared/globalSettingsPersistence";

const SORTABLE_COLUMNS = [
  { value: "client_name", label: "Customer" },
  { value: "title", label: "Job Description" },
  { value: "lead_source", label: "Source" },
  { value: "current_task_deadline", label: "Current Task Deadline" },
  { value: "current_task_assigned_to", label: "Current Task Assigned to" },
  { value: "designer", label: "Designer" },
  { value: "project_manager", label: "Project Manager" },
  { value: "estimator", label: "Estimator" },
  { value: "corbridge_invoice_number", label: "Est/Inv #" },
  { value: "estimate_amount", label: "Estimate Amount" },
  { value: "date_initial_contact", label: "Date Initial Contact" },
  { value: "site_survey_date", label: "Site Survey" },
  { value: "date_estimate_sent", label: "Date Estimate Sent" },
  { value: "date_order_created", label: "Date Order Created" },
  { value: "project_install_date", label: "Project Install Date" },
  { value: "permit_submitted_date", label: "Permit Submitted" },
  { value: "permit_approved_date", label: "Permit Approved" },
  { value: "created_date", label: "Created Date" },
  { value: "updated_date", label: "Updated Date" },
];

export default function SalesPipelineDefaultSort() {
  const [sortColumn, setSortColumn] = useState("created_date");
  const [sortDirection, setSortDirection] = useState("desc");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settingRecord, setSettingRecord] = useState(null);
  const [settingsError, setSettingsError] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const record = await loadSingleGlobalSetting({
        entity: base44.entities.GlobalSettings,
        settingKey: "salesPipelineDefaultSort",
        label: "Sales Pipeline default sort",
      });
      setSettingRecord(record);
      setSortColumn(record?.setting_value?.column || "created_date");
      setSortDirection(record?.setting_value?.direction || "desc");
    } catch (error) {
      console.error("Error loading default sort settings:", error);
      setSettingsError(error?.message || "Sales Pipeline default sort could not be loaded safely.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSettingsError("");
    try {
      const settingValue = { column: sortColumn, direction: sortDirection };
      const savedRecord = await saveGlobalSettingValueIfUnchanged({
        entity: base44.entities.GlobalSettings,
        loadedRecord: settingRecord,
        settingKey: "salesPipelineDefaultSort",
        nextValue: settingValue,
        label: "Sales Pipeline default sort",
      });
      setSettingRecord(savedRecord);
      setSortColumn(savedRecord?.setting_value?.column || sortColumn);
      setSortDirection(savedRecord?.setting_value?.direction || sortDirection);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Sales Pipeline default sort save blocked:", error);
      setSettingsError(error?.message || "Sales Pipeline default sort changed in another session. Reload before saving.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="clay-card p-6">
      <h3 className="text-lg font-semibold mb-4">Sales Pipeline Default Sort</h3>
      <p className="text-sm text-gray-600 mb-6">
        Set the default sorting for the Sales Pipeline when no custom sort is active.
      </p>

      {settingsError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">Default sort update blocked</div>
            <div className="mt-1 text-xs">{settingsError}</div>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0 border-red-300 bg-white text-red-800" onClick={async () => { setSettingsError(""); setLoading(true); await loadSettings(); }}>Reload latest</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <Label className="text-sm font-medium mb-2 block">Sort Column</Label>
          <Select value={sortColumn} onValueChange={setSortColumn}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTABLE_COLUMNS.map(col => (
                <SelectItem key={col.value} value={col.value}>{col.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Sort Direction</Label>
          <Select value={sortDirection} onValueChange={setSortDirection}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">
                <div className="flex items-center gap-2">
                  <ArrowUp className="w-4 h-4" />
                  Ascending (A-Z, Oldest First)
                </div>
              </SelectItem>
              <SelectItem value="desc">
                <div className="flex items-center gap-2">
                  <ArrowDown className="w-4 h-4" />
                  Descending (Z-A, Newest First)
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : saved ? (
          <Check className="w-4 h-4" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        {saved ? "Saved!" : "Save Default Sort"}
      </Button>
    </div>
  );
}