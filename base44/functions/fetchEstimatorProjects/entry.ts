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

    // Default: return projects
    const projects = await estimator.entities.FoundationProject.list('-created_date', 10);
    return Response.json({ projects, count: projects.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});