export const FLEET_MAINTENANCE_TEMPLATES = [
  { name: "Oil Change", description: "Change engine oil and replace the oil filter. Verify oil specification, capacity, filter fitment, and service interval against the equipment/OEM documentation before work begins.", frequency: "every_6_months", duration: 1, partTerms: ["oil filter"], fluidTerms: ["engine oil", "motor oil"] },
  { name: "Tire Rotation", description: "Rotate tires using the correct pattern for this vehicle, inspect tread and visible tire condition, and verify lug torque requirements before return to service.", frequency: "quarterly", duration: 1, partTerms: [], fluidTerms: [] },
  { name: "Annual Inspection", description: "Perform an annual equipment inspection covering safety items, visible wear, operating condition, required documentation, and manufacturer-specific inspection points.", frequency: "annually", duration: 2, partTerms: [], fluidTerms: [] },
  { name: "Generator Service", description: "Perform routine generator service. Inspect the air filter and spark plug, service engine oil when applicable, and verify the manufacturer service checklist before work begins.", frequency: "every_6_months", duration: 1.5, partTerms: ["air filter", "spark plug"], fluidTerms: ["engine oil", "motor oil"] },
  { name: "Spark Plug Replacement", description: "Inspect and replace the spark plug using the correct specification and gap for this equipment. Verify fitment and torque requirements before installation.", frequency: "annually", duration: 1, partTerms: ["spark plug"], fluidTerms: [] },
  { name: "Lift Inspection", description: "Inspect lift structure, controls, safety devices, visible hydraulic components, tires, fasteners, and required inspection points. Follow the manufacturer inspection procedure and applicable safety requirements.", frequency: "annually", duration: 2, partTerms: [], fluidTerms: [] },
  { name: "Filter Replacement", description: "Inspect and replace the applicable service filter. Verify filter type, fitment, and replacement interval for this equipment before work begins.", frequency: "every_6_months", duration: 1, partTerms: ["filter"], fluidTerms: [] },
  { name: "Fluid Service", description: "Inspect and service the applicable equipment fluid. Verify fluid specification, service interval, capacity, and disposal procedure before work begins.", frequency: "annually", duration: 1.5, partTerms: [], fluidTerms: ["fluid"] },
];

export function prettyMaintenanceFrequency(value) {
  return ({
    daily: "Every day",
    weekly: "Every week",
    bi_weekly: "Every 2 weeks",
    monthly: "Every month",
    bi_monthly: "Every 2 months",
    quarterly: "Every 3 months",
    every_6_months: "Every 6 months",
    annually: "Every year",
    custom: "Custom interval",
  })[value] || String(value || "").replaceAll("_", " ");
}
