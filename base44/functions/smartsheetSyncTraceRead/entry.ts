import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

export default async function(req) {
  try {
    const client = createClientFromRequest(req), body = await req.json();
    const actor = body.session_token ? await authenticateSignShopSession(client, body.session_token) : await client.auth.me();
    if (actor?.role !== 'admin') return Response.json({ success: false, error: 'Admin access is required.' }, { status: 403 });
    const entity = client.asServiceRole.entities.SmartsheetSyncTrace;
    if (body.trace_id) {
      if (!/^[A-Za-z0-9_-]{6,80}$/.test(String(body.trace_id))) return Response.json({ success: false, error: 'Invalid trace.' }, { status: 400 });
      const trace = await entity.get(body.trace_id);
      return Response.json({ success: true, trace });
    }
    const page = await entity.filter({}, { sort: '-requested_at', limit: 10,
      fields: ['sync_run_id','source','action','requested_at','completed_at','last_checkpoint_at','status','metrics','stages','limitations'], ...(body.cursor ? { cursor: String(body.cursor) } : {}) });
    return Response.json({ success: true, ...page });
  } catch (error) { return Response.json({ success: false, error: 'Sync traces could not be loaded.', status: error?.status || 500 }, { status: error?.status || 500 }); }
}