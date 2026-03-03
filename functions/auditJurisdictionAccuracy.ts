import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { jurisdictionId, batchSize = 5, auditOptions = {} } = body;

    const options = {
      checkUrls: true,
      checkRequirements: true,
      checkContact: true,
      ...auditOptions
    };

    // Load jurisdictions
    let jurisdictions;
    if (jurisdictionId) {
      const j = await base44.asServiceRole.entities.JurisdictionProfile.get(jurisdictionId);
      jurisdictions = j ? [j] : [];
    } else {
      const all = await base44.asServiceRole.entities.JurisdictionProfile.list();
      jurisdictions = Array.isArray(all) ? all.slice(0, batchSize) : [];
    }

    if (!jurisdictions.length) {
      return Response.json({ success: true, flagged: 0, audited: 0, message: 'No jurisdictions to audit' });
    }

    let totalFlagged = 0;

    for (const jurisdiction of jurisdictions) {
      const issuesFound = await auditSingleJurisdiction(base44, jurisdiction, options);
      totalFlagged += issuesFound;
    }

    return Response.json({
      success: true,
      audited: jurisdictions.length,
      flagged: totalFlagged
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function auditSingleJurisdiction(base44, jurisdiction, options) {
  let issuesCreated = 0;

  try {
    const currentData = {
      website_url: jurisdiction.website_url,
      permitting_url: jurisdiction.permitting_url,
      permit_requirements: jurisdiction.permit_requirements,
      contact_info: jurisdiction.contact_info,
      ai_summary: jurisdiction.ai_summary,
      last_updated: jurisdiction.last_updated
    };

    const checkSections = [];
    if (options.checkUrls) checkSections.push('1. Are the website_url and permitting_url still valid and pointing to the correct government pages?');
    if (options.checkRequirements) checkSections.push('2. Do the permit requirements (max height, area, fees, processing time) match current official information from government websites?');
    if (options.checkContact) checkSections.push('3. Is the contact information (department, phone, email) still accurate?');

    const prompt = `You are a data accuracy auditor for sign permitting information. Your job is to cross-reference the stored data with current official government sources and identify inaccuracies or outdated information.

Jurisdiction: ${jurisdiction.name}, ${jurisdiction.state} (${jurisdiction.type})

Current stored data:
${JSON.stringify(currentData, null, 2)}

Please investigate the following using official government websites and sources:
${checkSections.join('\n')}

IMPORTANT RULES:
- Only flag genuine, verifiable inaccuracies you found from official sources
- Do NOT flag things that appear correct or cannot be verified
- Be specific about what the source says vs what we have stored
- If data looks reasonable and you cannot find contradicting info, report no issues for that field
- Focus on information that would affect a sign company's permit application

Return your findings.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          issues_found: {
            type: "array",
            items: {
              type: "object",
              properties: {
                alert_type: { type: "string" },
                severity: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
                field_changed: { type: "string" },
                previous_value: { type: "string" },
                new_value: { type: "string" },
                impact_summary: { type: "string" }
              }
            }
          }
        }
      }
    });

    const auditResult = typeof result === 'string' ? JSON.parse(result) : result;
    const issues = auditResult?.issues_found || [];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const issue of issues) {
      // Avoid duplicate alerts for same jurisdiction/issue within 30 days
      const existingAlerts = await base44.asServiceRole.entities.RegulationAlert.filter({
        jurisdiction_id: jurisdiction.id,
        is_read: false
      });

      const isDuplicate = existingAlerts.some(a =>
        a.field_changed === issue.field_changed &&
        a.title?.includes('[Accuracy Audit]') &&
        new Date(a.detected_at) > thirtyDaysAgo
      );

      if (!isDuplicate) {
        await base44.asServiceRole.entities.RegulationAlert.create({
          jurisdiction_id: jurisdiction.id,
          jurisdiction_name: jurisdiction.name,
          jurisdiction_state: jurisdiction.state,
          alert_type: ['requirement_change', 'url_change', 'contact_change', 'document_update'].includes(issue.alert_type)
            ? issue.alert_type
            : 'other',
          title: `[Accuracy Audit] ${issue.title}`,
          description: issue.description || '',
          field_changed: issue.field_changed || '',
          previous_value: issue.previous_value || '',
          new_value: issue.new_value || '',
          impact_summary: issue.impact_summary || '',
          severity: ['low', 'medium', 'high', 'critical'].includes(issue.severity) ? issue.severity : 'medium',
          detected_at: new Date().toISOString(),
          is_read: false,
          notification_sent: false
        });
        issuesCreated++;
      }
    }
  } catch (e) {
    console.error(`Audit error for ${jurisdiction.name}:`, e.message);
  }

  return issuesCreated;
}