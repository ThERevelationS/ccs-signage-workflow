const WORKFLOW_CAPABILITY_HASHES: Record<string, string> = {
  checkDeadlineReminders: '72fb97c3669c8c641047f620f620eb56885b47fa041c8480a85495d281a55255',
  monitorJurisdictionChanges: '6126c9db61fec648a4ce353ff498877763b04a61a9119dbbe1fabeeb181c5854',
  checkPermitFollowupReminders: 'a0baf1a5cec82d39356c9d9a80b957ccaa06a6208b5434c0c74a19ea666448db',
  backupToGoogleDrive: 'cf38231a84bb7ac33710a981853ce3e359c499c3a2c8ab3076ebfae49b3d7f22',
  auditJurisdictionAccuracy: 'afc8c4ce47b71f7c560dd4b78a88c4ca168796b7409036c05c3cf371b32649d4',
  refreshJurisdiction: '52b93296d579efe1c68c30386f06203f4b9b6b94d42ee821ccdfe99bb70a1880',
  refreshJurisdictionTargeted: '1ff5bab9cc29af44a548b7f0355d630b30112fa980e2ac063cc998e373f34cc0',
  detectSalesDuplicates: '714156858aca78f073274f9d372067493ebcbb069613b5adc6d51b85a8c69436',
  smartsheetSyncAction: '7bf936a6db5677115b441de13a6f442ea914721a5ad67436d09e9379121c503f',
  sendGmail: '11a4e004a291fbc881f4009f67e3ad97f55b0243527fb75ce793f50012605af7',
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