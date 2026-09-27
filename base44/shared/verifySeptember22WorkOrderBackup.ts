import * as XLSX from 'npm:xlsx@0.18.5';
import { compareHistoricalWorkOrderIds } from './compareHistoricalWorkOrders.mjs';

// Only the specific, already logged September 22 archive is eligible.
// This is intentionally NOT a general Drive file browser or restoration route.
const BACKUP_LOG_ID = '6ab2934a6507125576694bf6';
const EXPECTED_FILENAME = 'WorkOrders_Backup_2026-09-22_14-39-51.xlsx';
const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_BYTES = 12 * 1024 * 1024;

class VerificationBlocked extends Error {
  status = 409;
}

async function fetchDrive(url: string, token: string, maxBytes: number) {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, Accept: '*/*' },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    if ([401, 403].includes(response.status)) {
      throw new VerificationBlocked('The connected Google Drive account cannot access this historical backup.');
    }
    if (response.status === 404) {
      throw new VerificationBlocked('The historical backup could not be found in the connected Google Drive account.');
    }
    throw new VerificationBlocked(`Google Drive could not verify the backup (HTTP ${response.status}).`);
  }
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new VerificationBlocked('The historical backup exceeds the safe read limit.');
  if (!response.body) throw new VerificationBlocked('Google Drive returned no readable backup content.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new VerificationBlocked('The historical backup exceeds the safe read limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function verifySeptember22WorkOrderBackup(base44: any, currentRows: any[]) {
  const log = await base44.asServiceRole.entities.BackupLog.get(BACKUP_LOG_ID);
  const archive = Array.isArray(log?.results)
    ? log.results.filter((item: any) =>
        item.type === 'workorders' &&
        item.success === true &&
        item.skipped !== true &&
        !item.error &&
        item.filename === EXPECTED_FILENAME)
    : [];
  if (!log?.created_date?.startsWith('2026-09-22') || archive.length !== 1) {
    throw new VerificationBlocked('The September 22 backup entry cannot be verified. No file was opened.');
  }

  let token = '';
  try {
    const connection = await base44.asServiceRole.connectors.getConnection('googledrive');
    token = connection?.accessToken || '';
  } catch {
    throw new VerificationBlocked('The app Google Drive connection is unavailable. No historical file was opened.');
  }
  if (!token) throw new VerificationBlocked('The app Google Drive connection has no usable access token.');

  const query = new URLSearchParams({
    q: `name = '${EXPECTED_FILENAME}' and trashed = false`,
    fields: 'nextPageToken,files(id,name,mimeType,size,trashed)',
    pageSize: '10',
  });
  const found = await fetchDrive(
    'https://www.googleapis.com/drive/v3/files?' + query.toString(), token, 64_000);
  let listing: any;
  try {
    listing = JSON.parse(new TextDecoder().decode(found));
  } catch {
    throw new VerificationBlocked('Google Drive returned an invalid historical backup listing.');
  }
  const files = Array.isArray(listing?.files) ? listing.files : [];
  if (listing?.nextPageToken || files.length > 1) {
    throw new VerificationBlocked('Multiple files have the logged backup name. Manual file identification is required.');
  }
  const file = files[0];
  if (!file || file.name !== EXPECTED_FILENAME || !file.id || file.trashed === true) {
    throw new VerificationBlocked('The exact logged backup file is not visible in the connected Google Drive account.');
  }
  if (file.mimeType !== EXCEL_MIME) {
    throw new VerificationBlocked('The historical backup file has an unexpected format.');
  }
  const expectedSize = Number(file.size);
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > MAX_BYTES) {
    throw new VerificationBlocked('The historical backup file size could not be verified safely.');
  }
  const bytes = await fetchDrive(
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id) + '?alt=media',
    token,
    MAX_BYTES,
  );
  if (bytes.byteLength !== expectedSize) {
    throw new VerificationBlocked('The backup file length differs from Google Drive metadata.');
  }
  let worksheet: any[];
  try {
    const workbook = XLSX.read(bytes, { type: 'array' });
    if (!workbook?.Sheets?.Data) throw new Error('Data worksheet missing');
    worksheet = XLSX.utils.sheet_to_json(workbook.Sheets.Data, {
      header: 1, raw: false, defval: '', blankrows: false,
    });
  } catch {
    throw new VerificationBlocked('The historical backup workbook could not be verified or parsed.');
  }
  let comparison;
  try {
    comparison = compareHistoricalWorkOrderIds(worksheet, currentRows);
  } catch (error) {
    throw new VerificationBlocked((error as Error)?.message || 'The backup ID comparison could not be verified.');
  }
  return {
    backup_filename: EXPECTED_FILENAME,
    backup_log_date: log.created_date,
    file_size_bytes: bytes.byteLength,
    verified_at: new Date().toISOString(),
    backup_file_verified: true,
    ...comparison,
  };
}
