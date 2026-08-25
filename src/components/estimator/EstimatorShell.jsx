import React from "react";
import EstimatorNav from "@/components/estimator/EstimatorNav";

export default function EstimatorShell({ children }) {
  return (
    <div className="min-h-full flex flex-col">
      <EstimatorNav />
      <div className="flex-1">{children}</div>
    </div>
  );
}