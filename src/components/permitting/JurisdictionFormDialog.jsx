import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
const DOC_TYPES = ["sign_ordinance","permit_application","zoning_code","fee_schedule","checklist","other"];

export default function JurisdictionFormDialog({ open, onClose, jurisdiction, onSave }) {
  const isEdit = !!jurisdiction?.id;
  const [form, setForm] = useState({
    name: "", state: "", type: "county",
    website_url: "", permitting_url: "",
    notes: "", documents: [],
    contact_info: { department: "", phone: "", email: "", address: "" },
    auto_refresh: true
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (jurisdiction) setForm({ ...form, ...jurisdiction });
    else setForm({ name: "", state: "", type: "county", website_url: "", permitting_url: "", notes: "", documents: [], contact_info: { department: "", phone: "", email: "", address: "" }, auto_refresh: true });
  }, [jurisdiction, open]);

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));
  const setContact = (field, val) => setForm(f => ({ ...f, contact_info: { ...(f.contact_info || {}), [field]: val } }));

  const addDocument = () => {
    setForm(f => ({
      ...f,
      documents: [...(f.documents || []), { id: Date.now().toString(), title: "", url: "", doc_type: "other", source: "manual" }]
    }));
  };

  const updateDoc = (id, field, val) => {
    setForm(f => ({ ...f, documents: f.documents.map(d => d.id === id ? { ...d, [field]: val } : d) }));
  };

  const removeDoc = (id) => {
    setForm(f => ({ ...f, documents: f.documents.filter(d => d.id !== id) }));
  };

  const aiGenerate = async () => {
    if (!form.name || !form.state) return;
    setAiLoading(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Research ${form.name} ${form.type}, ${form.state} sign permit requirements.
Find:
1. Official permitting/zoning department website URL
2. Sign ordinance or zoning code URL
3. Permit application form URL
4. Contact information for the permitting department
5. Key sign permit requirements (max size, height, fees, if permits required)
6. Any other relevant permitting document URLs

Return as JSON with this structure:
{
  "website_url": "...",
  "permitting_url": "...",
  "ai_summary": "2-3 sentence summary of sign permit requirements",
  "contact_info": { "department": "", "phone": "", "email": "", "address": "" },
  "permit_requirements": {
    "requires_permit": true/false,
    "max_sign_area_sqft": number or null,
    "max_height_ft": number or null,
    "setback_requirements": "...",
    "illumination_allowed": true/false/null,
    "electronic_signs_allowed": true/false/null,
    "fee_range": "...",
    "processing_time": "..."
  },
  "documents": [
    { "title": "...", "url": "...", "doc_type": "sign_ordinance|permit_application|zoning_code|fee_schedule|checklist|other" }
  ]
}`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            website_url: { type: "string" },
            permitting_url: { type: "string" },
            ai_summary: { type: "string" },
            contact_info: { type: "object" },
            permit_requirements: { type: "object" },
            documents: { type: "array", items: { type: "object" } }
          }
        }
      });

      const data = typeof result === 'string' ? JSON.parse(result) : result;
      const newDocs = (data.documents || []).map((d, i) => ({
        id: `ai_${Date.now()}_${i}`,
        title: d.title || "Untitled",
        url: d.url || "",
        doc_type: d.doc_type || "other",
        source: "ai_discovered",
        last_fetched: new Date().toISOString()
      }));

      setForm(f => ({
        ...f,
        website_url: data.website_url || f.website_url,
        permitting_url: data.permitting_url || f.permitting_url,
        ai_summary: data.ai_summary || f.ai_summary,
        contact_info: data.contact_info || f.contact_info,
        permit_requirements: data.permit_requirements || f.permit_requirements,
        documents: [...(f.documents || []).filter(d => d.source === 'manual'), ...newDocs],
        last_updated: new Date().toISOString()
      }));
    } catch (e) {
      console.error("AI generation error:", e);
    }
    setAiLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit: ${jurisdiction.name}` : "Add Jurisdiction"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Name *</label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Jefferson County" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">State *</label>
              <Select value={form.state} onValueChange={v => set("state", v)}>
                <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                <SelectContent>
                  {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Type</label>
              <Select value={form.type} onValueChange={v => set("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["county","city","township","municipality"].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* AI Generate Button */}
          <Button
            onClick={aiGenerate}
            disabled={aiLoading || !form.name || !form.state}
            className="w-full bg-purple-600 hover:bg-purple-700 gap-2"
          >
            {aiLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> AI Researching...</> : <><Wand2 className="w-4 h-4" /> AI Auto-Fill (Research & Discover Documents)</>}
          </Button>

          {/* URLs */}
          <div className="space-y-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Official Website</label>
              <Input value={form.website_url || ""} onChange={e => set("website_url", e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Permitting/Zoning Page</label>
              <Input value={form.permitting_url || ""} onChange={e => set("permitting_url", e.target.value)} placeholder="https://..." />
            </div>
          </div>

          {/* AI Summary */}
          {form.ai_summary && (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">AI Summary</label>
              <Textarea value={form.ai_summary || ""} onChange={e => set("ai_summary", e.target.value)} rows={3} className="text-sm" />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Manual Notes</label>
            <Textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Internal notes..." className="text-sm" />
          </div>

          {/* Contact Info */}
          <div>
            <label className="text-xs font-semibold text-gray-700 mb-2 block">Contact Information</label>
            <div className="grid grid-cols-2 gap-2">
              <Input value={form.contact_info?.department || ""} onChange={e => setContact("department", e.target.value)} placeholder="Department name" className="text-sm" />
              <Input value={form.contact_info?.phone || ""} onChange={e => setContact("phone", e.target.value)} placeholder="Phone" className="text-sm" />
              <Input value={form.contact_info?.email || ""} onChange={e => setContact("email", e.target.value)} placeholder="Email" className="text-sm" />
              <Input value={form.contact_info?.address || ""} onChange={e => setContact("address", e.target.value)} placeholder="Address" className="text-sm" />
            </div>
          </div>

          {/* Documents */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-700">Documents ({form.documents?.length || 0})</label>
              <Button size="sm" variant="outline" onClick={addDocument} className="h-7 text-xs gap-1">
                <Plus className="w-3 h-3" /> Add Manually
              </Button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {(form.documents || []).map(doc => (
                <div key={doc.id} className="flex items-center gap-2 p-2 border rounded-lg bg-gray-50">
                  <div className="flex-1 space-y-1">
                    <Input value={doc.title} onChange={e => updateDoc(doc.id, "title", e.target.value)} placeholder="Document title" className="h-7 text-xs" />
                    <Input value={doc.url} onChange={e => updateDoc(doc.id, "url", e.target.value)} placeholder="URL" className="h-7 text-xs" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Select value={doc.doc_type} onValueChange={v => updateDoc(doc.id, "doc_type", v)}>
                      <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DOC_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs capitalize">{t.replace("_", " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <span className={`text-[10px] text-center px-1 rounded ${doc.source === 'ai_discovered' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                      {doc.source === 'ai_discovered' ? 'AI' : 'Manual'}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeDoc(doc.id)} className="h-7 w-7 flex-shrink-0">
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name || !form.state} className="flex-1 bg-purple-600 hover:bg-purple-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : isEdit ? "Save Changes" : "Create Profile"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}