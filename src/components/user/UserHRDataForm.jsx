import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { updateAuthorizedEmailIfUnchanged } from "@/components/admin/authorizedEmailPersistence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  User,
  Phone,
  GraduationCap,
  Shirt
} from "lucide-react";

const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];
const HOODIE_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];
const HAT_SIZES = ["S/M", "L/XL", "One Size", "Fitted 6 7/8", "Fitted 7", "Fitted 7 1/8", "Fitted 7 1/4", "Fitted 7 3/8", "Fitted 7 1/2", "Fitted 7 5/8", "Fitted 7 3/4"];
const MARITAL_STATUS = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
  { value: "domestic_partnership", label: "Domestic Partnership" },
  { value: "prefer_not_to_say", label: "Prefer not to say" }
];

export default function UserHRDataForm({ userData, onUpdate, section, isAdmin = false }) {
  const [hrData, setHrData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (userData?.hr_data) {
      setHrData(userData.hr_data);
    }
  }, [userData]);

  const handleSave = async () => {
    if (!userData?.id) return;
    
    setIsSaving(true);
    setSaveError("");
    setSaveSuccess("");
    
    try {
      await updateAuthorizedEmailIfUnchanged({
        entity: base44.entities.AuthorizedEmail,
        record: userData,
        nextFields: { hr_data: hrData },
        exactVersion: false,
        enforceIdentity: false,
        label: `HR data for ${userData.full_name || userData.email || userData.id}`
      });
      setSaveSuccess("Changes saved successfully!");
      setTimeout(() => setSaveSuccess(""), 3000);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("HR data save blocked:", error);
      setSaveError(error?.message || "Failed to save changes safely. Reload before retrying.");
    }
    setIsSaving(false);
  };

  const updateField = (field, value) => {
    setHrData(prev => ({ ...prev, [field]: value }));
  };

  const updateClothingSize = (field, value) => {
    setHrData(prev => ({
      ...prev,
      clothing_sizes: { ...(prev.clothing_sizes || {}), [field]: value }
    }));
  };

  const addEmergencyContact = () => {
    const contacts = hrData.emergency_contacts || [];
    setHrData(prev => ({
      ...prev,
      emergency_contacts: [...contacts, { name: "", relationship: "", phone: "", phone_alt: "" }]
    }));
  };

  const updateEmergencyContact = (index, field, value) => {
    const contacts = [...(hrData.emergency_contacts || [])];
    contacts[index] = { ...contacts[index], [field]: value };
    setHrData(prev => ({ ...prev, emergency_contacts: contacts }));
  };

  const removeEmergencyContact = (index) => {
    const contacts = (hrData.emergency_contacts || []).filter((_, i) => i !== index);
    setHrData(prev => ({ ...prev, emergency_contacts: contacts }));
  };

  const renderPersonalSection = () => (
    <div className="clay-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <User className="w-5 h-5 text-blue-600" />
        Personal Details
      </h2>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Full Name</Label>
          <Input
            value={userData?.full_name || ""}
            disabled
            className="mt-1 bg-gray-100"
          />
          <p className="text-xs text-gray-400 mt-1">Contact admin to change</p>
        </div>

        <div className="col-span-2">
          <Label>Address</Label>
          <Input
            value={hrData.address || ""}
            onChange={(e) => updateField("address", e.target.value)}
            placeholder="Street address"
            className="mt-1"
          />
        </div>

        <div>
          <Label>City</Label>
          <Input
            value={hrData.city || ""}
            onChange={(e) => updateField("city", e.target.value)}
            placeholder="City"
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>State</Label>
            <Input
              value={hrData.state || ""}
              onChange={(e) => updateField("state", e.target.value)}
              placeholder="State"
              className="mt-1"
            />
          </div>
          <div>
            <Label>ZIP</Label>
            <Input
              value={hrData.zip || ""}
              onChange={(e) => updateField("zip", e.target.value)}
              placeholder="ZIP"
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <Label>Phone Number</Label>
          <Input
            type="tel"
            value={hrData.phone || ""}
            onChange={(e) => updateField("phone", e.target.value)}
            placeholder="(555) 555-5555"
            className="mt-1"
          />
        </div>

        <div>
          <Label>Personal Email</Label>
          <Input
            type="email"
            value={hrData.personal_email || ""}
            onChange={(e) => updateField("personal_email", e.target.value)}
            placeholder="personal@email.com"
            className="mt-1"
          />
        </div>

        <div>
          <Label>Date of Birth</Label>
          <Input
            type="date"
            value={hrData.date_of_birth || ""}
            onChange={(e) => updateField("date_of_birth", e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <Label>Marital Status</Label>
          <Select
            value={hrData.marital_status || ""}
            onValueChange={(val) => updateField("marital_status", val)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {MARITAL_STATUS.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isAdmin && (
          <>
            <div>
              <Label>Hire Date</Label>
              <Input
                type="date"
                value={hrData.hire_date || ""}
                onChange={(e) => updateField("hire_date", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={hrData.start_date || ""}
                onChange={(e) => updateField("start_date", e.target.value)}
                className="mt-1"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );

  const renderEmergencySection = () => (
    <div className="clay-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Phone className="w-5 h-5 text-red-600" />
          Emergency Contacts
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={addEmergencyContact}
          className="gap-1"
        >
          <Plus className="w-4 h-4" />
          Add Contact
        </Button>
      </div>
      
      {(!hrData.emergency_contacts || hrData.emergency_contacts.length === 0) ? (
        <p className="text-gray-500 text-center py-8">No emergency contacts added yet</p>
      ) : (
        <div className="space-y-4">
          {hrData.emergency_contacts.map((contact, index) => (
            <div key={index} className="p-4 bg-white/50 rounded-lg border">
              <div className="flex justify-between items-start mb-3">
                <span className="font-medium text-sm text-gray-600">Contact #{index + 1}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeEmergencyContact(index)}
                  className="h-6 w-6"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={contact.name || ""}
                    onChange={(e) => updateEmergencyContact(index, "name", e.target.value)}
                    placeholder="Contact name"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Relationship</Label>
                  <Input
                    value={contact.relationship || ""}
                    onChange={(e) => updateEmergencyContact(index, "relationship", e.target.value)}
                    placeholder="e.g., Spouse, Parent"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Primary Phone</Label>
                  <Input
                    type="tel"
                    value={contact.phone || ""}
                    onChange={(e) => updateEmergencyContact(index, "phone", e.target.value)}
                    placeholder="(555) 555-5555"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Alternate Phone</Label>
                  <Input
                    type="tel"
                    value={contact.phone_alt || ""}
                    onChange={(e) => updateEmergencyContact(index, "phone_alt", e.target.value)}
                    placeholder="(555) 555-5555"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderQualificationsSection = () => (
    <div className="clay-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <GraduationCap className="w-5 h-5 text-green-600" />
        Qualifications & Experience
      </h2>
      
      <div className="space-y-4">
        <div>
          <Label>Education</Label>
          <Textarea
            value={hrData.education || ""}
            onChange={(e) => updateField("education", e.target.value)}
            placeholder="List your education background..."
            className="mt-1 min-h-20"
          />
        </div>

        <div>
          <Label>Skills (comma separated)</Label>
          <Input
            value={(hrData.skills || []).join(", ")}
            onChange={(e) => updateField("skills", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
            placeholder="e.g., Sign fabrication, Vinyl installation, CNC operation"
            className="mt-1"
          />
        </div>

        <div>
          <Label>Certifications (comma separated)</Label>
          <Input
            value={(hrData.certifications || []).join(", ")}
            onChange={(e) => updateField("certifications", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
            placeholder="e.g., CDL, Forklift, Crane Operator"
            className="mt-1"
          />
        </div>

        <div>
          <Label>OSHA Training (comma separated)</Label>
          <Input
            value={(hrData.osha_training || []).join(", ")}
            onChange={(e) => updateField("osha_training", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
            placeholder="e.g., OSHA 10, OSHA 30, Fall Protection"
            className="mt-1"
          />
        </div>

        <div>
          <Label>Licenses (comma separated)</Label>
          <Input
            value={(hrData.licenses || []).join(", ")}
            onChange={(e) => updateField("licenses", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
            placeholder="e.g., Driver's License, Electrical License"
            className="mt-1"
          />
        </div>

        <div>
          <Label>Previous Experience</Label>
          <Textarea
            value={hrData.previous_experience || ""}
            onChange={(e) => updateField("previous_experience", e.target.value)}
            placeholder="Describe your relevant work experience..."
            className="mt-1 min-h-24"
          />
        </div>
      </div>
    </div>
  );

  const renderClothingSection = () => (
    <div className="clay-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Shirt className="w-5 h-5 text-purple-600" />
        Clothing Sizes
      </h2>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <Label>Shirt Size</Label>
          <Select
            value={hrData.clothing_sizes?.shirt || ""}
            onValueChange={(val) => updateClothingSize("shirt", val)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {SHIRT_SIZES.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Hoodie/Pullover Size</Label>
          <Select
            value={hrData.clothing_sizes?.hoodie || ""}
            onValueChange={(val) => updateClothingSize("hoodie", val)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {HOODIE_SIZES.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Pants Waist</Label>
          <Input
            value={hrData.clothing_sizes?.pants_waist || ""}
            onChange={(e) => updateClothingSize("pants_waist", e.target.value)}
            placeholder="e.g., 32"
            className="mt-1"
          />
        </div>

        <div>
          <Label>Shoe Size</Label>
          <Input
            value={hrData.clothing_sizes?.shoe || ""}
            onChange={(e) => updateClothingSize("shoe", e.target.value)}
            placeholder="e.g., 10.5"
            className="mt-1"
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {section === "personal" && renderPersonalSection()}
      {section === "emergency" && renderEmergencySection()}
      {section === "qualifications" && renderQualificationsSection()}
      {section === "clothing" && renderClothingSection()}
      {section === "all" && (
        <>
          {renderPersonalSection()}
          {renderEmergencySection()}
          {renderQualificationsSection()}
          {renderClothingSection()}
        </>
      )}

      <div className="flex items-center justify-between">
        <div>
          {saveSuccess && (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <Check className="w-4 h-4" />
              {saveSuccess}
            </div>
          )}
          {saveError && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              {saveError}
            </div>
          )}
        </div>
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="clay-button"
          style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Check className="w-4 h-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}