import { useEffect, useRef, useState } from 'react';
const empty = () => ({ items: [], has_more: false, next_cursor: null });
export function queueBrowseQuery(filters, search) {
  const query = {};
  for (const key of ['state','jurisdiction_type','status','parent_county_name']) if (filters[key] !== 'all') query[key] = filters[key];
  if (search.trim()) query.jurisdiction_name = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  return query;
}
export default function usePermittingQueueBrowse(readPage, filters, search) {
  const query = queueBrowseQuery(filters, search), scope = JSON.stringify(query);
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0), currentScope = useRef(scope), pending = useRef(null);
  currentScope.current = scope;
  const visible = result?.scope === scope ? result.page : empty();
  async function load(reset = true) {
    if (pending.current?.scope === scope || (!reset && (!visible.has_more || !visible.next_cursor))) return;
    const request = { scope, id: ++generation.current }; pending.current = request;
    const current = () => generation.current === request.id && currentScope.current === scope;
    setBusy(true); setError(''); if (reset) setResult(null);
    try {
      const page = await readPage(query, { sort: 'jurisdiction_name', limit: 50, ...(reset ? {} : { cursor: visible.next_cursor }) });
      if (!current()) return;
      if (!Array.isArray(page?.items) || typeof page.has_more !== 'boolean' || page.items.some(row => !row?.id) || (page.has_more && (!page.next_cursor || (!reset && page.next_cursor === visible.next_cursor)))) throw Error('Invalid queue continuation. Refresh the queue.');
      setResult({ scope, page: { ...page, items: reset ? page.items : [...new Map([...visible.items, ...page.items].map(row => [row.id,row])).values()] } });
    } catch (e) { if (current()) { setResult(null); setError({scope, message: e.message || 'Queue read failed.'}); } }
    finally { if (current()) { pending.current = null; setBusy(false); } }
  }
  useEffect(() => {
    generation.current++; pending.current = null; setResult(null); setError(''); load(true);
    return () => { generation.current++; };
    // Scope contains all query fields; pagination must not restart this effect.
  }, [scope, readPage]);
  return { queuePage: visible, loadingQueue: busy, queueError: error?.scope === scope ? error.message : '', loadQueue: load };
}
