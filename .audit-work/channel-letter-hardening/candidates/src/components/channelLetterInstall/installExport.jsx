// Export helpers for Channel Letter Installation estimates
import { TYPE_LABELS, SIZE_LABELS } from "./installCalculator";

// Held/unavailable values export as "—" instead of laundering into $0.00.
const fmt = (v) => (Number.isFinite(v) ? `$${v.toFixed(2)}` : "—");
const fixed = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : "—");

export const buildSummaryText = (project) => {
  const lines = [];
  lines.push(`CHANNEL LETTER INSTALLATION ESTIMATE`);
  lines.push(`================================`);
  lines.push(`Project: ${project.project_name || "-"}`);
  lines.push(`Client:  ${project.client_name || "-"}`);
  lines.push(`Est #:   ${project.estimate_number || "-"}`);
  if (project.hyperlink) lines.push(`Link:    ${project.hyperlink}`);
  lines.push("");
  lines.push(`LINE ITEMS`);
  lines.push(`----------`);
  (project.items || []).forEach((it, i) => {
    const label = it.description || TYPE_LABELS[it.installation_type] || "Item";
    lines.push(`${i + 1}. ${label} — ${TYPE_LABELS[it.installation_type] || it.installation_type}`);
    if (it.installation_type === "raceway") {
      lines.push(`   Raceway: ${it.raceway_length_feet} ft · ${it.qty_letters} letters`);
    } else {
      lines.push(`   ${it.qty_letters} letters · ${SIZE_LABELS[it.letter_size] || it.letter_size}`);
    }
    lines.push(`   Height: ${it.installation_height_feet} ft`);
    const conds = [];
    if (it.thick_hollow_walls) conds.push("Thick/Hollow Walls");
    if (it.parapet) conds.push("Parapet");
    if (it.poor_electrical_access) conds.push("Poor Electrical");
    if (conds.length) lines.push(`   Conditions: ${conds.join(", ")}`);
    lines.push(`   Labor: ${fixed(it.labor_hours)} hrs (${fmt(it.labor_cost)})${it.__held ? " — saved values (not repriced)" : ""}`);
    lines.push(`   Materials: ${fmt(it.materials_cost)}`);
    lines.push(`   Item Total: ${fmt(it.item_total_cost)}`);
    lines.push("");
  });
  lines.push(`TOTALS${project.__held ? " (saved amounts — not current pricing)" : ""}`);
  lines.push(`------`);
  lines.push(`Labor:        ${fmt(project.labor_cost)} (${fixed(project.labor_hours)} hrs)`);
  lines.push(`Materials:    ${fmt(project.total_materials_cost)}`);
  lines.push(`Supplies:     ${fmt(project.total_supplies_cost)}`);
  lines.push(`Subtotal:     ${fmt(project.subtotal)}`);
  if ((project.markup_percent || 0) > 0) {
    lines.push(`Markup (${project.markup_percent}%): ${fmt(project.markup_amount)}`);
  }
  lines.push(`TOTAL:        ${fmt(project.total_cost)}`);
  if (project.notes) {
    lines.push("");
    lines.push(`Notes: ${project.notes}`);
  }
  return lines.join("\n");
};

export const downloadCSV = (project) => {
  const rows = [["#", "Description", "Type", "Qty Letters", "Size", "Raceway Ft", "Height Ft", "Labor Hrs", "Labor $", "Materials $", "Item Total $"]];
  (project.items || []).forEach((it, i) => {
    rows.push([
      i + 1,
      it.description || "",
      TYPE_LABELS[it.installation_type] || it.installation_type,
      it.qty_letters || 0,
      SIZE_LABELS[it.letter_size] || it.letter_size || "",
      it.raceway_length_feet || 0,
      it.installation_height_feet || 0,
      fixed(it.labor_hours),
      fixed(it.labor_cost),
      fixed(it.materials_cost),
      fixed(it.item_total_cost),
    ]);
  });
  rows.push([]);
  rows.push(["", "", "", "", "", "", "", "Labor Total", fixed(project.labor_cost), "Materials", fixed(project.total_materials_cost)]);
  rows.push(["", "", "", "", "", "", "", "Supplies", fixed(project.total_supplies_cost), "Subtotal", fixed(project.subtotal)]);
  if ((project.markup_percent || 0) > 0) {
    rows.push(["", "", "", "", "", "", "", `Markup ${project.markup_percent}%`, fixed(project.markup_amount), "", ""]);
  }
  rows.push(["", "", "", "", "", "", "", "TOTAL", fixed(project.total_cost), "", ""]);

  const csv = rows.map(r => r.map(cell => {
    const s = String(cell ?? "");
    return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(project.project_name || "estimate").replace(/[^a-z0-9]/gi, "_")}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};