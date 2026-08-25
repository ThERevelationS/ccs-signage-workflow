import React from "react";
import EstimatorNav from "@/components/estimator/EstimatorNav";
import EstimatorBrandBar from "@/components/estimator/EstimatorBrandBar";

export default function EstimatorShell({ children }) {
  return (
    <div className="min-h-full flex flex-col">
      <EstimatorBrandBar />
      <EstimatorNav />
      <div className="flex-1">{children}</div>
    </div>
  );
}