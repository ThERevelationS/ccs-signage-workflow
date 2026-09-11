import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const query = String(body?.query || '').trim();
    const state = String(body?.state || '').trim();
    if (!query) return Response.json({ error: 'query required' }, { status: 400 });
    if (query.length > 500 || state.length > 100) {
      return Response.json({ error: 'Jurisdiction search input is too large' }, { status: 400 });
    }

    // First search existing jurisdictions
    const all = await loadAllEntityRows({
      entity: base44.entities.JurisdictionProfile,
      sort: 'created_date',
      label: 'Jurisdiction search catalog',
    });
    const queryLower = query.toLowerCase();
    const existing = all.filter(j =>
      j.name?.toLowerCase().includes(queryLower) ||
      j.state?.toLowerCase().includes(queryLower) ||
      j.ai_summary?.toLowerCase().includes(queryLower)
    );

    // Also use AI to search across document content
    const contentMatches = all.filter(j => {
      if (state && j.state !== state) return false;
      return (j.documents || []).some(d =>
        d.extracted_text?.toLowerCase().includes(queryLower) ||
        d.ai_summary?.toLowerCase().includes(queryLower) ||
        d.title?.toLowerCase().includes(queryLower)
      );
    });

    const combined = [...new Map([...existing, ...contentMatches].map(j => [j.id, j])).values()];

    return Response.json({ results: combined });
  } catch (error) {
    console.error('searchJurisdictions error:', error?.message || error);
    return Response.json({ error: 'Jurisdiction search could not be completed safely' }, { status: 500 });
  }
});