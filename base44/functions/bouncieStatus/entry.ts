import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { getActiveConnection, callBouncieApi } from '../../shared/bouncie.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const conn = await getActiveConnection(base44);
    if (!conn) return Response.json({ connected: false });

    let userInfo = null;
    try {
      userInfo = await callBouncieApi(base44, 'GET', '/v1/user');
    } catch (e) {
      // token may be expired/invalid but connection record exists
    }

    return Response.json({
      connected: true,
      user: userInfo,
      connectedEmail: conn.user_email,
      connectedName: conn.user_name,
      connectedAt: conn.connected_at
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}