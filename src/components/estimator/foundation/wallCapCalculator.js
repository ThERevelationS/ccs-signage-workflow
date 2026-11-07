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
  const caps = (wallCaps || []).map((cap) => {
    const inv = inventory.find((i) => i.id === cap.cap_inventory_id);
    if (!inv) return { ...cap };
    return {
      ...cap,
      cap_name: inv?.material_name || "",
      stock_length_inches: num(inv?.cap_stock_length_inches),
      cost: num(inv?.cap_stock_price),
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