import { base44 } from "@/api/base44Client";
import { getSessionToken } from "@/components/auth/EmailGate";
import { createRequestGovernor } from "@/api/requestGovernor.mjs";

// Staff-facing File Bridge client. Everything goes through fileBridgeAction
// (session-authenticated); entities stay backend-only. The governor shares the
// app's invoke budget — reads coalesce behind the 6-wide cap.
const governor = createRequestGovernor({ maxConcurrent: 6, maxRetries: 1, baseDelayMs: 800, maxDelayMs: 10000 });

export async function fbCall(action, payload = {}) {
  const res = await governor.run(`fileBridgeAction:${action}`, () =>
    base44.functions.invoke("fileBridgeAction", {
      session_token: getSessionToken(),
      action,
      ...(payload || {}),
    }));
  return res?.data ?? res;
}

// Poll a queued command row until terminal. Backoff is gentle — commands like
// fetch_bytes legitimately take seconds on large files over WAN.
export async function waitForCommand(command_id, { timeoutMs = 120_000, onTick } = {}) {
  const t0 = Date.now();
  let delay = 900;
  for (;;) {
    const r = await fbCall("command_status", { command_id });
    const c = r?.data ?? r;
    if (c?.status && ["completed", "failed", "expired", "cancelled"].includes(c.status)) return c;
    onTick?.(c);
    if (Date.now() - t0 > timeoutMs) return { status: "timeout", command_id };
    await new Promise((s) => setTimeout(s, delay));
    delay = Math.min(delay * 1.5, 4000);
  }
}

export const sha256Hex = async (file) => {
  const buf = await file.arrayBuffer();
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const uploadToStaging = async (file) => {
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  if (!file_url) throw new Error("staging upload failed");
  return { file_url, sha256: await sha256Hex(file), size: file.size };
};

export const fmtBytes = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)} GB`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} MB`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} KB`;
  return `${v} B`;
};

export const kindOfExt = (ext, isDir) => {
  if (isDir) return "dir";
  const e = String(ext || "").toLowerCase();
  if (["pdf"].includes(e)) return "pdf";
  if (["png", "jpg", "jpeg", "webp", "gif", "tif", "tiff", "bmp", "svg", "heic"].includes(e)) return "image";
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(e)) return "video";
  if (["mp3", "wav", "m4a", "flac", "ogg"].includes(e)) return "audio";
  if (["doc", "docx", "txt", "rtf", "odt"].includes(e)) return "doc";
  if (["xls", "xlsx", "csv", "ods"].includes(e)) return "sheet";
  if (["cdr", "ai", "eps", "psd", "indd", "flexi", "plt", "fxd"].includes(e)) return "design";
  if (["zip", "rar", "7z", "tar", "gz"].includes(e)) return "archive";
  if (["ttf", "otf", "woff", "woff2"].includes(e)) return "font";
  return "file";
};
