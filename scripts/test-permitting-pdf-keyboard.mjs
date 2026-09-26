import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

// Source-linked regressions for the PDF open/Back flow. No browser or live records needed.
const panel = readFileSync(new URL("../src/components/permitting/JurisdictionDetailPanel.jsx", import.meta.url), "utf8");
const viewer = readFileSync(new URL("../src/components/permitting/PDFViewer.jsx", import.meta.url), "utf8");
const button = readFileSync(new URL("../src/components/ui/button.jsx", import.meta.url), "utf8");

function sourceBlock(source, expression, description) {
  const match = source.match(expression);
  assert.ok(match, description + " is missing");
  return match[1];
}

const openPDF = new Function("e", "setViewingPDF", "doc", "jurisdiction", sourceBlock(
  panel,
  /<Button\s+ref=\{pdfOpenButtonRef\}\s+onClick=\{\(e\) => \{([\s\S]*?)\}\}/,
  "PDF Open handler"
));
const backFromPDF = new Function("pendingPDFReturnFocusRef", "viewingPDF", "setViewingPDF", sourceBlock(
  panel,
  /<PDFViewer\b[\s\S]*?\bonBack=\{\(\) => \{([\s\S]*?)\}\}\s*\/>/,
  "PDF Back handler"
));
const restoreFocus = new Function(
  "pendingPDFReturnFocusRef", "viewingPDF", "jurisdiction", "expandedDoc",
  "pdfOpenButtonRef", "documentHeaderRefs", "jurisdictionSearchInputRef", "jurisdictionHeadingRef",
  sourceBlock(
    panel,
    /\/\/ Returning from the PDF viewer[\s\S]*?useLayoutEffect\(\(\) => \{([\s\S]*?)\}, \[viewingPDF, expandedDoc, jurisdiction.id, jurisdiction.documents\]\);/,
    "PDF Back focus effect"
  )
);

function focusScenario({
  pending = { id: "doc-1", jurisdictionId: "jur-1" },
  currentViewer = null,
  jurisdictionId = "jur-1",
  expandedDoc = "doc-1",
  hasOpenButton = true,
  hasHeader = true,
  hasSearchInput = true,
  hasHeading = true,
} = {}) {
  const events = [];
  const control = name => ({
    focus: () => events.push("focus:" + name),
    scrollIntoView: () => events.push("scroll:" + name),
  });
  const request = { current: pending };
  const open = hasOpenButton ? control("open") : null;
  const header = hasHeader ? control("header") : null;
  const input = hasSearchInput ? control("search") : null;
  const heading = hasHeading ? control("heading") : null;
  const run = () => restoreFocus(
    request, currentViewer, { id: jurisdictionId, documents: [] }, expandedDoc,
    { current: open }, { current: new Map(header ? [["doc-1", header]] : []) },
    { current: input }, { current: heading }
  );
  run();
  return { events, request, run };
}

test("PDF Open and Back remain native keyboard-activatable buttons", () => {
  parse(panel, { sourceType: "module", plugins: ["jsx"] });
  parse(viewer, { sourceType: "module", plugins: ["jsx"] });
  assert.match(button, /React\.forwardRef/);
  assert.match(button, /asChild \? Slot : "button"/);
  assert.match(viewer, /<Button[\s\S]*?onClick=\{onBack\}[\s\S]*?>\s*<ChevronLeft/);
  assert.match(panel, /<Button\s+ref=\{pdfOpenButtonRef\}/);
});

test("opening a PDF stores only its document and jurisdiction identity", () => {
  let selected;
  let stopped = false;
  openPDF({ stopPropagation: () => { stopped = true; } }, value => { selected = value; },
    { id: "doc-1" }, { id: "jur-1" });
  assert.equal(stopped, true);
  assert.deepEqual(selected, { id: "doc-1", jurisdictionId: "jur-1" });
});

test("manual Back queues focus for the original document and closes the viewer", () => {
  const request = { current: null };
  let nextViewer = { id: "doc-1" };
  backFromPDF(request, { id: "doc-1", jurisdictionId: "jur-1" }, value => { nextViewer = value; });
  assert.deepEqual(request.current, { id: "doc-1", jurisdictionId: "jur-1" });
  assert.equal(nextViewer, null);
  assert.match(panel, /<PDFViewer\b[\s\S]*?onBack=/);
});

test("returning from Back focuses and scrolls to the original Open button exactly once", () => {
  const state = focusScenario();
  assert.deepEqual(state.events, ["focus:open", "scroll:open"]);
  assert.equal(state.request.current, null);
  state.run();
  assert.deepEqual(state.events, ["focus:open", "scroll:open"]);
});

test("collapsed or missing Open button falls back through header, search and heading", () => {
  assert.deepEqual(focusScenario({ expandedDoc: null }).events, ["focus:header", "scroll:header"]);
  assert.deepEqual(focusScenario({ hasOpenButton: false }).events, ["focus:header", "scroll:header"]);
  assert.deepEqual(focusScenario({ hasOpenButton: false, hasHeader: false }).events, ["focus:search", "scroll:search"]);
  assert.deepEqual(focusScenario({ hasOpenButton: false, hasHeader: false, hasSearchInput: false }).events,
    ["focus:heading", "scroll:heading"]);
});

test("active viewer and stale jurisdiction must never steal focus", () => {
  const active = focusScenario({ currentViewer: { id: "doc-1" } });
  assert.deepEqual(active.events, []);
  assert.deepEqual(active.request.current, { id: "doc-1", jurisdictionId: "jur-1" });
  const stale = focusScenario({ jurisdictionId: "jur-2" });
  assert.deepEqual(stale.events, []);
  assert.equal(stale.request.current, null);
  assert.deepEqual(focusScenario({ pending: null }).events, []);
  assert.match(panel, /pendingPDFReturnFocusRef\.current = null;\s*focusedDocumentContentRef\.current = null;/);
});

const isPDF = new Function("doc", sourceBlock(
  panel,
  /  const isPDF = \(doc\) => \{([\s\S]*?)\n  \};/,
  "PDF eligibility check"
));
const currentPDF = new Function("viewingPDF", "jurisdiction", "isPDF", "return (" + sourceBlock(
  panel,
  /  const liveViewingPDF = ([\s\S]*?);\n\n  useLayoutEffect\(\(\) => \{/,
  "live PDF resolution"
) + ");");
const closeInvalidPDF = new Function(
  "viewingPDF", "liveViewingPDF", "setViewingPDF", "documentHeaderRefs",
  "jurisdictionSearchInputRef", "jurisdictionHeadingRef",
  sourceBlock(
    panel,
    /  const liveViewingPDF = [\s\S]*?;\n\n  useLayoutEffect\(\(\) => \{([\s\S]*?)\}, \[viewingPDF, liveViewingPDF\]\);/,
    "stale PDF invalidation effect"
  )
);

test("active PDF resolves replacements from current document data, never a stale snapshot", () => {
  const selection = { id: "doc-1", jurisdictionId: "jur-1" };
  const original = { id: "doc-1", title: "Original PDF", file_url: "https://example.org/old.pdf" };
  const updated = { id: "doc-1", title: "Updated PDF", file_url: "https://example.org/new.pdf" };
  const oldJurisdiction = { id: "jur-1", documents: [original] };
  const refreshed = { ...oldJurisdiction, documents: [updated] };
  assert.equal(currentPDF(selection, oldJurisdiction, isPDF), original);
  assert.equal(currentPDF(selection, refreshed, isPDF), updated);
  assert.equal(currentPDF(selection, refreshed, isPDF).file_url, updated.file_url);
  assert.equal(currentPDF(selection, refreshed, isPDF).title, updated.title);
  assert.match(panel, /<PDFViewer key=\{liveViewingPDF\.file_url\} fileUrl=\{liveViewingPDF\.file_url\} fileName=\{liveViewingPDF\.title\}/);
});

test("removed, inaccessible or non-PDF documents cannot remain open", () => {
  const selection = { id: "doc-1", jurisdictionId: "jur-1" };
  const jurisdiction = { id: "jur-1", documents: [{ id: "doc-1", file_url: "https://example.org/sign.pdf" }] };
  assert.equal(currentPDF(selection, { ...jurisdiction, documents: [] }, isPDF) ?? null, null);
  assert.equal(currentPDF(selection, { ...jurisdiction, documents: [{ id: "doc-2", file_url: "https://example.org/sign.pdf" }] }, isPDF) ?? null, null);
  assert.equal(currentPDF(selection, { ...jurisdiction, documents: [{ id: "doc-1", file_url: null, title: "PDF" }] }, isPDF) ?? null, null);
  assert.equal(currentPDF(selection, { ...jurisdiction, documents: [{ id: "doc-1", file_url: "https://example.org/sign.jpg", title: "Sign image" }] }, isPDF) ?? null, null);
  assert.equal(currentPDF(selection, { ...jurisdiction, id: "jur-2" }, isPDF) ?? null, null);
  assert.equal(currentPDF(null, jurisdiction, isPDF) ?? null, null);
});

function invalidationScenario({ viewingPDF = { id: "doc-1" }, liveViewingPDF = null,
  header = true, search = true, heading = true } = {}) {
  const events = [];
  const control = name => ({ focus: options => events.push(["focus", name, options]) });
  const documentHeaderRefs = { current: new Map(header ? [["doc-1", control("header")]] : []) };
  const jurisdictionSearchInputRef = { current: search ? control("search") : null };
  const jurisdictionHeadingRef = { current: heading ? control("heading") : null };
  closeInvalidPDF(viewingPDF, liveViewingPDF, next => events.push(["close", next]),
    documentHeaderRefs, jurisdictionSearchInputRef, jurisdictionHeadingRef);
  return events;
}

test("invalidated viewer closes and restores keyboard focus to a surviving control", () => {
  const header = invalidationScenario();
  assert.deepEqual(header, [["close", null], ["focus", "header", { preventScroll: true }]]);
  assert.deepEqual(invalidationScenario({ header: false }), [
    ["close", null], ["focus", "search", { preventScroll: true }]
  ]);
  assert.deepEqual(invalidationScenario({ header: false, search: false }), [
    ["close", null], ["focus", "heading", { preventScroll: true }]
  ]);
  assert.deepEqual(invalidationScenario({ header: false, search: false, heading: false }), [
    ["close", null]
  ]);
  assert.deepEqual(invalidationScenario({ viewingPDF: null }), []);
  assert.deepEqual(invalidationScenario({ liveViewingPDF: { id: "doc-1" } }), []);
});

