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
  const [selectedWallIds, setSelectedWallIds] = useState(() => new Set());
  const toggleWall = (id) => setSelectedWallIds((prev) => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const patchCap = (index, changes) =>
    onChange(caps.map((c, i) => (i === index ? { ...c, ...changes } : c)));

  // O-049 (CMP-D06): cap generation from actual wall geometry — one cap row
  // per un-capped segment of the chosen wall(s); the segment's own length is
  // the cut length (over-stock cuts still fail held in wallCapCalculator).
  const capWalls = (wallIds) => {
    const inv = options[0];
    const stockLength = wallCapInputNumber(inv?.cap_stock_length_inches);
    // O-054 (CMP-D11): a cap with `locked: true` keeps its segment covered
    // — generators skip locked caps' segments entirely.
    const capped = new Set(caps.filter((c) => c?.locked !== false).map((c) => c.segment_component_id).filter(Boolean));
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

  // O-051 (CMP-D08) -- auto-fit placement: tiles caps along a wall's
  // segments at stock-length intervals (fills the segment end-to-end vs one
  // cap at position 0); the remainder tail stays blank for authored entry
  // (held-closed, never an invented cut).
  const capFit = (wallId) => {
    const inv = options[0];
    const stockLength = wallCapInputNumber(inv?.cap_stock_length_inches);
    const wall = walls.find((w) => w.component_id === wallId);
    if (!wall || !Number.isFinite(stockLength) || stockLength <= 0) return;
    const capped = new Set(caps.filter((c) => c?.locked !== false).map((c) => c.segment_component_id).filter(Boolean));
    const made = [];
    const wi = walls.indexOf(wall);
    (wall?.shape?.segments || []).forEach((sg, si) => {
      if (sg?.component_id && capped.has(sg.component_id)) return;
      const len = wallCapInputNumber(sg?.length);
      if (!Number.isFinite(len) || len <= 0) return;
      let pos = 0, n = 0;
      while (pos + stockLength <= len && n < 200) {
        made.push({
          id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          cap_inventory_id: inv?.id || "", wall_component_id: wallId, wall_index: wi < 0 ? undefined : wi,
          segment_component_id: sg?.component_id || "", segment_index: si,
          position_along_segment_inches: Math.round(pos * 100) / 100,
          length_inches: stockLength,
          rotation_offset_degrees: 0, lateral_offset_inches: 0,
        });
        pos += stockLength; n += 1;
      }
      if (len - pos > 0.01) {
        made.push({
          id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          cap_inventory_id: inv?.id || "", wall_component_id: wallId, wall_index: wi < 0 ? undefined : wi,
          segment_component_id: sg?.component_id || "", segment_index: si,
          position_along_segment_inches: Math.round(pos * 100) / 100,
          length_inches: "", // remainder tail -- authored entry (held-closed)
          rotation_offset_degrees: 0, lateral_offset_inches: 0,
        });
      }
      if (sg?.component_id) capped.add(sg.component_id);
    });
    if (made.length) onChange([...caps, ...made]);
  };

  // O-051 (CMP-D08): corner/miter/end-piece generation — mint a cap row per
  // non-collinear wall vertex (a mitered corner) and one per open end
  // (straight end treatment). Cut lengths stay BLANK for authored entry —
  // never an invented dimension; held-closed until the operator records them.
  const capCorners = (wallId) => {
    const inv = options[0];
    const wall = walls.find((w) => w.component_id === wallId);
    const pts = wall?.shape?.points || [];
    const closed = wall?.shape?.closed === true;
    if (pts.length < 2) return;
    const cross = (a, b, c) => (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    const n = pts.length;
    const cornerIdx = [];
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) continue; // open ends are end-pieces
      const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
      if (Math.abs(cross(a, b, c)) > 0.01) cornerIdx.push(i);
    }
    const made = cornerIdx.map((vi) => ({
      id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      cap_inventory_id: inv?.id || "",
      wall_component_id: wallId,
      wall_index: walls.findIndex((w) => w.component_id === wallId),
      end_treatment: "mitered",
      length_inches: "",
      position_along_segment_inches: 0,
      rotation_offset_degrees: 0,
      lateral_offset_inches: 0,
      corner_vertex_index: vi,
    }));
    if (!closed) {
      [0, n - 1].forEach((ei) => {
        made.push({
          id: `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          cap_inventory_id: inv?.id || "",
          wall_component_id: wallId,
          wall_index: walls.findIndex((w) => w.component_id === wallId),
          end_treatment: "straight",
          length_inches: "",
          position_along_segment_inches: 0,
          rotation_offset_degrees: 0,
          lateral_offset_inches: 0,
          end_vertex_index: ei,
        });
      });
    }
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
        // O-051 -- overlap-vs-gap differentiation: a cap starting before the
        // previous piece ends is a miter-overlap (intentional joint), not an
        // uncovered gap. Surface it distinctly on the cut list.
        const overlap = cursor > start ? cursor - start : 0;
        if (cut !== null && cut > 0) {
          pieces.push({ ci, start, end: start + cut, over: segLen !== null && start + cut > segLen, overlap });
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
          {/* O-051 (CMP-D08) -- auto-fit: tiles caps along the picked wall's
              segments at stock-length intervals (fills end-to-end vs one cap
              at position 0); the remainder tail stays blank for authored
              entry (held-closed, never an invented cut). */}
          <Button
            variant="outline" size="sm"
            disabled={options.length === 0 || !capWallId}
            onClick={() => capFit(capWallId)}
          >
            Fit caps
          </Button>
          <Button
            variant="outline" size="sm"
            disabled={options.length === 0 || walls.length === 0}
            onClick={() => capWalls(walls.map((w) => w.component_id))}
          >
            Cap all walls
          </Button>
          {/* O-054 (CMP-D11) -- bulk re-anchor: re-anchors every dangling cap
              (an unresolved `segment_component_id`) to its wall's first
              available segment — a bulk fix vs per-cap manual re-anchor; a
              cap with no wall's segments stays dangling (never an invented
              anchor). */}
          {(() => {
            const dangling = caps.filter((c) => {
              const w = walls.find((x) => x.component_id === c?.wall_component_id);
              const segs = w?.shape?.segments || [];
              return c?.segment_component_id && !segs.some((s) => s?.component_id === c.segment_component_id);
            });
            return dangling.length > 0 && (
              <Button variant="outline" size="sm"
                title={`Re-anchor ${dangling.length} dangling cap${dangling.length === 1 ? "" : "s"} to their wall's first available segment`}
                onClick={() => onChange(caps.map((c) => {
                  const w = walls.find((x) => x.component_id === c?.wall_component_id);
                  const segs = w?.shape?.segments || [];
                  if (c?.segment_component_id && !segs.some((s) => s?.component_id === c.segment_component_id)) {
                    const to = segs[0]?.component_id || c.segment_component_id;
                    // O-054 (CMP-D11) -- cap_reanchor_log: every re-anchor is
                    // recorded (from -> to segment + when), never a silent
                    // rebind.
                    const reanchor_log = [...(Array.isArray(c.reanchor_log) ? c.reanchor_log : []),
                      { at: new Date().toISOString(), from: c.segment_component_id, to }];
                    return { ...c, segment_component_id: to, segment_index: 0, reanchor_log };
                  }
                  return c;
                }))}
              >
                Re-anchor {dangling.length}
              </Button>
            );
          })()}
          {/* O-054 (CMP-D11) -- rebuild preview: before a regeneration runs,
              surface which caps hold their segment (locked) vs free for
              regeneration (unlocked) -- the rebuild's effect is visible
              before apply, never a silent destruction. */}
          {caps.length > 0 && (() => {
            const lockedCount = caps.filter((c) => c?.locked !== false).length;
            const freeCount = caps.length - lockedCount;
            return (
              <span className="text-[10px] text-gray-500" title="Caps that hold their segment vs free for regeneration">
                {lockedCount} locked hold{lockedCount === 1 ? "" : "s"} · {freeCount} free to regenerate
              </span>
            );
          })()}
          {/* O-049 (CMP-D06) -- selection-scoped cap: check the walls to cap,
              then "Cap selected" mints one cap row per un-capped segment on
              only those walls (between the single-wall and cap-all paths). */}
          {walls.length > 1 && (
            <>
              <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Walls to cap">
                {walls.map((w, i) => {
                  const id = w.component_id || "";
                  const checked = selectedWallIds.has(id);
                  return (
                    <label key={id || i} className="flex items-center gap-1 text-[11px] text-gray-600 border rounded px-1.5 h-7">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleWall(id)}
                        aria-label={`Select ${w.name || `wall ${i + 1}`} for capping`}
                      />
                      {w.name || `Wall ${i + 1}`}
                    </label>
                  );
                })}
              </div>
              <Button
                variant="outline" size="sm"
                disabled={options.length === 0 || selectedWallIds.size === 0}
                onClick={() => capWalls([...selectedWallIds])}
              >
                Cap selected
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={addCap} disabled={options.length === 0}>
            <Plus className="w-4 h-4" aria-hidden="true" /> Cap
          </Button>
          {/* O-051 (CMP-D08) -- corner/end-piece generation on the picked wall. */}
          <Button
            variant="outline" size="sm"
            disabled={options.length === 0 || !capWallId}
            onClick={() => capCorners(capWallId)}
            title="Mint a mitered cap at each wall vertex plus end-pieces on open runs"
          >
            Corner pieces
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
                    return <span key={pi} className={p.over ? "text-red-600 font-medium" : undefined}>cap {p.ci + 1} @ {Math.round(p.start)}″–{Math.round(p.end)}″{p.over ? " (overruns segment)" : ""}{p.overlap ? ` (miter overlap ${Math.round(p.overlap)}″)` : ""}</span>;
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
            {/* O-050 (CMP-D07) -- optional cap metadata: profile / width /
                elevation / joint spacing / slope / end treatment. Blank =
                "not recorded", never a silent default on the cap's geometry
                or finish. */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-2">
              <label className="text-xs text-gray-500">
                Profile
                <input
                  type="text"
                  value={cap.profile ?? ""}
                  placeholder={capDimMeta("profile")?.placeholder ?? "flat"}
                  onChange={(e) => patchCap(index, { profile: e.target.value === "" ? undefined : e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  aria-label={`Cap ${index + 1} profile`}
                />
              </label>
              <FoundationDimensionInput
                {...capDimMeta("width_inches")}
                value={cap.width_inches}
                onCommit={(v) => patchCap(index, { width_inches: v })}
                ariaLabel={`Cap ${index + 1} width (inches)`}
              />
              <FoundationDimensionInput
                {...capDimMeta("elevation_inches")}
                value={cap.elevation_inches}
                onCommit={(v) => patchCap(index, { elevation_inches: v })}
                ariaLabel={`Cap ${index + 1} elevation (inches)`}
              />
              <FoundationDimensionInput
                {...capDimMeta("joint_spacing_inches")}
                value={cap.joint_spacing_inches}
                onCommit={(v) => patchCap(index, { joint_spacing_inches: v })}
                ariaLabel={`Cap ${index + 1} joint spacing (inches)`}
              />
              <label className="text-xs text-gray-500">
                Slope
                <select
                  value={cap.slope ?? ""}
                  onChange={(e) => patchCap(index, { slope: e.target.value === "" ? undefined : e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  aria-label={`Cap ${index + 1} slope`}
                >
                  <option value="">Not recorded</option>
                  <option value="flat">Flat</option>
                  <option value="single">Single-slope</option>
                  <option value="double">Double-slope</option>
                </select>
              </label>
              <label className="text-xs text-gray-500">
                End treatment
                <select
                  value={cap.end_treatment ?? ""}
                  onChange={(e) => patchCap(index, { end_treatment: e.target.value === "" ? undefined : e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  aria-label={`Cap ${index + 1} end treatment`}
                >
                  <option value="">Not recorded</option>
                  <option value="straight">Straight</option>
                  <option value="mitered">Mitered</option>
                  <option value="returned">Returned</option>
                </select>
              </label>
              {/* O-055 (CMP-D12) -- optional authored installation-supplies +
                  cut-labor cost lines; each blank = $0, authored must be finite
                  nonnegative or the whole cap's cost holds. */}
              <label className="text-xs text-gray-500">
                Supplies $
                <input
                  type="number" min="0" step="0.01" placeholder="0"
                  value={cap.supplies_cost ?? ""}
                  onChange={(e) => patchCap(index, { supplies_cost: e.target.value === "" ? undefined : Number(e.target.value) })}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  aria-label={`Cap ${index + 1} supplies cost`}
                />
              </label>
              <label className="text-xs text-gray-500">
                Cut labor $
                <input
                  type="number" min="0" step="0.01" placeholder="0"
                  value={cap.cut_labor_cost ?? ""}
                  onChange={(e) => patchCap(index, { cut_labor_cost: e.target.value === "" ? undefined : Number(e.target.value) })}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  aria-label={`Cap ${index + 1} cut labor cost`}
                />
              </label>
              {/* O-050 (CMP-D07) -- miter angle + joint width: the cut-list
                  fields the scene diagnostics hold as "not recorded" until
                  authored. Blank = held, never an invented angle. */}
              <label className="text-xs text-gray-500">
                Miter angle (deg)
                <input
                  type="number" step="0.1" placeholder="45"
                  value={cap.miter_angle_deg ?? ""}
                  onChange={(e) => patchCap(index, { miter_angle_deg: e.target.value === "" ? undefined : Number(e.target.value) })}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  aria-label={`Cap ${index + 1} miter angle (degrees)`}
                />
              </label>
              <FoundationDimensionInput
                label="Joint width (in)"
                value={cap.joint_width_inches}
                onCommit={(v) => patchCap(index, { joint_width_inches: v })}
                ariaLabel={`Cap ${index + 1} joint width (inches)`}
              />
              {/* O-053 (CMP-D10) -- offcut election + purchased-piece count:
                  whether the cap's offcut is elected for reuse and how many
                  stock pieces are purchased. Billing stays full-stock per
                  piece; these are recorded fields, never a silent discount. */}
              <label className="text-xs text-gray-500 flex items-end gap-1.5 pb-2">
                <input
                  type="checkbox"
                  checked={cap.offcut_reuse_elected === true}
                  onChange={(e) => patchCap(index, { offcut_reuse_elected: e.target.checked ? true : undefined })}
                  aria-label={`Cap ${index + 1} offcut reuse elected`}
                />
                Reuse offcut
              </label>
              <label className="text-xs text-gray-500">
                Purchased pieces
                <input
                  type="number" min="0" step="1" placeholder="0"
                  value={cap.purchased_pieces ?? ""}
                  onChange={(e) => patchCap(index, { purchased_pieces: e.target.value === "" ? undefined : Number(e.target.value) })}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  aria-label={`Cap ${index + 1} purchased pieces`}
                />
              </label>
              {/* O-054 (CMP-D11) -- anchor state: the cap's recorded segment
                  anchor (anchored / drifted / manual). Bulk re-anchor appends
                  to reanchor_log; this field records the operator's state. */}
              <label className="text-xs text-gray-500">
                Anchor state
                <input
                  type="text"
                  value={cap.cap_anchor_state ?? ""}
                  placeholder="anchored"
                  onChange={(e) => patchCap(index, { cap_anchor_state: e.target.value === "" ? undefined : e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  aria-label={`Cap ${index + 1} anchor state`}
                />
              </label>
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
                <label className="flex items-center gap-1 text-[10px] text-gray-500" title="Locked caps keep their segment covered; unlock to regenerate">
                  <input
                    type="checkbox"
                    checked={cap.locked !== false}
                    onChange={(e) => patchCap(index, { locked: e.target.checked ? undefined : false })}
                    aria-label={`Cap ${index + 1} locked`}
                  />
                  Locked
                </label>
                <span className="font-bold text-gray-900">{hasFoundationCostSnapshot(cap.cost) ? money(cap.cost) : "Not saved"}</span>
                {unavailableCaps.has(index) && <span className="text-[10px] text-amber-700">Saved amounts (not current pricing)</span>}
                <Button variant="ghost" size="icon" aria-label={`Remove cap ${index + 1}`} onClick={() => removeCap(index)}>
                  <Trash2 className="w-4 h-4 text-red-500" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        ))
      )}
      {/* O-053 (CMP-D10) -- offcut-reuse alternative: the leftover stock after
          each cut, surfaced for the operator's reuse decision. Informational
          only -- the priced contract stays full-stock per cut; the offcut is
          never priced and never a silent zero. */}
      {(() => {
        const offcuts = (caps || []).map((c) => {
          const inv = options.find((o) => o.id === c?.cap_inventory_id);
          const stock = wallCapInputNumber(inv?.cap_stock_length_inches);
          const cut = wallCapInputNumber(wallCapCutLengthValue(c));
          return stock !== null && stock > 0 && cut !== null && cut > 0 && cut <= stock ? stock - cut : null;
        }).filter((n) => n !== null && n > 0);
        if (!offcuts.length) return null;
        const total = offcuts.reduce((a, b) => a + b, 0);
        // O-053 (CMP-D10) -- reuse detail: purchased pieces / waste / labor /
        // price delta on the offcut-reuse view (informational only -- the
        // priced contract stays full-stock per cut; the offcut is never
        // priced and never a silent zero).
        const purchased = (caps || []).length;
        const labor = (caps || []).reduce((a, c) => a + (wallCapInputNumber(c?.cut_labor_cost) || 0), 0);
        return (
          <details className="text-[11px] text-gray-500 mt-1">
            <summary className="cursor-pointer hover:text-gray-700">
              Offcuts: {offcuts.length} piece{offcuts.length === 1 ? "" : "s"} totaling {Math.round(total)}&quot; reusable -- not billed (full-stock pricing already charged).
            </summary>
            <ul className="mt-0.5 list-disc pl-4">
              <li>Purchased pieces: {purchased} (one stock row per cut piece)</li>
              <li>Waste: {Math.round(total)}&quot; reusable offcut across {offcuts.length} piece{offcuts.length === 1 ? "" : "s"}</li>
              <li>Cut labor: {labor > 0 ? `$${labor.toFixed(2)}` : "not recorded"}</li>
              <li>Price delta: $0 -- offcut reuse is informational; full-stock pricing already charged</li>
            </ul>
          </details>
        );
      })()}
    </div>
  );
}