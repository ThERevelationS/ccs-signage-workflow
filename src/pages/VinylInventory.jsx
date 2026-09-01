import { Link } from "react-router-dom";
import { ArrowLeft, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import VinylInventoryTab from "@/components/vinylInventory/VinylInventoryTab";

export default function VinylInventoryPage() {
  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-[1400px] mx-auto p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-blue-100 text-blue-700 flex items-center justify-center">
              <Droplets className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-[18px] font-bold text-gray-900">Vinyl Inventory</h1>
              <p className="text-[10px] text-gray-500">Shared VinylInventory catalog used by Vinyl, Channel Letters, Maintenance and Master Inventory.</p>
            </div>
          </div>
          <Link to="/VinylEstimator">
            <Button variant="outline" className="h-[30px] text-[11px]"><ArrowLeft className="w-3.5 h-3.5 mr-1" /> Vinyl Estimator</Button>
          </Link>
        </div>
        <VinylInventoryTab scope="master" />
      </div>
    </div>
  );
}
