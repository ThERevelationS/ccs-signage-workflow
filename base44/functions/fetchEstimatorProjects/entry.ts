import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createClient } from 'npm:@base44/sdk@0.8.25';

const getEstimatorClient = () => {
  return createClient({
    appId: "68a5a85045cf8570330146ef",
    headers: {
      "api_key": Deno.env.get("ESTIMATOR_APP_API_KEY")
    }
  });
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    const estimator = getEstimatorClient();

    if (action === 'listFoundationProjects') {
      const projects = await estimator.entities.FoundationProject.list();
      return Response.json({ projects });
    }

    if (action === 'listClients') {
      const clients = await estimator.entities.Client.list();
      return Response.json({ clients });
    }

    if (action === 'getProjectFields') {
      // Get a single project and return just its field names and types for inspection
      const projects = await estimator.entities.FoundationProject.list('-created_date', 1);
      if (projects.length > 0) {
        const p = projects[0];
        const fields = {};
        for (const [key, val] of Object.entries(p)) {
          fields[key] = { type: typeof val, sample: Array.isArray(val) ? `array[${val.length}]` : (typeof val === 'object' && val !== null ? 'object' : val) };
        }
        return Response.json({ fields, project_id: p.id, client_id: p.client_id, project_name: p.project_name, estimate_number: p.estimate_number });
      }
      return Response.json({ fields: {} });
    }

    // Default: return projects
    const projects = await estimator.entities.FoundationProject.list('-created_date', 10);
    return Response.json({ projects, count: projects.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});