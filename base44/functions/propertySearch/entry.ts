import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchTerm } = await req.json();
    
    if (!searchTerm || !searchTerm.trim()) {
      return Response.json({ error: 'Search term required' }, { status: 400 });
    }

    // Use AI to search for comprehensive property information
    const prompt = `Search for comprehensive property and location information for: "${searchTerm}"

Find and compile the following information if available:
1. Full address
2. Parcel number and legal description
3. Owner name and ownership type
4. Zoning classification and use restrictions
5. Permit history (recent building/sign permits)
6. Property assessment data (if available)
7. Any other relevant municipal codes or restrictions

Format the response as structured data with clear sections for each category.
If information is not available for any category, indicate that clearly.
Focus on accuracy - only include information you can verify from official sources.`;

    const propertyData = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      response_json_schema: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'Full property address' },
          parcelInfo: { type: 'string', description: 'Parcel number and legal description' },
          ownerInfo: { type: 'string', description: 'Owner name and ownership details' },
          zoningInfo: { type: 'string', description: 'Zoning classification and use restrictions' },
          permitHistory: { type: 'string', description: 'Recent permits and history' },
          assessmentData: { type: 'string', description: 'Property assessment information' },
          additionalNotes: { type: 'string', description: 'Other relevant information' }
        }
      }
    });

    return Response.json({ propertyData });
  } catch (error) {
    console.error('Search error:', error);
    return Response.json({ 
      error: 'Failed to retrieve property information. Please try a more specific address.',
      details: error.message 
    }, { status: 500 });
  }
});