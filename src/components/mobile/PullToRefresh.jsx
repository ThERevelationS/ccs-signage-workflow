import React, { useRef, useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

const THRESHOLD = 70;

export default function PullToRefresh({ onRefresh, children }) {
  const startY = useRef(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef(null);

  const handleTouchStart = (e) => {
    const el = containerRef.current;
    if (el && el.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e) => {
    if (startY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta, THRESHOLD * 1.5));
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
    startY.current = null;
    setPullDistance(0);
  };

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const indicatorHeight = refreshing ? THRESHOLD : pullDistance;

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto"
      style={{ overscrollBehavior: 'none' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200"
        style={{ height: indicatorHeight, opacity: progress }}
      >
        <div
          className="rounded-full bg-white shadow-md p-2 flex items-center justify-center"
          style={{ transform: `rotate(${progress * 360}deg)`, transition: refreshing ? 'none' : 'transform 0.1s' }}
        >
          <Loader2 className={`w-5 h-5 text-purple-600 ${refreshing ? 'animate-spin' : ''}`} />
        </div>
      </div>
      {children}
    </div>
  );
}