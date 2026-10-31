import {assertResearchSourceIdentity} from '../../shared/permittingSourceIdentity.mjs';
import {attachScanReporter} from '../../shared/permittingScanReporter.mjs';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { normalizePermittingResearchInput } from '../../shared/permittingResearchInput.ts';
import { sanitizeJurisdictionResearch } from '../../shared/jurisdictionResearchSanitizer.ts';
import {officeResearchPrompt,officeResearchResponseSchema,normalizeOfficeResearch} from '../../shared/permittingOfficeResearch.mjs';
import { hasInternalFunctionCapability } from '../../shared/internalFunctionCapability.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => null);
    const internal = hasInternalFunctionCapability(body);
    const user = await base44.auth.me().catch(() => null);
    if (!internal) {
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
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
3. If information cannot be verified, return null for that field instead of placeholder text
4. Cross-reference information when possible
5. Prioritize official ordinances and zoning codes over secondary sources
6. For each URL you provide, verify it exists and is from an official government domain
7. If regulatory requirements come from a proposed, draft, newly rewritten, or comprehensive replacement zoning/sign code, flag authority_candidate.is_comprehensive_rewrite=true. A posted rewrite is not current law merely because it is publicly available.

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

C. REGULATORY DOCUMENTS, FORMS, AND ONLINE PORTALS
   Search the official jurisdiction site deeply enough to identify every sign-permitting resource you can verify, including:
   - Sign ordinance(s) or adopted code pages/PDFs governing signs
   - Zoning code chapters/sections mentioning signs
   - Sign permit application forms, building/zoning permit forms, and supporting checklists
   - Fee schedules or official permit-fee pages/PDFs
   - Design guidelines and submission requirement documents
   - Official online permit/application portals or web forms used to submit sign/zoning/building permits

   DOCUMENT CAPTURE RULES:
   - Do not stop after finding the department landing page. Follow official links to the actual ordinance, form, PDF, portal, or code page.
   - Return each verified resource as a separate documents[] item with a useful title, direct official URL, and doc_type.
   - Use doc_type "permit_application" for downloadable application forms and official online application/permit portals.
   - Use doc_type "zoning_code" for official HTML code sections when no PDF exists.
   - Prefer direct PDF/form/code URLs over generic department homepages when both are available.
   - If an official portal is the only application method, include that portal in documents[] even though it is not a downloadable file.
   - Never invent a form or document URL. If a resource cannot be verified, omit it.

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

${officeResearchPrompt()}
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
  "authority_candidate": { "is_comprehensive_rewrite": false, "kind": "current_adopted|comprehensive_rewrite|zoning_rewrite|narrow_amendment|unknown", "notes": "Explain the authority classification" },
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
☐ Every verified application form, online submission portal, fee schedule, sign ordinance, and zoning-code resource found is represented in documents[]
☐ documents[] entries use direct official resource URLs, not merely generic department homepages when a deeper verified link exists
☐ null is used when data cannot be verified
☐ Parent county information is accurate if included`;

    if(body?.scan_run_id && user?.role==='admin'){
      const row=await base44.asServiceRole.entities.PermittingScanRun.get(body.scan_run_id);
      if(row?.owner_id===user.id && row.target_name===jurisdictionName && row.status==='running')await attachScanReporter(base44.asServiceRole.entities.PermittingScanRun,row.id).emit({kind:'search_instructions',detail:researchPrompt},{stage:'AI research — instructions submitted',indeterminate:true});
    }
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
          office_research: officeResearchResponseSchema,
          permit_requirements: { type: "object" },
          documents: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                doc_type: {
                  type: "string",
                  enum: ["sign_ordinance", "permit_application", "zoning_code", "fee_schedule", "checklist", "other"]
                },
                source: { type: "string" },
                verification_notes: { type: "string" }
              },
              required: ["title", "url", "doc_type"]
            }
          },
          parent_county: { type: ["object", "null"] },
          sqft_width_height_rules: { type: ["string", "null"] },
          height_allowances: { type: ["string", "null"] },
          setback_rules: { type: ["string", "null"] },
          lighting_allowances: { type: ["string", "null"] },
          authority_candidate: { type: "object" },
          data_quality: { type: "object" }
        }
      }
    });

    const data = sanitizeJurisdictionResearch(typeof result === 'string' ? JSON.parse(result) : result);
    assertResearchSourceIdentity({name:jurisdictionName,state:jurisdictionState},data);
    data.office_research = normalizeOfficeResearch(data.office_research,{jurisdiction:{name:jurisdictionName,state:jurisdictionState,type:jurisdictionType}});
    
    return Response.json({ 
      success: true, 
      data,
      ...(body?.scan_run_id?{research_instructions:researchPrompt}:{}),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('jurisdictionResearchAgent error:', error?.message || error);
    if (error?.code === 'SOURCE_IDENTITY_REVIEW_REQUIRED') return Response.json({error:error.message,code:error.code},{status:409});
    return Response.json({ error: 'Jurisdiction research could not be completed safely' }, { status: 500 });
  }
});