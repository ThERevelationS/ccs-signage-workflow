import sys
p = '.audit-work/o070-anchor/remote-LandscapeDesigner.jsx'
t = open(p, encoding='utf-8').read()

# 1. import + prop
old1 = 'import { foundationDimensionFieldMeta } from "./foundationGeometryInputs";'
new1 = old1 + '''
import {
  LANDSCAPE_ANCHOR_VERSION,
  diagnoseLandscapeFoundation,
} from "./foundationLandscapeAnchor";'''
assert old1 in t
t = t.replace(old1, new1, 1)

old2 = 'export default function LandscapeDesigner({ landscape, onChange }) {'
new2 = 'export default function LandscapeDesigner({ landscape, onChange, items }) {'
assert old2 in t
t = t.replace(old2, new2, 1)

# 2. diagnostics computation after viewCells
old3 = '  const viewCells = strokeCells || cells;'
new3 = old3 + '''
  // O-070 (CMP-F14): authored foundation anchor -> footprint overlay + real
  // overlap/setback diagnostics. Unconfirmed anchor -> empty pass (fail-closed).
  const anchorDiag = diagnoseLandscapeFoundation({
    landscape,
    items,
    cellSizeInches: Number(landscape?.cell_size_inches),
    gridCols: GRID_COLS,
    gridRows: GRID_ROWS,
  });
  const anchor = landscape?.foundation_anchor && typeof landscape.foundation_anchor === "object" ? landscape.foundation_anchor : {};
  const setAnchor = (patch) => onChange({
    ...landscape,
    foundation_anchor: { version: LANDSCAPE_ANCHOR_VERSION, ...anchor, ...patch },
  });'''
assert old3 in t
t = t.replace(old3, new3, 1)

# 3. anchor authoring panel before {broken && (
old4 = '      {broken && ('
new4 = '''      {/* O-070 (CMP-F14) -- foundation anchor: the landscape grid inch space
          is tied to the foundation plan inch space only by this authored
          mapping (grid origin in plan inches + cardinal rotation). Until
          confirmed, no footprint overlay or setback diagnostic is produced --
          never a computed-from-nothing guess. */}
      <div className="mb-2 rounded-sm border border-gray-200 px-2 py-1.5 text-[10px] text-gray-600 space-y-1" data-landscape-anchor="">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-gray-700">Foundation anchor</span>
          <label className="flex items-center gap-1">origin x
            <input type="number" step="1"
              value={anchor.origin_x_inches ?? ""}
              onChange={(e) => setAnchor({ origin_x_inches: e.target.value === "" ? null : Number(e.target.value), confirmed: false })}
              className="h-5 w-16 rounded-sm border border-gray-300 px-1 text-[10px]"
              aria-label="Anchor origin x (plan inches)" />
          </label>
          <label className="flex items-center gap-1">origin z
            <input type="number" step="1"
              value={anchor.origin_z_inches ?? ""}
              onChange={(e) => setAnchor({ origin_z_inches: e.target.value === "" ? null : Number(e.target.value), confirmed: false })}
              className="h-5 w-16 rounded-sm border border-gray-300 px-1 text-[10px]"
              aria-label="Anchor origin z (plan inches)" />
          </label>
          <label className="flex items-center gap-1">rotation
            <select
              value={String(anchor.rotation_degrees ?? 0)}
              onChange={(e) => setAnchor({ rotation_degrees: Number(e.target.value), confirmed: false })}
              className="h-5 rounded-sm border border-gray-300 text-[10px]"
              aria-label="Anchor rotation (degrees)">
              {[0, 90, 180, 270].map((r) => <option key={r} value={r}>{r}&deg;</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 cursor-pointer" title="Confirm the grid origin/rotation matches the foundation plan - enables footprint overlay + setback diagnostics">
            <input type="checkbox"
              checked={anchor.confirmed === true}
              onChange={(e) => setAnchor(e.target.checked ? { confirmed: true, confirmed_at: new Date().toISOString() } : { confirmed: false, confirmed_at: null })}
              aria-label="Confirm foundation anchor" />
            <span>confirmed</span>
          </label>
          {!anchorDiag.confirmed && (
            <span className="text-amber-700">unconfirmed - set origin + confirm for footprint overlay</span>
          )}
        </div>
        {anchorDiag.confirmed && (
          <div className="space-y-0.5" aria-live="polite">
            {anchorDiag.overlays.length === 0 && <div className="text-gray-500">no resolvable foundation footprints</div>}
            {anchorDiag.overlays.filter((o) => o.inside_grid === false).map((o) => (
              <div key={"out-" + o.item_index} className="text-gray-500">footprint {o.foundation_type} #{o.item_index + 1} lands outside the grid</div>
            ))}
            {anchorDiag.cells_in_footprints.length > 0 && (
              <div className="text-amber-800">
                {anchorDiag.cells_in_footprints.length} painted cell{anchorDiag.cells_in_footprints.length === 1 ? "" : "s"} under a foundation footprint
                {" (" + [...new Set(anchorDiag.cells_in_footprints.map((c) => c.foundation_type + " #" + (c.item_index + 1)))].join(", ") + ")"}
              </div>
            )}
            {anchorDiag.objects.map((o) => o.kind === "inside-footprint" ? (
              <div key={"obj-" + o.index} className="text-red-700">object {o.index + 1} sits inside {o.foundation_type} #{o.item_index + 1}&apos;s footprint</div>
            ) : o.kind === "setback-violation" ? (
              <div key={"obj-" + o.index} className="text-red-700">object {o.index + 1} is {o.measured_inches.toFixed(1)}&quot; from a foundation edge - under its {o.required_inches}&quot; setback</div>
            ) : null)}
            {anchorDiag.notes.map((note) => <div key={note} className="text-gray-400">{note}</div>)}
          </div>
        )}
      </div>

''' + old4
assert old4 in t
t = t.replace(old4, new4, 1)

# 4. footprint overlays inside the grid container
old5 = '''          <div
            className="relative grid gap-px"
            style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(14px, 1fr))` }}
          >'''
new5 = old5 + '''
            {/* O-070 footprint overlay - visual context only; the diagnostics
                list carries exact measurements. % of grid extent. */}
            {anchorDiag.confirmed && Number.isFinite(Number(landscape?.cell_size_inches)) && Number(landscape.cell_size_inches) > 0 && anchorDiag.overlays.map((ov) => {
              const cs = Number(landscape.cell_size_inches);
              const gw = GRID_COLS * cs; const gd = GRID_ROWS * cs;
              const l = (ov.rect.x / gw) * 100, tp = (ov.rect.z / gd) * 100;
              const w = (ov.rect.w / gw) * 100, h = (ov.rect.d / gd) * 100;
              if (l >= 100 || tp >= 100 || l + w <= 0 || tp + h <= 0) return null;
              return (
                <div
                  key={"fp-" + ov.item_index}
                  aria-hidden="true"
                  className="pointer-events-none absolute rounded-[2px]"
                  style={{
                    left: Math.max(l, 0) + "%", top: Math.max(tp, 0) + "%",
                    width: Math.min(w, 100 - Math.max(l, 0)) + "%", height: Math.min(h, 100 - Math.max(tp, 0)) + "%",
                    outline: "2px dashed rgba(30,64,175,0.85)",
                    background: "rgba(30,64,175,0.12)",
                  }}
                  title={ov.foundation_type + " #" + (ov.item_index + 1) + " footprint"}
                />
              );
            })}'''
assert old5 in t
t = t.replace(old5, new5, 1)

open(p, 'w', encoding='utf-8', newline='').write(t)
print('patched, lines:', t.count(chr(10)) + 1)
