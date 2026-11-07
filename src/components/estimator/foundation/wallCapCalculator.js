// Wall cap pricing - ported from SignEstimate Pro (WallCapsTab.jsx).
// A cut cap piece is always charged at FULL stock price; cuts do not reduce price.
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const stockPriceNumber = value => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const known = value => typeof value === "number" && Number.isFinite(value);
const assigned = id => (typeof id === "string" && id.trim() !== "")
  || (typeof id === "number" && Number.isFinite(id));
const sumKnown = rows => {
  let total = 0;
  for (const row of rows) {
    if (!known(row.cost)) return null;
    total += row.cost;
    if (!Number.isFinite(total)) return null;
  }
  return total;
};

export function calcWallCaps(wallCaps = [], inventory = []) {
  const issues = [];
  const caps = (wallCaps || []).map((cap, index) => {
    const id = cap.cap_inventory_id;
    const issue = (field, code, message) => issues.push({
      kind: "wall_cap", index, componentId: cap.component_id ?? cap.id ?? null,
      field, inventoryId: assigned(id) ? id : null, code,
      message: `Wall cap ${index + 1}: ${message}`,
    });
    const matches = assigned(id) ? inventory.filter(row => row?.id === id) : [];
    if (matches.length !== 1) {
      issue("cap_inventory_id", !assigned(id) ? "catalog_item_unassigned"
        : matches.length > 1 ? "catalog_item_ambiguous" : "catalog_item_unavailable",
      !assigned(id) ? "select a catalog material." : matches.length > 1
        ? "the selected catalog ID is ambiguous; refresh the catalog." : "selected catalog material is unavailable.");
      return { ...cap };
    }
    const inv = matches[0];
    if (inv.material_type !== "wall_cap") {
      issue("cap_inventory_id", "catalog_item_type_mismatch", "the selected catalog material is not a wall cap.");
      return { ...cap };
    }
    const rate = stockPriceNumber(inv.cap_stock_price);
    if (rate === null || rate < 0) {
      issue("cap_stock_price", "wall_cap_stock_price_unavailable",
        "record a finite nonnegative full-stock price; a missing price is not zero. Saved amounts are retained.");
      return { ...cap };
    }
    return {
      ...cap,
      cap_name: inv.material_name || "",
      stock_length_inches: num(inv?.cap_stock_length_inches),
      cost: rate,
    };
  });

  const byInventory = Object.values(
    caps.reduce((acc, c) => {
      if (!c.cap_inventory_id) return acc;
      acc[c.cap_inventory_id] = acc[c.cap_inventory_id] || {
        id: c.cap_inventory_id,
        name: c.cap_name,
        qty: 0,
        cost: 0,
      };
      acc[c.cap_inventory_id].qty += 1;
      acc[c.cap_inventory_id].cost += num(c.cost);
      return acc;
    }, {})
  );

  return { caps, byInventory, total: caps.reduce((s, c) => s + num(c.cost), 0) };
}