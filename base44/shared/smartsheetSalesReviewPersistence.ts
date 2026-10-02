import { loadAllEntityRows } from './pagedEntityRows.ts';

// Reviews are field/value-specific, not invalidated by unrelated row metadata.
export async function persistSalesReviews(base44, reviews, assertOwner) {
  if (!reviews.length) return;
  const entity = base44.asServiceRole.entities.SyncConflict;
  const ids = [...new Set(reviews.map(r => r.entity_id))];
  const existing = [];
  for (let i = 0; i < ids.length; i += 100) existing.push(...await loadAllEntityRows({entity, query:{dataset:'sales', entity_id:{$in:ids.slice(i,i+100)}, status:{$in:['open','approved']}}, sort:'id', label:'Active Sales field reviews'}));
  const updates = [], additions = [];
  for (const review of reviews) {
    const matches = existing.filter(r => r.entity_id === review.entity_id && r.column_id === review.column_id);
    const same = matches.filter(r => r.local_value === review.local_value && r.remote_value === review.remote_value);
    const keep = same.find(r => r.status === 'approved') || same[0];
    for (const r of matches) if (r.id !== keep?.id) updates.push({id:r.id,status:'superseded'});
    if (!keep) additions.push(review);
  }
  for (let i = 0; i < updates.length; i += 100) {
    if (assertOwner) await assertOwner();
    await entity.bulkUpdate(updates.slice(i,i+100));
  }
  for (let i = 0; i < additions.length; i += 100) {
    if (assertOwner) await assertOwner();
    await entity.upsert(additions.slice(i,i+100), {key:'conflict_key'});
  }
}