import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { safeExternalFetch } from '../../shared/safeExternalFetch.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url } = await req.json();
    
    if (!url || !url.trim()) {
      return Response.json({ error: 'URL required' }, { status: 400 });
    }

    // Test if URL is reachable
    try {
      const response = await safeExternalFetch(url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
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
        error: Number(fetchError?.status || 0) === 400 ? fetchError.message : 'URL could not be reached safely'
      });
    }
  } catch (error) {
    console.error('validateDocumentUrl error:', error?.message || error);
    return Response.json({ error: 'URL validation could not be completed safely' }, { status: 500 });
  }
});