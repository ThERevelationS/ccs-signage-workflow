// P-05/P-06 UI consumer: per-item set takeoff + validation on the Summary
// tab. Maps real install-item fields into the takeoff model (installation
// type implies illumination/fabrication per the documented type labels);
// specs the schema can't supply surface as unresolved rows + named issues —
// never invented quantities.
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Package } from "lucide-react";
import { channelSetTakeoff } from "./channelSetTakeoff.js";
import { validateChannelSet } from "./channelValidationModel.js";

// install type -> takeoff spec hints (matches LETTER_TYPE_LABELS semantics).
const specForItem = (it) => ({
  letter_count: it.qty_letters,
  letter_height_inches: it.letter_height_inches,
  installation_type: it.installation_type,
  fabrication: it.installation_type === "dimensional_lettering" ? "fabricated" : "purchased",
  illumination: it.installation_type === "halo_lit" ? "halo_lit" : "unlit",
  raceway_length_feet: it.raceway_length_feet > 0 ? it.raceway_length_feet : null,
  raceway: it.installation_type === "raceway" || it.raceway_length_feet > 0,
  backer_panel: it.installation_type === "backer",
  install_height_feet: it.installation_height_feet,
  wall_material: it.wall_material,
  electrical_scope: it.installation_type === "halo_lit" ? null : null, // never assumed
});

export default function ChannelTakeoffCard({ project, inventory = [], equipmentInventory = [] }) {
  const items = project?.items || [];
  const equipment = project?.selected_equipment || [];

  const perItem = useMemo(() => items.map((it, i) => {
    const spec = specForItem(it);
    const takeoff = channelSetTakeoff(spec, {});
    const validation = validateChannelSet(spec, takeoff, {
      materials: inventory,
      equipment: equipment.length ? equipment : equipmentInventory,
    });
    return { index: i + 1, item: it, takeoff, validation };
  }), [items, inventory, equipment, equipmentInventory]);

  if (!items.length) return null;
  const blocking = perItem.reduce((n, p) => n + p.validation.blocking_count, 0);
  const unresolved = perItem.reduce((n, p) => n + p.takeoff.rows.filter((r) => r.qty === null).length, 0);

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Package className="w-5 h-5 text-indigo-600" /> Set Takeoff &amp; Validation
          {blocking > 0 && <Badge variant="destructive">{blocking} blocking</Badge>}
          {unresolved > 0 && <Badge variant="outline" className="text-amber-700 border-amber-300">{unresolved} unresolved qty</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {perItem.map(({ index, item, takeoff, validation }) => (
          <div key={index} className="border border-slate-100 rounded-lg p-3 space-y-2">
            <p className="font-medium text-slate-700">Item #{index} — {item.description || item.installation_type}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1">
              {takeoff.rows.map((r, j) => (
                <div key={j} className="flex justify-between gap-2">
                  <span className="text-slate-600 truncate">{r.item}</span>
                  <span className={r.qty === null ? "text-amber-700 font-medium" : "text-slate-800"}>
                    {r.qty === null ? "unresolved" : `${r.qty} ${r.unit}`}{r.source === "estimated" ? "*" : ""}
                  </span>
                </div>
              ))}
            </div>
            {validation.issues.length > 0 && (
              <div className="space-y-1 pt-1">
                {validation.issues.map((i, j) => (
                  <p key={j} className={`flex items-start gap-1.5 text-xs ${i.severity === "blocking" ? "text-red-700" : i.severity === "warning" ? "text-amber-700" : "text-slate-500"}`}>
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{i.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
        <p className="text-[11px] text-slate-400">* estimated quantity (no authored value — verify before ordering). Unresolved rows need product data the catalog doesn't carry yet.</p>
      </CardContent>
    </Card>
  );
}
