import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';

// Normalize a string for fuzzy comparison
function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function computeMatchScore(extracted, wo) {
  let score = 0;
  const reasons = [];

  const normClient = normalize(extracted.client_name);
  const normWoClient = normalize(wo.client_name);
  const normTitle = normalize(extracted.description || extracted.client_name);
  const normWoTitle = normalize(wo.title);

  if (normClient && normWoClient) {
    if (normClient === normWoClient) { score += 40; reasons.push('Exact client name match'); }
    else if (normWoClient.includes(normClient) || normClient.includes(normWoClient)) { score += 25; reasons.push('Partial client name match'); }
    else {
      const clientWords = normClient.split(' ').filter(w => w.length > 2);
      const woWords = normWoClient.split(' ').filter(w => w.length > 2);
      const overlap = clientWords.filter(w => woWords.includes(w)).length;
      if (overlap > 0) { score += Math.min(15, overlap * 7); reasons.push(`${overlap} shared client name word(s)`); }
    }
  }

  if (normTitle && normWoTitle) {
    if (normTitle === normWoTitle) { score += 30; reasons.push('Exact title/description match'); }
    else if (normWoTitle.includes(normTitle) || normTitle.includes(normWoTitle)) { score += 15; reasons.push('Partial title match'); }
    else {
      const titleWords = normTitle.split(' ').filter(w => w.length > 2);
      const woTitleWords = normWoTitle.split(' ').filter(w => w.length > 2);
      const overlap = titleWords.filter(w => woTitleWords.includes(w)).length;
      if (overlap > 0) { score += Math.min(10, overlap * 4); reasons.push(`${overlap} shared title word(s)`); }
    }
  }

  const normAddr = normalize(extracted.install_location || extracted.billing_address);
  const normWoAddr = normalize(wo.install_location || wo.billing_address);
  if (normAddr && normWoAddr && normAddr.length > 5 && (normAddr === normWoAddr || normAddr.includes(normWoAddr) || normWoAddr.includes(normAddr))) {
    score += 20; reasons.push('Address match');
  }

  if (extracted.quoted_amount && wo.quoted_amount) {
    const diff = Math.abs(extracted.quoted_amount - wo.quoted_amount) / Math.max(extracted.quoted_amount, wo.quoted_amount);
    if (diff < 0.05) { score += 15; reasons.push('Very close quote amount'); }
    else if (diff < 0.10) { score += 8; reasons.push('Similar quote amount'); }
  }

  if (extracted.contact_email && wo.contact_email && normalize(extracted.contact_email) === normalize(wo.contact_email)) {
    score += 15; reasons.push('Contact email match');
  }
  if (extracted.contact_name && wo.contact_name && normalize(extracted.contact_name) === normalize(wo.contact_name)) {
    score += 10; reasons.push('Contact name match');
  }

  if (wo.est_inv_at || wo.corbridge_invoice_number) {
    score -= 20;
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { pending_import_id, extracted_data } = body;

    if (!pending_import_id || !extracted_data) {
      return Response.json({ error: 'Missing pending_import_id or extracted_data' }, { status: 400 });
    }

    // Load the complete active Work Order set before fuzzy matching so an
    // older valid candidate cannot disappear behind the entity default limit.
    const wos = await loadAllEntityRows({
      entity: base44.asServiceRole.entities.WorkOrder,
      query: { deleted: { $ne: true }, completed: { $ne: true } },
      sort: 'created_date',
      label: 'Pending import candidate Work Orders',
    });

    // Compute fuzzy scores
    const fuzzyMatches = wos
      .map(wo => {
        const { score, reasons } = computeMatchScore(extracted_data, wo);
        return { work_order_id: wo.id, work_order_title: wo.title, client_name: wo.client_name, current_stage: wo.current_stage, match_score: score, match_reasons: reasons };
      })
      .filter(c => c.match_score >= 15)
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 10);

    // Build a summary of top candidates for the AI to reason about
    const topCandidatesSummary = fuzzyMatches.slice(0, 10).map(c =>
      `- ID: ${c.work_order_id} | Title: "${c.work_order_title}" | Client: "${c.client_name}" | Stage: ${c.current_stage} | Score: ${c.match_score}% | Reasons: ${c.match_reasons.join(', ')}`
    ).join('\n');

    // Ask AI to reason and provide final ranked recommendations
    const aiPrompt = `You are a project matching assistant for a sign company. A new Corebridge import has come in and you need to find the best matching existing work orders.

IMPORT DATA:
- Client Name: ${extracted_data.client_name || 'N/A'}
- Description: ${extracted_data.description || 'N/A'}
- Contact: ${extracted_data.contact_name || 'N/A'} | ${extracted_data.contact_email || 'N/A'} | ${extracted_data.contact_phone || 'N/A'}
- Address: ${extracted_data.install_location || extracted_data.billing_address || 'N/A'}
- Amount: $${extracted_data.quoted_amount || 'N/A'}
- Products: ${(extracted_data.products || []).join(', ') || 'N/A'}
- Sales Rep: ${extracted_data.sales_rep || 'N/A'}

CANDIDATE WORK ORDERS (pre-scored by fuzzy matching):
${topCandidatesSummary || 'None found with any similarity.'}

Your task: Analyze the candidates and return your top recommendations. For each recommendation explain WHY it's a good match. If none of the candidates are a reasonable match for this import, say so clearly.

Return a JSON object with:
- recommendations: array of up to 5 objects, each with: work_order_id, work_order_title, client_name, current_stage, match_score (0-100), ai_reasoning (1-2 sentence explanation of why this is a match)
- no_matches_reason: if recommendations is empty, explain why no match was found (e.g. "No existing work orders share a similar client name, address, or amount")
- confidence: "high", "medium", or "low" overall confidence in the best recommendation`;

    const aiResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: aiPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          recommendations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                work_order_id: { type: "string" },
                work_order_title: { type: "string" },
                client_name: { type: "string" },
                current_stage: { type: "string" },
                match_score: { type: "number" },
                ai_reasoning: { type: "string" }
              }
            }
          },
          no_matches_reason: { type: "string" },
          confidence: { type: "string" }
        }
      }
    });

    // Merge AI recommendations with fuzzy match data, preserving fuzzy match_reasons
    const enrichedRecs = (aiResult.recommendations || []).map(rec => {
      const fuzzy = fuzzyMatches.find(f => f.work_order_id === rec.work_order_id);
      return {
        ...rec,
        match_reasons: fuzzy?.match_reasons || [],
        match_score: rec.match_score || fuzzy?.match_score || 0
      };
    });

    return Response.json({
      recommendations: enrichedRecs,
      no_matches_reason: aiResult.no_matches_reason || null,
      confidence: aiResult.confidence || null
    });

  } catch (error) {
    console.error('findPendingImportMatches error:', error?.message || error);
    return Response.json({ error: 'Pending import matching could not be completed safely' }, { status: 500 });
  }
});