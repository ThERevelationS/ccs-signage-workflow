// O-093 (CMP-H02) — feet/inches entry for foundation dimension fields.
//
// Storage stays canonical inches — this module changes ENTRY, never the
// schema. Three layers:
//   parseFoundationDimension      — ft/in text → { ok, inches } (never throws)
//   formatFoundationDimension     — canonical inches → `12' 6"` display
//   foundationDimensionDraftValue — the write-side boundary (same contract as
//                                   inventoryDraftInput: blank stays "", a
//                                   parseable draft commits canonical inches,
//                                   a malformed draft is stored VERBATIM so
//                                   field diagnostics — not silent coercion —
//                                   report it)
//   FoundationDimensionInput      — the shared controlled field component
//                                   (createElement, no JSX — this file stays
//                                   a plain .js model+widget module)
//
// Accepted entry forms (case/spacing tolerant, marks ' ′ ’ ‘ ` ´ and " ″ ” “):
//   150 | 150" | 12 | 12.5        — bare number / inch-marked → inches
//   12' | 12.5' | 6'              — feet-marked → ×12
//   12' 6" | 12'6" | 12'6 | 12'-6" — feet + inches
//   12 6 | 12 6" | -12 6 | 12-6"   — pair forms (feet + inches)
//   3/8 | 3/8" | 6 1/2" | 1 1/2   — fractions in the inches position
//   12 6 1/2 | 12' 6 1/2"         — feet + mixed-fraction inches
//   -4' | -27                     — leading sign (offset fields may be signed)
// Ambiguity rules (documented, deterministic):
//   • a bare two-token pair is feet + inches — `12 6` → 150, never 12.6;
//   • when the second token of a pair is a fraction, the pair is a mixed inch
//     number — `1 1/2` → 1.5, `12 1/2` → 12.5, `6-1/2"` → 6.5;
//   • inside `'` marks the dash is a separator (`12'-6"` → 150); a leading dash
//     before the whole entry is the sign;
//   • the inches part is never clamped — `12' 13"` → 157 (authored sum).
// Rejects (ok:false, draft stays verbatim → inline issue): blank handled by the
// draft boundary, `abc`, `12abc`, `1e3`, `12..5`, `5/0`, `'`, `12'6"7`, extra
// marks, embedded signs, 4+ tokens. Field positivity stays with the existing
// calc validation — this parser is syntax→inches only.

import { createElement as h, useId, useState } from "react";
import { Input } from "@/components/ui/input";

const FT_MARKS = /['′’‘`´]/g;
const IN_MARKS = /["″”]/g;

const DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
// A number token: decimal | `a/b` fraction | `a b/c` mixed fraction → number|null.
const dimensionNumberToken = (text) => {
  const t = String(text).trim();
  if (t === "") return null;
  if (DECIMAL.test(t)) {
    const v = Number(t);
    return Number.isFinite(v) ? v : null;
  }
  const frac = t.match(/^(\d+(?:\.\d*)?|\.\d+)\s*\/\s*(\d+(?:\.\d*)?|\.\d+)$/);
  if (frac) {
    const den = Number(frac[2]);
    if (!Number.isFinite(den) || den === 0) return null;
    const v = Number(frac[1]) / den;
    return Number.isFinite(v) ? v : null;
  }
  const mixed = t.match(/^(\d+(?:\.\d*)?|\.\d+)\s+(\d+(?:\.\d*)?|\.\d+)\s*\/\s*(\d+(?:\.\d*)?|\.\d+)$/);
  if (mixed) {
    const den = Number(mixed[3]);
    if (!Number.isFinite(den) || den === 0) return null;
    const v = Number(mixed[1]) + Number(mixed[2]) / den;
    return Number.isFinite(v) ? v : null;
  }
  return null;
};

// `12-6"` → feet+inches [12,6]; `6-1/2"` is a handwritten mixed inch → [0,6.5].
const dashPair = (body) => {
  const i = body.indexOf("-");
  if (i < 0) return null;
  const left = body.slice(0, i);
  const right = body.slice(i + 1);
  if (left === "" || right === "" || right.includes("-")) return null;
  const a = dimensionNumberToken(left);
  const b = dimensionNumberToken(right);
  if (a === null || b === null) return null;
  return right.includes("/") ? [0, a + b] : [a, b];
};

const spacePair = (body) => {
  const parts = body.split(" ").filter((p) => p !== "");
  if (parts.length !== 2 || parts[1].includes("/")) return null;
  const a = dimensionNumberToken(parts[0]);
  const b = dimensionNumberToken(parts[1]);
  return a === null || b === null ? null : [a, b];
};

export function parseFoundationDimension(text) {
  if (typeof text === "number") {
    return Number.isFinite(text)
      ? { ok: true, inches: text }
      : { ok: false, reason: "not_finite" };
  }
  if (typeof text !== "string") return { ok: false, reason: "not_text" };
  let s = text.trim();
  if (s === "") return { ok: false, reason: "blank" };
  s = s.replace(FT_MARKS, "'").replace(IN_MARKS, '"').replace(/\s+/g, " ");

  let sign = 1;
  const leading = s.match(/^[+-]\s*/);
  if (leading) {
    if (leading[0][0] === "-") sign = -1;
    s = s.slice(leading[0].length);
  }
  if (s === "") return { ok: false, reason: "blank" };

  const total = (feet, inches) => {
    const v = sign * (feet * 12 + inches);
    return Number.isFinite(v) ? { ok: true, inches: v } : { ok: false, reason: "not_finite" };
  };

  // feet-mark form: <feet>' [ - ] <inches> [ " ]
  if (s.includes("'")) {
    const parts = s.split("'");
    if (parts.length !== 2) return { ok: false, reason: "bad_marks" };
    const feet = dimensionNumberToken(parts[0]);
    if (feet === null) return { ok: false, reason: "feet" };
    let rest = parts[1].trim();
    const separator = rest.match(/^[+-]\s*/);
    if (separator) rest = rest.slice(separator[0].length).trim();
    if (rest.endsWith('"')) rest = rest.slice(0, -1).trim();
    if (rest.includes('"') || rest.includes("'")) return { ok: false, reason: "bad_marks" };
    const inches = rest === "" ? 0 : dimensionNumberToken(rest);
    if (inches === null) return { ok: false, reason: "inches" };
    return total(feet, inches);
  }

  // inch-mark form: <number|mixed|pair>" — mark must be the last char.
  if (s.includes('"')) {
    if (!s.endsWith('"')) return { ok: false, reason: "bad_marks" };
    const body = s.slice(0, -1).trim();
    if (body === "" || body.includes('"') || body.includes("'")) {
      return { ok: false, reason: "bad_marks" };
    }
    const direct = dimensionNumberToken(body);
    if (direct !== null) return { ok: true, inches: sign * direct };
    const pair = dashPair(body) ?? spacePair(body);
    if (pair) return total(pair[0], pair[1]);
    return { ok: false, reason: "inches" };
  }

  // bare forms: number | fraction | mixed | feet+inches pair(s)
  const tokens = s.split(" ");
  if (tokens.length === 1) {
    const v = dimensionNumberToken(tokens[0]);
    return v === null
      ? { ok: false, reason: "inches" }
      : { ok: true, inches: sign * v };
  }
  if (tokens.length === 2) {
    if (tokens[1].includes("/")) {
      // `1 1/2` / `12 1/2` — a mixed inch number, not a feet pair.
      const v = dimensionNumberToken(`${tokens[0]} ${tokens[1]}`);
      return v === null
        ? { ok: false, reason: "inches" }
        : { ok: true, inches: sign * v };
    }
    const feet = dimensionNumberToken(tokens[0]);
    const inches = dimensionNumberToken(tokens[1]);
    if (feet === null || inches === null) return { ok: false, reason: "pair" };
    return total(feet, inches);
  }
  if (tokens.length === 3) {
    // `12 6 1/2` — feet + mixed-fraction inches.
    const feet = dimensionNumberToken(tokens[0]);
    const inches = dimensionNumberToken(`${tokens[1]} ${tokens[2]}`);
    if (feet === null || inches === null) return { ok: false, reason: "pair" };
    return total(feet, inches);
  }
  return { ok: false, reason: "tokens" };
}

// Canonical inches → `12' 6"` / `12'` / `6.5"` / `0.375"` / `-2' 3"`.
// Sub-foot values stay inch-only; whole feet drop the inch part; fractional
// inches print as decimals (never invented fraction glyphs).
export function formatFoundationDimension(inches) {
  if (!Number.isFinite(inches)) return "";
  const sign = inches < 0 ? "-" : "";
  const magnitude = Math.abs(inches);
  const feet = Math.floor(magnitude / 12);
  const rest = Math.round((magnitude - feet * 12) * 10000) / 10000;
  if (feet === 0) return `${sign}${rest}"`;
  if (rest === 0) return `${sign}${feet}'`;
  return `${sign}${feet}' ${rest}"`;
}

// Write-side draft boundary — drop-in replacement for inventoryDraftInput on
// linear-dimension fields. Blank stays "", a parseable draft commits canonical
// inches, a malformed draft is stored verbatim so the field diagnostics report
// it — never silent coercion, never a minted 0.
export const foundationDimensionDraftValue = (text) => {
  if (typeof text !== "string") return text;
  if (text.trim() === "") return "";
  const parsed = parseFoundationDimension(text);
  return parsed.ok ? parsed.inches : text;
};

// Unfocused display for a stored value: canonical inches → ft/in text,
// verbatim draft strings echo back for correction, absent → blank.
export const foundationDimensionStoredText = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? formatFoundationDimension(value)
    : value === null || value === undefined
      ? ""
      : String(value);

export const FOUNDATION_DIMENSION_FORMAT_HELP =
  "inches (150) or feet/inches like 12' 6\", 12.5', 12 6, or 3/8\"";

// Inline issue for a stored draft that never parsed — the specific ft/in hint
// layered on top of the calc layer's generic unavailable/dimension issues.
export const foundationDimensionInputIssue = (value) =>
  typeof value === "string" && value.trim() !== ""
    ? `Not a recognized measurement — enter ${FOUNDATION_DIMENSION_FORMAT_HELP}.`
    : null;

// Shared controlled dimension field (createElement — .js module, no JSX).
// While focused the user edits a draft string so partial ft/in text never
// snaps mid-typing; every keystroke still commits through
// foundationDimensionDraftValue (canonical inches or verbatim), exactly like
// the numeric inputs it replaces. On blur the display settles to the stored
// value — canonical inches render as `12' 6"`, malformed drafts echo back
// with the inline syntax hint. `title` carries the field help (the existing
// tooltip seam) and the same help reveals under the field while focused.
export function FoundationDimensionInput({
  label,
  help,
  value,
  onCommit,
  placeholder,
  invalid,
  describedBy,
  ariaLabel,
  id,
  disabled,
  labelClassName,
  inputClassName,
}) {
  const [editing, setEditing] = useState(null); // null → show stored; string → draft
  const autoId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const base = id ?? `dim-${autoId}`;
  const hint = foundationDimensionInputIssue(value);
  const hintId = `${base}-dimhint`;
  const helpId = `${base}-dimhelp`;
  const described = [
    describedBy,
    hint ? hintId : null,
    editing !== null && help ? helpId : null,
  ].filter(Boolean).join(" ") || undefined;
  return h(
    "label",
    { className: labelClassName ?? "text-xs text-gray-500" },
    label,
    h(Input, {
      id,
      type: "text",
      // full keyboard: the ft/in marks ( ' " - space / ) are the feature —
      // decimal/numeric pads would lock them out on mobile.
      inputMode: "text",
      disabled,
      className: inputClassName,
      value: editing !== null ? editing : foundationDimensionStoredText(value),
      placeholder,
      title: help,
      "aria-label": ariaLabel ?? (typeof label === "string" ? label : undefined),
      "aria-invalid": invalid || !!hint || undefined,
      "aria-describedby": described,
      onFocus: () => setEditing(foundationDimensionStoredText(value)),
      onChange: (e) => {
        setEditing(e.target.value);
        onCommit(foundationDimensionDraftValue(e.target.value));
      },
      onBlur: () => setEditing(null),
    }),
    hint
      ? h("span", {
          id: hintId,
          role: "status",
          className: "block text-[10px] text-amber-700 mt-0.5",
        }, hint)
      : null,
    editing !== null && help
      ? h("span", {
          id: helpId,
          className: "block text-[10px] text-gray-400 mt-0.5",
        }, help)
      : null,
  );
}
