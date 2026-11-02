// Work-order print template registry — the single entry point for the
// D-09 print path. UI code (WorkOrderDetailsDialog) lists PRINT_TEMPLATES in
// the picker and calls renderWorkOrderPrint(wo, { templateId, company, ... })
// to get a standalone <!doctype html> document for window.open +
// document.write + window.print (the codebase's print convention, same as
// components/timeclock/TimeClockAdmin.jsx).

import { buildWorkOrderPrintModel } from "./workOrderPrintModel";
import original from "./templates/original";
import streamlinedLandscape from "./templates/streamlinedLandscape";
import landscapeSpanish from "./templates/landscapeSpanish";
import v2 from "./templates/v2";
import invoiceStyled from "./templates/invoiceStyled";

export { buildWorkOrderPrintModel };

export const PRINT_TEMPLATES = [
  original,              // "original" — classic portrait shop copy (all columns incl. internal)
  streamlinedLandscape,  // "streamlined" — condensed landscape, no internal cost/margin
  landscapeSpanish,      // "landscape-spanish" — landscape, Spanish labels
  v2,                    // "v2" — modern two-column header + card sections
  invoiceStyled,         // "invoice-styled" — invoice-face layout w/ totals waterfall
];

export const DEFAULT_PRINT_TEMPLATE_ID = "original";

// Lookup by id — unknown/missing ids fall back to the default so a stale
// stored preference can never blank the print path.
export function getPrintTemplate(id) {
  const wanted = String(id ?? "").trim();
  return PRINT_TEMPLATES.find((t) => t.id === wanted)
    || PRINT_TEMPLATES.find((t) => t.id === DEFAULT_PRINT_TEMPLATE_ID)
    || PRINT_TEMPLATES[0];
}

// Build the normalized model then render the chosen template.
// opts: { templateId|template_id, products, materials, company, logoUrl,
//         documentTitle, printedAt, footerNote, autoPrint }
export function renderWorkOrderPrint(workOrder, opts = {}) {
  const template = getPrintTemplate(opts.templateId ?? opts.template_id);
  const model = buildWorkOrderPrintModel(workOrder, { ...opts, templateId: template.id });
  return template.renderHtml(model, { autoPrint: opts.autoPrint !== false });
}
