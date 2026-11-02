// Invoice-styled work-order print — mimics the app's invoice/statement
// layout: brand top-left, document block top-right, BILL TO box, itemized
// Description/Qty/Rate/Amount table, and a right-aligned totals waterfall
// (Subtotal → Deposit → Balance Due). Customer prices only — internal
// cost/margin never appears on an invoice face. Portrait @page.

import {
  asapBadge,
  escapeHtml,
  htmlDoc,
  printedAtText,
  renderAddressLines,
  usd,
} from "./_shared";

export function renderInvoiceStyledHtml(model, renderOptions = {}) {
  const m = model || {};
  const rows = Array.isArray(m.rows) ? m.rows : [];
  const t = m.totals || {};
  const fmt = m.fmt;
  const money = (n) => escapeHtml(usd(n, fmt));

  const itemRows = rows.length
    ? rows.map((r, i) =>
        `<tr style="background:${i % 2 ? "#f8fafc" : "#fff"};">` +
        `<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b;width:34px;text-align:center;">${escapeHtml(r.line ?? i + 1)}</td>` +
        `<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">` +
          `<div style="font-size:12px;font-weight:600;color:#0f172a;">${escapeHtml(r.name)}</div>` +
          `${r.type || r.status ? `<div style="font-size:10px;color:#64748b;">${escapeHtml([r.type, r.status].filter(Boolean).join(" · "))}</div>` : ""}` +
        `</td>` +
        `<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#0f172a;text-align:center;width:64px;">${escapeHtml(r.qty === "" || r.qty == null ? "—" : r.qty)}</td>` +
        `<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#334155;text-align:right;width:90px;">${money(r.unit_price)}</td>` +
        `<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;color:#0f172a;text-align:right;width:100px;">${money(r.ext_price)}</td>` +
        `</tr>`
      ).join("")
    : `<tr><td colspan="5" style="padding:16px;text-align:center;font-size:12px;color:#94a3b8;">No items on this work order.</td></tr>`;

  // Totals waterfall — the invoice-face block at bottom-right.
  const waterfall = [
    ["Subtotal", t.subtotal],
    t.estimate_amount != null && t.estimate_amount !== t.subtotal
      ? ["Contract Total", t.estimate_amount]
      : null,
    t.deposit_required || t.deposit_amount != null
      ? [`Less Deposit${t.deposit_invoiced ? " (invoiced)" : ""}`, t.deposit_amount != null ? -Math.abs(t.deposit_amount) : null]
      : null,
  ].filter(Boolean);

  const waterfallHtml = `
    <table style="width:300px;margin-left:auto;margin-top:8px;">
      ${waterfall.map(([lbl, val]) =>
        `<tr>` +
        `<td style="padding:5px 10px;font-size:11px;color:#475569;text-align:right;">${escapeHtml(lbl)}</td>` +
        `<td style="padding:5px 10px;font-size:12px;color:#0f172a;text-align:right;width:110px;">${val == null ? "—" : money(val)}</td>` +
        `</tr>`
      ).join("")}
      <tr>
        <td style="padding:7px 10px;font-size:13px;font-weight:800;color:#0f172a;text-align:right;border-top:2px solid #0f172a;">Balance Due</td>
        <td style="padding:7px 10px;font-size:14px;font-weight:800;color:#0f172a;text-align:right;border-top:2px solid #0f172a;">${money(t.balance_due ?? t.contract_total ?? t.subtotal)}</td>
      </tr>
    </table>`;

  const metaLine = [
    m.meta?.find((e) => e.key === "due_date") ? `Due: ${escapeHtml(m.meta.find((e) => e.key === "due_date").value)}` : "",
    m.meta?.find((e) => e.key === "stage") ? `Stage: ${escapeHtml(m.meta.find((e) => e.key === "stage").value)}` : "",
    m.meta?.find((e) => e.key === "sales_rep") ? `Rep: ${escapeHtml(m.meta.find((e) => e.key === "sales_rep").value)}` : "",
    m.meta?.find((e) => e.key === "po_number") ? `PO: ${escapeHtml(m.meta.find((e) => e.key === "po_number").value)}` : "",
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");

  const bodyHtml = `
<div style="max-width:8.5in;margin:0 auto;padding:0.3in;">
  <!-- Invoice header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
    <div>
      ${m.company?.logo_url
        ? `<img src="${escapeHtml(m.company.logo_url)}" alt="" style="max-height:52px;max-width:200px;object-fit:contain;display:block;margin-bottom:6px;" />`
        : ""}
      <div style="font-size:16px;font-weight:800;color:#0f172a;">${escapeHtml(m.company?.name || "")}</div>
      <div style="font-size:11px;color:#475569;line-height:1.5;margin-top:2px;">
        ${renderAddressLines(m.company?.address_lines || [])}
        ${[m.company?.phone, m.company?.email, m.company?.website].filter(Boolean).map((x) => `<div>${escapeHtml(x)}</div>`).join("")}
        ${m.company?.license ? `<div>Lic. ${escapeHtml(m.company.license)}</div>` : ""}
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:30px;font-weight:800;letter-spacing:0.04em;color:#0f172a;text-transform:uppercase;">
        ${escapeHtml(m.document_title || "Work Order")}
      </div>
      <table style="margin-left:auto;margin-top:8px;font-size:11px;color:#334155;">
        <tr><td style="padding:2px 8px;text-align:right;color:#64748b;">Order #</td><td style="padding:2px 0;font-weight:700;color:#0f172a;">${escapeHtml(m.order_number)}</td></tr>
        ${m.job_code ? `<tr><td style="padding:2px 8px;text-align:right;color:#64748b;">Job Code</td><td style="padding:2px 0;font-family:monospace;">${escapeHtml(m.job_code)}</td></tr>` : ""}
        <tr><td style="padding:2px 8px;text-align:right;color:#64748b;">Printed</td><td style="padding:2px 0;">${escapeHtml(printedAtText(m.printed_at))}</td></tr>
      </table>
      <div style="margin-top:4px;">${asapBadge(m)}${m.completed ? ' <span style="display:inline-block;background:#059669;color:#fff;font-size:9px;font-weight:800;letter-spacing:0.08em;padding:2px 8px;border-radius:3px;">PAID / COMPLETE</span>' : ""}</div>
    </div>
  </div>

  <div style="height:2px;background:#0f172a;margin:12px 0;"></div>

  <div style="display:flex;gap:12px;">
    <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;padding:10px 12px;">
      <div style="font-size:9px;font-weight:800;letter-spacing:0.1em;color:#64748b;text-transform:uppercase;">Bill To</div>
      <div style="font-size:13px;font-weight:700;color:#0f172a;margin-top:3px;">${escapeHtml(m.bill_to?.name || "—")}</div>
      ${m.bill_to?.attention ? `<div style="font-size:11px;color:#475569;">Attn: ${escapeHtml(m.bill_to.attention)}</div>` : ""}
      <div style="font-size:11px;color:#334155;line-height:1.5;margin-top:3px;">${renderAddressLines(m.bill_to?.address_lines || [])}</div>
      ${m.bill_to?.phone || m.bill_to?.email
        ? `<div style="font-size:10px;color:#64748b;margin-top:3px;">${[m.bill_to.phone, m.bill_to.email].filter(Boolean).map(escapeHtml).join(" · ")}</div>`
        : ""}
    </div>
    <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;padding:10px 12px;">
      <div style="font-size:9px;font-weight:800;letter-spacing:0.1em;color:#64748b;text-transform:uppercase;">Job / Install Site</div>
      ${m.work_order_title ? `<div style="font-size:12px;font-weight:700;color:#0f172a;margin-top:3px;">${escapeHtml(m.work_order_title)}</div>` : ""}
      <div style="font-size:11px;color:#334155;line-height:1.5;margin-top:2px;">${renderAddressLines(m.ship_to?.address_lines || [])}</div>
    </div>
  </div>

  ${metaLine ? `<div style="margin-top:8px;font-size:10px;color:#475569;">${metaLine}</div>` : ""}

  <table style="width:100%;margin-top:12px;border:1px solid #e2e8f0;">
    <thead>
      <tr style="background:#0f172a;">
        <th style="padding:7px 10px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#cbd5e1;text-align:center;">#</th>
        <th style="padding:7px 10px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#cbd5e1;text-align:left;">Description</th>
        <th style="padding:7px 10px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#cbd5e1;text-align:center;">Qty</th>
        <th style="padding:7px 10px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#cbd5e1;text-align:right;">Rate</th>
        <th style="padding:7px 10px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#cbd5e1;text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  ${waterfallHtml}

  ${m.description
    ? `<div style="margin-top:16px;font-size:10px;color:#475569;"><b style="font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;">Notes / Scope</b><div style="margin-top:3px;white-space:pre-wrap;">${escapeHtml(m.description)}</div></div>`
    : ""}

  <div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:9px;color:#94a3b8;display:flex;justify-content:space-between;">
    <span>${escapeHtml(m.footer_note || "")}</span>
    <span>${escapeHtml(m.document_title || "Work Order")} — ${escapeHtml(m.order_number)} · invoice-styled</span>
  </div>
</div>`;

  return htmlDoc({
    title: `${m.document_title || "Work Order"} — ${m.order_number || ""}`,
    bodyHtml,
    autoPrint: renderOptions.autoPrint !== false,
    extraCss: `
  @page { margin: 0.55in; }
    `,
  });
}

export default {
  id: "invoice-styled",
  label: "Invoice-styled",
  renderHtml: renderInvoiceStyledHtml,
};
