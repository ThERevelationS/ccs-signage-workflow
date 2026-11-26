// Pure AI-session scaling decisions shared by the controller guard and
// tests. Priority under memory pressure: researchers are cut FIRST, then
// ai-extractor sessions, then ai-auditor sessions — the audit worker itself
// is only paused at emergency level alongside other non-flusher workers.
export const AI_SESSION_MAX = 8;

// Ordered cut plan for a memory deficit. Returns how many to remove from
// each lane, in priority order. `remaining` = deficit a full cut can't cover
// (the emergency pause handles it).
export function cullPlan({ deficitBytes, researchers = 0, extractSessions = 0, auditSessions = 0, avgResRssBytes, avgDevinRssBytes }) {
  let deficit = deficitBytes, resCuts = 0, extCuts = 0, audCuts = 0;
  const resRss = Math.max(1, avgResRssBytes || 500 * 1024 ** 2);
  const devRss = Math.max(1, avgDevinRssBytes || 400 * 1024 ** 2);
  while (deficit > 0 && resCuts < researchers) { resCuts++; deficit -= resRss; }
  while (deficit > 0 && extCuts < extractSessions) { extCuts++; deficit -= devRss; }
  while (deficit > 0 && audCuts < auditSessions) { audCuts++; deficit -= devRss; }
  return { resCuts, extCuts, audCuts, remaining: Math.max(0, deficit) };
}

// Auto grow: at most +1 session per guard tick, and only when every gate
// passes AFTER reserving one session's measured RSS (same margins as
// researcher admission).
export function growSession({ current, max = AI_SESSION_MAX, freeBytes, reserveBytes, commitHeadroomBytes = null, fleetRssBytes = 0, budgetBytes, avgDevinRssBytes, cpuPct = null, cpuMaxPct = 80, commitMarginBytes = 4 * 1024 ** 3, scaleUpMarginBytes = 1024 ** 3 }) {
  if (current >= max) return current;
  const rss = Math.max(1, avgDevinRssBytes || 400 * 1024 ** 2);
  if (freeBytes - rss < reserveBytes + scaleUpMarginBytes) return current;
  if (commitHeadroomBytes != null && commitHeadroomBytes - rss < commitMarginBytes) return current;
  if (fleetRssBytes + rss > budgetBytes) return current;
  if (cpuPct != null && cpuPct > cpuMaxPct) return current;
  return current + 1;
}

// Resolve the session target: manual pins to the setting (1–8); auto uses
// the grown/culled value the guard computed — 0 parks the lane under
// pressure until the guard grows it back.
export function resolveTarget({ mode = 'auto', manual = 1, auto = 1 }) {
  if (mode === 'manual') return Math.max(1, Math.min(AI_SESSION_MAX, Math.floor(Number(manual) || 1)));
  return Math.max(0, Math.min(AI_SESSION_MAX, Math.floor(Number(auto) || 0)));
}
