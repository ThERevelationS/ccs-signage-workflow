import React from "react";
import { Link } from "react-router-dom";
import { Settings, ArrowRight } from "lucide-react";

const LINKS = [
  { label: "Master Inventory", desc: "Unified inventory for substrates, vinyl, equipment, labor, lighting, hardware, supplies, metals and concrete", to: "/MasterInventory" },
  { label: "Foundation / Masonry Catalog", desc: "Concrete, brick, poles and fill materials", to: "/FoundationCatalog" },
  { label: "Foundation Settings", desc: "Labor, timing, masonry and pole-paint calculation defaults", to: "/FoundationSettings" },
  { label: "Painting Settings", desc: "Paint mix, coverage, mask, consumables, labor and quantity tiers", to: "/PaintingSettings" },
  { label: "CNC Settings", desc: "Machine rate calculator, labor, setup, material multipliers and cut speeds", to: "/CNCSettings" },
  { label: "Laser Settings", desc: "Parameter and engraving laser rates, calculators, material multipliers and speeds", to: "/LaserSettings" },
  { label: "Metal Settings", desc: "Fabrication, welding and finishing labor defaults", to: "/MetalSettings" },
  { label: "Maintenance Settings", desc: "Service action rates, labor, repaint and Maintenance travel", to: "/MaintenanceSettings" },
  { label: "Installation Settings", desc: "Install labor, size/height/environment times, conditions, travel and letter pricing", to: "/InstallationSettings" },
  { label: "Vinyl Inventory", desc: "Shared vinyl, laminate and transfer-tape catalog", to: "/VinylInventory" },
  { label: "Vinyl Settings", desc: "Printers, cutters, laminators, geometry, ink, blade and machine rates", to: "/VinylSettings" },
  { label: "Quote Defaults", desc: "Company branding, quote content, validity and default customer-facing display settings for new estimates", to: "/QuoteSettings" },
  { label: "Admin Settings", desc: "Users, backups, workflow rules", to: "/AdminSettings" },
  { label: "My Info", desc: "Your profile and preferences", to: "/UserSettings" },
];

export default function EstimatorSettings() {
  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-3">
        <div className="bg-white px-4 py-3 flex items-center gap-2">
          <Settings className="w-4 h-4 text-red-500" />
          <h1 className="text-xs font-bold tracking-wide text-gray-600">ESTIMATOR SETTINGS</h1>
        </div>

        <div className="bg-white divide-y divide-gray-100">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="flex items-center justify-between px-4 py-3 hover:bg-red-50/50">
              <div>
                <div className="text-sm font-semibold text-gray-800">{l.label}</div>
                <div className="text-xs text-gray-500">{l.desc}</div>
              </div>
              <ArrowRight className="w-4 h-4 text-red-400" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}