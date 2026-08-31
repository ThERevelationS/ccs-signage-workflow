import React from "react";
import FoundationEstimator from "@/pages/FoundationEstimator";
import ChannelLetterEstimator from "@/pages/ChannelLetterEstimator";
import VinylEstimator from "@/pages/VinylEstimator";
import CNCEstimator from "@/pages/CNCEstimator";
import LaserEstimator from "@/pages/LaserEstimator";
import MetalEstimator from "@/pages/MetalEstimator";
import BrickStoneEstimator from "@/pages/BrickStoneEstimator";
import MaintenanceEstimator from "@/pages/MaintenanceEstimator";

const EDITORS = {
  foundation: FoundationEstimator,
  channel_letters: ChannelLetterEstimator,
  vinyl: VinylEstimator,
  cnc: CNCEstimator,
  laser: LaserEstimator,
  metal: MetalEstimator,
  brick_stone: BrickStoneEstimator,
  maintenance: MaintenanceEstimator,
};

export default function InlineProductEditor({ line, estimateId, onClose, onSaved }) {
  const Editor = EDITORS[line?.module_key];

  if (!Editor || !line?.project_id) {
    const isLegacyPainting = line?.module_key === "painting";
    return (
      <div className="bg-white border border-gray-200 rounded-md p-6 text-center text-[12px] text-gray-500 space-y-3">
        <div>
          {isLegacyPainting
            ? "This is a legacy Painting product. Its saved price and details are preserved, but the old Painting editor is not part of the current estimator yet."
            : "This legacy product no longer has a source project record, so only its saved estimate snapshot is available."}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-[30px] px-4 rounded border border-gray-300 bg-white text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
        >
          ← Back to Products
        </button>
      </div>
    );
  }

  return (
    <Editor
      key={`${line.module_key}:${line.project_id}`}
      embedded
      embeddedProjectId={line.project_id}
      embeddedEstimateId={estimateId}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
