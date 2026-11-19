const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ABBR = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export const MIN_INTERVAL_MINUTES = 5;

function parseField(text, min, max, label, isDow) {
  if (!text || !text.trim()) throw new Error(`The ${label} field is empty.`);
  const values = new Set();
  for (const part of text.split(',')) {
    const match = /^([^\s/,]+)(?:\/(\d+))?$/.exec(part.trim());
    if (!match) throw new Error(`Unsupported ${label} value "${part.trim()}". Use numbers, *, -, / and , only.`);
    const [, rangeText, stepText] = match;
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) throw new Error(`The ${label} step must be a positive whole number.`);
    let lo;
    let hi;
    if (rangeText === '*') {
      lo = min;
      hi = max;
    } else {
      const range = /^(\d+)(?:-(\d+))?$/.exec(rangeText);
      if (!range) throw new Error(`Unsupported ${label} value "${rangeText}". Use numbers, *, -, / and , only.`);
      lo = Number(range[1]);
      hi = range[2] !== undefined ? Number(range[2]) : (stepText !== undefined ? max : lo);
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
      throw new Error(`The ${label} value "${rangeText}" is outside ${min}-${max}.`);
    }
    for (let v = lo; v <= hi; v += step) values.add(isDow && v === 7 ? 0 : v);
  }
  return values;
}

export function parseCron(expr) {
  const text = String(expr || '').trim();
  const fields = text.split(/\s+/).filter(Boolean);
  if (!text || fields.length !== 5) {
    throw new Error(`"${text}" is not a standard 5-field cron expression.`);
  }
  const [minute, hour, dom, month, dow] = fields;
  return {
    minute: parseField(minute, 0, 59, 'minute', false),
    hour: parseField(hour, 0, 23, 'hour', false),
    dom: parseField(dom, 1, 31, 'day of month', false),
    month: parseField(month, 1, 12, 'month', false),
    dow: parseField(dow, 0, 7, 'day of week', true),
    domStar: dom === '*',
    dowStar: dow === '*',
  };
}

export function isValidTimeZone(tz) {
  const zone = String(tz || '').trim();
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function zonedPartsFactory(timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', weekday: 'short',
  });
  return (timeMs) => {
    const out = {};
    for (const part of fmt.formatToParts(new Date(timeMs))) out[part.type] = part.value;
    const hour = Number(out.hour) === 24 ? 0 : Number(out.hour);
    return {
      minute: Number(out.minute), hour,
      day: Number(out.day), month: Number(out.month),
      dow: DAY_ABBR[out.weekday],
    };
  };
}

function dayMatches(parsed, parts) {
  const domOk = parsed.dom.has(parts.day);
  const dowOk = parsed.dow.has(parts.dow);
  if (!parsed.domStar && !parsed.dowStar) return domOk || dowOk;
  if (parsed.domStar) return dowOk;
  if (parsed.dowStar) return domOk;
  return true;
}

function minutesUntilNextDay(parts) {
  return (23 - parts.hour) * 60 + (60 - parts.minute);
}

function* runInstants(parsed, timeZone, from, maxDays, maxRuns) {
  const partsOf = zonedPartsFactory(timeZone);
  const fromMs = from.getTime();
  const endMs = fromMs + maxDays * 24 * 60 * 60 * 1000;
  let t = Math.floor(fromMs / 60000) * 60000 + 60000;
  let yielded = 0;
  while (t <= endMs && yielded < maxRuns) {
    const p = partsOf(t);
    if (!parsed.month.has(p.month) || !dayMatches(parsed, p)) {
      t += minutesUntilNextDay(p) * 60000;
      continue;
    }
    if (!parsed.hour.has(p.hour)) {
      t += (60 - p.minute) * 60000;
      continue;
    }
    if (!parsed.minute.has(p.minute)) {
      t += 60000;
      continue;
    }
    yield new Date(t);
    yielded += 1;
    t += 60000;
  }
}

export function nextRuns(expr, timeZone, from = new Date(), count = 5) {
  const parsed = typeof expr === 'string' ? parseCron(expr) : expr;
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const out = [];
  for (const instant of runInstants(parsed, zone, from, 400, count)) out.push(instant);
  return out;
}

export function minIntervalMinutes(expr, timeZone, from = new Date()) {
  const parsed = typeof expr === 'string' ? parseCron(expr) : expr;
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  let previous = null;
  let best = Infinity;
  let seen = 0;
  for (const instant of runInstants(parsed, zone, from, 7, 2100)) {
    seen += 1;
    if (previous !== null) {
      const gap = (instant.getTime() - previous) / 60000;
      if (gap < best) best = gap;
    }
    previous = instant.getTime();
  }
  return seen < 2 ? Infinity : best;
}

export function firingMinutesOverlap(exprA, tzA, exprB, tzB, from = new Date()) {
  const parsedA = typeof exprA === 'string' ? parseCron(exprA) : exprA;
  const parsedB = typeof exprB === 'string' ? parseCron(exprB) : exprB;
  const zoneA = isValidTimeZone(tzA) ? tzA : 'UTC';
  const zoneB = isValidTimeZone(tzB) ? tzB : 'UTC';
  const aMinutes = new Set();
  for (const instant of runInstants(parsedA, zoneA, from, 1, 2000)) {
    aMinutes.add(instant.getTime());
  }
  const out = [];
  for (const instant of runInstants(parsedB, zoneB, from, 1, 2000)) {
    if (aMinutes.has(instant.getTime())) {
      out.push(instant);
      if (out.length >= 5) break;
    }
  }
  return out;
}

function formatClock(hour, minute) {
  const h = Number(hour);
  const m = String(Number(minute)).padStart(2, '0');
  const display = ((h + 11) % 12) + 1;
  return `${display}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

function describeWeeklyDays(dowText) {
  if (dowText === '1-5') return 'Weekdays';
  const days = [];
  for (const part of dowText.split(',')) {
    const range = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!range) return null;
    const lo = Number(range[1]);
    const hi = range[2] !== undefined ? Number(range[2]) : lo;
    if (lo < 0 || hi > 7 || lo > hi) return null;
    for (let v = lo; v <= hi; v += 1) days.push(DAY_NAMES[v === 7 ? 0 : v]);
  }
  if (!days.length) return null;
  if (days.length === 1) return `Every ${days[0]}`;
  const plural = days.map((d) => `${d}s`);
  return `${plural.slice(0, -1).join(', ')} and ${plural[plural.length - 1]}`;
}

export function describeCron(expr) {
  const text = String(expr || '').trim();
  const fields = text.split(/\s+/);
  if (fields.length !== 5) return `Custom schedule (${text})`;
  const [m, h, dom, month, dow] = fields;
  try {
    parseCron(text);
  } catch {
    return `Custom schedule (${text})`;
  }
  const isNum = (s) => /^\d+$/.test(s);
  if (h === '*' && dom === '*' && month === '*' && dow === '*') {
    if (m === '*') return 'Every minute';
    const stepAll = /^\*\/(\d+)$/.exec(m);
    if (stepAll) return `Every ${stepAll[1]} minutes`;
    const offsetStep = /^(\d+)-59\/(\d+)$/.exec(m);
    if (offsetStep) return `Every ${offsetStep[2]} minutes starting at :${String(Number(offsetStep[1])).padStart(2, '0')}`;
    if (/^[\d,]+$/.test(m)) {
      const minutes = m.split(',').map((v) => `:${String(Number(v)).padStart(2, '0')}`);
      return `Every hour at ${minutes.join(', ')}`;
    }
    return `Custom schedule (${text})`;
  }
  if (isNum(m) && isNum(h) && dom === '*' && month === '*') {
    const time = formatClock(h, m);
    if (dow === '*') return `Daily at ${time}`;
    const days = describeWeeklyDays(dow);
    if (days) return `${days} at ${time}`;
    return `Custom schedule (${text})`;
  }
  return `Custom schedule (${text})`;
}

export function validateSchedule(expr, timeZone) {
  let parsed;
  try {
    parsed = parseCron(expr);
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
  if (!isValidTimeZone(timeZone)) {
    return { ok: false, error: `"${String(timeZone || '').trim()}" is not a valid time zone.` };
  }
  const gap = minIntervalMinutes(parsed, timeZone);
  if (gap < MIN_INTERVAL_MINUTES) {
    return { ok: false, error: `Runs more often than every ${MIN_INTERVAL_MINUTES} minutes` };
  }
  return { ok: true };
}
