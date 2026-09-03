import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { secrets } from 'base44:runtime';
import { exchangeAuthorizationCode, saveConnection, fetchBouncieUser } from '../../shared/bouncie.ts';

function renderPage(title, message, success) {
  const color = success ? '#28a745' : '#dc3545';
  return `<!DOCTYPE html><html><head><title>${title}</title><style>body{font-family:Inter,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1b2029;color:#fff}.card{background:#fff;color:#333;padding:40px;border-radius:12px;max-width:420px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.3)}h1{color:${color};margin-top:0}p{line-height:1.5}a{color:#2b73ff;text-decoration:none}</style></head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

export default async function(req) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const errorParam = url.searchParams.get('error');
    if (errorParam) {
      return new Response(renderPage('Authorization Failed', errorParam, false), { status: 400, headers: { 'Content-Type': 'text/html' } });
    }
    if (!code) {
      return new Response(renderPage('Missing Code', 'No authorization code was received from Bouncie.', false), { status: 400, headers: { 'Content-Type': 'text/html' } });
    }

    const redirectUri = `${url.origin}/functions/bouncieAuthCallback`;
    const tokens = await exchangeAuthorizationCode(null, code, redirectUri);
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

    const base44 = createClientFromRequest(req);
    let userInfo = {};
    try { userInfo = await fetchBouncieUser(base44, tokens.access_token); } catch {}

    const appUser = await base44.auth.me().catch(() => null);

    await saveConnection(base44, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      token_type: tokens.token_type || 'Bearer',
      user_email: userInfo.email || '',
      user_name: userInfo.name || '',
      user_id: userInfo.id || '',
      connected_at: new Date().toISOString(),
      connected_by: appUser?.email || ''
    });

    return new Response(
      renderPage('Bouncie Connected!', 'Your Bouncie fleet account is now connected. You can close this window and return to the Fleet Tracking page.', true),
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  } catch (error) {
    return new Response(renderPage('Connection Error', error.message, false), { status: 500, headers: { 'Content-Type': 'text/html' } });
  }
}