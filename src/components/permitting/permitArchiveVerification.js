// A stored URL is not proof that the intended source PDF was archived.
// Recent uploads record their downloaded SHA-256 and byte count server-side.
export function isVerifiedPermitPDFArchive(document) {
  if (!document?.file_url || !/\.pdf(?:[?#]|$)/i.test(document?.url || '')) return false;

  const storedHash = String(document.stored_sha256 || '').toLowerCase();
  const storedBytes = Number(document.stored_bytes);
  if (!/^[a-f0-9]{64}$/.test(storedHash) || !Number.isSafeInteger(storedBytes) || storedBytes < 1) return false;

  const expectedHash = String(document.source_sha256 || '').trim().toLowerCase();
  if (expectedHash && expectedHash !== storedHash) return false;
  const expectedBytes = document.source_bytes == null ? null : Number(document.source_bytes);
  if (expectedBytes !== null && expectedBytes !== storedBytes) return false;

  return true;
}
