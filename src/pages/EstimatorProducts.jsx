import React from "react";
import { Link } from "react-router-dom";
import { Package, ArrowRight } from "lucide-react";
import { ESTIMATOR_MODULES } from "@/components/estimator/moduleRegistry";

export default function EstimatorProducts() {
  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-3">
        <div className="bg-white px-4 py-3 flex items-center gap-2">
          <Package className="w-4 h-4 text-red-500" />
          <h1 className="text-xs font-bold tracking-wide text-gray-600">PRODUCTS</h1>
        </div>

        <div className="bg-white divide-y divide-gray-100">
          {ESTIMATOR_MODULES.map((m) => (
            <Link
              key={m.key}
              to={`/QuickPrice?module=${m.key}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-red-50/50"
            >
              <div>
                <div className="text-sm font-semibold text-gray-800">{m.label}</div>
                <div className="text-xs text-gray-500">Price this product type</div>
              </div>
              <ArrowRight className="w-4 h-4 text-red-400" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}