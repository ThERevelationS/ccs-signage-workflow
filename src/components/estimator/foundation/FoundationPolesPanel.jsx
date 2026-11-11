import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { money } from "./foundationCalc";
import { suggestFeasibleDimensions } from "./poleCalculator";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";
import { FoundationDimensionInput } from "./foundationFtInEntry";
import { foundationDimensionFieldMeta } from "./foundationGeometryInputs";
import {
  POLE_SHAPE_VALUES,
  consolidateFoundationPoles,
} from "./poleCalculator";
import { foundationLayoutFootprint, layoutPositionInches } from "./foundationLayoutModel";

// O-093 (CMP-H02): linear-dimension fields take feet/inches entry through the
// shared dimension field  -  same verbatim-draft contract as the CMP-A08
// boundary it replaces, canonical inches stored, plain-language label + help +
// suggested-format placeholder from the field meta map (never stored defaults).
const poleDimMeta = (field) => foundationDimensionFieldMeta("pole", field);
const signDimMeta = (field) => foundationDimensionFieldMeta("sign", field);

// CMP-E01/O-056: the project-level poles list below is the single priced
// representation. Items can still carry pre-consolidation pole fields; they
// surface here as an advisory (never priced  -  no double charge) and move onto
// the canonical list only through the explicit onMigrateItemPole callback.
// CMP-E02/O-057: the inputs keep the five distinct quantities separate  - 
// height above grade, embedment below grade (canonical `embedment_inches`;
// a legacy row's `y_offset_inches` migrates into it on edit), vertical base
// offset, and explicit total stock length  -  with the actual shape carried on
// `pole_shape`.
export default function FoundationPolesPanel({ poles = [], options = [], items = [], onChange, polePricing = [], onMigrateItemPole }) {
  const patchPole = (index, changes) =>
    onChange(poles.map((p, i) => (i === index ? { ...p, ...changes } : p)));

  const removePole = (index) => {
    if (!window.confirm(`Remove Pole ${index + 1}? Cabinets mounted on it are retained for review.`)) return;
    onChange(poles.filter((_, i) => i !== index));
  };

  const addPole = () =>
    onChange([
      ...poles,
      { pole_id: options[0]?.id || "", height_inches: 120, embedment_inches: 42, include_pole_painting: false },
    ]);

  // Legacy item-pole fields ride on the items; they are advisory-only and
  // never part of the priced list this panel edits.
  const consolidated = consolidateFoundationPoles({ items, poles });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Poles</h2>
          <p className="text-xs text-gray-500">
            Priced on billed length  -  an explicit total stock length, or height above grade plus embedment.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={addPole} disabled={options.length === 0}>
          <Plus className="w-4 h-4" aria-hidden="true" /> Pole
        </Button>
      </div>

      {options.length === 0 && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Pole catalog unavailable  -  existing rows remain editable; new poles cannot be added.
        </div>
      )}
      {consolidated.legacyPoles.length > 0 && (
        <div role="status" className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 space-y-1">
          <p className="font-semibold">Legacy item-pole data  -  not priced</p>
          {consolidated.legacyPoles.map((d) => (
            <div key={d.source_item_component_id || `item-${d.source_item_index}`} className="flex items-center justify-between gap-2">
              <span>
                Foundation {d.source_item_index + 1} carries legacy pole fields
                {d.legacy_pole_cost !== null || d.legacy_pole_painting_cost !== null ? " (with saved amounts)" : ""}.
              </span>
              {typeof onMigrateItemPole === "function" && (
                <Button variant="outline" size="sm" onClick={() => onMigrateItemPole(d.source_item_index)}>
                  Move to Poles
                </Button>
              )}
            </div>
          ))}
          {consolidated.overlaps.length > 0 && (
            <p>A project pole already sits on the same foundation  -  verify it is not the same physical pole before migrating.</p>
          )}
        </div>
      )}
      {poles.length === 0 ? (
        <div className="text-center py-6 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm">
          No poles on this section.
        </div>
      ) : (
        poles.map((pole, index) => {
          const issues = polePricing[index]?.issues || [];
          const pricingUnavailable = polePricing[index]?.available === false;
          const geometry = polePricing[index]?.geometry || null;
          const fieldIssue = (field) => issues.some((i) => i.field === field);
          const describedBy = issues.length ? `pole-${index}-pricing` : undefined;
          const authoredShape = pole.pole_shape ?? "";
          const shapeChoices = authoredShape && !POLE_SHAPE_VALUES.includes(authoredShape)
            ? [authoredShape, ...POLE_SHAPE_VALUES]
            : POLE_SHAPE_VALUES;
          return (
            <div key={pole.component_id || index} className="bg-white rounded-xl border border-gray-200 p-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                <label className="text-xs text-gray-500 md:col-span-2">
                  Pole
                  <select
                    className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                    value={pole.pole_id || ""}
                    aria-label="Pole material"
                    aria-invalid={fieldIssue("pole_id") || undefined}
                    aria-describedby={fieldIssue("pole_id") ? describedBy : undefined}
                    onChange={(e) => patchPole(index, { pole_id: e.target.value })}
                  >
                    <option value="">Select pole...</option>
                    {pole.pole_id && !options.some((o) => o.id === pole.pole_id) && (
                      <option value={pole.pole_id} disabled>{`Catalog pole unavailable (${pole.pole_id})`}</option>
                    )}
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.material_name}
                      </option>
                    ))}
                  </select>
                  {pole.pole_id && !options.some((o) => o.id === pole.pole_id) && (
                    <span className="block text-[10px] text-amber-700 mt-1">Catalog pole unavailable; current pricing needs review.</span>
                  )}
                </label>
                <label className="text-xs text-gray-500">
                  Shape
                  <select
                    className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                    value={authoredShape}
                    aria-label={`Pole ${index + 1} cross-section shape`}
                    aria-invalid={fieldIssue("pole_shape") || undefined}
                    aria-describedby={fieldIssue("pole_shape") ? describedBy : undefined}
                    onChange={(e) => patchPole(index, { pole_shape: e.target.value === "" ? undefined : e.target.value })}
                  >
                    <option value="">Catalog / unspecified</option>
                    {shapeChoices.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-gray-500">
                  Foundation
                  <select
                    className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                    value={pole.foundation_component_id ?? ""}
                    aria-label="Pole foundation"
                    onChange={(e) => {
                      const id = e.target.value;
                      const i = items.findIndex((it) => it.component_id === id);
                      patchPole(index, {
                        foundation_component_id: id,
                        foundation_idx: id === "" || i < 0 ? undefined : i,
                      });
                    }}
                  >
                    <option value="">Unassigned</option>
                    {pole.foundation_component_id && !items.some((it) => it.component_id === pole.foundation_component_id) && (
                      <option value={pole.foundation_component_id} disabled>{`Missing foundation (${String(pole.foundation_component_id).slice(0, 18)}...)`}</option>
                    )}
                    {items.map((it, i) => (
                      <option key={it.component_id || i} value={it.component_id || ""}>
                        {it.description || `Foundation ${i + 1}`}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button" variant="outline" size="sm" className="mt-1"
                    disabled={!pole.foundation_component_id || !items.some((it) => it.component_id === pole.foundation_component_id)}
                    onClick={() => {
                      const it = items.find((x) => x.component_id === pole.foundation_component_id);
                      const pos = it && layoutPositionInches(it);
                      const fp = it && foundationLayoutFootprint(it);
                      if (!pos?.valid || !fp) return;
                      patchPole(index, {
                        x_inches: Math.round((pos.x_inches + fp.width / 2) * 100) / 100,
                        z_inches: Math.round((pos.z_inches + fp.depth / 2) * 100) / 100,
                      });
                    }}
                  >
                    Center on foundation
                  </Button>
                  {/* O-058 (CMP-E03) -- snap-to-edge variant: snaps the pole's
                      x/z to the mounted foundation's right edge (footprint
                      edge minus a 4" cover offset); center z. A snap-to-edge
                      the layout explicitly chooses -- never an invented
                      placement. */}
                  <Button
                    type="button" variant="outline" size="sm"
                    disabled={!pole.foundation_component_id || !items.some((it) => it.component_id === pole.foundation_component_id)}
                    onClick={() => {
                      const it = items.find((x) => x.component_id === pole.foundation_component_id);
                      const pos = it && layoutPositionInches(it);
                      const fp = it && foundationLayoutFootprint(it);
                      if (!pos?.valid || !fp) return;
                      const cover = Math.min(4, Math.max(0, fp.width / 2));
                      patchPole(index, {
                        x_inches: Math.round((pos.x_inches + fp.width - cover) * 100) / 100,
                        z_inches: Math.round((pos.z_inches + fp.depth / 2) * 100) / 100,
                      });
                    }}
                  >
                    Snap to edge
                  </Button>
                  {/* O-058 (CMP-E03) -- multi-instance spread: for a quantity>1
                      foundation or a pole row spanning several mounts, the
                      pole snaps to a spread position along the mounted item's
                      width (index-th position across N poles on the same
                      mount) -- an explicit spread, never an invented
                      placement. */}
                  <Button
                    type="button" variant="outline" size="sm"
                    disabled={!pole.foundation_component_id || !items.some((it) => it.component_id === pole.foundation_component_id)}
                    onClick={() => {
                      const it = items.find((x) => x.component_id === pole.foundation_component_id);
                      const pos = it && layoutPositionInches(it);
                      const fp = it && foundationLayoutFootprint(it);
                      if (!pos?.valid || !fp) return;
                      const siblings = (poles || []).filter((p) => p?.foundation_component_id === pole.foundation_component_id);
                      const n = Math.max(1, siblings.length);
                      const slot = siblings.findIndex((p) => p === pole || p.component_id === pole.component_id);
                      const i = slot < 0 ? 0 : slot;
                      const cover = Math.min(4, Math.max(0, fp.width / 4));
                      const span = fp.width - 2 * cover;
                      const x = n === 1 ? pos.x_inches + fp.width / 2 : pos.x_inches + cover + (span * i) / (n - 1 || 1);
                      patchPole(index, {
                        x_inches: Math.round(x * 100) / 100,
                        z_inches: Math.round((pos.z_inches + fp.depth / 2) * 100) / 100,
                      });
                    }}
                  >
                    Spread on foundation
                  </Button>
                  {/* O-058 (CMP-E03) -- edge/cover readout: the pole's nearest
                      distance to the mounted foundation's edge (in inches).
                      Read-only; absent when unmounted or placement unresolved. */}
                  {(() => {
                    const it = pole.foundation_component_id
                      ? items.find((x) => x.component_id === pole.foundation_component_id)
                      : null;
                    const pos = it && layoutPositionInches(it);
                    const fp = it && foundationLayoutFootprint(it);
                    const px = Number(pole.x_inches), pz = Number(pole.z_inches);
                    if (!pos?.valid || !fp || !Number.isFinite(px) || !Number.isFinite(pz)) return null;
                    const edge = Math.min(px - pos.x_inches, pos.x_inches + fp.width - px, pz - pos.z_inches, pos.z_inches + fp.depth - pz);
                    return (
                      <span className="block text-[10px] text-gray-500 mt-1" title="Pole distance to the mounted foundation's nearest edge">
                        Edge cover: {edge >= 0 ? `${Math.round(edge)}"` : "outside footprint"}
                      </span>
                    );
                  })()}
                </label>
                <FoundationDimensionInput
                  {...poleDimMeta("height_inches")}
                  value={pole.height_inches ?? ""}
                  onCommit={(v) => patchPole(index, { height_inches: v })}
                  ariaLabel={`Pole ${index + 1} height above grade (inches)`}
                  invalid={fieldIssue("height_inches") || undefined}
                  describedBy={fieldIssue("height_inches") ? describedBy : undefined}
                />
                <FoundationDimensionInput
                  {...poleDimMeta("embedment_inches")}
                  // A recorded canonical value wins; blank canonical falls
                  // back to the legacy spelling so display matches pricing.
                  value={(pole.embedment_inches !== undefined && pole.embedment_inches !== null && pole.embedment_inches !== "")
                    ? pole.embedment_inches
                    : (pole.y_offset_inches ?? "")}
                  onCommit={(v) => patchPole(index, {
                    // Canonical field carries the edit; the legacy spelling
                    // clears so the two can never diverge into a conflict.
                    embedment_inches: v,
                    y_offset_inches: undefined,
                  })}
                  ariaLabel={`Pole ${index + 1} embedment below grade (inches)`}
                  invalid={fieldIssue("embedment_inches") || fieldIssue("y_offset_inches") || undefined}
                  describedBy={(fieldIssue("embedment_inches") || fieldIssue("y_offset_inches")) ? describedBy : undefined}
                />
                <FoundationDimensionInput
                  {...poleDimMeta("base_offset_inches")}
                  value={pole.base_offset_inches ?? ""}
                  onCommit={(v) => patchPole(index, { base_offset_inches: v })}
                  ariaLabel={`Pole ${index + 1} base offset above grade (inches)`}
                  invalid={fieldIssue("base_offset_inches") || undefined}
                  describedBy={fieldIssue("base_offset_inches") ? describedBy : undefined}
                />
                <FoundationDimensionInput
                  {...poleDimMeta("total_length_inches")}
                  value={pole.total_length_inches ?? ""}
                  onCommit={(v) => patchPole(index, { total_length_inches: v })}
                  ariaLabel={`Pole ${index + 1} total stock length (inches)`}
                  invalid={fieldIssue("total_length_inches") || undefined}
                  describedBy={fieldIssue("total_length_inches") ? describedBy : undefined}
                />
              </div>

              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={!!pole.include_pole_painting}
                    aria-invalid={issues.some((i) => i.code === "pole_paint_setting_unavailable") || undefined}
                    aria-describedby={issues.some((i) => i.code === "pole_paint_setting_unavailable") ? describedBy : undefined}
                    onChange={(e) => patchPole(index, { include_pole_painting: e.target.checked })}
                  />
                  Paint pole
                </label>
                <div className="flex items-center gap-3 text-xs text-gray-600">
                  {geometry && Number.isFinite(geometry.required_length_inches) && (
                    <span title={`Required ${geometry.required_length_inches} in${Number.isFinite(pole.stock_pieces) ? `  -  ${pole.stock_pieces} stock ${pole.stock_pieces === 1 ? "piece" : "pieces"}` : ""}${geometry.pole_shape ? `  -  ${geometry.pole_shape}` : ""}${geometry.base_offset_inches > 0 ? `  -  base +${geometry.base_offset_inches} in` : ""}`}>
                      {geometry.required_length_inches} in req
                    </span>
                  )}
                  <span>Pole {hasFoundationCostSnapshot(pole.pole_cost) ? money(pole.pole_cost) : "Not saved"}</span>
                  <span>Paint {hasFoundationCostSnapshot(pole.pole_painting_cost) ? money(pole.pole_painting_cost) : "Not saved"}</span>
                  <span className="font-bold text-gray-900 text-sm">{hasFoundationCostSnapshot(pole.total_cost) ? money(pole.total_cost) : "Not saved"}</span>
                  {pricingUnavailable && <span className="col-span-full text-[10px] text-amber-700">Saved amounts (not current pricing)</span>}
                  <Button variant="ghost" size="icon" onClick={() => removePole(index)}>
                    <Trash2 className="w-4 h-4 text-red-500" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              {issues.length > 0 && (
                <div role="status" className="mt-2 text-[10px] text-amber-700 space-y-0.5" id={`pole-${index}-pricing`}>
                  {issues.map((issue) => <p key={`${issue.field}-${issue.code}`}>{issue.message}</p>)}
                </div>
              )}
              {/* O-115 (CMP-I14) -- feasible candidate dims inside the documented
                  method domain (embedment = h/3 engineering guidance, shaft dia
                  = 2x pole dia shop clearance) -- a traceable alternative, not a
                  "bigger" multiplier. Advisory only. */}
              {(() => {
                const s = suggestFeasibleDimensions(pole);
                if (!s.available) return null;
                return (
                  <p className="mt-1 text-[9px] text-gray-400 italic">
                    Feasible dims: embedment &ge;{s.embedment_inches}&Prime;
                    {s.shaft_diameter_inches ? `, shaft dia &ge;${s.shaft_diameter_inches}&Prime;` : ""}
                    {" "}({s.governing})
                  </p>
                );
              })()}
              {/* O-060 (CMP-E08)  -  editable sign list on the pole: each sign
                  carries its own dims + mount height; the assembly model
                  normalizes component_ids. */}
              <div className="mt-2 border-t border-gray-100 pt-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-gray-600">Signs on this pole ({(pole.signs || []).length})</span>
                  <button
                    type="button"
                    onClick={() => patchPole(index, {
                      signs: [...(pole.signs || []), {
                        component_id: `pole_sign_${Math.random().toString(36).slice(2, 10)}`,
                        name: "",
                        width_inches: 48, height_inches: 24, depth_inches: 8,
                        mount_height_inches: pole.height_inches || 96,
                        face_count: 1,
                      }],
                    })}
                    className="h-[24px] px-2 rounded-sm border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-50"
                  >
                    + Sign
                  </button>
                </div>
                {(pole.signs || []).map((s, si) => {
                  const patchSign = (changes) => patchPole(index, {
                    signs: (pole.signs || []).map((sg, j) => (j === si ? { ...sg, ...changes } : sg)),
                  });
                  return (
                    <div key={s.component_id || si} className="flex flex-wrap items-end gap-2 mb-1.5 rounded-sm border border-gray-100 bg-gray-50/60 px-2 py-1.5">
                      <label className="text-[10px] text-gray-500">
                        Sign
                        <input
                          type="text"
                          value={s.name ?? ""}
                          placeholder={`Sign ${si + 1}`}
                          onChange={(e) => patchSign({ name: e.target.value })}
                          className="block w-24 h-7 rounded-sm border border-gray-300 px-1.5 text-[11px]"
                          aria-label={`Pole ${index + 1} sign ${si + 1} name`}
                        />
                      </label>
                      <FoundationDimensionInput
                        {...signDimMeta("width_inches")}
                        value={s.width_inches ?? ""}
                        onCommit={(v) => patchSign({ width_inches: v })}
                        ariaLabel={`Pole ${index + 1} sign ${si + 1} width (inches)`}
                      />
                      <FoundationDimensionInput
                        {...signDimMeta("height_inches")}
                        value={s.height_inches ?? ""}
                        onCommit={(v) => patchSign({ height_inches: v })}
                        ariaLabel={`Pole ${index + 1} sign ${si + 1} height (inches)`}
                      />
                      <FoundationDimensionInput
                        {...signDimMeta("mount_height_inches")}
                        value={s.mount_height_inches ?? ""}
                        onCommit={(v) => patchSign({ mount_height_inches: v })}
                        ariaLabel={`Pole ${index + 1} sign ${si + 1} mount height (inches)`}
                      />
                      <FoundationDimensionInput
                        {...signDimMeta("depth_inches")}
                        value={s.depth_inches ?? ""}
                        onCommit={(v) => patchSign({ depth_inches: v })}
                        ariaLabel={`Pole ${index + 1} sign ${si + 1} depth (inches)`}
                      />
                      <FoundationDimensionInput
                        {...signDimMeta("horizontal_offset_inches")}
                        value={s.horizontal_offset_inches ?? ""}
                        onCommit={(v) => patchSign({ horizontal_offset_inches: v })}
                        ariaLabel={`Pole ${index + 1} sign ${si + 1} horizontal offset (inches)`}
                      />
                      {/* O-059 (CMP-E04) -- centered-sign preset: zero the
                          horizontal offset (the sign sits on the pole axis). */}
                      <button
                        type="button"
                        onClick={() => patchSign({ horizontal_offset_inches: 0 })}
                        className="h-9 px-2 self-end rounded-md border border-gray-300 text-[10px] text-gray-600 hover:bg-gray-50"
                        aria-label={`Pole ${index + 1} sign ${si + 1} center on pole`}
                      >Center</button>
                      <label className="flex items-center gap-1 text-[10px] text-gray-500 self-end pb-1" title="Mirror a second sign across the pole">
                        <input
                          type="checkbox"
                          checked={s.twin === true}
                          onChange={(e) => patchSign({ twin: e.target.checked })}
                          className="h-3.5 w-3.5"
                          aria-label={`Pole ${index + 1} sign ${si + 1} twin`}
                        />
                        Twin
                      </label>
                      {/* O-063 (CMP-E08) -- linked display-only sign: excluded
                          from fabrication/installation charges (no double-
                          charge on a linked sign product); still renders. */}
                      <label className="flex items-center gap-1 text-[10px] text-gray-500 self-end pb-1" title="Linked sign -- display only, excluded from sign cost">
                        <input
                          type="checkbox"
                          checked={s.display_only === true}
                          onChange={(e) => patchSign({ display_only: e.target.checked ? true : undefined })}
                          className="h-3.5 w-3.5"
                          aria-label={`Pole ${index + 1} sign ${si + 1} linked display-only`}
                        />
                        Linked
                      </label>
                      {/* O-063 (CMP-E08) -- linked-product reference: the
                          display-only sign records which linked sign product
                          it represents (`linked_product_id`); blank = "not
                          recorded" (never an invented product). */}
                      {s.display_only === true && (
                        <label className="text-[10px] text-gray-500" title="The linked sign product this display-only sign represents">
                          Linked product
                          {/* O-063 (CMP-E08) -- pick list over the estimate's
                              existing sign products (`items`): selecting one
                              records its `component_id`; a stale recorded id
                              stays visible as a disabled "Missing" row rather
                              than silently clearing or minting a product. */}
                          <select
                            value={s.linked_product_id ?? ""}
                            onChange={(e) => patchSign({ linked_product_id: e.target.value === "" ? undefined : e.target.value })}
                            className="ml-1 h-5 w-24 rounded-sm border border-gray-300 px-0.5 text-[9px] bg-transparent"
                            aria-label={`Pole ${index + 1} sign ${si + 1} linked product`}
                          >
                            <option value="">Not recorded</option>
                            {s.linked_product_id && !items.some((it) => it.component_id === s.linked_product_id) && (
                              <option value={s.linked_product_id} disabled>{`Missing product (${String(s.linked_product_id).slice(0, 14)}...)`}</option>
                            )}
                            {items.map((it, i) => (
                              <option key={it.component_id || i} value={it.component_id || ""}>
                                {it.description || `Item ${i + 1}`}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {/* O-066 (CMP-E11) -- quote/job-link preservation: the
                          sign's `quote_link`/`job_link` references ride the
                          row through `patchSign` edits (the O-005 id-preserving
                          patch) so a scene edit never silently drops a
                          recorded quote/job link. */}
                      {s.display_only === true && (
                        <label className="text-[10px] text-gray-500" title="The sign's quote/job links (preserved through edits)">
                          Quote / job
                          <input
                            type="text" placeholder="quote id"
                            value={s.quote_link ?? ""}
                            onChange={(e) => patchSign({ quote_link: e.target.value === "" ? undefined : e.target.value })}
                            className="ml-1 h-5 w-16 rounded-sm border border-gray-300 px-0.5 text-[9px]"
                            aria-label={`Pole ${index + 1} sign ${si + 1} quote link`}
                          />
                          <input
                            type="text" placeholder="job id"
                            value={s.job_link ?? ""}
                            onChange={(e) => patchSign({ job_link: e.target.value === "" ? undefined : e.target.value })}
                            className="ml-0.5 h-5 w-16 rounded-sm border border-gray-300 px-0.5 text-[9px]"
                            aria-label={`Pole ${index + 1} sign ${si + 1} job link`}
                          />
                        </label>
                      )}
                      {/* O-059 (CMP-E04) -- multipole sign spanning: `spans`
                            records which poles (comma-separated pole indexes)
                            the sign spans -- a multipole sign's authored span
                            vs the pole.signs[] per-pole mount. */}
                        <label className="text-[10px] text-gray-500" title="The sign's span -- comma-separated pole indexes it spans (a multipole sign)">
                          Spans
                          <input
                            type="text" placeholder="pole idx e.g. 1,3"
                            value={s.spans ?? ""}
                            onChange={(e) => patchSign({ spans: e.target.value === "" ? undefined : e.target.value })}
                            className="ml-1 h-5 w-20 rounded-sm border border-gray-300 px-0.5 text-[9px]"
                            aria-label={`Pole ${index + 1} sign ${si + 1} spans`}
                          />
                        </label>
                        {/* O-059 (CMP-E04) -- foundation/wall-top mounting:
                            `mount_type` records the mount kind (the default
                            `pole` mount vs a `wall_top`/`foundation` mount --
                            a sign mounted on a wall cap or directly on the
                            foundation, not the pole). */}
                        <label className="text-[10px] text-gray-500" title="The sign's mount kind -- pole (default) vs wall_top / foundation">
                          Mount
                          <select
                            value={s.mount_type ?? "pole"}
                            onChange={(e) => patchSign({ mount_type: e.target.value === "pole" ? undefined : e.target.value })}
                            className="ml-1 h-5 rounded-sm border border-gray-300 px-0.5 text-[9px]"
                            aria-label={`Pole ${index + 1} sign ${si + 1} mount type`}
                          >
                            <option value="pole">pole</option>
                            <option value="wall_top">wall top</option>
                            <option value="foundation">foundation</option>
                          </select>
                        </label>
                      <label className="text-[10px] text-gray-500">
                        Weight (lb)
                        <input
                          type="number" min="0" step="0.1"
                          value={s.weight_lbs ?? ""}
                          onChange={(e) => patchSign({ weight_lbs: e.target.value === "" ? undefined : Number(e.target.value) })}
                          className="block w-16 h-7 rounded-sm border border-gray-300 px-1.5 text-[11px]"
                          aria-label={`Pole ${index + 1} sign ${si + 1} weight (lbs)`}
                        />
                      </label>
                      <label className="text-[10px] text-gray-500">
                        Cost $
                        <input
                          type="number" min="0" step="0.01"
                          value={s.unit_cost ?? ""}
                          placeholder="Not saved"
                          onChange={(e) => patchSign({ unit_cost: e.target.value === "" ? undefined : Number(e.target.value) })}
                          className="block w-20 h-7 rounded-sm border border-gray-300 px-1.5 text-[11px]"
                          aria-label={`Pole ${index + 1} sign ${si + 1} unit cost`}
                        />
                      </label>
                      {/* O-066 (CMP-E11) - optional authored cost components:
                          each blank = $0, authored must be finite nonnegative
                          or the whole sign's total holds. */}
                      {[["hardware_cost", "Hardware $"], ["labor_cost", "Labor $"], ["paint_cost", "Paint $"], ["waste_cost", "Waste $"]].map(([f, label]) => (
                        <label key={f} className="text-[10px] text-gray-500">
                          {label}
                          <input
                            type="number" min="0" step="0.01"
                            value={s[f] ?? ""}
                            placeholder="0"
                            onChange={(e) => patchSign({ [f]: e.target.value === "" ? undefined : Number(e.target.value) })}
                            className="block w-16 h-7 rounded-sm border border-gray-300 px-1.5 text-[11px]"
                            aria-label={`Pole ${index + 1} sign ${si + 1} ${f}`}
                          />
                        </label>
                      ))}
                      <label className="text-[10px] text-gray-500">
                        Faces
                        <select
                          value={Number(s.face_count) || 1}
                          onChange={(e) => patchSign({ face_count: Number(e.target.value) })}
                          className="block w-14 h-7 rounded-sm border border-gray-300 px-1 text-[11px]"
                          aria-label={`Pole ${index + 1} sign ${si + 1} face count`}
                        >
                          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                      {/* O-060 (CMP-E05) -- panel-shape/trim/body-color/envelope
                          authored fields; blank = "not recorded". */}
                      <label className="text-[10px] text-gray-500">
                        Shape
                        <select
                          value={s.panel_shape ?? ""}
                          onChange={(e) => patchSign({ panel_shape: e.target.value === "" ? undefined : e.target.value })}
                          className="block w-16 h-7 rounded-sm border border-gray-300 px-1 text-[11px]"
                          aria-label={`Pole ${index + 1} sign ${si + 1} panel shape`}
                        >
                          <option value="">--</option>
                          <option value="cabinet">Cabinet</option>
                          <option value="panel">Panel</option>
                          <option value="letters">Letters</option>
                        </select>
                      </label>
                      <label className="text-[10px] text-gray-500">
                        Trim
                        <input type="text" value={s.trim_color ?? ""} placeholder="color"
                          onChange={(e) => patchSign({ trim_color: e.target.value === "" ? undefined : e.target.value })}
                          className="block w-14 h-7 rounded-sm border border-gray-300 px-1 text-[11px]"
                          aria-label={`Pole ${index + 1} sign ${si + 1} trim color`} />
                      </label>
                      <label className="text-[10px] text-gray-500">
                        Body
                        <input type="text" value={s.body_color ?? ""} placeholder="color"
                          onChange={(e) => patchSign({ body_color: e.target.value === "" ? undefined : e.target.value })}
                          className="block w-14 h-7 rounded-sm border border-gray-300 px-1 text-[11px]"
                          aria-label={`Pole ${index + 1} sign ${si + 1} body color`} />
                      </label>
                      <label className="text-[10px] text-gray-500">
                        Envelope
                        <input type="text" value={s.envelope ?? ""} placeholder="4'x2'x8&quot;"
                          onChange={(e) => patchSign({ envelope: e.target.value === "" ? undefined : e.target.value })}
                          className="block w-20 h-7 rounded-sm border border-gray-300 px-1 text-[11px]"
                          aria-label={`Pole ${index + 1} sign ${si + 1} envelope`} />
                      </label>
                      <label className="text-[10px] text-gray-500">
                        Artwork
                        <input
                          type="text"
                          value={s.artwork_url ?? ""}
                          placeholder="image URL or file ref"
                          onChange={(e) => patchSign({ artwork_url: e.target.value === "" ? undefined : e.target.value })}
                          aria-label={`Pole ${index + 1} sign ${si + 1} artwork URL`}
                        />
                      </label>
                      {/* O-061 (CMP-E06) -- artwork upload: a file picker
                          mints a blob URL into `artwork_url` (the picked
                          image renders in the thumbnail; blank = "not
                          recorded", never an invented URL). */}
                      <input
                        type="file" accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) patchSign({ artwork_url: URL.createObjectURL(f), artwork_name: f.name });
                          e.target.value = "";
                        }}
                        className="text-[10px]"
                        aria-label={`Pole ${index + 1} sign ${si + 1} artwork upload`}
                      />
                      {/* O-061 (CMP-E06) -- clear artwork: removes the
                          authored `artwork_url`/`artwork_name` (the
                          undo/replace surface -- re-pick uploads a new
                          image; clear drops the reference). */}
                      {s.artwork_url && (
                        <button
                          type="button"
                          onClick={() => patchSign({ artwork_url: undefined, artwork_name: undefined, artwork_fit: undefined, artwork_scale: undefined })}
                          className="text-[9px] text-red-600 hover:underline"
                          aria-label={`Pole ${index + 1} sign ${si + 1} clear artwork`}
                        >Clear artwork</button>
                      )}
                      {s.artwork_url && (
                        <>
                          {/* O-061 (CMP-E06) -- artwork crop/fit: the
                              reference image's `objectFit` + scale controls
                              (contain/cover/fill + a zoom); blank defaults to
                              cover (the original render). */}
                          <label className="text-[10px] text-gray-500 self-end" title="Artwork fit">
                            <select
                              value={s.artwork_fit ?? "cover"}
                              onChange={(e) => patchSign({ artwork_fit: e.target.value === "cover" ? undefined : e.target.value })}
                              className="h-5 rounded-sm border border-gray-300 px-0.5 text-[9px]"
                              aria-label={`Sign ${si + 1} artwork fit`}
                            >
                              <option value="cover">Cover</option>
                              <option value="contain">Contain</option>
                              <option value="fill">Fill</option>
                            </select>
                          </label>
                          <label className="text-[10px] text-gray-500 self-end" title="Artwork scale">
                            <input
                              type="number" min="0.1" max="4" step="0.1" placeholder="1"
                              value={s.artwork_scale ?? ""}
                              onChange={(e) => patchSign({ artwork_scale: e.target.value === "" ? undefined : Number(e.target.value) })}
                              className="h-5 w-10 rounded-sm border border-gray-300 px-0.5 text-[9px]"
                              aria-label={`Sign ${si + 1} artwork scale`}
                            />
                          </label>
                          <img
                            src={s.artwork_url}
                            alt={`Sign ${si + 1} artwork`}
                            className="h-7 w-7 self-end rounded-sm border border-gray-200 object-cover"
                            style={{ objectFit: s.artwork_fit || "cover", transform: s.artwork_scale ? `scale(${s.artwork_scale})` : undefined }}
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => patchPole(index, { signs: (pole.signs || []).filter((_, j) => j !== si) })}
                        className="h-7 w-7 rounded-sm text-red-500 hover:bg-red-50"
                        aria-label={`Remove sign ${si + 1} from pole ${index + 1}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 mx-auto" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
                {(pole.signs || []).length > 0 && (() => {
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
                  return (
                    <div className="text-right text-[11px] text-gray-600 mt-1">
                      Signs total: {all ? <span className="font-semibold text-gray-900">{money(costs.reduce((a, b) => a + b, 0))}</span> : <span className="text-amber-700">Not saved  -  record a cost on every sign</span>}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}