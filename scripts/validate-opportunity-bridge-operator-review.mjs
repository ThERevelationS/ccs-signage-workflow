import assert from 'node:assert/strict';
import fs from 'node:fs';

const review = fs.readFileSync(new URL('../src/components/admin/OpportunityBridgeReview.jsx', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../src/pages/AdminSettings.jsx', import.meta.url), 'utf8');

assert(review.includes('base44.functions.invoke("opportunityBridgeSimulation"'), 'Review UI must invoke only the guarded simulation endpoint.');
assert(review.includes('simulation_only !== true'), 'Review UI must verify the backend simulation-only contract.');
assert(review.includes('write_capability !== false'), 'Review UI must reject a response that claims write capability.');
assert(review.includes('apply_path_enabled !== false'), 'Review UI must reject a response that exposes an apply path.');
assert(review.includes('Run Simulation'), 'Review UI must expose a refresh/simulation action.');
assert(review.includes('Safe bridge cohort'), 'Review UI must expose the safe cohort count.');
assert(review.includes('Historical deterministic Won'), 'Review UI must expose historical Won reconciliation count.');
assert(review.includes('Held for review'), 'Review UI must expose the held cohort count.');
assert(review.includes('hold_reason_counts'), 'Review UI must surface hold reason counts.');
assert(review.includes('source_snapshot'), 'Review UI must expose the source snapshot.');
assert(review.includes('proposed_opportunity'), 'Review UI must expose the proposed Opportunity.');
assert(review.includes('receipt_key'), 'Review UI must expose the immutable receipt identity.');
assert(review.includes('localStorage'), 'Review UI must support client-local drift comparison without production writes.');

for (const forbidden of [
  /base44\.entities\./,
  /\.create\s*\(/,
  /\.update\s*\(/,
  /\.updateMany\s*\(/,
  /\.delete\s*\(/,
  /executeOpportunityBridgePlanRow/,
  /opportunityBridgeApplyEngine/,
]) {
  assert(!forbidden.test(review), `Review UI contains forbidden write/apply surface: ${forbidden}`);
}

assert(!/>\s*Apply\s*</.test(review), 'Review UI must not render an Apply button.');
assert(!/["']apply["']/.test(review), 'Review UI must not send apply mode or action values.');

assert(admin.includes('OpportunityBridgeReview'), 'Admin Settings must import the Opportunity Bridge review component.');
assert(admin.includes('value="opportunity_bridge"'), 'Admin Settings must expose the Opportunity Bridge tab.');
assert(admin.includes("['smartsheet','sync_conflicts','opportunity_bridge']"), 'Opportunity Bridge deep-link tab must remain admin-gated.');
assert(admin.includes('<OpportunityBridgeReview />'), 'Admin Settings must mount the review component only in the admin tab content.');

console.log('Opportunity bridge operator review validation: PASS');
