import { jsPDF } from "jspdf";
import { format } from "date-fns";

const BRAND_PURPLE = [88, 28, 135];
const BRAND_DARK = [31, 41, 55];
const LIGHT_GRAY = [248, 248, 250];
const MID_GRAY = [107, 114, 128];
const BORDER_GRAY = [229, 231, 235];
const SUCCESS_GREEN = [21, 128, 61];
const DANGER_RED = [185, 28, 28];

function addSection(doc, y, title, color = BRAND_PURPLE) {
  doc.setFillColor(...color);
  doc.rect(14, y, 182, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(title, 18, y + 5);
  doc.setTextColor(...BRAND_DARK);
  return y + 12;
}

function addRow(doc, y, label, value, pageHeight, addPageFn) {
  if (y > pageHeight - 20) {
    addPageFn();
    y = 20;
  }
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...MID_GRAY);
  doc.text(label + ":", 18, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BRAND_DARK);
  const lines = doc.splitTextToSize(String(value || "—"), 130);
  doc.text(lines, 60, y);
  return y + lines.length * 5 + 2;
}

function boolBadge(doc, val, label, x, y) {
  const isTrue = val === true;
  doc.setFillColor(...(isTrue ? SUCCESS_GREEN : DANGER_RED));
  doc.roundedRect(x, y - 4, 3, 3, 1, 1, 'F');
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BRAND_DARK);
  doc.text(`${label}: ${isTrue ? "Yes" : "No"}`, x + 5, y - 1.5);
}

export function generateJurisdictionPDF(jurisdiction) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 0;

  let pageNum = 1;
  const addNewPage = () => {
    doc.addPage();
    pageNum++;
    // Footer on previous page
    drawFooter(doc, pageHeight, pageWidth, jurisdiction, pageNum - 1);
    y = 20;
  };

  // ── Header Banner ──
  doc.setFillColor(...BRAND_PURPLE);
  doc.rect(0, 0, pageWidth, 32, 'F');

  // Diagonal accent
  doc.setFillColor(110, 50, 180);
  doc.triangle(pageWidth - 40, 0, pageWidth, 0, pageWidth, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(`${jurisdiction.name}`, 14, 14);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${jurisdiction.state} · ${(jurisdiction.type || "county").charAt(0).toUpperCase() + (jurisdiction.type || "county").slice(1)} · Sign Permit Report`, 14, 22);

  doc.setFontSize(8);
  doc.setTextColor(200, 180, 255);
  doc.text(`Generated ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}`, 14, 29);

  y = 40;

  // ── Links row ──
  if (jurisdiction.website_url || jurisdiction.permitting_url) {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MID_GRAY);
    if (jurisdiction.website_url) {
      doc.text("Website: ", 14, y);
      doc.setTextColor(37, 99, 235);
      doc.text(jurisdiction.website_url.replace(/^https?:\/\//, ''), 30, y);
    }
    if (jurisdiction.permitting_url) {
      const xOff = jurisdiction.website_url ? 110 : 14;
      doc.setTextColor(...MID_GRAY);
      doc.text("Permits: ", xOff, y);
      doc.setTextColor(37, 99, 235);
      doc.text(jurisdiction.permitting_url.replace(/^https?:\/\//, ''), xOff + 17, y);
    }
    doc.setTextColor(...BRAND_DARK);
    y += 7;
  }

  // ── AI Summary ──
  if (jurisdiction.ai_summary) {
    doc.setFillColor(...LIGHT_GRAY);
    doc.setDrawColor(...BORDER_GRAY);
    const summaryLines = doc.splitTextToSize(jurisdiction.ai_summary, 174);
    const boxH = summaryLines.length * 4.5 + 10;
    doc.roundedRect(14, y, 182, boxH, 3, 3, 'FD');
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bolditalic");
    doc.setTextColor(...BRAND_PURPLE);
    doc.text("AI Summary", 18, y + 6);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(55, 65, 81);
    doc.text(summaryLines, 18, y + 11);
    y += boxH + 6;
  }

  // ── Permit Requirements ──
  const req = jurisdiction.permit_requirements || {};
  const hasReq = Object.keys(req).some(k => req[k] !== undefined && req[k] !== null && req[k] !== "");
  if (hasReq) {
    y = addSection(doc, y, "PERMIT REQUIREMENTS");

    // Bool badges row
    const bools = [
      { key: "requires_permit", label: "Permit Required" },
      { key: "illumination_allowed", label: "Illumination" },
      { key: "electronic_signs_allowed", label: "Electronic Signs" },
    ].filter(b => req[b.key] !== undefined && req[b.key] !== null);

    if (bools.length > 0) {
      bools.forEach((b, i) => boolBadge(doc, req[b.key], b.label, 18 + i * 62, y));
      y += 8;
    }

    if (req.max_sign_area_sqft) y = addRow(doc, y, "Max Sign Area", `${req.max_sign_area_sqft} sq ft`, pageHeight, addNewPage);
    if (req.max_height_ft) y = addRow(doc, y, "Max Height", `${req.max_height_ft} ft`, pageHeight, addNewPage);
    if (req.setback_requirements) y = addRow(doc, y, "Setbacks", req.setback_requirements, pageHeight, addNewPage);
    if (req.fee_range) y = addRow(doc, y, "Fee Range", req.fee_range, pageHeight, addNewPage);
    if (req.processing_time) y = addRow(doc, y, "Processing Time", req.processing_time, pageHeight, addNewPage);
    y += 3;
  }

  // ── Detailed Rules ──
  const hasRules = jurisdiction.sqft_width_height_rules || jurisdiction.height_allowances || jurisdiction.setback_rules || jurisdiction.lighting_allowances;
  if (hasRules) {
    y = addSection(doc, y, "DETAILED RULES & ALLOWANCES");
    if (jurisdiction.sqft_width_height_rules) y = addRow(doc, y, "SQFT / Width / Height", jurisdiction.sqft_width_height_rules, pageHeight, addNewPage);
    if (jurisdiction.height_allowances) y = addRow(doc, y, "Height Allowances", jurisdiction.height_allowances, pageHeight, addNewPage);
    if (jurisdiction.setback_rules) y = addRow(doc, y, "Setback Rules", jurisdiction.setback_rules, pageHeight, addNewPage);
    if (jurisdiction.lighting_allowances) y = addRow(doc, y, "Lighting Allowances", jurisdiction.lighting_allowances, pageHeight, addNewPage);
    y += 3;
  }

  // ── Contact Information ──
  const ci = jurisdiction.contact_info || {};
  const hasContact = ci.department || ci.phone || ci.email || ci.address;
  if (hasContact) {
    y = addSection(doc, y, "CONTACT INFORMATION");
    if (ci.department) y = addRow(doc, y, "Department", ci.department, pageHeight, addNewPage);
    if (ci.phone) y = addRow(doc, y, "Phone", ci.phone, pageHeight, addNewPage);
    if (ci.email) y = addRow(doc, y, "Email", ci.email, pageHeight, addNewPage);
    if (ci.address) y = addRow(doc, y, "Address", ci.address, pageHeight, addNewPage);
    y += 3;
  }

  // ── Parent County ──
  if (jurisdiction.parent_county?.name) {
    y = addSection(doc, y, "PARENT COUNTY", [180, 83, 9]);
    y = addRow(doc, y, "County", jurisdiction.parent_county.name, pageHeight, addNewPage);
    if (jurisdiction.parent_county.website_url) y = addRow(doc, y, "Website", jurisdiction.parent_county.website_url, pageHeight, addNewPage);
    if (jurisdiction.parent_county.contact_info?.phone) y = addRow(doc, y, "Phone", jurisdiction.parent_county.contact_info.phone, pageHeight, addNewPage);
    if (jurisdiction.parent_county.contact_info?.email) y = addRow(doc, y, "Email", jurisdiction.parent_county.contact_info.email, pageHeight, addNewPage);
    y += 3;
  }

  // ── Documents ──
  const docs = jurisdiction.documents || [];
  if (docs.length > 0) {
    y = addSection(doc, y, "ASSOCIATED DOCUMENTS");
    docs.forEach((doc_, i) => {
      if (y > pageHeight - 25) { addNewPage(); }

      const isAI = doc_.source === 'ai_discovered';
      doc.setFillColor(...(isAI ? [237, 233, 254] : [255, 251, 235]));
      doc.setDrawColor(...(isAI ? [167, 139, 250] : [251, 191, 36]));
      doc.roundedRect(14, y, 182, 14, 2, 2, 'FD');

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BRAND_DARK);
      doc.text(`${i + 1}. ${doc_.title || "Untitled"}`, 18, y + 6);

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MID_GRAY);
      const meta = [doc_.doc_type?.replace(/_/g, ' ') || "other", isAI ? "AI Discovered" : "Manual", doc_.last_fetched ? format(new Date(doc_.last_fetched), "MM/dd/yyyy") : ""].filter(Boolean).join(" · ");
      doc.text(meta, 18, y + 11);

      y += 17;
    });
    y += 3;
  }

  // ── Notes ──
  if (jurisdiction.notes) {
    y = addSection(doc, y, "NOTES");
    const notesLines = doc.splitTextToSize(jurisdiction.notes, 174);
    if (y + notesLines.length * 4.5 > pageHeight - 20) addNewPage();
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND_DARK);
    doc.text(notesLines, 18, y);
    y += notesLines.length * 4.5 + 6;
  }

  // Footer on last page
  drawFooter(doc, pageHeight, pageWidth, jurisdiction, pageNum);

  doc.save(`${jurisdiction.name}_${jurisdiction.state}_PermitReport.pdf`);
}

function drawFooter(doc, pageHeight, pageWidth, jurisdiction, pageNum) {
  doc.setDrawColor(...BORDER_GRAY);
  doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MID_GRAY);
  doc.text(`${jurisdiction.name}, ${jurisdiction.state} — Sign Permit Reference Report`, 14, pageHeight - 7);
  doc.text(`Page ${pageNum}`, pageWidth - 14, pageHeight - 7, { align: "right" });
}