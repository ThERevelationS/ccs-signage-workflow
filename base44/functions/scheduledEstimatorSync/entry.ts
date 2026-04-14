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

const getEstimatorAppUrl = (projectId) => {
  return `https://app.base44.com/apps/${ESTIMATOR_APP_ID}/FoundationProject?id=${projectId}`;
};

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const estimator = getEstimatorClient();
    const allProjects = await estimator.entities.FoundationProject.list();
    
    const existingSynced = await base44.asServiceRole.entities.EstimatorProject.list();
    const existingBySourceId = {};
    for (const ep of existingSynced) {
      existingBySourceId[ep.source_id] = ep;
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const raw of allProjects) {
      const existing = existingBySourceId[raw.id];
      
      // Skip if already synced and not updated since last sync
      if (existing && existing.source_updated_date === raw.updated_date) {
        skipped++;
        continue;
      }

      const projectData = extractProjectData(raw);

      if (existing) {
        if (existing.work_order_id) {
          projectData.work_order_id = existing.work_order_id;
        }
        await base44.asServiceRole.entities.EstimatorProject.update(existing.id, projectData);
        updated++;
      } else {
        // Try auto-match
        if (projectData.client_name) {
          const workOrders = await base44.asServiceRole.entities.WorkOrder.filter({ 
            client_name: projectData.client_name,
            deleted: { $ne: true }
          });
          if (workOrders.length > 0) {
            projectData.work_order_id = workOrders[0].id;
          }
        }
        await base44.asServiceRole.entities.EstimatorProject.create(projectData);
        created++;
      }
    }

    console.log(`Estimator sync complete: ${created} created, ${updated} updated, ${skipped} skipped out of ${allProjects.length} total`);
    return Response.json({ status: 'complete', total: allProjects.length, created, updated, skipped });
  } catch (error) {
    console.error('scheduledEstimatorSync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});