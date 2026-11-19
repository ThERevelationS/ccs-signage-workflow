// src/components/jobs/printTemplates/templates/_shared.js
var escapeHtml = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
var clean = (v) => String(v ?? "").trim();
var usd = (n, modelFmt) => {
  const fmt = modelFmt && typeof modelFmt.usd === "function" ? modelFmt.usd : (x) => x == null || !Number.isFinite(Number(x)) ? "" : `$${Number(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return fmt(n);
};
var printedAtText = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? clean(iso) : d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};
var renderAddressLines = (lines) => Array.isArray(lines) && lines.length ? lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("") : `<div style="color:#94a3b8;">&mdash;</div>`;
function htmlDoc({ title, lang = "en", bodyHtml, extraCss = "", autoPrint = true }) {
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #fff; color: #0f172a; }
  table { border-collapse: collapse; }
  @media print {
    .no-print { display: none !important; }
    a { color: inherit; text-decoration: none; }
  }
${extraCss}
</style>
</head>
<body>
${bodyHtml}
${autoPrint ? `<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},60);});<\/script>` : ""}
</body>
</html>`;
}
var asapBadge = (m, label = "ASAP") => m.asap ? `<span style="display:inline-block;background:#dc2626;color:#fff;font-size:9px;font-weight:800;letter-spacing:0.08em;padding:2px 8px;border-radius:3px;vertical-align:middle;">${escapeHtml(label)}</span>` : "";
function companyBlock(company, { align = "left", logoMaxH = 44 } = {}) {
  const c = company || {};
  return `
    <div style="text-align:${align};">
      ${c.logo_url ? `<img src="${escapeHtml(c.logo_url)}" alt="" style="max-height:${logoMaxH}px;max-width:200px;object-fit:contain;display:inline-block;margin-bottom:4px;" />` : ""}
      ${c.name ? `<div style="font-size:15px;font-weight:800;color:#0f172a;">${escapeHtml(c.name)}</div>` : ""}
      <div style="font-size:11px;color:#475569;line-height:1.45;">
        ${renderAddressLines(c.address_lines || [])}
        ${c.phone ? `<div>${escapeHtml(c.phone)}</div>` : ""}
        ${c.email ? `<div>${escapeHtml(c.email)}</div>` : ""}
        ${c.website ? `<div>${escapeHtml(c.website)}</div>` : ""}
      </div>
    </div>`;
}
var fieldLabel = (text) => `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;">${escapeHtml(text)}</div>`;
var metaStrip = (meta, { columns = 4 } = {}) => Array.isArray(meta) && meta.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">` + meta.map(
  (entry) => `<div style="flex:1;min-width:110px;border:1px solid #cbd5e1;border-radius:4px;padding:5px 8px;text-align:center;">${fieldLabel(entry.label)}<div style="font-size:12px;font-weight:600;color:#1e293b;">${escapeHtml(entry.value)}</div></div>`
).join("") + `</div>` : "";

// src/components/jobs/printTemplates/templates/original.js
var th = (label, align = "left") => `<th style="padding:6px 8px;border-bottom:1.5px solid #334155;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.07em;color:#475569;text-align:${align};">${escapeHtml(label)}</th>`;
var td = (content, { align = "left", bold = false, color = "#0f172a", size = 12 } = {}) => `<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:${size}px;color:${color};text-align:${align};${bold ? "font-weight:700;" : ""}">${content}</td>`;
function renderOriginalHtml(model, renderOptions = {}) {
  const m = model || {};
  const rows = Array.isArray(m.rows) ? m.rows : [];
  const materials = Array.isArray(m.materials) ? m.materials : [];
  const tasks = Array.isArray(m.tasks) ? m.tasks : [];
  const t = m.totals || {};
  const ti = t.internal || {};
  const fmt = m.fmt;
  const money = (n) => escapeHtml(usd(n, fmt));
  const productRows = rows.length ? rows.map((r, i) => {
    const bg = i % 2 ? "#f8fafc" : "#fff";
    return `<tr style="background:${bg};">` + td(`<span style="color:#64748b;">${escapeHtml(r.line ?? i + 1)}</span>`, { align: "right" }) + td(escapeHtml(r.name || "Item"), { bold: true }) + td(escapeHtml(r.type || "\u2014")) + td(escapeHtml(r.qty === "" || r.qty == null ? "\u2014" : r.qty), { align: "center" }) + td(money(r.unit_price), { align: "right" }) + td(money(r.ext_price), { align: "right", bold: true }) + td(`<span style="color:#64748b;">${money(r.internal?.unit_cost)}</span>`, { align: "right" }) + td(`<span style="color:#64748b;">${money(r.internal?.ext_cost)}</span>`, { align: "right" }) + td(`<span style="color:#64748b;">${money(r.internal?.margin)}</span>`, { align: "right" }) + td(escapeHtml(r.status || "\u2014"), { size: 11 }) + `</tr>`;
  }).join("") : `<tr><td colspan="10" style="padding:14px;text-align:center;font-size:12px;color:#94a3b8;">No products on this work order.</td></tr>`;
  const materialRows = materials.length ? materials.map(
    (mat, i) => `<tr style="background:${i % 2 ? "#f8fafc" : "#fff"};">` + td(escapeHtml(mat.name) + (mat.reinforcement_note ? '<div style="font-size:9px;font-weight:400;line-height:1.4;color:#64748b;margin-top:3px;overflow-wrap:anywhere;">' + escapeHtml(mat.reinforcement_note) + "</div>" : ""), { bold: true }) + td(escapeHtml(mat.type || "\u2014")) + td(escapeHtml(mat.section || "\u2014"), { size: 11 }) + td(escapeHtml(`${mat.qty === "" || mat.qty == null ? "\u2014" : mat.qty}${mat.unit ? ` ${mat.unit}` : ""}`), { align: "center" }) + td(money(mat.unit_cost), { align: "right" }) + td(money(mat.ext_cost), { align: "right" }) + `</tr>`
  ).join("") : "";
  const totalsRows = [
    ["Products Subtotal", t.subtotal],
    t.estimate_amount != null ? ["Contract Total (estimate)", t.estimate_amount] : null,
    t.deposit_required || t.deposit_amount != null ? [`Deposit Required${t.deposit_invoiced ? " (invoiced)" : ""}`, t.deposit_amount] : null,
    t.balance_due != null && t.deposit_amount != null ? ["Balance After Deposit", t.balance_due] : null,
    ti.total_cost != null ? ["Internal Cost", ti.total_cost] : null,
    ti.total_margin != null ? [`Internal Margin${ti.margin_pct != null ? ` (${ti.margin_pct}%)` : ""}`, ti.total_margin] : null,
    ti.actual_cost != null ? ["Actual Cost To Date", ti.actual_cost] : null,
    ti.profit_margin != null ? ["Profit Margin", ti.profit_margin] : null
  ].filter(Boolean);
  const totalsHtml = `
    <table style="width:280px;margin-left:auto;margin-top:10px;border:1.5px solid #334155;">
      ${totalsRows.map(([label, value], i) => {
    const strong = /Subtotal|Contract|Balance/.test(label);
    return `<tr style="background:${strong ? "#f1f5f9" : "#fff"};"><td style="padding:5px 10px;font-size:11px;color:#475569;border-bottom:1px solid #e2e8f0;">${escapeHtml(label)}</td><td style="padding:5px 10px;font-size:12px;text-align:right;border-bottom:1px solid #e2e8f0;${strong ? "font-weight:800;color:#0f172a;" : "color:#334155;"}">${money(value)}</td></tr>`;
  }).join("")}
    </table>`;
  const taskRows = tasks.map(
    (task) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;width:26px;text-align:center;"><span style="display:inline-block;width:11px;height:11px;border:1.5px solid #334155;border-radius:2px;background:${task.completed ? "#334155" : "#fff"};"></span></td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;${task.completed ? "color:#94a3b8;text-decoration:line-through;" : "color:#0f172a;"}">${escapeHtml(task.text)}${task.is_milestone ? ' <span style="font-size:9px;font-weight:800;color:#7c3aed;">MILESTONE</span>' : ""}</td><td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b;white-space:nowrap;">${escapeHtml([task.assigned_to, task.due_date].filter(Boolean).join(" \xB7 "))}</td></tr>`
  ).join("");
  const bodyHtml = `
<div style="max-width:8.5in;margin:0 auto;padding:0.3in;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2.5px solid #0f172a;padding-bottom:10px;">
    ${companyBlock(m.company)}
    <div style="text-align:right;">
      <div style="font-size:22px;font-weight:800;letter-spacing:0.06em;color:#0f172a;text-transform:uppercase;">
        ${escapeHtml(m.document_title || "Work Order")}
      </div>
      <div style="font-size:12px;color:#475569;margin-top:2px;">
        Order <span style="font-weight:700;color:#0f172a;">${escapeHtml(m.order_number)}</span>
      </div>
      ${m.job_code ? `<div style="font-size:10px;color:#94a3b8;font-family:monospace;margin-top:2px;">${escapeHtml(m.job_code)}</div>` : ""}
      <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Printed ${escapeHtml(printedAtText(m.printed_at))}</div>
      <div style="margin-top:4px;">${asapBadge(m)}${m.completed ? ' <span style="display:inline-block;background:#059669;color:#fff;font-size:9px;font-weight:800;letter-spacing:0.08em;padding:2px 8px;border-radius:3px;">COMPLETED</span>' : ""}</div>
    </div>
  </div>

  <div style="display:flex;gap:12px;margin-top:10px;">
    <div style="flex:1;border:1.5px solid #334155;border-radius:4px;padding:10px 12px;">
      ${fieldLabel("Bill To")}
      <div style="font-size:13px;font-weight:700;color:#0f172a;margin-top:2px;">${escapeHtml(m.bill_to?.name || "\u2014")}</div>
      ${m.bill_to?.attention ? `<div style="font-size:11px;color:#475569;">Attn: ${escapeHtml(m.bill_to.attention)}</div>` : ""}
      <div style="font-size:12px;color:#0f172a;line-height:1.5;margin-top:2px;">${renderAddressLines(m.bill_to?.address_lines || [])}</div>
      ${m.bill_to?.phone || m.bill_to?.email ? `<div style="font-size:11px;color:#475569;margin-top:2px;">${[m.bill_to.phone, m.bill_to.email].filter(Boolean).map(escapeHtml).join(" &middot; ")}</div>` : ""}
    </div>
    <div style="flex:1;border:1.5px solid #334155;border-radius:4px;padding:10px 12px;">
      ${fieldLabel("Install Site")}
      <div style="font-size:12px;color:#0f172a;line-height:1.5;margin-top:2px;">${renderAddressLines(m.ship_to?.address_lines || [])}</div>
      ${m.ship_to?.attention ? `<div style="font-size:11px;color:#475569;">Attn: ${escapeHtml(m.ship_to.attention)}</div>` : ""}
    </div>
  </div>

  ${m.work_order_title ? `<div style="margin-top:10px;"><div style="font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(m.work_order_title)}</div></div>` : ""}
  ${m.description ? `<div style="margin-top:4px;font-size:12px;color:#334155;white-space:pre-wrap;">${escapeHtml(m.description)}</div>` : ""}

  ${metaStrip(m.meta)}

  <table style="width:100%;margin-top:12px;border:1.5px solid #334155;">
    <thead>
      <tr style="background:#f1f5f9;">
        ${th("#", "right")}${th("Product / Description")}${th("Type")}${th("Qty", "center")}
        ${th("Unit Price", "right")}${th("Ext Price", "right")}
        ${th("Unit Cost", "right")}${th("Ext Cost", "right")}${th("Margin", "right")}
        ${th("Status")}
      </tr>
    </thead>
    <tbody>${productRows}</tbody>
  </table>
  <div style="margin-top:4px;font-size:10px;color:#64748b;">
    ${rows.length} line${rows.length === 1 ? "" : "s"}${m.piece_count ? ` \xB7 ${escapeHtml(m.piece_count)} total pieces` : ""}
  </div>

  ${totalsHtml}

  ${materials.length ? `<div style="margin-top:14px;page-break-inside:avoid;">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#475569;border-bottom:1px solid #cbd5e1;padding-bottom:3px;">
          Materials Manifest (internal) \u2014 ${materials.length}
        </div>
        <table style="width:100%;margin-top:6px;">
          <thead><tr style="background:#f8fafc;">${th("Part")}${th("Type")}${th("Section")}${th("Qty", "center")}${th("Unit Cost", "right")}${th("Ext Cost", "right")}</tr></thead>
          <tbody>${materialRows}</tbody>
        </table>
      </div>` : ""}

  ${tasks.length ? `<div style="margin-top:14px;">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#475569;border-bottom:1px solid #cbd5e1;padding-bottom:3px;">
          Production Checklist \u2014 ${m.task_counts?.done ?? 0}/${m.task_counts?.total ?? tasks.length} done
        </div>
        <table style="width:100%;margin-top:4px;">${taskRows}</table>
      </div>` : ""}

  <div style="display:flex;gap:24px;margin-top:26px;page-break-inside:avoid;">
    ${["Received By", "Approved By", "Date"].map(
    (lbl) => `<div style="flex:1;"><div style="height:26px;border-bottom:1px solid #94a3b8;"></div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;padding-top:2px;text-align:center;">${escapeHtml(lbl)}</div></div>`
  ).join("")}
  </div>

  <div style="display:flex;justify-content:space-between;margin-top:20px;padding-top:6px;border-top:1px solid #cbd5e1;font-size:9px;color:#94a3b8;">
    <span>${escapeHtml(m.footer_note || "")}</span>
    <span>${escapeHtml(m.document_title || "Work Order")} &mdash; ${escapeHtml(m.order_number)}${m.job_code ? ` (${escapeHtml(m.job_code)})` : ""}</span>
  </div>
</div>`;
  return htmlDoc({
    title: `${m.document_title || "Work Order"} \u2014 ${m.order_number || ""}`,
    bodyHtml,
    autoPrint: renderOptions.autoPrint !== false,
    extraCss: `
  @page { margin: 0.55in; }
  .sheet { max-width: 8.5in; }
    `
  });
}
var original_default = {
  id: "original",
  label: "Original",
  renderHtml: renderOriginalHtml
};
export {
  original_default as default,
  renderOriginalHtml
};
