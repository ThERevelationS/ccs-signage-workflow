let watchReadSequence = 0;

export function approvalWatchIndex(watches, id) {
  return watches.findIndex((watch) =>
    watch.entity === "AllInOneEstimate" && String(watch.record_id) === String(id) && watch.field === "status"
  );
}

export async function listApprovalWatches({ invoke, sessionToken }) {
  if (!sessionToken) throw Object.assign(new Error("Session expired"), { status: 401 });
  const response = await invoke("opportunityWorkspaceAction", {
    session_token: sessionToken, action: "list_watches", request_nonce: `${Date.now()}-${++watchReadSequence}`,
  });
  const body = response?.data || response;
  if (!body?.success || !Array.isArray(body.watches)) throw new Error("Watches could not be loaded.");
  return body.watches;
}

export async function changeApprovalWatch({ invoke, getToken, estimate, watching }) {
  const read = () => listApprovalWatches({ invoke, sessionToken: getToken() });
  if (watching) {
    const index = approvalWatchIndex(await read(), estimate.id);
    if (index >= 0) {
      const response = await invoke("opportunityWorkspaceAction", { session_token: getToken(), action: "clear_watch", index });
      if (!(response?.data || response)?.success) throw new Error("Watch could not be cleared.");
    }
  } else {
    const response = await invoke("opportunityWorkspaceAction", {
      session_token: getToken(), action: "set_watch", entity: "AllInOneEstimate",
      record_id: estimate.id, field: "status", value: "approved",
      label: estimate.project_name || estimate.estimate_number || "this estimate",
    });
    if (!(response?.data || response)?.success) throw new Error("Watch could not be set.");
  }
  return approvalWatchIndex(await read(), estimate.id) >= 0;
}

export function approvalWatchError(error) {
  return Number(error?.status ?? error?.response?.status) === 401 || /status code 401/i.test(error?.message || "")
    ? "Your session expired — sign in again."
    : "Could not update the approval watch. Please try again.";
}
