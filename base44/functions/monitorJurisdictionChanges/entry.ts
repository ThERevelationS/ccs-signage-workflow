import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { jurisdictionProtectionGuards, replaceJurisdictionFieldsIfUnchanged } from '../../shared/jurisdictionPersistence.mjs';
import { claimRegulationAlertNotification, ensureConvergentRegulationAlertCreate } from '../../shared/regulationAlertPersistence.mjs';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { hasWorkflowInvocationCapability } from '../../shared/workflowInvocationCapability.ts';
import { constantTimeEqual } from '../../shared/constantTime.ts';
import { processWorkflowTriggerEvent } from '../../shared/workflowTriggerEngine.ts';
import { gateResearchSourceUrls } from '../../shared/permittingResearchUrlTrust.mjs';

// Fire-and-forget automation emit — a failure must never break the monitor
// scan, so this swallows and logs like the other emit helpers.
async function emitRecordAutomation(base44: any, eventType: string, recordId: string, actor: string) {
  try {
    await processWorkflowTriggerEvent({
      base44,
      payload: { event_type: eventType, record: { id: recordId } },
      changedByOverride: actor,
    });
  } catch (error: any) {
    console.error(`Automation emit failed for ${eventType}:`, error?.message || error);
  }
}

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
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return b64urlEncode(String.fromCharCode(...new Uint8Array(sig)));
}

async function authenticateAdminSession(base44: any, token: unknown) {
  const rawToken = String(token || '').trim();
  if (!rawToken) throw Object.assign(new Error('Authentication required'), { status: 401 });
  const parts = rawToken.split('.');
  if (parts.length !== 2) throw Object.assign(new Error('Authentication required'), { status: 401 });
  const secret = Deno.env.get('SESSION_SIGNING_SECRET');
  if (!secret) throw Object.assign(new Error('Session authentication is unavailable'), { status: 503 });
  const [payloadStr, providedSig] = parts;
  const expectedSig = await hmacSign(payloadStr, secret);
  if (!constantTimeEqual(expectedSig, providedSig)) throw Object.assign(new Error('Authentication required'), { status: 401 });
  let payload: any;
  try { payload = JSON.parse(b64urlDecode(payloadStr)); } catch { throw Object.assign(new Error('Authentication required'), { status: 401 }); }
  const email = String(payload?.email || '').trim().toLowerCase();
  const issuedAt = Number(payload?.iat);
  const expiresAt = Number(payload?.exp);
  if (
    !email ||
    !Number.isFinite(issuedAt) || issuedAt <= 0 ||
    !Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt <= issuedAt
  ) throw Object.assign(new Error('Authentication required'), { status: 401 });
  const users = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email });
  if (!Array.isArray(users)) throw Object.assign(new Error('Authenticated user identity could not be verified'), { status: 503 });
  if (users.length === 0) throw Object.assign(new Error('Authentication required'), { status: 401 });
  if (users.length !== 1) throw Object.assign(new Error('Authenticated user identity is ambiguous'), { status: 409 });
  const user = users[0];
  const notBefore = Date.parse(String(user?.session_not_before || ''));
  if (Number.isFinite(notBefore) && notBefore > 0 && (!Number.isFinite(issuedAt) || issuedAt < notBefore)) {
    throw Object.assign(new Error('Authentication required'), { status: 401 });
  }
  if (user.role !== 'admin') throw Object.assign(new Error('Forbidden: Admin access required'), { status: 403 });
  return user;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const isScheduledRun = await hasWorkflowInvocationCapability(body, 'monitorJurisdictionChanges');
    const user = isScheduledRun ? null : await authenticateAdminSession(base44, body?.session_token);

    // Load notification settings (email list). Scheduled runs rely on configured recipients.
    let notificationEmails = user?.email ? [user.email] : [];
    try {
      const settingsArr = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: 'jurisdiction_monitoring' });
      if (settingsArr?.length > 0) {
        const saved = settingsArr[0].setting_value || {};
        if (Array.isArray(saved.notification_emails) && saved.notification_emails.length > 0) {
          notificationEmails = saved.notification_emails;
        }
      }
    } catch (e) {
      console.warn("Could not load monitoring settings:", e.message);
    }

    // Get all jurisdictions
    const jurisdictions = await loadAllEntityRows({
      entity: base44.entities.JurisdictionProfile,
      sort: '-updated_date',
      label: 'Jurisdiction monitoring catalog',
    });
    if (!Array.isArray(jurisdictions)) {
      return Response.json({ alerts: [], message: 'No jurisdictions found' });
    }

    // Each jurisdiction costs two agent calls; the whole catalog cannot fit in
    // one worker invocation. Process a bounded batch per run and rotate a
    // persisted cursor so successive runs cover the full catalog.
    const MAX_PER_RUN = 15;
    let cursor = 0;
    try {
      const cursorRows = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: 'jurisdiction_monitor_cursor' });
      cursor = Math.max(0, Number(cursorRows?.[0]?.setting_value?.offset) || 0);
    } catch { /* start from the top */ }
    if (cursor >= jurisdictions.length) cursor = 0;
    const batch = jurisdictions.slice(cursor, cursor + MAX_PER_RUN);

    const alerts = [];

    for (const jurisdiction of batch) {
      try {
        // Use the research agent to get fresh data, then compare against stored data
        const agentResult = await base44.asServiceRole.functions.invoke('jurisdictionResearchAgent', {
          jurisdictionName: jurisdiction.name,
          jurisdictionState: jurisdiction.state,
          jurisdictionType: jurisdiction.type,
          includeParentCounty: false
        });
        const freshData = agentResult?.data?.data || agentResult?.data || agentResult;

        // Use the change monitor agent to compare stored vs fresh data
        const monitorConversation = await base44.asServiceRole.agents.createConversation({
          agent_name: 'jurisdiction_change_monitor'
        });

        const monitorResponse = await base44.asServiceRole.agents.addMessage(monitorConversation, {
          role: 'user',
          content: `Monitor this jurisdiction for changes.\n\nJurisdiction: ${jurisdiction.name}, ${jurisdiction.state} (${jurisdiction.type})\n\nSTORED data:\n- Website: ${jurisdiction.website_url || 'unknown'}\n- Permitting URL: ${jurisdiction.permitting_url || 'unknown'}\n- Max Height: ${jurisdiction.permit_requirements?.max_height_ft || 'unknown'} ft\n- Max Area: ${jurisdiction.permit_requirements?.max_sign_area_sqft || 'unknown'} sq ft\n- Fee Range: ${jurisdiction.permit_requirements?.fee_range || 'unknown'}\n- Processing Time: ${jurisdiction.permit_requirements?.processing_time || 'unknown'}\n- Illumination: ${jurisdiction.permit_requirements?.illumination_allowed ?? 'unknown'}\n- Electronic Signs: ${jurisdiction.permit_requirements?.electronic_signs_allowed ?? 'unknown'}\n- Last Updated: ${jurisdiction.last_updated || 'unknown'}\n\nFRESH data (just researched):\n${JSON.stringify(freshData, null, 2)}\n\nReturn JSON with changes_detected, alerts array, severity, and updated_profile.`
        });

        const lastMsg = monitorResponse?.messages?.filter(m => m.role === 'assistant')?.pop();
        let data = { changes_detected: false, alerts: [], severity: 'low', updated_profile: {} };
        try {
          const parsed = typeof lastMsg?.content === 'string' ? JSON.parse(lastMsg.content) : lastMsg?.content;
          if (parsed) data = parsed;
        } catch (e) {
          console.warn('Could not parse monitor agent response:', e.message);
        }

        // Ensure alerts is always an array
        if (!Array.isArray(data.alerts)) data.alerts = [];

        if (data.changes_detected && data.alerts.length > 0) {
          // Apply profile updates if any
          if (data.updated_profile) {
            const profileUpdate = {};
            const up = data.updated_profile;
            const { research: urls, review: sourceUrlReview } = gateResearchSourceUrls(jurisdiction, { website_url: up.website_url, permitting_url: up.permitting_url });
            if (sourceUrlReview.length) console.warn(`Held ${sourceUrlReview.length} monitor URL change(s) for review on ${jurisdiction.name}: ${sourceUrlReview.map(r => r.reason).join(', ')}`);

            if (urls.website_url && !jurisdiction._manual_website_url) profileUpdate.website_url = urls.website_url;
            if (urls.permitting_url && !jurisdiction._manual_permitting_url) profileUpdate.permitting_url = urls.permitting_url;

            if (up.permit_requirements && !jurisdiction._manual_requirements) {
              const existing = jurisdiction.permit_requirements || {};
              const merged = { ...existing };
              for (const [k, v] of Object.entries(up.permit_requirements)) {
                if (v !== null && v !== undefined) merged[k] = v;
              }
              profileUpdate.permit_requirements = merged;
            }

            if (Object.keys(profileUpdate).length > 0) {
              profileUpdate.last_updated = new Date().toISOString();
              try {
                await replaceJurisdictionFieldsIfUnchanged({
                  entity: base44.asServiceRole.entities.JurisdictionProfile,
                  jurisdiction,
                  nextFields: profileUpdate,
                  guardFields: jurisdictionProtectionGuards(jurisdiction, profileUpdate, { respectManualProtection: true }),
                  label: `Jurisdiction change monitor ${jurisdiction.name || jurisdiction.id}`,
                });
                await emitRecordAutomation(base44, 'jurisdiction_profile_updated', jurisdiction.id, 'system');
              } catch (updateErr) {
                console.warn(`Failed to update profile for ${jurisdiction.name}:`, updateErr.message);
              }
            }
          }

          for (const change of data.alerts) {
            try {
              const alertData = {
                jurisdiction_id: jurisdiction.id,
                jurisdiction_name: jurisdiction.name,
                jurisdiction_state: jurisdiction.state,
                alert_type: change.type,
                title: change.title,
                description: `Change detected in ${change.field}: "${change.previous}" → "${change.current}"`,
                previous_value: change.previous,
                new_value: change.current,
                impact_summary: change.impact,
                field_changed: change.field,
                severity: data.severity || 'medium',
                detected_at: new Date().toISOString(),
                notification_sent: false
              };

              const alertResult = await ensureConvergentRegulationAlertCreate({
                entity: base44.asServiceRole.entities.RegulationAlert,
                data: alertData,
                label: `Regulation alert ${jurisdiction.name || jurisdiction.id} ${change.field || change.type || 'change'}`,
                readMatches: async () => {
                  const existingAlerts = await base44.asServiceRole.entities.RegulationAlert.filter({
                    jurisdiction_id: jurisdiction.id,
                    field_changed: change.field,
                    alert_type: change.type
                  });
                  return (existingAlerts || []).filter(a => {
                    const daysOld = (Date.now() - new Date(a.created_date).getTime()) / (1000 * 60 * 60 * 24);
                    return daysOld < 7;
                  });
                },
              });

              if (alertResult.status === 'created') {
                await emitRecordAutomation(base44, 'regulation_alert_created', alertResult.record.id, 'system');
                const claim = await claimRegulationAlertNotification({
                  entity: base44.asServiceRole.entities.RegulationAlert,
                  alert: alertResult.record,
                  method: 'email',
                  label: `Regulation alert email ${jurisdiction.name || jurisdiction.id}`,
                });

                if (claim.claimed) {
                  alerts.push(claim.record);

                  // The notification flag is claimed atomically before network delivery so
                  // overlapping monitor runs cannot send the same alert twice. As with the
                  // previous implementation, individual recipient failures are logged and
                  // do not cause automatic resend attempts that could duplicate emails.
                  const emailBody = `A significant change has been detected in permitting regulations:\n\nJurisdiction: ${jurisdiction.name}, ${jurisdiction.state}\n\nChange: ${change.title}\n\nPrevious: ${change.previous}\nNew: ${change.current}\n\nImpact: ${change.impact}\n\nNote: The jurisdiction profile has been automatically updated with verified changes.\n\nPlease review the Permitting Repository for full details.`;

                  for (const email of notificationEmails) {
                    try {
                      await base44.asServiceRole.integrations.Core.SendEmail({
                        to: email,
                        subject: `[${data.severity?.toUpperCase() || 'UPDATE'}] Regulation Change in ${jurisdiction.name}, ${jurisdiction.state}`,
                        body: emailBody
                      });
                    } catch (emailError) {
                      console.warn(`Failed to send email to ${email}:`, emailError.message);
                    }
                  }
                }
              }
            } catch (alertError) {
              console.error(`Failed to create alert for ${jurisdiction.name}:`, alertError.message);
            }
          }
        }
      } catch (jurisdictionError) {
        console.error(`Error monitoring jurisdiction ${jurisdiction.id}:`, jurisdictionError.message);
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const nextOffset = (cursor + batch.length) % Math.max(1, jurisdictions.length);
    try {
      const existing = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: 'jurisdiction_monitor_cursor' });
      const value = { offset: nextOffset, updated_at: new Date().toISOString() };
      if (existing?.length) {
        await base44.asServiceRole.entities.GlobalSettings.update(existing[0].id, { setting_value: value });
      } else {
        await base44.asServiceRole.entities.GlobalSettings.create({ setting_key: 'jurisdiction_monitor_cursor', setting_value: value });
      }
    } catch (cursorErr) {
      console.warn('Could not persist monitor cursor:', cursorErr?.message || cursorErr);
    }

    return Response.json({
      success: true,
      alerts_created: alerts.length,
      alerts: alerts,
      jurisdictions_checked: batch.length,
      jurisdictions_total: jurisdictions.length,
      next_offset: nextOffset,
    });
  } catch (error) {
    console.error('monitorJurisdictionChanges error:', error?.message || error);
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 409, 503].includes(status) ? status : 500;
    return Response.json({
      error: safeStatus === 500 ? 'Jurisdiction monitoring could not be completed safely' : error.message,
    }, { status: safeStatus });
  }
});