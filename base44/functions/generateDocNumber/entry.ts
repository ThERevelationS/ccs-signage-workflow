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
    const count = Math.min(Math.max(parseInt(body.count || 1, 10) || 1, 1), 50);

    const svc = base44.asServiceRole;
    let counters = await svc.entities.DocNumberCounter.filter({ config_name: 'default' });
    let counter = counters && counters.length ? counters[0] : null;

    if (!counter) {
      counter = await svc.entities.DocNumberCounter.create({ config_name: 'default', next_seq: 1 });
    }

    const start = Number(counter.next_seq) || 1;
    await svc.entities.DocNumberCounter.update(counter.id, { next_seq: start + count });

    const numbers = [];
    for (let i = 0; i < count; i++) {
      numbers.push(prefix + String(start + i).padStart(5, '0'));
    }

    return Response.json({ numbers, number: numbers[0], next_seq: start + count });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}