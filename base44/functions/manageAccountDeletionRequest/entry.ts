import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function cleanText(value: unknown, maxLength = 200) {
  return String(value || '').trim().slice(0, maxLength);
}

function sameRequestIdentity(record: any, actorId: string, actorEmail: string) {
  return (
    cleanText(record?.authorized_email_id, 200) === actorId &&
    normalizeEmail(record?.user_email) === actorEmail
  );
}

function canonicalRequest(rows: any[]) {
  return [...rows].sort((a, b) => {
    const aTime = String(a?.created_date || a?.requested_at || '');
    const bTime = String(b?.created_date || b?.requested_at || '');
    const byTime = aTime.localeCompare(bTime);
    if (byTime !== 0) return byTime;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  })[0] || null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function publicRequest(record: any) {
  if (!record?.id) return null;
  return {
    id: record.id,
    status: String(record.status || 'pending'),
    requested_at: record.requested_at || record.created_date || null,
  };
}

async function loadOwnRequest(Request: any, actor: any) {
  const actorId = cleanText(actor?.id, 200);
  const actorEmail = normalizeEmail(actor?.email);
  if (!actorId || !actorEmail) {
    throw Object.assign(new Error('Authenticated user identity is incomplete.'), { status: 503 });
  }

  const creationKey = `account-deletion:${actorId}`;
  const rows = await Request.filter({ creation_key: creationKey });
  if (!Array.isArray(rows)) {
    throw Object.assign(new Error('Deletion request lookup did not return a record list.'), { status: 503 });
  }
  if (rows.length > 1) {
    throw Object.assign(new Error('Multiple deletion requests exist for this account. An administrator must resolve them before another request can be submitted.'), { status: 409 });
  }

  const existing = rows[0] || null;
  if (existing && !sameRequestIdentity(existing, actorId, actorEmail)) {
    throw Object.assign(new Error('Deletion request identity does not match the signed-in account.'), { status: 409 });
  }

  return { actorId, actorEmail, creationKey, existing };
}

async function createOwnPendingRequest(Request: any, actor: any, actorId: string, actorEmail: string, creationKey: string) {
  const payload = {
    creation_key: creationKey,
    authorized_email_id: actorId,
    user_email: actorEmail,
    user_name: cleanText(actor?.full_name || actor?.name || actorEmail, 200),
    status: 'pending',
    requested_at: new Date().toISOString(),
  };

  let created: any = null;
  let createError: any = null;
  try {
    created = await Request.create(payload);
  } catch (error) {
    createError = error;
  }

  // Re-read after create so simultaneous submissions converge on one canonical row.
  // This also recovers a successful create whose response was lost.
  await delay(75);
  let contenders = await Request.filter({ creation_key: creationKey });
  if (!Array.isArray(contenders)) {
    if (createError) throw createError;
    throw Object.assign(new Error('Deletion request create verification did not return a record list.'), { status: 503 });
  }
  if (contenders.length === 0) {
    if (createError) throw createError;
    throw new Error('Account deletion request create outcome could not be verified.');
  }
  if (contenders.some((row: any) => !sameRequestIdentity(row, actorId, actorEmail) || String(row?.status || '').toLowerCase() !== 'pending')) {
    throw Object.assign(new Error('Deletion request create identity is ambiguous. An administrator must review it before retrying.'), { status: 409 });
  }

  const winner = canonicalRequest(contenders);
  if (!winner?.id) throw new Error('Account deletion request create outcome could not be verified.');

  if (contenders.length > 1) {
    for (const duplicate of contenders) {
      if (duplicate?.id && duplicate.id !== winner.id) {
        await Request.delete(duplicate.id).catch(() => null);
      }
    }
    await delay(25);
  }

  contenders = await Request.filter({ creation_key: creationKey });
  if (!Array.isArray(contenders)) {
    throw Object.assign(new Error('Deletion request cleanup verification did not return a record list.'), { status: 503 });
  }
  if (contenders.length !== 1) {
    throw Object.assign(new Error('Multiple deletion requests were created concurrently. An administrator must review them before retrying.'), { status: 409 });
  }

  const saved = contenders[0];
  if (!sameRequestIdentity(saved, actorId, actorEmail) || String(saved?.status || '').toLowerCase() !== 'pending') {
    throw Object.assign(new Error('Deletion request identity changed while the request was being created.'), { status: 409 });
  }

  return {
    request: saved,
    reused: !created?.id || created.id !== saved.id,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    const Request = base44.asServiceRole.entities.AccountDeletionRequest;
    const action = String(body?.action || 'status').trim().toLowerCase();

    const { actorId, actorEmail, creationKey, existing } = await loadOwnRequest(Request, actor);

    if (action === 'status') {
      return Response.json({
        success: true,
        request: publicRequest(existing),
      });
    }

    if (action === 'request') {
      if (existing) {
        if (String(existing.status || '').toLowerCase() !== 'pending') {
          return Response.json({
            error: 'A previous account deletion request is no longer pending. Contact an administrator before submitting another request.',
          }, { status: 409 });
        }

        return Response.json({
          success: true,
          request: publicRequest(existing),
          reused: true,
        });
      }

      const created = await createOwnPendingRequest(Request, actor, actorId, actorEmail, creationKey);

      return Response.json({
        success: true,
        request: publicRequest(created.request),
        reused: created.reused,
      });
    }

    return Response.json({ error: 'Invalid account deletion request action.' }, { status: 400 });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 409, 503].includes(status) ? status : 500;
    console.error('manageAccountDeletionRequest error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500
        ? 'Your account deletion request could not be handled safely.'
        : error?.message,
    }, { status: safeStatus });
  }
});
