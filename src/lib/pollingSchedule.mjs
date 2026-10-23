export function jitteredDelay(baseMs, jitter = 0.2, rand = Math.random) {
  const factor = 1 - jitter + rand() * 2 * jitter;
  return Math.round(baseMs * factor);
}

export function shouldRunFocusRefresh(lastRunAt, now, minGapMs) {
  return now - lastRunAt >= minGapMs;
}
