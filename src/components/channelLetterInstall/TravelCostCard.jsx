import React, { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Fuel, RefreshCw, AlertCircle } from "lucide-react";
import { calculateTravelMiles } from "@/functions/calculateTravelMiles";

const fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;

/**
 * Travel cost line on the Crew tab.
 * - Shop address comes from Settings (install_shop_address)
 * - Site address comes from the project
 * - User clicks "Calculate Miles" → backend LLM returns round-trip miles
 * - For each OWNED vehicle in selected_equipment, computes: miles / mpg × fuel_price
 * - Adds travel labor (round-trip time × travel_labor_rate × personnel count) and per-mile overhead
 */
export default function TravelCostCard({
  shopAddress,
  siteAddress,
  selectedEquipment = [],
  equipmentInventory = [],
  personnel = [],
  settings = {},
  travelMiles = 0,
  onMilesChange,
  onTotalChange,
  autoTriggerKey, // changing this value causes a re-calc (used when the Crew tab is entered)
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Tracks the last shop/site pair we auto-calculated for, to avoid loops.
  const [lastAutoKey, setLastAutoKey] = useState(null);

  const gasPrice = parseFloat(settings.install_gasoline_price_per_gallon) || 3.5;
  const dieselPrice = parseFloat(settings.install_diesel_price_per_gallon) || 4.0;
  const travelLaborRate = parseFloat(settings.install_travel_labor_rate) || 45;
  const avgSpeed = parseFloat(settings.install_travel_avg_speed_mph) || 45;
  const overheadPerMile = parseFloat(settings.install_travel_overhead_per_mile) || 0;
  const minCharge = parseFloat(settings.install_min_travel_charge) || 0;

  // Resolve OWNED vehicles from selected_equipment by looking up the inventory record
  const ownedVehicles = useMemo(() => {
    const VEHICLE_TYPES = new Set(["truck", "van", "flatbed", "car", "boom_truck"]);
    return selectedEquipment
      .map(se => {
        const inv = equipmentInventory.find(i => i.id === se.equipment_id);
        if (!inv) return null;
        if (inv.ownership !== "owned") return null;
        if (!VEHICLE_TYPES.has(inv.equipment_type)) return null;
        const mpg = parseFloat(inv.mpg);
        if (!mpg || mpg <= 0) return null;
        return {
          equipment_id: inv.id,
          name: inv.equipment_name,
          mpg,
          fuel_type: inv.fuel_type === "diesel" ? "diesel" : "gasoline",
        };
      })
      .filter(Boolean);
  }, [selectedEquipment, equipmentInventory]);

  const miles = parseFloat(travelMiles) || 0;
  const personnelCount = Math.max(1, (personnel || []).length);

  // Per-vehicle fuel cost (each vehicle drives the full distance)
  const vehicleLines = ownedVehicles.map(v => {
    const gallons = miles / v.mpg;
    const pricePerGal = v.fuel_type === "diesel" ? dieselPrice : gasPrice;
    const fuelCost = gallons * pricePerGal;
    return { ...v, gallons, pricePerGal, fuelCost };
  });

  const totalFuelCost = vehicleLines.reduce((s, v) => s + v.fuelCost, 0);
  // Travel time: round-trip miles ÷ avg speed = hours per person; × crew size
  const travelHoursPerPerson = avgSpeed > 0 ? miles / avgSpeed : 0;
  const totalTravelLaborCost = travelHoursPerPerson * personnelCount * travelLaborRate;
  const overheadCost = miles * overheadPerMile;

  const subtotal = totalFuelCost + totalTravelLaborCost + overheadCost;
  const totalTravelCost = miles > 0 ? Math.max(subtotal, minCharge) : 0;

  // Push the computed total back up to the project so it's included in the rollup.
  useEffect(() => {
    if (typeof onTotalChange === "function") {
      onTotalChange(totalTravelCost);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalTravelCost]);

  const handleCalculate = async () => {
    if (!shopAddress?.trim() || !siteAddress?.trim()) {
      setError("Shop address (in Settings) and Site Address (on Project tab) are both required.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await calculateTravelMiles({ shop_address: shopAddress, site_address: siteAddress });
      const rt = parseFloat(res?.data?.round_trip_miles);
      if (!isFinite(rt) || rt <= 0) {
        setError(res?.data?.error || "Could not estimate distance for those addresses.");
      } else {
        onMilesChange?.(rt);
      }
    } catch (e) {
      setError(e.message || "Travel calculation failed.");
    }
    setLoading(false);
  };

  // Auto-calculate when the Crew tab is entered (autoTriggerKey changes),
  // as long as we have addresses and haven't already calculated this exact pair.
  useEffect(() => {
    if (autoTriggerKey == null) return;
    const key = `${shopAddress || ""}|${siteAddress || ""}`;
    if (!shopAddress?.trim() || !siteAddress?.trim()) return;
    if (lastAutoKey === key) return;
    // Skip if we already have miles for this pair (e.g. loaded from saved project)
    if ((parseFloat(travelMiles) || 0) > 0 && lastAutoKey === null) {
      setLastAutoKey(key);
      return;
    }
    setLastAutoKey(key);
    handleCalculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTriggerKey, shopAddress, siteAddress]);

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="w-5 h-5 text-purple-600" />
          Travel & Fuel
        </CardTitle>
        <p className="text-xs text-slate-500 mt-1">
          Round-trip travel from shop → site. Fuel is summed per OWNED vehicle (each drives the full distance).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Address summary + miles control */}
        <div className="grid md:grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-slate-500 mb-0.5">Shop (from Settings)</div>
            <div className="font-medium text-slate-800 truncate" title={shopAddress}>
              {shopAddress || <span className="text-red-500">Not set</span>}
            </div>
          </div>
          <div>
            <div className="text-slate-500 mb-0.5">Site Address</div>
            <div className="font-medium text-slate-800 truncate" title={siteAddress}>
              {siteAddress || <span className="text-amber-600">Not set on Project tab</span>}
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-500">Round-Trip Miles</Label>
            <div className="flex gap-2 mt-0.5">
              <Input
                type="number"
                step="0.1"
                value={miles}
                onFocus={(e) => e.target.select()}
                onChange={(e) => onMilesChange?.(parseFloat(e.target.value) || 0)}
                className="h-8 text-sm tabular-nums"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleCalculate}
                disabled={loading || !shopAddress || !siteAddress}
                className="h-8 text-xs whitespace-nowrap"
                title="Auto-estimate using AI/web"
              >
                {loading ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <><RefreshCw className="w-3 h-3 mr-1" /> Auto</>
                )}
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Vehicle breakdown */}
        {miles > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            {vehicleLines.length === 0 ? (
              <div className="p-3 text-xs text-slate-500 bg-slate-50">
                No OWNED vehicles selected with an MPG value. Add a truck/van in Equipment Inventory (ownership = owned, mpg &gt; 0) and select it on this estimate.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-medium">Vehicle</th>
                    <th className="text-right px-3 py-1.5 font-medium">MPG</th>
                    <th className="text-right px-3 py-1.5 font-medium">Gallons</th>
                    <th className="text-right px-3 py-1.5 font-medium">$/gal</th>
                    <th className="text-right px-3 py-1.5 font-medium">Fuel Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicleLines.map((v, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 flex items-center gap-1">
                        <Fuel className={`w-3 h-3 ${v.fuel_type === "diesel" ? "text-amber-600" : "text-emerald-600"}`} />
                        <span>{v.name}</span>
                        <span className="text-[10px] text-slate-400 uppercase">({v.fuel_type})</span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{v.mpg.toFixed(1)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{v.gallons.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">${v.pricePerGal.toFixed(3)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmt(v.fuelCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Rollup */}
        {miles > 0 && (
          <div className="space-y-1 pt-1 border-t border-slate-200 text-sm">
            <div className="flex justify-between text-xs text-slate-600">
              <span>Fuel ({vehicleLines.length} vehicle{vehicleLines.length === 1 ? "" : "s"})</span>
              <span className="tabular-nums">{fmt(totalFuelCost)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-600">
              <span>Travel Labor ({travelHoursPerPerson.toFixed(2)} hr × {personnelCount} ppl × ${travelLaborRate}/hr)</span>
              <span className="tabular-nums">{fmt(totalTravelLaborCost)}</span>
            </div>
            {overheadPerMile > 0 && (
              <div className="flex justify-between text-xs text-slate-600">
                <span>Vehicle Overhead ({miles.toFixed(1)} mi × ${overheadPerMile}/mi)</span>
                <span className="tabular-nums">{fmt(overheadCost)}</span>
              </div>
            )}
            {minCharge > 0 && subtotal < minCharge && (
              <div className="flex justify-between text-xs text-amber-700">
                <span>Minimum Travel Charge floor applied</span>
                <span className="tabular-nums">{fmt(minCharge)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-slate-200">
              <span className="text-sm font-semibold text-slate-900">Total Travel Cost</span>
              <span className="text-lg font-bold tabular-nums">{fmt(totalTravelCost)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}