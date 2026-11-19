import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { money } from "./foundationCalc";
import { suggestFeasibleDimensions } from "./poleCalculator";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";
import { FoundationDimensionInput } from "./foundationFtInEntry";
import { foundationDimensionFieldMeta } from "./foundationGeometryInputs";
import {
  POLE_SHAPE_VALUES,
  consolidateFoundationPoles
} from "./poleCalculator";
import { foundationLayoutFootprint, layoutPositionInches } from "./foundationLayoutModel";
const poleDimMeta = (field) => foundationDimensionFieldMeta("pole", field);
const signDimMeta = (field) => foundationDimensionFieldMeta("sign", field);
function FoundationPolesPanel({ poles = [], options = [], items = [], onChange, polePricing = [], onMigrateItemPole }) {
  const patchPole = (index, changes) => onChange(poles.map((p, i) => i === index ? { ...p, ...changes } : p));
  const removePole = (index) => {
    if (!window.confirm(`Remove Pole ${index + 1}? Cabinets mounted on it are retained for review.`)) return;
    onChange(poles.filter((_, i) => i !== index));
  };
  const addPole = () => onChange([
    ...poles,
    { pole_id: options[0]?.id || "", height_inches: 120, embedment_inches: 42, include_pole_painting: false }
  ]);
  const consolidated = consolidateFoundationPoles({ items, poles });
  return /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h2", { className: "font-semibold text-gray-900", children: "Poles" }),
        /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-500", children: "Priced on billed length  -  an explicit total stock length, or height above grade plus embedment." })
      ] }),
      /* @__PURE__ */ jsxs(Button, { variant: "outline", size: "sm", onClick: addPole, disabled: options.length === 0, children: [
        /* @__PURE__ */ jsx(Plus, { className: "w-4 h-4", "aria-hidden": "true" }),
        " Pole"
      ] })
    ] }),
    options.length === 0 && /* @__PURE__ */ jsx("div", { className: "text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5", children: "Pole catalog unavailable  -  existing rows remain editable; new poles cannot be added." }),
    consolidated.legacyPoles.length > 0 && /* @__PURE__ */ jsxs("div", { role: "status", className: "text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 space-y-1", children: [
      /* @__PURE__ */ jsx("p", { className: "font-semibold", children: "Legacy item-pole data  -  not priced" }),
      consolidated.legacyPoles.map((d) => /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
        /* @__PURE__ */ jsxs("span", { children: [
          "Foundation ",
          d.source_item_index + 1,
          " carries legacy pole fields",
          d.legacy_pole_cost !== null || d.legacy_pole_painting_cost !== null ? " (with saved amounts)" : "",
          "."
        ] }),
        typeof onMigrateItemPole === "function" && /* @__PURE__ */ jsx(Button, { variant: "outline", size: "sm", onClick: () => onMigrateItemPole(d.source_item_index), children: "Move to Poles" })
      ] }, d.source_item_component_id || `item-${d.source_item_index}`)),
      consolidated.overlaps.length > 0 && /* @__PURE__ */ jsx("p", { children: "A project pole already sits on the same foundation  -  verify it is not the same physical pole before migrating." })
    ] }),
    poles.length === 0 ? /* @__PURE__ */ jsx("div", { className: "text-center py-6 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm", children: "No poles on this section." }) : poles.map((pole, index) => {
      const issues = polePricing[index]?.issues || [];
      const pricingUnavailable = polePricing[index]?.available === false;
      const geometry = polePricing[index]?.geometry || null;
      const fieldIssue = (field) => issues.some((i) => i.field === field);
      const describedBy = issues.length ? `pole-${index}-pricing` : void 0;
      const authoredShape = pole.pole_shape ?? "";
      const shapeChoices = authoredShape && !POLE_SHAPE_VALUES.includes(authoredShape) ? [authoredShape, ...POLE_SHAPE_VALUES] : POLE_SHAPE_VALUES;
      return /* @__PURE__ */ jsxs("div", { className: "bg-white rounded-xl border border-gray-200 p-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 md:grid-cols-4 gap-2 items-end", children: [
          /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500 md:col-span-2", children: [
            "Pole",
            /* @__PURE__ */ jsxs(
              "select",
              {
                className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
                value: pole.pole_id || "",
                "aria-label": "Pole material",
                "aria-invalid": fieldIssue("pole_id") || void 0,
                "aria-describedby": fieldIssue("pole_id") ? describedBy : void 0,
                onChange: (e) => patchPole(index, { pole_id: e.target.value }),
                children: [
                  /* @__PURE__ */ jsx("option", { value: "", children: "Select pole..." }),
                  pole.pole_id && !options.some((o) => o.id === pole.pole_id) && /* @__PURE__ */ jsx("option", { value: pole.pole_id, disabled: true, children: `Catalog pole unavailable (${pole.pole_id})` }),
                  options.map((o) => /* @__PURE__ */ jsx("option", { value: o.id, children: o.material_name }, o.id))
                ]
              }
            ),
            pole.pole_id && !options.some((o) => o.id === pole.pole_id) && /* @__PURE__ */ jsx("span", { className: "block text-[10px] text-amber-700 mt-1", children: "Catalog pole unavailable; current pricing needs review." })
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
            "Shape",
            /* @__PURE__ */ jsxs(
              "select",
              {
                className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
                value: authoredShape,
                "aria-label": `Pole ${index + 1} cross-section shape`,
                "aria-invalid": fieldIssue("pole_shape") || void 0,
                "aria-describedby": fieldIssue("pole_shape") ? describedBy : void 0,
                onChange: (e) => patchPole(index, { pole_shape: e.target.value === "" ? void 0 : e.target.value }),
                children: [
                  /* @__PURE__ */ jsx("option", { value: "", children: "Catalog / unspecified" }),
                  shapeChoices.map((s) => /* @__PURE__ */ jsx("option", { value: s, children: s }, s))
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "text-xs text-gray-500", children: [
            "Foundation",
            /* @__PURE__ */ jsxs(
              "select",
              {
                className: "w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm",
                value: pole.foundation_component_id ?? "",
                "aria-label": "Pole foundation",
                onChange: (e) => {
                  const id = e.target.value;
                  const i = items.findIndex((it) => it.component_id === id);
                  patchPole(index, {
                    foundation_component_id: id,
                    foundation_idx: id === "" || i < 0 ? void 0 : i
                  });
                },
                children: [
                  /* @__PURE__ */ jsx("option", { value: "", children: "Unassigned" }),
                  pole.foundation_component_id && !items.some((it) => it.component_id === pole.foundation_component_id) && /* @__PURE__ */ jsx("option", { value: pole.foundation_component_id, disabled: true, children: `Missing foundation (${String(pole.foundation_component_id).slice(0, 18)}...)` }),
                  items.map((it, i) => /* @__PURE__ */ jsx("option", { value: it.component_id || "", children: it.description || `Foundation ${i + 1}` }, it.component_id || i))
                ]
              }
            ),
            /* @__PURE__ */ jsx(
              Button,
              {
                type: "button",
                variant: "outline",
                size: "sm",
                className: "mt-1",
                disabled: !pole.foundation_component_id || !items.some((it) => it.component_id === pole.foundation_component_id),
                onClick: () => {
                  const it = items.find((x) => x.component_id === pole.foundation_component_id);
                  const pos = it && layoutPositionInches(it);
                  const fp = it && foundationLayoutFootprint(it);
                  if (!pos?.valid || !fp) return;
                  patchPole(index, {
                    x_inches: Math.round((pos.x_inches + fp.width / 2) * 100) / 100,
                    z_inches: Math.round((pos.z_inches + fp.depth / 2) * 100) / 100
                  });
                },
                children: "Center on foundation"
              }
            ),
            /* @__PURE__ */ jsx(
              Button,
              {
                type: "button",
                variant: "outline",
                size: "sm",
                disabled: !pole.foundation_component_id || !items.some((it) => it.component_id === pole.foundation_component_id),
                onClick: () => {
                  const it = items.find((x) => x.component_id === pole.foundation_component_id);
                  const pos = it && layoutPositionInches(it);
                  const fp = it && foundationLayoutFootprint(it);
                  if (!pos?.valid || !fp) return;
                  const cover = Math.min(4, Math.max(0, fp.width / 2));
                  patchPole(index, {
                    x_inches: Math.round((pos.x_inches + fp.width - cover) * 100) / 100,
                    z_inches: Math.round((pos.z_inches + fp.depth / 2) * 100) / 100
                  });
                },
                children: "Snap to edge"
              }
            ),
            /* @__PURE__ */ jsx(
              Button,
              {
                type: "button",
                variant: "outline",
                size: "sm",
                disabled: !pole.foundation_component_id || !items.some((it) => it.component_id === pole.foundation_component_id),
                onClick: () => {
                  const it = items.find((x2) => x2.component_id === pole.foundation_component_id);
                  const pos = it && layoutPositionInches(it);
                  const fp = it && foundationLayoutFootprint(it);
                  if (!pos?.valid || !fp) return;
                  const siblings = (poles || []).filter((p) => p?.foundation_component_id === pole.foundation_component_id);
                  const n = Math.max(1, siblings.length);
                  const slot = siblings.findIndex((p) => p === pole || p.component_id === pole.component_id);
                  const i = slot < 0 ? 0 : slot;
                  const cover = Math.min(4, Math.max(0, fp.width / 4));
                  const span = fp.width - 2 * cover;
                  const x = n === 1 ? pos.x_inches + fp.width / 2 : pos.x_inches + cover + span * i / (n - 1 || 1);
                  patchPole(index, {
                    x_inches: Math.round(x * 100) / 100,
                    z_inches: Math.round((pos.z_inches + fp.depth / 2) * 100) / 100
                  });
                },
                children: "Spread on foundation"
              }
            ),
            (() => {
              const it = pole.foundation_component_id ? items.find((x) => x.component_id === pole.foundation_component_id) : null;
              const pos = it && layoutPositionInches(it);
              const fp = it && foundationLayoutFootprint(it);
              const px = Number(pole.x_inches), pz = Number(pole.z_inches);
              if (!pos?.valid || !fp || !Number.isFinite(px) || !Number.isFinite(pz)) return null;
              const edge = Math.min(px - pos.x_inches, pos.x_inches + fp.width - px, pz - pos.z_inches, pos.z_inches + fp.depth - pz);
              return /* @__PURE__ */ jsxs("span", { className: "block text-[10px] text-gray-500 mt-1", title: "Pole distance to the mounted foundation's nearest edge", children: [
                "Edge cover: ",
                edge >= 0 ? `${Math.round(edge)}"` : "outside footprint"
              ] });
            })()
          ] }),
          /* @__PURE__ */ jsx(
            FoundationDimensionInput,
            {
              ...poleDimMeta("height_inches"),
              value: pole.height_inches ?? "",
              onCommit: (v) => patchPole(index, { height_inches: v }),
              ariaLabel: `Pole ${index + 1} height above grade (inches)`,
              invalid: fieldIssue("height_inches") || void 0,
              describedBy: fieldIssue("height_inches") ? describedBy : void 0
            }
          ),
          /* @__PURE__ */ jsx(
            FoundationDimensionInput,
            {
              ...poleDimMeta("embedment_inches"),
              value: pole.embedment_inches !== void 0 && pole.embedment_inches !== null && pole.embedment_inches !== "" ? pole.embedment_inches : pole.y_offset_inches ?? "",
              onCommit: (v) => patchPole(index, {
                // Canonical field carries the edit; the legacy spelling
                // clears so the two can never diverge into a conflict.
                embedment_inches: v,
                y_offset_inches: void 0
              }),
              ariaLabel: `Pole ${index + 1} embedment below grade (inches)`,
              invalid: fieldIssue("embedment_inches") || fieldIssue("y_offset_inches") || void 0,
              describedBy: fieldIssue("embedment_inches") || fieldIssue("y_offset_inches") ? describedBy : void 0
            }
          ),
          /* @__PURE__ */ jsx(
            FoundationDimensionInput,
            {
              ...poleDimMeta("base_offset_inches"),
              value: pole.base_offset_inches ?? "",
              onCommit: (v) => patchPole(index, { base_offset_inches: v }),
              ariaLabel: `Pole ${index + 1} base offset above grade (inches)`,
              invalid: fieldIssue("base_offset_inches") || void 0,
              describedBy: fieldIssue("base_offset_inches") ? describedBy : void 0
            }
          ),
          /* @__PURE__ */ jsx(
            FoundationDimensionInput,
            {
              ...poleDimMeta("total_length_inches"),
              value: pole.total_length_inches ?? "",
              onCommit: (v) => patchPole(index, { total_length_inches: v }),
              ariaLabel: `Pole ${index + 1} total stock length (inches)`,
              invalid: fieldIssue("total_length_inches") || void 0,
              describedBy: fieldIssue("total_length_inches") ? describedBy : void 0
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mt-2", children: [
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-1.5 text-xs font-medium text-gray-700", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "checkbox",
                checked: !!pole.include_pole_painting,
                "aria-invalid": issues.some((i) => i.code === "pole_paint_setting_unavailable") || void 0,
                "aria-describedby": issues.some((i) => i.code === "pole_paint_setting_unavailable") ? describedBy : void 0,
                onChange: (e) => patchPole(index, { include_pole_painting: e.target.checked })
              }
            ),
            "Paint pole"
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 text-xs text-gray-600", children: [
            geometry && Number.isFinite(geometry.required_length_inches) && /* @__PURE__ */ jsxs("span", { title: `Required ${geometry.required_length_inches} in${Number.isFinite(pole.stock_pieces) ? `  -  ${pole.stock_pieces} stock ${pole.stock_pieces === 1 ? "piece" : "pieces"}` : ""}${geometry.pole_shape ? `  -  ${geometry.pole_shape}` : ""}${geometry.base_offset_inches > 0 ? `  -  base +${geometry.base_offset_inches} in` : ""}`, children: [
              geometry.required_length_inches,
              " in req"
            ] }),
            /* @__PURE__ */ jsxs("span", { children: [
              "Pole ",
              hasFoundationCostSnapshot(pole.pole_cost) ? money(pole.pole_cost) : "Not saved"
            ] }),
            /* @__PURE__ */ jsxs("span", { children: [
              "Paint ",
              hasFoundationCostSnapshot(pole.pole_painting_cost) ? money(pole.pole_painting_cost) : "Not saved"
            ] }),
            /* @__PURE__ */ jsx("span", { className: "font-bold text-gray-900 text-sm", children: hasFoundationCostSnapshot(pole.total_cost) ? money(pole.total_cost) : "Not saved" }),
            pricingUnavailable && /* @__PURE__ */ jsx("span", { className: "col-span-full text-[10px] text-amber-700", children: "Saved amounts (not current pricing)" }),
            /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "icon", onClick: () => removePole(index), children: /* @__PURE__ */ jsx(Trash2, { className: "w-4 h-4 text-red-500", "aria-hidden": "true" }) })
          ] })
        ] }),
        issues.length > 0 && /* @__PURE__ */ jsx("div", { role: "status", className: "mt-2 text-[10px] text-amber-700 space-y-0.5", id: `pole-${index}-pricing`, children: issues.map((issue) => /* @__PURE__ */ jsx("p", { children: issue.message }, `${issue.field}-${issue.code}`)) }),
        (() => {
          const s = suggestFeasibleDimensions(pole);
          if (!s.available) return null;
          return /* @__PURE__ */ jsxs("p", { className: "mt-1 text-[9px] text-gray-400 italic", children: [
            "Feasible dims: embedment \u2265",
            s.embedment_inches,
            "\u2033",
            s.shaft_diameter_inches ? `, shaft dia &ge;${s.shaft_diameter_inches}&Prime;` : "",
            " ",
            "(",
            s.governing,
            ")"
          ] });
        })(),
        /* @__PURE__ */ jsxs("div", { className: "mt-2 border-t border-gray-100 pt-2", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-1.5", children: [
            /* @__PURE__ */ jsxs("span", { className: "text-[11px] font-semibold text-gray-600", children: [
              "Signs on this pole (",
              (pole.signs || []).length,
              ")"
            ] }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => patchPole(index, {
                  signs: [...pole.signs || [], {
                    component_id: `pole_sign_${Math.random().toString(36).slice(2, 10)}`,
                    name: "",
                    width_inches: 48,
                    height_inches: 24,
                    depth_inches: 8,
                    mount_height_inches: pole.height_inches || 96,
                    face_count: 1
                  }]
                }),
                className: "h-[24px] px-2 rounded-sm border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-50",
                children: "+ Sign"
              }
            )
          ] }),
          (pole.signs || []).map((s, si) => {
            const patchSign = (changes) => patchPole(index, {
              signs: (pole.signs || []).map((sg, j) => j === si ? { ...sg, ...changes } : sg)
            });
            return /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-end gap-2 mb-1.5 rounded-sm border border-gray-100 bg-gray-50/60 px-2 py-1.5", children: [
              /* @__PURE__ */ jsxs("label", { className: "text-[10px] text-gray-500", children: [
                "Sign",
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    value: s.name ?? "",
                    placeholder: `Sign ${si + 1}`,
                    onChange: (e) => patchSign({ name: e.target.value }),
                    className: "block w-24 h-7 rounded-sm border border-gray-300 px-1.5 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} name`
                  }
                )
              ] }),
              /* @__PURE__ */ jsx(
                FoundationDimensionInput,
                {
                  ...signDimMeta("width_inches"),
                  value: s.width_inches ?? "",
                  onCommit: (v) => patchSign({ width_inches: v }),
                  ariaLabel: `Pole ${index + 1} sign ${si + 1} width (inches)`
                }
              ),
              /* @__PURE__ */ jsx(
                FoundationDimensionInput,
                {
                  ...signDimMeta("height_inches"),
                  value: s.height_inches ?? "",
                  onCommit: (v) => patchSign({ height_inches: v }),
                  ariaLabel: `Pole ${index + 1} sign ${si + 1} height (inches)`
                }
              ),
              /* @__PURE__ */ jsx(
                FoundationDimensionInput,
                {
                  ...signDimMeta("mount_height_inches"),
                  value: s.mount_height_inches ?? "",
                  onCommit: (v) => patchSign({ mount_height_inches: v }),
                  ariaLabel: `Pole ${index + 1} sign ${si + 1} mount height (inches)`
                }
              ),
              /* @__PURE__ */ jsx(
                FoundationDimensionInput,
                {
                  ...signDimMeta("depth_inches"),
                  value: s.depth_inches ?? "",
                  onCommit: (v) => patchSign({ depth_inches: v }),
                  ariaLabel: `Pole ${index + 1} sign ${si + 1} depth (inches)`
                }
              ),
              /* @__PURE__ */ jsx(
                FoundationDimensionInput,
                {
                  ...signDimMeta("horizontal_offset_inches"),
                  value: s.horizontal_offset_inches ?? "",
                  onCommit: (v) => patchSign({ horizontal_offset_inches: v }),
                  ariaLabel: `Pole ${index + 1} sign ${si + 1} horizontal offset (inches)`
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: () => patchSign({ horizontal_offset_inches: 0 }),
                  className: "h-9 px-2 self-end rounded-md border border-gray-300 text-[10px] text-gray-600 hover:bg-gray-50",
                  "aria-label": `Pole ${index + 1} sign ${si + 1} center on pole`,
                  children: "Center"
                }
              ),
              /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-1 text-[10px] text-gray-500 self-end pb-1", title: "Mirror a second sign across the pole", children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "checkbox",
                    checked: s.twin === true,
                    onChange: (e) => patchSign({ twin: e.target.checked }),
                    className: "h-3.5 w-3.5",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} twin`
                  }
                ),
                "Twin"
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-1 text-[10px] text-gray-500 self-end pb-1", title: "Linked sign -- display only, excluded from sign cost", children: [
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "checkbox",
                    checked: s.display_only === true,
                    onChange: (e) => patchSign({ display_only: e.target.checked ? true : void 0 }),
                    className: "h-3.5 w-3.5",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} linked display-only`
                  }
                ),
                "Linked"
              ] }),
              s.display_only === true && /* @__PURE__ */ jsxs("label", { className: "text-[10px] text-gray-500", title: "The linked sign product this display-only sign represents", children: [
                "Linked product",
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    placeholder: "product id/name",
                    value: s.linked_product_id ?? "",
                    onChange: (e) => patchSign({ linked_product_id: e.target.value === "" ? void 0 : e.target.value }),
                    className: "ml-1 h-5 w-20 rounded-sm border border-gray-300 px-0.5 text-[9px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} linked product`
                  }
                )
              ] }),
              s.display_only === true && /* @__PURE__ */ jsxs("label", { className: "text-[10px] text-gray-500", title: "The sign's quote/job links (preserved through edits)", children: [
                "Quote / job",
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    placeholder: "quote id",
                    value: s.quote_link ?? "",
                    onChange: (e) => patchSign({ quote_link: e.target.value === "" ? void 0 : e.target.value }),
                    className: "ml-1 h-5 w-16 rounded-sm border border-gray-300 px-0.5 text-[9px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} quote link`
                  }
                ),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    placeholder: "job id",
                    value: s.job_link ?? "",
                    onChange: (e) => patchSign({ job_link: e.target.value === "" ? void 0 : e.target.value }),
                    className: "ml-0.5 h-5 w-16 rounded-sm border border-gray-300 px-0.5 text-[9px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} job link`
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "text-[10px] text-gray-500", title: "The sign's span -- comma-separated pole indexes it spans (a multipole sign)", children: [
                "Spans",
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    placeholder: "pole idx e.g. 1,3",
                    value: s.spans ?? "",
                    onChange: (e) => patchSign({ spans: e.target.value === "" ? void 0 : e.target.value }),
                    className: "ml-1 h-5 w-20 rounded-sm border border-gray-300 px-0.5 text-[9px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} spans`
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "text-[10px] text-gray-500", title: "The sign's mount kind -- pole (default) vs wall_top / foundation", children: [
                "Mount",
                /* @__PURE__ */ jsxs(
                  "select",
                  {
                    value: s.mount_type ?? "pole",
                    onChange: (e) => patchSign({ mount_type: e.target.value === "pole" ? void 0 : e.target.value }),
                    className: "ml-1 h-5 rounded-sm border border-gray-300 px-0.5 text-[9px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} mount type`,
                    children: [
                      /* @__PURE__ */ jsx("option", { value: "pole", children: "pole" }),
                      /* @__PURE__ */ jsx("option", { value: "wall_top", children: "wall top" }),
                      /* @__PURE__ */ jsx("option", { value: "foundation", children: "foundation" })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "text-[10px] text-gray-500", children: [
                "Weight (lb)",
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "number",
                    min: "0",
                    step: "0.1",
                    value: s.weight_lbs ?? "",
                    onChange: (e) => patchSign({ weight_lbs: e.target.value === "" ? void 0 : Number(e.target.value) }),
                    className: "block w-16 h-7 rounded-sm border border-gray-300 px-1.5 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} weight (lbs)`
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "text-[10px] text-gray-500", children: [
                "Cost $",
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "number",
                    min: "0",
                    step: "0.01",
                    value: s.unit_cost ?? "",
                    placeholder: "Not saved",
                    onChange: (e) => patchSign({ unit_cost: e.target.value === "" ? void 0 : Number(e.target.value) }),
                    className: "block w-20 h-7 rounded-sm border border-gray-300 px-1.5 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} unit cost`
                  }
                )
              ] }),
              [["hardware_cost", "Hardware $"], ["labor_cost", "Labor $"], ["paint_cost", "Paint $"], ["waste_cost", "Waste $"]].map(([f, label]) => /* @__PURE__ */ jsxs("label", { className: "text-[10px] text-gray-500", children: [
                label,
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "number",
                    min: "0",
                    step: "0.01",
                    value: s[f] ?? "",
                    placeholder: "0",
                    onChange: (e) => patchSign({ [f]: e.target.value === "" ? void 0 : Number(e.target.value) }),
                    className: "block w-16 h-7 rounded-sm border border-gray-300 px-1.5 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} ${f}`
                  }
                )
              ] }, f)),
              /* @__PURE__ */ jsxs("label", { className: "text-[10px] text-gray-500", children: [
                "Faces",
                /* @__PURE__ */ jsx(
                  "select",
                  {
                    value: Number(s.face_count) || 1,
                    onChange: (e) => patchSign({ face_count: Number(e.target.value) }),
                    className: "block w-14 h-7 rounded-sm border border-gray-300 px-1 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} face count`,
                    children: [1, 2, 3, 4].map((n) => /* @__PURE__ */ jsx("option", { value: n, children: n }, n))
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "text-[10px] text-gray-500", children: [
                "Shape",
                /* @__PURE__ */ jsxs(
                  "select",
                  {
                    value: s.panel_shape ?? "",
                    onChange: (e) => patchSign({ panel_shape: e.target.value === "" ? void 0 : e.target.value }),
                    className: "block w-16 h-7 rounded-sm border border-gray-300 px-1 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} panel shape`,
                    children: [
                      /* @__PURE__ */ jsx("option", { value: "", children: "--" }),
                      /* @__PURE__ */ jsx("option", { value: "cabinet", children: "Cabinet" }),
                      /* @__PURE__ */ jsx("option", { value: "panel", children: "Panel" }),
                      /* @__PURE__ */ jsx("option", { value: "letters", children: "Letters" })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "text-[10px] text-gray-500", children: [
                "Trim",
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    value: s.trim_color ?? "",
                    placeholder: "color",
                    onChange: (e) => patchSign({ trim_color: e.target.value === "" ? void 0 : e.target.value }),
                    className: "block w-14 h-7 rounded-sm border border-gray-300 px-1 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} trim color`
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "text-[10px] text-gray-500", children: [
                "Body",
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    value: s.body_color ?? "",
                    placeholder: "color",
                    onChange: (e) => patchSign({ body_color: e.target.value === "" ? void 0 : e.target.value }),
                    className: "block w-14 h-7 rounded-sm border border-gray-300 px-1 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} body color`
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "text-[10px] text-gray-500", children: [
                "Envelope",
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    value: s.envelope ?? "",
                    placeholder: `4'x2'x8"`,
                    onChange: (e) => patchSign({ envelope: e.target.value === "" ? void 0 : e.target.value }),
                    className: "block w-20 h-7 rounded-sm border border-gray-300 px-1 text-[11px]",
                    "aria-label": `Pole ${index + 1} sign ${si + 1} envelope`
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("label", { className: "text-[10px] text-gray-500", children: [
                "Artwork",
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    value: s.artwork_url ?? "",
                    placeholder: "image URL or file ref",
                    onChange: (e) => patchSign({ artwork_url: e.target.value === "" ? void 0 : e.target.value }),
                    "aria-label": `Pole ${index + 1} sign ${si + 1} artwork URL`
                  }
                )
              ] }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "file",
                  accept: "image/*",
                  onChange: (e) => {
                    const f = e.target.files?.[0];
                    if (f) patchSign({ artwork_url: URL.createObjectURL(f), artwork_name: f.name });
                    e.target.value = "";
                  },
                  className: "text-[10px]",
                  "aria-label": `Pole ${index + 1} sign ${si + 1} artwork upload`
                }
              ),
              s.artwork_url && /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: () => patchSign({ artwork_url: void 0, artwork_name: void 0, artwork_fit: void 0, artwork_scale: void 0 }),
                  className: "text-[9px] text-red-600 hover:underline",
                  "aria-label": `Pole ${index + 1} sign ${si + 1} clear artwork`,
                  children: "Clear artwork"
                }
              ),
              s.artwork_url && /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx("label", { className: "text-[10px] text-gray-500 self-end", title: "Artwork fit", children: /* @__PURE__ */ jsxs(
                  "select",
                  {
                    value: s.artwork_fit ?? "cover",
                    onChange: (e) => patchSign({ artwork_fit: e.target.value === "cover" ? void 0 : e.target.value }),
                    className: "h-5 rounded-sm border border-gray-300 px-0.5 text-[9px]",
                    "aria-label": `Sign ${si + 1} artwork fit`,
                    children: [
                      /* @__PURE__ */ jsx("option", { value: "cover", children: "Cover" }),
                      /* @__PURE__ */ jsx("option", { value: "contain", children: "Contain" }),
                      /* @__PURE__ */ jsx("option", { value: "fill", children: "Fill" })
                    ]
                  }
                ) }),
                /* @__PURE__ */ jsx("label", { className: "text-[10px] text-gray-500 self-end", title: "Artwork scale", children: /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "number",
                    min: "0.1",
                    max: "4",
                    step: "0.1",
                    placeholder: "1",
                    value: s.artwork_scale ?? "",
                    onChange: (e) => patchSign({ artwork_scale: e.target.value === "" ? void 0 : Number(e.target.value) }),
                    className: "h-5 w-10 rounded-sm border border-gray-300 px-0.5 text-[9px]",
                    "aria-label": `Sign ${si + 1} artwork scale`
                  }
                ) }),
                /* @__PURE__ */ jsx(
                  "img",
                  {
                    src: s.artwork_url,
                    alt: `Sign ${si + 1} artwork`,
                    className: "h-7 w-7 self-end rounded-sm border border-gray-200 object-cover",
                    style: { objectFit: s.artwork_fit || "cover", transform: s.artwork_scale ? `scale(${s.artwork_scale})` : void 0 },
                    onError: (e) => {
                      e.currentTarget.style.display = "none";
                    }
                  }
                )
              ] }),
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: () => patchPole(index, { signs: (pole.signs || []).filter((_, j) => j !== si) }),
                  className: "h-7 w-7 rounded-sm text-red-500 hover:bg-red-50",
                  "aria-label": `Remove sign ${si + 1} from pole ${index + 1}`,
                  children: /* @__PURE__ */ jsx(Trash2, { className: "w-3.5 h-3.5 mx-auto", "aria-hidden": "true" })
                }
              )
            ] }, s.component_id || si);
          }),
          (pole.signs || []).length > 0 && (() => {
            const costs = (pole.signs || []).map((s) => {
              const unit = Number(s?.unit_cost);
              if (!(Number.isFinite(unit) && unit >= 0)) return null;
              let t = unit;
              for (const p of [s?.hardware_cost, s?.labor_cost, s?.paint_cost, s?.waste_cost]) {
                if (p == null || p === "") continue;
                const n = Number(p);
                if (!(Number.isFinite(n) && n >= 0)) return null;
                t += n;
              }
              return t;
            });
            const all = costs.every((c) => c !== null) && costs.length > 0;
            return /* @__PURE__ */ jsxs("div", { className: "text-right text-[11px] text-gray-600 mt-1", children: [
              "Signs total: ",
              all ? /* @__PURE__ */ jsx("span", { className: "font-semibold text-gray-900", children: money(costs.reduce((a, b) => a + b, 0)) }) : /* @__PURE__ */ jsx("span", { className: "text-amber-700", children: "Not saved  -  record a cost on every sign" })
            ] });
          })()
        ] })
      ] }, pole.component_id || index);
    })
  ] });
}
export {
  FoundationPolesPanel as default
};
