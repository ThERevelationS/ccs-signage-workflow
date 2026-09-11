import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { constantTimeEqual } from '../../shared/constantTime.ts';

function b64urlEncode(str: string) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string) {
  let value = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (value.length % 4) value += '=';
  return atob(value);
}

async function hmacSign(message: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return b64urlEncode(String.fromCharCode(...new Uint8Array(sig)));
}

async function verifySessionToken(token: string, secret: string, authorized: any) {
  if (!token || !secret) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const [payloadStr, providedSig] = parts;
  const expectedSig = await hmacSign(payloadStr, secret);
  if (!constantTimeEqual(expectedSig, providedSig)) return null;

  let payload: any;
  try {
    payload = JSON.parse(b64urlDecode(payloadStr));
  } catch {
    return null;
  }
  const issuedAt = Number(payload?.iat);
  const expiresAt = Number(payload?.exp);
  if (
    !payload?.email ||
    !Number.isFinite(issuedAt) || issuedAt <= 0 ||
    !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt <= issuedAt
  ) return null;

  const email = String(payload.email).trim().toLowerCase();
  const rows = await authorized.filter({ email });
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const user = rows[0];
  const notBefore = Date.parse(String(user?.session_not_before || ''));
  if (Number.isFinite(notBefore) && notBefore > 0 && (!Number.isFinite(issuedAt) || issuedAt < notBefore)) return null;
  return user;
}

function asEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

async function badgeTokenHex(email: string, version: number, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(`timeclock-badge|${email}|${version}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const sessionToken = String(body?.session_token || '').trim();
    const requestedEmail = asEmail(body?.target_email);
    const rotate = body?.rotate === true;
    const secret = Deno.env.get('SESSION_SIGNING_SECRET') || '';

    const authorized = base44.asServiceRole.entities.AuthorizedEmail;
    const badgeEntity = base44.asServiceRole.entities.TimeClockBadge;
    const auditEntity = base44.asServiceRole.entities.TimeClockAudit;

    const actor = await verifySessionToken(sessionToken, secret, authorized);
    if (!actor?.id) {
      return Response.json({ success: false, error: 'A valid signed-in session is required to issue a Time Clock badge.' }, { status: 401 });
    }

    const actorEmail = asEmail(actor.email);
    const targetEmail = requestedEmail || actorEmail;
    if (!targetEmail) {
      return Response.json({ success: false, error: 'Employee identity is required.' }, { status: 400 });
    }
    if (targetEmail !== actorEmail && actor.role !== 'admin') {
      return Response.json({ success: false, error: 'Admin access is required to issue another employee badge.' }, { status: 403 });
    }

    const targetRows = await authorized.filter({ email: targetEmail });
    if (!Array.isArray(targetRows) || targetRows.length !== 1) {
      return Response.json({
        success: false,
        error: Array.isArray(targetRows) && targetRows.length === 0 ? 'Authorized employee not found.' : 'Authorized employee identity is ambiguous.',
      }, { status: Array.isArray(targetRows) && targetRows.length === 0 ? 404 : 409 });
    }
    const target = targetRows[0];

    const existingRows = await badgeEntity.filter({ user_email: targetEmail });
    if (!Array.isArray(existingRows)) throw new Error('Badge lookup did not return a record list.');
    const activeRows = existingRows.filter((row: any) => !row?.revoked_at);
    if (activeRows.length > 1) {
      return Response.json({ success: false, error: 'Multiple active Time Clock badges exist for this employee. Admin review is required before issuing another badge.' }, { status: 409 });
    }

    const existing = activeRows[0] || null;
    const highestHistoricalVersion = existingRows.reduce(
      (max: number, row: any) => Math.max(max, Number(row?.badge_version) || 0),
      0,
    );
    if (!existing && existingRows.length > 0 && !rotate) {
      return Response.json({ success: false, error: 'The previous badge has been revoked. Replace the badge to issue a new one.' }, { status: 409 });
    }

    const currentVersion = existing ? Math.max(1, Number(existing.badge_version) || 1) : Math.max(0, highestHistoricalVersion);
    const badgeVersion = existing ? (rotate ? currentVersion + 1 : currentVersion) : Math.max(1, currentVersion + 1);
    const rawToken = await badgeTokenHex(targetEmail, badgeVersion, secret);
    const tokenHash = await sha256Hex(`${targetEmail}|${badgeVersion}|${rawToken}`);
    const now = new Date().toISOString();
    const issuedAt = existing && !rotate ? (existing.issued_at || now) : now;

    let saved: any;
    let changed = false;
    let auditIntent: any = null;
    const authenticationMethod = actorEmail === targetEmail ? 'session' : 'admin_kiosk';
    const auditAction = existingRows.length > 0 ? 'badge_rotate' : 'badge_issue';

    if (existing?.id) {
      const needsNormalization = String(existing.token_hash || '') !== tokenHash || Number(existing.badge_version) !== badgeVersion;
      if (rotate || needsNormalization) {
        auditIntent = await auditEntity.create({
          action: auditAction,
          outcome: 'pending',
          user_email: targetEmail,
          user_name: target.full_name || targetEmail,
          actor_email: actorEmail,
          actor_role: actor.role,
          authentication_method: authenticationMethod,
          server_timestamp: now,
          details: { previous_badge_version: Number(existing.badge_version) || null, requested_badge_version: badgeVersion },
        });
        if (!auditIntent?.id) throw new Error('Badge audit intent could not be persisted. No badge was changed.');

        const result = await badgeEntity.updateMany(
          { id: existing.id, updated_date: existing.updated_date, user_email: targetEmail, revoked_at: existing.revoked_at || null },
          { $set: { token_hash: tokenHash, badge_version: badgeVersion, issued_at: issuedAt, revoked_at: null, last_used_at: null } },
        );
        if (!result || result.updated !== 1) {
          await auditEntity.updateMany({ id: auditIntent.id }, { $set: { outcome: 'blocked' } });
          return Response.json({ success: false, error: 'Badge changed in another session. Reload before trying again.' }, { status: 409 });
        }
        saved = await badgeEntity.get(existing.id);
        changed = true;
      } else {
        saved = existing;
      }
    } else {
      auditIntent = await auditEntity.create({
        action: auditAction,
        outcome: 'pending',
        user_email: targetEmail,
        user_name: target.full_name || targetEmail,
        actor_email: actorEmail,
        actor_role: actor.role,
        authentication_method: authenticationMethod,
        server_timestamp: now,
        details: { previous_badge_version: highestHistoricalVersion || null, requested_badge_version: badgeVersion },
      });
      if (!auditIntent?.id) throw new Error('Badge audit intent could not be persisted. No badge was changed.');

      saved = await badgeEntity.create({
        user_email: targetEmail,
        token_hash: tokenHash,
        badge_version: badgeVersion,
        issued_at: issuedAt,
        revoked_at: null,
        last_used_at: null,
      });
      const verifyRows = await badgeEntity.filter({ user_email: targetEmail });
      const verifyActiveRows = Array.isArray(verifyRows) ? verifyRows.filter((row: any) => !row?.revoked_at) : [];
      if (verifyActiveRows.length !== 1 || verifyActiveRows[0]?.id !== saved?.id) {
        await auditEntity.updateMany({ id: auditIntent.id }, { $set: { outcome: 'blocked' } });
        return Response.json({ success: false, error: 'Badge issuance could not be verified uniquely. Admin review is required.' }, { status: 409 });
      }
      changed = true;
    }

    if (!saved?.id || String(saved.token_hash || '') !== tokenHash || Number(saved.badge_version) !== badgeVersion) {
      if (auditIntent?.id) await auditEntity.updateMany({ id: auditIntent.id }, { $set: { outcome: 'blocked' } });
      return Response.json({ success: false, error: 'Badge issuance could not be verified.' }, { status: 500 });
    }

    if (changed) {
      if (!auditIntent?.id) throw new Error('Badge changed without a durable audit intent.');
      const auditResult = await auditEntity.updateMany({ id: auditIntent.id }, { $set: {
        outcome: 'confirmed',
        server_timestamp: new Date().toISOString(),
        details: {
          previous_badge_version: existing ? (Number(existing.badge_version) || null) : (highestHistoricalVersion || null),
          badge_version: badgeVersion,
        },
      } });
      if (!auditResult || auditResult.updated !== 1) {
        throw new Error('Badge changed but audit finalization could not be verified.');
      }
    }

    return Response.json({
      success: true,
      badge_code: `TIMECLOCK2:${b64urlEncode(targetEmail)}:${badgeVersion}:${rawToken}`,
      badge_version: badgeVersion,
      issued_at: issuedAt,
      rotated: Boolean(rotate && existingRows.length > 0),
      reused: Boolean(existing && !changed),
    });
  } catch (error) {
    console.error('issueTimeClockBadge error:', error?.message || error);
    return Response.json({ success: false, error: 'Time Clock badge could not be issued safely.' }, { status: 500 });
  }
});
