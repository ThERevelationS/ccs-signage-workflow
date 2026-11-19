// Sign Maintenance — Maintenance Materials tab.
// Hosts two sub-tabs:
//   - "Main Service Type" — tag materials to the 8 sign types (flush_channel, halo_channel, …)
//   - "Action Items"      — tag materials to the 20 maintenance actions (clean, repaint, …)
// Both views read/write the same MaintenanceInventory entity; a single inventory
// row can be tagged on both axes simultaneously.

import React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Wrench, ListChecks } from "lucide-react";
import MaintenanceMaterialsByAxis from "./MaintenanceMaterialsByAxis";

export default function MaintenanceMaterialsTab() {
  return (
    <Tabs defaultValue="sign_type" className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-2 mb-4 h-auto p-1">
        <TabsTrigger value="sign_type" className="py-2 gap-2">
          <Wrench className="w-4 h-4" /> Main Service Type
        </TabsTrigger>
        <TabsTrigger value="action" className="py-2 gap-2">
          <ListChecks className="w-4 h-4" /> Action Items
        </TabsTrigger>
      </TabsList>

      <TabsContent value="sign_type">
        <MaintenanceMaterialsByAxis axis="sign_type" />
      </TabsContent>
      <TabsContent value="action">
        <MaintenanceMaterialsByAxis axis="action" />
      </TabsContent>
    </Tabs>
  );
}