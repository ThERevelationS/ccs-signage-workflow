import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Save, User, MapPin, FileText, Package, Wrench, Plus } from "lucide-react";

const TEAM_MEMBERS = [
  "Carl", "Twyla", "Brett", "Kyle", "Joe", "Aidin", "Kay", "Brian", "Chris"
];

const WorkOrder = base44.entities.WorkOrder;

export default function ClientInfoSection({ workOrder, onUpdate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [visibleProducts, setVisibleProducts] = useState(1);
  const [saving, setSaving] = useState(false);
  const [localData, setLocalData] = useState({});

  // Initialize visible products based on existing data
  React.useEffect(() => {
    if (workOrder) {
      let count = 1;
      for (let i = 6; i >= 1; i--) {
        if (workOrder[`product_${i}`]) {
          count = i;
          break;
        }
      }
      setVisibleProducts(count);
    }
  }, [workOrder?.id]);

  const getValue = (field) => {
    return localData[field] !== undefined ? localData[field] : (workOrder?.[field] || "");
  };

  const getBoolValue = (field) => {
    return localData[field] !== undefined ? localData[field] : (workOrder?.[field] || false);
  };

  const handleChange = (field, value) => {
    setLocalData(prev => ({ ...prev, [field]: value }));
  };

  const handleCheckboxChange = (field) => {
    const currentValue = getBoolValue(field);
    setLocalData(prev => ({ ...prev, [field]: !currentValue }));
  };

  const handleSave = async () => {
    if (Object.keys(localData).length === 0) return;
    setSaving(true);
    try {
      await WorkOrder.update(workOrder.id, localData);
      setLocalData({});
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error saving:", error);
    }
    setSaving(false);
  };

  const hasChanges = Object.keys(localData).length > 0;

  return (
    <div className="clay-card p-3">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 -m-3 p-3 rounded-lg">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <User className="w-4 h-4 text-blue-600" />
              Client Information
            </h3>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSave();
                  }}
                  disabled={saving}
                  className="h-7 px-3 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Save className="w-3 h-3 mr-1" />
                  {saving ? "Saving..." : "Save"}
                </Button>
              )}
              {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </div>
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="mt-4 space-y-4">
          {/* Designer/Surveyor Row */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Designer</Label>
              <Select value={getValue("designer")} onValueChange={(v) => handleChange("designer", v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_MEMBERS.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Surveyor</Label>
              <Select value={getValue("surveyor")} onValueChange={(v) => handleChange("surveyor", v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_MEMBERS.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Site Survey Date</Label>
              <Input
                type="date"
                value={getValue("site_survey_date")}
                onChange={(e) => handleChange("site_survey_date", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <Label className="text-xs">Time</Label>
                <Input
                  type="time"
                  value={getValue("site_survey_time")}
                  onChange={(e) => handleChange("site_survey_time", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">AM/PM</Label>
                <Select value={getValue("site_survey_am_pm")} onValueChange={(v) => handleChange("site_survey_am_pm", v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="--" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Contact Info Section */}
          <div className="border-t pt-3">
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
              <MapPin className="w-4 h-4 text-green-600" />
              Contact & Address
            </h4>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Contact Name</Label>
                <Input
                  value={getValue("contact_name")}
                  onChange={(e) => handleChange("contact_name", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Contact Phone</Label>
                <Input
                  value={getValue("contact_phone")}
                  onChange={(e) => handleChange("contact_phone", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Contact Email</Label>
                <Input
                  type="email"
                  value={getValue("contact_email")}
                  onChange={(e) => handleChange("contact_email", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Representative</Label>
                <Input
                  value={getValue("representative")}
                  onChange={(e) => handleChange("representative", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Install Location</Label>
                <Input
                  value={getValue("install_location")}
                  onChange={(e) => handleChange("install_location", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Address Line 2</Label>
                <Input
                  value={getValue("address_line_2")}
                  onChange={(e) => handleChange("address_line_2", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Billing Address</Label>
                <Input
                  value={getValue("billing_address")}
                  onChange={(e) => handleChange("billing_address", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Additional Contact</Label>
                <Input
                  value={getValue("additional_contact")}
                  onChange={(e) => handleChange("additional_contact", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Permitting Section */}
          <div className="border-t pt-3">
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
              <FileText className="w-4 h-4 text-orange-600" />
              Permitting & Location
            </h4>
            <div className="grid grid-cols-5 gap-3 mb-2">
              <div>
                <Label className="text-xs">Permitting</Label>
                <Select value={getValue("permitting")} onValueChange={(v) => handleChange("permitting", v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="maybe">Maybe</SelectItem>
                    <SelectItem value="na">N/A</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Township/City</Label>
                <Input
                  value={getValue("township_city")}
                  onChange={(e) => handleChange("township_city", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">County</Label>
                <Input
                  value={getValue("county")}
                  onChange={(e) => handleChange("county", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Permit Code</Label>
                <Input
                  value={getValue("permit_code")}
                  onChange={(e) => handleChange("permit_code", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Permit Class</Label>
                <Input
                  value={getValue("permit_class")}
                  onChange={(e) => handleChange("permit_class", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 mb-2">
              <div>
                <Label className="text-xs">Property Owner</Label>
                <Input
                  value={getValue("property_owner")}
                  onChange={(e) => handleChange("property_owner", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">PUD</Label>
                <Input
                  value={getValue("pud")}
                  onChange={(e) => handleChange("pud", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Parcel #</Label>
                <Input
                  value={getValue("parcel_number")}
                  onChange={(e) => handleChange("parcel_number", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs block mb-1">Electrical</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { field: "electrical_ibi", label: "IBI" },
                    { field: "electrical_nkyei", label: "NKYEI" },
                    { field: "electrical_nec", label: "NEC" },
                    { field: "electrical_city", label: "City" },
                    { field: "electrical_county", label: "County" }
                  ].map(item => (
                    <label key={item.field} className="flex items-center gap-1 cursor-pointer">
                      <Checkbox 
                        checked={getBoolValue(item.field)} 
                        onCheckedChange={() => handleCheckboxChange(item.field)}
                        className="h-3 w-3"
                      />
                      <span className="text-xs">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <Label className="text-xs font-semibold">Customer is:</Label>
              {[
                { field: "customer_is_building_owner", label: "Building Owner" },
                { field: "customer_is_tenant", label: "Tenant" },
                { field: "customer_is_marketing_co", label: "Marketing Co." }
              ].map(item => (
                <label key={item.field} className="flex items-center gap-1 cursor-pointer">
                  <Checkbox 
                    checked={getBoolValue(item.field)} 
                    onCheckedChange={() => handleCheckboxChange(item.field)}
                    className="h-3 w-3"
                  />
                  <span className="text-xs">{item.label}</span>
                </label>
              ))}
              <div className="flex items-center gap-1 ml-4">
                <label className="flex items-center gap-1 cursor-pointer">
                  <Checkbox 
                    checked={getBoolValue("business_co_coo_reminder")} 
                    onCheckedChange={() => handleCheckboxChange("business_co_coo_reminder")}
                    className="h-3 w-3"
                  />
                  <span className="text-xs">CO/COO Reminder</span>
                </label>
                <Input
                  value={getValue("business_co_coo_date")}
                  onChange={(e) => handleChange("business_co_coo_date", e.target.value)}
                  placeholder="Date"
                  className="h-7 text-xs w-24"
                />
              </div>
            </div>
          </div>

          {/* Service Details Section */}
          <div className="border-t pt-3">
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
              <Wrench className="w-4 h-4 text-purple-600" />
              Service Details
            </h4>
            <div className="grid grid-cols-4 gap-3 mb-2">
              <div className="flex items-center gap-3">
                <Label className="text-xs font-semibold">Install:</Label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <Checkbox checked={getBoolValue("install_yes")} onCheckedChange={() => handleCheckboxChange("install_yes")} className="h-3 w-3" />
                  <span className="text-xs">Yes</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <Checkbox checked={getBoolValue("install_no")} onCheckedChange={() => handleCheckboxChange("install_no")} className="h-3 w-3" />
                  <span className="text-xs">No</span>
                </label>
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs font-semibold">Removal:</Label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <Checkbox checked={getBoolValue("removal_yes")} onCheckedChange={() => handleCheckboxChange("removal_yes")} className="h-3 w-3" />
                  <span className="text-xs">Yes</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <Checkbox checked={getBoolValue("removal_no")} onCheckedChange={() => handleCheckboxChange("removal_no")} className="h-3 w-3" />
                  <span className="text-xs">No</span>
                </label>
              </div>
              <div>
                <Label className="text-xs">Service/Repair</Label>
                <Input
                  value={getValue("service_repair")}
                  onChange={(e) => handleChange("service_repair", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Budget Less Than $</Label>
                <Input
                  type="number"
                  value={getValue("budget_less_than")}
                  onChange={(e) => handleChange("budget_less_than", e.target.value ? Number(e.target.value) : "")}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Origination</Label>
                <Input
                  value={getValue("origination")}
                  onChange={(e) => handleChange("origination", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Patch</Label>
                <Input
                  value={getValue("patch")}
                  onChange={(e) => handleChange("patch", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Paint</Label>
                <Input
                  value={getValue("paint")}
                  onChange={(e) => handleChange("paint", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Color</Label>
                <Input
                  value={getValue("color")}
                  onChange={(e) => handleChange("color", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Products Section */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold flex items-center gap-1">
                <Package className="w-4 h-4 text-teal-600" />
                Products
              </h4>
              {visibleProducts < 6 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisibleProducts(prev => Math.min(prev + 1, 6))}
                  className="h-6 px-2 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Product
                </Button>
              )}
            </div>
            <div className="grid grid-cols-6 gap-2 mb-2">
              {[1, 2, 3, 4, 5, 6].slice(0, visibleProducts).map(num => (
                <div key={num}>
                  <Label className="text-xs">#{num}</Label>
                  <Input
                    value={getValue(`product_${num}`)}
                    onChange={(e) => handleChange(`product_${num}`, e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs font-semibold">Complete:</span>
              {[
                { field: "cb_complete", label: "CB" },
                { field: "cf_complete", label: "CF" },
                { field: "cc_complete", label: "CC" },
                { field: "sms_complete", label: "SMS" }
              ].map(item => (
                <label key={item.field} className="flex items-center gap-1 cursor-pointer">
                  <Checkbox 
                    checked={getBoolValue(item.field)} 
                    onCheckedChange={() => handleCheckboxChange(item.field)}
                    className="h-3 w-3"
                  />
                  <span className="text-xs">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Save Button at Bottom */}
          {hasChanges && (
            <div className="border-t pt-3 flex justify-end">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}