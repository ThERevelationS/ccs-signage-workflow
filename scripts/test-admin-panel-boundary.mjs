import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/AdminSettings.jsx", "utf8");
const boundary = readFileSync("src/components/admin/AdminPanelContent.jsx", "utf8");

test("All 15 Admin pages and 11 nested panels retain their TabsContent semantics through error boundaries", () => {
  const pages = [...page.matchAll(/<AdminPanelContent value="([^"]+)"/g)].map(match => match[1]);
  const closed = page.match(/<\/AdminPanelContent>/g) || [];
  assert.equal(pages.length, 26);
  assert.equal(closed.length, 26);
  assert.equal(new Set(pages).size, 26);
  assert.doesNotMatch(page, /<TabsContent/);
  assert.match(boundary, /<TabsContent value=\{value\} \{\.\.\.props\}>/);
  assert.match(boundary, /<AdminPanelErrorBoundary label=\{label\}>\{children\}<\/AdminPanelErrorBoundary>/);
});

test("Panel boundary offers an accessible manual-only retry without exposing raw errors", () => {
  assert.match(boundary, /static getDerivedStateFromError\(\)/);
  assert.match(boundary, /role="alert"/);
  assert.match(boundary, /Retry panel/);
  assert.match(boundary, /retryVersion: retryVersion \+ 1/);
  assert.match(boundary, /<Fragment key=\{this\.state\.retryVersion\}>/);
  assert.doesNotMatch(boundary, /this\.state\.error\.message|error\.stack|JSON\.stringify\(error\)/);
  assert.match(boundary, /Other Admin sections are still available/);
  assert.match(boundary, /No changes were retried automatically/);
});
