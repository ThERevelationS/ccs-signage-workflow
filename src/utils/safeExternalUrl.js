export function safeExternalHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

export function openExternalHttpUrl(value) {
  const url = safeExternalHttpUrl(value);
  if (!url) return false;
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (popup) popup.opener = null;
  return true;
}
