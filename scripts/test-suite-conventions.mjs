// scripts/test-suite-conventions.mjs — audits sibling scripts/test-*.mjs files
// against the house test conventions:
//   (a) filename is test-<kebab-lower>.mjs
//   (b) the file has a `PASS ` print path (a string/template literal starting
//       with PASS plus a console.*/process.stdout write call)
//   (c) a direct .ts/.tsx/.mts/.cts/.jsx source import is only allowed when the
//       file bundles with esbuild first (mentions `esbuild` import/exec)
//   (d) node-run files reference no localStorage/document/window globals
// A small char-state tokenizer separates real code from strings, template
// literals, comments and regexes, so e.g. an `import ... from "x.jsx"` inside a
// writeFile fixture string or a `window\.x` inside an assert regex does not
// trip checks (c)/(d).
// Output: per-file status lines, then PASS suite-conventions or the violation
// list. Exit code 1 when any file violates.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const S_CODE = 0, S_STR = 1, S_TPL = 2, S_LCOM = 3, S_BCOM = 4, S_RX = 5;
const WORD = /[\w$]/;
const REGEX_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'case', 'do', 'else', 'yield', 'await',
]);

function scanSource(src) {
  const n = src.length;
  const state = new Uint8Array(n);
  const chars = src.split('');
  const strings = []; // { kind: 'str' | 'tpl', start, content }
  const interpDepth = []; // brace-depth stack for ${ } inside templates
  const blank = (j) => { if (chars[j] !== '\n') chars[j] = ' '; };
  const markRange = (a, b, s) => { for (let j = a; j < b; j++) { state[j] = s; blank(j); } };

  let mode = 'code';
  let tokStart = 0;
  let rxClass = false;
  let lastChar = '';   // last significant (non-space) code char, incl. word ends
  let lastWord = '';   // last completed identifier/keyword/number
  let curWord = '';
  let i = 0;

  const flushWord = () => {
    if (curWord) { lastWord = curWord; lastChar = curWord[curWord.length - 1]; curWord = ''; }
  };
  // At a `/`, the previous completed token decides regex vs division: after an
  // operand (identifier, number, `)`, `]`, `.`) or a non-keyword word it is
  // division; after operators/punctuation or keywords like `return` it is a
  // regex literal.
  const mayBeRegex = () => {
    if (curWord) return REGEX_KEYWORDS.has(curWord); // `return/re/`, `await/re/`
    if (!lastChar) return true; // file start / only whitespace so far
    if (WORD.test(lastChar)) return REGEX_KEYWORDS.has(lastWord); // `foo /` div, `return /` regex
    if (lastChar === ')' || lastChar === ']' || lastChar === '.') return false;
    return true; // operators, punctuation, braces
  };

  while (i < n) {
    const c = src[i];
    if (mode === 'code') {
      if (/\s/.test(c)) { flushWord(); i++; continue; }
      if (c === '/' && src[i + 1] === '/') {
        mode = 'lcom'; markRange(i, i + 2, S_LCOM); i += 2; flushWord(); continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        mode = 'bcom'; markRange(i, i + 2, S_BCOM); i += 2; flushWord(); continue;
      }
      if (c === '/' && mayBeRegex()) {
        mode = 'regex'; rxClass = false; state[i] = S_RX; blank(i); i++; flushWord(); continue;
      }
      if (c === "'" || c === '"') {
        tokStart = i; mode = 'str'; state[i] = S_STR; blank(i); i++; flushWord(); continue;
      }
      if (c === '`') {
        tokStart = i; mode = 'tpl'; state[i] = S_TPL; blank(i); i++; flushWord(); continue;
      }
      if (c === '{' && interpDepth.length) interpDepth[interpDepth.length - 1]++;
      if (c === '}' && interpDepth.length && interpDepth[interpDepth.length - 1] === 0) {
        interpDepth.pop(); mode = 'tpl'; tokStart = i + 1; i++; lastChar = c; lastWord = ''; continue;
      }
      if (c === '}' && interpDepth.length) interpDepth[interpDepth.length - 1]--;
      if (WORD.test(c)) { curWord += c; } else { flushWord(); lastChar = c; }
      i++; continue;
    }
    if (mode === 'str') {
      if (c === '\\') { state[i] = S_STR; state[i + 1] = S_STR; blank(i); blank(i + 1); i += 2; continue; }
      const q = src[tokStart];
      if (c === q || c === '\n') {
        state[i] = S_STR; if (c !== '\n') blank(i);
        strings.push({ kind: 'str', start: tokStart, content: src.slice(tokStart + 1, i) });
        mode = 'code'; lastChar = "'"; lastWord = ''; i++; continue;
      }
      state[i] = S_STR; blank(i); i++; continue;
    }
    if (mode === 'tpl') {
      if (c === '\\') { state[i] = S_TPL; state[i + 1] = S_TPL; blank(i); blank(i + 1); i += 2; continue; }
      if (c === '`') {
        state[i] = S_TPL; blank(i);
        strings.push({ kind: 'tpl', start: tokStart, content: src.slice(tokStart + 1, i) });
        mode = 'code'; lastChar = "'"; lastWord = ''; i++; continue;
      }
      if (c === '$' && src[i + 1] === '{') {
        state[i] = S_TPL; state[i + 1] = S_TPL; blank(i); blank(i + 1);
        strings.push({ kind: 'tpl', start: tokStart, content: src.slice(tokStart + (src[tokStart] === '`' ? 1 : 0), i) });
        interpDepth.push(0); mode = 'code'; i += 2; lastChar = '{'; lastWord = ''; continue;
      }
      state[i] = S_TPL; blank(i); i++; continue;
    }
    if (mode === 'lcom') {
      if (c === '\n') { mode = 'code'; i++; continue; }
      state[i] = S_LCOM; blank(i); i++; continue;
    }
    if (mode === 'bcom') {
      if (c === '*' && src[i + 1] === '/') {
        state[i] = S_BCOM; state[i + 1] = S_BCOM; blank(i); blank(i + 1);
        mode = 'code'; i += 2; lastChar = '*'; continue;
      }
      state[i] = S_BCOM; blank(i); i++; continue;
    }
    if (mode === 'regex') {
      if (c === '\\') { state[i] = S_RX; state[i + 1] = S_RX; blank(i); blank(i + 1); i += 2; continue; }
      if (c === '[') rxClass = true;
      else if (c === ']') rxClass = false;
      if (c === '/' && !rxClass) {
        state[i] = S_RX; blank(i); mode = 'code'; lastChar = ')'; lastWord = ''; i++; continue;
      }
      if (c === '\n') { mode = 'code'; lastChar = ')'; i++; continue; } // unterminated — recover
      state[i] = S_RX; blank(i); i++; continue;
    }
  }
  return { codeText: chars.join(''), state, strings };
}

function lineIndex(src) {
  const starts = [0];
  for (let j = 0; j < src.length; j++) if (src[j] === '\n') starts.push(j + 1);
  return (pos) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
}

const NAME_RE = /^test-[a-z0-9]+(-[a-z0-9]+)*\.mjs$/;
const SOURCE_EXT_RE = /\.(?:tsx?|mts|cts|jsx)(?:[?#].*)?$/i;
const IMPORT_CTX_RE = /(?:\bfrom|\bimport\s*\(|\brequire\s*\(|\bimport)\s*$/;
const PRINT_RE = /\bconsole\s*\.\s*(?:log|info|warn|error|debug)\s*\(|\bprocess\s*\.\s*(?:stdout|stderr)\s*\.\s*write\s*\(/;
const PASS_RE = /^PASS(?:\s|$)/;
const DOM_RE = /\b(?:localStorage|window|document)\b/g;
const DOM_SHIM_RE = /\bglobalThis\s*\.\s*(?:window|document|localStorage)\b/;

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here)
  .filter((f) => f.startsWith('test-') && f.endsWith('.mjs'))
  .sort();

const flagged = [];
let okCount = 0;

for (const name of files) {
  const src = readFileSync(join(here, name), 'utf8');
  const { codeText, strings } = scanSource(src);
  const lineOf = lineIndex(src);
  const violations = [];
  const tags = [];

  // (a) filename
  if (!NAME_RE.test(name)) violations.push(`filename '${name}' is not test-<kebab-lower>.mjs`);

  // (b) PASS print path
  const hasPassLiteral = strings.some((s) => PASS_RE.test(s.content));
  const hasPrintCall = PRINT_RE.test(codeText);
  if (!(hasPassLiteral && hasPrintCall)) {
    const why = !hasPrintCall ? 'no console.*/stdout print call' : "no 'PASS <name>' literal";
    violations.push(`no PASS print path (${why})`);
  }

  // (c) direct .ts/.tsx/.jsx import without an esbuild bundling step
  const directImports = [];
  for (const s of strings) {
    const spec = s.content.trim();
    if (!SOURCE_EXT_RE.test(spec)) continue;
    const before = codeText.slice(0, s.start).replace(/\s+$/, '');
    if (IMPORT_CTX_RE.test(before)) directImports.push(`${spec}@L${lineOf(s.start)}`);
  }
  const usesEsbuild = /\besbuild\b/.test(src);
  if (directImports.length && !usesEsbuild) {
    violations.push(`direct source import w/o esbuild bundle: ${[...new Set(directImports)].join(', ')}`);
  }

  // (d) DOM globals in node-run code
  const domHits = [];
  for (const m of codeText.matchAll(DOM_RE)) domHits.push(`${m[0]}@L${lineOf(m.index)}`);
  if (domHits.length) {
    const counts = {};
    for (const h of domHits) { const id = h.split('@')[0]; counts[id] = (counts[id] || 0) + 1; }
    const detail = Object.entries(counts).map(([id, n]) => `${id}×${n}`).join(' ');
    violations.push(`DOM global refs in node-run file: ${detail} (${domHits.slice(0, 4).join(', ')}${domHits.length > 4 ? ',…' : ''})`);
  }

  // exempt-looking annotations (report only — still counted as violations)
  if (/\bnode:test\b/.test(src)) tags.push('node:test runner');
  if (/-browser\.mjs$/.test(name) || /\b(?:chromium|playwright|puppeteer|selenium|webdriver)\b/.test(src)) tags.push('browser-harness');
  if (DOM_SHIM_RE.test(codeText)) tags.push('globalThis dom-shim');
  if (!hasPassLiteral && hasPrintCall && strings.some((s) => /\bpassed\b/i.test(s.content))) tags.push("freeform 'passed' print");

  if (violations.length) {
    flagged.push({ name, violations, tags });
    console.log(`VIOLATION ${name} :: ${violations.join(' ; ')}${tags.length ? `  [${tags.join(' | ')}]` : ''}`);
  } else {
    okCount++;
    console.log(`ok        ${name}`);
  }
}

console.log('');
console.log(`audited ${files.length} test-*.mjs files — ${okCount} ok, ${flagged.length} flagged`);
if (flagged.length) {
  const hard = flagged.filter((f) => !f.tags.length);
  const exemptish = flagged.filter((f) => f.tags.length);
  console.log(`violations: ${flagged.length} file(s) — ${hard.length} untagged, ${exemptish.length} exempt-looking`);
  for (const f of flagged) {
    console.log(`  ${f.name}${f.tags.length ? ` [${f.tags.join(' | ')}]` : ''}`);
    for (const v of f.violations) console.log(`    - ${v}`);
  }
  console.log('FAIL suite-conventions');
  process.exitCode = 1;
} else {
  console.log('PASS suite-conventions');
}
