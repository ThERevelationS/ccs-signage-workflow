import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { processWorkflowTriggerEvent } from '../../shared/workflowTriggerEngine.ts';
import { constantTimeEqual } from '../../shared/constantTime.ts';

const PUBLIC_PERMIT_EVENTS = new Set(['permit_submitted', 'permit_received']);

function b64urlEncode(str: string) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
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

async function authenticateSignShopSession(base44: any, token: unknown) {
  const rawToken = String(token || '').trim();
  if (!rawToken) throw Object.assign(new Error('Authentication required'), { status: 401 });

  const parts = rawToken.split('.');
  if (parts.length !== 2) throw Object.assign(new Error('Authentication required'), { status: 401 });

  const secret = Deno.env.get('SESSION_SIGNING_SECRET');
  if (!secret) throw Object.assign(new Error('Session authentication is unavailable'), { status: 503 });

  const [payloadStr, providedSig] = parts;
  const expectedSig = await hmacSign(payloadStr, secret);
  if (!constantTimeEqual(expectedSig, providedSig)) throw Object.assign(new Error('Authentication required'), { status: 401 });

  let sessionPayload: any;
  try {
    sessionPayload = JSON.parse(b64urlDecode(payloadStr));
  } catch {
    throw Object.assign(new Error('Authentication required'), { status: 401 });
  }

  const email = String(sessionPayload?.email || '').trim();
  const issuedAt = Number(sessionPayload?.iat);
  const expiresAt = Number(sessionPayload?.exp);
  if (
    !email ||
    !Number.isFinite(issuedAt) || issuedAt <= 0 ||
    !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt <= issuedAt
  ) {
    throw Object.assign(new Error('Authentication required'), { status: 401 });
  }

  const users = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email });
  if (!Array.isArray(users)) {
    throw Object.assign(new Error('Authenticated user identity could not be verified'), { status: 503 });
  }
  if (users.length === 0) throw Object.assign(new Error('Authentication required'), { status: 401 });
  if (users.length !== 1) {
    throw Object.assign(new Error('Authenticated user identity is ambiguous'), { status: 409 });
  }
  const user = users[0];
  const notBefore = Date.parse(String(user?.session_not_before || ''));
  if (Number.isFinite(notBefore) && notBefore > 0 && (!Number.isFinite(issuedAt) || issuedAt < notBefore)) {
    throw Object.assign(new Error('Authentication required'), { status: 401 });
  }
  return user;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, payload?.session_token);

    const eventType = String(payload?.event_type || '').trim();
    if (!PUBLIC_PERMIT_EVENTS.has(eventType)) {
      throw Object.assign(new Error('This public endpoint only accepts verified permit events'), { status: 400 });
    }

    const permitLineItemId = String(payload?.permit_line_item_id || '').trim();
    if (!permitLineItemId) {
      throw Object.assign(new Error('Missing permit_line_item_id'), { status: 400 });
    }

    const permitLine = await base44.asServiceRole.entities.PermitLineItem.get(permitLineItemId).catch(() => null);
    if (!permitLine?.id) throw Object.assign(new Error('Permit line item not found'), { status: 404 });

    const workOrderId = String(permitLine.work_order_id || '').trim();
    if (!workOrderId) throw Object.assign(new Error('Permit line item is not linked to a Work Order'), { status: 409 });

    if (eventType === 'permit_submitted' && !permitLine.submitted_date) {
      throw Object.assign(new Error('Permit submitted event is not durable on the Permit line item'), { status: 409 });
    }
    if (eventType === 'permit_received' && !permitLine.permit_received_date) {
      throw Object.assign(new Error('Permit received event is not durable on the Permit line item'), { status: 409 });
    }

    const result = await processWorkflowTriggerEvent({
      base44,
      payload: {
        event_type: eventType,
        work_order: {
          id: workOrderId,
          locality_name: permitLine.locality_name,
          office_type: permitLine.office_type,
          row_name: permitLine.row_name,
          submitted_date: permitLine.submitted_date,
          next_followup_date: permitLine.next_followup_date,
          permit_received_date: permitLine.permit_received_date,
        },
        old_data: {},
      },
      changedByOverride: user.full_name || user.email || 'Authenticated User',
    });
    return Response.json(result);
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 404, 409, 503].includes(status) ? status : 500;
    console.error('Error processing workflow triggers:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Workflow automation could not be processed safely' : error.message,
    }, { status: safeStatus });
  }
});
