import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { rows } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return Response.json({ error: 'No rows provided' }, { status: 400 });
  }

  // Load all existing work orders for deduplication
  let existingOrders = [];
  try {
    existingOrders = await base44.asServiceRole.entities.WorkOrder.filter({ is_rider: false, deleted: { $ne: true } });
  } catch {}

  // Build lookup maps for fast matching
  const byEstInv = new Map();
  const byClientName = new Map();
  for (const wo of existingOrders) {
    if (wo.est_inv_at) byEstInv.set(wo.est_inv_at, wo);
    if (wo.corbridge_invoice_number) byEstInv.set(wo.corbridge_invoice_number, wo);
    if (wo.client_name) byClientName.set(wo.client_name.toLowerCase().trim(), wo);
  }

  let created = 0, updated = 0, failed = 0;
  const BATCH_SIZE = 15;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (woData) => {
      const { clientName, estInvAt, ...rest } = woData;
      try {
        let existing = null;
        if (estInvAt) existing = byEstInv.get(estInvAt);
        if (!existing && clientName) existing = byClientName.get(clientName.toLowerCase().trim());

        if (existing) {
          await base44.asServiceRole.entities.WorkOrder.update(existing.id, rest);
          updated++;
        } else {
          const newWo = await base44.asServiceRole.entities.WorkOrder.create(rest);
          byEstInv.set(newWo.est_inv_at, newWo);
          byClientName.set(newWo.client_name?.toLowerCase().trim(), newWo);
          created++;
        }
      } catch (err) {
        console.error('Row import error:', err.message);
        failed++;
      }
    }));
  }

  return Response.json({ created, updated, failed, total: rows.length });
});