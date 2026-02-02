import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Save, 
  X, 
  Plus, 
  Check, 
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  Circle
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { useAuth } from "@/components/auth/EmailGate";

const TEAM_MEMBERS = [
  "Carl", "Twyla", "Brett", "Kyle", "Joe", "Aidin", "Kay", "Brian", "Chris"
];

export default function CustomerInfoForm({ 
  isOpen, 
  onClose, 
  existingForm = null,
  onSave 
}) {
  const { currentUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [showCompletedNotes, setShowCompletedNotes] = useState(false);
  const [showCompletedFollowUp, setShowCompletedFollowUp] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [isAddingFollowUp, setIsAddingFollowUp] = useState(false);
  const [newFollowUpText, setNewFollowUpText] = useState("");
  const [addingSubTaskFor, setAddingSubTaskFor] = useState(null);
  const [newSubTaskText, setNewSubTaskText] = useState("");
  const [products, setProducts] = useState([]);
  const [productTypes, setProductTypes] = useState([]);

  const [formData, setFormData] = useState({
    designer: "",
    surveyor: "",
    initial_contact_date: "",
    site_survey_date: "",
    site_survey_time: "",
    site_survey_am_pm: "",
    customer_name: "",
    representative: "",
    address: "",
    address_line_2: "",
    contact_phone: "",
    email: "",
    billing_address: "",
    billing_address_line_2: "",
    additional_contact: "",
    permitting: "",
    township_city: "",
    county: "",
    code: "",
    class: "",
    owner: "",
    pud: "",
    parcel_number: "",
    electrical_ibi: false,
    electrical_nkyei: false,
    electrical_nec: false,
    electrical_city: false,
    electrical_county: false,
    customer_is_building_owner: false,
    customer_is_tenant: false,
    customer_is_marketing_co: false,
    business_co_coo_reminder: false,
    business_co_coo_date: "",
    install_yes: false,
    install_no: false,
    install_due_date: "",
    budget_less_than: "",
    removal_yes: false,
    removal_no: false,
    service_repair: "",
    origination: "",
    patch: "",
    paint: "",
    color: "",
    product_1: "",
    product_2: "",
    product_3: "",
    product_4: "",
    product_5: "",
    product_6: "",
    cb_complete: false,
    cf_complete: false,
    cc_complete: false,
    sms_complete: false,
    notes: [],
    follow_up: [],
    status: "active"
  });

  useEffect(() => {
    loadProductTypes();
    if (existingForm) {
      setFormData({
        ...formData,
        ...existingForm,
        notes: existingForm.notes || [],
        follow_up: existingForm.follow_up || []
      });
      // Load products from new structure or migrate old
      if (existingForm.products && Array.isArray(existingForm.products)) {
        setProducts(existingForm.products);
      } else {
        const migratedProducts = [];
        for (let i = 1; i <= 6; i++) {
          const desc = existingForm[`product_${i}`];
          if (desc && desc.trim()) {
            migratedProducts.push({
              id: `prod_${i}`,
              description: desc,
              product_type: ""
            });
          }
        }
        setProducts(migratedProducts);
      }
    }
  }, [existingForm]);

  const loadProductTypes = async () => {
    try {
      const settings = await base44.entities.GlobalSettings.filter({ setting_key: 'productTypes' });
      if (settings.length > 0) {
        setProductTypes(settings[0].setting_value?.items || []);
      } else {
        setProductTypes(["Channel Letters", "Cabinet Sign", "Monument", "Pylon", "Wall Sign", "Window Graphics", "Vehicle Wrap"]);
      }
    } catch (error) {
      console.error("Error loading product types:", error);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCheckboxChange = (field) => {
    setFormData(prev => ({ ...prev, [field]: !prev[field] }));
  };

  // Notes functions
  const handleAddNote = () => {
    if (!newNoteText.trim()) return;
    const newNote = {
      text: newNoteText,
      timestamp: new Date().toISOString(),
      created_by: currentUser?.email || "Unknown",
      completed: false,
      sub_tasks: []
    };
    setFormData(prev => ({
      ...prev,
      notes: [...(prev.notes || []), newNote]
    }));
    setNewNoteText("");
    setIsAddingNote(false);
  };

  const handleToggleNote = (index) => {
    const updatedNotes = [...formData.notes];
    updatedNotes[index] = {
      ...updatedNotes[index],
      completed: !updatedNotes[index].completed
    };
    setFormData(prev => ({ ...prev, notes: updatedNotes }));
  };

  const handleDeleteNote = (index) => {
    setFormData(prev => ({
      ...prev,
      notes: prev.notes.filter((_, i) => i !== index)
    }));
  };

  const handleAddSubTask = (noteIndex) => {
    if (!newSubTaskText.trim()) return;
    const updatedNotes = formData.notes.map((note, idx) => {
      if (idx === noteIndex) {
        return {
          ...note,
          sub_tasks: [...(note.sub_tasks || []), { text: newSubTaskText, completed: false }]
        };
      }
      return note;
    });
    setFormData(prev => ({ ...prev, notes: updatedNotes }));
    setNewSubTaskText("");
    setAddingSubTaskFor(null);
  };

  const handleToggleSubTask = (noteIndex, subTaskIndex) => {
    const updatedNotes = formData.notes.map((note, idx) => {
      if (idx === noteIndex) {
        const updatedSubTasks = (note.sub_tasks || []).map((st, stIdx) => {
          if (stIdx === subTaskIndex) {
            return { ...st, completed: !st.completed };
          }
          return st;
        });
        return { ...note, sub_tasks: updatedSubTasks };
      }
      return note;
    });
    setFormData(prev => ({ ...prev, notes: updatedNotes }));
  };

  const handleDeleteSubTask = (noteIndex, subTaskIndex) => {
    const updatedNotes = formData.notes.map((note, idx) => {
      if (idx === noteIndex) {
        return {
          ...note,
          sub_tasks: (note.sub_tasks || []).filter((_, stIdx) => stIdx !== subTaskIndex)
        };
      }
      return note;
    });
    setFormData(prev => ({ ...prev, notes: updatedNotes }));
  };

  // Follow Up functions
  const handleAddFollowUp = () => {
    if (!newFollowUpText.trim()) return;
    const newItem = {
      text: newFollowUpText,
      timestamp: new Date().toISOString(),
      created_by: currentUser?.email || "Unknown",
      completed: false
    };
    setFormData(prev => ({
      ...prev,
      follow_up: [...(prev.follow_up || []), newItem]
    }));
    setNewFollowUpText("");
    setIsAddingFollowUp(false);
  };

  const handleToggleFollowUp = (index) => {
    const updated = [...formData.follow_up];
    updated[index] = {
      ...updated[index],
      completed: !updated[index].completed
    };
    setFormData(prev => ({ ...prev, follow_up: updated }));
  };

  const handleDeleteFollowUp = (index) => {
    setFormData(prev => ({
      ...prev,
      follow_up: prev.follow_up.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async () => {
    if (!formData.customer_name.trim()) {
      alert("Customer name is required");
      return;
    }
    setSaving(true);
    try {
      const cleanedData = {
        ...formData,
        budget_less_than: formData.budget_less_than ? parseFloat(formData.budget_less_than) : null,
        products: products
      };
      
      if (existingForm?.id) {
        await base44.entities.CustomerInfo.update(existingForm.id, cleanedData);
      } else {
        await base44.entities.CustomerInfo.create(cleanedData);
      }
      if (onSave) onSave();
      onClose();
    } catch (error) {
      console.error("Error saving form:", error);
      alert("Error saving form: " + error.message);
    }
    setSaving(false);
  };

  const activeNotes = (formData.notes || []).filter(n => !n.completed);
  const completedNotes = (formData.notes || []).filter(n => n.completed);
  const activeFollowUp = (formData.follow_up || []).filter(f => !f.completed);
  const completedFollowUp = (formData.follow_up || []).filter(f => f.completed);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-5xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-gray-800">
            Customer Information Form
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Header Section - Designer/Surveyor */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label className="font-semibold">Designer</Label>
                <Select value={formData.designer} onValueChange={(v) => handleChange("designer", v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select designer" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_MEMBERS.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="font-semibold">Initial Contact Date</Label>
                <Input
                  type="date"
                  value={formData.initial_contact_date}
                  onChange={(e) => handleChange("initial_contact_date", e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <Label className="font-semibold">Surveyor</Label>
                <Select value={formData.surveyor} onValueChange={(v) => handleChange("surveyor", v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select surveyor" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_MEMBERS.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="font-semibold">Site Survey Date</Label>
                  <Input
                    type="date"
                    value={formData.site_survey_date}
                    onChange={(e) => handleChange("site_survey_date", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="font-semibold">Time</Label>
                  <Input
                    type="time"
                    value={formData.site_survey_time}
                    onChange={(e) => handleChange("site_survey_time", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="font-semibold">AM/PM</Label>
                  <Select value={formData.site_survey_am_pm} onValueChange={(v) => handleChange("site_survey_am_pm", v)}>
                    <SelectTrigger className="mt-1">
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
          </div>

          {/* Customer Information Section */}
          <div className="clay-card p-4">
            <h3 className="font-bold text-lg mb-4 border-b pb-2">Customer Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Customer *</Label>
                <Input
                  value={formData.customer_name}
                  onChange={(e) => handleChange("customer_name", e.target.value)}
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label>Representative</Label>
                <Input
                  value={formData.representative}
                  onChange={(e) => handleChange("representative", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Address</Label>
                <Input
                  value={formData.address}
                  onChange={(e) => handleChange("address", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Contact Phone</Label>
                <Input
                  value={formData.contact_phone}
                  onChange={(e) => handleChange("contact_phone", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Input
                  value={formData.address_line_2}
                  onChange={(e) => handleChange("address_line_2", e.target.value)}
                  placeholder="Address Line 2"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Billing Address</Label>
                <Input
                  value={formData.billing_address}
                  onChange={(e) => handleChange("billing_address", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Add'l Contact</Label>
                <Input
                  value={formData.additional_contact}
                  onChange={(e) => handleChange("additional_contact", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Input
                  value={formData.billing_address_line_2}
                  onChange={(e) => handleChange("billing_address_line_2", e.target.value)}
                  placeholder="Billing Address Line 2"
                />
              </div>
            </div>
          </div>

          {/* Permitting Section */}
          <div className="clay-card p-4">
            <h3 className="font-bold text-lg mb-4 border-b pb-2">Permitting & Location</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                <Label className="font-semibold">Permitting:</Label>
                <div className="flex items-center gap-4">
                  {["yes", "no", "maybe", "na"].map(opt => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={formData.permitting === opt}
                        onCheckedChange={() => handleChange("permitting", opt)}
                      />
                      <span className="capitalize">{opt === "na" ? "N/A" : opt}</span>
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Label>Twp / City:</Label>
                  <Input
                    value={formData.township_city}
                    onChange={(e) => handleChange("township_city", e.target.value)}
                    className="w-40"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label>Cty:</Label>
                  <Input
                    value={formData.county}
                    onChange={(e) => handleChange("county", e.target.value)}
                    className="w-40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label>Code</Label>
                  <Input
                    value={formData.code}
                    onChange={(e) => handleChange("code", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Class</Label>
                  <Input
                    value={formData.class}
                    onChange={(e) => handleChange("class", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Owner</Label>
                  <Input
                    value={formData.owner}
                    onChange={(e) => handleChange("owner", e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>PUD</Label>
                  <Input
                    value={formData.pud}
                    onChange={(e) => handleChange("pud", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Parcel #</Label>
                  <Input
                    value={formData.parcel_number}
                    onChange={(e) => handleChange("parcel_number", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Electrical</Label>
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <Checkbox checked={formData.electrical_ibi} onCheckedChange={() => handleCheckboxChange("electrical_ibi")} />
                      <span className="text-sm">IBI</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <Checkbox checked={formData.electrical_nkyei} onCheckedChange={() => handleCheckboxChange("electrical_nkyei")} />
                      <span className="text-sm">NKYEI</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <Checkbox checked={formData.electrical_nec} onCheckedChange={() => handleCheckboxChange("electrical_nec")} />
                      <span className="text-sm">NEC</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <Checkbox checked={formData.electrical_city} onCheckedChange={() => handleCheckboxChange("electrical_city")} />
                      <span className="text-sm">City</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <Checkbox checked={formData.electrical_county} onCheckedChange={() => handleCheckboxChange("electrical_county")} />
                      <span className="text-sm">County</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="font-semibold">Customer is:</Label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox checked={formData.customer_is_building_owner} onCheckedChange={() => handleCheckboxChange("customer_is_building_owner")} />
                    <span className="text-sm">Building Owner</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox checked={formData.customer_is_tenant} onCheckedChange={() => handleCheckboxChange("customer_is_tenant")} />
                    <span className="text-sm">Tenant</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox checked={formData.customer_is_marketing_co} onCheckedChange={() => handleCheckboxChange("customer_is_marketing_co")} />
                    <span className="text-sm">Marketing Co.</span>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox checked={formData.business_co_coo_reminder} onCheckedChange={() => handleCheckboxChange("business_co_coo_reminder")} />
                    <span className="text-sm">Business CO or COO Reminder</span>
                  </label>
                  <Input
                    value={formData.business_co_coo_date}
                    onChange={(e) => handleChange("business_co_coo_date", e.target.value)}
                    placeholder="Date"
                    className="w-32"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Install/Removal/Service Section */}
          <div className="clay-card p-4">
            <h3 className="font-bold text-lg mb-4 border-b pb-2">Service Details</h3>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <Label className="font-semibold w-20">Install:</Label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox checked={formData.install_yes} onCheckedChange={() => handleCheckboxChange("install_yes")} />
                    <span className="text-sm">Yes</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox checked={formData.install_no} onCheckedChange={() => handleCheckboxChange("install_no")} />
                    <span className="text-sm">No</span>
                  </label>
                  <div className="flex items-center gap-2 ml-4">
                    <Label>Due Date:</Label>
                    <Input
                      type="date"
                      value={formData.install_due_date}
                      onChange={(e) => handleChange("install_due_date", e.target.value)}
                      className="w-40"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Label className="font-semibold w-20">Removal:</Label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox checked={formData.removal_yes} onCheckedChange={() => handleCheckboxChange("removal_yes")} />
                    <span className="text-sm">Yes</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox checked={formData.removal_no} onCheckedChange={() => handleCheckboxChange("removal_no")} />
                    <span className="text-sm">No</span>
                  </label>
                </div>
                <div>
                  <Label>Service / Repair</Label>
                  <Input
                    value={formData.service_repair}
                    onChange={(e) => handleChange("service_repair", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>Patch</Label>
                    <Input
                      value={formData.patch}
                      onChange={(e) => handleChange("patch", e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Paint</Label>
                    <Input
                      value={formData.paint}
                      onChange={(e) => handleChange("paint", e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Color</Label>
                    <Input
                      value={formData.color}
                      onChange={(e) => handleChange("color", e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <Label>Budget - Less than $</Label>
                  <Input
                    type="number"
                    value={formData.budget_less_than}
                    onChange={(e) => handleChange("budget_less_than", e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Origination</Label>
                  <Input
                    value={formData.origination}
                    onChange={(e) => handleChange("origination", e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Products Section */}
          <div className="clay-card p-4">
            <div className="flex items-center justify-between mb-4 border-b pb-2">
              <h3 className="font-bold text-lg">Products</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setProducts([...products, { 
                  id: `prod_${Date.now()}`, 
                  description: "", 
                  product_type: "" 
                }])}
                className="h-7 px-3"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Product
              </Button>
            </div>
            <div className="space-y-2">
              {products.map((product, index) => (
                <div key={product.id} className="flex gap-2 items-center">
                  <Label className="w-6">#{index + 1}</Label>
                  <Input
                    value={product.description}
                    onChange={(e) => {
                      const updated = [...products];
                      updated[index].description = e.target.value;
                      setProducts(updated);
                    }}
                    placeholder="Product description..."
                    className="flex-1"
                  />
                  {currentUser?.role === 'admin' && (
                    <Select
                      value={product.product_type || ""}
                      onValueChange={(val) => {
                        const updated = [...products];
                        updated[index].product_type = val;
                        setProducts(updated);
                      }}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Product type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>None</SelectItem>
                        {productTypes.map(type => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setProducts(products.filter((_, i) => i !== index))}
                    className="h-8 w-8"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}
              {products.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-2">No products added yet</p>
              )}
            </div>
            <div className="mt-4 flex items-center gap-4">
              <span className="font-semibold text-sm">Complete:</span>
              <label className="flex items-center gap-1 cursor-pointer">
                <Checkbox checked={formData.cb_complete} onCheckedChange={() => handleCheckboxChange("cb_complete")} />
                <span className="text-sm">CB</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <Checkbox checked={formData.cf_complete} onCheckedChange={() => handleCheckboxChange("cf_complete")} />
                <span className="text-sm">CF</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <Checkbox checked={formData.cc_complete} onCheckedChange={() => handleCheckboxChange("cc_complete")} />
                <span className="text-sm">CC</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <Checkbox checked={formData.sms_complete} onCheckedChange={() => handleCheckboxChange("sms_complete")} />
                <span className="text-sm">SMS</span>
              </label>
            </div>
          </div>

          {/* Notes Section - Like Work Order Popup */}
          <div className="clay-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">Notes</h3>
              <div className="flex items-center gap-2">
                {completedNotes.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCompletedNotes(!showCompletedNotes)}
                    className="h-6 px-2 text-xs"
                  >
                    {showCompletedNotes ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                    {showCompletedNotes ? 'Hide' : 'Show'} ({completedNotes.length})
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddingNote(true)}
                  className="h-6 px-2 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </Button>
              </div>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {isAddingNote && (
                <div className="p-2 bg-blue-50 rounded-lg space-y-2">
                  <Input
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Enter note..."
                    className="text-sm h-8"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddNote();
                      if (e.key === 'Escape') { setIsAddingNote(false); setNewNoteText(""); }
                    }}
                  />
                  <div className="flex gap-1">
                    <Button size="sm" onClick={handleAddNote} className="h-6 px-2 text-xs bg-green-100 hover:bg-green-200 text-green-800">
                      <Check className="w-3 h-3 mr-1" />Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setIsAddingNote(false); setNewNoteText(""); }} className="h-6 px-2 text-xs">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}

              {activeNotes.map((note, idx) => {
                const actualIndex = formData.notes.findIndex(n => n === note);
                return (
                  <div key={idx} className="bg-white/50 rounded-lg">
                    <div className="p-2 flex items-start gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleNote(actualIndex)}
                        className="h-4 w-4 rounded-full flex-shrink-0 hover:bg-green-100 p-0"
                      >
                        <Circle className="w-3 h-3 text-gray-400" />
                      </Button>
                      <div className="flex-1">
                        <p className="text-sm text-gray-700">{note.text}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {format(new Date(note.timestamp), "MMM d, h:mm a")} • {note.created_by?.split('@')[0] || 'Unknown'}
                        </p>
                        {/* Sub-tasks */}
                        {note.sub_tasks && note.sub_tasks.length > 0 && (
                          <div className="ml-4 mt-2 space-y-1">
                            {note.sub_tasks.map((subTask, subIdx) => (
                              <div key={subIdx} className="flex items-center gap-2 text-xs">
                                <Checkbox
                                  checked={subTask.completed}
                                  onCheckedChange={() => handleToggleSubTask(actualIndex, subIdx)}
                                  className="h-3 w-3"
                                />
                                <span className={subTask.completed ? "line-through text-gray-400" : "text-gray-600"}>{subTask.text}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteSubTask(actualIndex, subIdx)}
                                  className="h-4 w-4 ml-auto p-0"
                                >
                                  <X className="w-2 h-2 text-red-500" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Add sub-task */}
                        {addingSubTaskFor === actualIndex ? (
                          <div className="ml-4 mt-2 flex gap-1">
                            <Input
                              value={newSubTaskText}
                              onChange={(e) => setNewSubTaskText(e.target.value)}
                              placeholder="Sub-task..."
                              className="h-6 text-xs"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddSubTask(actualIndex);
                                if (e.key === 'Escape') { setAddingSubTaskFor(null); setNewSubTaskText(""); }
                              }}
                            />
                            <Button size="sm" onClick={() => handleAddSubTask(actualIndex)} className="h-6 px-2">
                              <Check className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setAddingSubTaskFor(null); setNewSubTaskText(""); }} className="h-6 px-2">
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAddingSubTaskFor(actualIndex)}
                            className="h-5 px-2 text-xs ml-4 mt-1"
                          >
                            <Plus className="w-2 h-2 mr-1" />
                            Sub-task
                          </Button>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteNote(actualIndex)}
                        className="h-6 w-6 flex-shrink-0"
                      >
                        <Trash2 className="w-3 h-3 text-red-600" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {showCompletedNotes && completedNotes.map((note, idx) => {
                const actualIndex = formData.notes.findIndex(n => n === note);
                return (
                  <div key={idx} className="p-2 bg-gray-100/50 rounded-lg opacity-60 flex items-start gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleNote(actualIndex)}
                      className="h-4 w-4 rounded-full flex-shrink-0 hover:bg-gray-200 p-0"
                    >
                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                    </Button>
                    <div className="flex-1">
                      <p className="text-sm text-gray-600 line-through">{note.text}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {format(new Date(note.timestamp), "MMM d, h:mm a")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteNote(actualIndex)}
                      className="h-6 w-6 flex-shrink-0"
                    >
                      <Trash2 className="w-3 h-3 text-red-600" />
                    </Button>
                  </div>
                );
              })}

              {activeNotes.length === 0 && !isAddingNote && (
                <p className="text-xs text-gray-400 text-center py-2">No notes yet</p>
              )}
            </div>
          </div>

          {/* Follow Up Section */}
          <div className="clay-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">Follow Up</h3>
              <div className="flex items-center gap-2">
                {completedFollowUp.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCompletedFollowUp(!showCompletedFollowUp)}
                    className="h-6 px-2 text-xs"
                  >
                    {showCompletedFollowUp ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                    {showCompletedFollowUp ? 'Hide' : 'Show'} ({completedFollowUp.length})
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddingFollowUp(true)}
                  className="h-6 px-2 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </Button>
              </div>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {isAddingFollowUp && (
                <div className="p-2 bg-blue-50 rounded-lg space-y-2">
                  <Input
                    value={newFollowUpText}
                    onChange={(e) => setNewFollowUpText(e.target.value)}
                    placeholder="Enter follow up item..."
                    className="text-sm h-8"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddFollowUp();
                      if (e.key === 'Escape') { setIsAddingFollowUp(false); setNewFollowUpText(""); }
                    }}
                  />
                  <div className="flex gap-1">
                    <Button size="sm" onClick={handleAddFollowUp} className="h-6 px-2 text-xs bg-green-100 hover:bg-green-200 text-green-800">
                      <Check className="w-3 h-3 mr-1" />Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setIsAddingFollowUp(false); setNewFollowUpText(""); }} className="h-6 px-2 text-xs">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}

              {activeFollowUp.map((item, idx) => {
                const actualIndex = formData.follow_up.findIndex(f => f === item);
                return (
                  <div key={idx} className="p-2 bg-white/50 rounded-lg flex items-start gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleFollowUp(actualIndex)}
                      className="h-4 w-4 rounded-full flex-shrink-0 hover:bg-green-100 p-0"
                    >
                      <Circle className="w-3 h-3 text-gray-400" />
                    </Button>
                    <div className="flex-1">
                      <p className="text-sm text-gray-700">{item.text}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {format(new Date(item.timestamp), "MMM d, h:mm a")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteFollowUp(actualIndex)}
                      className="h-6 w-6 flex-shrink-0"
                    >
                      <Trash2 className="w-3 h-3 text-red-600" />
                    </Button>
                  </div>
                );
              })}

              {showCompletedFollowUp && completedFollowUp.map((item, idx) => {
                const actualIndex = formData.follow_up.findIndex(f => f === item);
                return (
                  <div key={idx} className="p-2 bg-gray-100/50 rounded-lg opacity-60 flex items-start gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleFollowUp(actualIndex)}
                      className="h-4 w-4 rounded-full flex-shrink-0 hover:bg-gray-200 p-0"
                    >
                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                    </Button>
                    <div className="flex-1">
                      <p className="text-sm text-gray-600 line-through">{item.text}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteFollowUp(actualIndex)}
                      className="h-6 w-6 flex-shrink-0"
                    >
                      <Trash2 className="w-3 h-3 text-red-600" />
                    </Button>
                  </div>
                );
              })}

              {activeFollowUp.length === 0 && !isAddingFollowUp && (
                <p className="text-xs text-gray-400 text-center py-2">No follow up items yet</p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose} className="clay-button">
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={saving}
              className="clay-button border-none text-gray-800"
              style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}
            >
              {saving ? "Saving..." : (existingForm ? "Update" : "Create")} Form
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}