// O-012 harness stub: no open estimate revisions in the synthetic store.
export async function getOpenEstimateRevision() { return null; }
export async function ensureEstimateLifecycleRevision() { return null; }
export async function startEstimateRevision() { throw new Error("harness: no revision service"); }
export async function completeEstimateRevision() { return null; }
export async function attachQuoteDeliveryEvidenceToIssuanceRevision() { return null; }
export const quoteRejectRevisionKey = () => "";
export const supersedeAcceptanceRevisionKey = () => "";
