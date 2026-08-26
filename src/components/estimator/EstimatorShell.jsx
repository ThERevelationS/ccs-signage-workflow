import React from "react";
import EstimatorNav from "@/components/estimator/EstimatorNav";
import EstimatorBrandBar from "@/components/estimator/EstimatorBrandBar";

export default function EstimatorShell({ children }) {
  return (
    <div className="clay-scope min-h-full flex flex-col bg-gray-50">
      <EstimatorBrandBar />
      <EstimatorNav />
      <div className="flex-1">{children}</div>
    </div>
  );
}