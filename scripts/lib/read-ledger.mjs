// Fleet-wide cooperative token bucket for Base44 function calls. Every worker
// spends one token per gateway/resolver invoke so N concurrent workers can't
// jointly overspend the app's shared entity-list pool (~140 req/60s) and starve
// browser sessions. Append-timestamp + prune-on-read in .audit-work; over-spend
// is bounded by racer count and self-heals. Tunable via PERMIT_CALL_BUDGET.
import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const LEDGER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.audit-work', '.call-ledger.jsonl');
// Fleet authenticates as `permitbot` (dedicated service account) — its own
// caller budget, so it no longer competes with staff browser sessions. The cap
// stays self-limiting for the ~2-4x internal entity-op multiplier per call and
// keeps a margin under the fleet's own ~140/60s; business-hours throttle is now
// just a gentler rate, not a survival requirement.
const DAY_BUDGET = Math.max(5, Number(process.env.PERMIT_CALL_BUDGET_DAY) || 30);
const NIGHT_BUDGET = Math.max(10, Number(process.env.PERMIT_CALL_BUDGET) || 80);
function budget() {
  const d = new Date();
  const workday = d.getDay() !== 0 && d.getHours() >= 7 && d.getHours() < 19;
  return workday ? DAY_BUDGET : NIGHT_BUDGET;
}
const WINDOW = 60000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function paceCall(label = '') {
  for (;;) {
    const now = Date.now();
    let recent = [];
    try {
      recent = readFileSync(LEDGER, 'utf8').split('\n').map(Number).filter((t) => now - t < WINDOW);
    } catch {}
    if (recent.length < budget()) {
      try { appendFileSync(LEDGER, `${now}\n`); } catch {}
      return;
    }
    try { writeFileSync(LEDGER, recent.map(String).join('\n') + '\n'); } catch {}
    const oldest = recent.reduce((a, b) => Math.min(a, b), now);
    await sleep(Math.min(8000, Math.max(400, WINDOW - (now - oldest) + 100)));
  }
}
