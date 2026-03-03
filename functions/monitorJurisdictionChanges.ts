import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Load notification settings (email list)
    let notificationEmails = [user.email];
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
    const jurisdictions = await base44.entities.JurisdictionProfile.list("-updated_date");
    if (!Array.isArray(jurisdictions)) {
      return Response.json({ alerts: [], message: 'No jurisdictions found' });
    }

    const alerts = [];

    for (const jurisdiction of jurisdictions) {
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
          agent_name: 'jurisdictionChangeMonitor'
        });

        const monitorResponse = await base44.asServiceRole.agents.addMessage(monitorConversation, {
          role: 'user',
          content: `Monitor this jurisdiction for changes.\n\nJurisdiction: ${jurisdiction.name}, ${jurisdiction.state} (${jurisdiction.type})\n\nSTORED data:\n- Website: ${jurisdiction.website_url || 'unknown'}\n- Permitting URL: ${jurisdiction.permitting_url || 'unknown'}\n- Max Height: ${jurisdiction.permit_requirements?.max_height_ft || 'unknown'} ft\n- Max Area: ${jurisdiction.permit_requirements?.max_sign_area_sqft || 'unknown'} sq ft\n- Fee Range: ${jurisdiction.permit_requirements?.fee_range || 'unknown'}\n- Processing Time: ${jurisdiction.permit_requirements?.processing_time || 'unknown'}\n- Illumination: ${jurisdiction.permit_requirements?.illumination_allowed ?? 'unknown'}\n- Electronic Signs: ${jurisdiction.permit_requirements?.electronic_signs_allowed ?? 'unknown'}\n- Last Updated: ${jurisdiction.last_updated || 'unknown'}\n\nFRESH data (just researched):\n${JSON.stringify(freshData, null, 2)}\n\nReturn JSON with changes_detected, alerts array, severity, and updated_profile.`
        });

        const lastMsg = monitorResponse?.messages?.filter(m => m.role === 'assistant').pop();
        let data = { changes_detected: false, alerts: [], severity: 'low', updated_profile: {} };
        try {
          const parsed = typeof lastMsg?.content === 'string' ? JSON.parse(lastMsg.content) : lastMsg?.content;
          if (parsed) data = parsed;
        } catch (e) {
          console.warn('Could not parse monitor agent response:', e.message);
        }

        if (data.changes_detected && data.alerts && Array.isArray(data.alerts)) {
          // Apply profile updates if any
          if (data.updated_profile) {
            const profileUpdate = {};
            const up = data.updated_profile;

            if (up.website_url && !jurisdiction._manual_website_url) profileUpdate.website_url = up.website_url;
            if (up.permitting_url && !jurisdiction._manual_permitting_url) profileUpdate.permitting_url = up.permitting_url;

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
                await base44.asServiceRole.entities.JurisdictionProfile.update(jurisdiction.id, profileUpdate);
              } catch (updateErr) {
                console.warn(`Failed to update profile for ${jurisdiction.name}:`, updateErr.message);
              }
            }
          }

          for (const change of data.alerts) {
            try {
              const existingAlerts = await base44.asServiceRole.entities.RegulationAlert.filter({
                jurisdiction_id: jurisdiction.id,
                field_changed: change.field,
                alert_type: change.type
              });

              const recentAlert = existingAlerts?.find(a => {
                const daysOld = (Date.now() - new Date(a.created_date).getTime()) / (1000 * 60 * 60 * 24);
                return daysOld < 7;
              });

              if (!recentAlert) {
                const alert = await base44.asServiceRole.entities.RegulationAlert.create({
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
                });

                alerts.push(alert);

                // Send email to all configured recipients
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

                await base44.asServiceRole.entities.RegulationAlert.update(alert.id, {
                  notification_sent: true,
                  notification_sent_at: new Date().toISOString(),
                  notification_method: 'email'
                });
              }
            } catch (alertError) {
              console.error(`Failed to create alert for ${jurisdiction.name}:`, alertError.message);
            }
          }
        }
      } catch (jurisdictionError) {
        console.error(`Error monitoring jurisdiction ${jurisdiction.id}:`, jurisdictionError.message);
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return Response.json({
      success: true,
      alerts_created: alerts.length,
      alerts: alerts
    });
  } catch (error) {
    console.error("Monitor error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});