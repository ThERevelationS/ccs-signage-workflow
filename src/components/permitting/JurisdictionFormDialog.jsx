import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, Wand2, Upload, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

const US_STATES = ["OH","KY","IN"]; // Restricted to Ohio, Kentucky, Indiana
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
  const [uploadingPDF, setUploadingPDF] = useState(false);
  const [analyzingPDF, setAnalyzingPDF] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

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

  const handlePDFUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.includes('pdf')) return;
    
    setUploadingPDF(true);
    try {
      // Upload PDF
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const fileUrl = uploadRes.url;

      // Extract text from PDF
      setAnalyzingPDF(true);
      const analysisRes = await base44.integrations.Core.InvokeLLM({
        prompt: `This is a permit-related PDF document. Extract the key information:\n1. Document title/type\n2. Jurisdiction name (if mentioned)\n3. Key permit requirements\n4. Fees\n5. Processing time\n\nProvide a structured summary.`,
        file_urls: [fileUrl],
        add_context_from_internet: false,
        response_json_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            jurisdiction: { type: "string" }
          }
        }
      });

      const analysis = typeof analysisRes === 'string' ? JSON.parse(analysisRes) : analysisRes;
      
      // Add document to form
      setForm(f => ({
        ...f,
        documents: [...(f.documents || []), {
          id: Date.now().toString(),
          title: analysis.title || file.name.replace('.pdf', ''),
          url: fileUrl,
          file_url: fileUrl,
          doc_type: "other",
          source: "manual",
          extracted_text: analysis.summary,
          ai_summary: analysis.summary,
          last_fetched: new Date().toISOString()
        }]
      }));
    } catch (err) {
      console.error("PDF upload/analysis error:", err);
    } finally {
      setUploadingPDF(false);
      setAnalyzingPDF(false);
      e.target.value = '';
    }
  };

  const aiGenerate = async () => {
    if (!form.name || !form.state) return;
    setAiLoading(true);
    try {
      const isNonCounty = form.type !== 'county';
      const prompt = `Research ${form.name} ${form.type}, ${form.state} sign permit requirements. IMPORTANT: Only research ${form.state}. Do not provide information from other states.

Find:
1. Official permitting/zoning department website URL
2. Sign ordinance or zoning code URL
3. Permit application forms (signage/construction permit, electrical IBI application, zoning forms, building forms, NIC forms, NKYEI forms, locality-specific forms)
4. Contact information for the permitting department
5. Specific sign permit rules:
   - SQFT/Width/Height allowance rules
   - Height allowances and rules
   - Setback requirements and rules
   - Lighting allowances and restrictions
6. Any other relevant permitting document URLs

${isNonCounty ? `IMPORTANT: Since this is a ${form.type}, also research and include:
   - The parent county name and contact information
   - Parent county's official website and permitting URLs
   - Parent county's relevant permit forms and documents
   - Note which documents are from the county vs. local jurisdiction` : ''}

Return as JSON with this structure (add parent_county fields if applicable):
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
    { "title": "...", "url": "...", "doc_type": "sign_ordinance|permit_application|zoning_code|fee_schedule|checklist|other", "source_type": "local|county" }
  ],
  "parent_county": {
    "name": "...",
    "website_url": "...",
    "permitting_url": "...",
    "contact_info": { "department": "", "phone": "", "email": "", "address": "" },
    "documents": []
  },
  "sqft_width_height_rules": "...",
  "height_allowances": "...",
  "setback_rules": "...",
  "lighting_allowances": "..."
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
            documents: { type: "array", items: { type: "object" } },
            parent_county: { type: "object" },
            sqft_width_height_rules: { type: "string" },
            height_allowances: { type: "string" },
            setback_rules: { type: "string" },
            lighting_allowances: { type: "string" }
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

      // Add parent county documents if applicable
      const countyDocs = (data.parent_county?.documents || []).map((d, i) => ({
        id: `ai_county_${Date.now()}_${i}`,
        title: `[${data.parent_county.name}] ${d.title || "Untitled"}`,
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
        parent_county: data.parent_county || f.parent_county,
        sqft_width_height_rules: data.sqft_width_height_rules || f.sqft_width_height_rules,
        height_allowances: data.height_allowances || f.height_allowances,
        setback_rules: data.setback_rules || f.setback_rules,
        lighting_allowances: data.lighting_allowances || f.lighting_allowances,
        documents: [...(f.documents || []).filter(d => d.source === 'manual'), ...newDocs, ...countyDocs],
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
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-gray-800">Documents ({form.documents?.length || 0})</label>
              <div className="flex gap-1">
                <label className="cursor-pointer">
                  <input type="file" accept=".pdf" onChange={handlePDFUpload} disabled={uploadingPDF || analyzingPDF} className="hidden" />
                  <Button size="sm" variant="outline" asChild className="h-7 text-xs gap-1 cursor-pointer">
                    <span>{uploadingPDF || analyzingPDF ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Upload PDF</span>
                  </Button>
                </label>
                <Button size="sm" variant="outline" onClick={addDocument} className="h-7 text-xs gap-1">
                  <Plus className="w-3 h-3" /> Add Manually
                </Button>
              </div>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto bg-white rounded-lg">
              {(form.documents || []).map(doc => (
                <div key={doc.id} className={`flex items-center gap-2 p-3 border-l-4 rounded-lg ${doc.source === 'ai_discovered' ? 'bg-purple-50 border-l-purple-400' : 'bg-amber-50 border-l-amber-400'}`}>
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
                    <span className={`text-[10px] text-center px-1 rounded font-medium ${doc.source === 'ai_discovered' ? 'bg-purple-200 text-purple-700' : 'bg-amber-200 text-amber-700'}`}>
                      {doc.source === 'ai_discovered' ? 'AI' : 'Manual'}
                    </span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setDeletingId(deletingId === doc.id ? null : doc.id)} 
                    className="h-7 w-7 flex-shrink-0"
                  >
                    {deletingId === doc.id ? <X className="w-3 h-3 text-gray-500" /> : <Trash2 className="w-3 h-3 text-red-400" />}
                  </Button>
                  {deletingId === doc.id && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => { removeDoc(doc.id); setDeletingId(null); }} 
                      className="h-6 text-xs bg-red-100 hover:bg-red-200 text-red-700 flex-shrink-0"
                    >
                      Confirm
                    </Button>
                  )}
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