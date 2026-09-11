import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { processWorkflowTriggerEvent } from '../../shared/workflowTriggerEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const result = await processWorkflowTriggerEvent({
      base44,
      payload,
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
