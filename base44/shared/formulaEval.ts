// Formula engine — safe expression evaluator for pricing-modifier math
// (ESTIMATOR_MASTERPLAN F-09). Pure TS, ZERO imports, NO eval()/Function() —
// the only thing a formula can do is arithmetic over whitelisted AST node
// types against a caller-supplied env map.
//
// Grammar (loosest -> tightest binding):
//   expr     := ternary
//   ternary  := or ('?' ternary ':' ternary)?          // right-assoc on else
//   or       := and ('||' and)*
//   and      := eq  ('&&' eq)*
//   eq       := cmp (('=='|'!=') cmp)*
//   cmp      := sum (('<'|'<='|'>'|'>=') sum)*
//   sum      := prod (('+'|'-') prod)*
//   prod     := unary (('*'|'/'|'%') unary)*
//   unary    := ('-'|'+'|'!') unary | power
//   power    := primary ('^' unary)?                    // right-assoc; unary
//                                                        RHS allows 2^-2
//   primary  := number | 'true' | 'false' | '(' expr ')'
//             | ident | ident '(' [expr (',' expr)*] ')'
//
//   number   := digits ['.' digits] [('e'|'E') ['+'|'-'] digits]  (.5, 1., 1e3 ok)
//   ident    := [A-Za-z_] [A-Za-z0-9_]*                          (strict whitelist)
//
// Precedence notes (math convention, documented for formula authors):
//   - '^' binds TIGHTER than unary minus:  -2^2 = -(2^2) = -4.  Use (-2)^2 = 4.
//   - Unary minus binds tighter than binary ops:  2 * -3 = -6.
//   - '!' and unary '-'/'+' bind tighter than comparisons:  !1 == 0  -> 1.
//
// Semantics:
//   - Every value is a finite double. Truthy = non-zero.
//   - Comparisons / && / || / ! return 1 or 0 (boolean semantics — 'a || b'
//     is NOT a coalesce; write 'a != 0 ? a : b' or if(a, a, b)).
//   - &&, ||, ?:, and if() are short-circuit/lazy:  0 && 1/0 -> 0,
//     x != 0 && 10/x > 2 guards the division; only the taken branch evaluates.
//   - '%' is FLOORED modulo (Excel MOD / Python %): sign follows the divisor.
//     -7 % 3 = 2;  7 % -3 = -2.
//   - round(x[,digits]) rounds half AWAY from zero (Excel ROUND):
//     round(2.5)=3, round(-2.5)=-3, round(123.456,-1)=120. digits truncated to
//     an integer and clamped to [-30,30]. floor/ceil take the same optional
//     decimal-digit second arg. 'ceiling' is an alias of 'ceil'.
//   - Function names are case-insensitive (MIN = min). A name is only a
//     function in call position: 'min + 1' reads the VARIABLE 'min'.
//   - 'true'/'false' (any case) are reserved literals -> 1/0. They are not
//     variables and cannot be overridden by env.
//
// Variables: resolved from the caller's env map by OWN-property lookup
// (Object.prototype.hasOwnProperty) — 'constructor', '__proto__',
// 'toString', 'process', etc. can never resolve through a plain env object
// and produce a clean "unknown variable" error. Values must coerce to a
// finite number (numeric strings ok); null/undefined/''/objects/functions
// are rejected as "not numeric". Lookup is case-sensitive; a
// case-insensitive near-match in env appends a 'did you mean' hint.
//
// Reserved variable names callers typically inject (informational constant —
// the engine treats all variables identically):
//   PartBaseCost, PartRetail, Width, Height, Depth, Quantity, StitchCount,
//   plus any global variables and modifier answers the caller merges in.
//
// Functions:  min(a,...)  max(a,...)  round(x[,n])  floor(x[,n])
//             ceil(x[,n]) / ceiling(x[,n])  abs(x)  sqrt(x)  pow(a,b)
//             if(cond, then, else)  — exactly 3 args, lazy branches.
//
// Error contract — evaluateFormula NEVER throws for bad input:
//   - syntax error      -> { ok:false, error, pos }  (pos = 0-based char offset)
//   - unknown variable  -> error names the var, pos = identifier start
//   - non-numeric env   -> error names the var
//   - x / 0, x % 0      -> 'division by zero' / 'modulo by zero', pos = operator
//   - non-finite result -> 'non-finite result' (overflow, sqrt(neg) is a
//                          dedicated message, pow(10,400), etc.)
//   - bounds            -> formula >10k chars, nesting >100 deep, call >64 args
//
// validateFormula(src) parses only (no env needed): returns
//   { ok, errors: [{error,pos}], vars: [sorted unique identifiers referenced
//     as variables — literals and function names excluded] }.
// On a syntax error, vars still contains identifiers seen before the error.

export const FORMULA_RESERVED_VARS: readonly string[] = [
  "PartBaseCost",
  "PartRetail",
  "Width",
  "Height",
  "Depth",
  "Quantity",
  "StitchCount",
];

export const FORMULA_FUNCTIONS: readonly string[] = [
  "min",
  "max",
  "round",
  "floor",
  "ceil",
  "ceiling",
  "abs",
  "sqrt",
  "pow",
  "if",
];

export const FORMULA_MAX_SOURCE_LEN = 10_000;
export const FORMULA_MAX_NESTING = 100;
export const FORMULA_MAX_ARGS = 64;

export interface FormulaEnv {
  [name: string]: unknown;
}

export interface FormulaSuccess {
  ok: true;
  value: number;
}
export interface FormulaFailure {
  ok: false;
  error: string;
  /** 0-based character offset into the source formula. */
  pos: number;
}
export type FormulaResult = FormulaSuccess | FormulaFailure;

export interface FormulaValidation {
  ok: boolean;
  errors: { error: string; pos: number }[];
  vars: string[];
}

// ---------------------------------------------------------------------------
// internal error carrier — thrown inside parse/eval, converted at the API edge
// ---------------------------------------------------------------------------

interface FErr {
  fe: true;
  message: string;
  pos: number;
}

const fail = (message: string, pos: number): FErr => ({ fe: true, message, pos });

const asFErr = (e: unknown): FErr | null =>
  e !== null && typeof e === "object" && (e as { fe?: unknown }).fe === true
    ? (e as FErr)
    : null;

// ---------------------------------------------------------------------------
// tokenizer
// ---------------------------------------------------------------------------

type Tok =
  | { k: "num"; v: number; pos: number }
  | { k: "id"; name: string; pos: number }
  | { k: "op"; op: string; pos: number };

const isDigitCode = (c: number): boolean => c >= 48 && c <= 57;
const isIdStartCode = (c: number): boolean =>
  (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95; // A-Z a-z _
const isIdCharCode = (c: number): boolean => isIdStartCode(c) || isDigitCode(c);
const isSpaceCode = (c: number): boolean =>
  c === 32 || c === 9 || c === 10 || c === 13;

const SINGLE_OPS = "+-*/%^(),?:<>!";

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const ch = src[i];
    const code = src.charCodeAt(i);

    if (isSpaceCode(code)) {
      i++;
      continue;
    }

    // number: digits [.digits] [e[+-]digits]  OR  .digits
    if (isDigitCode(code) || (ch === "." && i + 1 < n && isDigitCode(src.charCodeAt(i + 1)))) {
      const start = i;
      if (ch !== ".") {
        while (i < n && isDigitCode(src.charCodeAt(i))) i++;
      }
      if (i < n && src[i] === ".") {
        i++;
        while (i < n && isDigitCode(src.charCodeAt(i))) i++;
      }
      if (i < n && (src[i] === "e" || src[i] === "E")) {
        let k = i + 1;
        if (k < n && (src[k] === "+" || src[k] === "-")) k++;
        if (k < n && isDigitCode(src.charCodeAt(k))) {
          while (k < n && isDigitCode(src.charCodeAt(k))) k++;
          i = k;
        } else {
          throw fail(`malformed number literal "${src.slice(start, i + 1)}"`, i);
        }
      }
      const v = Number(src.slice(start, i));
      if (!Number.isFinite(v)) throw fail(`number literal out of range`, start);
      toks.push({ k: "num", v, pos: start });
      continue;
    }

    if (isIdStartCode(code)) {
      const start = i;
      while (i < n && isIdCharCode(src.charCodeAt(i))) i++;
      toks.push({ k: "id", name: src.slice(start, i), pos: start });
      continue;
    }

    // two-char operators first (longest match wins)
    const two = src.substring(i, i + 2);
    if (two === "&&" || two === "||" || two === "<=" || two === ">=" || two === "==" || two === "!=") {
      toks.push({ k: "op", op: two, pos: i });
      i += 2;
      continue;
    }

    if (ch === "&") throw fail("unexpected '&' (did you mean '&&'?)", i);
    if (ch === "|") throw fail("unexpected '|' (did you mean '||'?)", i);
    if (ch === "=") throw fail("unexpected '=' (did you mean '=='?)", i);

    if (SINGLE_OPS.indexOf(ch) !== -1) {
      toks.push({ k: "op", op: ch, pos: i });
      i++;
      continue;
    }

    throw fail(`unexpected character '${ch}'`, i);
  }
  return toks;
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

type Node =
  | { t: "num"; v: number; pos: number }
  | { t: "var"; name: string; pos: number }
  | { t: "un"; op: string; e: Node; pos: number }
  | { t: "chain"; kind: "sum" | "prod" | "cmp" | "eq"; ops: string[]; opPos: number[]; terms: Node[]; pos: number }
  | { t: "logic"; kind: "and" | "or"; terms: Node[]; pos: number }
  | { t: "pow"; base: Node; exp: Node; pos: number }
  | { t: "cond"; c: Node; a: Node; b: Node; pos: number }
  | { t: "call"; name: string; nameLc: string; args: Node[]; pos: number };

// function arity table: [min, max] — enforced at PARSE time so validateFormula
// reports bad arity without needing an env.
const FN_ARITY: Record<string, readonly [number, number]> = {
  min: [1, FORMULA_MAX_ARGS],
  max: [1, FORMULA_MAX_ARGS],
  round: [1, 2],
  floor: [1, 2],
  ceil: [1, 2],
  ceiling: [1, 2],
  abs: [1, 1],
  sqrt: [1, 1],
  pow: [2, 2],
  if: [3, 3],
};

// ---------------------------------------------------------------------------
// parser — recursive descent. `depth` bounds nesting: every recursion cycle
// passes through parseTernary (parens, call args, ternary branches) or
// parseUnary (prefix chains, '^' right operand), so counting those two covers
// every way the AST can get deeper. Flat op chains (a+b+c+…) do not recurse.
// ---------------------------------------------------------------------------

function parse(src: string, intoVars?: Set<string>): { root: Node; vars: string[] } {
  if (typeof src !== "string") throw fail("formula must be a string", 0);
  if (src.length > FORMULA_MAX_SOURCE_LEN) {
    throw fail(`formula too long (max ${FORMULA_MAX_SOURCE_LEN} characters)`, FORMULA_MAX_SOURCE_LEN);
  }
  const toks = tokenize(src);
  if (toks.length === 0) throw fail("empty formula", 0);

  let i = 0;
  let depth = 0;
  const varSet: Set<string> = intoVars ?? new Set<string>();

  const peekOp = (op: string): boolean => {
    const t = toks[i];
    return !!t && t.k === "op" && t.op === op;
  };

  const enter = (pos: number): void => {
    depth += 1;
    if (depth > FORMULA_MAX_NESTING) throw fail("expression too deeply nested", pos);
  };

  const describeTok = (t: Tok): string => {
    if (t.k === "num") return `number ${t.v}`;
    if (t.k === "id") return `identifier '${t.name}'`;
    return `operator '${t.op}'`;
  };

  const unexpected = (t: Tok | undefined): FErr =>
    t === undefined
      ? fail("unexpected end of expression", src.length)
      : fail(`unexpected ${describeTok(t)}`, t.pos);

  // consume the current token as an operator (callers verified via peekOp)
  const takeOp = (): Extract<Tok, { k: "op" }> => {
    const t = toks[i] as Extract<Tok, { k: "op" }>;
    i++;
    return t;
  };

  function parseTernary(): Node {
    const at = toks[i];
    enter(at ? at.pos : src.length);
    try {
      const c = parseOr();
      if (!peekOp("?")) return c;
      const qPos = toks[i].pos;
      i++;
      const a = parseTernary();
      if (!peekOp(":")) {
        const t = toks[i];
        throw fail("expected ':' for ternary '?'", t ? t.pos : src.length);
      }
      i++;
      const b = parseTernary();
      return { t: "cond", c, a, b, pos: qPos };
    } finally {
      depth -= 1;
    }
  }

  function parseOr(): Node {
    const first = parseAnd();
    const terms: Node[] = [first];
    while (peekOp("||")) {
      i++;
      terms.push(parseAnd());
    }
    return terms.length > 1 ? { t: "logic", kind: "or", terms, pos: first.pos } : first;
  }

  function parseAnd(): Node {
    const first = parseEq();
    const terms: Node[] = [first];
    while (peekOp("&&")) {
      i++;
      terms.push(parseEq());
    }
    return terms.length > 1 ? { t: "logic", kind: "and", terms, pos: first.pos } : first;
  }

  function parseEq(): Node {
    const first = parseCmp();
    const ops: string[] = [];
    const opPos: number[] = [];
    const terms: Node[] = [first];
    while (peekOp("==") || peekOp("!=")) {
      const t = takeOp();
      ops.push(t.op);
      opPos.push(t.pos);
      terms.push(parseCmp());
    }
    return ops.length ? { t: "chain", kind: "eq", ops, opPos, terms, pos: first.pos } : first;
  }

  function parseCmp(): Node {
    const first = parseAdd();
    const ops: string[] = [];
    const opPos: number[] = [];
    const terms: Node[] = [first];
    while (peekOp("<") || peekOp("<=") || peekOp(">") || peekOp(">=")) {
      const t = takeOp();
      ops.push(t.op);
      opPos.push(t.pos);
      terms.push(parseAdd());
    }
    return ops.length ? { t: "chain", kind: "cmp", ops, opPos, terms, pos: first.pos } : first;
  }

  function parseAdd(): Node {
    const first = parseMul();
    const ops: string[] = [];
    const opPos: number[] = [];
    const terms: Node[] = [first];
    while (peekOp("+") || peekOp("-")) {
      const t = takeOp();
      ops.push(t.op);
      opPos.push(t.pos);
      terms.push(parseMul());
    }
    return ops.length ? { t: "chain", kind: "sum", ops, opPos, terms, pos: first.pos } : first;
  }

  function parseMul(): Node {
    const first = parseUnary();
    const ops: string[] = [];
    const opPos: number[] = [];
    const terms: Node[] = [first];
    while (peekOp("*") || peekOp("/") || peekOp("%")) {
      const t = takeOp();
      ops.push(t.op);
      opPos.push(t.pos);
      terms.push(parseUnary());
    }
    return ops.length ? { t: "chain", kind: "prod", ops, opPos, terms, pos: first.pos } : first;
  }

  function parseUnary(): Node {
    const at = toks[i];
    enter(at ? at.pos : src.length);
    try {
      const t = toks[i];
      if (t && t.k === "op" && (t.op === "-" || t.op === "+" || t.op === "!")) {
        i++;
        const e = parseUnary();
        if (t.op === "+") return e; // unary plus is a no-op
        return { t: "un", op: t.op, e, pos: t.pos };
      }
      return parsePower();
    } finally {
      depth -= 1;
    }
  }

  function parsePower(): Node {
    const base = parsePrimary();
    if (peekOp("^")) {
      const p = toks[i].pos;
      i++;
      const exp = parseUnary(); // right-assoc + allows '2^-2'
      return { t: "pow", base, exp, pos: p };
    }
    return base;
  }

  function parsePrimary(): Node {
    const tk = toks[i];
    if (!tk) throw fail("unexpected end of expression", src.length);

    if (tk.k === "num") {
      i++;
      return { t: "num", v: tk.v, pos: tk.pos };
    }

    if (tk.k === "op" && tk.op === "(") {
      i++;
      const e = parseTernary(); // depth counted inside parseTernary
      if (!peekOp(")")) {
        const t = toks[i];
        throw fail("expected ')'", t ? t.pos : src.length);
      }
      i++;
      return e;
    }

    if (tk.k === "id") {
      i++;
      const lc = tk.name.toLowerCase();
      if (lc === "true") return { t: "num", v: 1, pos: tk.pos };
      if (lc === "false") return { t: "num", v: 0, pos: tk.pos };

      if (peekOp("(")) {
        // call position — resolve as function (case-insensitive)
        i++;
        const args: Node[] = [];
        if (!peekOp(")")) {
          for (;;) {
            args.push(parseTernary());
            if (args.length > FORMULA_MAX_ARGS) {
              throw fail(`too many arguments to '${tk.name}' (max ${FORMULA_MAX_ARGS})`, tk.pos);
            }
            if (peekOp(",")) {
              i++;
              continue;
            }
            break;
          }
        }
        if (!peekOp(")")) {
          const t = toks[i];
          throw fail("expected ')' after function arguments", t ? t.pos : src.length);
        }
        i++;
        const spec = FN_ARITY[lc];
        if (!spec) throw fail(`unknown function '${tk.name}'`, tk.pos);
        if (args.length < spec[0] || args.length > spec[1]) {
          const want = spec[0] === spec[1] ? `${spec[0]}` : `${spec[0]}..${spec[1]}`;
          throw fail(`'${tk.name}' expects ${want} argument(s), got ${args.length}`, tk.pos);
        }
        return { t: "call", name: tk.name, nameLc: lc, args, pos: tk.pos };
      }

      varSet.add(tk.name);
      return { t: "var", name: tk.name, pos: tk.pos };
    }

    throw unexpected(tk);
  }

  const root = parseTernary();
  if (i < toks.length) throw unexpected(toks[i]);
  return { root, vars: [...varSet].sort() };
}

// ---------------------------------------------------------------------------
// evaluator — all values are finite doubles; truthy = !== 0
// ---------------------------------------------------------------------------

const truthy = (v: number): boolean => v !== 0;

const finiteChecked = (v: number, pos: number): number => {
  if (!Number.isFinite(v)) throw fail("non-finite result", pos);
  return v;
};

// floored modulo (Excel MOD / Python %): result takes the divisor's sign
const mod = (a: number, b: number, pos: number): number =>
  finiteChecked(a - Math.floor(a / b) * b, pos);

const cmpOp = (op: string, a: number, b: number): boolean => {
  switch (op) {
    case "<": return a < b;
    case "<=": return a <= b;
    case ">": return a > b;
    default: return a >= b; // ">="
  }
};

function resolveVar(name: string, env: FormulaEnv, pos: number): number {
  // own-property lookup ONLY — inherited members (constructor, __proto__,
  // toString, hasOwnProperty, …) can never resolve, so identifier access is
  // injection-safe by construction.
  const has = Object.prototype.hasOwnProperty.call(env, name);
  if (!has) {
    let hint = "";
    for (const k of Object.keys(env)) {
      if (k !== name && k.toLowerCase() === name.toLowerCase()) {
        hint = ` (did you mean '${k}'?)`;
        break;
      }
    }
    throw fail(`unknown variable '${name}'${hint}`, pos);
  }
  const raw = env[name];
  if (
    raw === null ||
    raw === undefined ||
    raw === "" ||
    typeof raw === "object" ||
    typeof raw === "function" ||
    typeof raw === "symbol" ||
    typeof raw === "bigint"
  ) {
    throw fail(`variable '${name}' is not numeric`, pos);
  }
  const v = Number(raw);
  if (!Number.isFinite(v)) throw fail(`variable '${name}' is not a finite number`, pos);
  return v;
}

// scaled rounding helper for round/floor/ceil — fn is applied at the scaled
// level, so `round` passes a half-away-from-zero function (Excel semantics).
function scaleApply(
  argv: number[],
  fn: (v: number) => number,
  pos: number,
): number {
  const x = argv[0];
  let p = 1;
  if (argv.length === 2) {
    const d = Math.trunc(argv[1]);
    const dc = d > 30 ? 30 : d < -30 ? -30 : d;
    p = Math.pow(10, dc);
  }
  return finiteChecked(fn(x * p) / p, pos);
}

const roundHalfAway = (v: number): number => Math.sign(v) * Math.round(Math.abs(v));

function evalCall(n: { name: string; nameLc: string; args: Node[]; pos: number }, env: FormulaEnv): number {
  // `if` is lazy like ?: — only the taken branch evaluates
  if (n.nameLc === "if") {
    return truthy(evalNode(n.args[0], env))
      ? evalNode(n.args[1], env)
      : evalNode(n.args[2], env);
  }
  const argv = n.args.map((a) => evalNode(a, env));
  switch (n.nameLc) {
    case "min": return Math.min(...argv);
    case "max": return Math.max(...argv);
    case "abs": return Math.abs(argv[0]);
    case "sqrt":
      if (argv[0] < 0) throw fail("sqrt of a negative number", n.pos);
      return Math.sqrt(argv[0]);
    case "pow": return finiteChecked(Math.pow(argv[0], argv[1]), n.pos);
    case "round": return scaleApply(argv, roundHalfAway, n.pos);
    case "floor": return scaleApply(argv, Math.floor, n.pos);
    case "ceil":
    case "ceiling": return scaleApply(argv, Math.ceil, n.pos);
    default:
      // unreachable — arity/whitelist enforced at parse time
      throw fail(`unknown function '${n.name}'`, n.pos);
  }
}

function evalNode(n: Node, env: FormulaEnv): number {
  switch (n.t) {
    case "num":
      return n.v;
    case "var":
      return resolveVar(n.name, env, n.pos);
    case "un": {
      const v = evalNode(n.e, env);
      return n.op === "-" ? -v : truthy(v) ? 0 : 1; // '-' or '!'
    }
    case "pow": {
      const b = evalNode(n.base, env);
      const x = evalNode(n.exp, env);
      return finiteChecked(Math.pow(b, x), n.pos);
    }
    case "chain": {
      let acc = evalNode(n.terms[0], env);
      for (let k = 0; k < n.ops.length; k++) {
        const op = n.ops[k];
        const p = n.opPos[k];
        const rhs = evalNode(n.terms[k + 1], env);
        if (n.kind === "sum") {
          acc = finiteChecked(op === "+" ? acc + rhs : acc - rhs, p);
        } else if (n.kind === "prod") {
          if (op === "*") acc = finiteChecked(acc * rhs, p);
          else if (op === "/") {
            if (rhs === 0) throw fail("division by zero", p);
            acc = finiteChecked(acc / rhs, p);
          } else {
            // '%'
            if (rhs === 0) throw fail("modulo by zero", p);
            acc = mod(acc, rhs, p);
          }
        } else if (n.kind === "cmp") {
          acc = cmpOp(op, acc, rhs) ? 1 : 0;
        } else {
          // "eq"
          acc = (op === "==" ? acc === rhs : acc !== rhs) ? 1 : 0;
        }
      }
      return acc;
    }
    case "logic":
      if (n.kind === "and") {
        for (const t of n.terms) if (!truthy(evalNode(t, env))) return 0;
        return 1;
      }
      for (const t of n.terms) if (truthy(evalNode(t, env))) return 1;
      return 0;
    case "cond":
      return truthy(evalNode(n.c, env)) ? evalNode(n.a, env) : evalNode(n.b, env);
    case "call":
      return evalCall(n, env);
  }
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a pricing-modifier formula against `env` (reserved vars, global
 * vars, modifier answers — all supplied by the caller as a plain object).
 * NEVER throws for bad input: every failure is a clean {ok:false,error,pos}.
 */
export function evaluateFormula(src: string, env?: FormulaEnv): FormulaResult {
  try {
    const { root } = parse(src);
    const v = evalNode(root, env ?? {});
    return { ok: true, value: finiteChecked(v, 0) };
  } catch (e) {
    const fe = asFErr(e);
    if (fe) return { ok: false, error: fe.message, pos: fe.pos };
    return {
      ok: false,
      error: `internal evaluator error: ${e instanceof Error ? e.message : String(e)}`,
      pos: 0,
    };
  }
}

/**
 * Parse-check a formula without an env: catches syntax errors, unknown
 * functions, and arity problems, and reports every variable identifier the
 * formula references (sorted, unique). vars found before a syntax error are
 * still returned.
 */
export function validateFormula(src: string): FormulaValidation {
  const vars = new Set<string>();
  try {
    const r = parse(src, vars);
    return { ok: true, errors: [], vars: r.vars };
  } catch (e) {
    const fe = asFErr(e);
    if (fe) {
      return { ok: false, errors: [{ error: fe.message, pos: fe.pos }], vars: [...vars].sort() };
    }
    return {
      ok: false,
      errors: [{ error: `internal evaluator error: ${e instanceof Error ? e.message : String(e)}`, pos: 0 }],
      vars: [...vars].sort(),
    };
  }
}
