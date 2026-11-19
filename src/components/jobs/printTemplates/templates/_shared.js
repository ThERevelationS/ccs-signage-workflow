// Shared renderer helpers for the work-order print templates. Each template
// returns a standalone <!doctype html> document with inline CSS only — no
// external fonts/scripts so the print window works offline and under
// window.open + document.write (the codebase's print convention).

export const escapeHtml = (v) => String(v ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

export const clean = (v) => String(v ?? "").trim();

export const usd = (n, modelFmt) => {
  const fmt = modelFmt && typeof modelFmt.usd === "function" ? modelFmt.usd : (x) => (
    x == null || !Number.isFinite(Number(x))
      ? ""
      : `$${Number(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  );
  return fmt(n);
};

export const printedAtText = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? clean(iso)
    : d.toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit",
      });
};

export const renderAddressLines = (lines) =>
  Array.isArray(lines) && lines.length
    ? lines.map((l) => `<div>${escapeHtml(l)}</div>`).join("")
    : `<div style="color:#94a3b8;">&mdash;</div>`;

// Wraps body markup in the standalone document shell every template returns.
// `extraCss` is the template's <style> payload; landscape templates pass a
// `@page { size: landscape; }` rule inside it.
export function htmlDoc({ title, lang = "en", bodyHtml, extraCss = "", autoPrint = true }) {
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
${autoPrint ? `<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},60);});</scr` + `ipt>` : ""}
</body>
</html>`;
}

export const asapBadge = (m, label = "ASAP") =>
  m.asap
    ? `<span style="display:inline-block;background:#dc2626;color:#fff;font-size:9px;font-weight:800;` +
      `letter-spacing:0.08em;padding:2px 8px;border-radius:3px;vertical-align:middle;">${escapeHtml(label)}</span>`
    : "";

// Company header block (logo + name + address + contact) used by most
// templates — identical to the packing-slip header conventions.
export function companyBlock(company, { align = "left", logoMaxH = 44 } = {}) {
  const c = company || {};
  return `
    <div style="text-align:${align};">
      ${c.logo_url
        ? `<img src="${escapeHtml(c.logo_url)}" alt="" style="max-height:${logoMaxH}px;max-width:200px;object-fit:contain;display:inline-block;margin-bottom:4px;" />`
        : ""}
      ${c.name ? `<div style="font-size:15px;font-weight:800;color:#0f172a;">${escapeHtml(c.name)}</div>` : ""}
      <div style="font-size:11px;color:#475569;line-height:1.45;">
        ${renderAddressLines(c.address_lines || [])}
        ${c.phone ? `<div>${escapeHtml(c.phone)}</div>` : ""}
        ${c.email ? `<div>${escapeHtml(c.email)}</div>` : ""}
        ${c.website ? `<div>${escapeHtml(c.website)}</div>` : ""}
      </div>
    </div>`;
}

export const fieldLabel = (text) =>
  `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;">${escapeHtml(text)}</div>`;

export const metaStrip = (meta, { columns = 4 } = {}) =>
  Array.isArray(meta) && meta.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">` +
      meta.map((entry) =>
        `<div style="flex:1;min-width:110px;border:1px solid #cbd5e1;border-radius:4px;padding:5px 8px;text-align:center;">` +
        `${fieldLabel(entry.label)}` +
        `<div style="font-size:12px;font-weight:600;color:#1e293b;">${escapeHtml(entry.value)}</div></div>`
      ).join("") + `</div>`
    : "";
