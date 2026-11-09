import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { money } from "./foundationCalc";
import { hasFoundationCostSnapshot } from "./foundationCatalogIntegrity";
import { FoundationDimensionInput } from "./foundationFtInEntry";
import { foundationDimensionFieldMeta } from "./foundationGeometryInputs";
import { foundationWallCapCatalogIssues, wallCapInputNumber, wallCapCutLengthValue } from "./wallCapCalculator";

// O-093 (CMP-H02): the cut-length field takes feet/inches entry through the
// shared dimension field â€” same verbatim-draft contract as the CMP-A08
// boundary it replaces, canonical inches stored, plain-language label + help +
// suggested-format placeholder from the field meta map (never stored defaults).
const capDimMeta = (field) => foundationDimensionFieldMeta("wallCap", field);

export default function FoundationWallCapsPanel({ caps = [], walls = [], options = [], onChange }) {
  const [capWallId, setCapWallId] = useState("");
  const patchCap = (index, changes) =>
    onChange(caps.map((c, i) => (i === index ? { ...c, ...changes } : c)));

  // O-049 (CMP-D06): cap generation from actual wall geometry — one cap row
  // per un-capped segment of the chosen wall(s); the segment's own length is
  // the cut length (over-stock cuts still fail held in wallCapCalculator).
  const capWalls = (wallIds) => {
    const inv = options[0];
    const stockLength = wallCapInputNumber(inv?.cap_stock_length_inches);
    const capped = new Set(caps.map((c) => c.segment_component_id).filter(Boolean));
    const made = [];
    wallIds.forEach((wallId) => {
      const wi = walls.findIndex((w) => w.component_id === wallId);
      const wall = walls[wi];
      (wall?.shape?.segments || []).forEach((sg, si) => {
        if (sg?.component_id && capped.has(sg.component_id)) return;
        const len = wallCapInputNumber(sg?.length);
        made.push({
          id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          cap_inventory_id: inv?.id || "",
          wall_component_id: wallId,
          wall_index: wi < 0 ? undefined : wi,
          segment_component_id: sg?.component_id || "",
          segment_index: si,
          position_along_segment_inches: 0,
          length_inches: len !== null && len > 0 ? len : stockLength !== null && stockLength > 0 ? stockLength : "",
          rotation_offset_degrees: 0,
          lateral_offset_inches: 0,
        });
        if (sg?.component_id) capped.add(sg.component_id);
      });
    });
    if (made.length) onChange([...caps, ...made]);
  };

  const removeCap = (index) => {
    if (!window.confirm(`Remove cap ${index + 1}?`)) return;
    onChange(caps.filter((_, i) => i !== index));
  };

  const addCap = () => {
    const inv = options[0];
    const stockLength = wallCapInputNumber(inv?.cap_stock_length_inches);
    onChange([
      ...caps,
      {
        id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        cap_inventory_id: inv?.id || "",
        wall_component_id: walls[0]?.component_id || "",
        wall_index: walls.length ? 0 : undefined,
        segment_component_id: walls[0]?.shape?.segments?.[0]?.component_id || "",
        segment_index: walls[0]?.shape?.segments?.length ? 0 : undefined,
        position_along_segment_inches: 0,
        length_inches: stockLength !== null && stockLength > 0 ? stockLength : "",
        rotation_offset_degrees: 0,
        lateral_offset_inches: 0,
      },
    ]);
  };

  // O-051 (CMP-D08): segment coverage / cut list — caps grouped by their
  // bound segment, sorted by position, each with its cut vs the segment
  // length plus the uncovered gaps between them. Read-only and honest:
  // nothing here invents miters, joints, or auto-fits.
  const cutList = [];
  walls.forEach((wall, wi) => {
    (wall?.shape?.segments || []).forEach((sg, si) => {
      const segLen = wallCapInputNumber(sg?.length);
      const segCaps = caps
        .map((c, ci) => ({ c, ci }))
        .filter(({ c }) => c.segment_component_id && c.segment_component_id === sg?.component_id)
        .map(({ c, ci }) => {
          const cut = wallCapInputNumber(wallCapCutLengthValue(c));
          const pos = wallCapInputNumber(c.position_along_segment_inches);
          return { ci, cut, pos: pos !== null ? pos : 0 };
        })
        .sort((a, b) => a.pos - b.pos);
      if (!segCaps.length) return;
      const pieces = [];
      let cursor = 0;
      segCaps.forEach(({ ci, cut, pos }) => {
        const start = Math.max(0, pos);
        if (segLen !== null && start > cursor) {
          pieces.push({ gap: start - cursor });
        }
        if (cut !== null && cut > 0) {
          pieces.push({ ci, start, end: start + cut, over: segLen !== null && start + cut > segLen });
          cursor = Math.max(cursor, start + cut);
        } else {
          pieces.push({ ci, start, end: null, uncut: true });
        }
      });
      if (segLen !== null && cursor < segLen) pieces.push({ gap: segLen - cursor });
      cutList.push({
        wall: wall?.name || `Wall ${wi + 1}`,
        seg: si + 1, segLen, pieces,
      });
    });
  });

  // O-052 (CMP-D09): explicit split of an over-stock cut into two pieces on
  // the same segment — the remainder piece keeps position + mount so nothing
  // is silently resized. Full-stock billing still applies per piece (O-053).
  const splitCap = (index) => {
    const cap = caps[index];
    const inv = options.find((o) => o.id === cap?.cap_inventory_id);
    const stock = wallCapInputNumber(inv?.cap_stock_length_inches);
    const cut = wallCapInputNumber(wallCapCutLengthValue(cap));
    if (!cap || stock === null || stock <= 0 || cut === null || cut <= stock) return;
    const pos = wallCapInputNumber(cap.position_along_segment_inches) ?? 0;
    const next = [...caps];
    next.splice(index, 1,
      { ...cap, length_inches: stock },
      {
        ...cap,
        id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        component_id: undefined,
        length_inches: cut - stock,
        position_along_segment_inches: pos + stock,
      });
    onChange(next);
  };

  const capIssues = foundationWallCapCatalogIssues(caps, options);
  const unavailableCaps = new Set(capIssues.filter(issue => issue.code !== "wall_cap_cost_total_invalid").map(issue => issue.index));
  const geometryIssues = (index) => capIssues.filter(issue => issue.index === index && ["length_inches", "cap_stock_length_inches"].includes(issue.field));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Wall Caps</h2>
          <p className="text-xs text-gray-500">Full stock price is charged per cut piece.</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <select
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            value={capWallId}
            aria-label="Wall to cap"
            onChange={(e) => setCapWallId(e.target.value)}
          >
            <option value="">This wall…</option>
            {walls.map((w, i) => (
              <option key={w.component_id || i} value={w.component_id || ""}>
                {w.name || `Wall ${i + 1}`}
              </option>
            ))}
          </select>
          <Button
            variant="outline" size="sm"
            disabled={options.length === 0 || !capWallId}
            onClick={() => capWalls([capWallId])}
          >
            Cap wall
          </Button>
          <Button
            variant="outline" size="sm"
            disabled={options.length === 0 || walls.length === 0}
            onClick={() => capWalls(walls.map((w) => w.component_id))}
          >
            Cap all walls
          </Button>
          <Button variant="outline" size="sm" onClick={addCap} disabled={options.length === 0}>
            <Plus className="w-4 h-4" aria-hidden="true" /> Cap
          </Button>
        </div>
      </div>

      {options.length === 0 && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Wall cap catalog unavailable â€” existing rows remain editable; new caps cannot be added.
        </div>
      )}
      {cutList.length > 0 && (
        <details className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <summary className="text-[11px] font-semibold text-gray-700 cursor-pointer select-none">
            Cut list — {cutList.reduce((s, r) => s + r.pieces.filter((p) => p.ci !== undefined).length, 0)} piece{cutList.reduce((s, r) => s + r.pieces.filter((p) => p.ci !== undefined).length, 0) === 1 ? "" : "s"} on {cutList.length} segment{cutList.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-2 space-y-1.5 text-[11px] text-gray-700">
            {cutList.map((row) => (
              <div key={`${row.wall}:${row.seg}`}>
                <span className="font-medium text-gray-800">{row.wall} · Segment {row.seg}</span>
                {row.segLen !== null && <span className="text-gray-500"> ({Math.round(row.segLen)} in)</span>}
                <span className="text-gray-500">
                  {" — "}
                  {row.pieces.map((p, pi) => {
                    if (p.gap !== undefined) return <span key={pi} className="text-amber-700">gap {Math.round(p.gap)}″</span>;
                    if (p.uncut) return <span key={pi}>cap {p.ci + 1} @ {Math.round(p.start)}″ (no cut length)</span>;
                    return <span key={pi} className={p.over ? "text-red-600 font-medium" : undefined}>cap {p.ci + 1} @ {Math.round(p.start)}″–{Math.round(p.end)}″{p.over ? " (overruns segment)" : ""}</span>;
                  }).reduce((acc, el, i) => i === 0 ? [el] : [...acc, ", ", el], [])}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
      {caps.length === 0 ? (
        <div className="text-center py-6 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm">
          No caps on this section.
        </div>
      ) : (
        caps.map((cap, index) => (
          <div key={cap.component_id || cap.id || index} className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
              <label className="text-xs text-gray-500 md:col-span-2">
                Cap material
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={cap.cap_inventory_id || ""}
                  aria-label="Cap material"
                  onChange={(e) => {
                    patchCap(index, {
                      cap_inventory_id: e.target.value,
                    });
                  }}
                >
                  <option value="">Select capâ€¦</option>
                  {cap.cap_inventory_id && !options.some((o) => o.id === cap.cap_inventory_id) && (
                    <option value={cap.cap_inventory_id} disabled>{`Catalog cap unavailable (${cap.cap_inventory_id})`}</option>
                  )}
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.material_name}
                    </option>
                  ))}
                </select>
                {cap.cap_inventory_id && !options.some((o) => o.id === cap.cap_inventory_id) && (
                  <span className="block text-[10px] text-amber-700 mt-1">Catalog cap unavailable; current pricing needs review.</span>
                )}
              </label>
              <label className="text-xs text-gray-500">
                Wall
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={cap.wall_component_id ?? ""}
                  aria-label="Cap wall"
                  onChange={(e) => {
                    const id = e.target.value;
                    const i = walls.findIndex((w) => w.component_id === id);
                    patchCap(index, {
                      wall_component_id: id,
                      wall_index: id === "" || i < 0 ? undefined : i,
                      segment_component_id: "",
                      segment_index: undefined,
                    });
                  }}
                >
                  <option value="">Unassigned</option>
                  {cap.wall_component_id && !walls.some((w) => w.component_id === cap.wall_component_id) && (
                    <option value={cap.wall_component_id} disabled>{`Missing wall (${String(cap.wall_component_id).slice(0, 18)}â€¦)`}</option>
                  )}
                  {walls.map((w, i) => (
                    <option key={w.component_id || i} value={w.component_id || ""}>
                      {w.name || `Wall ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-500">
                Segment
                <select
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={cap.segment_component_id ?? ""}
                  aria-label="Cap segment"
                  onChange={(e) => {
                    const id = e.target.value;
                    const wall = walls.find((w) => w.component_id === cap.wall_component_id);
                    const segs = wall?.shape?.segments || [];
                    const i = segs.findIndex((sg) => sg.component_id === id);
                    patchCap(index, {
                      segment_component_id: id,
                      segment_index: id === "" || i < 0 ? undefined : i,
                    });
                  }}
                >
                  <option value="">Unassigned</option>
                  {cap.segment_component_id && !(walls.find((w) => w.component_id === cap.wall_component_id)?.shape?.segments || []).some((sg) => sg.component_id === cap.segment_component_id) && (
                    <option value={cap.segment_component_id} disabled>{`Missing segment (${String(cap.segment_component_id).slice(0, 18)}â€¦)`}</option>
                  )}
                  {(walls.find((w) => w.component_id === cap.wall_component_id)?.shape?.segments || []).map((sg, i) => (
                    <option key={sg.component_id || i} value={sg.component_id || ""}>
                      {`Segment ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <FoundationDimensionInput
                {...capDimMeta("length_inches")}
                // Stored value drives display: canonical inches render as
                // ft/in; a verbatim malformed draft echoes back for repair
                // (the prior display blanked it while diagnostics flagged it).
                value={wallCapCutLengthValue(cap)}
                onCommit={(v) => patchCap(index, { length_inches: v })}
                ariaLabel={`Cap ${index + 1} cut length (inches)`}
                invalid={geometryIssues(index).some((i) => i.field === "length_inches") || undefined}
                describedBy={geometryIssues(index).length ? `wall-cap-${index}-geometry` : undefined}
              />
              <FoundationDimensionInput
                {...capDimMeta("overhang_inches")}
                value={cap.overhang_inches}
                onCommit={(v) => patchCap(index, { overhang_inches: v })}
                ariaLabel={`Cap ${index + 1} overhang (inches)`}
              />
              <FoundationDimensionInput
                {...capDimMeta("height_inches")}
                value={cap.height_inches}
                onCommit={(v) => patchCap(index, { height_inches: v })}
                ariaLabel={`Cap ${index + 1} thickness (inches)`}
              />
            </div>
            {geometryIssues(index).length > 0 && (
              <div id={`wall-cap-${index}-geometry`} className="mt-1 text-[11px] text-amber-700 space-y-0.5">
                {geometryIssues(index).map((issue) => (
                  <p key={issue.code}>{issue.message}</p>
                ))}
                {geometryIssues(index).some((i) => i.code === "wall_cap_cut_exceeds_stock") && (
                  <Button variant="outline" size="sm" className="mt-1" onClick={() => splitCap(index)}>
                    Split at stock length
                  </Button>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mt-2 text-xs text-gray-600">
              <span>
                {unavailableCaps.has(index) ? "Saved stock length: " : "Stock length: "}<span className="font-semibold text-gray-900">{hasFoundationCostSnapshot(cap.stock_length_inches) && cap.stock_length_inches > 0 ? cap.stock_length_inches + String.fromCharCode(34) : "Not saved"}</span>
              </span>
              <div className="ml-auto flex items-center gap-3">
                <span className="font-bold text-gray-900">{hasFoundationCostSnapshot(cap.cost) ? money(cap.cost) : "Not saved"}</span>
                {unavailableCaps.has(index) && <span className="text-[10px] text-amber-700">Saved amounts (not current pricing)</span>}
                <Button variant="ghost" size="icon" onClick={() => removeCap(index)}>
                  <Trash2 className="w-4 h-4 text-red-500" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}