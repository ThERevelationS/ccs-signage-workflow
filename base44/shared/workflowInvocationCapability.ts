const WORKFLOW_CAPABILITY_HASHES: Record<string, string> = {
  checkDeadlineReminders: '43ca6f538ae0db65f1b747ae3db37890701a811785f1c09b5d8521c9789b81dd',
  monitorJurisdictionChanges: 'fee4b26c6308b674be4ad27b240fdc5c5fdd38d1f882d4572527eec299ff4978',
  checkPermitFollowupReminders: '71384f0bc812c4d329561c9ae1f2b15cc2d19b5b0d34d1ec95536f53fc954ac7',
  processCorebridgeEmails: '51d9aca8daa5a0fa7e0523e9fd4233ab8c970310bc2a3ca0059051391eb04838',
  backupToGoogleDrive: '3953829bffb28c3a58e5a3491c7c52f9987867fbbba426e64826c8243ad75463',
  auditJurisdictionAccuracy: 'bc0b14e3cc1212382f2aaf87bceef3a3c593a59c83f9bf68e0088384b806cac3',
  refreshJurisdiction: '3df7cc591cb73abbacc2bff993f53dfaa1e6eea116989ad7a6ed44e9b9125887',
  detectSalesDuplicates: '35a68624dd682c8fffccf75d44f04ab35333ac8005868410caca045faa911ac1',
};

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

/**
 * Workflows execute backend functions without an end-user auth context, while the
 * same functions are also reachable through their public HTTP endpoints. A
 * missing user or an empty body therefore cannot identify a scheduled run.
 *
 * Each workflow sends a backend-only bearer capability in its function args.
 * Only the SHA-256 verifier is kept here; the raw capability lives in the
 * corresponding backend workflow definition and is never returned to clients.
 */
export async function hasWorkflowInvocationCapability(body: unknown, workflowName: string) {
  const expectedHash = WORKFLOW_CAPABILITY_HASHES[workflowName];
  if (!expectedHash) return false;

  const token = String((body as any)?._workflow_capability || '').trim();
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) return false;

  const actualHash = await sha256Hex(token);
  return constantTimeEqual(actualHash, expectedHash);
}
