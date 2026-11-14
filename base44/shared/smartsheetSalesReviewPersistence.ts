import { loadAllEntityRows } from './pagedEntityRows.ts';

// Reviews are field/value-specific, not invalidated by unrelated row metadata.
export async function persistSalesReviews(base44, reviews, assertOwner, loadedReviews = null) {
  const summary = { added: 0, kept: 0, superseded: 0, dropped_stale: 0 };
  if (!reviews.length) return summary;
  const entity = base44.asServiceRole.entities.SyncConflict;
  const ids = [...new Set(reviews.map(r => r.entity_id))];
  // A pull snapshots local records once but mints reviews near the end of the
  // run; a local save landing mid-run would otherwise mint a false two-sided
  // conflict against the stale snapshot. Re-check revisions at persist time;
  // dropped reviews are re-evaluated by the next pull against fresh state.
  const freshRecords = await loadAllEntityRows({entity:base44.asServiceRole.entities.WorkOrder,query:{id:{$in:ids}},sort:'id',label:'Sales review freshness check'});
  const revisions = new Map(freshRecords.map(r => [String(r.id), String(r.updated_date || '')]));
  const fresh = reviews.filter(r => {
    const rev = revisions.get(String(r.entity_id));
    if (rev === undefined) return false;
    if (!r.local_version || !rev) return true;
    return r.local_version === rev;
  });
  summary.dropped_stale = reviews.length - fresh.length;
  const existing = loadedReviews || await loadAllEntityRows({entity,query:{dataset:'sales',entity_id:{$in:ids},status:{$in:['open','approved']}},sort:'id',label:'Active Sales field reviews'});
  const updates = [], additions = [];
  for (const review of fresh) {
    const matches = existing.filter(r => r.entity_id === review.entity_id && r.column_id === review.column_id);
    const same = matches.filter(r => r.local_value === review.local_value && r.remote_value === review.remote_value);
    const keep = same.find(r => r.status === 'approved') || same[0];
    for (const r of matches) if (r.id !== keep?.id) updates.push({id:r.id,status:'superseded'});
    if (!keep) additions.push(review);
    else summary.kept++;
  }
  summary.added = additions.length;
  summary.superseded = updates.length;
  for (let i = 0; i < updates.length; i += 100) {
    if (assertOwner) await assertOwner();
    await entity.bulkUpdate(updates.slice(i,i+100));
  }
  for (let i = 0; i < additions.length; i += 100) {
    if (assertOwner) await assertOwner();
    await entity.upsert(additions.slice(i,i+100), {key:'conflict_key'});
  }
  return summary;
}
