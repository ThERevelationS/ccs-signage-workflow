import React from "react";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import SettingInput from "./SettingInput";
import { maintenanceTravelDefs } from "./maintenanceTravelSiteDefs";
import SectionCard, { AnimatedGrid } from "./SectionCard";

export default function TravelTab({ globalSettings, setGlobalSettings, isLocked, onRefreshFuel, refreshingFuel }) {
  const setSetting = (k, v) => setGlobalSettings(prev => ({ ...prev, [k]: v }));
  return (
    <SectionCard
      icon={Building2}
      theme="blue"
      title="Travel"
      description="Shop starting location and travel cost parameters. Fuel price auto-updates daily."
      rightSlot={
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-medium">
          {maintenanceTravelDefs.length} settings
        </Badge>
      }
    >
      <AnimatedGrid className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {maintenanceTravelDefs.map(def => {
          const isFuel = def.name === "maintenance_gasoline_price_per_gallon" || def.name === "maintenance_diesel_price_per_gallon";
          return (
            <SettingInput
              key={def.name}
              def={def}
              value={globalSettings[def.name]}
              onChange={setSetting}
              isLocked={isLocked}
              isFuel={isFuel}
              onRefreshFuel={isFuel ? onRefreshFuel : undefined}
              refreshingFuel={refreshingFuel}
            />
          );
        })}
      </AnimatedGrid>
    </SectionCard>
  );
}