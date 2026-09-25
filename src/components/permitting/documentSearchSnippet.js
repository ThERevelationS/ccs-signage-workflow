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

// Split plain text into safe React-renderable segments; never interpret search input as HTML or regex.
export function splitDocumentSearchMatches(text, searchTerm) {
  const value = typeof text === "string" ? text : "";
  const term = typeof searchTerm === "string" ? searchTerm : "";
  if (!value || !term.trim()) return [{ text: value, matched: false }];

  const lowerValue = value.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const segments = [];
  let cursor = 0;
  let matchIndex = lowerValue.indexOf(lowerTerm);

  while (matchIndex !== -1) {
    if (matchIndex > cursor) segments.push({ text: value.slice(cursor, matchIndex), matched: false });
    segments.push({ text: value.slice(matchIndex, matchIndex + term.length), matched: true });
    cursor = matchIndex + term.length;
    matchIndex = lowerValue.indexOf(lowerTerm, cursor);
  }

  if (cursor < value.length) segments.push({ text: value.slice(cursor), matched: false });
  return segments.length ? segments : [{ text: value, matched: false }];
}

// Choose the text that contains the query so an AI-summary-only match remains searchable
// even when the document also has extracted text.
export function documentSearchContent(doc, searchTerm) {
  const extractedText = typeof doc?.extracted_text === "string" ? doc.extracted_text : "";
  const summary = typeof doc?.ai_summary === "string" ? doc.ai_summary : "";
  const term = typeof searchTerm === "string" ? searchTerm.toLowerCase() : "";
  if (term && extractedText.toLowerCase().includes(term)) return extractedText;
  if (term && summary.toLowerCase().includes(term)) return summary;
  return extractedText || summary;
}

// Retain match offsets rather than a potentially large array of copied excerpts.
export function findDocumentMatchPositions(content, searchTerm) {
  if (typeof content !== "string" || typeof searchTerm !== "string" || !searchTerm.trim()) return [];
  const text = content.toLowerCase();
  const term = searchTerm.toLowerCase();
  const positions = [];
  let index = text.indexOf(term);
  while (index !== -1) {
    positions.push(index);
    index = text.indexOf(term, index + 1);
  }
  return positions;
}

export function documentMatchSnippet(content, position, matchLength) {
  if (typeof content !== "string" || position < 0 || position >= content.length) return "";
  const start = Math.max(0, position - 100);
  const end = Math.min(content.length, position + matchLength + 100);
  return `${start > 0 ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`;
}

// Keyboard and button navigation share the same bounds; do not wrap unexpectedly.
export function stepDocumentMatchIndex(index, matchCount, direction) {
  if (matchCount <= 0) return 0;
  return Math.max(0, Math.min(matchCount - 1, index + direction));
}
