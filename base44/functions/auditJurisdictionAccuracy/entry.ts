import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { ensureConvergentRegulationAlertCreate } from '../../shared/regulationAlertPersistence.mjs';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { hasWorkflowInvocationCapability } from '../../shared/workflowInvocationCapability.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const isScheduledRun = await hasWorkflowInvocationCapability(body, 'auditJurisdictionAccuracy');

    if (!isScheduledRun) {
      const user = await base44.auth.me().catch(() => null);
      if (!user) {
        return Response.json({ error: 'Authentication required' }, { status: 401 });
      }
      if (user.role !== 'admin') {
        return Response.json({ error: 'Admin access required' }, { status: 403 });
      }
    }

    const { jurisdictionId, batchSize = 1, auditOptions = {} } = body;

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
      const all = await loadAllEntityRows({
        entity: base44.asServiceRole.entities.JurisdictionProfile,
        sort: 'created_date',
        label: 'Jurisdiction accuracy audit catalog',
      });
      jurisdictions = Array.isArray(all) ? all.slice(0, batchSize) : [];
    }

    if (!jurisdictions.length) {
      return Response.json({ success: true, flagged: 0, audited: 0, message: 'No jurisdictions to audit' });
    }

    let totalFlagged = 0;
    const RUN_START = Date.now();
    const MAX_RUN_MS = 50_000; // 50s budget, leave buffer before 60s timeout
    let auditedCount = 0;

    for (const jurisdiction of jurisdictions) {
      if (Date.now() - RUN_START > MAX_RUN_MS) {
        console.warn('Time budget exhausted, remaining jurisdictions will be audited next run');
        break;
      }
      try {
        const issuesFound = await Promise.race([
          auditSingleJurisdiction(base44, jurisdiction, options),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Single jurisdiction audit timed out')), 45_000))
        ]);
        totalFlagged += issuesFound;
      } catch (e) {
        console.error(`Skipping ${jurisdiction.name} due to timeout/error:`, e.message);
      }
      auditedCount++;
    }

    return Response.json({
      success: true,
      audited: auditedCount,
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

    // Fetch fresh data from the research agent, then compare against stored data
    const agentResult = await base44.asServiceRole.functions.invoke('jurisdictionResearchAgent', {
      jurisdictionName: jurisdiction.name,
      jurisdictionState: jurisdiction.state,
      jurisdictionType: jurisdiction.type,
      includeParentCounty: false
    });
    const freshData = agentResult?.data?.data || agentResult?.data || agentResult;

    // Use the accuracy audit agent to compare stored vs fresh data
    const auditConversation = await base44.asServiceRole.agents.createConversation({
      agent_name: 'jurisdictionAccuracyAudit'
    });

    const auditResponse = await base44.asServiceRole.agents.addMessage(auditConversation, {
      role: 'user',
      content: `Audit this jurisdiction.\n\nJurisdiction: ${jurisdiction.name}, ${jurisdiction.state} (${jurisdiction.type})\n\nSTORED data:\n${JSON.stringify(currentData, null, 2)}\n\nFRESH data (just researched from official sources):\n${JSON.stringify(freshData, null, 2)}\n\nChecks to perform:\n${checkSections.join('\n')}\n\nReturn findings as a JSON object with an 'issues_found' array.`
    });

    const lastMessage = auditResponse?.messages?.filter(m => m.role === 'assistant').pop();
    let issues = [];
    try {
      const parsed = typeof lastMessage?.content === 'string' ? JSON.parse(lastMessage.content) : lastMessage?.content;
      issues = parsed?.issues_found || [];
    } catch (e) {
      console.warn('Could not parse audit agent response:', e.message);
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const issue of issues) {
      // Preserve the existing 30-day unread suppression rule, but converge
      // simultaneous audit runs to one canonical alert instead of racing create().
      const alertData = {
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
      };

      const alertResult = await ensureConvergentRegulationAlertCreate({
        entity: base44.asServiceRole.entities.RegulationAlert,
        data: alertData,
        identityFields: ['jurisdiction_id', 'field_changed'],
        label: `Accuracy audit alert ${jurisdiction.name || jurisdiction.id} ${issue.field_changed || issue.title || 'issue'}`,
        readMatches: async () => {
          const existingAlerts = await base44.asServiceRole.entities.RegulationAlert.filter({
            jurisdiction_id: jurisdiction.id,
            is_read: false
          });
          return (existingAlerts || []).filter(a =>
            a.field_changed === issue.field_changed &&
            a.title?.includes('[Accuracy Audit]') &&
            new Date(a.detected_at) > thirtyDaysAgo
          );
        },
      });

      if (alertResult.status === 'created') issuesCreated++;
    }
  } catch (e) {
    console.error(`Audit error for ${jurisdiction.name}:`, e.message);
  }

  return issuesCreated;
}