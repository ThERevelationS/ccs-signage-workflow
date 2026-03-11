
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const PERMITTING_APP_ID = '69b1840cf75aba55e115d020';
const PERMITTING_API_KEY = '570bd85bbd4248b396864e2c628a6028';

Deno.serve(async (req) => {
  try {
    const { action, payload } = await req.json();

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

    const data = await response.json();
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});