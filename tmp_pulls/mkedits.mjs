import fs from 'node:fs';
const dir = 'tmp_pulls/';
const edits = {};

edits['src/lib/workOrderCache.js'] = [
  {
    old_text: `      inFlight: null,
      hydrated: false,
    });`,
    new_text: `      inFlight: null,
      hydrated: false,
      // True when the last FULL pull hit the backend row cap — the row set is
      // then the first N rows, not the whole table. Boards read this through
      // the meta key/hook below and show an honest "showing first N" notice
      // instead of silently presenting a partial board as complete.
      truncated: false,
    });`
  },
  {
    old_text: `.put({ rows: state.rows, cursor: state.cursor, fullSyncAt: state.fullSyncAt, savedAt: Date.now() }, entity);`,
    new_text: `.put({ rows: state.rows, cursor: state.cursor, fullSyncAt: state.fullSyncAt, truncated: state.truncated === true, savedAt: Date.now() }, entity);`
  },
  {
    old_text: `  if (key) queryClientInstance.setQueryData(key, [...state.rows.values()]);
  try {
    boardChannel?.postMessage({ type: 'snapshot', entity, rows: state.rows, cursor: state.cursor, fullSyncAt: state.fullSyncAt });`,
    new_text: `  if (key) queryClientInstance.setQueryData(key, [...state.rows.values()]);
  // Boards subscribe to this meta key for the honest completeness flag.
  queryClientInstance.setQueryData(boardMetaKey(entity), getBoardFeedMeta(entity));
  try {
    boardChannel?.postMessage({ type: 'snapshot', entity, rows: state.rows, cursor: state.cursor, fullSyncAt: state.fullSyncAt, truncated: state.truncated === true });`
  },
  {
    old_text: `    state.rows = snap.rows;
    state.cursor = snap.cursor || '';
    state.fullSyncAt = snap.fullSyncAt || 0;
    publishSnapshot(entity, state);
    return;`,
    new_text: `    state.rows = snap.rows;
    state.cursor = snap.cursor || '';
    state.fullSyncAt = snap.fullSyncAt || 0;
    state.truncated = snap.truncated === true;
    publishSnapshot(entity, state);
    return;`
  },
  {
    old_text: `      state.rows = msg.rows;
      state.cursor = msg.cursor || '';
      state.fullSyncAt = msg.fullSyncAt || 0;
      publishSnapshot(msg.entity, state);`,
    new_text: `      state.rows = msg.rows;
      state.cursor = msg.cursor || '';
      state.fullSyncAt = msg.fullSyncAt || 0;
      state.truncated = msg.truncated === true;
      publishSnapshot(msg.entity, state);`
  },
  {
    old_text: `    let data = await boardFeed({ entity, sort: "-updated_date", since: needsFull ? null : state.cursor });
    if (!needsFull && data.truncated) {
      // More changed than one delta can carry — resync rather than merge a
      // partial change window over stale rows.
      data = await boardFeed({ entity, sort: "-updated_date" });
      state.rows = new Map();
      state.fullSyncAt = Date.now();
    } else if (needsFull) {
      state.rows = new Map();
      state.fullSyncAt = Date.now();
    }
    let maxUpdated = state.cursor;`,
    new_text: `    let data = await boardFeed({ entity, sort: "-updated_date", since: needsFull ? null : state.cursor });
    // A delta pull merges onto the current base; only a full pull replaces it
    // and can prove the row set complete again.
    let dataIsFullPull = needsFull;
    if (!needsFull && data.truncated) {
      // More changed than one delta can carry — resync rather than merge a
      // partial change window over stale rows.
      data = await boardFeed({ entity, sort: "-updated_date" });
      state.rows = new Map();
      state.fullSyncAt = Date.now();
      dataIsFullPull = true;
    } else if (needsFull) {
      state.rows = new Map();
      state.fullSyncAt = Date.now();
    }
    if (dataIsFullPull) {
      // "truncated" is the backend's hard row-cap flag and a FULL pull can
      // arrive truncated too — the branch above only catches the delta case.
      // Keep the flag on state so boards can warn "showing first N" instead
      // of silently presenting a clamped feed as the whole table.
      state.truncated = data.truncated === true;
      if (state.truncated) {
        console.warn(\`[workOrderCache] \${entity} feed truncated at \${data.rows.length} rows — the board is showing a partial set.\`);
      }
    }
    let maxUpdated = state.cursor;`
  },
  {
    old_text: `export function fetchAllWorkOrders(options) {`,
    new_text: `const boardMetaKey = (entity) => ["boardFeedMeta", entity];

export function getBoardFeedMeta(entity) {
  const state = stateFor(entity);
  return { truncated: state.truncated === true, count: state.rows.size };
}

// Boards subscribe here for the honest completeness flag — re-renders when a
// pull publishes fresh meta (including a truncated full pull).
export function useBoardFeedMeta(entity) {
  const query = useQuery({
    queryKey: boardMetaKey(entity),
    queryFn: () => getBoardFeedMeta(entity),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
  return query.data || getBoardFeedMeta(entity);
}

export function fetchAllWorkOrders(options) {`
  },
];

edits['src/pages/MainWorkflow.jsx'] = [
  {
    old_text: `import { useAllWorkOrders, refreshAllWorkOrders } from "@/lib/workOrderCache";`,
    new_text: `import { useAllWorkOrders, refreshAllWorkOrders, useBoardFeedMeta } from "@/lib/workOrderCache";`
  },
  {
    old_text: `  const { data: allWorkOrders, isLoading, error: workOrdersError } = useAllWorkOrders();`,
    new_text: `  const { data: allWorkOrders, isLoading, error: workOrdersError } = useAllWorkOrders();
  const boardMeta = useBoardFeedMeta("WorkOrder");`
  },
  {
    old_text: `        {readError && workOrders.length > 0 && (
          <div className="mb-2 px-3 py-2 rounded border border-amber-200 bg-amber-50 text-xs text-amber-800">
            Workflow refresh could not be verified completely. Showing the last verified timeline until the next successful refresh.
          </div>
        )}`,
    new_text: `        {readError && workOrders.length > 0 && (
          <div className="mb-2 px-3 py-2 rounded border border-amber-200 bg-amber-50 text-xs text-amber-800">
            Workflow refresh could not be verified completely. Showing the last verified timeline until the next successful refresh.
          </div>
        )}
        {boardMeta?.truncated && (
          <div className="mb-2 px-3 py-2 rounded border border-amber-200 bg-amber-50 text-xs text-amber-800">
            Showing the first {boardMeta.count} work orders — the board feed hit its row cap, so some jobs may be missing from this view.
          </div>
        )}`
  },
];

edits['src/pages/Permitting.jsx'] = [
  {
    old_text: `      // Batch the four catalog reads into one gateway call, then prime the
      // short-TTL cache so these loaders return instantly on remount.
      const batched = await loadEntitiesBatch([
        { entity: "PermitLineItem", sort: "-updated_date" },
        { entity: "PermitLocality" },
        { entity: "AuthorizedEmail" },
      ]).catch(() => null);`,
    new_text: `      // Batch the catalog reads into one gateway call, then prime the
      // short-TTL cache so these loaders return instantly on remount.
      // The gateway clamps any read at its page cap, so a batch result that
      // returns the full requested limit may be a truncated first page —
      // only a SHORTER result is known complete and honest to seed into the
      // shared loadAllEntityRows cache as "all rows". Anything else falls
      // through to the honest paged loader below.
      const BATCH_READ_LIMIT = 500;
      const batched = await loadEntitiesBatch([
        { entity: "PermitLineItem", sort: "-updated_date", limit: BATCH_READ_LIMIT },
        { entity: "PermitLocality", limit: BATCH_READ_LIMIT },
        { entity: "AuthorizedEmail", limit: BATCH_READ_LIMIT },
      ]).catch(() => null);`
  },
  {
    old_text: `        batched?.PermitLineItem
          ? Promise.resolve(primeAndReturn("Permitting line items", null, "-updated_date", batched.PermitLineItem))`,
    new_text: `        Array.isArray(batched?.PermitLineItem) && batched.PermitLineItem.length < BATCH_READ_LIMIT
          ? Promise.resolve(primeAndReturn("Permitting line items", null, "-updated_date", batched.PermitLineItem))`
  },
  {
    old_text: `        batched?.PermitLocality
          ? Promise.resolve(primeAndReturn("Permitting localities", null, null, batched.PermitLocality))`,
    new_text: `        Array.isArray(batched?.PermitLocality) && batched.PermitLocality.length < BATCH_READ_LIMIT
          ? Promise.resolve(primeAndReturn("Permitting localities", null, null, batched.PermitLocality))`
  },
  {
    old_text: `        batched?.AuthorizedEmail
          ? Promise.resolve(primeAndReturn("Permitting authorized users", null, null, batched.AuthorizedEmail))`,
    new_text: `        Array.isArray(batched?.AuthorizedEmail) && batched.AuthorizedEmail.length < BATCH_READ_LIMIT
          ? Promise.resolve(primeAndReturn("Permitting authorized users", null, null, batched.AuthorizedEmail))`
  },
];

edits['src/pages/EstimatorQueues.jsx'] = [
  {
    old_text: `    try { const reloaded = await loadAllEntityRows({ entity: base44.entities.AllInOneEstimate, sort: "-created_date", label: "Estimator queue" }); setEstimates(reloaded); } catch {}`,
    new_text: `    try { const reloaded = await loadAllEntityRows({ entity: staffEntities.AllInOneEstimate, sort: "-created_date", label: "Estimator queue" }); setEstimates(reloaded); } catch {}`
  },
];

edits['src/pages/QuoteSettings.jsx'] = [
  {
    old_text: `try { setGroups(await staffEntities.list("TaxGroup", "sort_order", 200)); }`,
    new_text: `try { setGroups(await staffEntities.TaxGroup.list("sort_order", 200)); }`
  },
  {
    old_text: `await staffEntities.create("TaxGroup", {`,
    new_text: `await staffEntities.TaxGroup.create({`
  },
  {
    old_text: `try { await staffEntities.update("TaxGroup", row.id, patchFields); await load(); }`,
    new_text: `try { await staffEntities.TaxGroup.update(row.id, patchFields); await load(); }`
  },
  {
    old_text: `try { await staffEntities.delete("TaxGroup", row.id); await load(); }`,
    new_text: `try { await staffEntities.TaxGroup.delete(row.id); await load(); }`
  },
];

edits['src/pages/EstimatorCustomers.jsx'] = [
  {
    old_text: `if (existing?.id) { await staffEntities.update("MarkupTier", existing.id, data); updated += 1; }`,
    new_text: `if (existing?.id) { await staffEntities.MarkupTier.update(existing.id, data); updated += 1; }`
  },
  {
    old_text: `else { await staffEntities.create("MarkupTier", data); created += 1; }`,
    new_text: `else { await staffEntities.MarkupTier.create(data); created += 1; }`
  },
];

edits['src/components/permitting/permitLineItemIntegration.js'] = [
  {
    old_text: `  const { items } = await staffEntities.PermitLineItem.filter(
    { work_order_id: workOrderId, row_name: { $in: rowNames } },
    { limit: 100, fields: ["id", "row_name", "status", "notes", "office_types", "locality_name"] },
  );`,
    new_text: `  // NOTE: the staff read facade only forwards sort/limit/skip from an
  // options object — a "fields" projection would be silently dropped, so the
  // rows come back whole. The options form stays for its paged {items}
  // return contract.
  const { items } = await staffEntities.PermitLineItem.filter(
    { work_order_id: workOrderId, row_name: { $in: rowNames } },
    { limit: 100 },
  );`
  },
];

edits['src/pages/AuditLog.jsx'] = [
  {
    old_text: `  const [rows, setRows] = useState(null);`,
    new_text: `  const [rows, setRows] = useState(null);
  const [capped, setCapped] = useState(false);`
  },
  {
    old_text: `        if (live) setRows([...rev, ...act].sort((a, b) => String(b.ts).localeCompare(String(a.ts))).slice(0, 200));`,
    new_text: `        const merged = [...rev, ...act].sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
        if (live) {
          setRows(merged.slice(0, 200));
          // Honest bound: each source read stops at 150 rows and the merged
          // timeline at 200 — say so instead of implying the log is complete.
          setCapped(revisions.length >= 150 || activities.length >= 150 || merged.length > 200);
        }`
  },
  {
    old_text: `<span className="ml-auto text-xs text-gray-400">{rows?.length ?? 0} records</span>`,
    new_text: `<span className="ml-auto text-xs text-gray-400">{rows?.length ?? 0} records{capped ? " · showing newest only (capped)" : ""}</span>`
  },
];

edits['src/components/ClientSearchInput.jsx'] = [
  {
    old_text: `  const [showRecent, setShowRecent] = useState(false);`,
    new_text: `  const [showRecent, setShowRecent] = useState(false);
  const [scannedCap, setScannedCap] = useState(false);`
  },
  {
    old_text: `        setRecentClients(unique);`,
    new_text: `        setRecentClients(unique);
        // Recents are built from a bounded scan of the last 100 projects —
        // flag a full window so the dropdown can disclose it.
        setScannedCap((projs || []).length >= 100);`
  },
  {
    old_text: `            </div>
          ))}
        </div>
      )}
      {isOpen && enabled && results.length > 0 && (`,
    new_text: `            </div>
          ))}
          {scannedCap && (
            <div className="px-3 py-1 text-[9px] text-slate-400 bg-slate-50 border-t border-slate-100">
              From the 100 most recent projects
            </div>
          )}
        </div>
      )}
      {isOpen && enabled && results.length > 0 && (`
  },
];

const fileMap = {
  'src/lib/workOrderCache.js': 'src__lib__workOrderCache.js',
  'src/pages/MainWorkflow.jsx': 'src__pages__MainWorkflow.jsx',
  'src/pages/Permitting.jsx': 'src__pages__Permitting.jsx',
  'src/pages/EstimatorQueues.jsx': 'src__pages__EstimatorQueues.jsx',
  'src/pages/QuoteSettings.jsx': 'src__pages__QuoteSettings.jsx',
  'src/pages/EstimatorCustomers.jsx': 'src__pages__EstimatorCustomers.jsx',
  'src/components/permitting/permitLineItemIntegration.js': 'src__components__permitting__permitLineItemIntegration.js',
  'src/pages/AuditLog.jsx': 'src__pages__AuditLog.jsx',
  'src/components/ClientSearchInput.jsx': 'src__components__ClientSearchInput.jsx',
};
let ok = true;
for (const [path, list] of Object.entries(edits)) {
  const local = dir + fileMap[path];
  if (!fs.existsSync(local)) { console.error(`MISSING local pull ${local}`); ok = false; continue; }
  const content = fs.readFileSync(local, 'utf8');
  for (const [i, e] of list.entries()) {
    const count = content.split(e.old_text).length - 1;
    if (count !== 1) { console.error(`FAIL ${path} edit#${i}: ${count} occurrences`); ok = false; }
  }
  fs.writeFileSync(`${dir}edits_${fileMap[path].replace(/[^a-zA-Z0-9]/g, '_')}.json`, JSON.stringify(list));
  console.log(`${ok ? 'OK' : 'PARTIAL'} ${path}: ${list.length} edits`);
}
process.exit(ok ? 0 : 1);
