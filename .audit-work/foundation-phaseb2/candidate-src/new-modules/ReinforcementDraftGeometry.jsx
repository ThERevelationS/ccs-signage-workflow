import ReinforcementDraftField from "./ReinforcementDraftField";
import ReinforcementDraftList, { newRowId } from "./ReinforcementDraftList";

const SUPPORT_MODES = [
  { id: "unconfigured", label: "Unconfigured" },
  { id: "off", label: "Off" },
];

const asObj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

export default function ReinforcementDraftGeometry({ draft, item, disabled, onChange }) {
  const design = asObj(draft?.design);
  if (!design) {
    return <div className="rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[12px] text-amber-800">Design draft malformed; repair required.</div>;
  }
  const isPillar = item?.foundation_type === "pillar";
  const cover = asObj(design.cover_inches) ?? {};
  const supports = asObj(design.supports) ?? { mode: "unconfigured", reason: "" };
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
    { key: "supports", value: design.supports, initial: { mode: "unconfigured", reason: "" } },
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
