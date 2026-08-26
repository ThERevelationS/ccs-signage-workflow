import React, { useState, useEffect } from "react";
import { X } from "lucide-react";

const REASONS = [
  "Duplicate",
  "Chose another Sign Company - No reason given",
  "Error",
  "Customer hasn't responded - No reason given",
  "Cancelled Project - No reason given",
  "Chose another Sign Company - Our Price too High",
  "Cancelled Project - Our Price too High",
  "Other",
  "Multi Estimates - Chose another one",
  "Price Shoppers",
  "Chose another Sign Company - We took too long",
  "Custom...",
];

export default function CancelEstimateModal({ open, onClose, onConfirm, estimateName }) {
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setCustomReason("");
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const isCustom = reason === "Custom...";
  const canSubmit = reason && (!isCustom || customReason.trim());

  const handleConfirm = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const finalReason = isCustom ? customReason.trim() : reason;
    await onConfirm(finalReason);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative bg-white rounded-md shadow-2xl border border-gray-300 w-full max-w-md"
        style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2
            className="text-lg font-bold tracking-wide"
            style={{ color: "#7a9a4b" }}
          >
            CANCEL ESTIMATE
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 transition-colors p-1"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-2 space-y-2 text-sm text-gray-800">
          <p>
            Proceeding with this action will cancel the{" "}
            <strong>entire estimate</strong>. All product{" "}
            <strong>totals</strong> will remain as they currently are.
          </p>
          <p className="text-gray-600">
            To cancel an individual product, use the product status.
          </p>
          <p>
            <span className="font-bold text-red-600">Warning:</span>{" "}
            This action cannot be undone.
          </p>
        </div>

        {/* Reason dropdown */}
        <div className="px-5 py-3">
          <label className="block text-sm font-medium text-gray-900 mb-1.5">
            Enter Reason for Cancelling
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full h-9 px-2 border border-gray-400 rounded text-sm bg-white focus:outline-none focus:border-lime-600"
          >
            <option value="">-- Select reason --</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          {isCustom && (
            <input
              type="text"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Enter custom reason…"
              className="w-full h-9 px-2 mt-2 border border-gray-400 rounded text-sm focus:outline-none focus:border-lime-600"
              autoFocus
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 pb-5 pt-1">
          <button
            onClick={handleConfirm}
            disabled={!canSubmit || submitting}
            className="px-5 py-2 rounded border border-gray-500 font-semibold text-sm text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:brightness-95"
            style={{ backgroundColor: "#d9e7c5" }}
          >
            {submitting ? "Cancelling…" : "Cancel Estimate"}
          </button>
        </div>
      </div>
    </div>
  );
}