import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Atomic shared number generator for estimates (EST-) and orders (INV-).
// Both draw from the SAME sequence so numbers never overlap.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const docType = body.doc_type === 'order' ? 'order' : 'estimate';
    const prefix = docType === 'order' ? 'INV-' : 'EST-';
    const requestedCount = Math.min(Math.max(parseInt(body.count || 1, 10) || 1, 1), 50);
    if (requestedCount > 1 && user.role !== 'admin') {
      return Response.json({ error: 'Batch document-number allocation requires admin access' }, { status: 403 });
    }
    const count = requestedCount;

    const svc = base44.asServiceRole;
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
        numbers.push(prefix + String(start + i).padStart(5, '0'));
      }

      return Response.json({ numbers, number: numbers[0], next_seq: nextSeq });
    }

    throw new Error('Document number allocation was busy because the shared counter kept changing. Try again.');
  } catch (error) {
    console.error('generateDocNumber error:', error?.message || error);
    return Response.json({ error: 'Document number allocation could not be completed safely' }, { status: 500 });
  }
}