import { createClientFromRequest, createClient } from 'npm:@base44/sdk@0.8.25';

const ESTIMATOR_APP_ID = "68a5a85045cf8570330146ef";

const getEstimatorClient = () => {
  return createClient({
    appId: ESTIMATOR_APP_ID,
    headers: {
      "api_key": Deno.env.get("ESTIMATOR_APP_API_KEY")
    }
  });
};

// Build estimator app URL for a project
const getEstimatorAppUrl = (projectId) => {
  return `https://app.base44.com/apps/${ESTIMATOR_APP_ID}/FoundationProject?id=${projectId}`;
};

// Extract the relevant fields from a raw estimator project
const extractProjectData = (raw) => {
  return {
    source_id: raw.id,
    client_name: raw.client_name || '',
    project_name: raw.project_name || '',
    estimate_number: raw.estimate_number || '',
    hyperlink: raw.hyperlink || '',
    notes: raw.notes || '',
    excavation_method: raw.excavation_method || '',
    total_labor_cost: raw.total_labor_cost || 0,
    total_concrete_cost: raw.total_concrete_cost || 0,
    total_rebar_cost: raw.total_rebar_cost || 0,
    total_pole_cost: raw.total_pole_cost || null,
    total_brick_cost: raw.total_brick_cost || null,
    total_wall_cost: raw.total_wall_cost || null,
    total_forming_materials_cost: raw.total_forming_materials_cost || null,
    total_pole_painting_cost: raw.total_pole_painting_cost || null,
    concrete_cost_per_cy: raw.concrete_cost_per_cy || 0,
    rebar_cost_per_ft: raw.rebar_cost_per_ft || 0,
    hand_dig_excavation_cost_per_cy: raw.hand_dig_excavation_cost_per_cy || 0,
    equipment_excavation_labor_rate: raw.equipment_excavation_labor_rate || 0,
    forming_materials_cost_spread_foot: raw.forming_materials_cost_spread_foot || 0,
    forming_materials_cost_pillar: raw.forming_materials_cost_pillar || 0,
    walls: raw.walls || [],
    selected_equipment: raw.selected_equipment || [],
    selected_concrete_id: raw.selected_concrete_id || '',
    estimator_app_url: getEstimatorAppUrl(raw.id),
    source_created_date: raw.created_date || null,
    source_updated_date: raw.updated_date || null,
    last_synced: new Date().toISOString(),
    raw_data: raw
  };
};

// Try to auto-match to a work order by client_name
const findMatchingWorkOrder = async (base44, clientName) => {
  if (!clientName) return null;
  const workOrders = await base44.asServiceRole.entities.WorkOrder.filter({ 
    client_name: clientName, 
    deleted: { $ne: true } 
  });
  return workOrders.length > 0 ? workOrders[0] : null;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { action, project_id, source_project } = body;

    // Verify user is authenticated for all actions
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Action: Webhook-style sync of a single project from the estimator app
    if (action === 'syncProject' && source_project) {

      const projectData = extractProjectData(source_project);

      // Check if we already have this project
      const existing = await base44.asServiceRole.entities.EstimatorProject.filter({ source_id: projectData.source_id });

      if (existing.length > 0) {
        // Update existing
        await base44.asServiceRole.entities.EstimatorProject.update(existing[0].id, projectData);
        return Response.json({ 
          status: 'updated', 
          estimator_project_id: existing[0].id,
          client_name: projectData.client_name 
        });
      } else {
        // Create new — try to auto-match to work order
        const matchedWO = await findMatchingWorkOrder(base44, projectData.client_name);
        if (matchedWO) {
          projectData.work_order_id = matchedWO.id;
        }
        const created = await base44.asServiceRole.entities.EstimatorProject.create(projectData);
        return Response.json({ 
          status: 'created', 
          estimator_project_id: created.id,
          work_order_id: matchedWO?.id || null,
          client_name: projectData.client_name 
        });
      }
    }

    // Action: Fetch ALL projects from estimator and sync them
    if (action === 'syncAll') {
      const estimator = getEstimatorClient();
      const allProjects = await estimator.entities.FoundationProject.list();
      
      // Get existing synced projects
      const existingSynced = await base44.asServiceRole.entities.EstimatorProject.list();
      const existingBySourceId = {};
      for (const ep of existingSynced) {
        existingBySourceId[ep.source_id] = ep;
      }

      let created = 0;
      let updated = 0;
      let errors = 0;

      for (const raw of allProjects) {
        try {
          const projectData = extractProjectData(raw);
          const existing = existingBySourceId[raw.id];

          if (existing) {
            // Preserve existing work_order_id if set
            if (existing.work_order_id) {
              projectData.work_order_id = existing.work_order_id;
            }
            await base44.asServiceRole.entities.EstimatorProject.update(existing.id, projectData);
            updated++;
          } else {
            const matchedWO = await findMatchingWorkOrder(base44, projectData.client_name);
            if (matchedWO) {
              projectData.work_order_id = matchedWO.id;
            }
            await base44.asServiceRole.entities.EstimatorProject.create(projectData);
            created++;
          }
        } catch (e) {
          console.error(`Error syncing project ${raw.id}:`, e.message);
          errors++;
        }
      }

      return Response.json({ 
        status: 'complete', 
        total: allProjects.length, 
        created, 
        updated, 
        errors 
      });
    }

    // Action: Link a specific estimator project to a work order
    if (action === 'linkToWorkOrder') {
      const { estimator_project_id, work_order_id } = body;
      if (!estimator_project_id || !work_order_id) {
        return Response.json({ error: 'Missing estimator_project_id or work_order_id' }, { status: 400 });
      }

      await base44.asServiceRole.entities.EstimatorProject.update(estimator_project_id, { work_order_id });
      return Response.json({ status: 'linked' });
    }

    // Action: Unlink
    if (action === 'unlinkFromWorkOrder') {
      const { estimator_project_id } = body;
      if (!estimator_project_id) {
        return Response.json({ error: 'Missing estimator_project_id' }, { status: 400 });
      }

      await base44.asServiceRole.entities.EstimatorProject.update(estimator_project_id, { work_order_id: '' });
      return Response.json({ status: 'unlinked' });
    }

    // Action: Get projects for a specific work order
    if (action === 'getForWorkOrder') {
      const { work_order_id } = body;
      if (!work_order_id) {
        return Response.json({ error: 'Missing work_order_id' }, { status: 400 });
      }

      const linked = await base44.asServiceRole.entities.EstimatorProject.filter({ work_order_id });
      return Response.json({ projects: linked });
    }

    // Action: Get unlinked projects (for matching UI)
    if (action === 'getUnlinked') {
      const all = await base44.asServiceRole.entities.EstimatorProject.list();
      const unlinked = all.filter(p => !p.work_order_id);
      return Response.json({ projects: unlinked });
    }

    return Response.json({ error: 'Invalid action. Use: syncProject, syncAll, linkToWorkOrder, unlinkFromWorkOrder, getForWorkOrder, getUnlinked' }, { status: 400 });
  } catch (error) {
    console.error('syncEstimatorProject error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});