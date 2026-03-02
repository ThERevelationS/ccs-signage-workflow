import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Get all jurisdictions
    const jurisdictions = await base44.entities.JurisdictionProfile.list("-updated_date");
    if (!Array.isArray(jurisdictions)) {
      return Response.json({ alerts: [], message: 'No jurisdictions found' });
    }

    const alerts = [];

    // Monitor each jurisdiction for changes
    for (const jurisdiction of jurisdictions) {
      try {
        // AI research to check for latest changes
        const researchPrompt = `You are a permitting regulation monitor for a sign company.

Check if there have been ANY RECENT CHANGES to sign permit regulations for:
Jurisdiction: ${jurisdiction.name}, ${jurisdiction.state} (${jurisdiction.type})

Current known data:
- Website: ${jurisdiction.website_url || 'unknown'}
- Permitting URL: ${jurisdiction.permitting_url || 'unknown'}
- Max Height: ${jurisdiction.permit_requirements?.max_height_ft || 'unknown'} ft
- Max Area: ${jurisdiction.permit_requirements?.max_sign_area_sqft || 'unknown'} sq ft
- Fee Range: ${jurisdiction.permit_requirements?.fee_range || 'unknown'}
- Processing Time: ${jurisdiction.permit_requirements?.processing_time || 'unknown'}
- Illumination Allowed: ${jurisdiction.permit_requirements?.illumination_allowed !== undefined ? jurisdiction.permit_requirements.illumination_allowed : 'unknown'}
- Electronic Signs: ${jurisdiction.permit_requirements?.electronic_signs_allowed !== undefined ? jurisdiction.permit_requirements.electronic_signs_allowed : 'unknown'}
- Last Updated: ${jurisdiction.last_updated || 'unknown'}

Return JSON with any changes detected:
{
  "changes_detected": true/false,
  "alerts": [
    {
      "type": "requirement_change|document_update|url_change|contact_change|other",
      "title": "brief title",
      "field": "field_name",
      "previous": "old value",
      "current": "new value",
      "impact": "summary of impact to sign companies"
    }
  ],
  "severity": "low|medium|high|critical",
  "summary": "overall summary of changes"
}`;

        const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: researchPrompt,
          add_context_from_internet: true,
          response_json_schema: {
            type: "object",
            properties: {
              changes_detected: { type: "boolean" },
              alerts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    title: { type: "string" },
                    field: { type: "string" },
                    previous: { type: "string" },
                    current: { type: "string" },
                    impact: { type: "string" }
                  }
                }
              },
              severity: { type: "string" },
              summary: { type: "string" }
            }
          }
        });

        const data = typeof result === 'string' ? JSON.parse(result) : result;

        if (data.changes_detected && data.alerts && Array.isArray(data.alerts)) {
          for (const change of data.alerts) {
            try {
              // Check if alert already exists for this change
              const existingAlerts = await base44.asServiceRole.entities.RegulationAlert.filter({
                jurisdiction_id: jurisdiction.id,
                field_changed: change.field,
                alert_type: change.type
              });

              // Only create if this exact change hasn't been reported in last 7 days
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

                // Send email notification
                try {
                  await base44.asServiceRole.integrations.Core.SendEmail({
                    to: user.email,
                    subject: `[${data.severity?.toUpperCase() || 'UPDATE'}] Regulation Change in ${jurisdiction.name}, ${jurisdiction.state}`,
                    body: `A significant change has been detected in permitting regulations:\n\nJurisdiction: ${jurisdiction.name}, ${jurisdiction.state}\n\nChange: ${change.title}\n\nPrevious: ${change.previous}\nNew: ${change.current}\n\nImpact: ${change.impact}\n\nPlease review the Permitting Repository for full details.`
                  });

                  // Mark notification as sent
                  await base44.asServiceRole.entities.RegulationAlert.update(alert.id, {
                    notification_sent: true,
                    notification_sent_at: new Date().toISOString(),
                    notification_method: 'email'
                  });
                } catch (emailError) {
                  console.warn(`Failed to send email for alert ${alert.id}:`, emailError.message);
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

      // Small delay to avoid rate limiting
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