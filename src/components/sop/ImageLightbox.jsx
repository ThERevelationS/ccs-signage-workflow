import React, { useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

// Full-screen photo viewer for SOP step galleries. Arrow keys navigate,
// Esc/backdrop closes.
export default function ImageLightbox({ images, index, onIndexChange, onClose }) {
  const count = Array.isArray(images) ? images.length : 0;
  const current = Math.min(Math.max(index || 0, 0), Math.max(count - 1, 0));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "ArrowLeft") onIndexChange?.((current - 1 + count) % count);
      if (e.key === "ArrowRight") onIndexChange?.((current + 1) % count);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, current, onClose, onIndexChange]);

  if (!count) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/85 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-label="Photo viewer"
    >
      <button
        type="button"
        className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
        onClick={onClose}
        aria-label="Close photo viewer"
      >
        <X className="h-7 w-7" />
      </button>
      {count > 1 && (
        <button
          type="button"
          className="absolute left-3 sm:left-6 text-white/80 hover:text-white p-2"
          onClick={(e) => { e.stopPropagation(); onIndexChange?.((current - 1 + count) % count); }}
          aria-label="Previous photo"
        >
          <ChevronLeft className="h-9 w-9" />
        </button>
      )}
      <img
        src={images[current]}
        alt={`Step photo ${current + 1} of ${count}`}
        className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      {count > 1 && (
        <button
          type="button"
          className="absolute right-3 sm:right-6 text-white/80 hover:text-white p-2"
          onClick={(e) => { e.stopPropagation(); onIndexChange?.((current + 1) % count); }}
          aria-label="Next photo"
        >
          <ChevronRight className="h-9 w-9" />
        </button>
      )}
      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
        {current + 1} / {count}
      </p>
    </div>
  );
}
