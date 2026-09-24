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
