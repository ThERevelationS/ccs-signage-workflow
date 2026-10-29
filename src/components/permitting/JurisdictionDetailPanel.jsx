import JurisdictionWorkspaceNavigation from './JurisdictionWorkspaceNavigation';
import OfficeResearchFindings from './OfficeResearchFindings';
import OfficialSourceRescans from "./OfficialSourceRescans";
import ExternalPermittingReferrals from "./ExternalPermittingReferrals";
import LocalityApprovedEvidence from "./LocalityApprovedEvidence";
import { useAuth } from "@/components/auth/EmailGate";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { X, ExternalLink, FileText, MessageSquare, Loader2, Download, RefreshCw, ChevronDown, ChevronUp, CheckCircle, XCircle, Search, MapPin, DownloadCloud, History, ShieldAlert, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useResearchProgress } from "./ResearchProgressContext";
import { format } from "date-fns";
import { isVerifiedPermitPDFArchive } from "./permitArchiveVerification";
import PDFViewer from "./PDFViewer";
import CAGISSearchBar from "./CAGISSearchBar";
import { documentSearchSnippet, splitDocumentSearchMatches, documentSearchContent, documentSearchContentSource, findDocumentMatchPositions, documentMatchSnippet, stepDocumentMatchIndex } from "./documentSearchSnippet";
import { buildJurisdictionQuestionContext } from "./jurisdictionQuestionContext";
import { documentHeaderTargetIndex } from "./documentHeaderNavigation";
import DocumentAnalysisPanel from "./DocumentAnalysisPanel";
import ExtractedContentDisplay from "./ExtractedContentDisplay";
import { generateJurisdictionPDF } from "./JurisdictionPDFReport";
import JurisdictionActivityTab from "./JurisdictionActivityTab";
import JurisdictionAuthorityStatus from "./JurisdictionAuthorityStatus";
import JurisdictionRequirements from "./JurisdictionRequirements";
import SourceMonitorPanel from "./SourceMonitorPanel";
import DocumentRepositoryBrowser from './DocumentRepositoryBrowser';
import PermitWorkflowDesigner from "./PermitWorkflowDesigner";
import { createElectricalPlanningHandoff } from "./permitWorkflowDesigner";
import { appendJurisdictionActivitySafely } from "./jurisdictionPersistence";
import { assessJurisdictionTrust } from "./jurisdictionTrust";

const DOC_TYPE_LABELS = {
  sign_ordinance: "Sign Ordinance",
  permit_application: "Permit Application",
  zoning_code: "Zoning Code",
  fee_schedule: "Fee Schedule",
  checklist: "Checklist",
  other: "Other"
};

export default function JurisdictionDetailPanel({ jurisdiction, duplicateCount = 1, onSetVerification, onClose, onUpdate, onSaveOfficeResearch }) {
  const { currentUser } = useAuth();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState(null);
  const documentHeaderRefs = useRef(new Map());
  const focusedDocumentHeaderRef = useRef(null);
  const focusedDocumentContentRef = useRef(null);
  const pendingDocNavigationRef = useRef(null);
  const jurisdictionHeadingRef = useRef(null);
  const jurisdictionSearchInputRef = useRef(null);
  const firstJurisdictionSearchResultRef = useRef(null);
  const jurisdictionSearchResultRefs = useRef(new Map());
  const focusedJurisdictionSearchResultRef = useRef(null);
  const searchJurisdictionIdRef = useRef(jurisdiction.id);
  const documentSearchInputRef = useRef(null);
  const focusedMatchNavigationDocRef = useRef(null);
  const pdfOpenButtonRef = useRef(null);
  const pendingPDFReturnFocusRef = useRef(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [downloadingDocId, setDownloadingDocId] = useState(null);
  const [archiveProgress, setArchiveProgress] = useState(null);
  const archiveInFlightRef = useRef(false);
  const activeArchiveJurisdictionRef = useRef(jurisdiction.id);
  const [viewingPDF, setViewingPDF] = useState(null);
  const [docSearchTerm, setDocSearchTerm] = useState("");
  const [jurisdictionSearchCleared, setJurisdictionSearchCleared] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [docSearching, setDocSearching] = useState(false);
  const [expandedDocSearch, setExpandedDocSearch] = useState({});
  const [analyzingDocId, setAnalyzingDocId] = useState(null);
  const [docAnalysis, setDocAnalysis] = useState({});
  const [searchingDocId, setSearchingDocId] = useState(null);
  const [docSearchResults, setDocSearchResults] = useState({});
  const [clearedDocSearchId, setClearedDocSearchId] = useState(null);
  const [isResearching, setIsResearching] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const workspaceSections = useRef({});
  const [sourceRequest, setSourceRequest] = useState(null);
  const navigateWorkspace = (section, sourceId) => {
    if (section === 'documents') {
      setSourceRequest(previous => typeof sourceId === 'string' && sourceId.trim()
        ? { jurisdictionId: jurisdiction.id, sourceId: sourceId.trim(), token: (previous?.token || 0) + 1 }
        : null);
    }
    const target=workspaceSections.current[section];
    if(target){target.scrollIntoView({block:"start",behavior:"auto"});target.focus({preventScroll:true});}
  };
  const [verificationTarget, setVerificationTarget] = useState(null);
  const [verificationNote, setVerificationNote] = useState("");
  const [verificationSaving, setVerificationSaving] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const { runAction } = useResearchProgress();
  const [showWorkflowDesigner, setShowWorkflowDesigner] = useState(false);
  const [electricalPlanningHandoff, setElectricalPlanningHandoff] = useState(null);
  const trust = assessJurisdictionTrust(jurisdiction, duplicateCount);
  const pdfSources = (jurisdiction.documents || []).filter(doc => /\.pdf(?:[?#]|$)/i.test(doc.url || ""));
  const pendingPDFs = pdfSources.filter(doc => !doc.file_url && /^[a-f0-9]{64}$/i.test(doc.source_sha256 || "") && Number.isSafeInteger(Number(doc.source_bytes)) && Number(doc.source_bytes) > 0);
  const archivedPDFCount = pdfSources.filter(isVerifiedPermitPDFArchive).length;
  const unpinnedPDFCount = pdfSources.filter(doc => !doc.file_url && !pendingPDFs.includes(doc)).length;
  const unverifiedPDFCount = pdfSources.filter(doc => doc.file_url && !isVerifiedPermitPDFArchive(doc)).length;

  // Do not carry document expansion, search results, or pending focus into another jurisdiction.
  useEffect(() => {
    activeArchiveJurisdictionRef.current = jurisdiction.id;
    setSourceRequest(null);
    setArchiveProgress(null);
    setViewingPDF(null);
    setVerificationTarget(null);
    setVerificationNote("");
    setVerificationError("");
    setExpandedDoc(null);
    setDocSearchTerm("");
    setJurisdictionSearchCleared(false);
    setSearchResults([]);
    setExpandedDocSearch({});
    setDocSearchResults({});
    setClearedDocSearchId(null);
    pendingDocNavigationRef.current = null;
    pendingPDFReturnFocusRef.current = null;
    focusedDocumentContentRef.current = null;
    focusedMatchNavigationDocRef.current = null;
  }, [jurisdiction.id]);

  // Same-jurisdiction refreshes can remove an expanded document. Clear its stale UI state
  // and restore focus to the nearest persistent document control when that happens.
  useLayoutEffect(() => {
    if (!expandedDoc || (jurisdiction.documents || []).some(doc => doc.id === expandedDoc)) return;
    const removedDocId = expandedDoc;
    const removedDocumentHadFocus = focusedDocumentHeaderRef.current === removedDocId || focusedDocumentContentRef.current === removedDocId;
    setExpandedDoc(null);
    setExpandedDocSearch(prev => {
      if (!(removedDocId in prev)) return prev;
      const next = { ...prev };
      delete next[removedDocId];
      return next;
    });
    setDocSearchResults(prev => {
      if (!(removedDocId in prev)) return prev;
      const next = { ...prev };
      delete next[removedDocId];
      return next;
    });
    if (clearedDocSearchId === removedDocId) setClearedDocSearchId(null);
    if (pendingDocNavigationRef.current === removedDocId) pendingDocNavigationRef.current = null;
    if (focusedDocumentContentRef.current === removedDocId) focusedDocumentContentRef.current = null;
    if (focusedMatchNavigationDocRef.current === removedDocId) focusedMatchNavigationDocRef.current = null;
    if (removedDocumentHadFocus) {
      focusedDocumentHeaderRef.current = null;
      const firstRemainingHeader = documentHeaderRefs.current.get(jurisdiction.documents?.[0]?.id);
      (firstRemainingHeader || jurisdictionSearchInputRef.current)?.focus({ preventScroll: true });
    }
  }, [jurisdiction.documents, expandedDoc, clearedDocSearchId]);

  // After a search selection expands or switches documents, move focus before paint so
  // removing the selected result never leaves keyboard focus briefly on the document body.
  // Clearing search results also triggers this when the selected document was already expanded.
  useLayoutEffect(() => {
    const header = documentHeaderRefs.current.get(expandedDoc);
    if (pendingDocNavigationRef.current !== expandedDoc || !header) return;
    pendingDocNavigationRef.current = null;
    focusedDocumentContentRef.current = null;
    focusedMatchNavigationDocRef.current = null;
    header.focus({ preventScroll: true });
    header.scrollIntoView({ block: "start", behavior: "auto" });
  }, [expandedDoc, searchResults]);

  // A focused search result may disappear when matches change or the jurisdiction switches.
  // Restore focus only when that result is gone; never override an explicit selection.
  useLayoutEffect(() => {
    const focusedKey = focusedJurisdictionSearchResultRef.current;
    if (!focusedKey || searchResults.some(result => `${result.type}-${result.id}` === focusedKey)) return;
    focusedJurisdictionSearchResultRef.current = null;
    jurisdictionSearchInputRef.current?.focus({ preventScroll: true });
  }, [searchResults]);

  const isPDF = (doc) => {
    const url = doc.file_url || doc.url || "";
    const title = doc.title || "";
    return url.toLowerCase().includes('.pdf') || title.toLowerCase().includes('.pdf');
  };

  // Resolve the viewer against current jurisdiction data, never the document snapshot
  // captured when Open was clicked. A replaced PDF uses its new URL immediately.
  const liveViewingPDF = viewingPDF?.jurisdictionId === jurisdiction.id
    ? (jurisdiction.documents || []).find(doc => doc.id === viewingPDF.id && doc.file_url && isPDF(doc))
    : null;

  useLayoutEffect(() => {
    if (!viewingPDF || liveViewingPDF) return;
    // The PDF was removed, changed type, or belongs to a previous jurisdiction.
    // The details panel is rendered in this commit, so its controls can receive focus.
    setViewingPDF(null);
    const recoveryTarget = documentHeaderRefs.current.get(viewingPDF.id)
      || jurisdictionSearchInputRef.current
      || jurisdictionHeadingRef.current;
    recoveryTarget?.focus({ preventScroll: true });
    recoveryTarget?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [viewingPDF, liveViewingPDF]);

  // Returning from the PDF viewer remounts the detail controls. Restore focus to
  // the Open button after that render, or to a stable control if it no longer exists.
  useLayoutEffect(() => {
    const destination = pendingPDFReturnFocusRef.current;
    if (viewingPDF || !destination) return;
    pendingPDFReturnFocusRef.current = null;
    if (destination.jurisdictionId !== jurisdiction.id) return;
    const target = (expandedDoc === destination.id ? pdfOpenButtonRef.current : null)
      || documentHeaderRefs.current.get(destination.id)
      || jurisdictionSearchInputRef.current
      || jurisdictionHeadingRef.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [viewingPDF, expandedDoc, jurisdiction.id, jurisdiction.documents]);

  // Explicit, bounded archive action in the active Permitting view. Do not silently
  // upload merely because someone opened a jurisdiction, and never count a URL alone
  // as proof that the official PDF was stored correctly.
  const archiveMissingPDFs = async () => {
    if (archiveInFlightRef.current || !pendingPDFs.length) return;
    const targetId = jurisdiction.id;
    const batch = pendingPDFs.slice(0, 10);
    archiveInFlightRef.current = true;
    const progress = { processed: 0, total: batch.length, stored: 0, skipped: 0, failed: 0, failures: [] };
    setArchiveProgress({ ...progress });
    try {
      for (const doc of batch) {
        if (activeArchiveJurisdictionRef.current !== targetId) break;
        try {
          const latest = await base44.entities.JurisdictionProfile.get(targetId);
          const current = (latest.documents || []).find(item => item.id === doc.id && item.url === doc.url);
          if (!current) {
            progress.skipped++;
          } else if (current.file_url) {
            if (!isVerifiedPermitPDFArchive(current)) throw new Error("An existing file is missing matching upload verification");
            progress.skipped++;
          } else if (current.source_sha256 !== doc.source_sha256 || current.source_bytes !== doc.source_bytes) {
            throw new Error("Official source fingerprint changed; recheck before uploading");
          } else {
            await runAction('downloadPermitPDF',{jurisdiction_id:targetId,document_url:doc.url,document_title:doc.title},`Download ${doc.title} — ${jurisdiction.name}`);
            const saved = await base44.entities.JurisdictionProfile.get(targetId);
            const stored = (saved.documents || []).find(item => item.id === doc.id && item.url === doc.url);
            if (!isVerifiedPermitPDFArchive(stored)) throw new Error("Stored PDF checksum or byte count could not be verified");
            progress.stored++;
            if (activeArchiveJurisdictionRef.current === targetId) onUpdate(saved);
          }
        } catch (error) {
          // One re-read recovers an upload that succeeded despite a network timeout.
          const saved = await base44.entities.JurisdictionProfile.get(targetId).catch(() => null);
          const stored = (saved?.documents || []).find(item => item.id === doc.id && item.url === doc.url);
          if (isVerifiedPermitPDFArchive(stored)) {
            progress.stored++;
            if (activeArchiveJurisdictionRef.current === targetId) onUpdate(saved);
          } else {
            progress.failed++;
            progress.failures.push(`${doc.title}: ${error?.message || "Upload failed"}`);
          }
        }
        progress.processed++;
        if (activeArchiveJurisdictionRef.current === targetId) setArchiveProgress({ ...progress, failures: [...progress.failures] });
      }
    } finally {
      archiveInFlightRef.current = false;
    }
  };

  const searchDocuments = (term) => {
    setDocSearchTerm(term);
    setJurisdictionSearchCleared(!term.trim());
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
          snippet: documentSearchSnippet(doc, term)
        });
      }
    });

    setSearchResults(results);
  };

  // Recheck active matches after same-jurisdiction document updates so removed results
  // disappear and the existing search-result focus recovery can run.
  useEffect(() => {
    if (searchJurisdictionIdRef.current !== jurisdiction.id) {
      searchJurisdictionIdRef.current = jurisdiction.id;
      return; // Jurisdiction changes have their own search reset above.
    }
    if (docSearchTerm.trim()) searchDocuments(docSearchTerm);
    // Refresh in-document match offsets too: old offsets can point at unrelated text
    // after a document is re-fetched, even when the document ID stays the same.
    setDocSearchResults(previous => {
      let next = previous;
      const documentsById = new Map((jurisdiction.documents || []).map(doc => [doc.id, doc]));
      for (const [docId, result] of Object.entries(previous)) {
        const doc = documentsById.get(docId);
        if (!doc) {
          if (next === previous) next = { ...previous };
          delete next[docId];
          continue;
        }
        if (!result?.query) continue;
        const content = documentSearchContent(doc, result.query);
        const positions = findDocumentMatchPositions(content, result.query.toLowerCase());
        const source = documentSearchContentSource(doc, result.query);
        if (result.source === source && result.matches === positions.length &&
            positions.every((position, index) => position === result.positions?.[index])) continue;
        if (next === previous) next = { ...previous };
        next[docId] = {
          ...result,
          matches: positions.length,
          positions,
          source,
          // Match indexes are only meaningful within the same source text. If a refresh
          // moves the query between extracted text and the AI summary, start at match 1.
          activeIndex: result.source === source
            ? Math.min(result.activeIndex || 0, Math.max(positions.length - 1, 0))
            : 0
        };
      }
      return next;
    });
  }, [jurisdiction.id, jurisdiction.documents]);

  const searchWithinDocument = async (docId, searchText) => {
    setClearedDocSearchId(searchText.trim() ? null : docId);
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
      const searchContent = documentSearchContent(doc, searchText);
      const searchSource = documentSearchContentSource(doc, searchText);
      const searchTerm = searchText.toLowerCase();
      
      const positions = findDocumentMatchPositions(searchContent, searchTerm);
      setDocSearchResults(prev => ({
        ...prev,
        [docId]: { matches: positions.length, positions, activeIndex: 0, query: searchText, source: searchSource }
      }));
    } catch (e) {
      console.error("Search error:", e);
    }
    setSearchingDocId(null);
  };

  // Refreshes can reduce a multi-match search to one or zero matches, which removes
  // its Previous/Next buttons. Keep keyboard focus in the same document search.
  useLayoutEffect(() => {
    const docId = focusedMatchNavigationDocRef.current;
    if (!docId || (docSearchResults[docId]?.matches || 0) > 1) return;
    focusedMatchNavigationDocRef.current = null;
    if (expandedDoc === docId) documentSearchInputRef.current?.focus({ preventScroll: true });
  }, [docSearchResults, expandedDoc]);

  const moveDocumentMatch = (docId, direction) => {
    setDocSearchResults(prev => {
      const current = prev[docId];
      if (!current?.matches) return prev;
      const nextIndex = stepDocumentMatchIndex(current.activeIndex, current.matches, direction);
      if (nextIndex === current.activeIndex) return prev;
      return { ...prev, [docId]: { ...current, activeIndex: nextIndex } };
    });
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

    
    try {

      
      const res = await runAction('refreshJurisdiction', {
        jurisdictionId: jurisdiction.id,
        settings: {
          updateWebsites: !jurisdiction._manual_website_url,
          updatePermittingUrls: !jurisdiction._manual_permitting_url,
          updateRequirements: !jurisdiction._manual_requirements,
          updateDocuments: !jurisdiction._manual_documents,
          skipManualData: true
        }
      },`Research ${jurisdiction.name}, ${jurisdiction.state}`);
      
      if (res.data?.jurisdiction) {
        // Append activity log entry
        const newEntry = {
          id: `act_${Date.now()}`,
          action: "ai_refresh",
          description: `AI refreshed jurisdiction data — websites, requirements, and documents updated.`,
          user: "AI (Automated)",
          timestamp: new Date().toISOString(),
          changes: {}
        };
        const savedWithActivity = await appendJurisdictionActivitySafely({
          entity: base44.entities.JurisdictionProfile,
          jurisdictionId: jurisdiction.id,
          entry: newEntry,
          label: `Jurisdiction research activity ${jurisdiction.name || jurisdiction.id}`,
        });
        onUpdate(savedWithActivity);

      } else {

      }
    } catch (e) {
      console.error("Research error:", e);

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
      const docContext = buildJurisdictionQuestionContext(jurisdiction.documents, q);

      const prompt = `You are a permitting expert assistant for sign companies. 
      
Jurisdiction: ${jurisdiction.name}, ${jurisdiction.state} (${jurisdiction.type})
${jurisdiction.ai_summary ? `Summary: ${jurisdiction.ai_summary}` : ""}

Relevant source-linked document excerpts (not the full jurisdiction archive):
${docContext}

${jurisdiction.permit_requirements ? `Known requirements: ${JSON.stringify(jurisdiction.permit_requirements, null, 2)}` : ""}

Chat history:
${newHistory.slice(-4).map(m => `${m.role === 'user' ? 'Question' : 'Answer'}: ${m.content}`).join("\n")}

Current question: ${q}

Answer only from the provided excerpts and cite the document title and official source URL for each material rule. These are selected excerpts, not the entire ordinance. If a requested condition, jurisdiction boundary, district, or sign type cannot be established from these excerpts, say so; do not generalize a special district's requirements to another location or invent missing limits. Direct the user to the cited complete official source and permitting office for unresolved questions.`;

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
      const res = await runAction('downloadPermitPDF',{
        jurisdiction_id: jurisdiction.id,
        document_url: doc.url,
        document_title: doc.title
      },`Download ${doc.title}`);
      if (res.data?.jurisdiction?.id) {
        onUpdate(res.data.jurisdiction);
      } else if (res.data?.file_url) {
        const latest = await base44.entities.JurisdictionProfile.get(jurisdiction.id).catch(() => null);
        if (latest?.id) onUpdate(latest);
      }
    } catch (e) {
      console.error("Download error:", e);
    }
    setDownloadingDocId(null);
  };

  if (liveViewingPDF) {
    return (
      <div className="flex flex-col h-full">
        <PDFViewer key={`${liveViewingPDF.id}:${liveViewingPDF.file_url}:${liveViewingPDF.last_fetched || ""}`} fileUrl={liveViewingPDF.file_url} fileName={liveViewingPDF.title} onBack={() => {
          // Capture the current live destination, not the snapshot from when the viewer opened.
          pendingPDFReturnFocusRef.current = { id: liveViewingPDF.id, jurisdictionId: jurisdiction.id };
          setViewingPDF(null);
        }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h2 ref={jurisdictionHeadingRef} tabIndex={-1} className="min-w-0 break-words font-bold text-lg text-gray-900 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600">{jurisdiction.name}</h2>
              <Badge variant="outline" className="max-w-full break-words">{jurisdiction.state}</Badge>
              <Badge className="max-w-full break-words bg-gray-100 text-gray-600 capitalize text-xs">{jurisdiction.type}</Badge>
            </div>
            {pdfSources.length > 0 && (
              <div className="mt-2 space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                <p>{archivedPDFCount} of {pdfSources.length} official PDFs verified in File Storage. {pendingPDFs.length} fingerprinted PDF{pendingPDFs.length === 1 ? "" : "s"} ready to archive.</p>
                <Button type="button" variant="outline" className="min-h-11 w-full gap-2 border-blue-300 sm:w-auto" disabled={archiveInFlightRef.current || !pendingPDFs.length || downloadingDocId !== null} onClick={archiveMissingPDFs}>
                  {archiveInFlightRef.current ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
                  {archiveInFlightRef.current ? "Archiving official PDFs..." : `Archive missing PDFs (${Math.min(pendingPDFs.length, 10)} this batch)`}
                </Button>
                {unpinnedPDFCount > 0 && <p>{unpinnedPDFCount} PDF source{unpinnedPDFCount === 1 ? "" : "s"} still require verified source checksums before upload.</p>}
                {unverifiedPDFCount > 0 && <p role="alert" className="text-red-700">{unverifiedPDFCount} existing PDF upload{unverifiedPDFCount === 1 ? "" : "s"} lack matching checksum/size proof and are not counted as archived.</p>}
                {archiveProgress && (
                  <div role="status" aria-live="polite" className="space-y-1">
                    <p>{archiveProgress.processed}/{archiveProgress.total} processed; {archiveProgress.stored} verified stored, {archiveProgress.skipped} skipped, {archiveProgress.failed} failed.</p>
                    {archiveProgress.failures.map((failure, index) => <p key={index} className="break-words text-red-700">{failure}</p>)}
                  </div>
                )}
              </div>
            )}
            {jurisdiction.permitting_url && (
              <a
                href={jurisdiction.permitting_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open official permitting page for ${jurisdiction.name} in a new tab`}
                className="mt-2 inline-flex min-h-11 w-full max-w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:w-auto sm:justify-start"
              >
                <ExternalLink className="h-4 w-4 flex-shrink-0" />
                <span className="min-w-0 break-words">Official Permitting Page</span>
              </a>
            )}
          </div>
          <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => generateJurisdictionPDF(jurisdiction)}
              title="Download PDF report"
              className="min-h-11 flex-1 gap-1.5 text-xs sm:flex-none"
            >
              <Download className="w-4 h-4" />
              Report
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleResearch}
              disabled={isResearching}
              title="Run AI research to fill in jurisdiction data"
              className="min-h-11 min-w-11 flex-1 gap-1.5 px-3 sm:flex-none sm:px-2.5"
              aria-label="Refresh jurisdiction research"
            >
              {isResearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span className="sm:hidden">{isResearching ? "Refreshing" : "Refresh"}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="Export this jurisdiction's offices + evidence as JSON"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([JSON.stringify(jurisdiction, null, 2)], { type: "application/json" }));
                const a = document.createElement("a");
                a.href = url; a.download = `jurisdiction-${String(jurisdiction.name || "export").replace(/\s+/g, "-")}.json`; a.click();
                URL.revokeObjectURL(url);
              }}
              className="min-h-11 min-w-11 gap-1.5 px-3 sm:px-2.5"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="min-h-11 min-w-11 flex-1 gap-1.5 px-3 sm:flex-none sm:px-2.5"
              aria-label="Close jurisdiction details"
            >
              <X className="w-4 h-4" />
              <span className="sm:hidden">Close</span>
            </Button>
          </div>
        </div>

        <div className={`rounded-lg border p-3 ${trust.className}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-2 min-w-0">
              <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold">{trust.label}</div>
                <div className="text-[11px] mt-0.5 opacity-90">{trust.description}</div>
                {jurisdiction.verified_at && (
                  <div className="text-[10px] mt-1 opacity-80">
                    Last verified {jurisdiction.verified_at.slice(0, 10)}{jurisdiction.verified_by ? ` by ${jurisdiction.verified_by}` : ""}
                  </div>
                )}
                {jurisdiction.verification_notes && (
                  <div className="text-[10px] mt-1 opacity-80">Review note: {jurisdiction.verification_notes}</div>
                )}
                {trust.issues.length > 0 && (
                  <ul className="mt-2 text-[11px] space-y-0.5 list-disc list-inside">
                    {trust.issues.slice(0, 5).map((issue) => <li key={issue}>{issue}</li>)}
                  </ul>
                )}
              </div>
            </div>
            {onUpdate && (
              <Button
                variant="outline"
                size="sm"
                title="Suggest an office we don't know about — the research queue gets the signal"
                onClick={async () => {
                  const suggestion = window.prompt("What office is missing here? (e.g. 'Electrical inspector is the county building dept')");
                  if (!suggestion || !suggestion.trim()) return;
                  const notes = `${jurisdiction.notes || ""}\n[Staff suggestion ${new Date().toISOString().slice(0, 10)}]: ${suggestion.trim()}`.trim();
                  const saved = await base44.entities.JurisdictionProfile.update(jurisdiction.id, { notes });
                  if (saved?.id) onUpdate(saved);
                }}
                className="min-h-11 gap-1 text-xs"
              >
                <MessageSquare className="w-3.5 h-3.5" /> Suggest an office
              </Button>
            )}
            {onSetVerification && (
              <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:flex-shrink-0">
                {trust.key !== "verified" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={trust.verificationBlocked}
                    onClick={() => { setVerificationError(""); setVerificationNote(jurisdiction.verification_notes || ""); setVerificationTarget("verified"); }}
                    className="min-h-11 w-full justify-center border-green-300 px-3 text-xs text-green-800 hover:bg-green-50 sm:w-auto"
                    title={trust.verificationBlocked ? "Resolve duplicate, placeholder, or unusable-source issues first" : "Confirm staff verification against official/current sources"}
                  >
                    Mark Verified
                  </Button>
                )}
                {trust.key !== "historical" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => { setVerificationError(""); setVerificationNote(jurisdiction.verification_notes || ""); setVerificationTarget("historical"); }}
                    className="min-h-11 w-full justify-center border-slate-300 px-3 text-xs text-slate-700 hover:bg-slate-50 sm:w-auto"
                  >
                    Historical
                  </Button>
                )}
                {(trust.key === "verified" || trust.key === "historical") && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => { setVerificationError(""); setVerificationNote(jurisdiction.verification_notes || ""); setVerificationTarget("needs_verification"); }}
                    className="min-h-11 w-full justify-center px-3 text-xs text-amber-800 hover:bg-amber-50 sm:w-auto"
                  >
                    Needs Re-verification
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Contact Info in Header — always shown */}
        <div className="space-y-2 rounded border border-gray-200 bg-gray-50 p-3 text-xs">
          <p className="mb-1 font-semibold text-gray-700">Contact Information</p>
          {jurisdiction.contact_info?.department ? (
            <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:gap-2"><span className="shrink-0 font-semibold text-gray-600">Dept:</span> <span className="min-w-0 break-words text-gray-700">{jurisdiction.contact_info.department}</span></div>
          ) : null}
          {jurisdiction.contact_info?.phone ? (
            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2"><span className="shrink-0 font-semibold text-gray-600">Phone:</span> <a href={`tel:${jurisdiction.contact_info.phone}`} className="inline-flex min-h-11 min-w-0 items-center break-all rounded-md px-2 text-sm font-medium text-blue-700 hover:bg-blue-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-0 sm:px-0 sm:text-xs">{jurisdiction.contact_info.phone}</a></div>
          ) : null}
          {jurisdiction.contact_info?.email ? (
            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2"><span className="shrink-0 font-semibold text-gray-600">Email:</span> <a href={`mailto:${jurisdiction.contact_info.email}`} className="inline-flex min-h-11 min-w-0 items-center break-all rounded-md px-2 text-sm font-medium text-blue-700 hover:bg-blue-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:min-h-0 sm:px-0 sm:text-xs">{jurisdiction.contact_info.email}</a></div>
          ) : null}
          {jurisdiction.contact_info?.address ? (
            <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:gap-2"><span className="shrink-0 font-semibold text-gray-600">Address:</span> <span className="min-w-0 break-words text-gray-700">{jurisdiction.contact_info.address}</span></div>
          ) : null}
          {!jurisdiction.contact_info?.department && !jurisdiction.contact_info?.phone && !jurisdiction.contact_info?.email && !jurisdiction.contact_info?.address && (
            <p className="text-gray-400 italic">No contact info yet. Use AI refresh to populate.</p>
          )}
        </div>
      </div>

      <AlertDialog
        open={!!verificationTarget}
        onOpenChange={(open) => {
          if (!open && !verificationSaving) {
            setVerificationTarget(null);
            setVerificationError("");
          }
        }}
      >
        <AlertDialogContent className="clay-card w-[calc(100%-2rem)] max-w-lg border-none p-4 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {verificationTarget === "verified" ? "Mark this jurisdiction verified?" : verificationTarget === "historical" ? "Mark this jurisdiction historical?" : "Require re-verification?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {verificationTarget === "verified"
                ? "Use Verified only after staff has checked the current permitting information against official jurisdiction sources. This does not freeze the record or guarantee future rules remain unchanged."
                : verificationTarget === "historical"
                  ? "Historical keeps this profile available for prior-job reference but clearly warns staff to verify current requirements before using it on new work."
                  : "This keeps the existing research and prior verification history, but marks the profile as needing a fresh staff review before it should be relied on."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label htmlFor="jurisdiction-verification-note" className="text-sm font-medium text-gray-700">Review note (optional)</label>
            <Input
              id="jurisdiction-verification-note"
              value={verificationNote}
              onChange={(event) => setVerificationNote(event.target.value)}
              placeholder="Official page checked, scope, caveat, or reason for re-verification…"
              disabled={verificationSaving}
              className="min-h-11"
            />
          </div>
          {verificationError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{verificationError}</div>
          )}
          <AlertDialogFooter className="grid grid-cols-1 gap-2 sm:flex sm:justify-end">
            <AlertDialogCancel className="min-h-11 w-full sm:w-auto" disabled={verificationSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 w-full sm:w-auto"
              disabled={verificationSaving || !verificationTarget}
              onClick={async (event) => {
                event.preventDefault();
                if (!verificationTarget) return;
                setVerificationSaving(true);
                setVerificationError("");
                try {
                  await onSetVerification(jurisdiction, verificationTarget, verificationNote);
                  setVerificationTarget(null);
                } catch (error) {
                  console.error("Could not change jurisdiction verification status:", error);
                  setVerificationError(error?.message || "Verification status could not be changed safely. Reload and try again.");
                } finally {
                  setVerificationSaving(false);
                }
              }}
            >
              {verificationSaving ? "Saving…" : verificationTarget === "verified" ? "Mark Verified" : verificationTarget === "historical" ? "Mark Historical" : "Require Re-verification"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tab bar */}
      <div className="flex border-b bg-gray-50" role="tablist" aria-label="Jurisdiction detail sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "overview"}
          aria-controls="jurisdiction-overview-panel"
          onClick={() => setActiveTab("overview")}
          className={`min-h-11 flex-1 px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-500 ${activeTab === "overview" ? "border-b-2 border-purple-600 text-purple-700 bg-white" : "text-gray-500 hover:text-gray-700"}`}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "activity"}
          aria-controls="jurisdiction-activity-panel"
          onClick={() => setActiveTab("activity")}
          className={`min-h-11 flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-500 ${activeTab === "activity" ? "border-b-2 border-purple-600 text-purple-700 bg-white" : "text-gray-500 hover:text-gray-700"}`}
        >
          <History className="w-3.5 h-3.5" />
          Activity
          {(jurisdiction.activity_log?.length > 0) && (
            <span className="ml-1 bg-purple-100 text-purple-700 text-[10px] rounded-full px-1.5 py-0.5 font-bold">{jurisdiction.activity_log.length}</span>
          )}
        </button>
      </div>

      {activeTab === "activity" && (
        <div id="jurisdiction-activity-panel" role="tabpanel" className="flex-1 overflow-y-auto">
          <JurisdictionActivityTab jurisdiction={jurisdiction} />
        </div>
      )}

      {activeTab === "overview" && <><JurisdictionWorkspaceNavigation jurisdiction={jurisdiction} onNavigate={navigateWorkspace}/><div id="jurisdiction-overview-panel" role="tabpanel" className="flex-1 overflow-y-auto p-4 space-y-4">
        <LocalityApprovedEvidence jurisdiction={jurisdiction} isAdmin={currentUser?.role === "admin"} />

        <section ref={node=>{workspaceSections.current.offices=node;}} tabIndex={-1} aria-label="Office and electrical research workspace" className="scroll-mt-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-600">
          <OfficeResearchFindings key={jurisdiction.id} research={jurisdiction.office_research} canEdit={currentUser?.role === "admin"} actor={currentUser?.full_name || currentUser?.email || "CCS Staff"} onSave={updated => onSaveOfficeResearch?.(jurisdiction, updated)} onNavigate={navigateWorkspace} onPreviewWorkflow={() => { setElectricalPlanningHandoff(createElectricalPlanningHandoff(jurisdiction.office_research, jurisdiction)); setShowWorkflowDesigner(true); }}/>
        </section>

        {/* CAGIS Location Search */}
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
          <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
            <MapPin className="w-3 h-3" /> Location Lookup
          </p>
          <CAGISSearchBar key={jurisdiction.id} onLocationSelect={(loc) => {}} cagisUrl={jurisdiction.cagis_database_url} />
        </div>

        {/* AI Summary */}
         {jurisdiction.ai_summary && (
           <div className="min-w-0 rounded-lg border-l-4 border-l-indigo-400 bg-indigo-50 p-3">
             <p className="mb-1 text-xs font-semibold text-indigo-800">AI Summary</p>
             <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 [overflow-wrap:anywhere]">{jurisdiction.ai_summary}</p>
           </div>
         )}

        {/* Read-only current sign-law authority status */}
        <JurisdictionAuthorityStatus jurisdiction={jurisdiction} />

        {/* Source monitor health */}
        <section ref={node=>{workspaceSections.current.monitoring=node;}} tabIndex={-1} aria-label="Source monitoring workspace" className="scroll-mt-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-600"><SourceMonitorPanel key={jurisdiction.id} jurisdictionName={jurisdiction.name} jurisdictionId={jurisdiction.id} onNavigate={navigateWorkspace} /></section>

        <section ref={node=>{workspaceSections.current.requirements=node;}} tabIndex={-1} aria-label="Requirements workspace" className="scroll-mt-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-600">
        <JurisdictionRequirements key={jurisdiction.id} jurisdictionId={jurisdiction.id} onDocuments={sourceId => navigateWorkspace("documents", sourceId)} />
        <p className="mb-2 text-xs text-gray-600">Collected requirements are references. Use approved evidence and the current official documents to confirm what applies to the proposed sign.</p>
        {/* Key Requirements & Rules */}
        {(Object.keys(req).some(k => req[k] !== undefined && req[k] !== null && req[k] !== "") || jurisdiction.sqft_width_height_rules || jurisdiction.height_allowances || jurisdiction.setback_rules || jurisdiction.lighting_allowances) && (
          <div className="bg-red-50 rounded-lg p-3 border-l-4 border-l-red-400 space-y-3">
            <div>
              <p className="text-xs font-semibold text-red-800 mb-2">Collected profile notes · unverified summary</p>
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                {req.requires_permit !== undefined && (
                  <div className="flex min-w-0 items-start gap-1.5">
                    {req.requires_permit ? <CheckCircle className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-500" />}
                    <span className="min-w-0 break-words">Permit required: {req.requires_permit ? "Yes" : "No"}</span>
                  </div>
                )}
                {req.max_sign_area_sqft && <div className="min-w-0 break-words"><span className="font-medium text-gray-500">Max Area:</span> {req.max_sign_area_sqft} sq ft</div>}
                {req.max_height_ft && <div className="min-w-0 break-words"><span className="font-medium text-gray-500">Max Height:</span> {req.max_height_ft} ft</div>}
                {req.fee_range && <div className="min-w-0 break-words"><span className="font-medium text-gray-500">Fees:</span> {req.fee_range}</div>}
                {req.processing_time && <div className="min-w-0 break-words"><span className="font-medium text-gray-500">Processing:</span> {req.processing_time}</div>}
                {req.illumination_allowed !== undefined && (
                  <div className="flex min-w-0 items-start gap-1.5">
                    {req.illumination_allowed ? <CheckCircle className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-500" />}
                    <span className="min-w-0 break-words">Illumination allowed: {req.illumination_allowed ? "Yes" : "No"}</span>
                  </div>
                )}
                {req.electronic_signs_allowed !== undefined && (
                  <div className="flex min-w-0 items-start gap-1.5">
                    {req.electronic_signs_allowed ? <CheckCircle className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-red-500" />}
                    <span className="min-w-0 break-words">Electronic signs allowed: {req.electronic_signs_allowed ? "Yes" : "No"}</span>
                  </div>
                )}
                {req.setback_requirements && <div className="min-w-0 break-words sm:col-span-2"><span className="font-medium text-gray-500">Setbacks:</span> {req.setback_requirements}</div>}
              </div>
            </div>

            {(jurisdiction.sqft_width_height_rules || jurisdiction.height_allowances || jurisdiction.setback_rules || jurisdiction.lighting_allowances) && (
              <div className="border-t border-red-200 pt-3">
                <p className="text-xs font-semibold text-red-800 mb-2">Detailed Rules</p>
                <div className="space-y-2 text-xs text-gray-700">
                  {jurisdiction.sqft_width_height_rules && (
                    <div className="min-w-0 break-words leading-relaxed">
                      <span className="font-medium text-red-700">SQFT/Width/Height:</span> {jurisdiction.sqft_width_height_rules}
                    </div>
                  )}
                  {jurisdiction.height_allowances && (
                    <div className="min-w-0 break-words leading-relaxed">
                      <span className="font-medium text-red-700">Height Allowances:</span> {jurisdiction.height_allowances}
                    </div>
                  )}
                  {jurisdiction.setback_rules && (
                    <div className="min-w-0 break-words leading-relaxed">
                      <span className="font-medium text-red-700">Setback Rules:</span> {jurisdiction.setback_rules}
                    </div>
                  )}
                  {jurisdiction.lighting_allowances && (
                    <div className="min-w-0 break-words leading-relaxed">
                      <span className="font-medium text-red-700">Lighting Allowances:</span> {jurisdiction.lighting_allowances}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {!(Object.keys(req).some(k => req[k] !== undefined && req[k] !== null && req[k] !== "") || jurisdiction.sqft_width_height_rules || jurisdiction.height_allowances || jurisdiction.setback_rules || jurisdiction.lighting_allowances) && <div className="rounded-lg border bg-gray-50 p-3"><h3 className="text-sm font-semibold">Requirements not collected yet</h3><p className="mt-1 text-xs">Check the official forms and rules under Documents. Missing requirements do not mean a permit is unnecessary.</p></div>}
        </section>

        {/* Parent County Info */}
        {jurisdiction.parent_county?.name && (
          <div className="rounded-lg border-l-4 border-l-orange-400 bg-orange-50 p-3">
            <p className="mb-2 break-words text-xs font-semibold text-orange-800">Parent County: {jurisdiction.parent_county.name}</p>
            <div className="space-y-2 text-xs text-gray-700">
              {jurisdiction.parent_county.website_url && (
                <div className="min-w-0">
                  <a
                    href={jurisdiction.parent_county.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open parent county website for ${jurisdiction.parent_county.name} in a new tab`}
                    className="flex min-h-11 w-full items-center rounded-md border border-orange-200 bg-white px-3 py-2 text-sm text-blue-700 hover:bg-orange-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-xs"
                  >
                    <span className="min-w-0 break-all">{jurisdiction.parent_county.website_url}</span>
                  </a>
                </div>
              )}
              {jurisdiction.parent_county.contact_info?.phone && (
                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <span className="shrink-0 font-medium text-orange-700">Phone:</span>
                  <a href={`tel:${jurisdiction.parent_county.contact_info.phone}`} className="inline-flex min-h-11 min-w-0 items-center rounded-md px-2 text-sm font-medium text-blue-700 hover:bg-orange-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 sm:min-h-0 sm:px-0 sm:text-xs">{jurisdiction.parent_county.contact_info.phone}</a>
                </div>
              )}
              {jurisdiction.parent_county.contact_info?.email && (
                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <span className="shrink-0 font-medium text-orange-700">Email:</span>
                  <a href={`mailto:${jurisdiction.parent_county.contact_info.email}`} className="inline-flex min-h-11 min-w-0 items-center break-all rounded-md px-2 text-sm font-medium text-blue-700 hover:bg-orange-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 sm:min-h-0 sm:px-0 sm:text-xs">{jurisdiction.parent_county.contact_info.email}</a>
                </div>
              )}
            </div>
          </div>
        )}

        {currentUser?.role === "admin" && <OfficialSourceRescans key={jurisdiction.id} jurisdiction={jurisdiction} onUpdate={onUpdate} />}
        <ExternalPermittingReferrals key={jurisdiction.id} jurisdiction={jurisdiction} isAdmin={currentUser?.role === "admin"} onUpdate={onUpdate} disabled={isResearching || Boolean(downloadingDocId)} />

        {/* Documents */}
         <div ref={node=>{workspaceSections.current.documents=node;}} tabIndex={-1} aria-label="Documents workspace" className="scroll-mt-3 bg-green-50 rounded-lg p-3 border border-green-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-600">
           <p className="text-xs font-semibold text-green-800 mb-2">
             Documents ({jurisdiction.documents?.length || 0} collected links)
           </p>
          <DocumentRepositoryBrowser key={jurisdiction.id} jurisdictionId={jurisdiction.id} sourceRequest={sourceRequest} documents={jurisdiction.documents || []} onNavigate={navigateWorkspace} onOpenCollected={id => {
            if (expandedDoc === id) {
              const header = documentHeaderRefs.current.get(id);
              header?.focus({ preventScroll: true });
              header?.scrollIntoView({ block: "start", behavior: "auto" });
            } else {
              pendingDocNavigationRef.current = id;
              setExpandedDoc(id);
            }
          }} />
          <h3 className="mb-2 text-sm font-semibold text-green-900">Collected document search & PDF tools</h3>
          <div className="mb-3">
            <div className="relative">
              {docSearching && <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-500" />}
              {!docSearching && <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />}
              <Input
                ref={jurisdictionSearchInputRef}
                type="text"
                placeholder="Search collected document text and locality info..."
                aria-label="Search jurisdiction documents and information"
                aria-describedby={`jurisdiction-search-instructions-${jurisdiction.id}`}
                value={docSearchTerm}
                onChange={(e) => searchDocuments(e.target.value)}
                onFocus={() => { focusedJurisdictionSearchResultRef.current = null; }}
                onKeyDown={(event) => {
                  if (event.nativeEvent?.isComposing) return;
                  if (event.key === "ArrowDown" && searchResults.length > 0) {
                    event.preventDefault();
                    firstJurisdictionSearchResultRef.current?.focus();
                  } else if (event.key === "Escape" && docSearchTerm) {
                    event.preventDefault();
                    event.stopPropagation();
                    searchDocuments("");
                  }
                }}
                className="min-h-11 pl-9 text-sm"
              />
            </div>
            <p id={`jurisdiction-search-instructions-${jurisdiction.id}`} className="sr-only">
              Press Down Arrow to browse results. Use Up and Down arrows between results, Home and End for the first and last result, and Escape to return to and clear the search.
            </p>
            <p role="status" aria-live="polite" aria-atomic="true" className="mt-1 text-xs text-gray-600">
              {docSearching ? "Searching..." : docSearchTerm.trim()
                ? searchResults.length === 0
                  ? `No matches found for "${docSearchTerm}"`
                  : `${searchResults.length} result${searchResults.length === 1 ? "" : "s"} found for "${docSearchTerm}"`
                : jurisdictionSearchCleared ? "Search cleared" : ""}
            </p>
            {searchResults.length > 0 && (
              <div role="group" aria-label="Jurisdiction search results" aria-describedby={`jurisdiction-search-instructions-${jurisdiction.id}`} className="mt-2 max-h-40 overflow-y-auto space-y-1 bg-blue-50 p-2 rounded border border-blue-100">
                {searchResults.map((result, index) => (
                  <button
                    type="button"
                    ref={(node) => {
                      if (node) jurisdictionSearchResultRefs.current.set(index, node);
                      else jurisdictionSearchResultRefs.current.delete(index);
                      if (index === 0) firstJurisdictionSearchResultRef.current = node;
                    }}
                    key={`${result.type}-${result.id}`}
                    onFocus={() => { focusedJurisdictionSearchResultRef.current = `${result.type}-${result.id}`; }}
                    onBlur={(event) => {
                      if (event.relatedTarget && !event.currentTarget.parentElement?.contains(event.relatedTarget)) {
                        focusedJurisdictionSearchResultRef.current = null;
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.nativeEvent?.isComposing) return;
                      if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        jurisdictionSearchInputRef.current?.focus();
                        searchDocuments("");
                        return;
                      }
                      if (event.altKey || event.ctrlKey || event.metaKey) return;
                      const nextIndex = documentHeaderTargetIndex(event.key, index, searchResults.length);
                      if (nextIndex === null) return;
                      const nextResult = jurisdictionSearchResultRefs.current.get(nextIndex);
                      if (!nextResult) return;
                      event.preventDefault();
                      nextResult.focus({ preventScroll: true });
                      nextResult.scrollIntoView({ block: "nearest", behavior: "auto" });
                    }}
                    onClick={() => {
                      // The selected result is intentionally removed; its destination owns focus.
                      focusedJurisdictionSearchResultRef.current = null;
                      if (result.type === 'document') {
                        pendingDocNavigationRef.current = result.id;
                        setExpandedDoc(result.id);
                      } else if (result.type === 'jurisdiction') {
                        // Move focus before removing the selected search result button.
                        jurisdictionHeadingRef.current?.focus({ preventScroll: true });
                        jurisdictionHeadingRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
                      }
                      setDocSearchTerm("");
                      setSearchResults([]);
                    }}
                    className={`min-h-11 w-full rounded border p-3 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${result.type === 'jurisdiction' ? 'bg-purple-50 border-purple-200 hover:bg-purple-100' : 'bg-white border-blue-200 hover:bg-blue-100'}`}
                  >
                    <span className="block min-w-0 font-medium text-gray-800 [overflow-wrap:anywhere]">
                      {result.type === "document"
                        ? splitDocumentSearchMatches(result.title, docSearchTerm).map((part, index) =>
                            part.matched
                              ? <mark key={index} className="rounded-sm bg-yellow-200 px-0.5 font-semibold text-gray-900">{part.text}</mark>
                              : <span key={index}>{part.text}</span>
                          )
                        : result.title}
                    </span>
                    <span className="mt-0.5 block min-w-0 whitespace-pre-wrap text-[11px] leading-relaxed text-gray-600 [overflow-wrap:anywhere]">
                      {result.type === "document"
                        ? splitDocumentSearchMatches(result.snippet, docSearchTerm).map((part, index) =>
                            part.matched
                              ? <mark key={index} className="rounded-sm bg-yellow-200 px-0.5 font-semibold text-gray-900">{part.text}</mark>
                              : <span key={index}>{part.text}</span>
                          )
                        : result.snippet}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <p id={`document-header-navigation-${jurisdiction.id}`} className="sr-only">
              Use Up and Down arrows to move between document headings, Home and End for the first and last heading, and Enter or Space to expand a document.
            </p>
             {(jurisdiction.documents || []).map(doc => (
               <div key={doc.id} className={`border-l-4 rounded-lg overflow-hidden ${doc.source === 'ai_discovered' ? 'bg-purple-50 border-l-purple-400' : 'bg-amber-50 border-l-amber-400'}`}>
                 <button
                   type="button"
                   ref={(node) => {
                     if (node) documentHeaderRefs.current.set(doc.id, node);
                     else documentHeaderRefs.current.delete(doc.id);
                   }}
                   className="flex min-h-11 w-full scroll-mt-4 items-center gap-2 p-3 text-left transition-colors hover:bg-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-500"
                   onFocus={() => {
                     focusedDocumentHeaderRef.current = doc.id;
                     focusedDocumentContentRef.current = null;
                   }}
                   onBlur={() => {
                     if (focusedDocumentHeaderRef.current === doc.id) focusedDocumentHeaderRef.current = null;
                   }}
                   onClick={() => {
                     if (expandedDoc === doc.id) {
                       // If collapse removes the currently focused document content, move
                       // focus to the persistent heading before unmounting that content.
                       if (focusedDocumentContentRef.current === doc.id) {
                         focusedDocumentContentRef.current = null;
                         focusedMatchNavigationDocRef.current = null;
                         documentHeaderRefs.current.get(doc.id)?.focus({ preventScroll: true });
                       }
                       setExpandedDoc(null);
                     } else {
                       setExpandedDoc(doc.id);
                     }
                   }}
                   onKeyDown={(event) => {
                     if (event.altKey || event.ctrlKey || event.metaKey) return;
                     const documents = jurisdiction.documents || [];
                     const currentIndex = documents.findIndex(item => item.id === doc.id);
                     const nextIndex = documentHeaderTargetIndex(event.key, currentIndex, documents.length);
                     if (nextIndex === null) return;
                     const nextHeader = documentHeaderRefs.current.get(documents[nextIndex].id);
                     if (!nextHeader) return;
                     event.preventDefault();
                     nextHeader.focus({ preventScroll: true });
                     nextHeader.scrollIntoView({ block: "nearest", behavior: "auto" });
                   }}
                   aria-describedby={`document-header-navigation-${jurisdiction.id}`}
                   aria-expanded={expandedDoc === doc.id}
                   aria-controls={expandedDoc === doc.id ? `jurisdiction-document-${doc.id}` : undefined}
                   aria-label={`${expandedDoc === doc.id ? "Collapse" : "Expand"} ${doc.title || "document"}`}
                 >
                   <FileText className={`w-4 h-4 flex-shrink-0 ${doc.source === 'ai_discovered' ? 'text-purple-500' : 'text-amber-500'}`} />
                   <span className="min-w-0 flex-1">
                     <span className="block break-words text-xs font-medium text-gray-800">{doc.title}</span>
                     <span className="mt-0.5 flex flex-wrap items-center gap-2">
                       <span className={`text-[10px] capitalize px-1.5 py-0.5 rounded font-medium ${doc.source === 'ai_discovered' ? 'bg-purple-200 text-purple-700' : 'bg-amber-200 text-amber-700'}`}>{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}</span>
                       {doc.last_fetched && <span className="text-[10px] text-gray-500">{Number.isFinite(new Date(doc.last_fetched).getTime()) ? format(new Date(doc.last_fetched), "MM/dd/yy") : "Date not recorded"}</span>}
                       <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${doc.source === 'ai_discovered' ? 'bg-blue-200 text-blue-700' : 'bg-gray-200 text-gray-700'}`}>{doc.source === 'ai_discovered' ? 'AI' : 'Manual'}</span>
                     </span>
                   </span>
                   {expandedDoc === doc.id ? <ChevronUp className={`w-3.5 h-3.5 flex-shrink-0 ${doc.source === 'ai_discovered' ? 'text-purple-500' : 'text-amber-500'}`} /> : <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 ${doc.source === 'ai_discovered' ? 'text-purple-500' : 'text-amber-500'}`} />}
                 </button>
                {expandedDoc === doc.id && (
                  <div
                    id={`jurisdiction-document-${doc.id}`}
                    className="px-3 pb-3 border-t space-y-3"
                    style={{ background: doc.source === 'ai_discovered' ? '#f3e8ff' : '#fef3c7' }}
                    onFocusCapture={() => { focusedDocumentContentRef.current = doc.id; }}
                    onBlurCapture={(event) => {
                      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && focusedDocumentContentRef.current === doc.id) {
                        focusedDocumentContentRef.current = null;
                      }
                    }}
                  >
                    {/* Action Buttons */}
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      {(doc.file_url || doc.url) && (
                        <Button
                          size="sm"
                          onClick={() => downloadDocument(doc)}
                          disabled={downloadingDocId === doc.id}
                          className="min-h-11 w-full flex-1 gap-2 bg-blue-600 hover:bg-blue-700"
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
                        className="min-h-11 w-full flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700"
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
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            ref={expandedDoc === doc.id ? documentSearchInputRef : null}
                            type="text"
                            placeholder="Search within document..."
                            aria-label={`Search within ${doc.title || "document"}`}
                            value={expandedDocSearch[doc.id] || ""}
                            onChange={(e) => searchWithinDocument(doc.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.nativeEvent?.isComposing) return;
                              if (e.key === "Enter") {
                                e.preventDefault();
                                moveDocumentMatch(doc.id, e.shiftKey ? -1 : 1);
                              } else if (e.key === "Escape" && (expandedDocSearch[doc.id] || docSearchResults[doc.id])) {
                                e.preventDefault();
                                e.stopPropagation();
                                searchWithinDocument(doc.id, "");
                              }
                            }}
                            aria-describedby={docSearchResults[doc.id]?.matches > 1 ? `document-search-hint-${doc.id}` : undefined}
                            className="min-h-11 flex-1 text-sm"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => searchWithinDocument(doc.id, expandedDocSearch[doc.id])}
                            disabled={searchingDocId === doc.id || !expandedDocSearch[doc.id]?.trim()}
                            className="min-h-11 w-full gap-2 px-3 text-xs sm:w-auto"
                          >
                            {searchingDocId === doc.id ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                              </>
                            ) : (
                              <>
                                <Search className="h-4 w-4" />
                              </>
                            )}
                            <span className="sm:sr-only">Search</span>
                          </Button>
                          {(expandedDocSearch[doc.id] || docSearchResults[doc.id]) && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="min-h-11 w-full px-3 text-xs sm:w-auto"
                              onClick={() => {
                                searchWithinDocument(doc.id, "");
                                documentSearchInputRef.current?.focus();
                              }}
                              aria-label={`Clear search within ${doc.title || "document"}`}
                            >Clear</Button>
                          )}
                        </div>
                        {docSearchResults[doc.id]?.matches > 1 && (
                          <p id={`document-search-hint-${doc.id}`} className="text-xs text-gray-500">
                            Enter: next match · Shift+Enter: previous match · Escape: clear search
                          </p>
                        )}
                        
                        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                          {docSearchResults[doc.id]
                            ? docSearchResults[doc.id].matches > 0
                              ? `Match ${docSearchResults[doc.id].activeIndex + 1} of ${docSearchResults[doc.id].matches} in ${doc.title || "document"}, from ${docSearchResults[doc.id].source === "ai_summary" ? "AI summary" : "extracted document text"}`
                              : `No matches found in ${doc.title || "document"}`
                            : clearedDocSearchId === doc.id
                              ? `Search cleared in ${doc.title || "document"}`
                              : ""}
                        </p>
                        {docSearchResults[doc.id] && (
                          <div className="bg-white p-2 rounded border border-blue-200">
                            {docSearchResults[doc.id].matches === 0 ? (
                              <p className="text-xs text-gray-500">No matches found</p>
                            ) : (
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-blue-700">
                                    Match {docSearchResults[doc.id].activeIndex + 1} of {docSearchResults[doc.id].matches}
                                  </p>
                                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${docSearchResults[doc.id].source === "ai_summary" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-700"}`}>
                                    {docSearchResults[doc.id].source === "ai_summary" ? "AI summary" : "Extracted text"}
                                  </span>
                                </div>
                                <p className="min-w-0 whitespace-pre-wrap text-sm leading-relaxed text-gray-700 [overflow-wrap:anywhere]">
                                  {splitDocumentSearchMatches(
                                    documentMatchSnippet(
                                      documentSearchContent(doc, docSearchResults[doc.id].query),
                                      docSearchResults[doc.id].positions[docSearchResults[doc.id].activeIndex],
                                      docSearchResults[doc.id].query.length
                                    ),
                                    docSearchResults[doc.id].query
                                  ).map((part, index) => part.matched
                                    ? <mark key={index} className="rounded-sm bg-yellow-200 px-0.5 font-semibold text-gray-900">{part.text}</mark>
                                    : <span key={index}>{part.text}</span>
                                  )}
                                </p>
                                {docSearchResults[doc.id].matches > 1 && (
                                  <div className="flex flex-wrap gap-2 pt-1">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="min-h-11 flex-1 sm:flex-none"
                                      disabled={docSearchResults[doc.id].activeIndex === 0}
                                      onFocus={() => { focusedMatchNavigationDocRef.current = doc.id; }}
                                      onBlur={(event) => {
                                        if (event.relatedTarget && !event.currentTarget.parentElement?.contains(event.relatedTarget)) {
                                          focusedMatchNavigationDocRef.current = null;
                                        }
                                      }}
                                      onClick={() => moveDocumentMatch(doc.id, -1)}
                                    >Previous match</Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="min-h-11 flex-1 sm:flex-none"
                                      disabled={docSearchResults[doc.id].activeIndex === docSearchResults[doc.id].matches - 1}
                                      onFocus={() => { focusedMatchNavigationDocRef.current = doc.id; }}
                                      onBlur={(event) => {
                                        if (event.relatedTarget && !event.currentTarget.parentElement?.contains(event.relatedTarget)) {
                                          focusedMatchNavigationDocRef.current = null;
                                        }
                                      }}
                                      onClick={() => moveDocumentMatch(doc.id, 1)}
                                    >Next match</Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {doc.file_url ? (
                      isPDF(doc) ? (
                        <Button
                          ref={pdfOpenButtonRef}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSourceRequest(null);
                            setViewingPDF({ id: doc.id, jurisdictionId: jurisdiction.id });
                          }}
                          className="mt-3 min-h-11 h-auto w-full gap-2 whitespace-normal break-words bg-green-600 px-3 py-3 text-center font-semibold text-white hover:bg-green-700"
                        >
                          <FileText className="h-5 w-5 flex-shrink-0" />
                          <span className="min-w-0 break-words">Open {doc.title}</span>
                        </Button>
                      ) : (
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${doc.title || "document"} in a new tab`}
                          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-green-600 px-3 py-3 text-center text-sm font-semibold text-white hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
                        >
                          <FileText className="h-5 w-5 flex-shrink-0" />
                          <span className="min-w-0 break-words">Open {doc.title}</span>
                        </a>
                      )
                    ) : (
                      <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                        <p className="font-medium">No file available</p>
                        <p className="text-xs mt-1">No retained file URL is recorded. This may be an online source or an archive gap. Check the source link below.</p>
                      </div>
                    )}
                    
                    {doc.url && (
                      <div className="mt-2">
                        <p className="text-[10px] font-semibold text-gray-500 mb-1">Original Source</p>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open original source for ${doc.title || "document"} in a new tab`}
                          className="flex min-h-11 w-full items-center rounded border border-gray-200 bg-white p-3 text-xs text-blue-700 hover:bg-blue-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        >
                          <span className="min-w-0 break-all">{doc.url}</span>
                        </a>
                      </div>
                    )}
                    
                    {doc.ai_summary && (
                      <div className="min-w-0">
                        <p className="mb-1 text-[10px] font-semibold text-purple-600">AI Summary · unverified</p>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-700 [overflow-wrap:anywhere]">{doc.ai_summary}</p>
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

      {/* AI Permit Workflow Designer entry — preselects this jurisdiction */}
      <div className="border-t p-3 bg-violet-50 border-l-4 border-l-violet-400">
        <Button
          type="button"
          variant="outline"
          onClick={() => { setElectricalPlanningHandoff(null); setShowWorkflowDesigner(true); }}
          className="min-h-11 w-full gap-2 border-violet-300 bg-white text-violet-700 hover:bg-violet-100"
        >
          <Sparkles className="h-4 w-4" />
          Design Permit Workflow (AI)
        </Button>
        <p className="mt-1 text-[11px] text-violet-700">
          Generates a reviewable permit workflow from this jurisdiction's approved rules and source documents.
        </p>
      </div>

      {showWorkflowDesigner && (
        <PermitWorkflowDesigner
          isOpen={showWorkflowDesigner}
          onClose={() => { setShowWorkflowDesigner(false); setElectricalPlanningHandoff(null); }}
          electricalPlanningHandoff={electricalPlanningHandoff}
          onOpenSourceDocument={sourceId => {
            setShowWorkflowDesigner(false);
            setElectricalPlanningHandoff(null);
            navigateWorkspace("documents", sourceId);
          }}
          preselectedJurisdiction={{
            jurisdiction_name: jurisdiction.name,
            state: jurisdiction.state,
            jurisdiction_id: jurisdiction.id,
            locality_name: jurisdiction.name,
          }}
        />
      )}

      {/* Chat Interface */}
      <div className="border-t p-3 bg-cyan-50 border-l-4 border-l-cyan-400">
        <p className="text-xs font-semibold text-cyan-800 mb-2 flex items-center gap-1">
          <MessageSquare className="w-3 h-3" /> Ask AI about this jurisdiction
        </p>
        {(chatHistory.length > 0 || asking) && (
          <div
            className="mb-2 max-h-56 space-y-2 overflow-y-auto rounded-lg border bg-white p-2 sm:max-h-48"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            aria-label="Jurisdiction AI conversation"
          >
            {chatHistory.map((msg, i) => (
              <div key={i} className={`min-w-0 rounded p-2.5 text-sm leading-relaxed [overflow-wrap:anywhere] sm:text-xs ${msg.role === 'user' ? 'bg-blue-50 text-blue-800 sm:ml-4' : 'bg-purple-50 text-gray-800 sm:mr-4'}`}>
                <span className="font-semibold">{msg.role === 'user' ? 'You: ' : 'AI: '}</span>
                <span className="whitespace-pre-wrap">{msg.content}</span>
              </div>
            ))}
            {asking && (
              <div className="flex min-h-8 items-center gap-2 rounded bg-gray-50 px-2.5 text-xs text-gray-500" role="status" aria-atomic="true">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Thinking...
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && askQuestion()}
            placeholder="e.g. What is the max sign height? Are permits required?"
            aria-label="Ask AI about this jurisdiction"
            className="min-h-11 flex-1 text-sm"
          />
          <Button
            size="sm"
            onClick={askQuestion}
            disabled={asking || !question.trim()}
            className="min-h-11 w-full gap-2 bg-purple-600 px-4 hover:bg-purple-700 sm:w-auto"
            aria-label={asking ? "Asking AI about this jurisdiction" : "Ask AI about this jurisdiction"}
          >
            {asking && <Loader2 className="h-4 w-4 animate-spin" />}
            {asking ? "Asking..." : "Ask"}
          </Button>
        </div>
      </div>
      </>}
    </div>
  );
}