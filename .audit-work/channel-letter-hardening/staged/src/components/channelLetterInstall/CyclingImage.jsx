import React, { useState, useEffect } from "react";

// Cycles through a list of image URLs, switching every `intervalMs` ms.
// Each instance picks a random starting index so multiple cards don't sync up.
export default function CyclingImage({ images, alt, intervalMs = 10000, className = "" }) {
  const list = Array.isArray(images) && images.length > 0 ? images : [];
  const [idx, setIdx] = useState(() =>
    list.length > 1 ? Math.floor(Math.random() * list.length) : 0
  );

  useEffect(() => {
    if (list.length <= 1) return;
    const id = setInterval(() => {
      setIdx(prev => (prev + 1) % list.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [list.length, intervalMs]);

  if (list.length === 0) {
    return <div className={`bg-slate-100 ${className}`} />;
  }

  return (
    <div className={`relative bg-slate-100 overflow-hidden ${className}`}>
      {list.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={alt}
          loading="lazy"
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-700 ${
            i === idx ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
    </div>
  );
}