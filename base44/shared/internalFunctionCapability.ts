// Internal function-to-function invoke capability. Deployed function URLs are
// reachable by anonymous browser invokes, so purely internal endpoints (ones no
// client ever calls) verify a shared backend capability instead of trusting
// "no user" — a browser invoke also has no user. The raw token lives only in
// backend bundles; it is never shipped to clients.
export const INTERNAL_FUNCTION_CAPABILITY = 'IvzeHEFU7jrABwtGZELCYWKKILlF76bKK1guqFP_m37qzvtRGUJ7f4-_0SM9ceUk';

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function hasInternalFunctionCapability(body: unknown) {
  const token = String((body as any)?._internal_capability || '').trim();
  if (token.length < 40 || token.length > 128) return false;
  return constantTimeEqual(token, INTERNAL_FUNCTION_CAPABILITY);
}
