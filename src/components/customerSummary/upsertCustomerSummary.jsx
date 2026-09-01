// Upsert a CustomerSummary row keyed by client_name. Each save from any
// estimator module appends/updates an entry in `linked_projects` so the
// summary always reflects the latest set of estimates for that client.
//
// Also fires a best-effort push to the external CCS database via the
// `syncCustomerSummaryExternal` backend function, so the other system can
// read/update the client. Failures here are swallowed — we don't block the
// in-app save if the external sync hiccups.

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
    // Find an existing summary for this client (case-insensitive match)
    const existing = await base44.entities.CustomerSummary.filter({ client_name: name });
    let match = (existing || []).find(
      (s) => (s.client_name || "").trim().toLowerCase() === name.toLowerCase()
    );

    const newLink = {
      module,
      project_id,
      project_name: project_name || "",
    };

    if (match) {
      const links = Array.isArray(match.linked_projects) ? [...match.linked_projects] : [];
      // Replace if this same module+project_id already linked, otherwise append.
      const idx = links.findIndex(
        (l) => l.module === module && l.project_id === project_id
      );
      if (idx >= 0) links[idx] = newLink;
      else links.push(newLink);

      await base44.entities.CustomerSummary.update(match.id, {
        linked_projects: links,
        // Keep top-level fields fresh from the latest save
        estimate_number: estimate_number || match.estimate_number || "",
      });
    } else {
      match = await base44.entities.CustomerSummary.create({
        summary_name: name,
        client_name: name,
        estimate_number: estimate_number || "",
        tier_number: 1,
        linked_projects: [newLink],
      });
    }

    // Best-effort push to the external CCS database
    base44.functions
      .invoke("syncCustomerSummaryExternal", {
        client_name: name,
        summary_id: match.id,
        linked_project: newLink,
        estimate_number: estimate_number || "",
      })
      .catch((e) => console.warn("External CCS sync skipped:", e?.message || e));

    return match;
  } catch (e) {
    console.warn("upsertCustomerSummaryForEstimate failed:", e?.message || e);
    return null;
  }
}