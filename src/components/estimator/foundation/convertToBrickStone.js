import { staffEntities } from "@/components/staff/staffEntities";


// Convert a Foundation project into a Brick & Stone draft. Carries the shared
// identity fields; geometry/materials stay at module defaults for recalc.
export async function convertFoundationToBrickStone({ project }) {
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
  return staffEntities.BrickStoneProject.create(payload);
}
