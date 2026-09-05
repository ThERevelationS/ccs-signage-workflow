import { base44 } from "@/api/base44Client";

export function newEstimateCreationKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `estimate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function ensureNewEstimate({ creationKey, estimate }) {
  const key = String(creationKey || "").trim();
  if (!key) throw new Error("Estimate creation key is required.");
  const response = await base44.functions.invoke("ensureNewEstimate", {
    creation_key: key,
    estimate,
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.estimate?.id) throw new Error("The new Estimate could not be verified after creation.");
  return result.estimate;
}
