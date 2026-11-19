// Wall cap pricing — ported from SignEstimate Pro (WallCapsTab.jsx).
// A cut cap piece is always charged at FULL stock price; cuts do not reduce price.
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function calcWallCaps(wallCaps = [], inventory = []) {
  const caps = (wallCaps || []).map((cap) => {
    const inv = inventory.find((i) => i.id === cap.cap_inventory_id);
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
      acc[c.cap_inventory_id].cost += c.cost;
      return acc;
    }, {})
  );

  return { caps, byInventory, total: caps.reduce((s, c) => s + c.cost, 0) };
}