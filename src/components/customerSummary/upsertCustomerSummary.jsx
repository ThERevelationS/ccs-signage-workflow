// Upsert a CustomerSummary row keyed by client_name. Each save from any
// estimator module appends/updates an entry in `linked_projects` so the
// summary always reflects the latest set of estimates for that client.
//
// In SignEstimate Pro this helper also pushed the summary into the separate CCS
// app. This code now runs inside CCS itself, so the local CustomerSummary row is
// already the authoritative destination and no cross-app sync is necessary.

import { base44 } from "@/api/base44Client";

/**
 * @param {object} args
 * @param {string} args.module           - one of "channel_letter_installation" | "foundation" | "brick_stone" | "paint" | "laser" | "cnc" | "metal_fabrication"
 * @param {string} args.client_name      - the client name typed/picked in the estimator
 * @param {string} args.project_id       - id of the just-saved project record
 * @param {string} args.project_name     - friendly project name
 * @param {string} [args.estimate_number]
 */
export async function upsertCustomerSummaryForEstimate({
  module,
  client_name,
  project_id,
  project_name,
  estimate_number,
}) {
  const name = (client_name || "").trim();
  if (!name || !module || !project_id) return null;

  try {
    const response = await base44.functions.invoke("ensureCustomerSummary", {
      module,
      client_name: name,
      project_id,
      project_name: project_name || "",
      estimate_number: estimate_number || "",
    });
    if (response?.data?.error) throw new Error(response.data.error);
    return response?.data?.summary || null;
  } catch (e) {
    // CustomerSummary is estimator convenience metadata, not the pricing/source
    // record itself. Preserve the existing best-effort save semantics: a summary
    // failure is visible in logs but does not block the Builder/source save.
    console.warn("upsertCustomerSummaryForEstimate failed:", e?.message || e);
    return null;
  }
}