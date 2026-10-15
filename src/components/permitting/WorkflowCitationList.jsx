import { Button } from "@/components/ui/button";

export default function WorkflowCitationList({ citations = [], onOpenSourceDocument }) {
  if (!Array.isArray(citations) || citations.length === 0) return null;
  return <div className="mt-2 rounded border border-gray-100 bg-gray-50 p-2">
    <p className="mb-1 font-semibold text-gray-500">Citations ({citations.length})</p>
    {citations.map((citation, index) => {
      const sourceId = typeof citation?.source_document_id === "string" ? citation.source_document_id.trim() : "";
      return <div key={index} className="min-w-0 break-words text-[11px] text-gray-600">
        {citation.section_or_page && <span className="font-medium">{citation.section_or_page}: </span>}
        {citation.excerpt && <span className="text-gray-500">"{citation.excerpt.slice(0, 120)}{citation.excerpt.length > 120 ? "…" : ""}"</span>}
        {sourceId && <>
          <span className="text-gray-400"> [{sourceId.slice(0, 8)}]</span>
          {typeof onOpenSourceDocument === "function" && <Button type="button" variant="outline" className="mt-1 min-h-11 h-auto whitespace-normal text-xs" onClick={() => onOpenSourceDocument(sourceId)}>Open saved source details</Button>}
        </>}
      </div>;
    })}
  </div>;
}
