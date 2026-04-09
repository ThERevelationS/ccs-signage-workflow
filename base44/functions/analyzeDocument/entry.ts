import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { doc_text, doc_title, jurisdiction_name } = body;

    if (!doc_text || !doc_title) {
      return Response.json({ error: 'Missing doc_text or doc_title' }, { status: 400 });
    }

    const prompt = `Analyze this permitting document and extract key information in JSON format.

Document Title: ${doc_title}
${jurisdiction_name ? `Jurisdiction: ${jurisdiction_name}` : ''}

Document Content:
${doc_text.substring(0, 4000)}

Extract the following fields from the document (use null if not found):
{
  "permits_required": boolean or null,
  "permit_types": [string] or null,
  "fees": {
    "base_fee": string or null,
    "additional_fees": string or null,
    "total_estimate": string or null
  },
  "deadlines": {
    "processing_time": string or null,
    "application_deadline": string or null,
    "approval_timeline": string or null
  },
  "requirements": [string] or null,
  "contact_info": {
    "department": string or null,
    "phone": string or null,
    "email": string or null,
    "website": string or null
  },
  "max_sign_height": string or null,
  "max_sign_area": string or null,
  "setback_requirements": string or null,
  "illumination_allowed": boolean or null,
  "electronic_signs_allowed": boolean or null,
  "key_restrictions": [string] or null
}

Return ONLY valid JSON, no other text.`;

    const response = await base44.integrations.Core.InvokeLLM({
      prompt: prompt,
      add_context_from_internet: false,
      response_json_schema: {
        type: "object",
        properties: {
          permits_required: { type: ["boolean", "null"] },
          permit_types: { type: ["array", "null"], items: { type: "string" } },
          fees: {
            type: "object",
            properties: {
              base_fee: { type: ["string", "null"] },
              additional_fees: { type: ["string", "null"] },
              total_estimate: { type: ["string", "null"] }
            }
          },
          deadlines: {
            type: "object",
            properties: {
              processing_time: { type: ["string", "null"] },
              application_deadline: { type: ["string", "null"] },
              approval_timeline: { type: ["string", "null"] }
            }
          },
          requirements: { type: ["array", "null"], items: { type: "string" } },
          contact_info: {
            type: "object",
            properties: {
              department: { type: ["string", "null"] },
              phone: { type: ["string", "null"] },
              email: { type: ["string", "null"] },
              website: { type: ["string", "null"] }
            }
          },
          max_sign_height: { type: ["string", "null"] },
          max_sign_area: { type: ["string", "null"] },
          setback_requirements: { type: ["string", "null"] },
          illumination_allowed: { type: ["boolean", "null"] },
          electronic_signs_allowed: { type: ["boolean", "null"] },
          key_restrictions: { type: ["array", "null"], items: { type: "string" } }
        }
      }
    });

    return Response.json({ 
      success: true,
      extracted_data: response
    });

  } catch (error) {
    console.error('Document analysis error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});