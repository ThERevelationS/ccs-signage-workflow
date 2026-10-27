import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Atomic per-sequence document number allocator backed by DocNumberCounter
// (CAS on updated_date). Replaces racy "count rows and add 1001" numbering,
// which produced duplicate INV-/PO-/CO- numbers under concurrent creates.
// Each sequence is isolated by config_name and lazily seeded above the
// highest existing suffix so migration never reissues a used number.
export async function allocateDocNumber({ svc, configName, prefix, seedEntity, seedField }: any) {
  const Counter = svc.entities.DocNumberCounter;
  const MAX_ATTEMPTS = 8;

  const loadCounter = async () => {
    const rows = await Counter.filter({ config_name: configName });
    if (!Array.isArray(rows)) throw new Error('Document number counter could not be verified.');
    if (rows.length > 1) throw new Error(`Multiple "${configName}" document number counters exist.` );
    return rows[0] || null;
  };

  let counter = await loadCounter();
  if (!counter) {
    // Seed above the largest numeric suffix already issued under this prefix.
    let seed = 1;
    try {
      const existing = await seedEntity.filter({});
      const rx = new RegExp('^' + prefix + '(\d+)$');
      for (const row of existing || []) {
        const m = rx.exec(String(row?.[seedField] || ''));
        if (m) seed = Math.max(seed, parseInt(m[1], 10) + 1);
      }
    } catch (e) { /* fall back to 1 only if seed lookup fails — CAS still guarantees uniqueness within the counter */ }
    try {
      await Counter.create({ config_name: configName, next_seq: seed });
    } catch (e) { /* concurrent create — reload below */ }
    counter = await loadCounter();
    if (!counter) throw new Error('Document number counter could not be initialized safely.');
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    counter = attempt === 0 ? counter : await loadCounter();
    if (!counter?.id || !counter?.updated_date) {
      throw new Error('Document number counter version metadata is incomplete.');
    }
    const start = Math.max(1, Math.floor(Number(counter.next_seq) || 1));
    // Never reissue a number below the seeded maximum even if the counter lagged.
    const result = await Counter.updateMany(
      { id: counter.id, config_name: configName, updated_date: counter.updated_date },
      { $set: { next_seq: start + 1 } },
    );
    if (!result || typeof result.updated !== 'number') {
      throw new Error('Document number allocation result could not be verified.');
    }
    if (result.updated !== 1) continue;
    return `${prefix}${start}`;
  }
  throw new Error('Document number allocation was busy. Try again.');
}
