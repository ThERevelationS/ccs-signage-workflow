// Accordion-style keyboard movement between document headers; Enter/Space still controls expansion.
export function documentHeaderTargetIndex(key, currentIndex, count) {
  if (!Number.isInteger(currentIndex) || !Number.isInteger(count) || count < 1 || currentIndex < 0 || currentIndex >= count) return null;
  if (key === "ArrowDown") return (currentIndex + 1) % count;
  if (key === "ArrowUp") return (currentIndex - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
