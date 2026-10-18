import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OfficeRoleOverview from "./OfficeRoleOverview";
import ElectricalResearchTasks from "./ElectricalResearchTasks";
import OfficeResearchIdentityComparison from "./OfficeResearchIdentityComparison";
import { officeResearchChecklist, officeResearchFieldLabels } from "../../../base44/shared/permittingOfficeResearch.mjs";
import { safeGovernmentOfficeSourceUrl } from "./governmentOfficeCatalog";
import { updateOfficeResearchDraft } from "./officeResearchDraftEditing.mjs";

export default function OfficeResearchFindings({
  research, onNavigate, onPreviewWorkflow, canEdit = false, actor = "CCS Staff", onSave,
}) {
  const nodes = useRef(new Map());
  const [editingIndex, setEditingIndex] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const rows = research?.method === "office-research-requirements-v1" && Array.isArray(research.roles)
    ? research.roles.filter(row => row && typeof row === "object")
    : [];
  const date = new Date(research?.researched_at);

  const inspect = index => {
    const node = nodes.current.get(index);
    if (node) {
      node.open = true;
      node.querySelector("summary")?.focus({ preventScroll: true });
      node.scrollIntoView({ block: "start", behavior: "auto" });
    }
  };
  const startEdit = (index, row) => {
    setEditingIndex(index);
    setDraft(JSON.parse(JSON.stringify(row)));
    setError("");
    setSavedMessage("");
  };
  const change = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const changeNested = (group, key, value) => setDraft(previous => ({
    ...previous,
    [group]: { ...(previous?.[group] || {}), [key]: value },
  }));
  const cancelEdit = () => {
    setEditingIndex(null);
    setDraft(null);
    setError("");
  };
  const saveEdit = async index => {
    if (saving || editingIndex !== index || !draft || typeof onSave !== "function") return;
    setSaving(true);
    setError("");
    setSavedMessage("");
    try {
      const updated = updateOfficeResearchDraft(research, index, draft, {
        actor,
        now: () => new Date().toISOString(),
      });
      await onSave(updated);
      setEditingIndex(null);
      setDraft(null);
      setSavedMessage("Research draft saved. It remains unverified and must be checked against current official evidence.");
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "The research draft could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return <section aria-label="Collected office research" className="rounded border bg-blue-50 p-3 space-y-2">
    <h4 className="font-semibold text-sm">Offices and electrical work</h4>
    <p className="text-xs">Research draft · {research?.researched_at && Number.isFinite(date.getTime()) ? date.toLocaleDateString() : "Date unavailable"}. Review findings before relying on requirements or office roles.</p>
    {!rows.length && <p className="text-sm">Office research has not been collected yet.</p>}
    {savedMessage && <p role="status" className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-900">{savedMessage}</p>}
    <OfficeRoleOverview rows={rows} onInspect={inspect} onNavigate={onNavigate} />
    <ElectricalResearchTasks rows={rows} onInspect={inspect} onPreviewWorkflow={onPreviewWorkflow} />
    <OfficeResearchIdentityComparison research={research} onInspect={inspect} />
    {rows.map((row, index) => {
      const source = safeGovernmentOfficeSourceUrl(row.official_source_url);
      const definition = officeResearchChecklist.roles.find(role => role.key === row.role);
      const researchFieldKeys = definition ? [...new Set([
        ...officeResearchChecklist.common_research_fields,
        ...(definition.research_fields || []),
      ])] : [];
      const isEditing = editingIndex === index && draft;
      return <details key={index} ref={node => {
        if (node) nodes.current.set(index, node);
        else nodes.current.delete(index);
      }} className="min-w-0 scroll-mt-3 rounded border bg-white p-2 text-xs [overflow-wrap:anywhere]">
        <summary tabIndex={0} className="cursor-pointer min-h-11 flex items-center font-medium">
          {row.label}: {row.office_name || "Not found yet"}
        </summary>
        <div className="mt-2 space-y-2">
          <p>Applicability: {row.applicability === "potentially_applicable" ? "May apply — check the proposed work" : row.applicability === "not_applicable_candidate" ? "Research suggests it may not apply — confirm before skipping" : "Not established yet"}</p>
          {row.service_area && <p><strong>Service area:</strong> {row.service_area}</p>}
          {source && <a href={source} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">Open research source</a>}
          {row.responsibility_quote && <blockquote className="whitespace-pre-wrap">{row.responsibility_quote}</blockquote>}
          {row.delegation_quote && <p><strong>Provider responsibility:</strong> {row.delegation_quote}</p>}
          {Object.values(row.contact_info || {}).some(Boolean) && <p className="break-words"><strong>Contact:</strong> {Object.values(row.contact_info).filter(Boolean).join(" · ")}</p>}
          <dl className="space-y-1">{Object.entries(row.research_fields || {}).map(([key, value]) => <div key={key}>
            <dt className="font-medium">{officeResearchFieldLabels[key] || key}</dt>
            <dd className="whitespace-pre-wrap break-words">{value || "Not found yet"}</dd>
          </div>)}</dl>
          {row.notes && <p>{row.notes}</p>}

          {canEdit && onSave && !isEditing && <Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal"
            onClick={() => startEdit(index, row)}>Edit {row.label} research draft</Button>}

          {isEditing && <section aria-label={"Edit " + row.label + " research draft"} className="space-y-3 rounded border border-blue-200 bg-blue-50 p-3">
            <p className="font-medium">Edit saved research draft</p>
            <p className="text-gray-700">These are planning notes. Saving does not verify the office, authority, current source, covered area, or project applicability.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor={"research-office-" + index}>Office name</Label>
                <Input id={"research-office-" + index} maxLength={200} value={draft.office_name || ""} onChange={event => change("office_name", event.target.value)} /></div>
              <div><Label htmlFor={"research-source-" + index}>Official source URL (HTTPS)</Label>
                <Input id={"research-source-" + index} type="url" maxLength={1000} value={draft.official_source_url || ""} onChange={event => change("official_source_url", event.target.value)} /></div>
              <div><Label htmlFor={"research-area-" + index}>Service area</Label>
                <Input id={"research-area-" + index} maxLength={1000} value={draft.service_area || ""} onChange={event => change("service_area", event.target.value)} /></div>
              <div><Label htmlFor={"research-applicability-" + index}>Applicability research</Label>
                <select id={"research-applicability-" + index} value={draft.applicability || "unknown"} onChange={event => change("applicability", event.target.value)} className="min-h-10 w-full rounded border bg-white px-2">
                  <option value="unknown">Not established</option>
                  <option value="potentially_applicable">May apply — confirm the work</option>
                  <option value="not_applicable_candidate">May not apply — confirm before skipping</option>
                </select></div>
              <div className="sm:col-span-2"><Label htmlFor={"research-responsibility-" + index}>Official responsibility quote</Label>
                <Textarea id={"research-responsibility-" + index} rows={3} maxLength={1000} value={draft.responsibility_quote || ""} onChange={event => change("responsibility_quote", event.target.value)} /></div>
              <div className="sm:col-span-2"><Label htmlFor={"research-delegation-" + index}>Delegation or provider quote</Label>
                <Textarea id={"research-delegation-" + index} rows={2} maxLength={1000} value={draft.delegation_quote || ""} onChange={event => change("delegation_quote", event.target.value)} /></div>
            </div>
            <fieldset className="space-y-2">
              <legend className="font-medium">Contact information</legend>
              {[
                ["phone", "Phone"],
                ["email", "Email"],
                ["address", "Address"],
              ].map(([key, label]) => <div key={key}>
                <Label htmlFor={"research-contact-" + key + "-" + index}>{label}</Label>
                <Input id={"research-contact-" + key + "-" + index} maxLength={300} value={draft.contact_info?.[key] || ""} onChange={event => changeNested("contact_info", key, event.target.value)} />
              </div>)}
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="font-medium">Checklist fields for {row.label}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {researchFieldKeys.map(key => <div key={key}>
                  <Label htmlFor={"research-field-" + key + "-" + index}>{officeResearchFieldLabels[key] || key}</Label>
                  <Textarea id={"research-field-" + key + "-" + index} rows={2} maxLength={1000}
                    value={draft.research_fields?.[key] || ""} onChange={event => changeNested("research_fields", key, event.target.value)} />
                </div>)}
              </div>
            </fieldset>
            <div><Label htmlFor={"research-notes-" + index}>Research notes and caveats</Label>
              <Textarea id={"research-notes-" + index} rows={3} maxLength={1000} value={draft.notes || ""} onChange={event => change("notes", event.target.value)} /></div>
            {error && <p role="alert" className="text-red-700">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="min-h-11" disabled={saving} onClick={() => saveEdit(index)}>{saving ? "Saving draft…" : "Save research draft"}</Button>
              <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={cancelEdit}>Cancel</Button>
            </div>
          </section>}
        </div>
      </details>;
    })}
  </section>;
}

