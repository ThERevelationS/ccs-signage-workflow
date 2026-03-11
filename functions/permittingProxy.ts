const PERMITTING_APP_ID = '69b1840cf75aba55e115d020';
const PERMITTING_API_KEY = '570bd85bbd4248b396864e2c628a6028';

Deno.serve(async (req) => {
  try {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return Response.json({ error: 'Failed to parse request body', detail: String(e) }, { status: 400 });
    }

    const { action, payload } = body;

    if (!action || !payload) {
      return Response.json({ error: 'Missing action or payload', received: body }, { status: 400 });
    }

    let url = `https://app.base44.com/api/apps/${PERMITTING_APP_ID}/entities/ResearchRequest`;
    if (action === 'poll') url += `/${payload.id}`;

    const response = await fetch(url, {
      method: action === 'poll' ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_key': PERMITTING_API_KEY
      },
      ...(action !== 'poll' && { body: JSON.stringify(payload) })
    });

    if (!response.ok) {
      const errText = await response.text();
      return Response.json({ error: 'Upstream API error', status: response.status, detail: errText }, { status: 502 });
    }

    const data = await response.json();
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: String(e), stack: e?.stack }, { status: 500 });
  }
});