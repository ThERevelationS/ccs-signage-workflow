// Static contract: punch_webhook must only POST to the server-configured
// destination, through the SSRF-guarded fetch helper.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../base44/functions/timeClockAction/entry.ts', import.meta.url), 'utf8');
const start = source.indexOf("if (action === 'punch_webhook')");
assert.ok(start > 0, 'punch_webhook action must exist');
const end = source.indexOf('if (action === ', start + 1);
const block = source.slice(start, end);

assert.match(source, /import \{[^}]*\bsafeExternalFetch\b[^}]*\} from '\.\.\/\.\.\/shared\/safeExternalFetch\.ts'/, 'timeClockAction must import safeExternalFetch');
assert.match(block, /Deno\.env\.get\('TIMECLOCK_PUNCH_WEBHOOK_URL'\)/, 'destination must come from server-side config');
assert.doesNotMatch(block, /body\.url|body\[['"]url['"]\]/, 'destination must never come from the request body');
assert.match(block, /safeExternalFetch\(url,/, 'delivery must go through safeExternalFetch');
assert.doesNotMatch(block, /(?<![A-Za-z])fetch\(/, 'raw fetch is not allowed in punch_webhook');

console.log('PASS validate-timeclock-punch-webhook');
