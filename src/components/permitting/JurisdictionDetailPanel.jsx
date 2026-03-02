import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, ExternalLink, FileText, MessageSquare, Loader2, Download, RefreshCw, ChevronDown, ChevronUp, CheckCircle, XCircle, Search, MapPin, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { downloadPermitPDF } from "@/functions/downloadPermitPDF";
import PDFViewer from "./PDFViewer";
import CAGISSearchBar from "./CAGISSearchBar";

const DOC_TYPE_LABELS = {
  sign_ordinance: "Sign Ordinance",
  permit_application: "Permit Application",
  zoning_code: "Zoning Code",
  fee_schedule: "Fee Schedule",
  checklist: "Checklist",
  other: "Other"
};

export default function JurisdictionDetailPanel({ jurisdiction, onClose, onUpdate }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [downloadingDocId, setDownloadingDocId] = useState(null);
  const [viewingPDF, setViewingPDF] = useState(null);
  const [docSearchTerm, setDocSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  // Auto-download all PDFs on load
  useEffect(() => {
    const autoDownloadPDFs = async () => {
      const docsToDownload = (jurisdiction.documents || []).filter(doc => doc.url && !doc.file_url);
      for (const doc of docsToDownload) {
        try {
          const res = await downloadPermitPDF({
            jurisdiction_id: jurisdiction.id,
            document_url: doc.url,
            document_title: doc.title
          });
          if (res.data?.file_url) {
            onUpdate({
              ...jurisdiction,
              documents: (jurisdiction.documents || []).map(d => 
                d.id === doc.id ? { ...d, file_url: res.data.file_url, downloaded_at: new Date().toISOString() } : d
              )
            });
          }
        } catch (e) {
          console.error(`Failed to auto-download ${doc.title}:`, e);
        }
      }
    };
    autoDownloadPDFs();
  }, [jurisdiction.id]);

  const searchDocuments = (term) => {
    setDocSearchTerm(term);
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }
    
    const lowerTerm = term.toLowerCase();
    const results = [];
    
    (jurisdiction.documents || []).forEach(doc => {
      const titleMatch = doc.title?.toLowerCase().includes(lowerTerm);
      const summaryMatch = doc.ai_summary?.toLowerCase().includes(lowerTerm);
      const contentMatch = doc.extracted_text?.toLowerCase().includes(lowerTerm);
      const requirementsMatch = JSON.stringify(jurisdiction.permit_requirements || {}).toLowerCase().includes(lowerTerm);
      
      if (titleMatch || summaryMatch || contentMatch || requirementsMatch) {
        results.push({
          type: 'document',
          id: doc.id,
          title: doc.title,
          snippet: (doc.ai_summary || doc.extracted_text || "").substring(0, 150) + "..."
        });
      }
    });
    
    setSearchResults(results);
  };

  const askQuestion = async () => {
    if (!question.trim() || asking) return;
    const q = question.trim();
    setQuestion("");
    setAsking(true);
    const newHistory = [...chatHistory, { role: "user", content: q }];
    setChatHistory(newHistory);

    try {
      const docContext = (jurisdiction.documents || [])
        .map(d => `[${d.title}]: ${d.extracted_text || d.ai_summary || "No content extracted"}`)
        .join("\n\n");

      const prompt = `You are a permitting expert assistant for sign companies. 
      
Jurisdiction: ${jurisdiction.name}, ${jurisdiction.state} (${jurisdiction.type})
${jurisdiction.ai_summary ? `Summary: ${jurisdiction.ai_summary}` : ""}

Available documents and their content:
${docContext || "No documents loaded yet."}

${jurisdiction.permit_requirements ? `Known requirements: ${JSON.stringify(jurisdiction.permit_requirements, null, 2)}` : ""}

Chat history:
${newHistory.slice(-4).map(m => `${m.role === 'user' ? 'Question' : 'Answer'}: ${m.content}`).join("\n")}

Current question: ${q}

Answer the question based on the documents and information available. Be specific and cite which document you're referencing. If the information isn't available in the documents, say so clearly.`;

      const res = await base44.integrations.Core.InvokeLLM({ prompt, add_context_from_internet: false });
      const aiAnswer = typeof res === 'string' ? res : res?.response || "Unable to get answer.";
      setChatHistory([...newHistory, { role: "assistant", content: aiAnswer }]);
    } catch (e) {
      setChatHistory([...newHistory, { role: "assistant", content: "Error getting answer. Please try again." }]);
    }
    setAsking(false);
  };

  const req = jurisdiction.permit_requirements || {};

  const handleDownloadPDF = async (doc) => {
    if (!doc.url || doc.file_url) return; // Already downloaded or no URL
    setDownloadingDocId(doc.id);
    try {
      const res = await downloadPermitPDF({
        jurisdiction_id: jurisdiction.id,
        document_url: doc.url,
        document_title: doc.title
      });
      if (res.data?.file_url) {
        onUpdate({
          ...jurisdiction,
          documents: (jurisdiction.documents || []).map(d => 
            d.id === doc.id ? { ...d, file_url: res.data.file_url, downloaded_at: new Date().toISOString() } : d
          )
        });
      }
    } catch (e) {
      console.error("Download error:", e);
    }
    setDownloadingDocId(null);
  };

  if (viewingPDF) {
    return (
      <div className="flex flex-col h-full">
        <PDFViewer fileUrl={viewingPDF.file_url} fileName={viewingPDF.title} onBack={() => setViewingPDF(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-lg text-gray-900">{jurisdiction.name}</h2>
            <Badge variant="outline">{jurisdiction.state}</Badge>
            <Badge className="bg-gray-100 text-gray-600 capitalize text-xs">{jurisdiction.type}</Badge>
          </div>
          {jurisdiction.permitting_url && (
            <a href={jurisdiction.permitting_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1">
              <ExternalLink className="w-3 h-3" /> Official Permitting Page
            </a>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* CAGIS Location Search */}
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
          <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
            <MapPin className="w-3 h-3" /> Location Lookup
          </p>
          <CAGISSearchBar onLocationSelect={(loc) => {}} />
        </div>

        {/* AI Summary */}
        {jurisdiction.ai_summary && (
          <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
            <p className="text-xs font-semibold text-purple-700 mb-1">AI Summary</p>
            <p className="text-sm text-gray-700">{jurisdiction.ai_summary}</p>
          </div>
        )}

        {/* Key Requirements */}
        {Object.keys(req).some(k => req[k] !== undefined && req[k] !== null && req[k] !== "") && (
          <div className="bg-gray-50 rounded-lg p-3 border">
            <p className="text-xs font-semibold text-gray-700 mb-2">Key Requirements</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {req.requires_permit !== undefined && (
                <div className="flex items-center gap-1">
                  {req.requires_permit ? <CheckCircle className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-500" />}
                  <span>Permit Required</span>
                </div>
              )}
              {req.max_sign_area_sqft && <div><span className="text-gray-500">Max Area:</span> {req.max_sign_area_sqft} sq ft</div>}
              {req.max_height_ft && <div><span className="text-gray-500">Max Height:</span> {req.max_height_ft} ft</div>}
              {req.fee_range && <div><span className="text-gray-500">Fees:</span> {req.fee_range}</div>}
              {req.processing_time && <div><span className="text-gray-500">Processing:</span> {req.processing_time}</div>}
              {req.illumination_allowed !== undefined && (
                <div className="flex items-center gap-1">
                  {req.illumination_allowed ? <CheckCircle className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-500" />}
                  <span>Illumination Allowed</span>
                </div>
              )}
              {req.electronic_signs_allowed !== undefined && (
                <div className="flex items-center gap-1">
                  {req.electronic_signs_allowed ? <CheckCircle className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-500" />}
                  <span>Electronic Signs</span>
                </div>
              )}
              {req.setback_requirements && <div className="col-span-2"><span className="text-gray-500">Setbacks:</span> {req.setback_requirements}</div>}
            </div>
          </div>
        )}

        {/* Documents */}
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2">
            Documents ({jurisdiction.documents?.length || 0})
          </p>
          <div className="mb-3">
            <div className="relative">
              <Search className="absolute left-2 top-2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search documents..."
                value={docSearchTerm}
                onChange={(e) => searchDocuments(e.target.value)}
                className="text-xs pl-8 h-7"
              />
            </div>
            {searchResults.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1 bg-blue-50 p-2 rounded border border-blue-100">
                {searchResults.map(result => (
                  <div 
                    key={result.id}
                    onClick={() => {
                      setExpandedDoc(result.id);
                      setDocSearchTerm("");
                      setSearchResults([]);
                    }}
                    className="text-xs p-2 bg-white rounded cursor-pointer hover:bg-blue-100 border border-blue-200"
                  >
                    <p className="font-medium text-gray-800">{result.title}</p>
                    <p className="text-gray-600 text-[11px] mt-0.5">{result.snippet}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            {(jurisdiction.documents || []).map(doc => (
              <div key={doc.id} className="border rounded-lg overflow-hidden">
                <div
                  className="flex items-center gap-2 p-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                >
                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{doc.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-gray-400 capitalize">{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}</span>
                      {doc.last_fetched && <span className="text-[10px] text-gray-400">{format(new Date(doc.last_fetched), "MM/dd/yy")}</span>}
                      <span className="text-[10px] bg-blue-50 text-blue-600 px-1 rounded">{doc.source === 'ai_discovered' ? 'AI' : 'Manual'}</span>
                    </div>
                  </div>
                  {expandedDoc === doc.id ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                </div>
                {expandedDoc === doc.id && (
                  <div className="px-3 pb-3 border-t bg-gray-50 space-y-3">
                    {doc.file_url ? (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingPDF(doc);
                        }}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-6 mt-3"
                      >
                        <FileText className="w-5 h-5 mr-2" />
                        Open {doc.title} PDF
                      </Button>
                    ) : (
                      <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                        <p className="font-medium">No file available</p>
                        <p className="text-xs mt-1">This document could not be downloaded. Check the source link below.</p>
                      </div>
                    )}
                    
                    {doc.url && (
                      <div className="mt-2">
                        <p className="text-[10px] font-semibold text-gray-500 mb-1">Original Source</p>
                        <a 
                          href={doc.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline break-all block p-2 bg-white rounded border border-gray-200 hover:bg-blue-50"
                        >
                          {doc.url}
                        </a>
                      </div>
                    )}
                    
                    {doc.ai_summary && (
                      <div>
                        <p className="text-[10px] font-semibold text-purple-600 mb-1">AI Summary</p>
                        <p className="text-xs text-gray-700">{doc.ai_summary}</p>
                      </div>
                    )}
                    {doc.extracted_text && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 mb-1">Extracted Content (preview)</p>
                        <p className="text-xs text-gray-600 line-clamp-4 font-mono bg-white p-2 rounded border">{doc.extracted_text.substring(0, 500)}...</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {(!jurisdiction.documents || jurisdiction.documents.length === 0) && (
              <p className="text-xs text-gray-400 italic">No documents yet. Use the AI refresh to discover documents.</p>
            )}
          </div>
        </div>

        {/* Contact Info */}
        {jurisdiction.contact_info?.department && (
          <div className="border rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-700 mb-2">Contact Information</p>
            <div className="space-y-1 text-xs text-gray-600">
              {jurisdiction.contact_info.department && <div><span className="font-medium">Dept:</span> {jurisdiction.contact_info.department}</div>}
              {jurisdiction.contact_info.phone && <div><span className="font-medium">Phone:</span> {jurisdiction.contact_info.phone}</div>}
              {jurisdiction.contact_info.email && <div><span className="font-medium">Email:</span> {jurisdiction.contact_info.email}</div>}
              {jurisdiction.contact_info.address && <div><span className="font-medium">Address:</span> {jurisdiction.contact_info.address}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Chat Interface */}
      <div className="border-t p-3 bg-gray-50">
        <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
          <MessageSquare className="w-3 h-3" /> Ask about this jurisdiction
        </p>
        {chatHistory.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-2 mb-2 bg-white rounded-lg p-2 border">
            {chatHistory.map((msg, i) => (
              <div key={i} className={`text-xs p-2 rounded ${msg.role === 'user' ? 'bg-blue-50 text-blue-800 ml-4' : 'bg-purple-50 text-gray-800 mr-4'}`}>
                <span className="font-semibold">{msg.role === 'user' ? 'You: ' : 'AI: '}</span>
                {msg.content}
              </div>
            ))}
            {asking && <div className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Thinking...</div>}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && askQuestion()}
            placeholder="e.g. What is the max sign height? Are permits required?"
            className="text-xs h-8 flex-1"
          />
          <Button size="sm" onClick={askQuestion} disabled={asking || !question.trim()} className="h-8 bg-purple-600 hover:bg-purple-700">
            {asking ? <Loader2 className="w-3 h-3 animate-spin" /> : "Ask"}
          </Button>
        </div>
      </div>
    </div>
  );
}