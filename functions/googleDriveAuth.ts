import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'getPickerToken') {
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');
      return Response.json({ token: accessToken });
    }

    if (action === 'listFiles') {
      // Due to drive.file scope limitations, we cannot list folder contents
      // The app can only see files that are explicitly opened/created by it
      return Response.json({ 
        files: [],
        message: 'Google Drive folder browsing is not available with current permissions. Please access files directly through Google Drive.'
      });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error) {
    console.error('Function error:', error);
    return Response.json({ 
      error: 'Server error',
      message: error.message 
    }, { status: 500 });
  }
});