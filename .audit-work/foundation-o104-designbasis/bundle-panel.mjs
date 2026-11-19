// .audit-work/foundation-o104-designbasis/candidates/FoundationDesignBasisPanel.jsx
import { useState } from "react";

// stub:@/components/ui/input
import React from "react";
var Input = React.forwardRef((p, ref) => React.createElement("input", { ...p, ref }));

// stub:lucide-react
var Landmark = () => null;
var Lock = () => null;
var LockOpen = () => null;
var MapPin = () => null;

// .audit-work/foundation-o104-designbasis/candidates/foundationDesignBasis.js
var DESIGN_BASIS_VERSION = 1;
var SITE_HAZARD_VERSION = 1;
var WRITABLE_SOURCES = ["manual", "official_report"];
var HAZARD_UNITS = ["imperial", "metric"];
var RISK_CATEGORIES = ["I", "II", "III", "IV"];
var EXPOSURE_CATEGORIES = ["B", "C", "D"];
var isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var isoNow = (now) => typeof now === "string" && Number.isFinite(Date.parse(now)) ? now : (/* @__PURE__ */ new Date()).toISOString();
var BASIS_TEXT_KEYS = ["code_edition", "jurisdiction", "basis_notes"];
var BASIS_CONTENT_KEYS = [...BASIS_TEXT_KEYS, "code_edition_prior", "basis_source"];
var mergeTextFields = (cur, fields, keys) => {
  const next = { ...cur };
  for (const k of keys) {
    if (!(k in fields)) continue;
    const v = fields[k];
    if (v === "" || v === void 0 || v === null) delete next[k];
    else next[k] = v;
  }
  return next;
};
var hasBasisContent = (b) => isRecord(b) && [b.code_edition, b.jurisdiction, b.basis_notes].some(
  (v) => typeof v === "string" && v.trim() !== ""
);
var BASIS_AUDIT_KEYS = ["version", "basis_captured_at", "basis_updated_at", "basis_source"];
var HAZARD_AUDIT_KEYS = ["version", "input_timestamp", "entry_method"];
var hasSubstance = (o, auditKeys) => isRecord(o) && Object.keys(o).some((k) => !auditKeys.includes(k));
var stableSans = (obj, omitKeys) => {
  const out = {};
  for (const k of Object.keys(obj || {}).sort()) {
    if (omitKeys.includes(k)) continue;
    out[k] = obj[k];
  }
  return JSON.stringify(out);
};
function sanitizeDesignBasisWrite(current, fields = {}, { now, confirmed = false } = {}) {
  const cur = isRecord(current) ? current : {};
  const issues = [];
  const touchesContent = BASIS_CONTENT_KEYS.some((k) => k in fields);
  const touchesLock = "basis_locked" in fields;
  if (cur.basis_locked === true && confirmed !== true && (touchesContent || fields.basis_locked === false)) {
    return {
      rejected: "basis_locked",
      next: cur,
      changed: false,
      issues: [
        {
          code: "basis_locked",
          field: "basis_locked",
          message: "Design basis is locked; confirm the re-capture before editing it."
        }
      ]
    };
  }
  const next = mergeTextFields(cur, fields, BASIS_TEXT_KEYS);
  if ("code_edition" in fields && typeof cur.code_edition === "string" && cur.code_edition !== "" && fields.code_edition !== cur.code_edition) {
    next.code_edition_prior = cur.code_edition;
  } else if ("code_edition_prior" in fields) {
    if (fields.code_edition_prior === "" || fields.code_edition_prior === null)
      delete next.code_edition_prior;
    else next.code_edition_prior = fields.code_edition_prior;
  }
  if ("basis_source" in fields) {
    if (fields.basis_source === "api") {
      issues.push({
        code: "basis_source_reserved",
        field: "basis_source",
        message: "'api' provenance is reserved for a future automation writer; recorded 'manual'."
      });
      next.basis_source = "manual";
    } else if (WRITABLE_SOURCES.includes(fields.basis_source)) {
      next.basis_source = fields.basis_source;
    } else {
      next.basis_source = "manual";
    }
  } else if (touchesContent && (hasSubstance(next, BASIS_AUDIT_KEYS) || hasSubstance(cur, BASIS_AUDIT_KEYS))) {
    next.basis_source = "manual";
  }
  if (touchesLock) {
    if (fields.basis_locked === true) next.basis_locked = true;
    else delete next.basis_locked;
  }
  if (next.basis_locked === true && !hasBasisContent(next) && !next.basis_captured_at) {
    delete next.basis_locked;
    if (fields.basis_locked === true) {
      issues.push({
        code: "basis_lock_nothing",
        field: "basis_locked",
        message: "Nothing is recorded to lock yet \u2014 capture edition or jurisdiction first."
      });
    }
  }
  const CHURN_KEYS = ["basis_updated_at"];
  if (stableSans(next, CHURN_KEYS) === stableSans(cur, CHURN_KEYS)) {
    return { next: cur, changed: false, issues };
  }
  next.basis_captured_at = typeof cur.basis_captured_at === "string" && cur.basis_captured_at ? cur.basis_captured_at : isoNow(now);
  next.basis_updated_at = isoNow(now);
  next.version = DESIGN_BASIS_VERSION;
  const contentKeys = Object.keys(next).filter(
    (k) => !["version", "basis_captured_at", "basis_updated_at", "basis_source"].includes(k)
  );
  if (contentKeys.length === 0) {
    return { next: void 0, changed: true, issues };
  }
  return { next, changed: true, issues };
}
function sanitizeSiteHazardWrite(current, fields = {}, { now } = {}) {
  const cur = isRecord(current) ? current : {};
  const issues = [];
  const next = { ...cur };
  for (const k of ["latitude", "longitude"]) {
    if (!(k in fields)) continue;
    const v = fields[k];
    if (v === null || v === "" || v === void 0) {
      next[k] = null;
      continue;
    }
    const n = Number(v);
    const [lo, hi] = k === "latitude" ? [-90, 90] : [-180, 180];
    if (!Number.isFinite(n) || n < lo || n > hi) {
      issues.push({
        code: `${k}_invalid`,
        field: k,
        message: `${k === "latitude" ? "Latitude" : "Longitude"} must be a number between ${lo} and ${hi}; the value was not recorded.`
      });
      continue;
    }
    next[k] = n;
  }
  const enumField = (key, allowed, label) => {
    if (!(key in fields)) return;
    const v = fields[key];
    if (v === "" || v === void 0 || v === null) {
      delete next[key];
      return;
    }
    if (!allowed.includes(v)) {
      issues.push({
        code: `${key}_invalid`,
        field: key,
        message: `${label} must be one of ${allowed.join("/")}; the value was not recorded.`
      });
      return;
    }
    next[key] = v;
  };
  enumField("units", HAZARD_UNITS, "Units");
  enumField("risk_category", RISK_CATEGORIES, "Risk category");
  enumField("exposure_category", EXPOSURE_CATEGORIES, "Exposure category");
  if ("exposure_assumption" in fields) {
    if (fields.exposure_assumption === "" || fields.exposure_assumption === null)
      delete next.exposure_assumption;
    else next.exposure_assumption = fields.exposure_assumption;
  }
  const touchesContent = [
    "latitude",
    "longitude",
    "units",
    "risk_category",
    "exposure_category",
    "exposure_assumption",
    "entry_method"
  ].some((k) => k in fields);
  if ("entry_method" in fields) {
    if (fields.entry_method === "api") {
      issues.push({
        code: "entry_method_reserved",
        field: "entry_method",
        message: "'api' provenance is reserved for a future automation writer; recorded 'manual'."
      });
      next.entry_method = "manual";
    } else if (WRITABLE_SOURCES.includes(fields.entry_method)) {
      next.entry_method = fields.entry_method;
    } else {
      next.entry_method = "manual";
    }
  } else if (touchesContent && (hasSubstance(next, HAZARD_AUDIT_KEYS) || hasSubstance(cur, HAZARD_AUDIT_KEYS))) {
    next.entry_method = "manual";
  }
  const CHURN_KEYS = ["input_timestamp"];
  if (stableSans(next, CHURN_KEYS) === stableSans(cur, CHURN_KEYS)) {
    return { next: cur, changed: false, issues };
  }
  next.input_timestamp = isoNow(now);
  next.version = SITE_HAZARD_VERSION;
  const contentKeys = Object.keys(next).filter(
    (k) => !["version", "input_timestamp", "entry_method"].includes(k)
  );
  if (contentKeys.length === 0) {
    return { next: void 0, changed: true, issues };
  }
  return { next, changed: true, issues };
}

// .audit-work/foundation-o104-designbasis/candidates/FoundationDesignBasisPanel.jsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var CODE_EDITION_SUGGESTIONS = [
  "ASCE 7-16",
  "ASCE 7-22",
  "IBC 2018",
  "IBC 2021",
  "IBC 2024",
  "OBC 2017",
  "OBC 2019",
  "OBC 2024"
];
var fmtTs = (ts) => {
  const t = typeof ts === "string" ? Date.parse(ts) : NaN;
  return Number.isFinite(t) ? new Date(t).toLocaleString() : "\u2014";
};
function EditionInput({ value, disabled, onCommit }) {
  const [draft, setDraft] = useState(null);
  const shown = draft !== null ? draft : value ?? "";
  const commit = () => {
    if (draft === null) return;
    const v = draft;
    setDraft(null);
    if (v !== (value ?? "")) onCommit(v);
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      Input,
      {
        list: "foundation-code-editions",
        placeholder: "Locally adopted edition \u2014 e.g. ASCE 7-16",
        value: shown,
        disabled,
        onChange: (e) => setDraft(e.target.value),
        onBlur: commit,
        onKeyDown: (e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        },
        className: "h-[30px] text-[12px] mt-0.5"
      }
    ),
    /* @__PURE__ */ jsx("datalist", { id: "foundation-code-editions", children: CODE_EDITION_SUGGESTIONS.map((s) => /* @__PURE__ */ jsx("option", { value: s }, s)) })
  ] });
}
function CoordInput({ label, value, onCommit }) {
  const [draft, setDraft] = useState(null);
  const shown = draft !== null ? draft : value === null || value === void 0 ? "" : String(value);
  return /* @__PURE__ */ jsxs("label", { className: "text-[11px] text-gray-500 block", children: [
    label,
    /* @__PURE__ */ jsx(
      Input,
      {
        inputMode: "decimal",
        placeholder: "\u2014",
        value: shown,
        onChange: (e) => {
          const t = e.target.value;
          setDraft(t);
          if (t.trim() === "") onCommit(null);
          else {
            const n = Number(t);
            if (Number.isFinite(n)) onCommit(n);
          }
        },
        onBlur: () => setDraft(null),
        className: "h-[30px] text-[12px] mt-0.5"
      }
    )
  ] });
}
var selectCls = "flex h-[30px] w-full rounded-md border border-input bg-transparent px-2 text-[12px] shadow-sm disabled:bg-gray-100";
function FoundationDesignBasisPanel({ project, onChange }) {
  const basis = project?.design_basis && typeof project.design_basis === "object" ? project.design_basis : void 0;
  const hazard = project?.site_hazard && typeof project.site_hazard === "object" ? project.site_hazard : void 0;
  const locked = basis?.basis_locked === true;
  const [armedFor, setArmedFor] = useState(null);
  const armed = armedFor === project?.id;
  const gated = locked && !armed;
  const [sourceSelState, setSourceSelState] = useState({ id: null, v: null });
  const [entrySelState, setEntrySelState] = useState({ id: null, v: null });
  const sourceSel = sourceSelState.id === project?.id ? sourceSelState.v : null;
  const entrySel = entrySelState.id === project?.id ? entrySelState.v : null;
  const setSourceSel = (v) => setSourceSelState({ id: project?.id ?? null, v });
  const setEntrySel = (v) => setEntrySelState({ id: project?.id ?? null, v });
  const [basisIssues, setBasisIssues] = useState([]);
  const [hazardIssues, setHazardIssues] = useState([]);
  const sourceShown = sourceSel ?? (WRITABLE_SOURCES.includes(basis?.basis_source) ? basis.basis_source : "manual");
  const entryShown = entrySel ?? (WRITABLE_SOURCES.includes(hazard?.entry_method) ? hazard.entry_method : "manual");
  const writeBasis = (fields, { confirmed } = {}) => {
    const r = sanitizeDesignBasisWrite(basis, fields, {
      now: (/* @__PURE__ */ new Date()).toISOString(),
      confirmed: confirmed === true || armed
    });
    setBasisIssues(r.issues || []);
    if (r.rejected || r.changed === false) return;
    onChange({ design_basis: r.next === void 0 ? null : r.next });
  };
  const writeContentBasis = (fields) => writeBasis({ basis_source: sourceSel ?? "manual", ...fields });
  const writeHazard = (fields) => {
    const r = sanitizeSiteHazardWrite(hazard, fields, { now: (/* @__PURE__ */ new Date()).toISOString() });
    setHazardIssues(r.issues || []);
    if (r.changed === false) return;
    onChange({ site_hazard: r.next === void 0 ? null : r.next });
  };
  const writeContentHazard = (fields) => writeHazard({ entry_method: entrySel ?? "manual", ...fields });
  const confirmRecapture = () => window.confirm(
    `This project's design basis was locked${basis?.basis_captured_at ? ` after capture at ${fmtTs(basis.basis_captured_at)}` : ""}. Changing it is recorded as an explicit re-capture (the prior edition is preserved). Continue?`
  );
  const armForEdit = () => {
    if (confirmRecapture()) setArmedFor(project?.id ?? null);
  };
  return /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 p-4 space-y-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-baseline justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("h2", { className: "font-semibold text-gray-900 flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx(Landmark, { className: "w-4 h-4 text-gray-400" }),
        " Design basis & site hazard"
      ] }),
      /* @__PURE__ */ jsx("span", { className: "text-xs text-gray-400", children: "Captured per project \u2014 preliminary engineering inputs" })
    ] }),
    /* @__PURE__ */ jsxs("p", { className: "text-[11px] text-gray-500 leading-snug", children: [
      "Record which ",
      /* @__PURE__ */ jsx("b", { children: "locally adopted" }),
      " code edition and jurisdiction this project's preliminary basis stands on \u2014 the newest published edition is never assumed to be the adopted one. Entries are manual or transcribed from an official report; API automation is a reserved path, not wired today."
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "rounded-lg border border-gray-100 bg-slate-50/60 p-3 space-y-2.5", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxs("div", { className: "text-[11px] font-bold text-gray-700 uppercase tracking-wide flex items-center gap-1.5", children: [
          locked ? /* @__PURE__ */ jsx(Lock, { className: "w-3.5 h-3.5 text-amber-600" }) : /* @__PURE__ */ jsx(LockOpen, { className: "w-3.5 h-3.5 text-gray-400" }),
          "Design basis"
        ] }),
        gated ? /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: armForEdit,
            className: "text-[11px] font-semibold text-red-700 hover:text-red-800 underline underline-offset-2",
            children: "Change basis\u2026"
          }
        ) : basis ? /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer select-none", children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "checkbox",
              checked: locked,
              onChange: (e) => {
                if (e.target.checked) {
                  writeBasis({ basis_locked: true });
                  setArmedFor(null);
                } else if (confirmRecapture()) {
                  setArmedFor(project?.id ?? null);
                  writeBasis({ basis_locked: false }, { confirmed: true });
                }
              },
              className: "accent-red-700"
            }
          ),
          "Lock captured basis"
        ] }) : null
      ] }),
      gated && /* @__PURE__ */ jsxs("div", { className: "text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5", children: [
        "Basis locked \u2014 ",
        /* @__PURE__ */ jsx("b", { children: basis?.code_edition || "edition not recorded" }),
        basis?.jurisdiction ? ` \xB7 ${basis.jurisdiction}` : "",
        " \u2014 captured",
        " ",
        fmtTs(basis?.basis_captured_at),
        ". Use \u201CChange basis\u2026\u201D to record a re-capture."
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid sm:grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxs("label", { className: "text-[11px] text-gray-500 block", children: [
          "Locally adopted code edition",
          /* @__PURE__ */ jsx(
            EditionInput,
            {
              value: basis?.code_edition,
              disabled: gated,
              onCommit: (v) => writeContentBasis({ code_edition: v })
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "text-[11px] text-gray-500 block", children: [
          "Jurisdiction / locality",
          /* @__PURE__ */ jsx(
            Input,
            {
              placeholder: "e.g. City of Milford, Clermont County, OH",
              value: basis?.jurisdiction ?? "",
              disabled: gated,
              onChange: (e) => writeContentBasis({ jurisdiction: e.target.value }),
              className: "h-[30px] text-[12px] mt-0.5"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "text-[11px] text-gray-500 block sm:col-span-2", children: [
          "Basis notes \u2014 local amendments, ordinance refs, partial adoptions",
          /* @__PURE__ */ jsx(
            Input,
            {
              placeholder: "e.g. 2018 IBC as amended by City Ord. 19-44; ASCE 7-16 wind provisions retained",
              value: basis?.basis_notes ?? "",
              disabled: gated,
              onChange: (e) => writeContentBasis({ basis_notes: e.target.value }),
              className: "h-[30px] text-[12px] mt-0.5"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "text-[11px] text-gray-500 block", children: [
          "How was this basis recorded?",
          /* @__PURE__ */ jsxs(
            "select",
            {
              value: sourceShown,
              disabled: gated,
              onChange: (e) => {
                const v = e.target.value;
                setSourceSel(v);
                writeBasis({ basis_source: v });
              },
              className: selectCls + " mt-0.5",
              children: [
                /* @__PURE__ */ jsx("option", { value: "manual", children: "Manual entry" }),
                /* @__PURE__ */ jsx("option", { value: "official_report", children: "Transcribed from official report" })
              ]
            }
          )
        ] })
      ] }),
      basisIssues.length > 0 && /* @__PURE__ */ jsx("div", { className: "text-[11px] text-red-700", children: basisIssues.map((i) => i.message).join(" ") }),
      /* @__PURE__ */ jsx("div", { className: "text-[10px] text-gray-400 pt-0.5", children: basis?.basis_captured_at ? /* @__PURE__ */ jsxs(Fragment, { children: [
        "Basis captured ",
        fmtTs(basis.basis_captured_at),
        " \xB7 last edit ",
        fmtTs(basis.basis_updated_at),
        " ",
        "\xB7 source ",
        /* @__PURE__ */ jsx("b", { className: "text-gray-500", children: basis.basis_source || "manual" }),
        basis.code_edition_prior ? /* @__PURE__ */ jsxs(Fragment, { children: [
          " ",
          "\xB7 prior edition ",
          /* @__PURE__ */ jsx("b", { className: "text-amber-700", children: basis.code_edition_prior })
        ] }) : null
      ] }) : "No basis captured yet \u2014 record the locally adopted edition and jurisdiction." })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "rounded-lg border border-gray-100 bg-slate-50/60 p-3 space-y-2.5", children: [
      /* @__PURE__ */ jsxs("div", { className: "text-[11px] font-bold text-gray-700 uppercase tracking-wide flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx(MapPin, { className: "w-3.5 h-3.5 text-gray-400" }),
        " Site & hazard inputs"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid sm:grid-cols-3 gap-3", children: [
        /* @__PURE__ */ jsx(
          CoordInput,
          {
            label: "Latitude (decimal \xB0)",
            value: hazard?.latitude,
            onCommit: (n) => writeContentHazard({ latitude: n })
          }
        ),
        /* @__PURE__ */ jsx(
          CoordInput,
          {
            label: "Longitude (decimal \xB0)",
            value: hazard?.longitude,
            onCommit: (n) => writeContentHazard({ longitude: n })
          }
        ),
        /* @__PURE__ */ jsxs("label", { className: "text-[11px] text-gray-500 block", children: [
          "Units",
          /* @__PURE__ */ jsxs(
            "select",
            {
              value: hazard?.units ?? "",
              onChange: (e) => writeContentHazard({ units: e.target.value }),
              className: selectCls + " mt-0.5",
              children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "\u2014 not recorded \u2014" }),
                HAZARD_UNITS.map((u) => /* @__PURE__ */ jsx("option", { value: u, children: u === "imperial" ? "Imperial" : "Metric" }, u))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "text-[11px] text-gray-500 block", children: [
          "Risk category",
          /* @__PURE__ */ jsxs(
            "select",
            {
              value: hazard?.risk_category ?? "",
              onChange: (e) => writeContentHazard({ risk_category: e.target.value }),
              className: selectCls + " mt-0.5",
              children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "\u2014 not recorded \u2014" }),
                RISK_CATEGORIES.map((c) => /* @__PURE__ */ jsx("option", { value: c, children: c }, c))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "text-[11px] text-gray-500 block", children: [
          "Exposure category",
          /* @__PURE__ */ jsxs(
            "select",
            {
              value: hazard?.exposure_category ?? "",
              onChange: (e) => writeContentHazard({ exposure_category: e.target.value }),
              className: selectCls + " mt-0.5",
              children: [
                /* @__PURE__ */ jsx("option", { value: "", children: "\u2014 not recorded \u2014" }),
                EXPOSURE_CATEGORIES.map((c) => /* @__PURE__ */ jsx("option", { value: c, children: c }, c))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "text-[11px] text-gray-500 block", children: [
          "Entry method",
          /* @__PURE__ */ jsxs(
            "select",
            {
              value: entryShown,
              onChange: (e) => {
                const v = e.target.value;
                setEntrySel(v);
                writeHazard({ entry_method: v });
              },
              className: selectCls + " mt-0.5",
              children: [
                /* @__PURE__ */ jsx("option", { value: "manual", children: "Manual entry" }),
                /* @__PURE__ */ jsx("option", { value: "official_report", children: "Transcribed from official report" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("label", { className: "text-[11px] text-gray-500 block sm:col-span-3", children: [
          "Exposure / terrain assumption",
          /* @__PURE__ */ jsx(
            Input,
            {
              placeholder: "e.g. Exposure C assumed \u2014 open terrain, verify on site",
              value: hazard?.exposure_assumption ?? "",
              onChange: (e) => writeContentHazard({ exposure_assumption: e.target.value }),
              className: "h-[30px] text-[12px] mt-0.5"
            }
          )
        ] })
      ] }),
      hazardIssues.length > 0 && /* @__PURE__ */ jsx("div", { className: "text-[11px] text-red-700", children: hazardIssues.map((i) => i.message).join(" ") }),
      /* @__PURE__ */ jsx("div", { className: "text-[10px] text-gray-400 pt-0.5", children: hazard?.input_timestamp ? /* @__PURE__ */ jsxs(Fragment, { children: [
        "Site inputs recorded ",
        fmtTs(hazard.input_timestamp),
        " \xB7 entry",
        " ",
        /* @__PURE__ */ jsx("b", { className: "text-gray-500", children: hazard.entry_method || "manual" }),
        " \xB7 standard edition tracked once under Design basis"
      ] }) : "No site/hazard inputs recorded yet \u2014 coordinates, units, risk and exposure are optional until engineering needs them." })
    ] })
  ] });
}
export {
  FoundationDesignBasisPanel as default
};
