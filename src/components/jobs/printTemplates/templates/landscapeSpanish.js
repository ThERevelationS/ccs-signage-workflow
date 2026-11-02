// Landscape Spanish work-order print — same information density as the
// streamlined landscape sheet but with ALL fixed labels translated to
// Spanish (Orden de Trabajo). Field DATA stays as stored — product names,
// stage names, and customer text print verbatim, only the chrome translates.
// Customer prices are printed; internal cost/margin columns are not shown
// (customer-facing sheet). Landscape @page.

import {
  asapBadge,
  escapeHtml,
  fieldLabel,
  htmlDoc,
  printedAtText,
  usd,
} from "./_shared";

// Meta labels arrive in English from the model; translate by stable key.
const META_LABEL_ES = {
  stage: "Etapa",
  start_date: "Fecha de Inicio",
  due_date: "Fecha de Entrega",
  install_date: "Fecha de Instalación",
  sales_rep: "Representante",
  project_manager: "Gerente de Proyecto",
  designer: "Diseñador",
  estimator: "Estimador",
  assigned_to: "Asignado A",
  project_type: "Tipo de Proyecto",
  permit_number: "Permiso N.º",
  po_number: "Orden de Compra",
};

const th = (label, align = "left") =>
  `<th style="padding:4px 8px;border-bottom:1.5px solid #0f172a;font-size:8px;font-weight:800;` +
  `text-transform:uppercase;letter-spacing:0.07em;color:#475569;text-align:${align};white-space:nowrap;">${escapeHtml(label)}</th>`;

export function renderLandscapeSpanishHtml(model, renderOptions = {}) {
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
        `<td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;font-size:10px;color:#475569;">${escapeHtml(r.status || "—")}${r.due_date ? `<br/><span style="color:#94a3b8;">${escapeHtml(r.due_date)}</span>` : ""}</td>` +
        `</tr>`
      ).join("")
    : `<tr><td colspan="7" style="padding:12px;text-align:center;font-size:12px;color:#94a3b8;">No hay productos en esta orden de trabajo.</td></tr>`;

  const meta = (m.meta || []).map((e) => ({ ...e, label: META_LABEL_ES[e.key] || e.label }));

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
        ${escapeHtml(m.document_title_es || "Orden de Trabajo")} ${asapBadge(m, "URGENTE")}
      </div>
      <div style="font-size:11px;color:#475569;">
        Orden <b>${escapeHtml(m.order_number)}</b>${m.job_code ? ` <span style="font-family:monospace;color:#94a3b8;">${escapeHtml(m.job_code)}</span>` : ""}
      </div>
      <div style="font-size:9px;color:#94a3b8;">Impreso ${escapeHtml(printedAtText(m.printed_at))}</div>
    </div>
  </div>

  <div style="display:flex;gap:14px;margin-top:6px;font-size:11px;color:#334155;">
    <div style="flex:1;">
      ${fieldLabel("Cliente")}
      <span style="font-weight:700;color:#0f172a;">${escapeHtml(m.bill_to?.name || "—")}</span>
      ${m.bill_to?.attention ? ` <span style="color:#64748b;">· ${escapeHtml(m.bill_to.attention)}</span>` : ""}
    </div>
    ${m.work_order_title
      ? `<div style="flex:1.4;">${fieldLabel("Trabajo")}<span style="font-weight:600;color:#0f172a;">${escapeHtml(m.work_order_title)}</span></div>`
      : ""}
    <div style="flex:1.4;">
      ${fieldLabel("Sitio de Instalación")}
      <span>${escapeHtml((m.ship_to?.address_lines || []).join(", ") || "—")}</span>
    </div>
  </div>

  ${meta.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">` +
      meta.map((e) =>
        `<div style="flex:1;min-width:100px;border:1px solid #cbd5e1;border-radius:3px;padding:3px 6px;text-align:center;">` +
        `${fieldLabel(e.label)}<div style="font-size:11px;font-weight:700;color:#1e293b;">${escapeHtml(e.value)}</div></div>`
      ).join("") + `</div>`
    : ""}

  <table style="width:100%;margin-top:8px;border:1.5px solid #0f172a;">
    <thead>
      <tr style="background:#f1f5f9;">
        ${th("N.º", "right")}${th("Producto / Descripción")}${th("Tipo")}${th("Cantidad", "center")}
        ${th("Precio Unitario", "right")}${th("Precio Total", "right")}${th("Estado / Entrega")}
      </tr>
    </thead>
    <tbody>${productRows}</tbody>
    <tfoot>
      <tr style="background:#f1f5f9;">
        <td colspan="5" style="padding:5px 8px;font-size:10px;color:#475569;">
          ${rows.length} línea${rows.length === 1 ? "" : "s"}${m.piece_count ? ` · ${escapeHtml(m.piece_count)} piezas` : ""}
        </td>
        <td colspan="2" style="padding:5px 8px;font-size:12px;font-weight:800;color:#0f172a;text-align:right;">
          Total: ${money(t.contract_total ?? t.subtotal)}
        </td>
      </tr>
    </tfoot>
  </table>

  ${m.description
    ? `<div style="margin-top:8px;font-size:10px;color:#334155;"><b style="text-transform:uppercase;font-size:8px;letter-spacing:0.07em;color:#64748b;">Alcance</b><br/>${escapeHtml(m.description)}</div>`
    : ""}

  <div style="display:flex;gap:24px;margin-top:20px;page-break-inside:avoid;">
    ${["Recibido Por", "Aprobado Por", "Fecha"].map((lbl) =>
      `<div style="flex:1;"><div style="height:24px;border-bottom:1px solid #94a3b8;"></div>` +
      `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;padding-top:2px;text-align:center;">${escapeHtml(lbl)}</div></div>`
    ).join("")}
  </div>

  <div style="display:flex;justify-content:space-between;margin-top:14px;padding-top:4px;border-top:1px solid #cbd5e1;font-size:8px;color:#94a3b8;">
    <span>Esta orden muestra precios al cliente — los detalles de producción viajan en el traveller del taller.</span>
    <span>Orden de Trabajo — ${escapeHtml(m.order_number)}</span>
  </div>
</div>`;

  return htmlDoc({
    title: `Orden de Trabajo — ${m.order_number || ""}`,
    lang: "es",
    bodyHtml,
    autoPrint: renderOptions.autoPrint !== false,
    extraCss: `
  @page { size: landscape; margin: 0.4in; }
    `,
  });
}

export default {
  id: "landscape-spanish",
  label: "Landscape (Español)",
  renderHtml: renderLandscapeSpanishHtml,
};
