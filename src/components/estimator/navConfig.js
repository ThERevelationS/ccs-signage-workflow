import { ESTIMATOR_MODULES } from "@/components/estimator/moduleRegistry";

// Top tab bar of the Estimator. Each tab has a landing page and a dropdown of
// shortcuts into that area.
export const ESTIMATOR_TABS = [
  {
    label: "Sales Home",
    to: "/SalesHome",
    items: [
      { label: "Notifications & Activity", to: "/SalesHome" },
      { label: "Estimate Queues", to: "/EstimatorQueues" },
      { label: "New Estimate", to: "/NewAllInOneEstimate" },
    ],
  },
  {
    label: "Queues",
    to: "/EstimatorQueues",
    items: [
      { label: "All Estimates", to: "/EstimatorQueues" },
      { label: "In Draft", to: "/EstimatorQueues?status=draft" },
      { label: "Awaiting Approval", to: "/EstimatorQueues?status=sent" },
      { label: "Approved", to: "/EstimatorQueues?status=approved" },
      { label: "Archived", to: "/EstimatorQueues?status=archived" },
    ],
  },
  {
    label: "Customers",
    to: "/EstimatorCustomers",
    items: [
      { label: "All Customers", to: "/EstimatorCustomers" },
      { label: "Active", to: "/EstimatorCustomers?status=active" },
      { label: "Prospects", to: "/EstimatorCustomers?status=prospect" },
      { label: "Inactive", to: "/EstimatorCustomers?status=inactive" },
    ],
  },
  {
    label: "Quick Price",
    to: "/QuickPrice",
    items: [
      { label: "Full Estimate", to: "/NewAllInOneEstimate" },
      { label: "QUICK ESTIMATORS", header: true },
      ...ESTIMATOR_MODULES.map((m) => ({
        label: m.label,
        to: `/QuickPrice?module=${m.key}`,
      })),
    ],
  },
  {
    label: "Estimates",
    to: "/Estimator",
    items: [
      { label: "All Estimates", to: "/Estimator" },
      { label: "New Estimate", to: "/NewAllInOneEstimate" },
    ],
  },
  {
    label: "Products",
    to: "/EstimatorProducts",
    items: [
      { label: "Product Library", to: "/EstimatorProducts" },
      { label: "Quick Products", to: "/EstimatorProducts?view=quick" },
      { label: "PRODUCT BUILDERS", header: true },
      ...ESTIMATOR_MODULES.map((m) => ({
        label: m.label,
        to: `/EstimatorProducts?module=${m.key}`,
      })),
    ],
  },
];

export const ESTIMATOR_RIGHT_TABS = [
  {
    label: "Settings",
    to: "/EstimatorSettings",
    items: [
      { label: "Estimator Settings", to: "/EstimatorSettings" },
      { label: "Foundation Catalog", to: "/FoundationCatalog" },
      { label: "Foundation Settings", to: "/FoundationSettings" },
      { label: "Painting Settings", to: "/PaintingSettings" },
      { label: "CNC Settings", to: "/CNCSettings" },
      { label: "Laser Settings", to: "/LaserSettings" },
      { label: "Metal Settings", to: "/MetalSettings" },
      { label: "Maintenance Settings", to: "/MaintenanceSettings" },
      { label: "Installation Settings", to: "/InstallationSettings" },
      { label: "Vinyl Inventory", to: "/VinylInventory" },
      { label: "Vinyl Settings", to: "/VinylSettings" },
      { label: "Admin Settings", to: "/AdminSettings" },
      { label: "My Info", to: "/UserSettings" },
    ],
  },
  {
    label: "Tools",
    to: "/EstimatorTools",
    items: [
      { label: "Tools Home", to: "/EstimatorTools" },
      { label: "Quick Price", to: "/QuickPrice" },
      { label: "Main Workflow", to: "/MainWorkflow" },
      { label: "Sales Pipeline", to: "/SalesPipeline" },
      { label: "Reports", to: "/FeatureReports" },
    ],
  },
];