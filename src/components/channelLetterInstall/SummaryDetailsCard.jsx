import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ListChecks, Type, HardHat, Users, MapPin, Wrench, Package, Calculator, Clock
} from "lucide-react";

const fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;
const num = (v) => parseFloat(v) || 0;

const Section = ({ icon: Icon, title, subtitle, color = "purple", children }) => (
  <Card className="bg-white border-0 shadow-sm">
    <CardHeader className="pb-2 border-b border-slate-100">
      <CardTitle className={`text-base flex items-center gap-2 text-slate-900`}>
        {Icon && <Icon className={`w-4 h-4 text-${color}-600`} />}
        {title}
      </CardTitle>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </CardHeader>
    <CardContent className="p-0">{children}</CardContent>
  </Card>
);

const Th = ({ children, align = "left" }) => (
  <th className={`px-3 py-1.5 text-${align} font-medium text-slate-600 text-xs`}>{children}</th>
);
const Td = ({ children, align = "left", className = "" }) => (
  <td className={`px-3 py-1.5 text-${align} ${className}`}>{children}</td>
);

/**
 * Comprehensive estimate breakdown for the Summary tab.
 * Renders every cost line that contributes to the subtotal so the
 * estimator can audit the number end-to-end.
 */
export default function SummaryDetailsCard({ project }) {
  const items = project.items || [];
  const purchases = project.letter_purchases || [];
  const equipment = project.selected_equipment || [];
  const personnel = project.personnel || [];

  // Letter purchase fees (already rolled into total_letters_cost)
  const lettersSubtotal = num(project.letters_subtotal);
  const fees = [
    { label: "Delivery Fee", v: num(project.letters_delivery_fee) },
    { label: "Design Fee", v: num(project.letters_design_fee) },
    { label: "Install Supplies Fee", v: num(project.letters_install_supplies_fee) },
    { label: "Permitting Fee", v: num(project.letters_permitting_fee) },
    { label: "Other Fee", v: num(project.letters_other_fee) },
  ].filter(f => f.v > 0);
  const lettersMarkupPct = num(project.letters_markup_percent);

  return (
    <div className="space-y-3">
      {/* ─────────── INSTALLATION LINE ITEMS ─────────── */}
      {items.length > 0 && (
        <Section icon={ListChecks} title="Installation Line Items" subtitle={`${items.length} item${items.length === 1 ? "" : "s"}`}>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th>#</Th>
                <Th>Description</Th>
                <Th>Type</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Size</Th>
                <Th align="right">Height</Th>
                <Th align="right">Hours</Th>
                <Th align="right">Labor</Th>
                <Th align="right">Materials</Th>
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <Td className="text-slate-500">{i + 1}</Td>
                  <Td className="font-medium">{it.description || `Item ${i + 1}`}</Td>
                  <Td className="text-xs text-slate-600 capitalize">{(it.installation_type || "").replace(/_/g, " ")}</Td>
                  <Td align="right" className="tabular-nums">{num(it.qty_letters)}</Td>
                  <Td align="right" className="text-xs text-slate-600 capitalize">{(it.letter_size || "").replace(/_/g, " ")}</Td>
                  <Td align="right" className="tabular-nums">{num(it.installation_height_feet)}ft</Td>
                  <Td align="right" className="tabular-nums">{num(it.labor_hours).toFixed(2)}</Td>
                  <Td align="right" className="tabular-nums">{fmt(it.labor_cost)}</Td>
                  <Td align="right" className="tabular-nums">{fmt(it.materials_cost)}</Td>
                  <Td align="right" className="tabular-nums font-semibold">{fmt(it.item_total_cost)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-sm">
              <tr>
                <td colSpan="6" className="px-3 py-2 text-right font-medium">Installation Subtotals</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{num(project.labor_hours).toFixed(2)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(project.labor_cost)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(project.total_materials_cost)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">
                  {fmt(num(project.labor_cost) + num(project.total_materials_cost))}
                </td>
              </tr>
            </tfoot>
          </table>
        </Section>
      )}

      {/* ─────────── LETTER PURCHASES ─────────── */}
      {purchases.length > 0 && (
        <Section icon={Type} title="Letter Purchases" subtitle={`${purchases.length} line${purchases.length === 1 ? "" : "s"}`} color="pink">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th>#</Th>
                <Th>Letter Type</Th>
                <Th>Description</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Size</Th>
                <Th align="right">Unit $</Th>
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p, i) => (
                <tr key={p.id || i} className="border-t border-slate-100">
                  <Td className="text-slate-500">{i + 1}</Td>
                  <Td className="text-xs capitalize">{(p.letter_type || "").replace(/_/g, " ")}</Td>
                  <Td className="text-xs text-slate-600">{p.description || "—"}</Td>
                  <Td align="right" className="tabular-nums">{num(p.qty)}</Td>
                  <Td align="right" className="tabular-nums">{num(p.size_value).toFixed(2)}</Td>
                  <Td align="right" className="tabular-nums">{fmt(p.unit_cost)}</Td>
                  <Td align="right" className="tabular-nums font-semibold">{fmt(p.total_cost)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t border-slate-200 text-xs">
              {fees.length > 0 && fees.map((f, i) => (
                <tr key={i}>
                  <td colSpan="6" className="px-3 py-1 text-right text-slate-600">{f.label}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{fmt(f.v)}</td>
                </tr>
              ))}
              {lettersMarkupPct > 0 && (
                <tr>
                  <td colSpan="6" className="px-3 py-1 text-right text-slate-600">Letters Markup ({lettersMarkupPct}%)</td>
                  <td className="px-3 py-1 text-right tabular-nums">
                    {fmt(num(project.total_letters_cost) - lettersSubtotal - fees.reduce((s, f) => s + f.v, 0))}
                  </td>
                </tr>
              )}
              <tr className="border-t-2 border-slate-200 text-sm">
                <td colSpan="6" className="px-3 py-2 text-right font-bold">Total Letters Cost</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">{fmt(project.total_letters_cost)}</td>
              </tr>
            </tfoot>
          </table>
        </Section>
      )}

      {/* ─────────── EQUIPMENT ─────────── */}
      {equipment.length > 0 && (
        <Section icon={HardHat} title="Equipment" subtitle={`${equipment.length} piece${equipment.length === 1 ? "" : "s"}`} color="amber">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th>Equipment</Th>
                <Th>Type</Th>
                <Th>Pricing</Th>
                <Th align="right">Duration</Th>
                <Th align="right">Unit $</Th>
                <Th align="right">Delivery</Th>
                <Th align="right">Idle</Th>
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {equipment.map((e, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <Td className="font-medium">{e.equipment_name}</Td>
                  <Td className="text-xs capitalize">{(e.equipment_type || "").replace(/_/g, " ")}</Td>
                  <Td className="text-xs capitalize">{(e.pricing_mode || "").replace(/_/g, " ")}</Td>
                  <Td align="right" className="tabular-nums">{num(e.duration)}</Td>
                  <Td align="right" className="tabular-nums">{fmt(e.unit_cost)}</Td>
                  <Td align="right" className="tabular-nums text-xs text-slate-500">
                    {e.include_delivery ? fmt(e.delivery_pickup_cost) : "—"}
                  </Td>
                  <Td align="right" className="tabular-nums text-xs">
                    {num(e.idle_cost) > 0 ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="w-3 h-3 text-amber-600" />
                        {fmt(e.idle_cost)}
                      </span>
                    ) : "—"}
                  </Td>
                  <Td align="right" className="tabular-nums font-semibold">{fmt(e.total_cost)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
              <tr>
                <td colSpan="7" className="px-3 py-2 text-right font-semibold">Total Equipment Cost</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">{fmt(project.total_equipment_cost)}</td>
              </tr>
            </tfoot>
          </table>
        </Section>
      )}

      {/* ─────────── PERSONNEL ─────────── */}
      {personnel.length > 0 && (
        <Section icon={Users} title="Personnel" subtitle={`${personnel.length} crew member${personnel.length === 1 ? "" : "s"}`} color="sky">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th align="right">Hours</Th>
                <Th align="right">Rate</Th>
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {personnel.map((p, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <Td className="font-medium">{p.name || <span className="text-slate-400 italic">Unnamed</span>}</Td>
                  <Td><Badge variant="outline" className="text-xs">{p.role || "Installer"}</Badge></Td>
                  <Td align="right" className="tabular-nums">{num(p.hours).toFixed(2)}</Td>
                  <Td align="right" className="tabular-nums">{fmt(p.hourly_rate)}</Td>
                  <Td align="right" className="tabular-nums font-semibold">{fmt(p.total_cost)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
              <tr>
                <td colSpan="4" className="px-3 py-2 text-right font-semibold">Total Personnel Cost</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">{fmt(project.total_personnel_cost)}</td>
              </tr>
            </tfoot>
          </table>
        </Section>
      )}

      {/* ─────────── TRAVEL ─────────── */}
      {num(project.total_travel_cost) > 0 && (
        <Section icon={MapPin} title="Travel & Fuel" subtitle="Round-trip from shop to job site" color="orange">
          <div className="p-4 text-sm grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-xs text-slate-500">Round-Trip Miles</div>
              <div className="font-semibold tabular-nums">{num(project.travel_miles_round_trip).toFixed(1)} mi</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Vehicles Counted</div>
              <div className="font-semibold tabular-nums">
                {equipment.filter(e => ["truck", "van", "flatbed", "car", "boom_truck"].includes(e.equipment_type)).length}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Crew Size</div>
              <div className="font-semibold tabular-nums">{personnel.length || 1}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Total Travel Cost</div>
              <div className="text-lg font-bold tabular-nums text-orange-700">{fmt(project.total_travel_cost)}</div>
            </div>
          </div>
        </Section>
      )}

      {/* ─────────── SUPPLIES ─────────── */}
      {num(project.total_supplies_cost) > 0 && (
        <Section icon={Package} title="Supplies" color="emerald">
          <div className="p-4 text-sm flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {num(project.supplies_percent_of_materials || 10).toFixed(0)}% of materials
              {num(project.extra_supplies_cost) > 0 && <> + {fmt(project.extra_supplies_cost)} extra</>}
            </div>
            <div className="font-semibold tabular-nums">{fmt(project.total_supplies_cost)}</div>
          </div>
        </Section>
      )}

      {/* ─────────── GRAND TOTAL ─────────── */}
      <Section icon={Calculator} title="Grand Total" color="purple">
        <div className="p-4 text-sm space-y-1">
          {project.labor_priced_via_personnel ? (
            <div className="flex justify-between">
              <span className="text-slate-600">
                Installation Labor{" "}
                <span className="text-xs text-slate-400">(priced via Personnel crew — not double-counted)</span>
              </span>
              <span className="tabular-nums text-slate-400 line-through">{fmt(project.labor_cost)}</span>
            </div>
          ) : (
            <Row label="Installation Labor" value={project.labor_cost} />
          )}
          <Row label="Installation Materials" value={project.total_materials_cost} />
          <Row label="Supplies" value={project.total_supplies_cost} hideIfZero />
          <Row label="Equipment" value={project.total_equipment_cost} hideIfZero />
          <Row label="Personnel" value={project.total_personnel_cost} hideIfZero />
          <Row label="Travel & Fuel" value={project.total_travel_cost} hideIfZero />
          <Row label="Letter Purchases" value={project.total_letters_cost} hideIfZero />
          <div className="flex justify-between pt-2 border-t border-slate-200 text-base">
            <span className="font-semibold text-slate-900">Subtotal (Before Markup)</span>
            <span className="font-bold tabular-nums">{fmt(project.subtotal)}</span>
          </div>
          {num(project.markup_amount) > 0 && (
            <Row label={`Project Markup (${num(project.markup_percent).toFixed(0)}%)`} value={project.markup_amount} />
          )}
          <div className="flex justify-between pt-2 border-t-2 border-slate-300 text-lg">
            <span className="font-bold text-slate-900">Total Cost</span>
            <span className="font-bold tabular-nums text-purple-700">{fmt(project.total_cost)}</span>
          </div>
          <p className="text-[11px] text-slate-400 pt-1">
            See <span className="font-semibold">Customer Pricing</span> tab for tier-based sell prices.
          </p>
        </div>
      </Section>
    </div>
  );
}

const Row = ({ label, value, hideIfZero }) => {
  const v = num(value);
  if (hideIfZero && v === 0) return null;
  return (
    <div className="flex justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="tabular-nums">{fmt(v)}</span>
    </div>
  );
};