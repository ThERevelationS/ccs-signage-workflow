// Keep jurisdiction AI answers grounded without sending entire county ordinances
// (or repeating hundreds of thousands of characters) to each question.
const STOP_WORDS = new Set([
  "what", "when", "where", "which", "does", "have", "there", "about", "with",
  "from", "this", "that", "into", "their", "they", "them", "would", "should",
  "could", "please", "tell", "boone", "county", "kentucky", "sign", "signs",
  "the", "and", "for", "are", "can", "our", "how", "all", "any", "its",
]);

const normalized = (value) => String(value || "").toLowerCase()
  .replace(/free[\s-]?standing/g, "freestanding")
  .replace(/wall[\s-]?mounted/g, "wallmounted");

export function jurisdictionQuestionTerms(question) {
  return [...new Set(normalized(question).match(/[a-z0-9]{3,}/g) || [])]
    .filter(word => !STOP_WORDS.has(word))
    .slice(0, 12);
}

export function rankJurisdictionQuestionDocuments(documents, question) {
  const terms = jurisdictionQuestionTerms(question);
  const query = normalized(question).trim();
  return (documents || []).filter(doc => doc?.title && (doc.extracted_text || doc.ai_summary))
    .map(doc => {
      const title = normalized(doc.title);
      const summary = normalized(doc.ai_summary);
      const body = normalized(doc.extracted_text);
      let score = terms.reduce((sum, term) => sum +
        (title.includes(term) ? 16 : 0) +
        (summary.includes(term) ? 5 : 0) +
        (body.includes(term) ? 2 : 0), 0);
      if (query.length >= 6 && title.includes(query)) score += 25;
      if (query.length >= 6 && body.includes(query)) score += 5;
      return { doc, score };
    })
    .sort((a, b) => b.score - a.score
      || Number(Boolean(b.doc.extracted_text)) - Number(Boolean(a.doc.extracted_text))
      || String(a.doc.title).localeCompare(String(b.doc.title)));
}

// Gather several bounded passages around different matching terms, retaining
// surrounding original text but not pretending these are the complete ordinance.
function matchingExcerpts(value, terms, limit) {
  const text = String(value || "").replace(/\r/g, "");
  if (text.length <= limit) return text;
  const lower = text.toLowerCase();
  const locations = [];
  for (const term of terms) {
    const pattern = term === "freestanding" ? /free[\s-]?standing/g
      : term === "wallmounted" ? /wall[\s-]?mounted/g : null;
    if (pattern) {
      let match;
      while ((match = pattern.exec(lower)) && locations.length < 35) locations.push(match.index);
    } else {
      let from = 0;
      for (let count = 0; count < 3; count++) {
        const index = lower.indexOf(term, from);
        if (index < 0) break;
        locations.push(index);
        from = index + term.length;
      }
    }
  }
  const windows = [];
  for (const pos of [...new Set(locations)].sort((a, b) => a - b)) {
    const start = Math.max(0, pos - 190);
    const end = Math.min(text.length, pos + 510);
    if (windows.some(w => start <= w.end + 60)) {
      const prior = windows.find(w => start <= w.end + 60);
      if (prior) prior.end = Math.max(prior.end, end);
    } else {
      windows.push({ start, end });
    }
    if (windows.reduce((n, w) => n + w.end - w.start, 0) >= limit - 400) break;
  }
  if (!windows.length) return text.slice(0, limit) + "\n[Excerpt; complete source available at the cited URL]";
  const excerpts = [];
  let remaining = limit - 125;
  for (const window of windows) {
    if (remaining < 150) break;
    const portion = text.slice(window.start, Math.min(window.end, window.start + remaining));
    excerpts.push((window.start > 0 ? "…" : "") + portion + (window.end < text.length ? "…" : ""));
    remaining -= portion.length + 2;
  }
  return excerpts.join("\n") + "\n[Matching excerpts only; consult the complete official source]";
}

export function buildJurisdictionQuestionContext(documents, question, {
  maxChars = 16000, maxDocuments = 6,
} = {}) {
  const terms = jurisdictionQuestionTerms(question);
  const scored = rankJurisdictionQuestionDocuments(documents, question);
  const selected = scored.filter(item => item.score > 0);
  const candidates = (selected.length ? selected : scored).slice(0, maxDocuments);
  const chunks = [];
  let used = 0;
  for (const { doc } of candidates) {
    const label = `Document: ${doc.title}\nOfficial source: ${doc.url || "No source URL"}\n`;
    const available = Math.min(3900, maxChars - used - label.length - 160);
    if (available < 450) break;
    const summary = String(doc.ai_summary || "").slice(0, 450);
    const budget = Math.max(250, available - summary.length - 35);
    const body = matchingExcerpts(doc.extracted_text || summary, terms, budget);
    const chunk = label + (summary ? `Summary: ${summary}\n` : "") + `Source text excerpts:\n${body}`;
    if (used + chunk.length > maxChars) break;
    chunks.push(chunk);
    used += chunk.length + 2;
  }
  return chunks.length ? `Showing relevant excerpts from ${chunks.length} of ${scored.length} searchable sources. Other sources may contain additional applicable limits; for uncertain or parcel-specific requirements consult the linked official ordinance.\n\n${chunks.join("\n\n")}`
    : "No searchable official document text matched this question. Consult the listed official sources and the permitting office; do not infer missing requirements.";
}
