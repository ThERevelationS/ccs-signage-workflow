import { money } from "./foundationCalc";
import { PreliminaryNotice } from "./foundationPreliminaryNotice";
import { landscapeSummary, isVisualCellKey, visualObjectByKey } from "./landscapeMaterials";
import { foundationSceneDiagnostics } from "./foundationSceneDiagnostics";
import { buildFoundationPlanSvg, buildFoundationElevationSvg } from "./foundationPlanExport";
import { foundationSourceAuthorityClass, foundationSourceClassLabel } from "./foundationRuleRegistry";
import { revisionSnapshotDiff } from "./foundationRevisionDiff";
import { wallCapCutLengthValue } from "./wallCapCalculator";

// O-100 (CMP-H09) -- exportable field/production package. A print-friendly
// read-only sheet composing the data the estimate already computes: item
// geometry, wall runs + cap cuts, poles, cabinets, delivery, BOM totals,
// landscape materials, and any unresolved engineering flags. Everything is
// labeled; nothing here re-derives pricing or invents missing values.

const Th = ({ children }) => <th className="pr-3 py-0.5 text-left text-[10px] uppercase tracking-wide text-gray-500 font-medium">{children}</th>;
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
  const scene = {
    items: calc?.items || [],
    poles: calc?.poles || [],
    walls: calc?.walls || [],
    wall_caps: calc?.wallCaps || [],
    signage_cabinets: project?.signage_cabinets || [],
  };
  const diags = foundationSceneDiagnostics(scene) || [];
  const planSvg = buildFoundationPlanSvg(scene, { width: 480, depth: 320 });
  const elevSvg = buildFoundationElevationSvg(scene, { width: 480, height: 240 });
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
          {/* O-100 (CMP-H09) -- multi-revision history header: the saved
              revision trail the O-099 pair-compare enumerates. */}
          {Array.isArray(project?.revision_history) && project.revision_history.length > 0 && (
            <p className="text-[9px] text-gray-400">
              Prior revisions: {project.revision_history.slice(-5).map(r => r.updated_date).join(", ")}
            </p>
          )}
          {/* O-099 (CMP-H08) -- revision-pair compare UI: a "Compare" control
              on the revision-history surface renders `revisionSnapshotDiff`
              between the two most-recent stored revisions -- the pair-compare
              consumer the snapshot enables. */}
          {Array.isArray(project?.revision_history) && project.revision_history.length >= 2 && (
            <details className="text-[9px] text-gray-500">
              <summary className="cursor-pointer hover:text-gray-700">Compare revisions</summary>
              <ul className="mt-0.5 list-disc pl-4">
                {revisionSnapshotDiff(
                  project.revision_history[project.revision_history.length - 2],
                  project.revision_history[project.revision_history.length - 1]
                ).map((r, i) => (
                  <li key={i}>{r.label}: {r.detail}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="h-[26px] px-2.5 rounded-sm border border-gray-300 text-[11px] font-medium text-gray-700 hover:bg-gray-50 print:hidden"
        >
          Print
        </button>
      </div>

      {/* O-119 (CMP-I18) -- preliminary notice on the handoff export: the
          field package carries "Preliminary estimating only - final
          engineering required" like every other structural concept surface. */}
      <PreliminaryNotice />
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
          <thead><tr><Th>Item</Th><Th>Type</Th><Th>L x W / Dia</Th><Th>Depth</Th><Th>Qty</Th><Th>Grade off.</Th><Th>Rot</Th><Th>Supports</Th></tr></thead>
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
                {/* O-031 (CMP-B17) -- the rebar-supports part surfaced on the
                    field doc: the BOM's `foundation:item:<i>:rebar-supports`
                    amount travels to the field as a supports cost; blank =
                    unresolved/off_explained. */}
                <Td mono>{(() => {
                  const sc = it?.reinforcement_cost_snapshot?.amounts?.supports_cost ?? it?.basis?.supports_cost;
                  return Number.isFinite(sc) && sc > 0 ? `$${sc.toFixed(2)}` : "-";
                })()}</Td>
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
            <thead><tr><Th>Cap</Th><Th>Cut</Th><Th>Stock</Th><Th>Position</Th><Th>Supplies</Th><Th>Cut labor</Th><Th>Cost</Th></tr></thead>
            <tbody>
              {caps.map((c, i) => (
                <tr key={c.component_id || c.id || i} className="border-t border-gray-100">
                  <Td>{c.cap_name || `Cap ${i + 1}`}</Td>
                  <Td mono>{dim(wallCapCutLengthValue(c))}</Td>
                  <Td mono>{dim(c.stock_length_inches)}</Td>
                  <Td mono>{dim(c.position_along_segment_inches)}</Td>
                  {/* O-055 (CMP-D12) -- production detail: the cap's authored
                      supplies/cut-labor extras (the install supplies + cuts
                      the production crew needs); "not recorded" when blank. */}
                  <Td mono>{money(c.supplies_cost)}</Td>
                  <Td mono>{money(c.cut_labor_cost)}</Td>
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

      {/* O-100 (CMP-H09) -- equipment + installation notes: the authored
          equipment/installation fields the field crew reads; "not recorded"
          when blank (never an invented note). */}
      <Section title="Equipment + installation">
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[11px]">
          <div className="flex justify-between"><span className="text-gray-500">Equipment</span><span className="tabular-nums">{project?.equipment ?? "not recorded"}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Installation notes</span><span className="tabular-nums">{project?.installation_notes ?? "not recorded"}</span></div>
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

      {(calc?.equipment || []).length > 0 && (
        <Section title={`Equipment & installation (${(calc.equipment || []).length})`}>
          <table className="w-full">
            <thead><tr><Th>Equipment</Th><Th>Duration</Th><Th>Rate</Th><Th>Delivery</Th><Th>Attachments</Th></tr></thead>
            <tbody>
              {(calc.equipment || []).map((e, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <Td>{e?.equipment?.name || `Equipment ${i + 1}`}</Td>
                  <Td mono>{Number.isFinite(e?.duration) ? `${e.duration} ${e.rentalPeriod || "day"}${e.duration === 1 ? "" : "s"}` : "-"}</Td>
                  <Td mono>{Number.isFinite(e?.rate) ? money(e.rate) : "Not saved"}</Td>
                  <Td mono>{Number.isFinite(e?.deliveryCharge) ? money(e.deliveryCharge) : "-"}</Td>
                  <Td mono>{(e?.attachmentLines?.length || 0) + (e?.subAttachmentLines?.length || 0) || "-"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="Plan view">
        <div className="rounded-sm border border-gray-200 bg-gray-50 p-1" dangerouslySetInnerHTML={{ __html: planSvg }} />
      </Section>

      {/* O-100 (CMP-H09) -- elevation embed: the elevation SVG renders
          alongside the plan -- the field doc's image embeds carry the
          accepted revision's plan AND elevation, not just the plan. */}
      <Section title="Elevation">
        <div className="rounded-sm border border-gray-200 bg-gray-50 p-1" dangerouslySetInnerHTML={{ __html: elevSvg }} />
      </Section>

      {/* O-118 (CMP-I17) -- design-basis summary: the project's authored
          design-basis fields travel to the field/engineer handoff; blank =
          "not recorded" (never an invented basis). */}
      <Section title="Design basis">
        {(() => {
          const db = project?.design_basis || {};
          const rows = [
            ["Code edition", db.code_edition],
            ["Jurisdiction", db.jurisdiction],
            ["Basis source", db.basis_source],
            // O-103 (CMP-I02) -- citation-class display: when `basis_source`
            // names a register id (CMP-SUP-*), the source's authority class
            // surfaces alongside (a shop assumption never reads as adopted code).
            ["Basis source class", typeof db.basis_source === "string" && db.basis_source ? (() => {
              try {
                const cls = foundationSourceAuthorityClass(db.basis_source.trim());
                return cls ? foundationSourceClassLabel(cls) : null;
              } catch { return null; }
            })() : null],
            // O-109 (CMP-I08) -- soil/groundwater/frost/wind assumption fields:
            // authored site assumptions travel to the field; blank = "not
            // recorded" (never an invented geotech number).
            ["Soil", db.soil],
            ["Frost depth", db.frost_depth],
            ["Groundwater", db.groundwater],
            ["Wind", db.wind],
            // O-110 (CMP-I09) -- concrete/rebar/cover/durability fields:
            // authored material assumptions travel to the field alongside the
            // soil/frost/wind rows; blank = "not recorded".
            ["Concrete", db.concrete],
            ["Rebar", db.rebar],
            ["Cover", db.cover],
            ["Durability", db.durability],
            // O-112 (CMP-I11) -- masonry/cap/coping fields: authored masonry
            // assumptions travel to the field alongside the material rows;
            // blank = "not recorded".
            ["Masonry", db.masonry],
            ["Cap material", db.cap_material],
            ["Coping", db.coping],
            // O-106/O-107/O-108 (CMP-I05/I06/I07) -- structural-method fields:
            // authored sign-wind/footing/shaft basis travel to the field
            // alongside the material rows; blank = "not recorded".
            ["Sign wind", db.sign_wind],
            ["Footing basis", db.footing_basis],
            ["Shaft basis", db.shaft_basis],
            // O-111 (CMP-I10) -- pillar-bar/base-plate fields: authored
            // pillar/base-plate basis travels to the field alongside the
            // method rows; blank = "not recorded".
            ["Pillar bar", db.pillar_bar],
            ["Base plate", db.base_plate],
            ["Basis locked", db.basis_locked === true ? "Yes" : db.basis_locked === false ? "No" : null],
            // O-118 (CMP-I17) -- site/signs-loads/geometry/open-questions +
            // quantity/cost-revision fields: the remaining design-basis rows
            // travel to the field/engineer handoff; blank = "not recorded".
            ["Site", db.site],
            ["Signs/loads", db.signs_loads],
            ["Geometry", db.geometry],
            ["Open questions", db.open_questions],
            ["Qty/cost revision", db.quantity_cost_revision],
            // O-118 (CMP-I17) -- policy-sensitivity note: the design's
            // sensitivity to the named uncertain input travels to the field/
            // engineer handoff; blank = "not recorded".
            ["Policy sensitivity", db.policy_sensitivity],
            ["Notes", db.basis_notes],
          ].filter(([, v]) => v != null && v !== "");
          return rows.length === 0 ? (
            <p className="text-[11px] text-gray-500">No design basis recorded.</p>
          ) : (
            <dl className="space-y-1 text-[11px]">
              {rows.map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="w-28 shrink-0 font-medium text-gray-600">{label}</dt>
                  <dd className="text-gray-800">{String(value)}</dd>
                </div>
              ))}
            </dl>
          );
        })()}
      </Section>
      <Section title={`Design notes (${diags.length})`}>
        {diags.length === 0 ? (
          <p className="text-[11px] text-gray-500" role="status">No unresolved scene flags.</p>
        ) : (
          <ul className="space-y-1" role="list" aria-label="Design notes findings">
            {diags.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px]" role="listitem" tabIndex={0}
                aria-label={`${d.severity}: ${d.message}${d.issue_fix_hint ? ` — ${d.issue_fix_hint}` : ""}`}>
                <span className={`font-semibold uppercase text-[10px] mt-px ${d.severity === "error" ? "text-red-600" : d.severity === "warning" ? "text-amber-600" : "text-gray-500"}`} aria-hidden="true">{d.severity}</span>
                <span className="text-gray-700">{d.message}{d.issue_fix_hint ? ` — ${d.issue_fix_hint}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] text-gray-500">Preliminary estimating only - final engineering review required before fabrication or construction.</p>
      </Section>
    </div>
  );
}
