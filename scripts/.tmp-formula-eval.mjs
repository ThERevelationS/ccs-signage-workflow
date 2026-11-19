// base44/shared/formulaEval.ts
var FORMULA_RESERVED_VARS = [
  "PartBaseCost",
  "PartRetail",
  "Width",
  "Height",
  "Depth",
  "Quantity",
  "StitchCount"
];
var FORMULA_FUNCTIONS = [
  "min",
  "max",
  "round",
  "floor",
  "ceil",
  "ceiling",
  "abs",
  "sqrt",
  "pow",
  "if"
];
var FORMULA_MAX_SOURCE_LEN = 1e4;
var FORMULA_MAX_NESTING = 100;
var FORMULA_MAX_ARGS = 64;
var fail = (message, pos) => ({ fe: true, message, pos });
var asFErr = (e) => e !== null && typeof e === "object" && e.fe === true ? e : null;
var isDigitCode = (c) => c >= 48 && c <= 57;
var isIdStartCode = (c) => c >= 65 && c <= 90 || c >= 97 && c <= 122 || c === 95;
var isIdCharCode = (c) => isIdStartCode(c) || isDigitCode(c);
var isSpaceCode = (c) => c === 32 || c === 9 || c === 10 || c === 13;
var SINGLE_OPS = "+-*/%^(),?:<>!";
function tokenize(src) {
  const toks = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const ch = src[i];
    const code = src.charCodeAt(i);
    if (isSpaceCode(code)) {
      i++;
      continue;
    }
    if (isDigitCode(code) || ch === "." && i + 1 < n && isDigitCode(src.charCodeAt(i + 1))) {
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
var FN_ARITY = {
  min: [1, FORMULA_MAX_ARGS],
  max: [1, FORMULA_MAX_ARGS],
  round: [1, 2],
  floor: [1, 2],
  ceil: [1, 2],
  ceiling: [1, 2],
  abs: [1, 1],
  sqrt: [1, 1],
  pow: [2, 2],
  if: [3, 3]
};
function parse(src, intoVars) {
  if (typeof src !== "string") throw fail("formula must be a string", 0);
  if (src.length > FORMULA_MAX_SOURCE_LEN) {
    throw fail(`formula too long (max ${FORMULA_MAX_SOURCE_LEN} characters)`, FORMULA_MAX_SOURCE_LEN);
  }
  const toks = tokenize(src);
  if (toks.length === 0) throw fail("empty formula", 0);
  let i = 0;
  let depth = 0;
  const varSet = intoVars ?? /* @__PURE__ */ new Set();
  const peekOp = (op) => {
    const t = toks[i];
    return !!t && t.k === "op" && t.op === op;
  };
  const enter = (pos) => {
    depth += 1;
    if (depth > FORMULA_MAX_NESTING) throw fail("expression too deeply nested", pos);
  };
  const describeTok = (t) => {
    if (t.k === "num") return `number ${t.v}`;
    if (t.k === "id") return `identifier '${t.name}'`;
    return `operator '${t.op}'`;
  };
  const unexpected = (t) => t === void 0 ? fail("unexpected end of expression", src.length) : fail(`unexpected ${describeTok(t)}`, t.pos);
  const takeOp = () => {
    const t = toks[i];
    i++;
    return t;
  };
  function parseTernary() {
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
  function parseOr() {
    const first = parseAnd();
    const terms = [first];
    while (peekOp("||")) {
      i++;
      terms.push(parseAnd());
    }
    return terms.length > 1 ? { t: "logic", kind: "or", terms, pos: first.pos } : first;
  }
  function parseAnd() {
    const first = parseEq();
    const terms = [first];
    while (peekOp("&&")) {
      i++;
      terms.push(parseEq());
    }
    return terms.length > 1 ? { t: "logic", kind: "and", terms, pos: first.pos } : first;
  }
  function parseEq() {
    const first = parseCmp();
    const ops = [];
    const opPos = [];
    const terms = [first];
    while (peekOp("==") || peekOp("!=")) {
      const t = takeOp();
      ops.push(t.op);
      opPos.push(t.pos);
      terms.push(parseCmp());
    }
    return ops.length ? { t: "chain", kind: "eq", ops, opPos, terms, pos: first.pos } : first;
  }
  function parseCmp() {
    const first = parseAdd();
    const ops = [];
    const opPos = [];
    const terms = [first];
    while (peekOp("<") || peekOp("<=") || peekOp(">") || peekOp(">=")) {
      const t = takeOp();
      ops.push(t.op);
      opPos.push(t.pos);
      terms.push(parseAdd());
    }
    return ops.length ? { t: "chain", kind: "cmp", ops, opPos, terms, pos: first.pos } : first;
  }
  function parseAdd() {
    const first = parseMul();
    const ops = [];
    const opPos = [];
    const terms = [first];
    while (peekOp("+") || peekOp("-")) {
      const t = takeOp();
      ops.push(t.op);
      opPos.push(t.pos);
      terms.push(parseMul());
    }
    return ops.length ? { t: "chain", kind: "sum", ops, opPos, terms, pos: first.pos } : first;
  }
  function parseMul() {
    const first = parseUnary();
    const ops = [];
    const opPos = [];
    const terms = [first];
    while (peekOp("*") || peekOp("/") || peekOp("%")) {
      const t = takeOp();
      ops.push(t.op);
      opPos.push(t.pos);
      terms.push(parseUnary());
    }
    return ops.length ? { t: "chain", kind: "prod", ops, opPos, terms, pos: first.pos } : first;
  }
  function parseUnary() {
    const at = toks[i];
    enter(at ? at.pos : src.length);
    try {
      const t = toks[i];
      if (t && t.k === "op" && (t.op === "-" || t.op === "+" || t.op === "!")) {
        i++;
        const e = parseUnary();
        if (t.op === "+") return e;
        return { t: "un", op: t.op, e, pos: t.pos };
      }
      return parsePower();
    } finally {
      depth -= 1;
    }
  }
  function parsePower() {
    const base = parsePrimary();
    if (peekOp("^")) {
      const p = toks[i].pos;
      i++;
      const exp = parseUnary();
      return { t: "pow", base, exp, pos: p };
    }
    return base;
  }
  function parsePrimary() {
    const tk = toks[i];
    if (!tk) throw fail("unexpected end of expression", src.length);
    if (tk.k === "num") {
      i++;
      return { t: "num", v: tk.v, pos: tk.pos };
    }
    if (tk.k === "op" && tk.op === "(") {
      i++;
      const e = parseTernary();
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
        i++;
        const args = [];
        if (!peekOp(")")) {
          for (; ; ) {
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
var truthy = (v) => v !== 0;
var finiteChecked = (v, pos) => {
  if (!Number.isFinite(v)) throw fail("non-finite result", pos);
  return v;
};
var mod = (a, b, pos) => finiteChecked(a - Math.floor(a / b) * b, pos);
var cmpOp = (op, a, b) => {
  switch (op) {
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    default:
      return a >= b;
  }
};
function resolveVar(name, env, pos) {
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
  if (raw === null || raw === void 0 || raw === "" || typeof raw === "object" || typeof raw === "function" || typeof raw === "symbol" || typeof raw === "bigint") {
    throw fail(`variable '${name}' is not numeric`, pos);
  }
  const v = Number(raw);
  if (!Number.isFinite(v)) throw fail(`variable '${name}' is not a finite number`, pos);
  return v;
}
function scaleApply(argv, fn, pos) {
  const x = argv[0];
  let p = 1;
  if (argv.length === 2) {
    const d = Math.trunc(argv[1]);
    const dc = d > 30 ? 30 : d < -30 ? -30 : d;
    p = Math.pow(10, dc);
  }
  return finiteChecked(fn(x * p) / p, pos);
}
var roundHalfAway = (v) => Math.sign(v) * Math.round(Math.abs(v));
function evalCall(n, env) {
  if (n.nameLc === "if") {
    return truthy(evalNode(n.args[0], env)) ? evalNode(n.args[1], env) : evalNode(n.args[2], env);
  }
  const argv = n.args.map((a) => evalNode(a, env));
  switch (n.nameLc) {
    case "min":
      return Math.min(...argv);
    case "max":
      return Math.max(...argv);
    case "abs":
      return Math.abs(argv[0]);
    case "sqrt":
      if (argv[0] < 0) throw fail("sqrt of a negative number", n.pos);
      return Math.sqrt(argv[0]);
    case "pow":
      return finiteChecked(Math.pow(argv[0], argv[1]), n.pos);
    case "round":
      return scaleApply(argv, roundHalfAway, n.pos);
    case "floor":
      return scaleApply(argv, Math.floor, n.pos);
    case "ceil":
    case "ceiling":
      return scaleApply(argv, Math.ceil, n.pos);
    default:
      throw fail(`unknown function '${n.name}'`, n.pos);
  }
}
function evalNode(n, env) {
  switch (n.t) {
    case "num":
      return n.v;
    case "var":
      return resolveVar(n.name, env, n.pos);
    case "un": {
      const v = evalNode(n.e, env);
      return n.op === "-" ? -v : truthy(v) ? 0 : 1;
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
            if (rhs === 0) throw fail("modulo by zero", p);
            acc = mod(acc, rhs, p);
          }
        } else if (n.kind === "cmp") {
          acc = cmpOp(op, acc, rhs) ? 1 : 0;
        } else {
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
function evaluateFormula(src, env) {
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
      pos: 0
    };
  }
}
function validateFormula(src) {
  const vars = /* @__PURE__ */ new Set();
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
      vars: [...vars].sort()
    };
  }
}
export {
  FORMULA_FUNCTIONS,
  FORMULA_MAX_ARGS,
  FORMULA_MAX_NESTING,
  FORMULA_MAX_SOURCE_LEN,
  FORMULA_RESERVED_VARS,
  evaluateFormula,
  validateFormula
};
