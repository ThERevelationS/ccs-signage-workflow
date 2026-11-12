// W-020 — regression fixture for the deployed estimatorDesignAction dispatch
// contract (estimatorDesignActionWire.ts). Asserts the fail-closed
// classification surface the function relies on: unknown_action,
// unknown_module, module_not_implemented (never a foundation fallback), and
// the ok-pass shape for each landed action.
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = '.audit-work/design-wire-test';
mkdirSync(OUT, { recursive: true });
execSync(`npx esbuild base44/shared/estimatorDesignActionWire.ts --bundle --format=esm --outfile=${OUT}/wire.mjs`, { stdio: 'pipe' });
const W = await import('./design-wire-test/wire.mjs');

const { classifyEstimatorDesignRequest, ESTIMATOR_DESIGN_ACTIONS, ESTIMATOR_DESIGN_MODULE_KEYS, ESTIMATOR_DESIGN_IMPLEMENTED_MODULES } = W;
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL', name); } };

// fail-closed: unknown action
t('unknown_action', classifyEstimatorDesignRequest({ action: 'explode', module_key: 'foundation' }).error === 'unknown_action');
t('missing_action', classifyEstimatorDesignRequest({ module_key: 'foundation' }).error === 'unknown_action');
t('non_object', classifyEstimatorDesignRequest('str').ok === false);

// fail-closed: unknown module
t('unknown_module', classifyEstimatorDesignRequest({ action: 'propose', module_key: 'nope' }).error === 'unknown_module');
t('module_not_impl', classifyEstimatorDesignRequest({ action: 'propose', module_key: 'pylon' }).error === 'module_not_implemented');
t('no_foundation_fallback', classifyEstimatorDesignRequest({ action: 'propose', module_key: 'brick_stone' }).error === 'module_not_implemented');

// registry integrity
t('actions_4', ESTIMATOR_DESIGN_ACTIONS.length === 4 && ESTIMATOR_DESIGN_ACTIONS.includes('revise'));
t('modules_7', ESTIMATOR_DESIGN_MODULE_KEYS.length === 7);
t('impl_only_foundation', ESTIMATOR_DESIGN_IMPLEMENTED_MODULES.length === 1 && ESTIMATOR_DESIGN_IMPLEMENTED_MODULES[0] === 'foundation');

// ok-pass shape for each landed action
for (const a of ESTIMATOR_DESIGN_ACTIONS) {
  const r = classifyEstimatorDesignRequest({ action: a, module_key: 'foundation' });
  t(`ok_${a}`, r.ok === true && r.request.action === a && r.request.module_key === 'foundation');
}

// known-list surfaces on failures
t('known_actions', Array.isArray(classifyEstimatorDesignRequest({}).known));
t('known_modules', Array.isArray(classifyEstimatorDesignRequest({ action: 'propose', module_key: 'x' }).known));

console.log(`${fail === 0 ? 'PASS' : 'FAIL'} design-wire: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
