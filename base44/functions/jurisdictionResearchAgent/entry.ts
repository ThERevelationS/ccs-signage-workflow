import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { normalizePermittingResearchInput } from '../../shared/permittingResearchInput.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null);
    let researchInput;
    try {
      researchInput = normalizePermittingResearchInput(body);
    } catch (validationError) {
      return Response.json({ error: validationError?.message || 'Invalid permitting research input' }, { status: 400 });
    }
    const { jurisdictionName, jurisdictionState, jurisdictionType, includeParentCounty } = researchInput;

    // Main research agent prompt - with detailed instructions for accurate data gathering
    const researchPrompt = `You are a specialized research agent for gathering sign permitting information. Your goal is to find ACCURATE, VERIFIED information from official sources.

JURISDICTION TARGET: ${jurisdictionName} ${jurisdictionType}, ${jurisdictionState}

=== CRITICAL RULES ===
1. ONLY use official government sources (city/county/state websites)
2. DO NOT fabricate, guess, or hallucinate URLs or data
3. If information cannot be verified, explicitly state "INFORMATION NOT FOUND" 
4. Cross-reference information when possible
5. Prioritize official ordinances and zoning codes over secondary sources
6. For each URL you provide, verify it exists and is from an official government domain

=== RESEARCH OBJECTIVES ===

A. OFFICIAL WEBSITES
   - Find the official ${jurisdictionName} government website
   - Find the official permitting/zoning department page
   - Verify these are actual current URLs from official sources

B. SIGN PERMIT REQUIREMENTS
   Research the actual sign permit rules including:
   - Does a permit requirement exist? (yes/no)
   - Maximum sign area in square feet (if regulated)
   - Maximum sign height in feet (if regulated)
   - Setback requirements from property lines/streets
   - Are illuminated signs allowed?
   - Are electronic/digital signs allowed?
   - Permit application fees (fee range if varies)
   - Processing timeline (days to approve)
   - Any material restrictions or design standards

C. REGULATORY DOCUMENTS
   Find and document:
   - Sign Ordinance(s) - the local regulation about signs
   - Zoning Code sections mentioning signs
   - Permit application forms (official government versions)
   - Fee schedules or permit fee information
   - Design guidelines if they exist

D. CONTACT INFORMATION
   Gather from official sources:
   - Department/office responsible for permits
   - Official phone number
   - Official email address
   - Physical office address

E. PROPERTY LOOKUP DATABASE
   Find the jurisdiction's property/parcel lookup system:
   - Many counties have CAGIS or equivalent systems
   - Usually found on county assessor or property appraiser website
   - Should allow searching by address or parcel number

${includeParentCounty && jurisdictionType !== 'county' ? `F. PARENT COUNTY INFORMATION
   Since this is a ${jurisdictionType}:
   - Research the actual parent county
   - Find parent county permitting resources
   - Identify which rules come from county vs. local jurisdiction
   - Document parent county ordinances that apply` : ''}

=== RESPONSE FORMAT ===
Return ONLY valid JSON with this structure. Leave fields null if not found:

{
  "website_url": "https://official-url.gov",
  "permitting_url": "https://official-permitting-page.gov",
  "cagis_database_url": "https://property-lookup-system.gov",
  "ai_summary": "2-3 sentence summary of the sign permit process and key requirements",
  "contact_info": {
    "department": "Official Department Name",
    "phone": "Phone number from official source",
    "email": "Email from official source",
    "address": "Physical mailing address from official source"
  },
  "permit_requirements": {
    "requires_permit": true,
    "max_sign_area_sqft": 200,
    "max_height_ft": 25,
    "setback_requirements": "Description from official ordinance",
    "illumination_allowed": true,
    "electronic_signs_allowed": false,
    "fee_range": "$150-$300",
    "processing_time": "10-15 business days"
  },
  "documents": [
    {
      "title": "Sign Ordinance Chapter 25",
      "url": "https://official-source-url.gov/ordinance",
      "doc_type": "sign_ordinance",
      "source": "local",
      "verification_notes": "Found on official city website, last updated 2024"
    }
  ],
  "sqft_width_height_rules": "Detailed rules from official ordinance text",
  "height_allowances": "Specific height regulations by location type",
  "setback_rules": "Setback distance requirements from official code",
  "lighting_allowances": "Illumination and lighting restrictions",
  ${includeParentCounty && jurisdictionType !== 'county' ? `"parent_county": {
    "name": "Parent County Name",
    "website_url": "https://official-county-url.gov",
    "permitting_url": "https://county-permitting.gov",
    "contact_info": { "department": "", "phone": "", "email": "", "address": "" },
    "documents": [
      { "title": "County Sign Ordinance", "url": "...", "doc_type": "sign_ordinance", "source": "county" }
    ]
  },` : ''}
  "data_quality": {
    "sources_checked": ["list of official sources you checked"],
    "confidence": "high|medium|low",
    "notes": "Any limitations or caveats about the data"
  }
}

=== QUALITY CHECKLIST ===
Before returning:
☐ All URLs are from official government domains
☐ No URLs were fabricated or guessed
☐ Contact info is from official sources
☐ Data comes from current ordinances (not outdated)
☐ Specific numbers/rules can be traced to actual documents
☐ "INFORMATION NOT FOUND" is used when data cannot be verified
☐ Parent county information is accurate if included`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: researchPrompt,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          website_url: { type: ["string", "null"] },
          permitting_url: { type: ["string", "null"] },
          cagis_database_url: { type: ["string", "null"] },
          ai_summary: { type: ["string", "null"] },
          contact_info: { type: "object" },
          permit_requirements: { type: "object" },
          documents: { type: "array", items: { type: "object" } },
          parent_county: { type: ["object", "null"] },
          sqft_width_height_rules: { type: ["string", "null"] },
          height_allowances: { type: ["string", "null"] },
          setback_rules: { type: ["string", "null"] },
          lighting_allowances: { type: ["string", "null"] },
          data_quality: { type: "object" }
        }
      }
    });

    const data = typeof result === 'string' ? JSON.parse(result) : result;
    
    return Response.json({ 
      success: true, 
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('jurisdictionResearchAgent error:', error?.message || error);
    return Response.json({ error: 'Jurisdiction research could not be completed safely' }, { status: 500 });
  }
});