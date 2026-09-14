const OBVIOUS_PLACEHOLDER_CLIENT_NAMES = new Set(["test", "asdf"]);

export const isLikelySalesPlaceholder = (workOrder) => {
  if (!workOrder) return false;
  const clientName = String(workOrder?.client_name || "").trim().toLowerCase();
  return OBVIOUS_PLACEHOLDER_CLIENT_NAMES.has(clientName);
};

export const getSalesPlaceholderReason = (workOrder) => {
  if (!isLikelySalesPlaceholder(workOrder)) return "";
  return `Customer name is exactly “${String(workOrder?.client_name || "").trim()}”, which matches an explicit placeholder/test name.`;
};
