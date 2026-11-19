// Sign Maintenance — Dimensional Sheets tab.
// Reuses the same DimensionalLetterMaterial entity used by the Channel Letter
// estimator. Visibility in each estimator is controlled by the show_in_* flags
// on the entity (toggled from Master Inventory).
//
// This tab simply re-renders the same UX the Channel Letter Install Inventory
// page uses for "Dimensional Sheets", so the two experiences stay 1:1.

import React from "react";
import DimensionalMaterialsTab from "@/components/channelLetterInstall/DimensionalMaterialsTab";

// Sign Maintenance shows substrates flagged for any maintenance-related action
// (vinyl replacement, returns replacement, face replacement) in Master Inventory.
const MAINTENANCE_VISIBILITY = [
  "show_in_vinyl_replacement",
  "show_in_replace_returns",
  "show_in_replace_face",
];

export default function MaintenanceDimensionalSheetsTab() {
  return <DimensionalMaterialsTab visibilityFields={MAINTENANCE_VISIBILITY} />;
}