import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

    // Ohio CAGIS API search
    const cagisUrl = `https://cagis.tax.ohio.gov/cagis/Common/QuickSearch.aspx`;
    
    try {
      const response = await fetch(`${cagisUrl}?term=${encodeURIComponent(searchTerm)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        return Response.json({ 
          error: 'CAGIS search unavailable',
          status: response.status
        }, { status: 503 });
      }

      const html = await response.text();
      
      // Parse the HTML response for property results
      // Look for parcel information in the response
      const results = [];
      
      // Extract property data from CAGIS response
      const propertyRegex = /property|parcel|location/gi;
      if (propertyRegex.test(html)) {
        results.push({
          type: 'cagis',
          found: true,
          message: 'Property found in Ohio CAGIS database',
          url: `https://cagis.tax.ohio.gov/cagis/Common/QuickSearch.aspx?term=${encodeURIComponent(searchTerm)}`
        });
      } else {
        results.push({
          type: 'cagis',
          found: false,
          message: 'No property found in Ohio CAGIS database'
        });
      }

      return Response.json({ results });
    } catch (cagisError) {
      // If CAGIS fails, try to help with basic info
      return Response.json({
        results: [{
          type: 'cagis',
          found: false,
          message: 'Unable to reach Ohio CAGIS at this time',
          error: cagisError.message
        }]
      }, { status: 503 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});