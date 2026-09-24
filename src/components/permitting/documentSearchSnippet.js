// Keep the matched term visible, preferring the text field that actually matched.
export function documentSearchSnippet(doc, searchTerm) {
  const summary = typeof doc.ai_summary === "string" ? doc.ai_summary : "";
  const extractedText = typeof doc.extracted_text === "string" ? doc.extracted_text : "";
  const term = searchTerm.toLowerCase();
  const text = [summary, extractedText].find(value => value.toLowerCase().includes(term)) || summary || extractedText;
  if (!text) return "";

  const matchIndex = text.toLowerCase().indexOf(term);
  const start = matchIndex < 0 ? 0 : Math.max(0, matchIndex - 45);
  const end = Math.min(text.length, start + Math.max(150, term.length + 90));
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}
