import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, ExternalLink, FileText, MessageSquare, Loader2, Download, RefreshCw, ChevronDown, ChevronUp, CheckCircle, XCircle, Search, MapPin, AlertCircle, DownloadCloud } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useResearchProgress } from "./ResearchProgressContext";
import { format } from "date-fns";
import { downloadPermitPDF } from "@/functions/downloadPermitPDF";
import PDFViewer from "./PDFViewer";
import CAGISSearchBar from "./CAGISSearchBar";
import DocumentAnalysisPanel from "./DocumentAnalysisPanel";
import ExtractedContentDisplay from "./ExtractedContentDisplay";

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
  const [docSearching, setDocSearching] = useState(false);
  const [expandedDocSearch, setExpandedDocSearch] = useState({});
  const [analyzingDocId, setAnalyzingDocId] = useState(null);
  const [docAnalysis, setDocAnalysis] = useState({});
  const [searchingDocId, setSearchingDocId] = useState(null);
  const [docSearchResults, setDocSearchResults] = useState({});
  const [isResearching, setIsResearching] = useState(false);
  const { startResearch, updateProgress, completeResearch } = useResearchProgress();

  // Close PDF viewer when jurisdiction changes
  useEffect(() => {
    setViewingPDF(null);
  }, [jurisdiction.id]);

  const isPDF = (doc) => {
    const url = doc.file_url || doc.url || "";
    const title = doc.title || "";
    return url.toLowerCase().includes('.pdf') || title.toLowerCase().includes('.pdf');
  };

  // Auto-download all docs on load — attempt every doc with a URL
  useEffect(() => {
    const autoDownloadDocs = async () => {
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
          console.error(`Failed to download ${doc.title}:`, e);
        }
      }
    };
    autoDownloadDocs();
  }, [jurisdiction.id]);

  const searchDocuments = (term) => {
    setDocSearchTerm(term);
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }

    const lowerTerm = term.toLowerCase();
    const results = [];

    // Search jurisdiction name/location info
    if (jurisdiction.name?.toLowerCase().includes(lowerTerm) || jurisdiction.type?.toLowerCase().includes(lowerTerm) || jurisdiction.state?.toLowerCase().includes(lowerTerm)) {
      results.push({
        type: 'jurisdiction',
        id: jurisdiction.id,
        title: `${jurisdiction.name}, ${jurisdiction.state}`,
        snippet: `${jurisdiction.type.charAt(0).toUpperCase() + jurisdiction.type.slice(1)} in ${jurisdiction.state}`
      });
    }

    // Search documents
    (jurisdiction.documents || []).forEach(doc => {
      const titleMatch = doc.title?.toLowerCase().includes(lowerTerm);
      const summaryMatch = doc.ai_summary?.toLowerCase().includes(lowerTerm);
      const contentMatch = doc.extracted_text?.toLowerCase().includes(lowerTerm);

      if (titleMatch || summaryMatch || contentMatch) {
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

  const searchWithinDocument = async (docId, searchText) => {
    setExpandedDocSearch(prev => ({
      ...prev,
      [docId]: searchText
    }));
    
    if (!searchText.trim()) {
      setDocSearchResults(prev => {
        const newResults = { ...prev };
        delete newResults[docId];
        return newResults;
      });
      return;
    }

    setSearchingDocId(docId);
    try {
      const doc = jurisdiction.documents.find(d => d.id === docId);
      const searchContent = doc.extracted_text || doc.ai_summary || "";
      const searchTerm = searchText.toLowerCase();
      
      if (!searchContent) {
        setDocSearchResults(prev => ({
          ...prev,
          [docId]: { matches: 0, snippets: [] }
        }));
      } else {
        // Search for the term in the content
        const contentLower = searchContent.toLowerCase();
        const allMatches = [];
        let index = 0;
        
        while ((index = contentLower.indexOf(searchTerm, index)) !== -1) {
          const start = Math.max(0, index - 100);
          const end = Math.min(searchContent.length, index + searchTerm.length + 100);
          const snippet = searchContent.substring(start, end);
          
          allMatches.push({
            position: index,
            snippet: (start > 0 ? '...' : '') + snippet.trim() + (end < searchContent.length ? '...' : '')
          });
          
          index += 1;
        }
        
        setDocSearchResults(prev => ({
          ...prev,
          [docId]: { 
            matches: allMatches.length, 
            snippets: allMatches.slice(0, 3).map(m => m.snippet)
          }
        }));
      }
    } catch (e) {
      console.error("Search error:", e);
    }
    setSearchingDocId(null);
  };

  const analyzeDocument = async (doc) => {
    if (docAnalysis[doc.id]) return; // Already analyzed
    if (!doc.file_url && !doc.url) {
      console.warn("No file URL available");
      return;
    }

    setAnalyzingDocId(doc.id);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Extract structured permit information from this document:\n\nTitle: ${doc.title}`,
        file_urls: [doc.file_url || doc.url],
        add_context_from_internet: false,
        response_json_schema: {
          type: "object",
          properties: {
            permits_required: { type: ["boolean", "null"] },
            permit_types: { type: ["array", "null"], items: { type: "string" } },
            fees: { type: "object" },
            deadlines: { type: "object" },
            requirements: { type: ["array", "null"] },
            contact_info: { type: "object" },
            max_sign_height: { type: ["string", "null"] },
            max_sign_area: { type: ["string", "null"] },
            setback_requirements: { type: ["string", "null"] },
            illumination_allowed: { type: ["boolean", "null"] },
            electronic_signs_allowed: { type: ["boolean", "null"] },
            key_restrictions: { type: ["array", "null"] }
          }
        }
      });

      setDocAnalysis(prev => ({
        ...prev,
        [doc.id]: res
      }));
    } catch (e) {
      console.error("Analysis error:", e);
    }
    setAnalyzingDocId(null);
  };

  const downloadDocument = async (doc) => {
    if (!doc.file_url && !doc.url) return;
    setDownloadingDocId(doc.id);
    try {
      const url = doc.file_url || doc.url;
      const response = await fetch(url);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = doc.title || 'document.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (e) {
      console.error("Download error:", e);
    }
    setDownloadingDocId(null);
  };

  const handleResearch = async () => {
    setIsResearching(true);
    startResearch(1);
    
    try {
      updateProgress({ processed: 0, currentJurisdiction: `${jurisdiction.name}, ${jurisdiction.state}` });
      
      const res = await base44.functions.invoke('refreshJurisdiction', {
        jurisdictionId: jurisdiction.id,
        settings: {
          updateWebsites: !jurisdiction._manual_website_url,
          updatePermittingUrls: !jurisdiction._manual_permitting_url,
          updateRequirements: !jurisdiction._manual_requirements,
          updateDocuments: !jurisdiction._manual_documents,
          skipManualData: true
        }
      });
      
      if (res.data?.jurisdiction) {
        onUpdate(res.data.jurisdiction);
        completeResearch(1, 0);
      } else {
        completeResearch(0, 1, "Research completed but no updates");
      }
    } catch (e) {
      console.error("Research error:", e);
      completeResearch(0, 1, e.message);
    }
    
    setIsResearching(false);
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
      <div className="p-4 border-b space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h2 className="font-bold text-lg text-gray-900">{jurisdiction.name}</h2>
              <Badge variant="outline">{jurisdiction.state}</Badge>
              <Badge className="bg-gray-100 text-gray-600 capitalize text-xs">{jurisdiction.type}</Badge>
            </div>
            {jurisdiction.permitting_url && (
              <a href={jurisdiction.permitting_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> Official Permitting Page
              </a>
            )}
          </div>
          <div className="flex gap-1">
            <Button 
              size="icon" 
              variant="outline"
              onClick={handleResearch}
              disabled={isResearching}
              title="Run AI research to fill in jurisdiction data"
              className="gap-1"
            >
              {isResearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
        </div>
        
        {/* Contact Info in Header */}
        {jurisdiction.contact_info?.department && (
          <div className="text-xs space-y-1 bg-gray-50 p-2 rounded border border-gray-200">
            {jurisdiction.contact_info.department && <div><span className="font-semibold text-gray-700">Dept:</span> <span className="text-gray-600">{jurisdiction.contact_info.department}</span></div>}
            {jurisdiction.contact_info.phone && <div><span className="font-semibold text-gray-700">Phone:</span> <a href={`tel:${jurisdiction.contact_info.phone}`} className="text-blue-600 hover:underline">{jurisdiction.contact_info.phone}</a></div>}
            {jurisdiction.contact_info.email && <div><span className="font-semibold text-gray-700">Email:</span> <a href={`mailto:${jurisdiction.contact_info.email}`} className="text-blue-600 hover:underline">{jurisdiction.contact_info.email}</a></div>}
            {jurisdiction.contact_info.address && <div><span className="font-semibold text-gray-700">Address:</span> <span className="text-gray-600">{jurisdiction.contact_info.address}</span></div>}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* CAGIS Location Search */}
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
          <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
            <MapPin className="w-3 h-3" /> Location Lookup
          </p>
          <CAGISSearchBar key={jurisdiction.id} onLocationSelect={(loc) => {}} cagisUrl={jurisdiction.cagis_database_url} />
        </div>

        {/* AI Summary */}
         {jurisdiction.ai_summary && (
           <div className="bg-indigo-50 rounded-lg p-3 border-l-4 border-l-indigo-400">
             <p className="text-xs font-semibold text-indigo-800 mb-1">AI Summary</p>
             <p className="text-sm text-gray-700 leading-relaxed">{jurisdiction.ai_summary}</p>
           </div>
         )}

        {/* Key Requirements & Rules */}
        {(Object.keys(req).some(k => req[k] !== undefined && req[k] !== null && req[k] !== "") || jurisdiction.sqft_width_height_rules || jurisdiction.height_allowances || jurisdiction.setback_rules || jurisdiction.lighting_allowances) && (
          <div className="bg-red-50 rounded-lg p-3 border-l-4 border-l-red-400 space-y-3">
            <div>
              <p className="text-xs font-semibold text-red-800 mb-2">Permit Requirements</p>
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

            {(jurisdiction.sqft_width_height_rules || jurisdiction.height_allowances || jurisdiction.setback_rules || jurisdiction.lighting_allowances) && (
              <div className="border-t border-red-200 pt-3">
                <p className="text-xs font-semibold text-red-800 mb-2">Detailed Rules</p>
                <div className="space-y-2 text-xs text-gray-700">
                  {jurisdiction.sqft_width_height_rules && (
                    <div>
                      <span className="font-medium text-red-700">SQFT/Width/Height:</span> {jurisdiction.sqft_width_height_rules}
                    </div>
                  )}
                  {jurisdiction.height_allowances && (
                    <div>
                      <span className="font-medium text-red-700">Height Allowances:</span> {jurisdiction.height_allowances}
                    </div>
                  )}
                  {jurisdiction.setback_rules && (
                    <div>
                      <span className="font-medium text-red-700">Setback Rules:</span> {jurisdiction.setback_rules}
                    </div>
                  )}
                  {jurisdiction.lighting_allowances && (
                    <div>
                      <span className="font-medium text-red-700">Lighting Allowances:</span> {jurisdiction.lighting_allowances}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Parent County Info */}
        {jurisdiction.parent_county?.name && (
          <div className="bg-orange-50 rounded-lg p-3 border-l-4 border-l-orange-400">
            <p className="text-xs font-semibold text-orange-800 mb-2">Parent County: {jurisdiction.parent_county.name}</p>
            <div className="space-y-1 text-xs text-gray-700">
              {jurisdiction.parent_county.website_url && (
                <div>
                  <a href={jurisdiction.parent_county.website_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {jurisdiction.parent_county.website_url}
                  </a>
                </div>
              )}
              {jurisdiction.parent_county.contact_info?.phone && (
                <div>
                  <span className="font-medium text-orange-700">Phone:</span> <a href={`tel:${jurisdiction.parent_county.contact_info.phone}`} className="text-blue-600 hover:underline">{jurisdiction.parent_county.contact_info.phone}</a>
                </div>
              )}
              {jurisdiction.parent_county.contact_info?.email && (
                <div>
                  <span className="font-medium text-orange-700">Email:</span> <a href={`mailto:${jurisdiction.parent_county.contact_info.email}`} className="text-blue-600 hover:underline">{jurisdiction.parent_county.contact_info.email}</a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Documents */}
         <div className="bg-green-50 rounded-lg p-3 border border-green-200">
           <p className="text-xs font-semibold text-green-800 mb-2">
             Documents ({jurisdiction.documents?.length || 0})
           </p>
          <div className="mb-3">
            <div className="relative">
              {docSearching && <Loader2 className="absolute left-2 top-2 w-4 h-4 text-blue-500 animate-spin" />}
              {!docSearching && <Search className="absolute left-2 top-2 w-4 h-4 text-gray-400" />}
              <Input
                type="text"
                placeholder="Search City/Locality/Info..."
                value={docSearchTerm}
                onChange={(e) => searchDocuments(e.target.value)}
                className="text-xs pl-8 h-7"
              />
            </div>
            {docSearching && <p className="text-xs text-gray-500 mt-1">Searching...</p>}
            {!docSearching && docSearchTerm && searchResults.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">No matches found</p>
            )}
            {searchResults.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1 bg-blue-50 p-2 rounded border border-blue-100">
                {searchResults.map(result => (
                  <div 
                    key={`${result.type}-${result.id}`}
                    onClick={() => {
                      if (result.type === 'document') {
                        setExpandedDoc(result.id);
                      }
                      setDocSearchTerm("");
                      setSearchResults([]);
                    }}
                    className={`text-xs p-2 rounded cursor-pointer border ${result.type === 'jurisdiction' ? 'bg-purple-50 border-purple-200 hover:bg-purple-100' : 'bg-white border-blue-200 hover:bg-blue-100'}`}
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
               <div key={doc.id} className={`border-l-4 rounded-lg overflow-hidden ${doc.source === 'ai_discovered' ? 'bg-purple-50 border-l-purple-400' : 'bg-amber-50 border-l-amber-400'}`}>
                 <div
                   className="flex items-center gap-2 p-3 cursor-pointer hover:opacity-80 transition-opacity"
                   onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                 >
                   <FileText className={`w-4 h-4 flex-shrink-0 ${doc.source === 'ai_discovered' ? 'text-purple-500' : 'text-amber-500'}`} />
                   <div className="flex-1 min-w-0">
                     <p className="text-xs font-medium text-gray-800 truncate">{doc.title}</p>
                     <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                       <span className={`text-[10px] capitalize px-1.5 py-0.5 rounded font-medium ${doc.source === 'ai_discovered' ? 'bg-purple-200 text-purple-700' : 'bg-amber-200 text-amber-700'}`}>{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}</span>
                       {doc.last_fetched && <span className="text-[10px] text-gray-500">{format(new Date(doc.last_fetched), "MM/dd/yy")}</span>}
                       <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${doc.source === 'ai_discovered' ? 'bg-blue-200 text-blue-700' : 'bg-gray-200 text-gray-700'}`}>{doc.source === 'ai_discovered' ? 'AI' : 'Manual'}</span>
                     </div>
                   </div>
                   {expandedDoc === doc.id ? <ChevronUp className={`w-3.5 h-3.5 flex-shrink-0 ${doc.source === 'ai_discovered' ? 'text-purple-500' : 'text-amber-500'}`} /> : <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 ${doc.source === 'ai_discovered' ? 'text-purple-500' : 'text-amber-500'}`} />}
                 </div>
                {expandedDoc === doc.id && (
                  <div className="px-3 pb-3 border-t space-y-3" style={{ background: doc.source === 'ai_discovered' ? '#f3e8ff' : '#fef3c7' }}>
                    {/* Action Buttons */}
                    <div className="mt-3 flex gap-2">
                      {(doc.file_url || doc.url) && (
                        <Button
                          size="sm"
                          onClick={() => downloadDocument(doc)}
                          disabled={downloadingDocId === doc.id}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 gap-1"
                        >
                          {downloadingDocId === doc.id ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Downloading...
                            </>
                          ) : (
                            <>
                              <DownloadCloud className="w-3 h-3" />
                              Download
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => analyzeDocument(doc)}
                        disabled={analyzingDocId === doc.id || docAnalysis[doc.id]}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 gap-1"
                      >
                        {analyzingDocId === doc.id ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          "Extract Info"
                        )}
                      </Button>
                    </div>
                    {docAnalysis[doc.id] && (
                      <DocumentAnalysisPanel analysis={docAnalysis[doc.id]} isLoading={false} />
                    )}

                    {/* Search within document */}
                    {(doc.extracted_text || doc.ai_summary) && (
                      <div className="mt-3 space-y-2">
                        <div className="relative flex gap-2">
                          <Input
                            type="text"
                            placeholder="Search within document..."
                            value={expandedDocSearch[doc.id] || ""}
                            onChange={(e) => searchWithinDocument(doc.id, e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && searchWithinDocument(doc.id, expandedDocSearch[doc.id])}
                            className="text-xs h-7 flex-1"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => searchWithinDocument(doc.id, expandedDocSearch[doc.id])}
                            disabled={searchingDocId === doc.id || !expandedDocSearch[doc.id]?.trim()}
                            className="h-7 px-2 text-xs gap-1"
                          >
                            {searchingDocId === doc.id ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                              </>
                            ) : (
                              <>
                                <Search className="w-3 h-3" />
                              </>
                            )}
                          </Button>
                        </div>
                        
                        {docSearchResults[doc.id] && (
                          <div className="bg-white p-2 rounded border border-blue-200">
                            {docSearchResults[doc.id].matches === 0 ? (
                              <p className="text-xs text-gray-500">No matches found</p>
                            ) : (
                              <div className="space-y-1">
                                <p className="text-xs font-semibold text-blue-700">{docSearchResults[doc.id].matches} match{docSearchResults[doc.id].matches !== 1 ? 'es' : ''} found</p>
                                {docSearchResults[doc.id].snippets.map((snippet, i) => (
                                  <p key={i} className="text-xs text-gray-600 italic line-clamp-2">
                                    ...{snippet}...
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {doc.file_url ? (
                      isPDF(doc) ? (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingPDF(doc);
                          }}
                          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-6 mt-3"
                        >
                          <FileText className="w-5 h-5 mr-2" />
                          Open {doc.title}
                        </Button>
                      ) : (
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full mt-3"
                        >
                          <Button className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-6">
                            <FileText className="w-5 h-5 mr-2" />
                            Open {doc.title}
                          </Button>
                        </a>
                      )
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
                        <p className="text-xs text-gray-700 leading-relaxed">{doc.ai_summary}</p>
                      </div>
                    )}
                    {doc.extracted_text && (
                      <ExtractedContentDisplay extractedText={doc.extracted_text} />
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


      </div>

      {/* Chat Interface */}
      <div className="border-t p-3 bg-cyan-50 border-l-4 border-l-cyan-400">
        <p className="text-xs font-semibold text-cyan-800 mb-2 flex items-center gap-1">
          <MessageSquare className="w-3 h-3" /> Ask AI about this jurisdiction
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