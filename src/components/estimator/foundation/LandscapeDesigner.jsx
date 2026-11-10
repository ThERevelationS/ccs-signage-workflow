import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  LANDSCAPE_COUNT_OBJECTS,
  LANDSCAPE_MATERIALS,
  LANDSCAPE_VISUAL_OBJECTS,
  VISUAL_PREFIX,
  GRID_COLS,
  GRID_ROWS,
  landscapeSummary,
  materialByKey,
  visualObjectByKey,
} from "./landscapeMaterials";
import { money } from "./foundationCalc";
import {
  foundationDimensionDraftValue,
  foundationDimensionInputIssue,
  foundationDimensionStoredText,
} from "./foundationFtInEntry";
import { foundationDimensionFieldMeta } from "./foundationGeometryInputs";

// O-093 (CMP-H02): the cell size takes feet/inches entry â€” same verbatim-draft
// contract as the landscapeInputValue it replaces (blank stays, malformed
// stores verbatim for diagnostics), canonical inches stored. The cell size is
// never defaulted here â€” the ported `|| 12` minted a guess on a missing value;
// the meta placeholder below is display text only, never a stored value.
const cellMeta = foundationDimensionFieldMeta("landscape", "cell_size_inches");

const sqftLabel = (l) =>
  Number.isFinite(l.sqft) ? `${l.sqft.toFixed(0)} sq ft`
    : `${l.cells} cell${l.cells === 1 ? "" : "s"} â€” area unavailable`;
const costLabel = (v) => (Number.isFinite(v) ? money(v) : "Not saved");

export default function LandscapeDesigner({ landscape, onChange }) {
  const [brush, setBrush] = useState("grass");
  const [painting, setPainting] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [hoverCell, setHoverCell] = useState(null);
  // O-071 (CMP-F04): bucket-fill mode — a click floods the contiguous region
  // of the same material (empty cells count as one region); dirt erases it.
  const [fillMode, setFillMode] = useState(false);
  // O-071 stroke-level undo — a drag paints into a ref and commits ONE
  // onChange on release, so page-level undo reverts the whole stroke.
  const strokeRef = useRef(null);
  const [strokeCells, setStrokeCells] = useState(null);
  // Focused-edit draft for the cell size â€” while focused the user edits raw
  // text (partial ft/in never snaps); on blur the stored canonical inches
  // (or a verbatim malformed draft) displays again.
  const [cellDraft, setCellDraft] = useState(null);
  const cells = landscape?.cells || {};
  const summary = landscapeSummary(landscape);
  const broken = summary.issues.length > 0;
  const cellSizeIssue = summary.issues.some((i) => i.field === "cell_size_inches");
  const cellHint = foundationDimensionInputIssue(landscape?.cell_size_inches);

  const paint = (x, y) => {
    const key = `${x},${y}`;
    const base = strokeRef.current ?? (strokeRef.current = { ...cells });
    if (brush === "dirt") delete base[key];
    else base[key] = brush;
    setStrokeCells({ ...base });
  };

  const endStroke = () => {
    setPainting(false);
    if (!strokeRef.current) return;
    // Preserve the authored cell size verbatim — never mint a guessed 12 over
    // a missing value; an absent/malformed size stays flagged until recorded.
    onChange({ ...landscape, cell_size_inches: landscape?.cell_size_inches, cells: strokeRef.current });
    strokeRef.current = null;
    setStrokeCells(null);
  };
  const viewCells = strokeCells || cells;

  // O-068 -- borders/edging as a linear entry: paint the grid's outer
  // perimeter with the current brush in ONE commit (same cell contract as
  // free painting -- the edging is just a painted perimeter ring).
  const edge = () => {
    if (brush === "dirt" || brush == null) return;
    const next = { ...(strokeRef.current ?? cells) };
    for (let x = 0; x < GRID_COLS; x++) { next[`${x},0`] = brush; next[`${x},${GRID_ROWS - 1}`] = brush; }
    for (let y = 0; y < GRID_ROWS; y++) { next[`0,${y}`] = brush; next[`${GRID_COLS - 1},${y}`] = brush; }
    onChange({ ...landscape, cell_size_inches: landscape?.cell_size_inches, cells: next });
  };

  const flood = (x, y) => {
    const target = cells[`${x},${y}`] || "";
    if (target === (brush === "dirt" ? "" : brush)) return; // already the brush value
    const region = [];
    const seen = new Set([`${x},${y}`]);
    const queue = [[x, y]];
    while (queue.length) {
      const [cx, cy] = queue.shift();
      region.push(`${cx},${cy}`);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, k = `${nx},${ny}`;
        if (nx < 0 || ny < 0 || nx >= GRID_COLS || ny >= GRID_ROWS || seen.has(k)) continue;
        if ((cells[k] || "") === target) { seen.add(k); queue.push([nx, ny]); }
      }
    }
    const next = { ...cells };
    region.forEach((k) => { if (brush === "dirt") delete next[k]; else next[k] = brush; });
    onChange({ ...landscape, cell_size_inches: landscape?.cell_size_inches, cells: next });
  };

  return (
    <div className={`bg-white rounded-sm border p-3 ${broken ? "border-amber-300" : "border-gray-200"}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-[13px] font-bold text-gray-900">Landscape Designer</h3>
          <p className="text-[11px] text-gray-500">
            Draw landscaping features, paths and site boundaries. Each cell is 1 sq ft.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-gray-500">
            {cellMeta?.label ?? "Cell size (in)"}
            <input
              type="text"
              inputMode="text"
              data-landscape-field="cell_size_inches"
              title={cellMeta?.help}
              placeholder={cellMeta?.placeholder}
              value={cellDraft !== null
                ? cellDraft
                : foundationDimensionStoredText(landscape?.cell_size_inches)}
              aria-invalid={cellSizeIssue || !!cellHint || undefined}
              aria-describedby={[cellSizeIssue ? "landscape-pricing" : null, cellHint ? "landscape-cell-hint" : null]
                .filter(Boolean).join(" ") || undefined}
              onFocus={() => setCellDraft(foundationDimensionStoredText(landscape?.cell_size_inches))}
              onChange={(e) => {
                setCellDraft(e.target.value);
                onChange({
                  ...landscape,
                  cell_size_inches: foundationDimensionDraftValue(e.target.value),
                  cells,
                });
              }}
              onBlur={() => setCellDraft(null)}
              className={`ml-1 h-7 w-16 rounded-sm border px-1 text-[11px] ${cellSizeIssue || cellHint ? "border-amber-400 bg-amber-50" : "border-gray-300"}`}
            />
            {cellHint && (
              <span id="landscape-cell-hint" role="status" className="block mt-0.5 text-amber-700">
                {cellHint}
              </span>
            )}
          </label>
          {/* O-073 (CMP-F06) -- authored bed depth / waste / labor fields; each
              blank = "not recorded" (depth/volume and labor hold in the summary,
              waste scales to 0), never a silent zero on the design. */}
          {[["bed_depth_inches", "Bed depth (in)", "4"], ["waste_fraction", "Waste (0-1)", "0.1"], ["labor_cost", "Labor $", "0"]].map(([f, label, ph]) => (
            <label key={f} className="text-[10px] text-gray-500">
              {label}
              <input
                type="number" min="0" step="0.01" placeholder={ph}
                value={landscape?.[f] ?? ""}
                onChange={(e) => onChange({ ...landscape, [f]: e.target.value === "" ? undefined : Number(e.target.value) })}
                className="ml-1 h-7 w-14 rounded-sm border border-gray-300 px-1 text-[11px]"
                aria-label={`Landscape ${label}`}
              />
            </label>
          ))}
          {/* O-069 (CMP-F02) -- count-priced objects: `landscape.objects[]`
              rows {type, qty} bill qty x the catalog object's unit_cost. A
              malformed row holds its line in the summary -- never a silent $0. */}
          <label className="text-[10px] text-gray-500 flex items-center gap-1">
            Objects
            {(landscape?.objects || []).map((o, oi) => (
              <span key={oi} className="inline-flex items-center gap-0.5">
                <select
                  value={o.type || ""}
                  onChange={(e) => onChange({ ...landscape, objects: (landscape.objects || []).map((r, j) => j === oi ? { ...r, type: e.target.value } : r) })}
                  className="h-6 rounded-sm border border-gray-300 px-0.5 text-[10px]"
                  aria-label={`Object ${oi + 1} type`}
                >
                  <option value="">--</option>
                  {LANDSCAPE_COUNT_OBJECTS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <input
                  type="number" min="0" step="1" placeholder="qty"
                  value={o.qty ?? ""}
                  onChange={(e) => onChange({ ...landscape, objects: (landscape.objects || []).map((r, j) => j === oi ? { ...r, qty: e.target.value === "" ? undefined : Number(e.target.value) } : r) })}
                  className="h-6 w-10 rounded-sm border border-gray-300 px-0.5 text-[10px]"
                  aria-label={`Object ${oi + 1} count`}
                />
                <input
                  type="number" step="0.25" placeholder="x in"
                  value={o.x_inches ?? ""}
                  onChange={(e) => onChange({ ...landscape, objects: (landscape.objects || []).map((r, j) => j === oi ? { ...r, x_inches: e.target.value === "" ? undefined : Number(e.target.value) } : r) })}
                  className="h-6 w-12 rounded-sm border border-gray-300 px-0.5 text-[10px]"
                  aria-label={`Object ${oi + 1} x position inches`}
                  title="Object x position (inches)"
                />
                <input
                  type="number" step="0.25" placeholder="z in"
                  value={o.z_inches ?? ""}
                  onChange={(e) => onChange({ ...landscape, objects: (landscape.objects || []).map((r, j) => j === oi ? { ...r, z_inches: e.target.value === "" ? undefined : Number(e.target.value) } : r) })}
                  className="h-6 w-12 rounded-sm border border-gray-300 px-0.5 text-[10px]"
                  aria-label={`Object ${oi + 1} z position inches`}
                  title="Object z position (inches)"
                />
                <input
                  type="number" step="15" placeholder="rot"
                  value={o.rotation_degrees ?? ""}
                  onChange={(e) => onChange({ ...landscape, objects: (landscape.objects || []).map((r, j) => j === oi ? { ...r, rotation_degrees: e.target.value === "" ? undefined : Number(e.target.value) } : r) })}
                  className="h-6 w-10 rounded-sm border border-gray-300 px-0.5 text-[10px]"
                  aria-label={`Object ${oi + 1} rotation degrees`}
                  title="Object rotation (degrees)"
                />
                <input
                  type="number" step="0.25" placeholder="elev"
                  value={o.elevation_inches ?? ""}
                  onChange={(e) => onChange({ ...landscape, objects: (landscape.objects || []).map((r, j) => j === oi ? { ...r, elevation_inches: e.target.value === "" ? undefined : Number(e.target.value) } : r) })}
                  className="h-6 w-10 rounded-sm border border-gray-300 px-0.5 text-[10px]"
                  aria-label={`Object ${oi + 1} elevation inches`}
                  title="Object elevation above grade (inches)"
                />
                <button
                  type="button"
                  onClick={() => onChange({ ...landscape, objects: (landscape.objects || []).filter((_, j) => j !== oi) })}
                  className="h-5 w-5 text-[10px] text-red-500"
                  aria-label={`Remove object ${oi + 1}`}
                >x</button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => onChange({ ...landscape, objects: [...(landscape?.objects || []), { type: "", qty: 1 }] })}
              className="h-5 px-1 rounded-sm border border-gray-300 text-[9px] text-gray-600 hover:bg-gray-50"
            >+Obj</button>
          </label>
          {/* O-072 (CMP-F05) -- site-photo/plan backdrop: `backdrop_url` +
              `backdrop_opacity` render a reference image behind the grid. The
              authored `cell_size_inches` IS the scale contract -- the operator
              confirms the image's real-world coverage via the cell size. */}
          <label className="text-[10px] text-gray-500 flex items-center gap-1">
            Backdrop
            <input
              type="text" placeholder="image URL"
              value={landscape?.backdrop_url ?? ""}
              onChange={(e) => onChange({ ...landscape, backdrop_url: e.target.value === "" ? undefined : e.target.value })}
              className="h-6 w-24 rounded-sm border border-gray-300 px-1 text-[10px]"
              aria-label="Backdrop image URL"
            />
            <input
              type="range" min="0" max="0.8" step="0.05"
              value={landscape?.backdrop_opacity ?? 0.35}
              onChange={(e) => onChange({ ...landscape, backdrop_opacity: Number(e.target.value) })}
              className="w-14 h-4 accent-blue-500"
              aria-label="Backdrop opacity"
              title="Backdrop opacity"
            />
          </label>
          {/* O-071 (CMP-F04) -- selection tool: Select mode clicks a cell to
              select it (shows the material + a clear-cell action); paint/fill
              modes are unchanged. */}
          <button type="button"
            onClick={() => setSelectMode((v) => !v)}
            aria-pressed={selectMode}
            className={`h-[26px] px-2 flex items-center gap-1 rounded-sm border text-[11px] ${
              selectMode ? "border-blue-400 bg-blue-50 text-blue-700 font-medium" : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >Select</button>
          <button type="button"
            onClick={() => setFillMode((v) => !v)}
            aria-pressed={fillMode}
            className={`h-[26px] px-2 flex items-center gap-1 rounded-sm border text-[11px] ${
              fillMode ? "border-red-400 bg-red-50 text-red-700 font-medium" : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Fill
          </button>
          <button type="button"
            onClick={edge}
            disabled={brush === "dirt" || brush == null}
            title="Paint the grid's perimeter with the selected material"
            className="h-[26px] px-2 flex items-center gap-1 rounded-sm border border-gray-300 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Edging
          </button>
          <button type="button"
            onClick={() => {
              if (!window.confirm("Clear all landscaping from the canvas?")) return;
              onChange({ ...landscape, cell_size_inches: 12, cells: {} });
            }}
            className="h-[26px] px-2 flex items-center gap-1 rounded-sm border border-gray-300 text-[11px] text-gray-600 hover:bg-gray-50"
          >
            <Trash2 className="w-3 h-3" aria-hidden="true" /> Clear
          </button>
        </div>
      </div>

      {broken && (
        <ul role="status" id="landscape-pricing" className="list-disc pl-5 mb-2 text-[10px] text-amber-800">
          {summary.issues.map((i, k) => <li key={k}>{i.message}</li>)}
        </ul>
      )}

      <div className="flex gap-3 items-start">
        <div className="w-[120px] flex-shrink-0 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Materials</div>
          {LANDSCAPE_MATERIALS.map((m) => (
            <button type="button"
              key={m.key}
              onClick={() => setBrush(m.key)}
              className={`w-full flex items-center gap-2 px-2 py-1 rounded-sm border text-[11px] ${
                brush === m.key ? "border-red-400 bg-red-50 font-semibold" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <span className="w-3 h-3 rounded-sm" style={{ background: m.color }} />
              <span className="truncate text-gray-700">{m.label}</span>
            </button>
          ))}
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 pt-2">Decorative (not billed)</div>
          {LANDSCAPE_VISUAL_OBJECTS.map((o) => {
            const vkey = `${VISUAL_PREFIX}${o.key}`;
            return (
              <button type="button"
                key={vkey}
                onClick={() => setBrush(vkey)}
                className={`w-full flex items-center gap-2 px-2 py-1 rounded-sm border text-[11px] ${
                  brush === vkey ? "border-red-400 bg-red-50 font-semibold" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <span className="w-3 h-3 rounded-sm" style={{ background: o.color }} />
                <span className="truncate text-gray-700">{o.label}</span>
              </button>
            );
          })}
        </div>

        <div
          className="relative flex-1 overflow-auto rounded-sm border border-gray-300 bg-[#a1866f] p-1 select-none touch-none"
          onMouseLeave={endStroke}
          onPointerLeave={endStroke}
        >
          {landscape?.backdrop_url && (
            <img
              src={landscape.backdrop_url}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 w-full h-full object-cover"
              style={{ opacity: Number.isFinite(Number(landscape.backdrop_opacity)) ? Number(landscape.backdrop_opacity) : 0.35 }}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          )}
          <div
            className="relative grid gap-px"
            style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(14px, 1fr))` }}
          >
            {Array.from({ length: GRID_ROWS }).map((_, y) =>
              Array.from({ length: GRID_COLS }).map((__, x) => {
                const key = viewCells[`${x},${y}`];
                const mat = key ? (materialByKey(key) || visualObjectByKey(key)) : null;
                return (
                  <div
                    key={`${x},${y}`}
                    onMouseDown={() => {
                      if (selectMode) { setSelectedCell({ x, y }); return; }
                      if (fillMode) { flood(x, y); return; }
                      setPainting(true);
                      paint(x, y);
                    }}
                    onPointerDown={(e) => {
                      // O-098 (CMP-H07) -- touch/stylus editing: pointer events
                      // mirror the mouse path so touch paints/selects cells.
                      if (e.pointerType === "mouse") return;
                      if (selectMode) { setSelectedCell({ x, y }); return; }
                      if (fillMode) { flood(x, y); return; }
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                      setPainting(true);
                      paint(x, y);
                    }}
                    onMouseEnter={() => { setHoverCell({ x, y }); if (painting && !fillMode) paint(x, y); }}
                    onMouseLeave={() => setHoverCell(null)}
                    onMouseUp={endStroke}
                    onPointerUp={endStroke}
                    onPointerCancel={endStroke}
                    className="aspect-square cursor-crosshair"
                    style={{
                      background: mat ? mat.color : "rgba(0,0,0,0.06)",
                      outline: selectedCell && selectedCell.x === x && selectedCell.y === y ? "2px solid #3b82f6" : undefined,
                    }}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="mt-1.5 text-[10px] text-gray-500 h-3.5" aria-live="polite">
        {hoverCell ? (() => {
          const cs = Number(landscape?.cell_size_inches) || 12;
          const xf = (hoverCell.x * cs) / 12, yf = (hoverCell.y * cs) / 12;
          const key = viewCells[`${hoverCell.x},${hoverCell.y}`];
          const mat = key ? (materialByKey(key) || visualObjectByKey(key)) : null;
          return `cell ${hoverCell.x},${hoverCell.y} - ${xf.toFixed(1)}' x ${yf.toFixed(1)}'${mat ? ` - ${mat.label}` : ""}`;
        })() : "Hover the grid for a cell position"}
      </div>
      {/* O-071 (CMP-F04) -- selected-cell readout + clear action. */}
      {selectedCell && (
        <div className="mt-1 flex items-center gap-2 text-[10px] text-blue-700" aria-live="polite">
          {(() => {
            const key = viewCells[`${selectedCell.x},${selectedCell.y}`];
            const mat = key ? (materialByKey(key) || visualObjectByKey(key)) : null;
            return `Selected cell ${selectedCell.x},${selectedCell.y}${mat ? ` - ${mat.label}` : " (empty)"}`;
          })()}
          <button
            type="button"
            onClick={() => {
              const next = { ...(landscape?.cells || {}) };
              delete next[`${selectedCell.x},${selectedCell.y}`];
              onChange({ ...landscape, cells: next });
              setSelectedCell(null);
            }}
            className="h-5 px-1.5 rounded-sm border border-blue-300 text-blue-700 hover:bg-blue-50"
          >Clear cell</button>
          <button
            type="button"
            onClick={() => setSelectedCell(null)}
            className="h-5 px-1.5 rounded-sm border border-gray-300 text-gray-500 hover:bg-gray-50"
          >Deselect</button>
        </div>
      )}
      {summary.lines.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-2 space-y-1">
          {summary.lines.map((l) => (
            <div key={l.key} className="flex items-center gap-2 text-[11px] text-gray-600">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
              <span className="flex-1">{l.label}</span>
              <span>{sqftLabel(l)}</span>
              <span className="w-16 text-right font-semibold text-gray-800">{costLabel(l.cost)}</span>
            </div>
          ))}
          <div className="flex justify-between text-[12px] font-bold text-gray-900 pt-1">
            <span>Landscape total</span>
            <span className={Number.isFinite(summary.total) ? "" : "text-amber-700"}>{costLabel(summary.total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}