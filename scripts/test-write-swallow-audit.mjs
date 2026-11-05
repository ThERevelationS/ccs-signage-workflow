#!/usr/bin/env node
// L-02 — silent-swallow sweep on WRITE paths.
//
// Scans base44/functions/<fn>/*.ts and base44/shared/*.{ts,mjs} for
// `.catch(() => ...)` silent-catch variants and classifies every hit:
//
//   read-load      — promise chain is read-only (filter/list/get/loadAllEntityRows/
//                    pagedEntityRows/find*/search*/count/…). Acceptable, counted.
//   write-swallow  — chain contains a write op (create/update/delete/updateMany/
//                    *IfUnchanged/createFoundationRecordWithRecovery/ensure*/
//                    persist*/save*/record*/import*/backfill*/mark*/…). Each MUST
//                    be justified by (a) a *_warning field surfaced in the
//                    enclosing response build, or (b) an adjacent comment
//                    justifying silence. Unjustified → VIOLATION.
//   side-effect    — chain is a non-entity side effect (send*/notify*/dispatch*/
//                    publish*/log*/trace*/report*/audit*/invoke(write-ish fn)).
//                    Reported for review; does not fail the audit.
//   handled        — `.catch(() => { ... })` block that visibly records the
//                    failure (warn/log/push/flag/…). Not a swallow.
//   non-entity     — everything else (req.json/auth.me/fetch parse/locks/etc).
//                    Info only.
//
// Usage: node scripts/test-write-swallow-audit.mjs [--all] [--context N]
//   --all        print every hit line (default prints write-swallow +
//                side-effect hits and per-file rollups for the rest)
//   --context N  print N lines of source around each VIOLATION (default 0)
//
// Prints `PASS write-swallow-audit` iff zero write-swallow violations.

import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FN_DIR = join(ROOT, 'base44', 'functions');
const SHARED_DIR = join(ROOT, 'base44', 'shared');

const argv = process.argv.slice(2);
const SHOW_ALL = argv.includes('--all');
const CTX_IDX = argv.indexOf('--context');
const CONTEXT = CTX_IDX >= 0 ? Math.max(0, Number(argv[CTX_IDX + 1]) || 0) : 0;

// ---------------------------------------------------------------------------
// Op-name classifiers
// ---------------------------------------------------------------------------

// Entity/persistence write ops — a chain containing any of these is a WRITE.
// Bare names are kept to Base44-SDK-ish methods; ambiguous ones (`destroy`,
// `remove`, `insert`, `put`, `patch`, `set`) are excluded — resource cleanup
// like `task?.destroy?.()` is not an entity write. camelCase prefixes below
// still catch domain helpers (insertRow, deleteIfUnchanged, …).
const WRITE_RES = [
  /^(create|createMany|createAll|bulkCreate)$/i,
  /^(update|updateMany|updateAll|bulkUpdate|bulkUpdateMany)$/i,
  /^(delete|deleteMany|deleteAll|bulkDelete)$/i,
  /^(upsert|upsertMany|save)$/i,
  /IfUnchanged$/,                                   // replace*/update*/delete*IfUnchanged CAS
  /^createFoundationRecordWithRecovery$/,
  /^ensureIdempotentEntityCreate$/,
  /^create\w*WithRecovery$/,
  /^ensure[A-Z_]/,                                  // ensureNewCustomer/ensure* create-if-missing
  /^create[A-Z_]/, /^update[A-Z_]/, /^delete[A-Z_]/, /^upsert[A-Z_]/, /^insert[A-Z_]/,
  /^persist/i, /^save[A-Z_]/, /^store[A-Z_]/, /^commit[A-Z_]/, /^append[A-Z_]/,
  /^write[A-Z_]/, /^record[A-Z_]/, /^archive[A-Z_]/, /^restore[A-Z_]/,
  /^finalize[A-Z_]/, /^merge[A-Z_]/, /^rename[A-Z_]/, /^mark[A-Z_]/, /^stamp[A-Z_]/,
  /^backfill/i, /^migrate[A-Z_]/, /^reconcile[A-Z_]/, /^repair[A-Z_]/,
  /^correct[A-Z_]/, /^import[A-Z_]/, /^adopt[A-Z_]/, /^allocate[A-Z_]/,
  /^register[A-Z_]/, /^link[A-Z_]/, /^unlink[A-Z_]/, /^seed[A-Z_]/,
  /^assign[A-Z_]/, /^attach[A-Z_]/, /^detach[A-Z_]/, /^cancel[A-Z_]/,
  /^sync[A-Z_]/, /^deactivat/i, /^apply[A-Z_]/, /^log[A-Z_]/, /^put[A-Z_]/, /^patch[A-Z_]/,
];

// Mid-name camel verbs — `deactivateIfStillLive`, `maybeLogSync`, `applyRules`
// (past-tense `Updated|Created|Deleted|Applied|Marked` excluded: those are
// field descriptors, not write verbs). Hits tagged `~name` in the report.
const WRITE_CONTAINS_RE =
  /[a-z0-9_](Create(?!d)|Update(?!d)|Delete(?!d)|Deactivate|Sync(?!ed)|Persist|Reconcile|Archive(?!d)|Write|Stamp|Record(?!ed)|Commit|Import(?!ed)|Backfill|Migrate(?!d)|Repair|Correct(?!ed)|Register(?!ed)|Allocate|Adopt(?!ed)|Seed(?!ed)|Link(?!ed)|Unlink|Assign(?!ed)|Attach(?!ed)|Detach|Cancel(?!led)|Finalize|Merge(?!d)|Rename(?!d)|Mark(?!ed)|Save(?!d)|Store(?!d)|Apply|Patch|Log|Post(?!ed)|Put)(?=[A-Z_]|$)/;
const READ_CONTAINS_RE =
  /[a-z0-9_](Get|List|Find|Search|Read|Fetch|Load|Query|Lookup|Select|Count|Download|Check|Verify|Resolve|Compute|Build|Make|Prepare|Assemble|Compose|Collect|Gather|Summarize|Scan|Probe|Inspect|Detect|Measure|Estimate|Calculate)(?=[A-Z_]|$)/;

// Non-entity side effects — silent failure is bad hygiene but not entity data loss.
const SIDE_EFFECT_RES = [
  /^send[A-Z_]/, /^notify/i, /^dispatch[A-Z_]/, /^publish/i, /^emit[A-Z_]/,
  /^email/i, /^log[A-Z_]/, /^track[A-Z_]/, /^report[A-Z_]/, /^audit[A-Z_]/,
  /^trace[A-Z_]/, /^enqueue/i, /^queue[A-Z_]/, /^schedule[A-Z_]/, /^trigger[A-Z_]/,
  /^(post|postJSON|postJson|postForm)$/i, /^post[A-Z_]/, /^check[A-Z_]*[Ss]end/,
];
// Mid-name fan-out verbs — `checkAndSendSyncAlert`, `maybeNotifyStaff`.
const SIDE_CONTAINS_RE =
  /[a-z0-9_](Send|Notify|Alert|Dispatch|Publish|Enqueue|Schedule|Trigger|Track|Report|Audit|Trace|Email|Mail|Push|Webhook|Broadcast|Fanout|Emit|Message|Sms|Slack)(?=[A-Z_]|$)/;

// Read-only ops — the known acceptable `.catch(() => [])` family.
const READ_RES = [
  /^(filter|list|get|getMany|find|findOne|search|query|count|aggregate|exists|head)$/i,
  /^(loadAllEntityRows|pagedEntityRows|loadEntityRows|loadRows|fetchRows)$/i,
  /^get[A-Z_]/, /^list[A-Z_]/, /^find[A-Z_]/, /^search[A-Z_]/, /^load[A-Z_]/,
  /^read[A-Z_]/, /^fetch[A-Z_]/, /^query[A-Z_]/, /^count[A-Z_]/, /^resolve[A-Z_]/,
  /^fresh[A-Z_]/, /^download/i,
];

// Invoked-function names that imply server-side writes vs pure fan-out.
// Side-effect names are checked FIRST (notification fan-out ≠ entity write).
const INVOKE_SIDE_EFFECT_RE =
  /notification|notifier|dispatch|send|email|gmail|smtp|mail|messag|alert|reminder|digest|webhook|push/i;
const INVOKE_WRITE_RE =
  /action|write|creat|updat|delet|ensure|invoic|payment|payroll|sync|generat|mark|record|save|store|persist|archive|import|export|order|ticket|publish|backup|seed|migrat|backfill|reconcil|repair|correct|post|provision|maintenance|clock/i;
const INVOKE_READ_RE = /read|feed|list|get|fetch|search|status|health|check|lookup|resolve/i;

// Comments that justify a silent catch.
const JUSTIFY_RE =
  /swallow|silent|best[- ]?effort|non[- ]?block|non[- ]?fatal|soft[- ]?fail|never (throw|fail|kill|break|reject|let)|must not (throw|fail|kill|break|reject)|do(es)? not (throw|fail|kill|break|reject)|don'?t (throw|fail|kill|break|reject|care)|won'?t (throw|fail|kill|break|reject)|ignor[esd]?\b[^.\n]{0,40}\b(error|fail|reject|miss|this|it)|ok(ay)? to (ignore|skip|drop|fail|miss)|safe to (ignore|skip|drop|fail|miss)|fine to (ignore|skip|drop|fail|miss)|fire[- ]?and[- ]?forget|harmless|tolerat|degrade|deliberate|intentional|telemetry|optional (step|write|save|update|call|telemetry)|non[- ]?critical|secondary|auxiliary|nice[- ]?to[- ]?have|cosmetic|keep going|continue anyway|drop(ped)? (the |this |that )?(error|failure|it)|eat (the |this )?error|carry on|proceed anyway|not (fatal|critical|essential)/i;

// Inside a catch block, any statement other than `return <const>` means the
// failure was at least recorded (flag-set, push, log, rethrow) — see
// classifyResultKind.

// ---------------------------------------------------------------------------
// File enumeration
// ---------------------------------------------------------------------------

function listFiles(dir, pred) {
  let out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isFile() && pred(name)) out.push(p);
  }
  return out;
}

const files = [];
for (const fn of readdirSync(FN_DIR)) {
  const dir = join(FN_DIR, fn);
  if (!statSync(dir).isDirectory()) continue;
  for (const p of listFiles(dir, (n) => n.endsWith('.ts'))) files.push(p);
}
for (const p of listFiles(SHARED_DIR, (n) => n.endsWith('.ts') || n.endsWith('.mjs'))) files.push(p);
files.sort();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unwrapParen(e) {
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  return e;
}

// Collect callee names along the promise chain being caught. Only function
// CALL names contribute (e.g. `entities.X.update(...)` → `update`); bare
// argument identifiers (recordId, body.x) never do — that keeps read chains
// like `foo(recordId).catch(()=>null)` from tripping /^record[A-Z]/.
// Nested calls inside arguments ARE part of the awaited work and are visited.
function calleeNameOf(callExpr) {
  const callee = unwrapParen(callExpr.expression);
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  if (ts.isIdentifier(callee)) return callee.text;
  return null;
}

function collectNames(node, names, deep) {
  const visit = (n) => {
    if (!n) return;
    if (ts.isCallExpression(n)) {
      const callee = unwrapParen(n.expression);
      // A nested function definition only contributes its inner ops when the
      // receiver itself is an IIFE (`(async()=>{…})().catch(…)`) — deep mode.
      if (ts.isArrowFunction(callee) || ts.isFunctionExpression(callee)) {
        if (deep) ts.forEachChild(n, visit);
        return;
      }
      const nm = calleeNameOf(n);
      if (nm) names.add(nm);
      if (ts.isPropertyAccessExpression(callee)) visit(callee.expression);
      for (const a of n.arguments) visit(a);
      return;
    }
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)) {
      if (deep) ts.forEachChild(n, visit);
      return;
    }
    if (ts.isAwaitExpression(n) || ts.isParenthesizedExpression(n) || ts.isAsExpression(n) ||
        ts.isNonNullExpression(n) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(n))) {
      visit(n.expression); return;
    }
    if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) { visit(n.expression); return; }
    if (ts.isConditionalExpression(n)) { visit(n.whenTrue); visit(n.whenFalse); return; }
    if (ts.isBinaryExpression(n)) { visit(n.left); visit(n.right); return; }
    if (ts.isArrayLiteralExpression(n) || ts.isTupleExpression?.(n)) { for (const e of n.elements) visit(e); return; }
    if (ts.isObjectLiteralExpression(n)) {
      for (const p of n.properties) {
        if (ts.isPropertyAssignment(p)) visit(p.initializer);
        else if (ts.isSpreadAssignment(p)) visit(p.expression);
      }
      return;
    }
    if (ts.isTemplateExpression(n)) { for (const s of n.templateSpans) visit(s.expression); return; }
    // identifiers / literals / everything else — leaf, contributes nothing.
  };
  visit(node);
}

function isIifeReceiver(recv) {
  if (!ts.isCallExpression(recv)) return false;
  const e = unwrapParen(recv.expression);
  return ts.isArrowFunction(e) || ts.isFunctionExpression(e);
}

// First string-literal arg of an `.invoke("name", …)` call inside the receiver.
function invokedName(recv) {
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const callee = unwrapParen(n.expression);
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : '';
      if (name === 'invoke' && n.arguments.length && ts.isStringLiteralLike(n.arguments[0])) found = n.arguments[0].text;
    }
    ts.forEachChild(n, visit);
  };
  visit(recv);
  return found;
}

function matchAny(name, res) { return res.some((r) => r.test(name)); }

function isConstExpr(e) {
  e = unwrapParen(e);
  if (!e) return true;
  if (e.kind === ts.SyntaxKind.NullKeyword || e.kind === ts.SyntaxKind.TrueKeyword ||
      e.kind === ts.SyntaxKind.FalseKeyword || e.kind === ts.SyntaxKind.UndefinedKeyword) return true;
  if (ts.isNumericLiteral(e) || ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return true;
  if (ts.isIdentifier(e) && e.text === 'undefined') return true;
  if (ts.isArrayLiteralExpression(e)) return e.elements.length === 0;
  if (ts.isObjectLiteralExpression(e)) return e.properties.length === 0;
  if (ts.isVoidExpression && ts.isVoidExpression(e)) return true;
  return false;
}

function classifyResultKind(arrow) {
  const body = arrow.body;
  if (ts.isBlock(body)) {
    if (body.statements.length === 0) return { kind: 'empty-block', handled: false };
    // A block that only `return`s a constant swallows just like `() => null`.
    // Any other statement (flag-set, push, log, rethrow…) records the failure.
    const hasSideEffect = body.statements.some(
      (s) => !(ts.isReturnStatement(s) && (!s.expression || isConstExpr(s.expression)))
    );
    return { kind: `block(${body.statements.length})`, handled: hasSideEffect };
  }
  const e = unwrapParen(body);
  if (e.kind === ts.SyntaxKind.NullKeyword) return { kind: 'null', handled: false };
  if (ts.isArrayLiteralExpression(e)) return { kind: e.elements.length ? 'array(nonempty)' : '[]', handled: false };
  if (ts.isObjectLiteralExpression(e)) return { kind: '({})', handled: false };
  if (e.kind === ts.SyntaxKind.FalseKeyword || e.kind === ts.SyntaxKind.TrueKeyword) return { kind: String(e.kind === ts.SyntaxKind.FalseKeyword ? 'false' : 'true'), handled: false };
  if (ts.isNumericLiteral(e) || ts.isStringLiteral(e)) return { kind: `'${e.text}'`, handled: false };
  if (ts.isIdentifier(e) && e.text === 'undefined') return { kind: 'undefined', handled: false };
  if (ts.isVoidExpression && ts.isVoidExpression(e)) return { kind: 'void', handled: false };
  const head = ts.isIdentifier(e) ? e.text : e.getText().slice(0, 40).replace(/\s+/g, ' ');
  return { kind: `fallback:${head}`, handled: false };
}

// Nearest enclosing function-like ancestor → its name.
function enclosingFn(node, sf) {
  let cur = node.parent;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) || ts.isFunctionExpression(cur) || ts.isMethodDeclaration(cur)) {
      return { name: cur.name ? cur.name.text : '(anon fn)', node: cur };
    }
    if (ts.isArrowFunction(cur)) {
      let nm = '(arrow)';
      const p = cur.parent;
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) nm = p.name.text;
      else if (ts.isPropertyAssignment(p)) nm = p.name.getText();
      else if (ts.isCallExpression(p)) {
        const ce = unwrapParen(p.expression);
        const cn = ts.isPropertyAccessExpression(ce) ? ce.name.getText() : ce.getText().slice(0, 30);
        nm = `(arrow in ${cn})`;
      }
      return { name: nm, node: cur };
    }
    cur = cur.parent;
  }
  return { name: '(top-level)', node: sf };
}

const within = (node, container) =>
  node.getStart() >= container.getStart() && node.end <= container.end;

// An `ident === "literal"` condition where ident is a dispatch carrier:
// bare action/sub_action/dataset/command/op/verb/route/task/intent/mutation/
// procedure, or a DOTTED .mode/.kind/.type/.step/.method/.status (bare type/
// kind comparisons are too ambiguous to count as dispatch).
const DISPATCH_STRONG = /^(action|sub_action|action_name|dataset|command|cmd|op|operation|operation_name|verb|route|task|intent|handler|mutation|procedure|proc|call_name)$/i;
const DISPATCH_WEAK = /^(mode|kind|type|step|method|status|event|name|key)$/i;
// Returns 'strong' | 'weak' | null for `ident === "literal"` dispatch conditions.
function dispatchKind(condExpr) {
  const t = condExpr.getText();
  let weak = false;
  for (const m of t.matchAll(/([A-Za-z_$][\w$?.[\]-]*)\s*={2,3}\s*['"`]/g)) {
    const ident = m[1];
    const leaf = ident.split(/[?.[\]]+/).filter(Boolean).pop() || '';
    if (DISPATCH_STRONG.test(leaf)) return 'strong';
    if (ident.includes('.') && DISPATCH_WEAK.test(leaf)) weak = true;
  }
  return weak ? 'weak' : null;
}

// The scope whose response build this catch feeds: the OUTERMOST strong
// dispatch-if `then` branch (or case clause) containing the hit; fall back to
// outermost weak dispatch (`body.type === "x"`), else the enclosing fn. Walk
// to root so hits inside `.map(async …)` callbacks still reach the action
// block; transport checks like `req.method === "POST"` never outrank `action`.
function enclosingScope(node, sf, fnNode) {
  // Walking up = deepest→outermost; last write wins → outermost candidate.
  let strong = null, strongNode = null, weak = null, weakNode = null;
  let cur = node.parent;
  while (cur) {
    if (ts.isIfStatement(cur) && cur.thenStatement && within(node, cur.thenStatement)) {
      const k = dispatchKind(cur.expression);
      if (k === 'strong') { strong = cur.thenStatement; strongNode = cur; }
      else if (k === 'weak') { weak = cur.thenStatement; weakNode = cur; }
    } else if (ts.isCaseClause(cur) && within(node, cur)) {
      strong = cur; strongNode = cur;                 // `case "x":` = strong dispatch
    }
    cur = cur.parent;
  }
  const scope = strong ?? weak ?? fnNode ?? sf;
  const provider = strong ? strongNode : (!strong && weak ? weakNode : null);
  // chainEnd: end of the whole else-if chain head containing the scope-if, so
  // the "tail" is only code after the dispatch chain, not sibling branches.
  let chainEnd = null;
  let chain = provider;
  while (chain && ts.isIfStatement(chain.parent) && chain.parent.elseStatement === chain) chain = chain.parent;
  if (chain && ts.isIfStatement(chain)) chainEnd = chain.end;
  else if (provider && ts.isCaseClause(provider)) {
    let p = provider.parent;
    while (p && !ts.isSwitchStatement(p)) p = p.parent;
    chainEnd = p ? p.end : provider.end;
  }
  return { scope, chainEnd };
}

// Last `action === "x"` / `case "x":` style dispatch before the hit, within the
// enclosing function span.
function enclosingAction(fnNode, hitPos, sourceText) {
  const start = fnNode.getStart();
  const slice = sourceText.slice(start, hitPos);
  const res = [];
  const patterns = [
    /\b(?:body\.)?(?:action|dataset|command|cmd|op|operation|mode|type|task|kind|step)\s*={2,3}\s*['"`]([\w:./-]+)['"`]/g,
    /['"`]([\w:./-]+)['"`]\s*={2,3}\s*\b(?:body\.)?(?:action|dataset|command|cmd|op|operation)\b/g,
    /\bcase\s+['"`]([\w:./-]+)['"`]\s*:/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(slice))) res.push({ pos: m.index, name: m[1] });
  }
  if (!res.length) return null;
  res.sort((a, b) => a.pos - b.pos);
  return res[res.length - 1].name;
}

// Response-build chunks: Response.json(…) args + return expressions.
function responseChunks(text) {
  const out = [];
  for (const re of [/Response\.json\s*\(([^;]{0,4000}?)\)\s*;?/g, /\breturn\s+([^;\n]{0,2000});?/g]) {
    let m;
    while ((m = re.exec(text))) out.push(m[1]);
  }
  return out;
}

// Does a `*warning*` identifier reach the response build inside scopeText?
// tailText = enclosing-fn text after the scope (shared tail returns still count).
function warningSurfaced(scopeText, tailText) {
  const chunks = responseChunks(scopeText);
  if (chunks.some((c) => /\b\w*[Ww]arning\w*\b/.test(c))) return 'response-field';
  const decls = new Set();
  for (const re of [/\b(?:const|let|var)\s+([$\w]*[Ww]arning[$\w]*)/g, /\b([$\w]*[Ww]arning[$\w]*)\s*:/g]) {
    let m;
    while ((m = re.exec(scopeText))) decls.add(m[1]);
  }
  for (const d of decls) {
    if (chunks.some((c) => new RegExp(`\\b${d}\\b`).test(c))) return `var:${d}`;
  }
  if (tailText && responseChunks(tailText).some((c) => /\b\w*[Ww]arning\w*\b/.test(c))) return 'shared-return';
  return decls.size ? 'declared-not-surfaced' : null;
}

// `const v = await …catch(() => null)` followed within ~10 lines by
// `if (!v…)`/`if (v == null)` leading to a return/throw — the failure reaches
// an error response, so it is not silent. Returns a tag string or null.
function nullCheckSurfacesError(node, sf) {
  // find the statement containing the catch
  let stmt = node;
  while (stmt.parent && !ts.isStatement(stmt)) stmt = stmt.parent;
  if (!ts.isVariableStatement(stmt)) return null;
  const decl = stmt.declarationList.declarations.find((d) => within(node, d));
  if (!decl || !ts.isIdentifier(decl.name)) return null;
  const name = decl.name.text;
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return null;
  const block = stmt.parent;
  if (!block || (!ts.isBlock(block) && !ts.isSourceFile(block) && !ts.isCaseClause(block))) return null;
  const stmts = block.statements;
  const idx = stmts.indexOf(stmt);
  if (idx < 0) return null;
  let slice = stmts.slice(idx + 1, idx + 7).map((s) => s.getText()).join('\n');
  // widen to the enclosing function tail — a `for`-body var may be checked
  // after the loop closes (`if (!released) flag = true; … return { error }`).
  if (!ts.isSourceFile(block)) {
    let fn = stmt.parent;
    while (fn && !(ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn) || ts.isArrowFunction(fn) || ts.isMethodDeclaration(fn))) fn = fn.parent;
    if (fn) slice += '\n' + fn.getText().slice(stmt.end - fn.getStart(), stmt.end - fn.getStart() + 1200);
  }
  const esc = name.replace(/[$]/g, '\\$');
  const checkRe = new RegExp(
    `if\\s*\\([^)]*(?:!\\s*${esc}\\b|!\\s*${esc}\\s*\\?\\.|${esc}\\s*==?=?\\s*null|${esc}\\s*===?\\s*undefined|${esc}\\s*==?=?\\s*false|!\\s*Array\\.isArray\\s*\\(\\s*${esc}\\s*\\))`,
  );
  const m = slice.match(checkRe);
  if (!m) return null;
  const after = slice.slice(m.index, m.index + 700);
  if (/\breturn\b|\bthrow\b/.test(after)) return `null-check→error-return(${name})`;
  return null;
}

// Adjacent justifying comment: scan a window of source lines around the hit.
function adjacentComment(lines, hitLine) {
  const lo = Math.max(0, hitLine - 8), hi = Math.min(lines.length, hitLine + 2);
  const winLines = lines.slice(lo, hi).join('\n');
  const comments = winLines.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) || [];
  for (const c of comments) {
    if (JUSTIFY_RE.test(c)) return c.replace(/\s+/g, ' ').slice(0, 140);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main scan
// ---------------------------------------------------------------------------

const hits = [];
let filesScanned = 0, parseErrors = 0;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const kind = file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  filesScanned += 1;
  if (sf.parseDiagnostics && sf.parseDiagnostics.length) parseErrors += 1;
  const lines = text.split(/\r?\n/);
  const rel = relative(ROOT, file).replace(/\\/g, '/');

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'catch' &&
      node.arguments.length >= 1 &&
      ts.isArrowFunction(node.arguments[0]) &&
      node.arguments[0].parameters.length <= 1
    ) {
      const arrow = node.arguments[0];
      // `() => X` always swallows the error; `(e) => X` only when `e` is never
      // read — a handler that logs/uses the rejection is `handled`, not silent.
      const errParam =
        arrow.parameters.length === 1 && ts.isIdentifier(arrow.parameters[0].name)
          ? arrow.parameters[0].name.text
          : null;
      const paramUsed = errParam ? new RegExp(`\\b${errParam}\\b`).test(arrow.body.getText()) : false;
      const recv = node.expression.expression;
      const { line } = ts.getLineAndCharacterOfPosition(sf, node.expression.name.getStart());
      const lineNo = line + 1;

      const iife = isIifeReceiver(recv);
      const names = new Set();
      collectNames(recv, names, iife);

      const writeOps = [...names].filter((n) => matchAny(n, WRITE_RES));
      const writeContains = [...names].filter((n) => !matchAny(n, WRITE_RES) && WRITE_CONTAINS_RE.test(n));
      const sideOps = [...names].filter((n) => matchAny(n, SIDE_EFFECT_RES));
      const sideContains = [...names].filter((n) => !matchAny(n, SIDE_EFFECT_RES) && SIDE_CONTAINS_RE.test(n));
      const readOps = [...names].filter((n) => matchAny(n, READ_RES));
      const readContains = [...names].filter((n) => !matchAny(n, READ_RES) && READ_CONTAINS_RE.test(n));
      const inv = invokedName(recv);
      const invWrite = inv && !INVOKE_SIDE_EFFECT_RE.test(inv) && INVOKE_WRITE_RE.test(inv);

      const { kind: resKind, handled } = classifyResultKind(arrow);
      const fn = enclosingFn(node, sf);
      const { scope: scopeNode, chainEnd } = enclosingScope(node, sf, fn.node);
      const scopeText = scopeNode === sf ? text : scopeNode.getText();
      // tail of enclosing fn after the whole dispatch chain — a shared
      // `return {…warning…}` after the if/else ladder still surfaces it.
      // Only consult it when the scope builds NO response of its own —
      // otherwise later sibling branches' warnings would leak in.
      const scopeBuildsResponse = /\breturn\b|\bthrow\b|Response\.json/.test(scopeText);
      const tailText =
        !scopeBuildsResponse && chainEnd && fn.node !== sf
          ? text.slice(Math.min(chainEnd, fn.node.end), fn.node.end)
          : '';
      const action = enclosingAction(fn.node, node.getStart(), text);

      let cls, via = [];
      if (writeOps.length || invWrite === true) {
        cls = 'write-swallow';
        via = invWrite ? [`invoke:${inv}`] : writeOps;
      } else if (inv && INVOKE_READ_RE.test(inv)) {
        cls = 'read-load';
        via = [`invoke:${inv}`];
      } else if (sideOps.length || sideContains.length || inv && INVOKE_SIDE_EFFECT_RE.test(inv)) {
        cls = 'side-effect';
        via = inv ? [`invoke:${inv}`] : [...sideOps, ...sideContains.map((n) => `~${n}`)];
      } else if (readOps.length) {
        // read-prefix helpers (`load*`, `get*`, `fetch*`, …) stay reads even
        // when the name contains a write-y substring (`loadSyncStatusRecord`).
        cls = 'read-load';
        via = readOps;
      } else if (writeContains.length) {
        cls = 'write-swallow';
        via = writeContains.map((n) => `~${n}`);
      } else if (readContains.length) {
        cls = 'read-load';
        via = readContains.map((n) => `~${n}`);
      } else if (inv) {
        cls = 'side-effect';
        via = [`invoke:${inv}`];
      } else {
        cls = 'non-entity';
        via = [...names].slice(0, 4);
      }

      let verdict = 'info', justify = '';
      if (handled || paramUsed) {
        cls = 'handled';
      } else if (cls === 'write-swallow') {
        const w = warningSurfaced(scopeText, tailText);
        const c = adjacentComment(lines, lineNo - 1);
        const nc = resKind === 'null' || resKind === 'undefined' || resKind === 'empty-block' || resKind === 'false'
          ? nullCheckSurfacesError(node, sf)
          : null;
        if (w === 'response-field' || (w && w.startsWith('var:'))) {
          verdict = 'justified';
          justify = `warning-field(${w})`;
        } else if (w === 'shared-return') {
          verdict = 'justified';
          justify = 'warning-field(shared-return)';
        } else if (nc) {
          verdict = 'justified';
          justify = `error-return(${nc})`;
        } else if (c) {
          verdict = 'justified';
          justify = `comment: ${c}`;
        } else {
          verdict = 'VIOLATION';
          justify = w === 'declared-not-surfaced' ? 'warn-var-declared-not-in-response' : '';
        }
      }

      hits.push({
        file: rel, line: lineNo, cls, verdict, via: via.join(','),
        resKind, iife, action, fn: fn.name, justify,
        scoped: scopeNode !== fn.node && scopeNode !== sf,
        src: (lines[lineNo - 1] || '').trim().slice(0, 140),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// ---------------------------------------------------------------------------
// Generated-bundle pass: files stamped "// Generated by …; edit <source>" ship
// stripped comments — a write-swallow whose canonical source carries the
// justification is `justified:generated-copy`, not a fixable violation.
// ---------------------------------------------------------------------------

const generatedOf = new Map(); // rel file -> canonical rel source
{
  const GEN_BANNER = /generated\s+by|auto[- ]?generated|@generated|do not edit/i;
  const SRC_REF = /edit\s+([A-Za-z0-9_./\\-]+\.[a-z]+)|from\s+([A-Za-z0-9_./\\-]+\.[a-z]+)/i;
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const head = readFileSync(file, 'utf8').split(/\r?\n/).slice(0, 6).join('\n');
    if (!GEN_BANNER.test(head)) continue;
    const m = head.match(SRC_REF);
    const ref = m && (m[1] || m[2]);
    if (!ref) { generatedOf.set(rel, null); continue; }
    const candidates = [
      join(ROOT, ref), join(FN_DIR, ref),
      join(ROOT, 'base44', ref), join(dirname(file), ref.split(/[\\/]/).pop()),
    ];
    const found = candidates.find((c) => { try { return statSync(c).isFile(); } catch { return false; } });
    generatedOf.set(rel, found ? relative(ROOT, found).replace(/\\/g, '/') : null);
  }
}
for (const h of hits) {
  if (h.cls !== 'write-swallow' || h.verdict !== 'VIOLATION') continue;
  const srcRel = generatedOf.get(h.file);
  if (srcRel === undefined) continue;          // not a generated file
  if (srcRel === null) continue;               // generated, no resolvable source
  const twin = hits.find(
    (o) => o.file === srcRel && o.cls === 'write-swallow' && o.verdict === 'justified' &&
      (o.via === h.via || o.via.split(',').some((v) => h.via.split(',').includes(v)))
  );
  if (twin) {
    h.verdict = 'justified';
    h.justify = `generated-copy(source ${srcRel}:${twin.line} ${twin.justify.split(':')[0]})`;
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const counts = { 'read-load': 0, 'write-swallow': 0, 'side-effect': 0, 'non-entity': 0, handled: 0 };
const violations = [];
const byFileRead = new Map(), byFileNonEntity = new Map();
const writeHits = [], sideHits = [];

for (const h of hits) {
  counts[h.cls] = (counts[h.cls] ?? 0) + 1;
  if (h.cls === 'write-swallow') {
    writeHits.push(h);
    if (h.verdict === 'VIOLATION') violations.push(h);
  } else if (h.cls === 'side-effect') {
    sideHits.push(h);
  } else if (h.cls === 'read-load') {
    byFileRead.set(h.file, (byFileRead.get(h.file) || 0) + 1);
  } else if (h.cls === 'non-entity' || h.cls === 'handled') {
    byFileNonEntity.set(h.file, (byFileNonEntity.get(h.file) || 0) + 1);
  }
}

console.log('WRITE-SWALLOW AUDIT — L-02 silent-catch sweep on write paths');
console.log(`files scanned: ${filesScanned} (parse warnings: ${parseErrors})`);
console.log(`total .catch(()=>…) hits: ${hits.length}`);
console.log(`  read-load (acceptable): ${counts['read-load']}`);
console.log(`  write-swallow: ${counts['write-swallow']}  (violations: ${violations.length}, justified: ${counts['write-swallow'] - violations.length})`);
console.log(`  side-effect swallows (info): ${counts['side-effect']}`);
console.log(`  handled catches (info): ${counts['handled']}`);
console.log(`  non-entity swallows (info): ${counts['non-entity']}`);

if (SHOW_ALL) {
  console.log('\n== ALL HITS ==');
  for (const h of hits) {
    console.log(`  ${h.file}:${h.line}  ${h.cls}/${h.verdict}${h.iife ? '/iife' : ''}  action=${h.action ?? '-'} fn=${h.fn} via=${h.via} res=${h.resKind}${h.justify ? `  ${h.justify}` : ''}`);
  }
}

console.log('\n== WRITE-SWALLOW HITS ==');
if (!writeHits.length) console.log('  (none)');
for (const h of writeHits) {
  const tag = h.verdict === 'VIOLATION' ? 'VIOLATION' : `justified:${h.justify}`.slice(0, 110);
  console.log(`  ${h.file}:${h.line}  ${tag}${h.iife ? ' iife' : ''}  action=${h.action ?? h.fn}  via=${h.via}  res=${h.resKind}`);
  if (h.verdict === 'VIOLATION') {
    console.log(`      src: ${h.src}`);
    if (h.justify) console.log(`      note: ${h.justify}`);
  }
}

console.log('\n== VIOLATIONS (write-swallow with no warning field and no justification) ==');
if (!violations.length) console.log('  (none)');
for (const h of violations) {
  console.log(`  ${h.file}:${h.line}  action=${h.action ?? h.fn}  via=${h.via}`);
  if (CONTEXT > 0) {
    const all = readFileSync(join(ROOT, h.file), 'utf8').split(/\r?\n/);
    const lo = Math.max(0, h.line - 1 - Math.floor(CONTEXT / 2));
    const hi = Math.min(all.length, h.line - 1 + Math.ceil(CONTEXT / 2));
    for (let i = lo; i < hi; i++) console.log(`      ${String(i + 1).padStart(5)}| ${all[i]}`);
  }
}

console.log('\n== SIDE-EFFECT SWALLOWS (send/notify/log/dispatch/invoke — review, non-fatal) ==');
if (!sideHits.length) console.log('  (none)');
for (const h of sideHits) {
  console.log(`  ${h.file}:${h.line}  action=${h.action ?? h.fn}  via=${h.via}  res=${h.resKind}${h.justify ? `  ${h.justify}` : ''}`);
}

console.log('\n== READ-LOAD COUNTS (info only — acceptable `.catch(() => [])` family) ==');
for (const [f, n] of [...byFileRead.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n}\t${f}`);
}

console.log('\n== NON-ENTITY/HANDLED COUNTS (info only) ==');
for (const [f, n] of [...byFileNonEntity.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n}\t${f}`);
}

console.log('');
if (violations.length === 0) {
  console.log('PASS write-swallow-audit');
  process.exit(0);
} else {
  console.log(`FAIL write-swallow-audit — ${violations.length} write-swallow violation(s)`);
  process.exit(1);
}
