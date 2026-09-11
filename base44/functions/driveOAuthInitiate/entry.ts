import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { issueOAuthState } from '../../shared/oauthState.ts';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clientId = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID');
    const redirectUri = `${new URL(req.url).origin}/api/functions/driveOAuthCallback`;
    const state = await issueOAuthState(user, 'drive_oauth');
    
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.readonly email',
      access_type: 'offline',
      prompt: 'consent',
      state
    });

    return Response.json({ authUrl });
  } catch (error) {
    console.error('driveOAuthInitiate error:', error?.message || error);
    return Response.json({ error: 'Google Drive authorization could not be started safely' }, { status: 500 });
  }
});