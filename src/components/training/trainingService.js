import { invokeFleet } from "@/components/fleet/fleetInvoke";
import { newRequestKey } from "@/components/sop/sopModel";

// Thin wrappers over the session-authenticated manageTraining gateway. Every
// call carries the EmailGate session token (injected by invokeFleet); the
// backend enforces assignee/editor/admin visibility itself.
const invoke = (action, payload = {}) =>
  invokeFleet("manageTraining", { action, ...payload });

export const trainingBootstrap = () => invoke("bootstrap");

export const trainingReport = () => invoke("report");

export const trainingComplete = ({ id, expectedUpdatedDate }) =>
  invoke("complete", { id, expected_updated_date: expectedUpdatedDate });

export const trainingAssign = ({ trainingId, emails, dueDate, notes }) =>
  invoke("assign", { training_id: trainingId, emails, due_date: dueDate, notes });

export const trainingCancel = ({ id, expectedUpdatedDate }) =>
  invoke("cancel", { id, expected_updated_date: expectedUpdatedDate });

export const trainingReopen = ({ id, expectedUpdatedDate }) =>
  invoke("reopen", { id, expected_updated_date: expectedUpdatedDate });

export const trainingItemCreate = ({ item, creationRequestKey = newRequestKey() }) =>
  invoke("item_create", { item, creation_request_key: creationRequestKey });

export const trainingItemUpdate = ({ id, expectedUpdatedDate, item }) =>
  invoke("item_update", { id, expected_updated_date: expectedUpdatedDate, item });

export const trainingItemDelete = ({ id, expectedUpdatedDate }) =>
  invoke("item_delete", { id, expected_updated_date: expectedUpdatedDate });
