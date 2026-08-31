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
    return (
      <div className="bg-white border border-gray-200 rounded-md p-6 text-center text-[12px] text-gray-500">
        This product editor is not available.
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
