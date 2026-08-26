import React, { useState } from "react";
import { ChevronUp, ChevronDown, Info } from "lucide-react";

export default function FoundationSectionBanner({ sectionName }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-violet-100 border border-violet-300 rounded-sm px-3 py-2 mb-3 flex items-center gap-2">
      <Info className="w-4 h-4 text-violet-600 flex-shrink-0" />
      <span className="text-[12px] text-violet-900 flex-1">
        {open ? (
          <>
            <b>All-In-One section:</b> {sectionName || "Untitled"} — <b>Concrete | Masonry | Poles</b> — save
            here and the total flows into the combined estimate automatically.
          </>
        ) : (
          <>
            <b>All-In-One section:</b> {sectionName || "Untitled"}
          </>
        )}
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-[24px] px-2 flex items-center gap-1 rounded-sm bg-white border border-violet-300 text-[11px] font-medium text-violet-800"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {open ? "Collapse Section" : "Expand Section"}
      </button>
    </div>
  );
}