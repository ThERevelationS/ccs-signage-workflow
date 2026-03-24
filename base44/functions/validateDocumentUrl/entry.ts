import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url } = await req.json();
    
    if (!url || !url.trim()) {
      return Response.json({ error: 'URL required' }, { status: 400 });
    }

    // Test if URL is reachable
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        redirect: 'follow'
      });

      const isValid = response.ok && response.status < 400;
      
      return Response.json({ 
        valid: isValid,
        status: response.status,
        url: response.url, // Follow redirects
        contentType: response.headers.get('content-type')
      });
    } catch (fetchError) {
      // URL cannot be reached
      return Response.json({
        valid: false,
        status: 0,
        error: fetchError.message
      });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});