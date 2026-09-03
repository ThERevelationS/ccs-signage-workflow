import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { exchangeAuthorizationCode, saveConnection, fetchBouncieUser, upsertWebhook } from '../../shared/bouncie.ts';

const FLEET_ROUTE = '/fleettracking';

function renderPage(title, message, success, detail) {
  const color = success ? '#28a745' : '#dc3545';
  const redirect = success
    ? `<script>setTimeout(function(){ window.location.href = "${FLEET_ROUTE}"; }, 2200);</script>`
    : `<p style="margin-top:20px"><a href="${FLEET_ROUTE}">Return to Fleet Tracking</a></p>`;
  return `<!DOCTYPE html><html><head><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    body{font-family:Inter,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#1b2029;color:#fff}
    .card{background:#fff;color:#333;padding:36px;border-radius:12px;max-width:440px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.35)}
    h1{color:${color};margin:0 0 12px;font-size:20px}p{line-height:1.55;font-size:14px;color:#495057}
    code{display:block;background:#f4f5f7;padding:10px;border-radius:6px;font-size:12px;margin-top:12px;word-break:break-all;color:#333}
    a{color:#2b73ff;text-decoration:none;font-weight:600}
  </style></head><body><div class="card"><h1>${title}</h1><p>${message}</p>${detail ? `<code>${detail}</code>` : ''}${redirect}</div></body></html>`;
}

function html(body, status) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html' } });
}

export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const stateParam = url.searchParams.get('state');
    const errorParam = url.searchParams.get('error');

    if (errorParam) {
      return html(renderPage('Authorization Cancelled',
        'Bouncie did not grant access. You can close this tab and try connecting again.', false), 400);
    }
    if (!code) {
      return html(renderPage('Missing Authorization Code',
        'Bouncie did not return an authorization code. Please start the connection again.', false), 400);
    }

    /* ---- OAuth state validation: required, unexpired, unused ---- */
    if (!stateParam) {
      return html(renderPage('Invalid Request',
        'The authorization response was missing its security token. Please start the connection again from Fleet Tracking.', false), 400);
    }
    const matches = await base44.asServiceRole.entities.BouncieOAuthState.filter({ state: stateParam });
    const stateRecord = matches && matches.length ? matches[0] : null;
    if (!stateRecord) {
      return html(renderPage('Invalid Security Token',
        'This authorization request could not be verified. Please start the connection again from Fleet Tracking.', false), 400);
    }
    if (stateRecord.used) {
      return html(renderPage('Authorization Already Used',
        'This authorization link has already been used. Please start a new connection from Fleet Tracking.', false), 400);
    }
    if (new Date(stateRecord.expires_at).getTime() < Date.now()) {
      return html(renderPage('Authorization Expired',
        'This authorization request expired. Please start the connection again from Fleet Tracking.', false), 400);
    }
    // One-time use — burn it before exchanging the code.
    await base44.asServiceRole.entities.BouncieOAuthState.update(stateRecord.id, {
      used: true, used_at: new Date().toISOString()
    });

    const redirectUri = stateRecord.redirect_uri || `${url.origin}/functions/bouncieAuthCallback`;
    const tokens = await exchangeAuthorizationCode(base44, code, redirectUri);

    let userInfo = {};
    try { userInfo = await fetchBouncieUser(base44, tokens.access_token); } catch {}
    const account = Array.isArray(userInfo) ? (userInfo[0] || {}) : userInfo;

    await saveConnection(base44, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      token_type: tokens.token_type || 'Bearer',
      user_email: account.email || '',
      user_name: account.name || '',
      user_id: String(account.id || ''),
      connected_at: new Date().toISOString(),
      connected_by: stateRecord.initiated_by || '',
      needs_reconnect: false,
      last_error: ''
    });

    // Automatically verify / repair the webhook registration for this app.
    let webhookNote = '';
    try {
      const result = await upsertWebhook(base44, url.origin);
      webhookNote = `Fleet event webhook ${result.action}.`;
    } catch (e) {
      webhookNote = 'Connected, but the fleet event webhook could not be configured automatically — use "Repair Webhook" on the Fleet Tracking integration panel.';
      try {
        await base44.asServiceRole.entities.BouncieConnection.list().then(async (list) => {
          if (list && list.length) {
            await base44.asServiceRole.entities.BouncieConnection.update(list[0].id, {
              webhook_error: 'Automatic webhook configuration failed.',
              webhook_checked_at: new Date().toISOString()
            });
          }
        });
      } catch {}
    }

    return html(renderPage('Bouncie Connected',
      `Your Bouncie fleet account is connected. ${webhookNote} Returning you to Fleet Tracking...`, true), 200);
  } catch (error) {
    const reauth = error.message === 'BOUNCIE_REAUTH_REQUIRED';
    return html(renderPage('Connection Error',
      reauth
        ? 'Bouncie rejected the authorization. Please try connecting again.'
        : 'We could not complete the Bouncie connection. Please try again from Fleet Tracking.',
      false), 500);
  }
}