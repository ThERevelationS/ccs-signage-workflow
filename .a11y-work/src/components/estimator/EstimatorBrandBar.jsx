import React from "react";
import { format } from "date-fns";

export default function EstimatorBrandBar() {
  return (
    <div className="bg-white border-b border-gray-200 px-3 py-1.5 flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-6 h-6 rounded bg-red-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
          SE
        </div>
        <span className="text-[13px] font-bold text-gray-800">SignEstimate Pro</span>
        <span className="text-[11px] text-gray-400 truncate hidden sm:inline">
          Professional Estimating
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-gray-500 flex-shrink-0">
        <span className="hidden sm:inline">{format(new Date(), "MMMM d, yyyy")}</span>
        <span className="font-bold text-red-600 tracking-wide">SALES MODULE</span>
      </div>
    </div>
  );
}