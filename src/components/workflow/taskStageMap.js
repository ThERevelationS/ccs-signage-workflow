// Which workflow stage a job belongs in, given its current task description.
// The admin "page" tag on a salesTaskDescriptions item wins (it is what the
// stage pages themselves filter on); this list covers untagged descriptions.
// null = the description does not move the job (closed/lost/SIPs etc.).
const DEFAULT_TASK_STAGE = {
  "Prospect Initiation (Gather Info, Initial Discuss ...)": "sales",
  "Conduct Site Survey": "sales",
  "Research Sign Code for Mock-up": "design",
  "Mock up and Send to Customer": "design",
  "Mock up Only": "design",
  "Send Mock up to Customer": "design",
  "Quoting - 3rd Party": "estimating",
  "Complete Estimate for Review": "estimating",
  "Estimate - To Be Reviewed": "estimating",
  "Review Complete - Send to Customer": "sales",
  "Estimate Sent to Customer": "sales",
  "Waiting on Deposit": "sales",
  "Follow up with Customer - Pre-Estimating": "sales",
  "Follow up with Customer - Post-Estimate": "sales",
  "On Hold - Follow Up with Customer": "sales",
  "WIP - Waiting for Deposit": "sales",
  "WIP - In Final Design Queue": "design",
  "WIP - Designing": "design",
  "WIP - Prepare/Submit Permit": "permitting",
  "WIP - Prepare Permit Docs for Customer": "permitting",
  "WIP - Follow Up On Status of Accepted Permit": "permitting",
  "WIP - Permitting Follow-ups": "permitting",
  "WIP - Production/Fabrication": "production",
  "WIP - Outsourced Fabrication": "fabrication",
  "WIP - Maintenance/Service Call": "installation",
  "WIP - Installation": "installation",
  "WIP - Outsourced Installation": "installation",
  "WIP - Inspections": "installation",
  "Completed Sale - Electrical Inspection": "installation",
  "Completed Sale - Sign Inspection": "installation",
};

const PAGE_STAGE = {
  Estimating: "estimating",
  Permitting: "permitting",
  Design: "design",
  Production: "production",
  Fabrication: "fabrication",
  Installation: "installation",
};

// items: salesTaskDescriptions setting items ({ text, page } or plain strings).
export function stageForTaskDescription(description, items = []) {
  const text = String(description || "").trim();
  if (!text) return null;
  const item = items.find((i) => String(i?.text ?? i).trim() === text);
  return PAGE_STAGE[item?.page] || DEFAULT_TASK_STAGE[text] || null;
}
