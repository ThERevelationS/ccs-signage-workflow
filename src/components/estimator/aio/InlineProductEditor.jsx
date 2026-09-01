import React, { useEffect, useState } from "react";
import FoundationEstimator from "@/pages/FoundationEstimator";
import ChannelLetterEstimator from "@/pages/ChannelLetterEstimator";
import VinylEstimator from "@/pages/VinylEstimator";
import CNCEstimator from "@/pages/CNCEstimator";
import LaserEstimator from "@/pages/LaserEstimator";
import MetalEstimator from "@/pages/MetalEstimator";
import BrickStoneEstimator from "@/pages/BrickStoneEstimator";
import MaintenanceEstimator from "@/pages/MaintenanceEstimator";
import PaintingEstimator from "@/pages/PaintingEstimator";
import ReattachPartsModal from "@/components/estimator/builder/ReattachPartsModal";
import { getDetachedBuilderParts, reattachBuilderParts } from "@/components/estimator/builder/partSync";

const EDITORS = {
  foundation: FoundationEstimator,
  channel_letters: ChannelLetterEstimator,
  vinyl: VinylEstimator,
  cnc: CNCEstimator,
  laser: LaserEstimator,
  metal: MetalEstimator,
  brick_stone: BrickStoneEstimator,
  maintenance: MaintenanceEstimator,
  painting: PaintingEstimator,
};

export default function InlineProductEditor({ line, estimateId, onClose, onSaved }) {
  const Editor = EDITORS[line?.module_key];
  const [checkingDetached, setCheckingDetached] = useState(!!line?.builder_product_id);
  const [detachedParts, setDetachedParts] = useState([]);
  const [reattachOpen, setReattachOpen] = useState(false);
  const [reviewHandled, setReviewHandled] = useState(!line?.builder_product_id);
  const [editorVersion, setEditorVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!line?.builder_product_id) {
        if (active) {
          setCheckingDetached(false);
          setReviewHandled(true);
        }
        return;
      }
      setCheckingDetached(true);
      setReviewHandled(false);
      try {
        const parts = await getDetachedBuilderParts(line.builder_product_id);
        if (!active) return;
        setDetachedParts(parts);
        setReattachOpen(parts.length > 0);
        setReviewHandled(parts.length === 0);
      } finally {
        if (active) setCheckingDetached(false);
      }
    };
    check();
    return () => {
      active = false;
    };
  }, [line?.builder_product_id, line?.project_id]);

  const keepDetached = () => {
    setReattachOpen(false);
    setReviewHandled(true);
  };

  const reattachSelected = async (partIds) => {
    const result = await reattachBuilderParts({
      builderProductId: line.builder_product_id,
      partIds,
    });
    setDetachedParts(result.remainingDetached || []);
    setReattachOpen(false);
    setReviewHandled(true);
    setEditorVersion((value) => value + 1);
  };

  if (!Editor || !line?.project_id) {
    return (
      <div className="bg-white border border-gray-200 rounded-md p-6 text-center text-[12px] text-gray-500 space-y-3">
        <div>
          This legacy product no longer has a source project record, so only its saved estimate snapshot is available.
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

  if (checkingDetached && !reviewHandled) {
    return (
      <div className="bg-white border border-gray-200 rounded-md p-8 text-center text-[12px] text-gray-500">
        Checking Builder Part links…
      </div>
    );
  }

  return (
    <>
      {reviewHandled && (
        <Editor
          key={`${line.module_key}:${line.project_id}:${editorVersion}`}
          embedded
          embeddedProjectId={line.project_id}
          embeddedEstimateId={estimateId}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
      <ReattachPartsModal
        open={reattachOpen}
        parts={detachedParts}
        builderName={line.client_product_name || line.project_name || line.builder_name || "Builder"}
        onKeepDetached={keepDetached}
        onReattach={reattachSelected}
      />
    </>
  );
}
