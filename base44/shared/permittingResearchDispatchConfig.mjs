export const PERMITTING_RESEARCH_CONFIG_KEY = 'permitting_research_dispatch_config';
export const PERMITTING_RESEARCH_STATE_KEY = 'permitting_research_dispatch_state';

export const DEFAULT_PERMITTING_RESEARCH_CONFIG = Object.freeze({
  enabled: true,
  interval_minutes: 15,
  max_dispatch_per_cycle: 5,
  max_in_flight: 20,
  daily_dispatch_limit: 40,
  retry_limit: 3,
});

const integer = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

export function normalizePermittingResearchConfig(value = {}) {
  return {
    enabled: value?.enabled !== false,
    interval_minutes: integer(value?.interval_minutes, DEFAULT_PERMITTING_RESEARCH_CONFIG.interval_minutes, 15, 1440),
    max_dispatch_per_cycle: integer(value?.max_dispatch_per_cycle, DEFAULT_PERMITTING_RESEARCH_CONFIG.max_dispatch_per_cycle, 1, 100),
    max_in_flight: integer(value?.max_in_flight, DEFAULT_PERMITTING_RESEARCH_CONFIG.max_in_flight, 1, 500),
    daily_dispatch_limit: integer(value?.daily_dispatch_limit, DEFAULT_PERMITTING_RESEARCH_CONFIG.daily_dispatch_limit, 1, 5000),
    retry_limit: integer(value?.retry_limit, DEFAULT_PERMITTING_RESEARCH_CONFIG.retry_limit, 1, 10),
  };
}

export function easternDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return get('year') + '-' + get('month') + '-' + get('day');
}

export function normalizedResearchState(value = {}, now = new Date()) {
  const dayKey = easternDayKey(now);
  const savedDay = String(value?.daily_day_key || '');
  return {
    last_cycle_at: String(value?.last_cycle_at || ''),
    daily_day_key: dayKey,
    dispatched_today: savedDay === dayKey ? Math.max(0, Number(value?.dispatched_today) || 0) : 0,
    last_result: value?.last_result && typeof value.last_result === 'object' ? value.last_result : null,
  };
}

export function researchCycleDecision({ config, state, now = new Date(), manual = false } = {}) {
  const cfg = normalizePermittingResearchConfig(config);
  const current = normalizedResearchState(state, now);
  const dailyRemaining = Math.max(0, cfg.daily_dispatch_limit - current.dispatched_today);

  if (!cfg.enabled) return { due: false, reason: 'disabled', config: cfg, state: current, dailyRemaining };
  if (dailyRemaining <= 0) return { due: false, reason: 'daily_limit', config: cfg, state: current, dailyRemaining };
  if (manual) return { due: true, reason: 'manual', config: cfg, state: current, dailyRemaining };

  const last = Date.parse(current.last_cycle_at);
  if (Number.isFinite(last)) {
    const elapsedMinutes = Math.max(0, (now.getTime() - last) / 60000);
    if (elapsedMinutes < cfg.interval_minutes) {
      return { due: false, reason: 'interval', config: cfg, state: current, dailyRemaining };
    }
  }
  return { due: true, reason: 'scheduled', config: cfg, state: current, dailyRemaining };
}
