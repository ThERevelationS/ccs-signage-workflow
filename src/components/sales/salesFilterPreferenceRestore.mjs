export function resolveRestoredSalesFilterModes(informationFilter = "all", attentionFilter = "all") {
  const information = String(informationFilter || "all");
  const attention = String(attentionFilter || "all");
  const hadConflict = information !== "all" && attention !== "all";

  return {
    informationFilter: information,
    attentionFilter: hadConflict ? "all" : attention,
    hadConflict,
  };
}
