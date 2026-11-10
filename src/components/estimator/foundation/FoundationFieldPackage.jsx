import { money } from "./foundationCalc";
import { landscapeSummary, isVisualCellKey, visualObjectByKey } from "./landscapeMaterials";
import { foundationSceneDiagnostics } from "./foundationSceneDiagnostics";
import { wallCapCutLengthValue } from "./wallCapCalculator";

// O-100 (CMP-H09) -- exportable field/production package. A print-friendly
// read-only sheet composing the data the estimate already computes: item
// geometry, wall runs + cap cuts, poles, cabinets, delivery, BOM totals,
// landscape materials, and any unresolved engineering flags. Everything is
// labeled; nothing here re-derives pricing or invents missing values.

const Th = ({ children }) => <th className="pr-3 py-0.5 text-left text-[10px] uppercase tracking-wide text-gray-400 font-medium">{children}</th>;
const Td = ({ children, mono }) => <td className={`pr-3 py-0.5 text-[11px] text-gray-800 ${mono ? "tabular-nums" : ""}`}>{children}</td>;
const dim = (v, unit = "in") => (Number.isFinite(Number(v)) && Number(v) !== 0 ? `${Number(v)}${unit === "in" ? '"' : ` ${unit}`}` : "-");
const qty = (v, unit) => (Number.isFinite(Number(v)) && Number(v) > 0 ? `${v} ${unit}` : "-");

function Section({ title, children }) {
  return (
    <div className="mb-3 break-inside-avoid">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500 border-b border-gray-200 pb-0.5 mb-1.5">{title}</h4>
      {children}
    </div>
  );
}

export default function FoundationFieldPackage({ project, calc, revision = null, pricingUnavailable = false }) {
  const items = calc?.items || [];
  const poles = calc?.poles || [];
  const walls = calc?.walls || [];
  const caps = project?.wall_caps || [];
  const cabinets = project?.signage_cabinets || [];
  const delivery = calc?.delivery || {};
  const totals = calc?.totals || {};
  const land = landscapeSummary(project?.landscape);
  // Design notes: the same scene diagnostics the canvas reports, surfaced
  // on the production sheet so unresolved flags travel to the field.
  const diags = foundationSceneDiagnostics({
    items: calc?.items || [],
    poles: calc?.poles || [],
    walls: calc?.walls || [],
    wall_caps: calc?.wallCaps || [],
    signage_cabinets: project?.signage_cabinets || [],
  }) || [];
  const flags = [];
  if (pricingUnavailable) flags.push("Customer pricing is blocked - resolve highlighted inputs before production.");
  if (project?.engineering_approved === false) flags.push("Preliminary estimate - structural engineering review required before construction.");
  (calc?.issueBanner || []).forEach((m) => flags.push(m));
  items.forEach((it, i) => {
    if (it?.reinforcement_calculation_version === 2 && it?.reinforcement_design == null) {
      flags.push(`Foundation ${i + 1}: version-2 reinforcement has no authored design recorded.`);
    }
  });

  return (
    <div className="rounded-sm border border-gray-200 bg-white p-4 text-gray-900" data-field-package="true">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-[14px] font-bold">Field / Production Package</h3>
          <p className="text-[11px] text-gray-500">
            {project?.project_name || "Foundation project"}
            {revision ? ` - saved revision ${revision}` : " - unsaved working copy"}
            {" - generated "}{new Date().toLocaleString()}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="h-[26px] px-2.5 rounded-sm border border-gray-300 text-[11px] font-medium text-gray-700 hover:bg-gray-50 print:hidden"
        >
          Print
        </button>
      </div>

      {flags.length > 0 && (
        <div className="mb-3 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-1">Unresolved flags</div>
          <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-amber-800">
            {[...new Set(flags)].slice(0, 12).map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}

      <Section title={`Foundations (${items.length})`}>
        <table className="w-full">
          <thead><tr><Th>Item</Th><Th>Type</Th><Th>L x W / Dia</Th><Th>Depth</Th><Th>Qty</Th><Th>Grade off.</Th><Th>Rot</Th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.component_id || i} className="border-t border-gray-100">
                <Td>{it.description || `Foundation ${i + 1}`}</Td>
                <Td>{it.foundation_type || "spread"}</Td>
                <Td mono>{it.foundation_type === "pillar" ? dim(it.diameter) : `${dim(it.length_inches)} x ${dim(it.width_inches)}`}</Td>
                <Td mono>{dim(it.depth_inches)}</Td>
                <Td mono>{it.quantity ?? 1}</Td>
                <Td mono>{dim(it.grade_offset_inches)}</Td>
                <Td mono>{dim(it.rotation_degrees, "deg")}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {walls.length > 0 && (
        <Section title={`Walls (${walls.length})`}>
          <table className="w-full">
            <thead><tr><Th>Wall</Th><Th>Height</Th><Th>Segments</Th><Th>Perimeter</Th><Th>Fill wall</Th></tr></thead>
            <tbody>
              {walls.map((w, i) => {
                const segs = w?.shape?.segments || [];
                const per = segs.reduce((s, sg) => s + (Number(sg?.length) || 0), 0);
                return (
                  <tr key={w.component_id || i} className="border-t border-gray-100">
                    <Td>{w.name || `Wall ${i + 1}`}</Td>
                    <Td mono>{dim(w.heightInches)}</Td>
                    <Td mono>{segs.length}</Td>
                    <Td mono>{per > 0 ? `${Math.round(per)}"` : "-"}</Td>
                    <Td>{w.includeInternalWall ? "yes" : "no"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {caps.length > 0 && (
        <Section title={`Wall caps (${caps.length})`}>
          <table className="w-full">
            <thead><tr><Th>Cap</Th><Th>Cut</Th><Th>Stock</Th><Th>Position</Th><Th>Cost</Th></tr></thead>
            <tbody>
              {caps.map((c, i) => (
                <tr key={c.component_id || c.id || i} className="border-t border-gray-100">
                  <Td>{c.cap_name || `Cap ${i + 1}`}</Td>
                  <Td mono>{dim(wallCapCutLengthValue(c))}</Td>
                  <Td mono>{dim(c.stock_length_inches)}</Td>
                  <Td mono>{dim(c.position_along_segment_inches)}</Td>
                  <Td mono>{money(c.cost)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {poles.length > 0 && (
        <Section title={`Poles (${poles.length})`}>
          <table className="w-full">
            <thead><tr><Th>Pole</Th><Th>Height</Th><Th>Embed</Th><Th>Shape</Th><Th>Plan (x, z)</Th><Th>Signs</Th></tr></thead>
            <tbody>
              {poles.map((p, i) => {
                const signs = p.signs || [];
                const costs = signs.map((s) => Number(s?.unit_cost));
                const all = signs.length > 0 && costs.every((c) => Number.isFinite(c) && c >= 0);
                return (
                  <tr key={p.component_id || i} className="border-t border-gray-100">
                    <Td>{`Pole ${i + 1}`}</Td>
                    <Td mono>{dim(p.height_inches)}</Td>
                    <Td mono>{dim(p.embedment_inches ?? p.y_offset_inches)}</Td>
                    <Td>{p.pole_shape || "round"}</Td>
                    <Td mono>{`${dim(p.x_inches)}, ${dim(p.z_inches)}`}</Td>
                    <Td mono>{signs.length === 0 ? "-" : `${signs.length}${all ? ` - ${money(costs.reduce((a, b) => a + b, 0))}` : ""}`}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {cabinets.length > 0 && (
        <Section title={`Signage cabinets (${cabinets.length})`}>
          <table className="w-full">
            <thead><tr><Th>Cabinet</Th><Th>W x H x D</Th><Th>Mount</Th><Th>Mount height</Th></tr></thead>
            <tbody>
              {cabinets.map((c, i) => (
                <tr key={c.component_id || c.id || i} className="border-t border-gray-100">
                  <Td>{`Cabinet ${i + 1}`}</Td>
                  <Td mono>{`${dim(c.width_inches)} x ${dim(c.height_inches)} x ${dim(c.depth_inches)}`}</Td>
                  <Td>{c.mount || "-"}</Td>
                  <Td mono>{dim(c.mount_height_inches)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="Delivery + totals">
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[11px]">
          {Number.isFinite(delivery?.roundedYards) && delivery.roundedYards > 0 && (
            <div className="flex justify-between"><span className="text-gray-500">Ready-mix delivery</span><span className="tabular-nums">{delivery.roundedYards} CY</span></div>
          )}
          {Number.isFinite(totals.grand_total) && (
            <div className="flex justify-between"><span className="text-gray-500">Section total</span><span className="tabular-nums font-semibold">{money(totals.grand_total)}</span></div>
          )}
        </div>
      </Section>

      {land.lines.length > 0 && (
        <Section title="Landscape materials">
          <table className="w-full">
            <thead><tr><Th>Material</Th><Th>Coverage</Th><Th>Cost</Th></tr></thead>
            <tbody>
              {land.lines.map((l) => (
                <tr key={l.key} className="border-t border-gray-100">
                  <Td>{l.label}</Td>
                  <Td mono>{l.sqft.toFixed(0)} sq ft</Td>
                  <Td mono>{money(l.cost)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          {(() => {
            const counts = {};
            Object.values(project?.landscape?.cells || {}).forEach((key) => {
              const obj = isVisualCellKey(key) ? visualObjectByKey(key) : null;
              if (obj) counts[obj.label] = (counts[obj.label] || 0) + 1;
            });
            const labels = Object.entries(counts).map(([l, c]) => `${c} ${l.toLowerCase()}${c === 1 ? "" : "s"}`);
            return labels.length ? (
              <p className="mt-2 text-[11px] text-gray-500">Decorative objects (not billed): {labels.join(", ")}</p>
            ) : null;
          })()}
        </Section>
      )}

      <Section title={`Design notes (${diags.length})`}>
        {diags.length === 0 ? (
          <p className="text-[11px] text-gray-500">No unresolved scene flags.</p>
        ) : (
          <ul className="space-y-1">
            {diags.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px]">
                <span className={`font-semibold uppercase text-[10px] mt-px ${d.severity === "error" ? "text-red-600" : d.severity === "warning" ? "text-amber-600" : "text-gray-500"}`}>{d.severity}</span>
                <span className="text-gray-700">{d.message}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] text-gray-400">Preliminary estimating only - final engineering review required before fabrication or construction.</p>
      </Section>
    </div>
  );
}
