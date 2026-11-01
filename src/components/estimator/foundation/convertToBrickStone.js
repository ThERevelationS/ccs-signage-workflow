import { staffEntities } from "@/components/staff/staffEntities";
import { ensureIdempotentEntityCreate, newCreationRequestKey } from "@/components/estimator/idempotentEntityCreate";

// Convert a Foundation project into a Brick & Stone draft (#77). Carries the
// shared identity fields; geometry/materials stay at module defaults for
// recalc, and the Foundation source is never modified. The optional
// attemptRef holds a signature-stable creation_request_key so a double-click
// or a lost response reuses the same draft instead of creating duplicates.
export async function convertFoundationToBrickStone({ project, attemptRef } = {}) {
  if (!project?.id) throw new Error("Save the Foundation project before converting.");
  const sourceName = String(project.project_name || "Foundation").trim();
  const payload = {
    project_name: `${sourceName} (Brick & Stone)`,
    client_name: String(project.client_name || "").trim(),
    customer_id: String(project.customer_id || "").trim() || undefined,
    estimate_number: String(project.estimate_number || "").trim() || undefined,
    hyperlink: String(project.hyperlink || "").trim() || undefined,
    status: "draft",
    notes: `Converted from Foundation project "${sourceName}" (${project.id}). Re-enter masonry dimensions to calculate.`,
  };
  const signature = JSON.stringify(payload);
  if (attemptRef && attemptRef.current?.signature !== signature) {
    attemptRef.current = { signature, key: newCreationRequestKey("foundation_to_brick_stone") };
  }
  const key = attemptRef?.current?.key || newCreationRequestKey("foundation_to_brick_stone");
  const created = await ensureIdempotentEntityCreate({
    entity: staffEntities.BrickStoneProject,
    keyField: "creation_request_key",
    key,
    data: payload,
    label: "Brick & Stone draft",
  });
  if (!created?.id) throw new Error("Brick & Stone draft could not be verified.");
  return created;
}
