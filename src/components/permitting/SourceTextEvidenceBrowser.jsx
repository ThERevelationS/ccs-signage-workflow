import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const HASH = /^[a-f0-9]{64}$/i;
const PAGE_BATCH = 5;
const cleanText = value => String(value || '');

function matchingSnippets(pages, query) {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  const matches = [];
  for (const page of pages) {
    const text = page.text || '';
    const lower = text.toLowerCase();
    let position = 0;
    while (matches.length < 20) {
      const index = lower.indexOf(term, position);
      if (index < 0) break;
      matches.push({ physicalPage: page.page, offset: index, snippet: text.slice(Math.max(0, index - 65), Math.min(text.length, index + term.length + 85)) });
      position = index + Math.max(1, term.length);
    }
    if (matches.length >= 20) break;
  }
  return matches;
}

function validEvidence(data, source, start) {
  if (data?.success !== true || data.source_document_id !== source.id ||
      cleanText(data.source_sha256).toLowerCase() !== cleanText(source.file_hash_sha256).toLowerCase() ||
      data.archived_file_url !== source.archived_file_url ||
      !Number.isInteger(data.available_through) || !Number.isInteger(data.total_pages) ||
      data.available_through < 1 || data.available_through > data.total_pages ||
      !Array.isArray(data.pages) || data.pages.length > PAGE_BATCH) return false;
  const expectedLength = start > data.available_through ? 0 : Math.min(PAGE_BATCH, data.available_through - start + 1);
  if (data.pages.length !== expectedLength) return false;
  return data.pages.every((page, i) =>
    page.page === start + i && page.source_document_id === source.id &&
    cleanText(page.source_sha256).toLowerCase() === cleanText(source.file_hash_sha256).toLowerCase() &&
    HASH.test(page.text_sha256 || '') && typeof page.text === 'string' && page.text.length <= 50000 &&
    typeof page.truncated === 'boolean' && typeof page.needs_ocr_review === 'boolean'
  );
}

export function hasSavedPhysicalPageText(source) {
  return Boolean(source.id && HASH.test(cleanText(source.file_hash_sha256)) &&
    /^https?:\/\//i.test(source.archived_file_url || '') &&
    Number.isInteger(source.text_extraction_state?.pages_extracted) &&
    source.text_extraction_state.pages_extracted > 0);
}

// A read-only, exact-record view. Search is deliberately limited to the returned physical pages;
// it must never claim to search unread/uncommitted segments or other versions of the PDF.
export default function SourceTextEvidenceBrowser({ source }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [pageInput, setPageInput] = useState('1');
  const toggleRef = useRef(null);
  const requestVersion = useRef(0);
  const fingerprint = cleanText(source.file_hash_sha256);
  const available = hasSavedPhysicalPageText(source);

  useEffect(() => {
    if (!open || !available) return;
    let active = true;
    const version = ++requestVersion.current;
    setLoading(true);
    setResult(null);
    setError('');
    base44.functions.invoke('getPermittingSourceTextPages', {
      source_document_id: source.id,
      start_page: start,
      page_count: PAGE_BATCH,
    }).then(response => {
      if (!active || version !== requestVersion.current) return;
      const data = response?.data ?? response;
      if (!validEvidence(data, source, start)) throw Error('Source identity, archive version or physical-page evidence did not match.');
      setResult(data);
    }).catch(() => {
      if (active && version === requestVersion.current)
        setError('Saved page evidence is unavailable, changed or inaccessible. Retry the exact source; no other version will be substituted.');
    }).finally(() => {
      if (active && version === requestVersion.current) setLoading(false);
    });
    return () => { active = false; };
  }, [open, start, retry, available, source.id, source.archived_file_url, source.file_hash_sha256]);

  const toggle = () => {
    setOpen(value => !value);
    setStart(1);
    setPageInput('1');
    setQuery('');
    setResult(null);
    setError('');
    toggleRef.current?.focus({ preventScroll: true });
  };
  const changePage = next => {
    if (!result || !Number.isInteger(next) || next < 1 || next > result.available_through || next === start) return;
    setPageInput(String(next));
    setQuery('');
    setResult(null);
    setError('');
    setLoading(true);
    setStart(next);
    toggleRef.current?.focus({ preventScroll: true });
  };

  if (!available) return <p className="text-xs text-gray-600">Saved physical-page text is not available with a committed extraction cursor, retained URL and archive fingerprint. Collected snippets are not substituted.</p>;

  const pages = result?.pages || [];
  const matches = matchingSnippets(pages, query);
  const coveredEnd = pages.at(-1)?.page ?? start - 1;
  return <section aria-label={'Saved source text ' + source.id} className="min-w-0 space-y-2 rounded-md border bg-white p-3 [overflow-wrap:anywhere]">
    <Button ref={toggleRef} variant="outline" className="min-h-11 h-auto w-full justify-start whitespace-normal sm:w-auto" aria-expanded={open} onClick={toggle}>{open ? 'Close saved page text' : 'Inspect saved physical-page text'}</Button>
    {open && <>
      <p className="text-xs text-gray-700">Read-only extraction from source record {source.id}, archive SHA-256 {fingerprint.slice(0, 12)}…. Physical PDF pages, not printed page labels. Text does not prove current adopted authority, address applicability or source-byte authenticity.</p>
      {loading && <p role="status">Loading saved physical-page text…</p>}
      {error && <div role="alert" className="space-y-2"><p className="text-red-700">{error}</p><Button variant="outline" className="min-h-11" onClick={() => setRetry(v => v + 1)}>Retry saved text read</Button></div>}
      {!loading && result && <>
        <p role="status" className="text-xs">Physical pages {pages.length ? start + '–' + coveredEnd : 'not yet extracted'}; extracted through page {result.available_through} of {result.total_pages}. {result.complete_document_text ? 'Extraction marked complete (not an authority review).' : 'Partial text only; later pages or OCR may be missing.'}</p>
        {(result.preview_only || result.has_text_gaps || result.truncated_page_count || result.needs_ocr_page_count) && <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">Extraction warning: preview-only or incomplete text. {result.truncated_page_count || 0} recorded truncated page(s); {result.needs_ocr_page_count || 0} recorded OCR-review page(s). Missing text is not evidence that a requirement is absent.</p>}
        {pages.length > 0 && <>
          <Input aria-label={'Search loaded pages of ' + source.id} className="min-h-11" maxLength={120} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search only these loaded physical pages" />
          {query.trim() && <div aria-live="polite" className="space-y-1 text-xs"><p>{matches.length === 20 ? 'First 20 matches' : matches.length + ' match(es)'} across loaded pages {start}–{coveredEnd} only.</p>
            {matches.map((match, i) => <p key={match.physicalPage + ':' + match.offset + ':' + i} className="rounded bg-blue-50 p-2">Physical page {match.physicalPage}: …{match.snippet}…</p>)}
          </div>}
          {pages.map(page => <details key={page.page} className="rounded border p-2">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Physical page {page.page}{page.truncated ? ' · text truncated' : ''}{page.needs_ocr_review ? ' · OCR review needed' : ''}{!page.text.trim() ? ' · no extractable text' : ''}</summary>
            <p className="text-xs text-gray-600">Text fingerprint: {page.text_sha256.slice(0, 16)}… · {page.method || 'Unspecified parser'} (saved evidence; not a PDF byte verification).</p>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs font-sans">{page.text || 'No text extracted from this physical page.'}</pre>
          </details>)}
        </>}
        <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
          event.preventDefault();
          if (/^[1-9][0-9]*$/.test(pageInput)) changePage(Number(pageInput));
        }}>
          <label className="min-w-0 text-xs">Go to physical PDF page
            <Input aria-label="Go to physical PDF page" type="number" inputMode="numeric" min={1} max={result.available_through} step={1} required className="mt-1 min-h-11 w-28" value={pageInput} onChange={event => setPageInput(event.target.value)} />
          </label>
          <Button type="submit" variant="outline" className="min-h-11" disabled={!/^[1-9][0-9]*$/.test(pageInput) || !Number.isSafeInteger(Number(pageInput)) || Number(pageInput) > result.available_through || Number(pageInput) === start}>Load from page</Button>
          <p className="basis-full text-xs text-gray-600">Choose page 1–{result.available_through}. Loads up to five saved physical pages starting there; unextracted pages cannot be opened.</p>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="min-h-11" disabled={start <= 1} onClick={() => changePage(Math.max(1, start - PAGE_BATCH))}>Previous five pages</Button>
          <Button variant="outline" className="min-h-11" disabled={start + PAGE_BATCH > result.available_through} onClick={() => changePage(start + PAGE_BATCH)}>Next five pages</Button>
        </div>
      </>}
    </>}
  </section>;
}
