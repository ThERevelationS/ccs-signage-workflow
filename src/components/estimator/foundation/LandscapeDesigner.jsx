import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  LANDSCAPE_MATERIALS,
  GRID_COLS,
  GRID_ROWS,
  landscapeSummary,
  materialByKey,
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
    onChange({ cell_size_inches: landscape?.cell_size_inches, cells: strokeRef.current });
    strokeRef.current = null;
    setStrokeCells(null);
  };
  const viewCells = strokeCells || cells;

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
    onChange({ cell_size_inches: landscape?.cell_size_inches, cells: next });
  };

  return (
    <div className={`bg-white rounded-sm border p-3 ${broken ? "border-amber-300" : "border-gray-200"}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-[13px] font-bold text-gray-900">Landscape Designer</h3>
          <p className="text-[11px] text-gray-400">
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
            onClick={() => {
              if (!window.confirm("Clear all landscaping from the canvas?")) return;
              onChange({ cell_size_inches: 12, cells: {} });
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
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Materials</div>
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
        </div>

        <div
          className="flex-1 overflow-auto rounded-sm border border-gray-300 bg-[#a1866f] p-1 select-none"
          onMouseLeave={endStroke}
        >
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(14px, 1fr))` }}
          >
            {Array.from({ length: GRID_ROWS }).map((_, y) =>
              Array.from({ length: GRID_COLS }).map((__, x) => {
                const key = viewCells[`${x},${y}`];
                const mat = key ? materialByKey(key) : null;
                return (
                  <div
                    key={`${x},${y}`}
                    onMouseDown={() => {
                      if (fillMode) { flood(x, y); return; }
                      setPainting(true);
                      paint(x, y);
                    }}
                    onMouseEnter={() => painting && !fillMode && paint(x, y)}
                    onMouseUp={endStroke}
                    className="aspect-square cursor-crosshair"
                    style={{ background: mat ? mat.color : "rgba(0,0,0,0.06)" }}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

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