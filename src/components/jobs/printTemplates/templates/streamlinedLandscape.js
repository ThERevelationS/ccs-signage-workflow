// Streamlined Landscape work-order print — the condensed one-pager for the
// production floor. Landscape @page, tight product table with ONLY
// customer-facing columns (qty / product / type / status / unit & ext price).
// Internal per-product fields (unit_cost, ext_cost, margin, estimator notes,
// source-estimate provenance) are dropped BY CONSTRUCTION — this renderer
// never reads row.internal or model.totals.internal, so shop costs and margin
// math can never leak onto the sheet.

import {
  asapBadge,
  companyBlock,
  escapeHtml,
  fieldLabel,
  htmlDoc,
  printedAtText,
  usd,
} from "./_shared";

const th = (label, align = "left") =>
  `<th style="padding:4px 8px;border-bottom:1.5px solid #0f172a;font-size:8px;font-weight:800;` +
  `text-transform:uppercase;letter-spacing:0.07em;color:#475569;text-align:${align};white-space:nowrap;">${escapeHtml(label)}</th>`;

export function renderStreamlinedLandscapeHtml(model, renderOptions = {}) {
  const m = model || {};
  const rows = Array.isArray(m.rows) ? m.rows : [];
  const t = m.totals || {};
  const fmt = m.fmt;
  const money = (n) => escapeHtml(usd(n, fmt));

  const productRows = rows.length
    ? rows.map((r, i) =>
        `<tr style="background:${i % 2 ? "#f8fafc" : "#fff"};">` +
        `<td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b;text-align:right;width:30px;">${escapeHtml(r.line ?? i + 1)}</td>` +
        `<td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;color:#0f172a;">${escapeHtml(r.name)}` +
        `${r.notes ? `<div style="font-size:10px;font-weight:400;color:#64748b;">${escapeHtml(r.notes)}</div>` : ""}</td>` +
        `<td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">${escapeHtml(r.type || "—")}</td>` +
        `<td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#0f172a;text-align:center;">${escapeHtml(r.qty === "" || r.qty == null ? "—" : r.qty)}</td>` +
        `<td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#334155;text-align:right;">${money(r.unit_price)}</td>` +
        `<td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;color:#0f172a;text-align:right;">${money(r.ext_price)}</td>` +
        `<td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;font-size:10px;color:#475569;">${escapeHtml(r.status || "—")}${r.due_date ? `<br/><span style="color:#94a3b8;">due ${escapeHtml(r.due_date)}</span>` : ""}</td>` +
        `</tr>`
      ).join("")
    : `<tr><td colspan="7" style="padding:12px;text-align:center;font-size:12px;color:#94a3b8;">No products on this work order.</td></tr>`;

  // Key meta only — keep the header band short so the table gets the page.
  const keyMeta = (m.meta || []).filter((e) =>
    ["stage", "start_date", "due_date", "install_date", "project_manager"].includes(e.key));

  const bodyHtml = `
<div style="max-width:10.4in;margin:0 auto;padding:0.22in;">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:2px solid #0f172a;padding-bottom:6px;">
    <div style="display:flex;align-items:center;gap:14px;">
      ${m.company?.logo_url ? `<img src="${escapeHtml(m.company.logo_url)}" alt="" style="max-height:34px;max-width:150px;object-fit:contain;" />` : ""}
      <div>
        <div style="font-size:13px;font-weight:800;color:#0f172a;">${escapeHtml(m.company?.name || "")}</div>
        <div style="font-size:10px;color:#64748b;">${escapeHtml(m.company?.phone || "")}</div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:16px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:#0f172a;">
        ${escapeHtml(m.document_title || "Work Order")} ${asapBadge(m)}
      </div>
      <div style="font-size:11px;color:#475569;">
        <b>${escapeHtml(m.order_number)}</b>${m.job_code ? ` <span style="font-family:monospace;color:#94a3b8;">${escapeHtml(m.job_code)}</span>` : ""}
      </div>
      <div style="font-size:9px;color:#94a3b8;">Printed ${escapeHtml(printedAtText(m.printed_at))}</div>
    </div>
  </div>

  <div style="display:flex;gap:14px;margin-top:6px;font-size:11px;color:#334155;">
    <div style="flex:1;">
      ${fieldLabel("Client")}
      <span style="font-weight:700;color:#0f172a;">${escapeHtml(m.bill_to?.name || "—")}</span>
      ${m.bill_to?.attention ? ` <span style="color:#64748b;">· ${escapeHtml(m.bill_to.attention)}</span>` : ""}
    </div>
    ${m.work_order_title
      ? `<div style="flex:1.4;">${fieldLabel("Job")}<span style="font-weight:600;color:#0f172a;">${escapeHtml(m.work_order_title)}</span></div>`
      : ""}
    <div style="flex:1.4;">
      ${fieldLabel("Install Site")}
      <span>${escapeHtml((m.ship_to?.address_lines || []).join(", ") || "—")}</span>
    </div>
  </div>

  ${keyMeta.length
    ? `<div style="display:flex;gap:6px;margin-top:6px;">` +
      keyMeta.map((e) =>
        `<div style="flex:1;border:1px solid #cbd5e1;border-radius:3px;padding:3px 6px;text-align:center;">` +
        `${fieldLabel(e.label)}<div style="font-size:11px;font-weight:700;color:#1e293b;">${escapeHtml(e.value)}</div></div>`
      ).join("") + `</div>`
    : ""}

  <table style="width:100%;margin-top:8px;border:1.5px solid #0f172a;">
    <thead>
      <tr style="background:#f1f5f9;">
        ${th("#", "right")}${th("Product / Description")}${th("Type")}${th("Qty", "center")}
        ${th("Unit Price", "right")}${th("Ext Price", "right")}${th("Status / Due")}
      </tr>
    </thead>
    <tbody>${productRows}</tbody>
    <tfoot>
      <tr style="background:#f1f5f9;">
        <td colspan="5" style="padding:5px 8px;font-size:10px;color:#475569;">
          ${rows.length} line${rows.length === 1 ? "" : "s"}${m.piece_count ? ` · ${escapeHtml(m.piece_count)} pieces` : ""}
        </td>
        <td colspan="2" style="padding:5px 8px;font-size:12px;font-weight:800;color:#0f172a;text-align:right;">
          Total: ${money(t.contract_total ?? t.subtotal)}
        </td>
      </tr>
    </tfoot>
  </table>

  ${m.description
    ? `<div style="margin-top:8px;font-size:10px;color:#334155;"><b style="text-transform:uppercase;font-size:8px;letter-spacing:0.07em;color:#64748b;">Scope</b><br/>${escapeHtml(m.description)}</div>`
    : ""}

  <div style="display:flex;justify-content:space-between;margin-top:14px;padding-top:4px;border-top:1px solid #cbd5e1;font-size:8px;color:#94a3b8;">
    <span>${escapeHtml(m.footer_note || "")}</span>
    <span>${escapeHtml(m.document_title || "Work Order")} — ${escapeHtml(m.order_number)} · streamlined</span>
  </div>
</div>`;

  return htmlDoc({
    title: `${m.document_title || "Work Order"} — ${m.order_number || ""}`,
    bodyHtml,
    autoPrint: renderOptions.autoPrint !== false,
    extraCss: `
  @page { size: landscape; margin: 0.4in; }
    `,
  });
}

export default {
  id: "streamlined",
  label: "Streamlined Landscape",
  renderHtml: renderStreamlinedLandscapeHtml,
};
