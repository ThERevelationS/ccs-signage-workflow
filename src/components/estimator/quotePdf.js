import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { formatQuoteIssueDate, quoteExpirationDate } from "./quoteLifecycle";

const safeFilePart = (value, fallback) => {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

export async function generateCustomerQuotePdf({
  elementId = "customer-quote-print",
  estimateNumber,
  projectName,
  quoteIssueDate,
  quoteVersion = 0,
  quoteValidDays = 30,
}) {
  const source = document.getElementById(elementId);
  if (!source) throw new Error("Customer quote preview is not available.");

  const clone = source.cloneNode(true);
  clone.removeAttribute("id");
  clone.style.position = "fixed";
  clone.style.left = "-100000px";
  clone.style.top = "0";
  clone.style.width = `${Math.max(source.scrollWidth, source.getBoundingClientRect().width)}px`;
  clone.style.maxWidth = "none";
  clone.style.minHeight = "0";
  clone.style.margin = "0";
  clone.style.boxShadow = "none";
  clone.style.border = "0";
  clone.style.background = "white";

  const dateNode = clone.querySelector("[data-quote-issue-date]");
  if (dateNode && quoteIssueDate) dateNode.textContent = formatQuoteIssueDate(quoteIssueDate);

  const expirationNode = clone.querySelector("[data-quote-expiration-date]");
  const expirationDate = quoteExpirationDate(quoteIssueDate, quoteValidDays);
  if (expirationNode && expirationDate) expirationNode.textContent = `Valid through ${formatQuoteIssueDate(expirationDate)}`;

  const validityFooter = clone.querySelector("[data-quote-validity-footer]");
  if (validityFooter && expirationDate) validityFooter.textContent = `This estimate is valid through ${formatQuoteIssueDate(expirationDate)} (${Math.max(0, Math.floor(Number(quoteValidDays || 0)))} days) unless otherwise stated.`;

  const versionNode = clone.querySelector("[data-quote-version]");
  const version = Math.max(0, Math.floor(Number(quoteVersion || 0)));
  if (versionNode && version > 0) {
    versionNode.textContent = `Quote Version ${version}`;
    versionNode.classList.remove("hidden");
  }

  document.body.appendChild(clone);

  try {
    await nextFrame();
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: clone.scrollWidth,
      windowHeight: clone.scrollHeight,
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter", compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 7;
    const printableWidth = pageWidth - margin * 2;
    const printableHeight = pageHeight - margin * 2;
    const pagePixelHeight = Math.max(1, Math.floor(canvas.width * printableHeight / printableWidth));

    let sourceY = 0;
    let pageIndex = 0;
    while (sourceY < canvas.height) {
      const chunkHeight = Math.min(pagePixelHeight, canvas.height - sourceY);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = chunkHeight;
      const ctx = pageCanvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(canvas, 0, sourceY, canvas.width, chunkHeight, 0, 0, canvas.width, chunkHeight);

      if (pageIndex > 0) pdf.addPage();
      const imageHeight = chunkHeight * printableWidth / canvas.width;
      pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.94), "JPEG", margin, margin, printableWidth, imageHeight, undefined, "FAST");

      sourceY += chunkHeight;
      pageIndex += 1;
    }

    const numberPart = safeFilePart(estimateNumber, "estimate");
    const projectPart = safeFilePart(projectName, "quote");
    const versionPart = version > 0 ? `-v${version}` : "";
    const filename = `${numberPart}-${projectPart}${versionPart}.pdf`;
    const dataUri = pdf.output("datauristring");
    const base64 = dataUri.slice(dataUri.indexOf(",") + 1);

    return {
      filename,
      mimeType: "application/pdf",
      base64,
    };
  } finally {
    clone.remove();
  }
}
