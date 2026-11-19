import ReinforcementDraftField from "./ReinforcementDraftField";
import ReinforcementDraftList, { newRowId } from "./ReinforcementDraftList";

const SUPPORT_MODES = [
  { id: "unconfigured", label: "Unconfigured" },
  { id: "auto", label: "Auto" },
  { id: "manual", label: "Manual" },
  { id: "off", label: "Off" },
];

const asObj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const asList = (v) => (Array.isArray(v) ? v : []);

export default function ReinforcementDraftGeometry({ draft, item, supportCatalog, disabled, onChange }) {
  const design = asObj(draft?.design);
  if (!design) {
    return <div className="rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] text-amber-800">Design draft malformed; repair required.</div>;
  }
  const isPillar = item?.foundation_type === "pillar";
  const cover = asObj(design.cover_inches) ?? {};
  const supports = asObj(design.supports) ?? { mode: "unconfigured", reason: "" };
  const supportRows = asList(supportCatalog).filter(r => r && typeof r === "object" && r.material_type === "rebar_support");
  const supportOptions = supportRows
    .filter(r => typeof r.id === "string" && r.id)
    .map(r => ({ id: r.id, label: `${r.material_name || "Rebar support"}${r.rebar_support_height_inches != null ? ` (${r.rebar_support_height_inches} in)` : ""}` }));
  const spread = asObj(design.spread) ?? { mats: [], inter_mat_ties: [] };
  const pillar = asObj(design.pillar) ?? { hoops: [], longitudinal: {} };
  const lon = asObj(pillar.longitudinal) ?? {};

  const setCover = (k, v) => onChange({ ...design, cover_inches: { ...cover, [k]: v } });
  const setSupports = (p) => onChange({ ...design, supports: { ...supports, ...p } });
  const setSpread = (p) => onChange({ ...design, spread: { ...spread, ...p } });
  const setPillar = (p) => onChange({ ...design, pillar: { ...pillar, ...p } });
  const setLon = (k, v) => setPillar({ longitudinal: { ...lon, [k]: v } });

  const mats = Array.isArray(spread.mats) ? spread.mats : undefined;
  const ties = Array.isArray(spread.inter_mat_ties) ? spread.inter_mat_ties : undefined;
  const hoops = Array.isArray(pillar.hoops) ? pillar.hoops : undefined;
  const matOptions = (mats ?? [])
    .filter(r => r && typeof r === "object" && typeof r.id === "string")
    .map(m => ({ id: m.id, label: m.id }));
  const tieFromTo = () => [{ id: "", label: "-" }, ...matOptions];
  const replacements = [
    { key: "cover_inches", value: design.cover_inches, initial: { side: "", top: "", bottom: "" } },
    { key: "supports", value: design.supports, initial: { mode: "unconfigured", reason: "", spacing_inches: "", catalog_id: "", mats: [], placements: [] } },
    isPillar
      ? { key: "pillar", value: design.pillar, initial: { hoops: [], longitudinal: {} } }
      : { key: "spread", value: design.spread, initial: { mats: [], inter_mat_ties: [] } },
    ...(isPillar && asObj(design.pillar) ? [{ key: "longitudinal", value: pillar.longitudinal, initial: {} }] : []),
  ].filter(entry => entry.value !== undefined && !asObj(entry.value));
  if (replacements.length) return (
    <div className="space-y-2">
      {replacements.map(({ key, initial }) => (
        <div key={key} className="rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] text-amber-800">
          {key} draft malformed.{" "}
          <button type="button" disabled={disabled} onClick={() => onChange(key === "longitudinal"
            ? { ...design, pillar: { ...pillar, longitudinal: initial } }
            : { ...design, [key]: initial })} className="underline">Replace {key}</button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      <ReinforcementDraftField label="Bar diameter (in)" value={design.bar_diameter_inches} disabled={disabled} onChange={(v) => onChange({ ...design, bar_diameter_inches: v })} />
      <div className="grid grid-cols-3 gap-2">
        {["side", "top", "bottom"].map(k => (
          <ReinforcementDraftField key={k} label={`Cover ${k} (in)`} value={cover[k]} disabled={disabled} onChange={(v) => setCover(k, v)} />
        ))}
      </div>
      <div>
        <label className="block">
          <span className="text-[12px] text-gray-600">Supports</span>
          <select aria-label="Supports" value={typeof supports.mode === "string" && supports.mode !== "" ? supports.mode : "unconfigured"} disabled={disabled} onChange={(e) => setSupports({ mode: e.target.value })} className="mt-0.5 block max-w-full rounded-sm border border-gray-300 px-1.5 py-1 text-[13px] disabled:bg-gray-50">
            {SUPPORT_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            {typeof supports.mode === "string" && !SUPPORT_MODES.some(m => m.id === supports.mode) && supports.mode && (
              <option value={supports.mode} disabled>Reserved: {supports.mode}</option>
            )}
            {supports.mode !== undefined && supports.mode !== null && typeof supports.mode !== "string" && (
              <option value="unconfigured" disabled>Invalid mode</option>
            )}
          </select>
        </label>
        {supports.mode === "auto" && (
          <div className="mt-1 space-y-1">
            {isPillar ? (
              <p className="text-[11px] text-amber-700">Auto support placement is unavailable for pillar cages; use Manual or explain Off.</p>
            ) : (
              <ReinforcementDraftField label="Max support spacing (in)" value={supports.spacing_inches} inputMode="decimal" disabled={disabled} onChange={(v) => setSupports({ spacing_inches: v })} />
            )}
          </div>
        )}
        {(supports.mode === "auto" || supports.mode === "manual") && (
          <div className="mt-1">
            <label className="block">
              <span className="text-[12px] text-gray-600">Support catalog pin (optional)</span>
              <select aria-label="Support catalog" value={typeof supports.catalog_id === "string" ? supports.catalog_id : ""} disabled={disabled} onChange={(e) => setSupports({ catalog_id: e.target.value })} className="mt-0.5 block max-w-full rounded-sm border border-gray-300 px-1.5 py-1 text-[13px] disabled:bg-gray-50">
                <option value="">Auto-select (no pin)</option>
                {supportOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            {supports.catalog_id && !supportRows.some(r => r.id === supports.catalog_id) && (
              <p className="mt-0.5 text-[11px] text-amber-700">Pinned support ID is not in the current catalog â€” pricing will report it unresolved.</p>
            )}
            {!supportRows.length && (
              <p className="mt-0.5 text-[11px] text-amber-700">No rebar_support catalog rows loaded; compatible-pick pricing will stay unresolved.</p>
            )}
          </div>
        )}
        {supports.mode === "manual" && (
          <div className="mt-1 space-y-2">
            <ReinforcementDraftList
              title="Support counts per mat"
              listKey="support-mats"
              rows={supports.mats}
              maxRows={256}
              disabled={disabled}
              onReplaceList={() => setSupports({ mats: [] })}
              fields={[
                { key: "mat_id", label: "Target", options: isPillar ? [{ id: "cage", label: "Pillar cage" }] : [{ id: "", label: "-" }, ...matOptions] },
                { key: "count", label: "Count", inputMode: "numeric" },
              ]}
              onAdd={() => setSupports({ mats: [...asList(supports.mats), { mat_id: isPillar ? "cage" : "", count: "" }] })}
              onDelete={(i) => setSupports({ mats: asList(supports.mats).filter((_, j) => j !== i) })}
              onFieldChange={(i, k, v) => { const n = [...asList(supports.mats)]; n[i] = { ...n[i], [k]: v }; setSupports({ mats: n }); }}
            />
            <ReinforcementDraftList
              title="Explicit support placements"
              listKey="support-placements"
              rows={supports.placements}
              maxRows={4096}
              disabled={disabled}
              onReplaceList={() => setSupports({ placements: [] })}
              fields={[
                { key: "mat_id", label: "Target", options: isPillar ? [{ id: "cage", label: "Pillar cage" }] : [{ id: "", label: "-" }, ...matOptions] },
                { key: "x_inches", label: "X (in)" },
                { key: "z_inches", label: "Z (in)" },
              ]}
              onAdd={() => setSupports({ placements: [...asList(supports.placements), { mat_id: isPillar ? "cage" : "", x_inches: "", z_inches: "" }] })}
              onDelete={(i) => setSupports({ placements: asList(supports.placements).filter((_, j) => j !== i) })}
              onFieldChange={(i, k, v) => { const n = [...asList(supports.placements)]; n[i] = { ...n[i], [k]: v }; setSupports({ placements: n }); }}
            />
            <p className="text-[11px] text-gray-500">A mat may be covered by a count or by explicit placements, not both. Uncovered mats warn instead of guessing.</p>
          </div>
        )}
        {supports.mode === "off" && (
          <ReinforcementDraftField label="Reason" value={supports.reason} inputMode="text" disabled={disabled} onChange={(v) => setSupports({ reason: v })} />
        )}
      </div>

      {isPillar ? (
        <div className="space-y-2">
          <ReinforcementDraftList
            title="Pillar hoops"
            listKey="hoops"
            rows={pillar.hoops}
            maxRows={256}
            disabled={disabled}
            onReplaceList={() => setPillar({ hoops: [] })}
            fields={[
              { key: "center_y_inches", label: "Center Y (in)" },
              { key: "centerline_diameter_inches", label: "Centerline dia (in)" },
              { key: "cut_allowance_inches", label: "Cut allowance (in)" },
            ]}
            onAdd={() => setPillar({ hoops: [...(hoops ?? []), { id: newRowId("hoop"), center_y_inches: "", centerline_diameter_inches: "", cut_allowance_inches: "" }] })}
            onDelete={(i) => setPillar({ hoops: hoops.filter((_, j) => j !== i) })}
            onFieldChange={(i, k, v) => { const n = [...hoops]; n[i] = { ...n[i], [k]: v }; setPillar({ hoops: n }); }}
          />
          <div className="grid grid-cols-2 gap-2">
            <ReinforcementDraftField label="Longitudinal count" value={lon.count} inputMode="numeric" disabled={disabled} onChange={(v) => setLon("count", v)} />
            <ReinforcementDraftField label="Longitudinal radius (in)" value={lon.radius_inches} disabled={disabled} onChange={(v) => setLon("radius_inches", v)} />
            <ReinforcementDraftField label="Bottom end (in)" value={lon.bottom_end_inches} disabled={disabled} onChange={(v) => setLon("bottom_end_inches", v)} />
            <ReinforcementDraftField label="Top end (in)" value={lon.top_end_inches} disabled={disabled} onChange={(v) => setLon("top_end_inches", v)} />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {(() => {
            const depth = Number(item?.depth_inches);
            const cov = Number(cover?.top);
            const dia = Number(design?.bar_diameter_inches);
            const ready = Number.isFinite(depth) && Number.isFinite(cov) && Number.isFinite(dia);
            return (
              <button
                type="button"
                disabled={disabled || !ready}
                title={ready ? "Add a mat with bearing elevation = depth - top cover - 2 x bar diameter; spacing stays authored." : "Record depth, top cover and bar diameter first."}
                onClick={() => setSpread({ mats: [...(mats ?? []), { id: newRowId("mat"), bearing_elevation_inches: depth - cov - 2 * dia, max_spacing_x_inches: "", max_spacing_z_inches: "" }] })}
                className="h-5 px-1.5 rounded-sm border border-violet-300 text-[10px] text-violet-700 hover:bg-violet-50 disabled:opacity-50"
              >+ Top mat (elevation from cover)</button>
            );
          })()}
          <ReinforcementDraftList
            title="Spread mats"
            listKey="mats"
            rows={spread.mats}
            maxRows={256}
            disabled={disabled}
            onReplaceList={() => setSpread({ mats: [] })}
            fields={[
              { key: "bearing_elevation_inches", label: "Bearing elevation (in)" },
              { key: "max_spacing_x_inches", label: "Max spacing X (in)" },
              { key: "max_spacing_z_inches", label: "Max spacing Z (in)" },
            ]}
            onAdd={() => setSpread({ mats: [...(mats ?? []), { id: newRowId("mat"), bearing_elevation_inches: "", max_spacing_x_inches: "", max_spacing_z_inches: "" }] })}
            onDelete={(i) => setSpread({ mats: mats.filter((_, j) => j !== i) })}
            onFieldChange={(i, k, v) => { const n = [...mats]; n[i] = { ...n[i], [k]: v }; setSpread({ mats: n }); }}
          />
          <ReinforcementDraftList
            title="Inter-mat ties"
            listKey="ties"
            rows={spread.inter_mat_ties}
            maxRows={4096}
            disabled={disabled}
            onReplaceList={() => setSpread({ inter_mat_ties: [] })}
            fields={[
              { key: "from_mat_id", label: "From mat", options: tieFromTo() },
              { key: "to_mat_id", label: "To mat", options: tieFromTo() },
              { key: "x_inches", label: "X (in)" },
              { key: "z_inches", label: "Z (in)" },
              { key: "cut_length_inches", label: "Cut length (in)" },
            ]}
            onAdd={() => setSpread({ inter_mat_ties: [...(ties ?? []), { id: newRowId("tie"), from_mat_id: "", to_mat_id: "", x_inches: "", z_inches: "", cut_length_inches: "" }] })}
            onDelete={(i) => setSpread({ inter_mat_ties: ties.filter((_, j) => j !== i) })}
            onFieldChange={(i, k, v) => { const n = [...ties]; n[i] = { ...n[i], [k]: v }; setSpread({ inter_mat_ties: n }); }}
          />
          <p className="text-[11px] text-gray-500">Tie paths are preliminary and fabrication-review gated.</p>
        </div>
      )}
    </div>
  );
}