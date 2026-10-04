export const DEFAULT_RESEARCH_ARCHIVE_LIMIT = 1;
export const RESEARCH_FETCH_TIMEOUT_MS = 12_000;
export const RESEARCH_UPLOAD_TIMEOUT_MS = 15_000;
export const RESEARCH_EXTRACT_TIMEOUT_MS = 20_000;

export function canArchiveResearchDocument({ document, existingDocument, archivesStarted = 0, archiveLimit = DEFAULT_RESEARCH_ARCHIVE_LIMIT } = {}) {
  if (!document?.url) return false;
  if (existingDocument?.source === 'manual') return false;
  if (existingDocument?.file_url || existingDocument?.source_sha256) return false;
  const limit = Math.max(0, Number(archiveLimit) || 0);
  return archivesStarted < limit;
}

export async function withResearchArchiveTimeout(promise, timeoutMs, label = 'Research archive step') {
  const timeout = Math.max(1, Number(timeoutMs) || 1);
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeout}ms.`)), timeout);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
