import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { verifyAdminSettingsCapability } from '../../shared/adminSettingsCapability.ts';
import { createWorkflowScheduleManager } from '../../shared/workflowScheduleManager.ts';

const APP_ID = Deno.env.get('BASE44_APP_ID') || '68dfcc5e57bbbc35387da97c';

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));
    const actor = await verifyAdminSettingsCapability(base44, body?.admin_capability);

    const manager = createWorkflowScheduleManager({
      fetchImpl: fetch,
      token: Deno.env.get('BASE44_WORKFLOWS_TOKEN') || '',
      appId: APP_ID,
      historyEntity: base44.asServiceRole.entities.WorkflowScheduleChange,
    });

    const action = String(body?.action || '').trim();
    if (action === 'list') return Response.json({ success: true, rows: await manager.list() });
    if (action === 'runs') return Response.json({ success: true, runs: await manager.runs(body) });
    if (action === 'update_schedule') return Response.json({ success: true, ...(await manager.updateSchedule(body, actor)) });
    if (action === 'set_status') return Response.json({ success: true, ...(await manager.setStatus(body, actor)) });
    if (action === 'adopt_external') return Response.json({ success: true, ...(await manager.adoptExternal(body, actor)) });
    if (action === 'history') return Response.json({ success: true, rows: await manager.history(body) });

    return Response.json({ success: false, error: 'Invalid workflow schedule action.' }, { status: 400 });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409, 502, 503].includes(status) ? status : 500;
    console.error('manageWorkflowSchedules error:', error?.code || '', error?.message || error);
    return Response.json({
      success: false,
      error: safeStatus === 500 ? 'The scheduled job request could not be completed safely.' : error?.message,
      code: error?.code || null,
    }, { status: safeStatus });
  }
});
