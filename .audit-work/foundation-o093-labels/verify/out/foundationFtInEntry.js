// stub:react-stub
var useState = (v) => [v, () => {
}];
var useId = () => "t1";
var createElement = () => null;

// stub:input-stub
var Input = () => null;

// .audit-work/foundation-o093-labels/candidates/foundationFtInEntry.js
var FT_MARKS = /['′’‘`´]/g;
var IN_MARKS = /["″”]/g;
var DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
var dimensionNumberToken = (text) => {
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
var dashPair = (body) => {
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
var spacePair = (body) => {
  const parts = body.split(" ").filter((p) => p !== "");
  if (parts.length !== 2 || parts[1].includes("/")) return null;
  const a = dimensionNumberToken(parts[0]);
  const b = dimensionNumberToken(parts[1]);
  return a === null || b === null ? null : [a, b];
};
function parseFoundationDimension(text) {
  if (typeof text === "number") {
    return Number.isFinite(text) ? { ok: true, inches: text } : { ok: false, reason: "not_finite" };
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
  const tokens = s.split(" ");
  if (tokens.length === 1) {
    const v = dimensionNumberToken(tokens[0]);
    return v === null ? { ok: false, reason: "inches" } : { ok: true, inches: sign * v };
  }
  if (tokens.length === 2) {
    if (tokens[1].includes("/")) {
      const v = dimensionNumberToken(`${tokens[0]} ${tokens[1]}`);
      return v === null ? { ok: false, reason: "inches" } : { ok: true, inches: sign * v };
    }
    const feet = dimensionNumberToken(tokens[0]);
    const inches = dimensionNumberToken(tokens[1]);
    if (feet === null || inches === null) return { ok: false, reason: "pair" };
    return total(feet, inches);
  }
  if (tokens.length === 3) {
    const feet = dimensionNumberToken(tokens[0]);
    const inches = dimensionNumberToken(`${tokens[1]} ${tokens[2]}`);
    if (feet === null || inches === null) return { ok: false, reason: "pair" };
    return total(feet, inches);
  }
  return { ok: false, reason: "tokens" };
}
function formatFoundationDimension(inches) {
  if (!Number.isFinite(inches)) return "";
  const sign = inches < 0 ? "-" : "";
  const magnitude = Math.abs(inches);
  const feet = Math.floor(magnitude / 12);
  const rest = Math.round((magnitude - feet * 12) * 1e4) / 1e4;
  if (feet === 0) return `${sign}${rest}"`;
  if (rest === 0) return `${sign}${feet}'`;
  return `${sign}${feet}' ${rest}"`;
}
var foundationDimensionDraftValue = (text) => {
  if (typeof text !== "string") return text;
  if (text.trim() === "") return "";
  const parsed = parseFoundationDimension(text);
  return parsed.ok ? parsed.inches : text;
};
var foundationDimensionStoredText = (value) => typeof value === "number" && Number.isFinite(value) ? formatFoundationDimension(value) : value === null || value === void 0 ? "" : String(value);
var FOUNDATION_DIMENSION_FORMAT_HELP = `inches (150) or feet/inches like 12' 6", 12.5', 12 6, or 3/8"`;
var foundationDimensionInputIssue = (value) => typeof value === "string" && value.trim() !== "" ? `Not a recognized measurement \u2014 enter ${FOUNDATION_DIMENSION_FORMAT_HELP}.` : null;
function FoundationDimensionInput({
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
  inputClassName
}) {
  const [editing, setEditing] = useState(null);
  const autoId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const base = id ?? `dim-${autoId}`;
  const hint = foundationDimensionInputIssue(value);
  const hintId = `${base}-dimhint`;
  const helpId = `${base}-dimhelp`;
  const described = [
    describedBy,
    hint ? hintId : null,
    editing !== null && help ? helpId : null
  ].filter(Boolean).join(" ") || void 0;
  return createElement(
    "label",
    { className: labelClassName ?? "text-xs text-gray-500" },
    label,
    createElement(Input, {
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
      "aria-label": ariaLabel ?? (typeof label === "string" ? label : void 0),
      "aria-invalid": invalid || !!hint || void 0,
      "aria-describedby": described,
      onFocus: () => setEditing(foundationDimensionStoredText(value)),
      onChange: (e) => {
        setEditing(e.target.value);
        onCommit(foundationDimensionDraftValue(e.target.value));
      },
      onBlur: () => setEditing(null)
    }),
    hint ? createElement("span", {
      id: hintId,
      role: "status",
      className: "block text-[10px] text-amber-700 mt-0.5"
    }, hint) : null,
    editing !== null && help ? createElement("span", {
      id: helpId,
      className: "block text-[10px] text-gray-400 mt-0.5"
    }, help) : null
  );
}
export {
  FOUNDATION_DIMENSION_FORMAT_HELP,
  FoundationDimensionInput,
  formatFoundationDimension,
  foundationDimensionDraftValue,
  foundationDimensionInputIssue,
  foundationDimensionStoredText,
  parseFoundationDimension
};
