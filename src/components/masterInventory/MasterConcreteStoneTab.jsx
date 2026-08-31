// Master Inventory — Concrete & Stone tab.
//
// Wraps the same UI as the (now-deprecated) Foundation Inventory page so all
// concrete/masonry materials live under Master Inventory:
//   • Wall Materials (brick / cinderblock / stone / poured concrete)
//   • Wall Fill Materials
//   • Wall Caps
//   • Bagged Concrete
//   • Rebar
//   • Forming Material
//
// Note: Concrete ready-mix SUPPLIERS (Citywide, Ernst, etc.) live in
// Labor & Services with service_category = "concrete_service" and are NOT
// shown here. EQUIPMENT lives in the Equipment tab. POLES live in the
// Extruded Metals & Poles tab.

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import FoundationInventoryPage from "@/pages/FoundationInventory";

export default function MasterConcreteStoneTab() {
  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardContent className="p-4">
        <FoundationInventoryPage embedded />
      </CardContent>
    </Card>
  );
}