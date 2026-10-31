import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { updateAuthorizedEmailIfUnchanged } from "@/components/admin/authorizedEmailPersistence";
import { reconcileHrDraft, formatHrFieldPath, previewHrResolution, hasUnsavedHrDraft } from "./reconcileHrDraft.js";
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
import { staffEntities } from "@/components/staff/staffEntities";
import { CcsDateField } from "@/components/ui/ccs-date-field";

const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];
const HOODIE_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];
const HAT_SIZES = ["S/M", "L/XL", "One Size", "Fitted 6 7/8", "Fitted 7", "Fitted 7 1/8", "Fitted 7 1/4", "Fitted 7 3/8", "Fitted 7 1/2", "Fitted 7 5/8", "Fitted 7 3/4"];
const HR_PREVIEW_OUTCOME = {
  mine: "Keep my edit",
  latest: "Keep newer change",
  "latest-over-mine": "Discard my edit; keep newer",
  overwritten: "Replace newer with my edit",
  agreed: "Both match"
};

const MARITAL_STATUS = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
  { value: "domestic_partnership", label: "Domestic Partnership" },
  { value: "prefer_not_to_say", label: "Prefer not to say" }
];

export default function UserHRDataForm({ userData, onUpdate, onSave, section, isAdmin = false, saveScope = null, preserveDraftOnRecordRefresh = false, onReloadLatest = null, onDraftStatusChange = null }) {
  const [hrData, setHrData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saveError, setSaveError] = useState("");
  const [hrRecovery, setHrRecovery] = useState(null);
  const [reloadSaving, setReloadSaving] = useState(false);
  const [draftNotice, setDraftNotice] = useState("");
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [hrPreviewChoice, setHrPreviewChoice] = useState("prefer-latest");
  const reloadOwner = useRef(null);
  const reloadInFlight = useRef(false);
  const saveInFlight = useRef(false);
  const saveOwner = useRef(null);
  const scopeVersion = useRef(0);
  const successTimer = useRef(null);
  const activeScope = useRef(null);
  activeScope.current = { id: userData?.id, email: userData?.email, saveScope };

  useEffect(() => {
    // Only publish scoped dirty metadata. HR field values stay in this form;
    // session/employee ownership is enforced again by the Admin parent.
    if (!onDraftStatusChange) return;
    onDraftStatusChange({
      id: userData?.id, email: userData?.email, saveScope,
      dirty: hasUnsavedHrDraft(userData?.hr_data || {}, hrData) || !!hrRecovery
    });
  }, [userData?.id, userData?.email, userData?.hr_data, saveScope, hrData, hrRecovery, onDraftStatusChange]);

  useEffect(() => {
    // Admin refreshes the record version after each verified HR write.
    // Keep subsequent unsaved edits instead of resetting the whole form.
    if (!preserveDraftOnRecordRefresh) setHrData(userData?.hr_data || {});
  }, [userData, preserveDraftOnRecordRefresh]);

  useEffect(() => {
    // A switched employee or Admin identity must not retain an older save,
    // success message, error, or confidential form state.
    ++scopeVersion.current;
    saveOwner.current = null;
    saveInFlight.current = false;
    setIsSaving(false);
    setSaveSuccess("");
    setSaveError("");
    setHrRecovery(null);
    setReloadSaving(false);
    setDraftNotice("");
    setConfirmOverwrite(false);
    setHrPreviewChoice("prefer-latest");
    reloadOwner.current = null;
    reloadInFlight.current = false;
    setHrData(userData?.hr_data || {});
    if (successTimer.current) clearTimeout(successTimer.current);
    return () => {
      ++scopeVersion.current;
      saveOwner.current = null;
      saveInFlight.current = false;
      reloadOwner.current = null;
      reloadInFlight.current = false;
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, [userData?.id, userData?.email, saveScope]);

  const handleSave = async () => {
    if (!userData?.id || saveInFlight.current || reloadInFlight.current || hrRecovery) return;
    const owner = {
      id: userData.id, email: userData.email, saveScope,
      version: scopeVersion.current
    };
    saveOwner.current = owner;
    const ownsSave = () => saveOwner.current === owner &&
      scopeVersion.current === owner.version &&
      activeScope.current?.id === owner.id &&
      activeScope.current?.email === owner.email &&
      activeScope.current?.saveScope === owner.saveScope;
    saveInFlight.current = true;
    setIsSaving(true);
    setSaveError("");
    setSaveSuccess("");
    setDraftNotice("");
    if (successTimer.current) clearTimeout(successTimer.current);

    try {
      if (onSave) {
        const result = await onSave(hrData);
        // Admin returns false if a different session now owns the editor.
        if (!ownsSave() || result === false) return;
      } else {
        await updateAuthorizedEmailIfUnchanged({
          entity: staffEntities.AuthorizedEmail,
          record: userData,
          nextFields: { hr_data: hrData },
          exactVersion: false,
          enforceIdentity: false,
          label: `HR data for ${userData.full_name || userData.email || userData.id}`
        });
        if (!ownsSave()) return;
      }
      setSaveSuccess("Changes saved successfully!");
      successTimer.current = setTimeout(() => {
        if (scopeVersion.current === owner.version &&
            activeScope.current?.id === owner.id &&
            activeScope.current?.email === owner.email &&
            activeScope.current?.saveScope === owner.saveScope) setSaveSuccess("");
      }, 3000);
      if (onUpdate && ownsSave()) onUpdate();
    } catch (error) {
      if (!ownsSave()) return;
      console.error("HR data save blocked:", error);
      setSaveError(error?.message || "Failed to save changes safely. Reload before retrying.");
      if (preserveDraftOnRecordRefresh && onReloadLatest &&
          /HR data changed in another session|saved HR record could not be verified/i.test(error?.message || "")) {
        setHrRecovery({ stage: "needs_reload", baseline: userData?.hr_data || {} });
        setConfirmOverwrite(false);
      }
    } finally {
      if (ownsSave()) {
        saveOwner.current = null;
        saveInFlight.current = false;
        setIsSaving(false);
      }
    }
  };

  const reloadHrForRecovery = async () => {
    if (!hrRecovery || hrRecovery.stage !== "needs_reload" || !onReloadLatest ||
        reloadInFlight.current || saveInFlight.current) return;
    const owner = {
      id: userData?.id, email: userData?.email,
      saveScope, version: scopeVersion.current
    };
    const ownsReload = () => reloadOwner.current === owner &&
      scopeVersion.current === owner.version &&
      activeScope.current?.id === owner.id &&
      activeScope.current?.email === owner.email &&
      activeScope.current?.saveScope === owner.saveScope;
    reloadOwner.current = owner;
    reloadInFlight.current = true;
    setReloadSaving(true);
    setSaveError("");
    try {
      const latest = await onReloadLatest();
      if (!ownsReload()) return;
      if (!latest?.updated_date || latest.id !== owner.id ||
          latest.email !== owner.email || !latest.hr_data ||
          typeof latest.hr_data !== "object" || Array.isArray(latest.hr_data)) {
        throw new Error("The latest employee record could not be verified. Retry reloading.");
      }
      // Keep the current draft untouched; a separate deliberate choice
      // reconciles it with the verified latest backend snapshot.
      setHrRecovery(current => current?.stage === "needs_reload"
        ? { ...current, stage: "review", latest: latest.hr_data } : current);
      setConfirmOverwrite(false);
      setHrPreviewChoice("prefer-latest");
    } catch (error) {
      if (ownsReload()) setSaveError(error?.message || "Could not reload HR information safely.");
    } finally {
      if (ownsReload()) {
        reloadOwner.current = null;
        reloadInFlight.current = false;
        setReloadSaving(false);
      }
    }
  };

  const recoveryComparison = hrRecovery?.stage === "review"
    ? reconcileHrDraft({
        baseline: hrRecovery.baseline, latest: hrRecovery.latest, draft: hrData
      }) : null;

  const hrResolutionPreview = hrRecovery?.stage === "review"
    ? previewHrResolution({
        baseline: hrRecovery.baseline,
        latest: hrRecovery.latest,
        draft: hrData,
        choice: hrPreviewChoice
      }) : null;

  const selectHrPreviewChoice = choice => {
    setHrPreviewChoice(choice);
    setConfirmOverwrite(false);
  };

  const resolveHrRecovery = (choice) => {
    if (hrRecovery?.stage !== "review" || !recoveryComparison ||
        reloadInFlight.current || saveInFlight.current) return;
    if (choice === "keep-conflicts" && !confirmOverwrite) return;
    const updated = choice === "latest" ? hrRecovery.latest :
      reconcileHrDraft({
        baseline: hrRecovery.baseline,
        latest: hrRecovery.latest,
        draft: hrData,
        overwriteConflicts: choice === "keep-conflicts"
      }).merged;
    setHrData(updated);
    setHrRecovery(null);
    setSaveError("");
    setConfirmOverwrite(false);
    setHrPreviewChoice("prefer-latest");
    setDraftNotice("Draft updated using the latest HR record. Review the fields, then Save Changes. Nothing has been saved yet.");
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
          <CcsDateField
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
              <CcsDateField
                value={hrData.hire_date || ""}
                onChange={(e) => updateField("hire_date", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Start Date</Label>
              <CcsDateField
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

      {hrRecovery && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3 text-sm">
          <p className="font-medium text-amber-950">HR information changed in another session.</p>
          <p className="text-amber-900">Your unsaved draft is still here. Saving is paused until you review the latest record. No overwrite happens during recovery.</p>
          {hrRecovery.stage === "needs_reload" ? (
            <Button type="button" variant="outline" disabled={reloadSaving}
              onClick={reloadHrForRecovery}>
              {reloadSaving ? "Loading latest HR record..." : "Load latest record (keep my draft)"}
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-amber-900">
                Latest HR record loaded. You changed {recoveryComparison?.editedFields.length || 0} field(s).
                {recoveryComparison?.conflictFields.length
                  ? ` Both administrators changed: ${recoveryComparison.conflictFields.map(formatHrFieldPath).join(", ")}.`
                  : " No overlapping field changes were found."}
              </p>
              <p className="text-amber-900">
                Clothing sizes and uniquely matched emergency contacts are compared field by field. If contact identities, order, or list size change, the entire contact list is treated as one change. Choose how to resolve your draft, review the fields, and then save separately.
              </p>
              <div className="space-y-2">
                <p className="font-medium text-amber-950">1. Preview a resolution (no changes applied)</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="HR resolution preview choices">
                  {[
                    { value: "prefer-latest", label: "Keep non-conflicting edits" },
                    { value: "latest", label: "Use latest record" },
                    ...(recoveryComparison?.conflictFields.length
                      ? [{ value: "keep-conflicts", label: "Keep my conflicting edits" }] : [])
                  ].map(option => (
                    <Button key={option.value} type="button" size="sm"
                      variant={hrPreviewChoice === option.value ? "default" : "outline"}
                      aria-pressed={hrPreviewChoice === option.value}
                      onClick={() => selectHrPreviewChoice(option.value)}>
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-amber-200 bg-white p-3 space-y-2"
                aria-label="HR field resolution preview">
                <p className="font-medium text-gray-900">2. Review what will be kept or replaced</p>
                <p className="text-gray-700">
                  {hrResolutionPreview?.counts.mine || 0} of your field edits kept;
                  {" "}{hrResolutionPreview?.counts.latest || 0} newer fields kept;
                  {" "}{hrResolutionPreview?.counts.overwritten || 0} newer fields replaced;
                  {" "}{hrResolutionPreview?.counts.agreed || 0} fields already match.
                </p>
                <p className="text-xs text-gray-600">Field names and outcomes only; sensitive HR values are not shown here.</p>
                {hrResolutionPreview?.fields.length ? (
                  <div className="max-h-56 overflow-y-auto rounded border border-gray-200">
                    <table className="w-full text-xs text-left">
                      <thead className="sticky top-0 bg-gray-100 text-gray-700">
                        <tr>
                          <th scope="col" className="p-2 font-medium">HR field</th>
                          <th scope="col" className="p-2 font-medium">With this choice</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hrResolutionPreview.fields.map(field => (
                          <tr key={field.path} className="border-t border-gray-100">
                            <td className="p-2 break-words text-gray-900">{field.label}</td>
                            <td className="p-2 break-words text-gray-700">{HR_PREVIEW_OUTCOME[field.outcome]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-700">No field differences to resolve.</p>
                )}
              </div>
              {hrPreviewChoice === "keep-conflicts" && recoveryComparison?.conflictFields.length > 0 && (
                <label className="flex items-start gap-2 rounded border border-amber-400 p-3 text-amber-950">
                  <input type="checkbox" className="mt-1" checked={confirmOverwrite}
                    onChange={event => setConfirmOverwrite(event.target.checked)} />
                  I understand the fields labeled "Replace newer with my edit" will use my older draft values and replace newer values when I later save.
                </label>
              )}
              <div className="flex items-center justify-end gap-2 border-t border-amber-200 pt-3">
                <p className="text-xs text-amber-900 flex-1">3. Apply to my local draft only. Review the form and save separately.</p>
                <Button type="button" size="sm"
                  disabled={hrPreviewChoice === "keep-conflicts" && !confirmOverwrite}
                  onClick={() => resolveHrRecovery(hrPreviewChoice)}>
                  Apply preview to my draft
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {draftNotice && (
        <p className="text-sm text-blue-800" role="status">{draftNotice}</p>
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
          disabled={isSaving || saveInFlight.current || reloadSaving || !!hrRecovery}
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