import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

// Atomic shared number generator for estimates (EST-) and orders (INV-).
// Both draw from the SAME sequence so numbers never overlap.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    const docType = body.doc_type === 'order' ? 'order' : 'estimate';

    const svc = base44.asServiceRole;
    // Configurable number format from Quote Defaults (prefix/suffix around the
    // padded sequence) — falls back to the EST-/INV- convention.
    let numberFormat = docType === 'order' ? 'INV-{seq}' : 'EST-{seq}';
    let padLen = 5;
    try {
      const defaults = await svc.entities.QuoteDefaults.filter({ config_name: 'default' });
      const d = Array.isArray(defaults) && defaults.length ? defaults[0] : null;
      const moduleKey = String(body?.module_key || '').trim();
      // Per-module prefix map (#499): a JSON map of module_key → "{seq}"
      // format that overrides the doc-type format for module-specific numbers.
      let moduleFmt = '';
      try {
        const map = JSON.parse(String(d?.module_number_prefixes || '{}').trim() || '{}');
        if (map && typeof map === 'object' && !Array.isArray(map)) moduleFmt = String(map[moduleKey] || '').trim();
      } catch { /* malformed map ignored */ }
      const fmt = (moduleFmt || String(docType === 'order' ? (d?.order_number_format || '') : (d?.estimate_number_format || '')).trim());
      if (fmt && fmt.includes('{seq}') && /^[\w\-.{}\[\]#]*$/.test(fmt) && fmt.length <= 40) {
        numberFormat = fmt;
      }
      const pad = Math.floor(Number(d?.doc_number_padding));
      if (Number.isFinite(pad) && pad >= 3 && pad <= 10) padLen = pad;
    } catch { /* defaults lookup failure falls back to standard format */ }

    const prefix = docType === 'order' ? 'INV-' : 'EST-';
    const requestedCount = Math.min(Math.max(parseInt(body.count || 1, 10) || 1, 1), 50);
    if (requestedCount > 1 && actor?.role !== 'admin') {
      return Response.json({ error: 'Batch document-number allocation requires admin access' }, { status: 403 });
    }
    const count = requestedCount;

    const Counter = svc.entities.DocNumberCounter;
    const MAX_ATTEMPTS = 8;

    const loadSingleton = async () => {
      const rows = await Counter.filter({ config_name: 'default' });
      if (!Array.isArray(rows)) {
        throw new Error('Document number counter could not be verified.');
      }
      if (rows.length > 1) {
        throw new Error('Multiple default document number counters exist. Number allocation was blocked; an administrator must resolve the duplicate counters.');
      }
      return rows[0] || null;
    };

    let counter = await loadSingleton();
    if (!counter) {
      let createError = null;
      try {
        await Counter.create({ config_name: 'default', next_seq: 1 });
      } catch (error) {
        createError = error;
      }

      counter = await loadSingleton();
      if (!counter) {
        throw createError || new Error('Document number counter could not be initialized safely.');
      }
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      counter = attempt === 0 ? counter : await loadSingleton();
      if (!counter?.id || !counter?.updated_date) {
        throw new Error('Document number counter version metadata is incomplete; allocation was blocked.');
      }

      const start = Math.max(1, Math.floor(Number(counter.next_seq) || 1));
      const nextSeq = start + count;
      const result = await Counter.updateMany(
        { id: counter.id, config_name: 'default', updated_date: counter.updated_date },
        { $set: { next_seq: nextSeq } },
      );

      if (!result || typeof result.updated !== 'number') {
        throw new Error('Document number allocation result could not be verified. No number was returned; retrying may leave a harmless gap but will not intentionally reuse an uncertain allocation.');
      }
      if (result.updated !== 1) continue;

      const numbers = [];
      for (let i = 0; i < count; i++) {
        const seq = String(start + i).padStart(padLen, '0');
        // numberFormat carries the {seq} placeholder (or the legacy prefix
        // fallback when a custom format is not configured).
        numbers.push(numberFormat.includes('{seq}') ? numberFormat.replace('{seq}', seq) : prefix + seq);
      }

      return Response.json({ numbers, number: numbers[0], next_seq: nextSeq });
    }

    throw new Error('Document number allocation was busy because the shared counter kept changing. Try again.');
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 409, 503].includes(status) ? status : 500;
    console.error('generateDocNumber error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Document number allocation could not be completed safely' : error.message,
    }, { status: safeStatus });
  }
}