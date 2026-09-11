import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';

const PERMITTING_APP_ID = '69b1840cf75aba55e115d020';
// Prefer the function secret when configured. The legacy fallback remains
// server-only so the existing permitting integration keeps working until the
// credential is rotated; browser code never receives either value.
const PERMITTING_API_KEY = Deno.env.get('PERMITTING_API_KEY') || '570bd85bbd4248b396864e2c628a6028';

const CREATE_FIELDS = [
  'jurisdiction_name',
  'state',
  'city',
  'county',
  'ccs_jurisdiction_id',
  'status',
  'requested_by',
];

function researchCreatePayload(payload: Record<string, unknown>) {
  const clean: Record<string, unknown> = {};
  for (const field of CREATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) clean[field] = payload[field];
  }
  clean.status = 'pending';
  if (!String(clean.jurisdiction_name || '').trim() || !String(clean.ccs_jurisdiction_id || '').trim()) {
    throw new Error('ResearchRequest requires jurisdiction_name and ccs_jurisdiction_id');
  }
  return clean;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch (_) {
      return Response.json({ error: 'Failed to parse request body' }, { status: 400 });
    }

    const action = String(body?.action || '').trim();
    const payload = body?.payload;
    if (!['create', 'poll'].includes(action) || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return Response.json({ error: 'Invalid permitting proxy action or payload' }, { status: 400 });
    }

    let url = `https://app.base44.com/api/apps/${PERMITTING_APP_ID}/entities/ResearchRequest`;
    if (action === 'poll') {
      const id = String(payload.id || '').trim();
      if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
        return Response.json({ error: 'Invalid ResearchRequest id' }, { status: 400 });
      }
      url += `/${encodeURIComponent(id)}`;
    }

    let createPayload = null;
    if (action === 'create') {
      try {
        createPayload = researchCreatePayload(payload);
      } catch (validationError) {
        return Response.json({ error: validationError?.message || 'Invalid ResearchRequest payload' }, { status: 400 });
      }
    }

    const response = await fetch(url, {
      method: action === 'poll' ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_key': PERMITTING_API_KEY,
      },
      ...(action === 'create' ? { body: JSON.stringify(createPayload) } : {}),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Permitting proxy upstream error:', response.status, errText);
      return Response.json({ error: 'Permitting research service returned an error', status: response.status }, { status: 502 });
    }

    const data = await response.json();
    return Response.json(data);
  } catch (e) {
    console.error('Permitting proxy error:', e);
    return Response.json({ error: 'Permitting research proxy failed' }, { status: 500 });
  }
});