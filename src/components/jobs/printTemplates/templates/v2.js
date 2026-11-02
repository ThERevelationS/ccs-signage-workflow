// v2 work-order print — the modern redesign: two-column header (brand block
// left, order card right) and every section wrapped in a rounded card.
// Customer prices print; internal cost/margin is condensed into a single
// muted shop-summary strip inside the totals card. Portrait @page.

import {
  asapBadge,
  escapeHtml,
  fieldLabel,
  htmlDoc,
  printedAtText,
  renderAddressLines,
  usd,
} from "./_shared";

const ACCENT = "#6d28d9"; // violet — matches the app's print/accent buttons

const card = (inner, extra = "") =>
  `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;` +
  `box-shadow:0 1px 0 rgba(15,23,42,0.04);${extra}">${inner}</div>`;

const cardTitle = (text) =>
  `<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;` +
  `color:${ACCENT};margin-bottom:6px;">${escapeHtml(text)}</div>`;

const th = (label, align = "left") =>
  `<th style="padding:6px 10px;font-size:8px;font-weight:800;text-transform:uppercase;` +
  `letter-spacing:0.08em;color:#64748b;text-align:${align};border-bottom:1px solid #e2e8f0;">${escapeHtml(label)}</th>`;

export function renderV2Html(model, renderOptions = {}) {
  const m = model || {};
  const rows = Array.isArray(m.rows) ? m.rows : [];
  const tasks = Array.isArray(m.tasks) ? m.tasks : [];
  const t = m.totals || {};
  const ti = t.internal || {};
  const fmt = m.fmt;
  const money = (n) => escapeHtml(usd(n, fmt));

  const productRows = rows.length
    ? rows.map((r, i) =>
        `<tr style="background:${i % 2 ? "#f8fafc" : "#fff"};">` +
        `<td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#94a3b8;text-align:right;width:30px;">${escapeHtml(r.line ?? i + 1)}</td>` +
        `<td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;">` +
          `<div style="font-size:12px;font-weight:700;color:#0f172a;">${escapeHtml(r.name)}</div>` +
          `${r.type ? `<div style="font-size:10px;color:#64748b;">${escapeHtml(r.type)}</div>` : ""}` +
          `${r.notes ? `<div style="font-size:10px;color:#94a3b8;">${escapeHtml(r.notes)}</div>` : ""}` +
        `</td>` +
        `<td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#0f172a;text-align:center;">${escapeHtml(r.qty === "" || r.qty == null ? "—" : r.qty)}</td>` +
        `<td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#334155;text-align:right;">${money(r.unit_price)}</td>` +
        `<td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:800;color:#0f172a;text-align:right;">${money(r.ext_price)}</td>` +
        `<td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:10px;color:#475569;text-align:center;">` +
          `${r.status ? `<span style="display:inline-block;border:1px solid #c4b5fd;color:${ACCENT};border-radius:999px;padding:1px 8px;font-weight:700;">${escapeHtml(r.status)}</span>` : "—"}` +
          `${r.due_date ? `<div style="font-size:9px;color:#94a3b8;margin-top:2px;">${escapeHtml(r.due_date)}</div>` : ""}` +
        `</td>` +
        `</tr>`
      ).join("")
    : `<tr><td colspan="6" style="padding:14px;text-align:center;font-size:12px;color:#94a3b8;">No products on this work order.</td></tr>`;

  const metaCards = (m.meta || []).slice(0, 8).map((e) =>
    `<div style="border:1px solid #f1f5f9;background:#f8fafc;border-radius:6px;padding:5px 8px;min-width:100px;flex:1;">` +
    `${fieldLabel(e.label)}` +
    `<div style="font-size:12px;font-weight:700;color:#0f172a;">${escapeHtml(e.value)}</div></div>`
  ).join("");

  const internalStrip = (ti.total_cost != null || ti.total_margin != null || ti.actual_cost != null)
    ? `<div style="margin-top:8px;border-top:1px dashed #cbd5e1;padding-top:6px;font-size:9px;color:#94a3b8;">` +
      `Shop only: ` +
      [
        ti.total_cost != null ? `cost ${money(ti.total_cost)}` : "",
        ti.total_margin != null ? `margin ${money(ti.total_margin)}${ti.margin_pct != null ? ` (${ti.margin_pct}%)` : ""}` : "",
        ti.actual_cost != null ? `actual ${money(ti.actual_cost)}` : "",
      ].filter(Boolean).join(" · ") +
      `</div>`
    : "";

  const totalsCard = card(`
    ${cardTitle("Totals")}
    <div style="font-size:12px;color:#334155;">
      <div style="display:flex;justify-content:space-between;padding:3px 0;"><span>Products Subtotal</span><b>${money(t.subtotal)}</b></div>
      ${t.estimate_amount != null
        ? `<div style="display:flex;justify-content:space-between;padding:3px 0;color:#64748b;"><span>Contract (estimate)</span><span>${money(t.estimate_amount)}</span></div>`
        : ""}
      ${t.deposit_required || t.deposit_amount != null
        ? `<div style="display:flex;justify-content:space-between;padding:3px 0;color:#64748b;"><span>Deposit${t.deposit_invoiced ? " (invoiced)" : ""}</span><span>${money(t.deposit_amount)}</span></div>`
        : ""}
      <div style="display:flex;justify-content:space-between;padding:5px 0 0;margin-top:4px;border-top:1px solid #e2e8f0;font-size:14px;">
        <span style="font-weight:800;color:#0f172a;">Order Total</span>
        <span style="font-weight:800;color:${ACCENT};">${money(t.contract_total ?? t.subtotal)}</span>
      </div>
    </div>
    ${internalStrip}
  `, "page-break-inside:avoid;");

  const taskItems = tasks.slice(0, 12).map((task) =>
    `<div style="display:flex;gap:6px;align-items:flex-start;padding:2px 0;">` +
    `<span style="display:inline-block;width:10px;height:10px;border:1.5px solid ${ACCENT};border-radius:3px;margin-top:3px;background:${task.completed ? ACCENT : "#fff"};"></span>` +
    `<span style="font-size:11px;${task.completed ? "color:#94a3b8;text-decoration:line-through;" : "color:#0f172a;"}">${escapeHtml(task.text)}` +
    `${task.is_milestone ? ` <b style="font-size:8px;color:${ACCENT};">MILESTONE</b>` : ""}` +
    `${task.assigned_to || task.due_date ? ` <span style="font-size:9px;color:#94a3b8;">· ${escapeHtml([task.assigned_to, task.due_date].filter(Boolean).join(" · "))}</span>` : ""}` +
    `</span></div>`
  ).join("");

  const bodyHtml = `
<div style="max-width:8.5in;margin:0 auto;padding:0.28in;">
  <!-- Two-column header -->
  <div style="display:flex;gap:14px;align-items:stretch;">
    <div style="flex:1.5;">
      ${card(`
        <div style="display:flex;gap:12px;align-items:center;">
          ${m.company?.logo_url ? `<img src="${escapeHtml(m.company.logo_url)}" alt="" style="max-height:48px;max-width:160px;object-fit:contain;" />` : ""}
          <div>
            <div style="font-size:16px;font-weight:800;color:#0f172a;">${escapeHtml(m.company?.name || "")}</div>
            <div style="font-size:10px;color:#64748b;line-height:1.4;">
              ${renderAddressLines(m.company?.address_lines || [])}
              ${[m.company?.phone, m.company?.email, m.company?.website].filter(Boolean).map((x) => `<div>${escapeHtml(x)}</div>`).join("")}
            </div>
          </div>
        </div>
      `, "height:100%;")}
    </div>
    <div style="flex:1;">
      <div style="border-radius:8px;background:${ACCENT};color:#fff;padding:12px 14px;height:100%;">
        <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;opacity:0.8;">${escapeHtml(m.document_title || "Work Order")}</div>
        <div style="font-size:24px;font-weight:800;letter-spacing:0.02em;margin-top:2px;">${escapeHtml(m.order_number)}</div>
        <div style="font-size:10px;opacity:0.85;font-family:monospace;">${escapeHtml(m.job_code || "")}</div>
        <div style="margin-top:6px;font-size:9px;opacity:0.8;">Printed ${escapeHtml(printedAtText(m.printed_at))}</div>
        <div style="margin-top:4px;">${asapBadge(m)}${m.completed ? ' <span style="display:inline-block;background:#059669;color:#fff;font-size:9px;font-weight:800;padding:2px 8px;border-radius:3px;">COMPLETED</span>' : ""}</div>
      </div>
    </div>
  </div>

  ${m.work_order_title || m.description
    ? `<div style="margin-top:10px;">${card(`
        ${m.work_order_title ? `<div style="font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(m.work_order_title)}</div>` : ""}
        ${m.description ? `<div style="font-size:11px;color:#475569;margin-top:3px;white-space:pre-wrap;">${escapeHtml(m.description)}</div>` : ""}
      `)}</div>`
    : ""}

  <div style="display:flex;gap:10px;margin-top:10px;">
    <div style="flex:1;">${card(`
      ${cardTitle("Bill To")}
      <div style="font-size:13px;font-weight:700;color:#0f172a;">${escapeHtml(m.bill_to?.name || "—")}</div>
      ${m.bill_to?.attention ? `<div style="font-size:10px;color:#64748b;">Attn: ${escapeHtml(m.bill_to.attention)}</div>` : ""}
      <div style="font-size:11px;color:#334155;line-height:1.45;margin-top:3px;">${renderAddressLines(m.bill_to?.address_lines || [])}</div>
      ${m.bill_to?.phone || m.bill_to?.email
        ? `<div style="font-size:10px;color:#64748b;margin-top:3px;">${[m.bill_to.phone, m.bill_to.email].filter(Boolean).map(escapeHtml).join(" · ")}</div>`
        : ""}
    `, "height:100%;")}</div>
    <div style="flex:1;">${card(`
      ${cardTitle("Install Site")}
      <div style="font-size:11px;color:#334155;line-height:1.45;">${renderAddressLines(m.ship_to?.address_lines || [])}</div>
      ${m.ship_to?.attention ? `<div style="font-size:10px;color:#64748b;margin-top:3px;">Attn: ${escapeHtml(m.ship_to.attention)}</div>` : ""}
    `, "height:100%;")}</div>
  </div>

  ${metaCards
    ? `<div style="margin-top:10px;">${card(`<div style="display:flex;flex-wrap:wrap;gap:6px;">${metaCards}</div>`)}</div>`
    : ""}

  <div style="margin-top:10px;">
    ${card(`
      ${cardTitle(`Products — ${rows.length} line${rows.length === 1 ? "" : "s"}${m.piece_count ? ` · ${m.piece_count} pieces` : ""}`)}
      <table style="width:100%;">
        <thead><tr>${th("#", "right")}${th("Product")}${th("Qty", "center")}${th("Unit Price", "right")}${th("Ext Price", "right")}${th("Status", "center")}</tr></thead>
        <tbody>${productRows}</tbody>
      </table>
    `, "padding:10px 12px;")}
  </div>

  <div style="display:flex;gap:10px;margin-top:10px;align-items:flex-start;">
    ${tasks.length
      ? `<div style="flex:1.4;">${card(`${cardTitle(`Checklist — ${m.task_counts?.done ?? 0}/${m.task_counts?.total ?? tasks.length} done`)}${taskItems}`)}</div>`
      : ""}
    <div style="flex:1;">${totalsCard}</div>
  </div>

  <div style="display:flex;justify-content:space-between;margin-top:18px;padding-top:6px;border-top:1px solid #e2e8f0;font-size:8px;color:#94a3b8;">
    <span>${escapeHtml(m.footer_note || "")}</span>
    <span>${escapeHtml(m.document_title || "Work Order")} — ${escapeHtml(m.order_number)} · v2</span>
  </div>
</div>`;

  return htmlDoc({
    title: `${m.document_title || "Work Order"} — ${m.order_number || ""}`,
    bodyHtml,
    autoPrint: renderOptions.autoPrint !== false,
    extraCss: `
  @page { margin: 0.5in; }
    `,
  });
}

export default {
  id: "v2",
  label: "v2 — Modern",
  renderHtml: renderV2Html,
};
