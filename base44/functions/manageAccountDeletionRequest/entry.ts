import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function cleanText(value: unknown, maxLength = 200) {
  return String(value || '').trim().slice(0, maxLength);
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
  if (existing) {
    if (
      cleanText(existing.authorized_email_id, 200) !== actorId ||
      normalizeEmail(existing.user_email) !== actorEmail
    ) {
      throw Object.assign(new Error('Deletion request identity does not match the signed-in account.'), { status: 409 });
    }
  }

  return { actorId, actorEmail, creationKey, existing };
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

      const created = await Request.create({
        creation_key: creationKey,
        authorized_email_id: actorId,
        user_email: actorEmail,
        user_name: cleanText(actor?.full_name || actor?.name || actorEmail, 200),
        status: 'pending',
        requested_at: new Date().toISOString(),
      });

      return Response.json({
        success: true,
        request: publicRequest(created),
        reused: false,
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
