import OfficeRescanButton from "./OfficeRescanButton";
import LocalityOfficeReviewEvidence from "./LocalityOfficeReviewEvidence";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import { LOCALITY_AUTHORITY_ROLES, revokeLocalityOfficeAuthorityVerification, setLocalityOfficeAuthorityRole, summarizeLocalityOfficeAuthority, updateLocalityOfficeIdentity, verifyLocalityOfficeAuthority } from "./localityAuthorityVerification";

const stepTypeLabels = {
  checkbox: '☑ Checkbox',
  submitted_date: '📅 Submitted Date',
  followup_date: '🔔 Follow-up Date',
  permit_received_date: '✅ Permit Received',
  text: '📝 Text'
};

// Addons that can be "tied" to any step: extra checkbox, follow-up date, and/or text field.
const ADDON_DEFS = [
  { key: 'has_checkbox', label: '☑ Checkbox', color: 'bg-green-50 border-green-300 text-green-700' },
  { key: 'has_followup', label: '🔔 Follow-up', color: 'bg-amber-50 border-amber-300 text-amber-700' },
  { key: 'has_text', label: '📝 Text', color: 'bg-blue-50 border-blue-300 text-blue-700' },
];

export default function LocalityOfficeEditor({ office, officeTypes, onChange, onDelete, verificationActor,localityId, provenance }) {
  const [expanded, setExpanded] = useState(true);
  const [newStepName, setNewStepName] = useState("");
  const [newStepType, setNewStepType] = useState("checkbox");
  const authoritySummary = summarizeLocalityOfficeAuthority(office);

  const update = (patch) => onChange(updateLocalityOfficeIdentity(office, patch));

  const addStep = () => {
    if (!newStepName.trim()) return;
    const step = {
      id: `${Date.now()}-${Math.random()}`,
      name: newStepName.trim(),
      type: newStepType,
      followup_interval_days: newStepType === 'followup_date' ? 14 : undefined,
      order: (office.workflow_steps || []).length
    };
    update({ workflow_steps: [...(office.workflow_steps || []), step] });
    setNewStepName("");
  };

  const removeStep = (stepId) => {
    update({ workflow_steps: (office.workflow_steps || []).filter(s => s.id !== stepId) });
  };

  const handleStepDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(office.workflow_steps || []);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    update({ workflow_steps: reordered.map((s, i) => ({ ...s, order: i })) });
  };

  const updateStepField = (stepId, field, value) => {
    update({
      workflow_steps: (office.workflow_steps || []).map(s =>
        s.id === stepId ? { ...s, [field]: value } : s
      )
    });
  };

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      {localityId && <OfficeRescanButton localityId={localityId} office={office} />}
      {/* Office header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-50 to-white border-b">
        <button type="button" onClick={() => setExpanded(!expanded)} className="p-0.5">
          {expanded ? <ChevronDown className="w-4 h-4 text-purple-600" /> : <ChevronRight className="w-4 h-4 text-purple-600" />}
        </button>
        <Input
          value={office.name || ""}
          onChange={e => update({ name: e.target.value })}
          placeholder="Office name (e.g. Hamilton County Zoning)"
          className="h-7 text-sm font-semibold flex-1 border-none shadow-none bg-transparent focus:bg-white"
        />
        <Select value={office.office_type || ""} onValueChange={v => update({ office_type: v })}>
          <SelectTrigger className="h-7 text-xs w-40">
            <SelectValue placeholder="Office type..." />
          </SelectTrigger>
          <SelectContent>
            {officeTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-[10px] text-gray-400">{(office.workflow_steps || []).length} steps</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDelete} title="Delete office">
          <Trash2 className="w-3 h-3 text-red-500" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-gray-50 px-3 py-1.5 text-[10px]" role="note" aria-label="Office relationship and locality authority">
        <span className="font-medium text-gray-600">{authoritySummary.relationship}</span>
        <span className={authoritySummary.verified ? "font-semibold text-emerald-700" : "font-medium text-amber-800"}>
          {authoritySummary.authority}
        </span>
        {authoritySummary.roleLabels.length > 0 && (
          <span className="min-w-0 text-gray-600">Roles: {authoritySummary.roleLabels.join(", ")}</span>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="p-3 space-y-3">
          {/* Contact info */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-gray-500">Phone</Label>
              <Input value={office.contact_phone || ""} onChange={e => update({ contact_phone: e.target.value })} className="h-7 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] text-gray-500">Email</Label>
              <Input value={office.contact_email || ""} onChange={e => update({ contact_email: e.target.value })} className="h-7 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] text-gray-500">Website</Label>
              <Input value={office.contact_website || ""} onChange={e => update({ contact_website: e.target.value })} className="h-7 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] text-gray-500">Address</Label>
              <Input value={office.contact_address || ""} onChange={e => update({ contact_address: e.target.value })} className="h-7 text-xs" />
            </div>
            <div className="col-span-2">
              <Label className="text-[10px] text-gray-500">Notes</Label>
              <Input value={office.contact_notes || ""} onChange={e => update({ contact_notes: e.target.value })} className="h-7 text-xs" />
            </div>
          </div>

          <div className="border-t pt-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h5 className="text-xs font-semibold">Authority for this locality</h5>
                <p className="text-[10px] text-gray-500">Office type is descriptive only. Select roles only after staff confirms responsibility.</p>
              </div>
              {office.authority_verification_status === "staff_verified" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700"><ShieldCheck className="w-3 h-3" /> Staff verified</span>
              )}
            </div>
            {(office.authority_roles || []).some(role => !LOCALITY_AUTHORITY_ROLES.some(([value]) => value === role)) && (
              <div className="rounded border border-amber-200 bg-amber-50 p-2">
                <p className="text-[10px] font-medium text-amber-900">Legacy authority roles need review. They cannot be newly assigned; remove them before verifying.</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {[...new Set((office.authority_roles || []).filter(role => !LOCALITY_AUTHORITY_ROLES.some(([value]) => value === role)))].map(role => (
                    <Button key={role} type="button" variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => onChange(setLocalityOfficeAuthorityRole(office, role, false))}>Remove legacy role: {role}</Button>
                  ))}
                </div>
              </div>
            )}
            <LocalityOfficeReviewEvidence office={office} provenance={provenance} />
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {LOCALITY_AUTHORITY_ROLES.map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox checked={(office.authority_roles || []).includes(value)}
                    onCheckedChange={(checked) => onChange(setLocalityOfficeAuthorityRole(office, value, checked === true))} />
                  {label}
                </label>
              ))}
            </div>
            <div>
              <Label className="text-[10px] text-gray-500">Verification notes / source</Label>
              <Input value={office.authority_verification_notes || ""}
                onChange={e => update({ authority_verification_notes: e.target.value })}
                placeholder="Official page, ordinance, staff confirmation, or caveat..." className="h-7 text-xs" />
            </div>
            <div className="flex items-center gap-2">
              {office.authority_verification_status === "staff_verified" ? (
                <>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                    onClick={() => onChange(revokeLocalityOfficeAuthorityVerification(office))}>Revoke verification</Button>
                  <span className="text-[10px] text-gray-500">
                    {office.authority_verified_by || "CCS Staff"}{office.authority_verified_at ? ` · ${new Date(office.authority_verified_at).toLocaleDateString()}` : ""}
                  </span>
                </>
              ) : (
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                  disabled={!(office.authority_roles || []).length}
                  onClick={() => onChange(verifyLocalityOfficeAuthority(office, verificationActor))}>
                  <ShieldCheck className="w-3 h-3 mr-1" /> Mark authority verified
                </Button>
              )}
            </div>
          </div>

          {/* Workflow Steps */}
          <div className="border-t pt-2">
            <h5 className="text-xs font-semibold mb-2">Workflow Steps</h5>
            <div className="flex gap-2 mb-2">
              <Input
                value={newStepName}
                onChange={e => setNewStepName(e.target.value)}
                placeholder="Step name..."
                className="h-7 text-xs flex-1"
                onKeyDown={e => e.key === 'Enter' && addStep()}
              />
              <Select value={newStepType} onValueChange={setNewStepType}>
                <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="checkbox">☑ Checkbox</SelectItem>
                  <SelectItem value="submitted_date">📅 Submitted Date</SelectItem>
                  <SelectItem value="followup_date">🔔 Follow-up Date</SelectItem>
                  <SelectItem value="permit_received_date">✅ Permit Received</SelectItem>
                  <SelectItem value="text">📝 Text</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={addStep} size="sm" className="h-7"><Plus className="w-3 h-3" /></Button>
            </div>

            <DragDropContext onDragEnd={handleStepDragEnd}>
              <Droppable droppableId={`steps-${office.id}`}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                    {(office.workflow_steps || []).map((step, idx) => (
                      <Draggable key={step.id} draggableId={step.id} index={idx}>
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.draggableProps}
                            className="p-1.5 bg-gray-50 border rounded text-xs space-y-1.5">
                            <div className="flex items-center gap-2">
                              <div {...provided.dragHandleProps}><GripVertical className="w-3 h-3 text-gray-400 cursor-grab" /></div>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{stepTypeLabels[step.type] || step.type}</span>
                              <span className="flex-1 font-medium">{step.name}</span>
                              {step.type === 'followup_date' && (
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    value={step.followup_interval_days || 14}
                                    onChange={e => updateStepField(step.id, 'followup_interval_days', parseInt(e.target.value) || 14)}
                                    className="h-5 w-12 text-xs"
                                  />
                                  <span className="text-[9px] text-gray-500">days</span>
                                </div>
                              )}
                              <button type="button" onClick={() => removeStep(step.id)} className="p-0.5 hover:bg-red-50 rounded">
                                <Trash2 className="w-3 h-3 text-red-500" />
                              </button>
                            </div>

                            {/* Addons: visually tie extra controls to this step */}
                            <div className="flex flex-wrap items-center gap-2 pl-5">
                              <span className="text-[9px] text-gray-400 uppercase tracking-wide">Tie:</span>
                              {ADDON_DEFS.map(addon => {
                                const enabled = !!step[addon.key];
                                return (
                                  <label
                                    key={addon.key}
                                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${enabled ? addon.color : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                                  >
                                    <Checkbox
                                      checked={enabled}
                                      onCheckedChange={(v) => updateStepField(step.id, addon.key, !!v)}
                                      className="h-3 w-3"
                                    />
                                    <span className="text-[10px] font-medium">{addon.label}</span>
                                  </label>
                                );
                              })}
                              {step.has_followup && (
                                <div className="flex items-center gap-1 ml-1">
                                  <span className="text-[9px] text-gray-500">every</span>
                                  <Input
                                    type="number"
                                    value={step.followup_interval_days || 14}
                                    onChange={e => updateStepField(step.id, 'followup_interval_days', parseInt(e.target.value) || 14)}
                                    className="h-5 w-12 text-xs"
                                  />
                                  <span className="text-[9px] text-gray-500">days</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {(office.workflow_steps || []).length === 0 && (
                      <p className="text-[11px] text-gray-400 text-center py-2">No steps yet — add some above</p>
                    )}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        </div>
      )}
    </div>
  );
}