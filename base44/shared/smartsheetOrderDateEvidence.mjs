const clean = value => String(value ?? '').trim();
const parsedTime = value => {
  const ms = Date.parse(clean(value));
  return Number.isFinite(ms) ? ms : null;
};

function matchingLocalEdit(events, order, field) {
  const local = clean(order?.[field]);
  if (!local) return null;
  return (Array.isArray(events) ? events : [])
    .filter(event =>
      event?.entity_id === order?.id &&
      event?.field_name === field &&
      event?.status === 'committed' &&
      ['app', 'admin'].includes(event?.source) &&
      clean(event?.new_value) === local &&
      parsedTime(event?.modified_at) !== null
    )
    .sort((a, b) => parsedTime(b.modified_at) - parsedTime(a.modified_at))[0] || null;
}

export function classifyOrderLocalOnlyDate(order, field, columnId, fieldAudits = []) {
  const localDate = clean(order?.[field]);
  if (!localDate) return { state: 'none' };

  const lastSyncedMs = parsedTime(order?.smartsheet_last_synced_at);
  const snapshot = order?.smartsheet_sync_snapshot;
  const hasSnapshot = !!snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) &&
    Object.prototype.hasOwnProperty.call(snapshot, String(columnId));
  const priorRemote = hasSnapshot ? clean(snapshot[String(columnId)]) : null;
  const verifiedEdit = matchingLocalEdit(fieldAudits, order, field);
  const verifiedEditMs = verifiedEdit ? parsedTime(verifiedEdit.modified_at) : null;

  if (lastSyncedMs !== null && verifiedEditMs !== null && verifiedEditMs > lastSyncedMs) {
    return {
      state: 'verified_newer_local',
      local_date: localDate,
      local_modified_at: verifiedEdit.modified_at,
      local_source: verifiedEdit.source,
      last_synced_at: order.smartsheet_last_synced_at,
    };
  }

  if (lastSyncedMs !== null && hasSnapshot && priorRemote === '') {
    return {
      state: 'preserved_historical',
      local_date: localDate,
      last_synced_at: order.smartsheet_last_synced_at,
    };
  }

  if (lastSyncedMs !== null && hasSnapshot && priorRemote !== '') {
    return {
      state: 'remote_blank_changed_since_sync',
      local_date: localDate,
      prior_remote_value: priorRemote,
      last_synced_at: order.smartsheet_last_synced_at,
    };
  }

  return {
    state: 'unverified_local_only',
    local_date: localDate,
    last_synced_at: clean(order?.smartsheet_last_synced_at),
  };
}

export function summarizeOrderLocalOnlyDateEvidence(orders, bindings, fieldAudits = []) {
  const fields = ['date_needed', 'date_ordered', 'date_received'];
  const counts = {
    verified_newer_local_dates: 0,
    preserved_historical_dates: 0,
    remote_blank_changed_since_sync: 0,
    unverified_local_only_dates: 0,
  };
  const byField = Object.fromEntries(fields.map(field => [field, {
    verified_newer_local: 0,
    preserved_historical: 0,
    remote_blank_changed_since_sync: 0,
    unverified_local_only: 0,
  }]));

  for (const order of Array.isArray(orders) ? orders : []) {
    for (const field of fields) {
      const columnId = clean(bindings?.[field]);
      if (!/^d+$/.test(columnId) || !clean(order?.[field])) continue;
      const evidence = classifyOrderLocalOnlyDate(order, field, columnId, fieldAudits);
      if (evidence.state === 'verified_newer_local') {
        counts.verified_newer_local_dates++;
        byField[field].verified_newer_local++;
      } else if (evidence.state === 'preserved_historical') {
        counts.preserved_historical_dates++;
        byField[field].preserved_historical++;
      } else if (evidence.state === 'remote_blank_changed_since_sync') {
        counts.remote_blank_changed_since_sync++;
        byField[field].remote_blank_changed_since_sync++;
      } else if (evidence.state === 'unverified_local_only') {
        counts.unverified_local_only_dates++;
        byField[field].unverified_local_only++;
      }
    }
  }
  return { counts, by_field: byField };
}
