import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';

// Thin archive-upload lane for the LOCAL document pipeline: the worker downloads
// + validates + stores source bytes locally, then this function performs the one
// metered step (UploadFile) so the stored copy can be viewed in-app. Bounded by
// the caller (the local uploader paces itself); this is deliberately minimal —
// bytes in, file_url out, nothing else.
const MAX_BYTES = 50 * 1024 * 1024;
const MIME: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', txt: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
};

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    if (!user?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Only administrators can upload archives.' }, { status: 403 });

    const b64 = String(body?.bytes_b64 || '');
    if (!b64 || b64.length > Math.ceil(MAX_BYTES * 4 / 3)) return Response.json({ error: 'Invalid or oversized payload.' }, { status: 400 });
    const name = String(body?.filename || 'archive.bin').replace(/[^\w.\- ]/g, '_').slice(0, 180) || 'archive.bin';
    const ext = name.split('.').pop()?.toLowerCase() || 'bin';
    const mime = String(body?.mime || MIME[ext] || 'application/octet-stream');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (!bytes.length || bytes.length > MAX_BYTES) return Response.json({ error: 'Bad byte count.' }, { status: 400 });

    const result = await base44.asServiceRole.integrations.Core.UploadFile({ file: new File([bytes], name, { type: mime }) });
    if (!result?.file_url) return Response.json({ error: 'Upload returned no file URL.' }, { status: 502 });
    return Response.json({ success: true, file_url: result.file_url, file_bytes: bytes.length });
  } catch (error: any) {
    const status = Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599 ? error.status : 500;
    return Response.json({ error: error?.message || 'Upload failed.' }, { status });
  }
});
