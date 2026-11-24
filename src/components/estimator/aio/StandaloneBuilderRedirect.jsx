import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { staffEntities } from "@/components/staff/staffEntities";
import { loadAllEntityRows } from "@/lib/loadAllEntityRows";

export async function findBuilderEstimate({ projectId, estimateId, moduleKey, entityName, entities = staffEntities, loadRows = loadAllEntityRows }) {
  if (!projectId) return null;
  const getIfPresent = async (entity, id) => {
    try {
      return await entity.get(id);
    } catch (error) {
      if ((error?.status ?? error?.response?.status) === 404) return null;
      throw error;
    }
  };
  const matches = (row) => row?.id && row.deleted !== true && (row.line_items || []).some(
    (line) => line.module_key === moduleKey && line.project_id === projectId
  );
  if (estimateId) {
    const estimate = await getIfPresent(entities.AllInOneEstimate, estimateId);
    if (matches(estimate)) return estimate.id;
  }
  const project = await getIfPresent(entities[entityName], projectId);
  if (project?.estimate_id && project.estimate_id !== estimateId) {
    const estimate = await getIfPresent(entities.AllInOneEstimate, project.estimate_id);
    if (matches(estimate)) return estimate.id;
  }
  const estimates = await loadRows({
    entity: entities.AllInOneEstimate,
    query: { "line_items.project_id": projectId },
    sort: "-updated_date",
    label: "Linked estimates",
  });
  const linked = estimates.filter(matches);
  if (linked.length > 1) throw new Error("This project is linked to multiple estimates. Open the appropriate estimate from the queue.");
  return linked[0]?.id || null;
}

export function StandaloneBuilderRedirect({ moduleKey, entityName }) {
  const [params] = useSearchParams();
  const projectId = params.get("id") || params.get("edit") || "";
  const estimateId = params.get("estimateId") || "";
  const [state, setState] = useState({ loading: true, destination: "", error: "" });

  useEffect(() => {
    let active = true;
    setState({ loading: true, destination: "", error: "" });
    findBuilderEstimate({ projectId, estimateId, moduleKey, entityName }).then((id) => {
      if (active) setState({ loading: false, destination: id ? `/EstimateDetail?id=${encodeURIComponent(id)}` : "/EstimatorProducts", error: "" });
    }).catch((error) => {
      if (active) setState({ loading: false, destination: "", error: error?.message || "The linked estimate could not be checked." });
    });
    return () => { active = false; };
  }, [projectId, estimateId, moduleKey, entityName]);

  if (state.loading) return <p role="status" className="p-6 text-sm text-gray-500">Finding the linked estimate…</p>;
  if (state.error) return <div role="alert" className="p-6 text-sm text-red-700">{state.error} <Link className="underline" to="/EstimatorProducts">Open Products</Link></div>;
  return <Navigate to={state.destination} replace />;
}

export function withStandaloneBuilderRedirect(Builder, moduleKey, entityName) {
  return function BuilderEntry(props) {
    return props.embedded
      ? <Builder {...props} />
      : <StandaloneBuilderRedirect moduleKey={moduleKey} entityName={entityName} />;
  };
}
