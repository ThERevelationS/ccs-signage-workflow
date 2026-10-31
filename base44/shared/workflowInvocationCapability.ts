const CAPABILITY_FORMAT = /^[A-Za-z0-9_-]{40,128}$/;

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** `checkDeadlineReminders` -> `WORKFLOW_CAPABILITY_CHECK_DEADLINE_REMINDERS` */
export function workflowCapabilitySecretName(workflowName: string) {
  const snake = String(workflowName || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return snake ? `WORKFLOW_CAPABILITY_${snake}` : '';
}

/**
 * Raw capability for an internal caller, read from the app secret named by
 * workflowCapabilitySecretName(). Returns '' when the secret is not configured
 * so callers fall through to the target's normal (fail-closed) auth path.
 */
export function getWorkflowInvocationCapability(workflowName: string) {
  const secretName = workflowCapabilitySecretName(workflowName);
  if (!secretName) return '';
  const value = String(Deno.env.get(secretName) || '').trim();
  return CAPABILITY_FORMAT.test(value) ? value : '';
}

/**
 * Workflows execute backend functions without an end-user auth context, while the
 * same functions are also reachable through their public HTTP endpoints. A
 * missing user or an empty body therefore cannot identify a scheduled run.
 *
 * Each workflow and internal caller sends a backend-only bearer capability in its
 * function args. The raw capability is never committed: it lives only in the app
 * secret `WORKFLOW_CAPABILITY_<NAME>` and is injected into workflow definitions at
 * deploy time (scripts/inject-workflow-capabilities.mjs). An unset secret denies.
 */
export async function hasWorkflowInvocationCapability(body: unknown, workflowName: string) {
  const expected = getWorkflowInvocationCapability(workflowName);
  if (!expected) return false;

  const token = String((body as any)?._workflow_capability || '').trim();
  if (!CAPABILITY_FORMAT.test(token)) return false;

  const [actualHash, expectedHash] = await Promise.all([sha256Hex(token), sha256Hex(expected)]);
  return constantTimeEqual(actualHash, expectedHash);
}
