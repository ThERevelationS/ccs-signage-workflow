// Resource limits for the public (token-authenticated) customer portal actions.
// The portal link token is a bearer credential that can be forwarded or leaked,
// so every public write is bounded in body size, attachment size/type, and
// per-link write rate.

export const PORTAL_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const PORTAL_REQUEST_MAX_CHARS = Math.ceil((PORTAL_ATTACHMENT_MAX_BYTES * 4) / 3) + 64 * 1024;
export const PORTAL_WRITES_PER_HOUR = 30;
export const PORTAL_WRITES_PER_DAY = 150;
export const PORTAL_ATTACHMENTS_PER_DAY = 20;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const PORTAL_ATTACHMENT_TYPES = Object.freeze({
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  tif: "image/tiff",
  tiff: "image/tiff",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ai: "application/postscript",
  eps: "application/postscript",
});

const ALLOWED_MIMES = new Set(Object.values(PORTAL_ATTACHMENT_TYPES));

const clean = (value) => String(value ?? "").trim();

const limitError = (message, status) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export async function readBoundedPortalJson(req, maxChars = PORTAL_REQUEST_MAX_CHARS) {
  const declared = Number(req?.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maxChars) throw limitError("Request is too large.", 413);
  const text = await req.text().catch(() => "");
  if (text.length > maxChars) throw limitError("Request is too large.", 413);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// Validates and decodes a base64 portal attachment. Returns null when no
// attachment was supplied, otherwise { bytes, name, mime } with a normalized,
// allowlisted MIME type derived from the file extension.
export function decodePortalAttachment({ base64, name, mime }, maxBytes = PORTAL_ATTACHMENT_MAX_BYTES) {
  const encoded = clean(base64).replace(/\s+/g, "");
  if (!encoded) return null;
  const fileName = clean(name).slice(0, 255);
  if (!fileName) throw limitError("An attached file needs a filename.", 400);
  if (encoded.length > Math.ceil((maxBytes * 4) / 3) + 4) {
    throw limitError(`Attached files must be ${Math.floor(maxBytes / (1024 * 1024))} MB or smaller.`, 413);
  }
  const ext = (fileName.match(/\.([A-Za-z0-9]+)$/)?.[1] || "").toLowerCase();
  const extMime = PORTAL_ATTACHMENT_TYPES[ext];
  const declaredMime = clean(mime).toLowerCase().split(";")[0].trim();
  if (!extMime || (declaredMime && declaredMime !== "application/octet-stream" && !ALLOWED_MIMES.has(declaredMime))) {
    throw limitError("That file type can't be attached. Send a PDF, image, Office document, text/CSV, or AI/EPS file.", 415);
  }
  let binary;
  try {
    binary = atob(encoded);
  } catch {
    throw limitError("The attached file could not be read.", 400);
  }
  if (binary.length === 0) throw limitError("The attached file is empty.", 400);
  if (binary.length > maxBytes) {
    throw limitError(`Attached files must be ${Math.floor(maxBytes / (1024 * 1024))} MB or smaller.`, 413);
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return { bytes, name: fileName, mime: extMime };
}

// Per-link write budget, counted from the customer-authored PortalMessage rows
// every public write action creates. Fails closed if the count can't be read.
export async function enforcePortalWriteBudget(PortalMessage, linkId, { withAttachment = false, now = Date.now() } = {}) {
  const id = clean(linkId);
  if (!id) throw limitError("Portal link not recognized.", 404);
  let rows;
  try {
    rows = await PortalMessage.filter({ portal_link_id: id, author_side: "customer" }, "-created_date", PORTAL_WRITES_PER_DAY + 1);
  } catch {
    throw limitError("The portal is busy — please try again in a moment.", 503);
  }
  const recent = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ at: Date.parse(clean(row?.created_date)), attachment: Boolean(clean(row?.attachment_url)) }))
    .filter((row) => Number.isFinite(row.at) && now - row.at < DAY_MS);
  const lastHour = recent.filter((row) => now - row.at < HOUR_MS).length;
  if (lastHour >= PORTAL_WRITES_PER_HOUR || recent.length >= PORTAL_WRITES_PER_DAY) {
    throw limitError("Too many portal messages from this link — please wait a while or contact us directly.", 429);
  }
  if (withAttachment && recent.filter((row) => row.attachment).length >= PORTAL_ATTACHMENTS_PER_DAY) {
    throw limitError("Daily attachment limit reached for this link — please email larger batches of files to us directly.", 429);
  }
}
