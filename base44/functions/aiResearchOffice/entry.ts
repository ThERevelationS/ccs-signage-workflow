import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// AI-powered office research — takes a rough office name + optional state,
// returns corrected name, office type, contact info, and suggested workflow steps.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { query, state, existing_office_types } = body || {};
    if (!query || !String(query).trim()) {
      return Response.json({ error: 'Missing query' }, { status: 400 });
    }

    const typeHint = Array.isArray(existing_office_types) && existing_office_types.length > 0
      ? `Pick one or more office_types from this list that fit (return as an array): ${existing_office_types.join(', ')}. A single office can cover multiple types (e.g. a combined "Planning & Zoning" office covers both Zoning and Building). Only pick types that are truly handled by this office — do not over-select.`
      : `Pick one or more short office_type labels (e.g. "Zoning", "Building", "Electrical", "Fire Marshal") that describe what this office handles.`;

    const prompt = `You are researching a permitting office for a sign company. The user typed a rough name — find the real office and return structured data.

User query: "${query}"
${state ? `State / region: ${state}` : ''}

Task:
1. Correct the official name (formal, as it appears on government websites).
2. Identify the office type(s)/categories this office covers. ${typeHint}
3. Find contact info (phone, email, website URL, physical address).
4. Suggest a standard sign permit workflow (3-6 steps). Typical shape:
   - "Application Submitted" (submitted_date)
   - "Follow-up" (followup_date, interval 14 days)
   - "Permit Received" (permit_received_date)
   Add checkbox steps for intermediate items if appropriate (e.g. "Plans Reviewed", "Inspection Scheduled").

Return ONLY valid data. If you cannot find something, leave the field empty (""). Do not invent phone numbers or emails.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: 'gemini_3_flash',
      response_json_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Corrected official office name' },
          office_types: {
            type: 'array',
            description: 'All office categories this office covers. Can be multiple.',
            items: { type: 'string' }
          },
          office_type: { type: 'string', description: 'LEGACY — primary/first category label. Also set office_types.' },
          contact_phone: { type: 'string' },
          contact_email: { type: 'string' },
          contact_website: { type: 'string' },
          contact_address: { type: 'string' },
          contact_notes: { type: 'string', description: 'Brief notes about jurisdiction/hours/etc.' },
          workflow_steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: {
                  type: 'string',
                  enum: ['checkbox', 'submitted_date', 'followup_date', 'permit_received_date', 'text']
                },
                followup_interval_days: { type: 'number' }
              },
              required: ['name', 'type']
            }
          },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          notes: { type: 'string', description: 'Anything the user should verify' }
        },
        required: ['name']
      }
    });

    return Response.json({ success: true, office: result });
  } catch (error) {
    console.error('aiResearchOffice error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});