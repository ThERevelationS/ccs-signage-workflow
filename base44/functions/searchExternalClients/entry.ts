import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// SignEstimate Pro used a service-token client to search the CCS app from a
// separate app. This function now runs inside CCS itself, so the same lookup can
// be performed directly with the authenticated app client and no cross-app token.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || !user.enable_ccs_database_lookup) {
      return Response.json({ error: 'Unauthorized: CCS database lookup not enabled for this user' }, { status: 401 });
    }

    const { search } = await req.json().catch(() => ({}));
    const normalizedSearch = String(search || '').trim();
    if (normalizedSearch.length < 2) return Response.json({ results: [] });
    if (normalizedSearch.length > 200) {
      return Response.json({ error: 'Search term is too long' }, { status: 400 });
    }

    const escapedSearch = normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const records = await base44.asServiceRole.entities.WorkOrder.filter(
      { client_name: { $regex: escapedSearch, $options: 'i' } },
      '-created_date',
      15
    );

    const uniqueResults = [];
    const seen = new Set();
    for (const row of records || []) {
      let clientName = row.client_name || '';
      let projectName = '';
      if (clientName.includes(' - ')) {
        const parts = clientName.split(' - ');
        clientName = parts[0].trim();
        projectName = parts.slice(1).join(' - ').trim();
      }
      const estimateNumber = row.corbridge_invoice_number || '';
      const key = `${clientName}-${projectName}-${estimateNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueResults.push({
        client_name: clientName,
        project_name: projectName,
        estimate_number: estimateNumber,
        hyperlink: row.google_drive_folder_url || row.corbridge_link || row.hyperlink || '',
      });
      if (uniqueResults.length >= 15) break;
    }

    return Response.json({ results: uniqueResults });
  } catch (error) {
    console.error('searchExternalClients error:', error?.message || error);
    return Response.json({ error: 'Client search could not be completed safely' }, { status: 500 });
  }
});
