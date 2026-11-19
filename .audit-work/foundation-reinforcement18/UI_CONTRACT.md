# Local Reinforcement Proposal UI - Lead-Owned Contract

Not activated or integrated yet. Render controlled raw draft data only; do not calculate, normalize numeric inputs, invent dimensions, call AI/backend, or change accepted design/pricing. Parent acceptance is a separate guarded operation.

## Main Component

`FoundationReinforcementProposalPanel({ item, draft, catalog = [], preview, disabled = false, busy = false, error, onStart, onDraftChange, onPreview, onAccept, onDiscard })`

- `item` is read-only; use `foundation_type` for the spread/pillar section and `reinforcement_calculation_version` for current mode. Absent/null/1 labels Legacy;2 labels Version2; other values label Unsupported, not Legacy.
- `catalog` is rebar rows, never fetched by the component.
- If draft is absent, show explanatory text and a Start Proposal button calling onStart once. No mount-time callbacks.
- `onDraftChange(nextDraft)` is one immutable raw-data edit. Never call existing index-based item callbacks. Do not mutate props or sanitize them in an effect.
- onPreview requests refresh; no async/provider/math in this component.
- onAccept(preview.id) is allowed only for a present ID, canAccept===true, stale!==true, !busy, !disabled. Parent must still revalidate the basis/context.
- onDiscard is an explicit parent operation, not a backend delete.
- disabled/busy prevent form/actions. No callbacks when those controls are disabled.
- Always state: "Preliminary geometry and internal cost only. Not a structural design or engineering approval."
- Say that proposal edits do not change current prices until explicit acceptance; unknown supports/weights/units remain unknown.

## Raw Draft Shape

```js
{
  schema_version: 1,
  design: {
    version: 2,
    bar_diameter_inches: "", // all numeric editors preserve raw text
    cover_inches: { side: "", top: "", bottom: "" },
    supports: { mode: "unconfigured", reason: "" },
    spread: { mats: [], inter_mat_ties: [] },
    pillar: {
      hoops: [],
      longitudinal: { count: "", radius_inches: "", bottom_end_inches: "", top_end_inches: "" }
    }
  },
  material: {
    kind: "manual" | "catalog",
    inventory_id: "",
    name: "", reason: "", unit: "ft",
    bar_diameter_inches: "", weight_lb_per_ft: "", cost_per_ft: ""
  },
  overrides: { quantity_ft: null, cost_per_ft: null }
}
```

Use controlled text inputs with decimal/numeric inputMode, not parseFloat/Number/clamping/default zero. Empty required fields stay "". Only OPTIONAL override inputs turn empty text into null; otherwise keep exact strings including "0" and invalid "-oops". Parent will prepare typed calculations later.

Manual material fields are name, reason (max1000), unit, nominal diameter(in), weight(lb/ft), cost/ft. Selecting Manual explicitly sets kind:"manual" and unit:"ft", retaining other raw fields. Selecting Catalog changes kind and preserves draft fields; picker uses exact stable inventory_id, not size lookup. A selected unavailable ID remains visible. Show metadata as read-only text/Unknown, never infer #size dimensions/weight or each-to-foot conversions. Known catalog metadata keys are rebar_diameter_inches/rebar_weight_lb_per_ft/cost_per_unit/unit; fields aren't in the remote schema yet.

Override fields: aggregate item priced feet (not per-foundation) and per-foot cost override. Empty means no override. Do not write item.custom_rebar_*; only edit draft.overrides.

Geometry numeric fields: design.bar_diameter_inches; cover_inches side/top/bottom. Supports dropdown offers unconfigured and off; off requires explanation text. Imported manual/auto/other support modes remain visible as unavailable/reserved, never silently cleared; support modeling is a later gate.

Spread mats: id(stable/read-only), bearing_elevation_inches, max_spacing_x_inches, max_spacing_z_inches. Add at most256, initialize ONLY id and empty strings. No default spacing/cover/elevation.

Spread ties: id, from_mat_id, to_mat_id, x_inches, z_inches, cut_length_inches. Add at most4096, initialize id and all other fields empty strings. Parent selectors use exact mat IDs; missing references remain visible. Deleting a mat does NOT silently rewrite/remove ties. Explain tie paths are preliminary/fabrication-review gated.

Pillar hoops: id, center_y_inches, centerline_diameter_inches, cut_allowance_inches. Add at most256 with empty raw values, including allowance (user must explicitly enter0).

Pillar longitudinal: count, radius_inches, bottom_end_inches, top_end_inches. No inferred4bar count or lengths. Changing foundation type must not erase the inactive design subtree.

Generate new row IDs only in explicit Add handlers: `${prefix}_${globalThis.crypto.randomUUID()}`, prefixes mat/tie/hoop, no fallback Date.now or Math.random. Disable Add with a clear explanation if secure UUID support is absent.

For long row lists, paginate at20 rows/page, preserving ALL raw records; never truncate stored arrays or use preview row count as quantity. Clamp display-page selection only, not data. Malformed defined list values show a repair notice and explicit Replace List action; no silent replacement on mount/Add. Missing undefined lists may start empty on an explicit Add.

## Preview Shape (Display Only)

```js
{
  id: "opaque-preview-id",
  canAccept: false,
  stale: false,
  costs: [{ label: "Current steel", value: "$252.80", provenance: "Saved acknowledged amount" }],
  quantities: [{ label: "Steel length", before: "64 ft", after: "20 ft" }],
  issues: [{ code: "unknown_weight", severity: "warning", message: "Weight is unknown." }],
  rateSourceLabel: "Explicit manual per-foot basis"
}
```

All money/quantity display strings are provided by parent. Render them unchanged as React text; no sums/deltas/price formatting/calculation. Render all issues, stale notice, and failure error. Accept must not be enabled merely because a preview exists.

## UI Verification Cases

Use only isolated synthetic React/browser fixtures, never app business routes/API. Ordinary UI checks, no numeric calculation test authoring:

1. Mount has zero callbacks and does not mutate frozen draft/item. Missing metadata displays Unknown.
2. Type "-oops" into cover field: exact raw string delivered, original frozen input unchanged; no other fields change.
3. Add/Delete mats preserves unrelated rows, unique prefixed IDs, empty numeric values. Parent rerender with prior draft (Undo) restores controlled values.
4. Switch manual/catalog retains raw fields; manual sets ft explicitly. Unavailable selected ID stays visible.
5. Override clear emits null; entered "0" remains string"0". No writes to active item custom fields.
6. Stale, canAccept:false, busy and disabled each block acceptance. Fresh eligible preview calls onAccept with exactly its ID once.
7. Orphan tie references remain visible; deleting a parent mat does not remap/delete its tie.
8. Pillar controls edit proper raw fields; changing foundation_type does not drop inactive spread/pillar data.
9. Twenty-one rows paginate without losing records; editing second-page row changes only that row; first-page row remains intact.
10. Mobile375px and desktop screenshots; no document horizontal overflow (local table scrolling is okay), no API/provider requests.

Split into small new components (<300lines each), e.g. main panel, geometry, material and raw field/list helpers. Preserve the existing foundation amber/white/gray Tailwind/Input styling. No app/card/page/schema integration in this handoff.
