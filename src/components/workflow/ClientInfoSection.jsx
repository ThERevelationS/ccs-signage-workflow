import { useState, useEffect, useRef } from "react";
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
import { ChevronDown, ChevronUp, Save, User, MapPin, FileText, Package, Wrench, Plus, Trash2, Loader2 } from "lucide-react";
import { replaceWorkOrderFieldsIfUnchanged } from "@/components/workflow/workOrderPersistence";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";

const TEAM_MEMBERS = [
  "Carl", "Twyla", "Brett", "Kyle", "Joe", "Aidin", "Kay", "Brian", "Chris"
];

const WorkOrder = base44.entities.WorkOrder;

export default function ClientInfoSection({ workOrder, onUpdate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localData, setLocalData] = useState({});
  const [products, setProducts] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [productsChanged, setProductsChanged] = useState(false);
  const [productsNeedMigration, setProductsNeedMigration] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [reloading, setReloading] = useState(false);
  const fieldBaselinesRef = useRef({});
  const loadedProductsSnapshotRef = useRef(undefined);

  const cloneValue = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

  const initializeProductsFromRecord = (record) => {
    loadedProductsSnapshotRef.current = cloneValue(record?.products);
    if (record?.products && Array.isArray(record.products)) {
      setProducts(record.products);
      setProductsNeedMigration(false);
    } else {
      const migratedProducts = [];
      for (let i = 1; i <= 6; i++) {
        const desc = record?.[`product_${i}`];
        if (desc && desc.trim()) {
          migratedProducts.push({
            id: `prod_${i}`,
            description: desc,
            product_type: ""
          });
        }
      }
      setProducts(migratedProducts);
      setProductsNeedMigration(migratedProducts.length > 0);
    }
    setProductsChanged(false);
  };

  // Load product types and initialize products
  useEffect(() => {
    loadProductTypes();
    if (workOrder) {
      fieldBaselinesRef.current = {};
      setLocalData({});
      setSaveError("");
      initializeProductsFromRecord(workOrder);
    }
  }, [workOrder?.id]);

  const loadProductTypes = async () => {
    try {
      const setting = await loadSingleGlobalSetting({
        entity: base44.entities.GlobalSettings,
        settingKey: "productTypes",
        label: "Client info product types",
      });
      if (setting?.id) {
        setProductTypes(setting.setting_value?.items || []);
      } else {
        setProductTypes(["Channel Letters", "Cabinet Sign", "Monument", "Pylon", "Wall Sign", "Window Graphics", "Vehicle Wrap"]);
      }
    } catch (error) {
      console.error("Error loading product types:", error);
    }
  };

  const getValue = (field) => {
    return localData[field] !== undefined ? localData[field] : (workOrder?.[field] || "");
  };

  const getBoolValue = (field) => {
    return localData[field] !== undefined ? localData[field] : (workOrder?.[field] || false);
  };

  const captureFieldBaseline = (field) => {
    if (!Object.prototype.hasOwnProperty.call(fieldBaselinesRef.current, field)) {
      fieldBaselinesRef.current[field] = cloneValue(workOrder?.[field]);
    }
  };

  const handleChange = (field, value) => {
    captureFieldBaseline(field);
    setLocalData(prev => ({ ...prev, [field]: value }));
  };

  const handleCheckboxChange = (field) => {
    captureFieldBaseline(field);
    const currentValue = getBoolValue(field);
    setLocalData(prev => ({ ...prev, [field]: !currentValue }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      // Clean up numeric fields - convert empty strings to null.
      const cleanedData = {
        ...localData,
        ...(localData.budget_less_than !== undefined && {
          budget_less_than: localData.budget_less_than ? parseFloat(localData.budget_less_than) : null
        })
      };
      const expectedFields = {};
      const nextFields = { ...cleanedData };
      Object.keys(cleanedData).forEach((field) => {
        expectedFields[field] = Object.prototype.hasOwnProperty.call(fieldBaselinesRef.current, field)
          ? cloneValue(fieldBaselinesRef.current[field])
          : cloneValue(workOrder?.[field]);
      });

      if (productsChanged || productsNeedMigration) {
        expectedFields.products = cloneValue(loadedProductsSnapshotRef.current);
        nextFields.products = products;
      }

      if (Object.keys(nextFields).length === 0) return;
      const saved = await replaceWorkOrderFieldsIfUnchanged({
        workOrderId: workOrder.id,
        expectedFields,
        nextFields,
        label: "Client Information",
      });

      const applied = Object.keys(nextFields).reduce((out, field) => {
        out[field] = saved[field];
        return out;
      }, {});
      Object.assign(workOrder, applied, { updated_date: saved.updated_date });
      if (Object.prototype.hasOwnProperty.call(nextFields, "products")) {
        loadedProductsSnapshotRef.current = cloneValue(saved.products);
        setProducts(saved.products || []);
        setProductsNeedMigration(false);
      }
      fieldBaselinesRef.current = {};
      setLocalData({});
      setProductsChanged(false);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error saving:", error);
      setSaveError(error?.message || "Client Information could not be saved. Reload the latest Work Order and try again.");
    } finally {
      setSaving(false);
    }
  };

  const reloadLatest = async () => {
    setReloading(true);
    try {
      const rows = await WorkOrder.filter({ id: workOrder.id });
      const latest = rows[0];
      if (!latest) throw new Error("The latest Work Order could not be found.");
      Object.assign(workOrder, latest);
      fieldBaselinesRef.current = {};
      setLocalData({});
      initializeProductsFromRecord(latest);
      setSaveError("");
      if (onUpdate) await onUpdate();
    } catch (error) {
      console.error("Error reloading Client Information:", error);
      setSaveError(error?.message || "The latest Client Information could not be loaded.");
    } finally {
      setReloading(false);
    }
  };

  const hasChanges = Object.keys(localData).length > 0 || productsChanged;
  
  const updateProduct = (index, field, value) => {
    const updated = [...products];
    updated[index] = { ...updated[index], [field]: value };
    setProducts(updated);
    setProductsChanged(true);
  };

  const addProduct = () => {
    setProducts([...products, {
      id: `prod_${Date.now()}`,
      description: "",
      product_type: ""
    }]);
    setProductsChanged(true);
  };

  const removeProduct = (index) => {
    setProducts(products.filter((_, i) => i !== index));
    setProductsChanged(true);
  };

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

        {saveError && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
            <div className="font-medium">Client Information save blocked</div>
            <div className="mt-1">{saveError}</div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span>Reloading discards unsaved Client Information edits.</span>
              <Button type="button" size="sm" variant="outline" onClick={reloadLatest} disabled={reloading || saving} className="h-7 shrink-0 border-red-300 bg-white text-red-800">
                {reloading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Reload latest
              </Button>
            </div>
          </div>
        )}
        
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
              <Button
                variant="ghost"
                size="sm"
                onClick={addProduct}
                className="h-6 px-2 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Product
              </Button>
            </div>
            <div className="space-y-2 mb-2">
              {products.map((product, index) => (
                <div key={product.id} className="flex gap-2 items-center">
                  <span className="text-xs font-medium w-6">#{index + 1}</span>
                  <Select
                    value={product.product_type || ""}
                    onValueChange={(val) => updateProduct(index, 'product_type', val)}
                  >
                    <SelectTrigger className="w-40 h-8 text-sm">
                      <SelectValue placeholder="Type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>None</SelectItem>
                      {productTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={product.description}
                    onChange={(e) => updateProduct(index, 'description', e.target.value)}
                    placeholder="Product description..."
                    className="flex-1 h-8 text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeProduct(index)}
                    className="h-8 w-8"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}
              {products.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">No products added yet</p>
              )}
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