// Original work-order print — the classic portrait shop copy. Prints
// everything: customer prices AND internal cost/margin columns plus the
// materials manifest, so production keeps the full financial picture on one
// sheet. Portrait @page.

import {
  asapBadge,
  clean,
  companyBlock,
  escapeHtml,
  fieldLabel,
  htmlDoc,
  metaStrip,
  printedAtText,
  renderAddressLines,
  usd,
} from "./_shared";

const th = (label, align = "left") =>
  `<th style="padding:6px 8px;border-bottom:1.5px solid #334155;font-size:9px;font-weight:800;` +
  `text-transform:uppercase;letter-spacing:0.07em;color:#475569;text-align:${align};">${escapeHtml(label)}</th>`;

const td = (content, { align = "left", bold = false, color = "#0f172a", size = 12 } = {}) =>
  `<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:${size}px;` +
  `color:${color};text-align:${align};${bold ? "font-weight:700;" : ""}">${content}</td>`;

export function renderOriginalHtml(model, renderOptions = {}) {
  const m = model || {};
  const rows = Array.isArray(m.rows) ? m.rows : [];
  const materials = Array.isArray(m.materials) ? m.materials : [];
  const tasks = Array.isArray(m.tasks) ? m.tasks : [];
  const t = m.totals || {};
  const ti = t.internal || {};
  const fmt = m.fmt;
  const money = (n) => escapeHtml(usd(n, fmt));

  const productRows = rows.length
    ? rows.map((r, i) => {
        const bg = i % 2 ? "#f8fafc" : "#fff";
        return `<tr style="background:${bg};">` +
          td(`<span style="color:#64748b;">${escapeHtml(r.line ?? i + 1)}</span>`, { align: "right" }) +
          td(escapeHtml(r.name || "Item"), { bold: true }) +
          td(escapeHtml(r.type || "—")) +
          td(escapeHtml(r.qty === "" || r.qty == null ? "—" : r.qty), { align: "center" }) +
          td(money(r.unit_price), { align: "right" }) +
          td(money(r.ext_price), { align: "right", bold: true }) +
          td(`<span style="color:#64748b;">${money(r.internal?.unit_cost)}</span>`, { align: "right" }) +
          td(`<span style="color:#64748b;">${money(r.internal?.ext_cost)}</span>`, { align: "right" }) +
          td(`<span style="color:#64748b;">${money(r.internal?.margin)}</span>`, { align: "right" }) +
          td(escapeHtml(r.status || "—"), { size: 11 }) +
          `</tr>`;
      }).join("")
    : `<tr><td colspan="10" style="padding:14px;text-align:center;font-size:12px;color:#94a3b8;">No products on this work order.</td></tr>`;

  const materialRows = materials.length
    ? materials.map((mat, i) =>
        `<tr style="background:${i % 2 ? "#f8fafc" : "#fff"};">` +
          td(escapeHtml(mat.name), { bold: true }) +
          td(escapeHtml(mat.type || "—")) +
          td(escapeHtml(mat.section || "—"), { size: 11 }) +
          td(escapeHtml(`${mat.qty === "" || mat.qty == null ? "—" : mat.qty}${mat.unit ? ` ${mat.unit}` : ""}`), { align: "center" }) +
          td(money(mat.unit_cost), { align: "right" }) +
          td(money(mat.ext_cost), { align: "right" }) +
        `</tr>`
      ).join("")
    : "";

  const totalsRows = [
    ["Products Subtotal", t.subtotal],
    t.estimate_amount != null ? ["Contract Total (estimate)", t.estimate_amount] : null,
    t.deposit_required || t.deposit_amount != null
      ? [`Deposit Required${t.deposit_invoiced ? " (invoiced)" : ""}`, t.deposit_amount]
      : null,
    t.balance_due != null && t.deposit_amount != null ? ["Balance After Deposit", t.balance_due] : null,
    ti.total_cost != null ? ["Internal Cost", ti.total_cost] : null,
    ti.total_margin != null
      ? [`Internal Margin${ti.margin_pct != null ? ` (${ti.margin_pct}%)` : ""}`, ti.total_margin]
      : null,
    ti.actual_cost != null ? ["Actual Cost To Date", ti.actual_cost] : null,
    ti.profit_margin != null ? ["Profit Margin", ti.profit_margin] : null,
  ].filter(Boolean);

  const totalsHtml = `
    <table style="width:280px;margin-left:auto;margin-top:10px;border:1.5px solid #334155;">
      ${totalsRows.map(([label, value], i) => {
        const strong = /Subtotal|Contract|Balance/.test(label);
        return `<tr style="background:${strong ? "#f1f5f9" : "#fff"};">` +
          `<td style="padding:5px 10px;font-size:11px;color:#475569;border-bottom:1px solid #e2e8f0;">${escapeHtml(label)}</td>` +
          `<td style="padding:5px 10px;font-size:12px;text-align:right;border-bottom:1px solid #e2e8f0;${strong ? "font-weight:800;color:#0f172a;" : "color:#334155;"}">${money(value)}</td>` +
          `</tr>`;
      }).join("")}
    </table>`;

  const taskRows = tasks.map((task) =>
    `<tr>` +
    `<td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;width:26px;text-align:center;">` +
    `<span style="display:inline-block;width:11px;height:11px;border:1.5px solid #334155;border-radius:2px;background:${task.completed ? "#334155" : "#fff"};"></span></td>` +
    `<td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;${task.completed ? "color:#94a3b8;text-decoration:line-through;" : "color:#0f172a;"}">` +
    `${escapeHtml(task.text)}${task.is_milestone ? ' <span style="font-size:9px;font-weight:800;color:#7c3aed;">MILESTONE</span>' : ""}</td>` +
    `<td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b;white-space:nowrap;">${escapeHtml([task.assigned_to, task.due_date].filter(Boolean).join(" · "))}</td>` +
    `</tr>`
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
      <div style="font-size:13px;font-weight:700;color:#0f172a;margin-top:2px;">${escapeHtml(m.bill_to?.name || "—")}</div>
      ${m.bill_to?.attention ? `<div style="font-size:11px;color:#475569;">Attn: ${escapeHtml(m.bill_to.attention)}</div>` : ""}
      <div style="font-size:12px;color:#0f172a;line-height:1.5;margin-top:2px;">${renderAddressLines(m.bill_to?.address_lines || [])}</div>
      ${m.bill_to?.phone || m.bill_to?.email
        ? `<div style="font-size:11px;color:#475569;margin-top:2px;">${[m.bill_to.phone, m.bill_to.email].filter(Boolean).map(escapeHtml).join(" &middot; ")}</div>`
        : ""}
    </div>
    <div style="flex:1;border:1.5px solid #334155;border-radius:4px;padding:10px 12px;">
      ${fieldLabel("Install Site")}
      <div style="font-size:12px;color:#0f172a;line-height:1.5;margin-top:2px;">${renderAddressLines(m.ship_to?.address_lines || [])}</div>
      ${m.ship_to?.attention ? `<div style="font-size:11px;color:#475569;">Attn: ${escapeHtml(m.ship_to.attention)}</div>` : ""}
    </div>
  </div>

  ${m.work_order_title
    ? `<div style="margin-top:10px;"><div style="font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(m.work_order_title)}</div></div>`
    : ""}
  ${m.description
    ? `<div style="margin-top:4px;font-size:12px;color:#334155;white-space:pre-wrap;">${escapeHtml(m.description)}</div>`
    : ""}

  ${metaStrip(m.meta)}

  <div class="wo-table-scroll" role="region" aria-label="Work Order products" tabindex="0">
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
  </div>
  <div style="margin-top:4px;font-size:10px;color:#64748b;">
    ${rows.length} line${rows.length === 1 ? "" : "s"}${m.piece_count ? ` · ${escapeHtml(m.piece_count)} total pieces` : ""}
  </div>

  ${totalsHtml}

  ${materials.length
    ? `<div style="margin-top:14px;page-break-inside:avoid;">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#475569;border-bottom:1px solid #cbd5e1;padding-bottom:3px;">
          Materials Manifest (internal) — ${materials.length}
        </div>
        <div class="wo-table-scroll" role="region" aria-label="Work Order materials" tabindex="0">
        <table style="width:100%;margin-top:6px;">
          <thead><tr style="background:#f8fafc;">${th("Part")}${th("Type")}${th("Section")}${th("Qty", "center")}${th("Unit Cost", "right")}${th("Ext Cost", "right")}</tr></thead>
          <tbody>${materialRows}</tbody>
        </table>
        </div>
      </div>`
    : ""}

  ${tasks.length
    ? `<div style="margin-top:14px;">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#475569;border-bottom:1px solid #cbd5e1;padding-bottom:3px;">
          Production Checklist — ${m.task_counts?.done ?? 0}/${m.task_counts?.total ?? tasks.length} done
        </div>
        <table style="width:100%;margin-top:4px;">${taskRows}</table>
      </div>`
    : ""}

  <div style="display:flex;gap:24px;margin-top:26px;page-break-inside:avoid;">
    ${["Received By", "Approved By", "Date"].map((lbl) =>
      `<div style="flex:1;"><div style="height:26px;border-bottom:1px solid #94a3b8;"></div>` +
      `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;padding-top:2px;text-align:center;">${escapeHtml(lbl)}</div></div>`
    ).join("")}
  </div>

  <div style="display:flex;justify-content:space-between;margin-top:20px;padding-top:6px;border-top:1px solid #cbd5e1;font-size:9px;color:#94a3b8;">
    <span>${escapeHtml(m.footer_note || "")}</span>
    <span>${escapeHtml(m.document_title || "Work Order")} &mdash; ${escapeHtml(m.order_number)}${m.job_code ? ` (${escapeHtml(m.job_code)})` : ""}</span>
  </div>
</div>`;

  return htmlDoc({
    title: `${m.document_title || "Work Order"} — ${m.order_number || ""}`,
    bodyHtml,
    autoPrint: renderOptions.autoPrint !== false,
    extraCss: `
  @page { margin: 0.55in; }
  .sheet { max-width: 8.5in; }
  .wo-table-scroll { max-width: 100%; overflow-x: auto; }
  @media print { .wo-table-scroll { max-width: none; overflow: visible; } }
    `,
  });
}

export default {
  id: "original",
  label: "Original",
  renderHtml: renderOriginalHtml,
};
