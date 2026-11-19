// .audit-work/foundation-phaseb3/verify/stubs/jsx-runtime.js
var jsx = (type, props) => ({ type, props: props || {} });
var jsxs = jsx;

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/ReinforcementDraftField.jsx
function ReinforcementDraftField({ label, value, onChange, disabled, inputMode = "decimal", maxLength, suffix, placeholder, rawInvalid = false }) {
  const invalid = rawInvalid || value != null && !["string", "number"].includes(typeof value) || typeof value === "number" && !Number.isFinite(value);
  return /* @__PURE__ */ jsxs("label", { className: "block min-w-0", children: [
    /* @__PURE__ */ jsx("span", { className: "text-[12px] text-gray-600", children: label }),
    /* @__PURE__ */ jsxs("span", { className: "mt-0.5 flex items-center gap-1", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "text",
          "aria-label": label,
          inputMode,
          value: invalid ? "" : value ?? "",
          maxLength,
          placeholder,
          disabled,
          onChange: (e) => onChange(e.target.value),
          className: "w-full rounded-sm border border-gray-300 px-2 py-1 text-[13px] disabled:bg-gray-50 disabled:text-gray-400"
        }
      ),
      invalid && /* @__PURE__ */ jsx("span", { className: "text-[10px] text-red-600", children: "Invalid" }),
      suffix && /* @__PURE__ */ jsx("span", { className: "text-[12px] text-gray-500", children: suffix })
    ] })
  ] });
}

// .audit-work/foundation-phaseb3/candidate-tree-src/react-stub.js
var useState = (v) => [v, () => {
}];
var Fragment = Symbol("Fragment");

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/ReinforcementDraftList.jsx
var PAGE = 20;
var uuidOk = () => typeof globalThis.crypto?.randomUUID === "function";
var newRowId = (prefix) => `${prefix}_${globalThis.crypto.randomUUID()}`;
var isValidRow = (r) => r && typeof r === "object" && !Array.isArray(r);
var strOrInvalid = (v) => v === null || v === void 0 || v === "" ? "" : typeof v === "string" ? v : "__invalid__";
function ReinforcementDraftList({ title, listKey, rows, fields, onReplaceList, onAdd, onDelete, onFieldChange, disabled, addLabel = "Add", maxRows }) {
  const [page, setPage] = useState(0);
  if (rows !== void 0 && !Array.isArray(rows)) {
    return /* @__PURE__ */ jsxs("div", { "data-list": listKey, className: "rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] text-amber-800", children: [
      title,
      " list malformed.",
      " ",
      /* @__PURE__ */ jsx("button", { type: "button", disabled, onClick: onReplaceList, className: "underline disabled:text-gray-400", children: "Replace List" })
    ] });
  }
  const safe = Array.isArray(rows) ? rows : [];
  const pages = Math.max(1, Math.ceil(safe.length / PAGE));
  const pageIdx = Math.min(page, pages - 1);
  const shown = safe.slice(pageIdx * PAGE, pageIdx * PAGE + PAGE);
  const atCap = maxRows != null && safe.length >= maxRows;
  const canAdd = !disabled && !atCap && uuidOk();
  return /* @__PURE__ */ jsxs("div", { "data-list": listKey, className: "rounded-sm border border-gray-200 min-w-0 max-w-full", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2 border-b border-gray-100 px-2 py-1", children: [
      /* @__PURE__ */ jsx("p", { className: "text-[12px] font-semibold text-gray-700 break-words min-w-0", children: title }),
      /* @__PURE__ */ jsx("button", { type: "button", "data-add": listKey, disabled: !canAdd, onClick: onAdd, className: "shrink-0 text-[12px] text-amber-700 hover:underline disabled:text-gray-300", children: addLabel })
    ] }),
    !uuidOk() && /* @__PURE__ */ jsx("p", { className: "px-2 py-1 text-[11px] text-amber-700", children: "Secure row IDs unavailable in this browser; rows cannot be added." }),
    atCap && /* @__PURE__ */ jsxs("p", { className: "px-2 py-1 text-[11px] text-gray-500", children: [
      "Row limit reached (",
      maxRows,
      ")."
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "divide-y divide-gray-50", children: [
      shown.map((row, i) => {
        const idx = pageIdx * PAGE + i;
        const valid = isValidRow(row);
        const idStr = valid && typeof row.id === "string" ? row.id : null;
        if (!valid) {
          return /* @__PURE__ */ jsxs("div", { "data-row": `${listKey}:${idx}`, className: "flex flex-wrap items-center gap-2 px-2 py-1.5 text-[12px] text-red-700", children: [
            /* @__PURE__ */ jsx("span", { children: "Malformed row - delete to repair." }),
            /* @__PURE__ */ jsx("button", { type: "button", "data-del": `${listKey}:${idx}`, disabled, onClick: () => onDelete(idx), className: "text-[12px] text-red-600 hover:underline disabled:text-gray-300", children: "Delete" })
          ] }, `bad-${idx}`);
        }
        return /* @__PURE__ */ jsxs("div", { "data-row": `${listKey}:${idx}`, "data-row-id": idStr ?? void 0, className: "flex flex-wrap items-end gap-2 px-2 py-1.5", children: [
          idStr && /* @__PURE__ */ jsx("span", { className: "w-full max-w-full break-words text-[10px] text-gray-400", children: idStr }),
          !idStr && /* @__PURE__ */ jsx("span", { className: "w-full max-w-full break-words text-[10px] text-red-600", children: "Invalid or missing row id" }),
          fields.map(
            ({ key, label, options }) => options ? /* @__PURE__ */ jsxs("label", { className: "block min-w-0", children: [
              /* @__PURE__ */ jsx("span", { className: "text-[12px] text-gray-600", children: label }),
              /* @__PURE__ */ jsxs(
                "select",
                {
                  value: strOrInvalid(row[key]),
                  disabled,
                  onChange: (e) => onFieldChange(idx, key, e.target.value),
                  className: "mt-0.5 block max-w-full rounded-sm border border-gray-300 px-1.5 py-1 text-[13px] disabled:bg-gray-50",
                  children: [
                    options.map((o, oi) => /* @__PURE__ */ jsx("option", { value: o.id ?? o, children: o.label ?? o }, `${o.id ?? o}-${oi}`)),
                    row[key] !== void 0 && row[key] !== null && typeof row[key] !== "string" && /* @__PURE__ */ jsx("option", { value: "__invalid__", disabled: true, children: "Invalid value" }),
                    typeof row[key] === "string" && row[key] !== "" && !options.some((o) => (o.id ?? o) === row[key]) && /* @__PURE__ */ jsxs("option", { value: row[key], disabled: true, children: [
                      "Missing: ",
                      row[key]
                    ] })
                  ]
                }
              )
            ] }, key) : /* @__PURE__ */ jsx(ReinforcementDraftField, { label, value: row[key], disabled, onChange: (v) => onFieldChange(idx, key, v) }, key)
          ),
          /* @__PURE__ */ jsx("button", { type: "button", "data-del": `${listKey}:${idx}`, disabled, onClick: () => onDelete(idx), className: "text-[12px] text-red-600 hover:underline disabled:text-gray-300", children: "Delete" })
        ] }, `${idStr ?? "invalid"}:${idx}`);
      }),
      !shown.length && /* @__PURE__ */ jsx("p", { className: "px-2 py-2 text-[12px] text-gray-400", children: "None." })
    ] }),
    pages > 1 && /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-t border-gray-100 px-2 py-1 text-[12px] text-gray-500", children: [
      /* @__PURE__ */ jsx("button", { type: "button", "data-page": "prev", disabled: disabled || pageIdx === 0, onClick: () => setPage(pageIdx - 1), className: "disabled:text-gray-300", children: "Prev" }),
      /* @__PURE__ */ jsxs("span", { children: [
        "Page ",
        pageIdx + 1,
        " / ",
        pages
      ] }),
      /* @__PURE__ */ jsx("button", { type: "button", "data-page": "next", disabled: disabled || pageIdx >= pages - 1, onClick: () => setPage(pageIdx + 1), className: "disabled:text-gray-300", children: "Next" })
    ] })
  ] });
}

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/ReinforcementDraftGeometry.jsx
var SUPPORT_MODES = [
  { id: "unconfigured", label: "Unconfigured" },
  { id: "auto", label: "Auto" },
  { id: "manual", label: "Manual" },
  { id: "off", label: "Off" }
];
var asObj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : null;
var asList = (v) => Array.isArray(v) ? v : [];
function ReinforcementDraftGeometry({ draft, item, supportCatalog, disabled, onChange }) {
  const design = asObj(draft?.design);
  if (!design) {
    return /* @__PURE__ */ jsx("div", { className: "rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] text-amber-800", children: "Design draft malformed; repair required." });
  }
  const isPillar = item?.foundation_type === "pillar";
  const cover = asObj(design.cover_inches) ?? {};
  const supports = asObj(design.supports) ?? { mode: "unconfigured", reason: "" };
  const supportRows = asList(supportCatalog).filter((r) => r && typeof r === "object" && r.material_type === "rebar_support");
  const supportOptions = supportRows.filter((r) => typeof r.id === "string" && r.id).map((r) => ({ id: r.id, label: `${r.material_name || "Rebar support"}${r.rebar_support_height_inches != null ? ` (${r.rebar_support_height_inches} in)` : ""}` }));
  const spread = asObj(design.spread) ?? { mats: [], inter_mat_ties: [] };
  const pillar = asObj(design.pillar) ?? { hoops: [], longitudinal: {} };
  const lon = asObj(pillar.longitudinal) ?? {};
  const setCover = (k, v) => onChange({ ...design, cover_inches: { ...cover, [k]: v } });
  const setSupports = (p) => onChange({ ...design, supports: { ...supports, ...p } });
  const setSpread = (p) => onChange({ ...design, spread: { ...spread, ...p } });
  const setPillar = (p) => onChange({ ...design, pillar: { ...pillar, ...p } });
  const setLon = (k, v) => setPillar({ longitudinal: { ...lon, [k]: v } });
  const mats = Array.isArray(spread.mats) ? spread.mats : void 0;
  const ties = Array.isArray(spread.inter_mat_ties) ? spread.inter_mat_ties : void 0;
  const hoops = Array.isArray(pillar.hoops) ? pillar.hoops : void 0;
  const matOptions = (mats ?? []).filter((r) => r && typeof r === "object" && typeof r.id === "string").map((m) => ({ id: m.id, label: m.id }));
  const tieFromTo = () => [{ id: "", label: "-" }, ...matOptions];
  const replacements = [
    { key: "cover_inches", value: design.cover_inches, initial: { side: "", top: "", bottom: "" } },
    { key: "supports", value: design.supports, initial: { mode: "unconfigured", reason: "", spacing_inches: "", catalog_id: "", mats: [], placements: [] } },
    isPillar ? { key: "pillar", value: design.pillar, initial: { hoops: [], longitudinal: {} } } : { key: "spread", value: design.spread, initial: { mats: [], inter_mat_ties: [] } },
    ...isPillar && asObj(design.pillar) ? [{ key: "longitudinal", value: pillar.longitudinal, initial: {} }] : []
  ].filter((entry) => entry.value !== void 0 && !asObj(entry.value));
  if (replacements.length) return /* @__PURE__ */ jsx("div", { className: "space-y-2", children: replacements.map(({ key, initial }) => /* @__PURE__ */ jsxs("div", { className: "rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] text-amber-800", children: [
    key,
    " draft malformed.",
    " ",
    /* @__PURE__ */ jsxs("button", { type: "button", disabled, onClick: () => onChange(key === "longitudinal" ? { ...design, pillar: { ...pillar, longitudinal: initial } } : { ...design, [key]: initial }), className: "underline", children: [
      "Replace ",
      key
    ] })
  ] }, key)) });
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsx(ReinforcementDraftField, { label: "Bar diameter (in)", value: design.bar_diameter_inches, disabled, onChange: (v) => onChange({ ...design, bar_diameter_inches: v }) }),
    /* @__PURE__ */ jsx("div", { className: "grid grid-cols-3 gap-2", children: ["side", "top", "bottom"].map((k) => /* @__PURE__ */ jsx(ReinforcementDraftField, { label: `Cover ${k} (in)`, value: cover[k], disabled, onChange: (v) => setCover(k, v) }, k)) }),
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("label", { className: "block", children: [
        /* @__PURE__ */ jsx("span", { className: "text-[12px] text-gray-600", children: "Supports" }),
        /* @__PURE__ */ jsxs("select", { "aria-label": "Supports", value: typeof supports.mode === "string" && supports.mode !== "" ? supports.mode : "unconfigured", disabled, onChange: (e) => setSupports({ mode: e.target.value }), className: "mt-0.5 block max-w-full rounded-sm border border-gray-300 px-1.5 py-1 text-[13px] disabled:bg-gray-50", children: [
          SUPPORT_MODES.map((m) => /* @__PURE__ */ jsx("option", { value: m.id, children: m.label }, m.id)),
          typeof supports.mode === "string" && !SUPPORT_MODES.some((m) => m.id === supports.mode) && supports.mode && /* @__PURE__ */ jsxs("option", { value: supports.mode, disabled: true, children: [
            "Reserved: ",
            supports.mode
          ] }),
          supports.mode !== void 0 && supports.mode !== null && typeof supports.mode !== "string" && /* @__PURE__ */ jsx("option", { value: "unconfigured", disabled: true, children: "Invalid mode" })
        ] })
      ] }),
      supports.mode === "auto" && /* @__PURE__ */ jsx("div", { className: "mt-1 space-y-1", children: isPillar ? /* @__PURE__ */ jsx("p", { className: "text-[11px] text-amber-700", children: "Auto support placement is unavailable for pillar cages; use Manual or explain Off." }) : /* @__PURE__ */ jsx(ReinforcementDraftField, { label: "Max support spacing (in)", value: supports.spacing_inches, inputMode: "decimal", disabled, onChange: (v) => setSupports({ spacing_inches: v }) }) }),
      (supports.mode === "auto" || supports.mode === "manual") && /* @__PURE__ */ jsxs("div", { className: "mt-1", children: [
        /* @__PURE__ */ jsxs("label", { className: "block", children: [
          /* @__PURE__ */ jsx("span", { className: "text-[12px] text-gray-600", children: "Support catalog pin (optional)" }),
          /* @__PURE__ */ jsxs("select", { "aria-label": "Support catalog", value: typeof supports.catalog_id === "string" ? supports.catalog_id : "", disabled, onChange: (e) => setSupports({ catalog_id: e.target.value }), className: "mt-0.5 block max-w-full rounded-sm border border-gray-300 px-1.5 py-1 text-[13px] disabled:bg-gray-50", children: [
            /* @__PURE__ */ jsx("option", { value: "", children: "Auto-select (no pin)" }),
            supportOptions.map((o) => /* @__PURE__ */ jsx("option", { value: o.id, children: o.label }, o.id))
          ] })
        ] }),
        supports.catalog_id && !supportRows.some((r) => r.id === supports.catalog_id) && /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-[11px] text-amber-700", children: "Pinned support ID is not in the current catalog \u2014 pricing will report it unresolved." }),
        !supportRows.length && /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-[11px] text-amber-700", children: "No rebar_support catalog rows loaded; compatible-pick pricing will stay unresolved." })
      ] }),
      supports.mode === "manual" && /* @__PURE__ */ jsxs("div", { className: "mt-1 space-y-2", children: [
        /* @__PURE__ */ jsx(
          ReinforcementDraftList,
          {
            title: "Support counts per mat",
            listKey: "support-mats",
            rows: supports.mats,
            maxRows: 256,
            disabled,
            onReplaceList: () => setSupports({ mats: [] }),
            fields: [
              { key: "mat_id", label: "Target", options: isPillar ? [{ id: "cage", label: "Pillar cage" }] : [{ id: "", label: "-" }, ...matOptions] },
              { key: "count", label: "Count", inputMode: "numeric" }
            ],
            onAdd: () => setSupports({ mats: [...asList(supports.mats), { mat_id: isPillar ? "cage" : "", count: "" }] }),
            onDelete: (i) => setSupports({ mats: asList(supports.mats).filter((_, j) => j !== i) }),
            onFieldChange: (i, k, v) => {
              const n = [...asList(supports.mats)];
              n[i] = { ...n[i], [k]: v };
              setSupports({ mats: n });
            }
          }
        ),
        /* @__PURE__ */ jsx(
          ReinforcementDraftList,
          {
            title: "Explicit support placements",
            listKey: "support-placements",
            rows: supports.placements,
            maxRows: 4096,
            disabled,
            onReplaceList: () => setSupports({ placements: [] }),
            fields: [
              { key: "mat_id", label: "Target", options: isPillar ? [{ id: "cage", label: "Pillar cage" }] : [{ id: "", label: "-" }, ...matOptions] },
              { key: "x_inches", label: "X (in)" },
              { key: "z_inches", label: "Z (in)" }
            ],
            onAdd: () => setSupports({ placements: [...asList(supports.placements), { mat_id: isPillar ? "cage" : "", x_inches: "", z_inches: "" }] }),
            onDelete: (i) => setSupports({ placements: asList(supports.placements).filter((_, j) => j !== i) }),
            onFieldChange: (i, k, v) => {
              const n = [...asList(supports.placements)];
              n[i] = { ...n[i], [k]: v };
              setSupports({ placements: n });
            }
          }
        ),
        /* @__PURE__ */ jsx("p", { className: "text-[11px] text-gray-500", children: "A mat may be covered by a count or by explicit placements, not both. Uncovered mats warn instead of guessing." })
      ] }),
      supports.mode === "off" && /* @__PURE__ */ jsx(ReinforcementDraftField, { label: "Reason", value: supports.reason, inputMode: "text", disabled, onChange: (v) => setSupports({ reason: v }) })
    ] }),
    isPillar ? /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsx(
        ReinforcementDraftList,
        {
          title: "Pillar hoops",
          listKey: "hoops",
          rows: pillar.hoops,
          maxRows: 256,
          disabled,
          onReplaceList: () => setPillar({ hoops: [] }),
          fields: [
            { key: "center_y_inches", label: "Center Y (in)" },
            { key: "centerline_diameter_inches", label: "Centerline dia (in)" },
            { key: "cut_allowance_inches", label: "Cut allowance (in)" }
          ],
          onAdd: () => setPillar({ hoops: [...hoops ?? [], { id: newRowId("hoop"), center_y_inches: "", centerline_diameter_inches: "", cut_allowance_inches: "" }] }),
          onDelete: (i) => setPillar({ hoops: hoops.filter((_, j) => j !== i) }),
          onFieldChange: (i, k, v) => {
            const n = [...hoops];
            n[i] = { ...n[i], [k]: v };
            setPillar({ hoops: n });
          }
        }
      ),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
        /* @__PURE__ */ jsx(ReinforcementDraftField, { label: "Longitudinal count", value: lon.count, inputMode: "numeric", disabled, onChange: (v) => setLon("count", v) }),
        /* @__PURE__ */ jsx(ReinforcementDraftField, { label: "Longitudinal radius (in)", value: lon.radius_inches, disabled, onChange: (v) => setLon("radius_inches", v) }),
        /* @__PURE__ */ jsx(ReinforcementDraftField, { label: "Bottom end (in)", value: lon.bottom_end_inches, disabled, onChange: (v) => setLon("bottom_end_inches", v) }),
        /* @__PURE__ */ jsx(ReinforcementDraftField, { label: "Top end (in)", value: lon.top_end_inches, disabled, onChange: (v) => setLon("top_end_inches", v) })
      ] })
    ] }) : /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsx(
        ReinforcementDraftList,
        {
          title: "Spread mats",
          listKey: "mats",
          rows: spread.mats,
          maxRows: 256,
          disabled,
          onReplaceList: () => setSpread({ mats: [] }),
          fields: [
            { key: "bearing_elevation_inches", label: "Bearing elevation (in)" },
            { key: "max_spacing_x_inches", label: "Max spacing X (in)" },
            { key: "max_spacing_z_inches", label: "Max spacing Z (in)" }
          ],
          onAdd: () => setSpread({ mats: [...mats ?? [], { id: newRowId("mat"), bearing_elevation_inches: "", max_spacing_x_inches: "", max_spacing_z_inches: "" }] }),
          onDelete: (i) => setSpread({ mats: mats.filter((_, j) => j !== i) }),
          onFieldChange: (i, k, v) => {
            const n = [...mats];
            n[i] = { ...n[i], [k]: v };
            setSpread({ mats: n });
          }
        }
      ),
      /* @__PURE__ */ jsx(
        ReinforcementDraftList,
        {
          title: "Inter-mat ties",
          listKey: "ties",
          rows: spread.inter_mat_ties,
          maxRows: 4096,
          disabled,
          onReplaceList: () => setSpread({ inter_mat_ties: [] }),
          fields: [
            { key: "from_mat_id", label: "From mat", options: tieFromTo() },
            { key: "to_mat_id", label: "To mat", options: tieFromTo() },
            { key: "x_inches", label: "X (in)" },
            { key: "z_inches", label: "Z (in)" },
            { key: "cut_length_inches", label: "Cut length (in)" }
          ],
          onAdd: () => setSpread({ inter_mat_ties: [...ties ?? [], { id: newRowId("tie"), from_mat_id: "", to_mat_id: "", x_inches: "", z_inches: "", cut_length_inches: "" }] }),
          onDelete: (i) => setSpread({ inter_mat_ties: ties.filter((_, j) => j !== i) }),
          onFieldChange: (i, k, v) => {
            const n = [...ties];
            n[i] = { ...n[i], [k]: v };
            setSpread({ inter_mat_ties: n });
          }
        }
      ),
      /* @__PURE__ */ jsx("p", { className: "text-[11px] text-gray-500", children: "Tie paths are preliminary and fabrication-review gated." })
    ] })
  ] });
}

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/ReinforcementDraftMaterial.jsx
var asObj2 = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : null;
var metaVal = (v) => typeof v === "string" && v.trim() || typeof v === "number" && Number.isFinite(v) ? v : "Unknown";
function ReinforcementDraftMaterial({ draft, catalog = [], disabled, onChange }) {
  const material = asObj2(draft?.material) ?? {};
  const overrides = asObj2(draft?.overrides) ?? {};
  const isManual = material.kind === "manual";
  const catalogRows = Array.isArray(catalog) ? catalog.filter((c) => c && typeof c === "object" && typeof c.id === "string") : [];
  const matches = catalogRows.filter((c) => c.id === material.inventory_id);
  const row = matches.length === 1 ? matches[0] : null;
  const meta = (k) => metaVal(row?.[k]);
  const setMaterial = (p) => onChange({ material: { ...material, ...p } });
  const setOverride = (k, v) => onChange({ overrides: { ...overrides, [k]: v === "" ? null : v } });
  const malformed = ["material", "overrides"].filter((key) => draft?.[key] !== void 0 && !asObj2(draft[key]));
  if (malformed.length) return /* @__PURE__ */ jsx("div", { className: "space-y-2", children: malformed.map((key) => /* @__PURE__ */ jsxs("div", { className: "rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] text-amber-800", children: [
    key,
    " draft malformed.",
    " ",
    /* @__PURE__ */ jsxs("button", { type: "button", disabled, onClick: () => onChange({
      [key]: key === "material" ? { kind: "" } : { quantity_ft: null, cost_per_ft: null }
    }), className: "underline", children: [
      "Replace ",
      key
    ] })
  ] }, key)) });
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3 min-w-0 max-w-full", children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("span", { className: "text-[12px] text-gray-600", children: "Material basis" }),
      /* @__PURE__ */ jsx("div", { className: "mt-1 flex flex-wrap gap-2", children: ["manual", "catalog"].map((k) => /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          disabled,
          onClick: () => setMaterial(k === "manual" ? { kind: "manual", ...Object.hasOwn(material, "unit") ? {} : { unit: "ft" } } : { kind: "catalog" }),
          className: `rounded-sm border px-2 py-1 text-[12px] ${material.kind === k ? "border-amber-500 bg-amber-50 text-amber-800" : "border-gray-300 text-gray-600"} disabled:text-gray-300`,
          children: k === "manual" ? "Manual" : "Catalog"
        },
        k
      )) })
    ] }),
    material.kind === "catalog" && /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("label", { className: "block min-w-0", children: [
        /* @__PURE__ */ jsx("span", { className: "text-[12px] text-gray-600", children: "Rebar item" }),
        /* @__PURE__ */ jsxs("select", { "aria-label": "Rebar item", value: typeof material.inventory_id === "string" ? material.inventory_id : "", disabled, onChange: (e) => setMaterial({ inventory_id: e.target.value }), className: "mt-0.5 block w-full max-w-full rounded-sm border border-gray-300 px-1.5 py-1 text-[13px] disabled:bg-gray-50", children: [
          /* @__PURE__ */ jsx("option", { value: "", children: "Choose rebar" }),
          material.inventory_id !== void 0 && material.inventory_id !== null && typeof material.inventory_id !== "string" && /* @__PURE__ */ jsx("option", { value: "", disabled: true, children: "Invalid selection" }),
          typeof material.inventory_id === "string" && material.inventory_id && !row && /* @__PURE__ */ jsxs("option", { value: material.inventory_id, disabled: true, children: [
            "Unavailable: ",
            material.inventory_id
          ] }),
          catalogRows.map((c, index) => /* @__PURE__ */ jsx("option", { value: c.id, children: typeof c.material_name === "string" ? c.material_name : c.id }, `${c.id}:${index}`))
        ] })
      ] }),
      !Array.isArray(catalog) && /* @__PURE__ */ jsx("p", { className: "text-[11px] text-amber-700", children: "Catalog could not be read; no replacement metadata is inferred." }),
      matches.length > 1 && /* @__PURE__ */ jsx("p", { className: "text-[11px] text-red-700", children: "Duplicate inventory ID; refresh the catalog before pricing." }),
      row && /* @__PURE__ */ jsxs("div", { className: "mt-1 break-words rounded-sm border border-gray-100 bg-gray-50 px-2 py-1 text-[11px] text-gray-500", children: [
        "diameter ",
        meta("rebar_diameter_inches"),
        " - weight ",
        meta("rebar_weight_lb_per_ft"),
        " - ",
        meta("cost_per_unit"),
        "/",
        meta("unit")
      ] })
    ] }),
    isManual && /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
      /* @__PURE__ */ jsx(ReinforcementDraftField, { label: "Name", value: material.name, inputMode: "text", disabled, onChange: (v) => setMaterial({ name: v }) }),
      /* @__PURE__ */ jsx(ReinforcementDraftField, { label: "Reason", value: material.reason, inputMode: "text", maxLength: 1e3, disabled, onChange: (v) => setMaterial({ reason: v }) }),
      /* @__PURE__ */ jsx(ReinforcementDraftField, { label: "Nominal diameter (in)", value: material.bar_diameter_inches, disabled, onChange: (v) => setMaterial({ bar_diameter_inches: v }) }),
      /* @__PURE__ */ jsx(ReinforcementDraftField, { label: "Weight (lb/ft)", value: material.weight_lb_per_ft, disabled, onChange: (v) => setMaterial({ weight_lb_per_ft: v }) }),
      /* @__PURE__ */ jsx(ReinforcementDraftField, { label: "Cost /ft", value: material.cost_per_ft, disabled, onChange: (v) => setMaterial({ cost_per_ft: v }) }),
      /* @__PURE__ */ jsx(ReinforcementDraftField, { label: "Unit", value: material.unit, inputMode: "text", disabled, onChange: (v) => setMaterial({ unit: v }) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
      /* @__PURE__ */ jsx(ReinforcementDraftField, { label: "Quantity override (ft)", value: overrides.quantity_ft ?? "", placeholder: "blank = no override", disabled, onChange: (v) => setOverride("quantity_ft", v) }),
      /* @__PURE__ */ jsx(ReinforcementDraftField, { label: "Cost override ($/ft)", value: overrides.cost_per_ft ?? "", placeholder: "blank = no override", disabled, onChange: (v) => setOverride("cost_per_ft", v) })
    ] })
  ] });
}

// .audit-work/foundation-phaseb3/candidate-tree-src/components/estimator/foundation/FoundationReinforcementProposalPanel.jsx
var verLabel = (v) => {
  if (v === null || v === void 0 || v === 1) return "Legacy";
  if (v === 2) return "Version 2";
  return "Unsupported";
};
function FoundationReinforcementProposalPanel({
  item,
  draft,
  catalog = [],
  supportCatalog = [],
  preview,
  disabled = false,
  busy = false,
  error,
  acknowledgments = null,
  onAcknowledgmentsChange,
  onStart,
  onDraftChange,
  onPreview,
  onAccept,
  onDiscard
}) {
  const label = verLabel(item?.reinforcement_calculation_version);
  const blocked = disabled || busy || label === "Unsupported";
  const ackProvided = acknowledgments !== null && acknowledgments !== void 0;
  const ack = acknowledgments !== null && typeof acknowledgments === "object" && !Array.isArray(acknowledgments) && (Object.getPrototypeOf(acknowledgments) === Object.prototype || Object.getPrototypeOf(acknowledgments) === null) ? acknowledgments : null;
  const ackEligible = !ackProvided || Boolean(
    ack?.preliminary === true && Array.isArray(preview?.warningCodes) && preview.warningCodes.every(
      (code) => typeof code === "string" && code.trim().length > 0 && (Array.isArray(ack?.warningCodes) ? ack.warningCodes : []).includes(code)
    )
  );
  const eligible = Boolean(
    typeof preview?.id === "string" && preview.id.trim().length > 0 && preview?.canAccept === true && preview?.stale !== true && !blocked && ackEligible
  );
  const guard = (fn) => (...a) => {
    if (!blocked) fn?.(...a);
  };
  const changeDraft = (patch) => {
    if (!blocked) onDraftChange?.({ ...draft, ...patch });
  };
  return /* @__PURE__ */ jsxs("div", { className: "rounded-sm border border-gray-200 bg-white p-3 min-w-0 max-w-full", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsx("p", { className: "text-[13px] font-semibold text-gray-800", children: "Reinforcement proposal" }),
      /* @__PURE__ */ jsx("span", { className: "rounded-sm bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600", children: label })
    ] }),
    /* @__PURE__ */ jsx("p", { className: "mt-1 text-[11px] text-amber-700", children: "Preliminary geometry and internal cost only. Not a structural design or engineering approval." }),
    /* @__PURE__ */ jsx("p", { className: "text-[11px] text-gray-500", children: "Proposal edits do not change current prices until explicit acceptance; unknown supports/weights/units remain unknown." }),
    error && /* @__PURE__ */ jsx("div", { role: "alert", className: "mt-1 rounded-sm border border-red-200 bg-red-50 px-2 py-1 text-[12px] text-red-700", children: String(error) }),
    label === "Unsupported" && /* @__PURE__ */ jsx("div", { className: "mt-1 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] text-amber-800", children: "This reinforcement mode is unsupported; proposal edits are unavailable." }),
    !draft ? /* @__PURE__ */ jsxs("div", { className: "mt-2", children: [
      /* @__PURE__ */ jsx("p", { className: "text-[12px] text-gray-500", children: "No reinforcement draft yet. Start a controlled proposal to draft geometry and material." }),
      /* @__PURE__ */ jsx("button", { type: "button", disabled: blocked, onClick: guard(onStart), className: "mt-1 rounded-sm border border-amber-400 bg-amber-50 px-2 py-1 text-[12px] text-amber-800 disabled:text-gray-300", children: "Start Proposal" })
    ] }) : /* @__PURE__ */ jsxs("fieldset", { disabled: blocked, className: "mt-2 space-y-3 min-w-0", children: [
      /* @__PURE__ */ jsx(ReinforcementDraftGeometry, { draft, item, supportCatalog, disabled: blocked, onChange: (design) => changeDraft({ design }) }),
      /* @__PURE__ */ jsx(ReinforcementDraftMaterial, { draft, catalog, disabled: blocked, onChange: (p) => {
        if (!blocked) onDraftChange?.({ ...draft, ...p });
      } }),
      preview && /* @__PURE__ */ jsxs("div", { className: "break-words rounded-sm border border-gray-200 bg-gray-50 p-2 min-w-0 max-w-full", children: [
        /* @__PURE__ */ jsx("p", { className: "text-[12px] font-semibold text-gray-700", children: "Preview" }),
        preview.stale && /* @__PURE__ */ jsx("p", { className: "text-[11px] text-amber-700", children: "Preview is stale - refresh before accepting." }),
        preview.rateSourceLabel && /* @__PURE__ */ jsx("p", { className: "text-[11px] text-gray-500", children: preview.rateSourceLabel }),
        /* @__PURE__ */ jsxs("div", { className: "mt-1 space-y-0.5", children: [
          (preview.quantities || []).map((q, i) => /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap justify-between gap-1 text-[12px] text-gray-600", children: [
            /* @__PURE__ */ jsx("span", { children: q.label }),
            /* @__PURE__ */ jsxs("span", { children: [
              q.before,
              " - ",
              q.after
            ] })
          ] }, i)),
          (preview.costs || []).map((c, i) => /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap justify-between gap-1 text-[12px] text-gray-600", children: [
            /* @__PURE__ */ jsx("span", { children: c.label }),
            /* @__PURE__ */ jsxs("span", { children: [
              c.value,
              " ",
              /* @__PURE__ */ jsxs("span", { className: "text-[10px] text-gray-400", children: [
                "(",
                c.provenance,
                ")"
              ] })
            ] })
          ] }, i))
        ] }),
        (preview.issues || []).map((i, k) => /* @__PURE__ */ jsx("p", { className: `text-[11px] ${i.severity === "warning" ? "text-amber-700" : "text-red-700"}`, children: i.message }, k))
      ] }),
      ackProvided && (() => {
        const ackPreliminary = ack?.preliminary === true;
        const ackCodes = Array.isArray(ack?.warningCodes) ? ack.warningCodes.filter((c) => typeof c === "string") : [];
        const issues = Array.isArray(preview?.issues) ? preview.issues : [];
        const uniqueCodes = [];
        (Array.isArray(preview?.warningCodes) ? preview.warningCodes : []).forEach((code) => {
          if (typeof code === "string" && code.trim().length > 0 && !uniqueCodes.includes(code)) uniqueCodes.push(code);
        });
        const ackDisabled = blocked || typeof onAcknowledgmentsChange !== "function";
        const emit = (preliminary, codes) => {
          if (!ackDisabled) onAcknowledgmentsChange?.({ preliminary, warningCodes: [...codes] });
        };
        return /* @__PURE__ */ jsxs("div", { className: "mt-1 space-y-1 text-[11px] text-gray-700", children: [
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "checkbox",
                checked: ackPreliminary,
                disabled: ackDisabled,
                onChange: (event) => emit(event.target.checked, ackCodes),
                className: "h-3.5 w-3.5 rounded border-gray-300 flex-shrink-0"
              }
            ),
            /* @__PURE__ */ jsx("span", { children: "I understand this is preliminary only, not engineering approval." })
          ] }),
          uniqueCodes.map((code) => {
            const issue = issues.find((entry) => entry && entry.severity === "warning" && entry.code === code);
            return /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "checkbox",
                  checked: ackCodes.includes(code),
                  disabled: ackDisabled,
                  onChange: (event) => emit(ackPreliminary, event.target.checked ? [.../* @__PURE__ */ new Set([...ackCodes, code])] : ackCodes.filter((c) => c !== code)),
                  className: "h-3.5 w-3.5 rounded border-gray-300 flex-shrink-0"
                }
              ),
              /* @__PURE__ */ jsx("span", { children: `Acknowledge warning: ${issue?.message || code}` })
            ] }, code);
          })
        ] });
      })(),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsx("button", { type: "button", disabled: blocked, onClick: guard(onPreview), className: "rounded-sm border border-gray-300 px-2 py-1 text-[12px] text-gray-700 disabled:text-gray-300", children: "Refresh Preview" }),
        /* @__PURE__ */ jsx("button", { type: "button", disabled: !eligible, onClick: () => eligible && onAccept?.(preview.id), className: "rounded-sm border border-amber-400 bg-amber-50 px-2 py-1 text-[12px] text-amber-800 disabled:text-gray-300", children: "Accept Proposal" }),
        /* @__PURE__ */ jsx("button", { type: "button", disabled: blocked, onClick: guard(onDiscard), className: "rounded-sm border border-red-200 px-2 py-1 text-[12px] text-red-600 disabled:text-gray-300", children: "Discard" })
      ] })
    ] })
  ] });
}
export {
  FoundationReinforcementProposalPanel as default
};
