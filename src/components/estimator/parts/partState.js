export function requiresBuilderReattach(part) {
  if (!part || part.is_active === false) return false;
  if (part.builder_sync_state === "detached_override") return true;
  if (part.builder_sync_state === "manual_addon") return false;
  return ["detached", "reattach_available"].includes(part.inventory_link_state);
}

export function countBuilderReattachParts(parts = []) {
  return (parts || []).filter(requiresBuilderReattach).length;
}
