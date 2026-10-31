import { invokeFleet } from "@/components/fleet/fleetInvoke";
import { newRequestKey } from "./sopModel";

// Thin wrappers over the session-authenticated manageSops gateway. Every call
// carries the EmailGate session token (injected by invokeFleet); the backend
// enforces viewer/editor/admin visibility itself.
const invoke = (action, payload = {}) =>
  invokeFleet("manageSops", { action, ...payload });

export const sopBootstrap = () => invoke("bootstrap");

export const sopList = () => invoke("list").then((r) => r?.sops || []);

export const sopGet = (id) => invoke("get", { id }).then((r) => r?.sop || null);

export const sopCreate = (data, requestKey = newRequestKey()) =>
  invoke("create", { data, creation_request_key: requestKey });

export const sopUpdate = ({ id, expectedUpdatedDate, nextFields }) =>
  invoke("update", { id, expected_updated_date: expectedUpdatedDate, next_fields: nextFields });

export const sopSetStatus = ({ id, expectedUpdatedDate, status }) =>
  invoke("set_status", { id, expected_updated_date: expectedUpdatedDate, status });

export const sopDelete = ({ id, expectedUpdatedDate }) =>
  invoke("delete", { id, expected_updated_date: expectedUpdatedDate });

export const sopAcknowledge = (id) => invoke("acknowledge", { id });

export const sopSaveSettings = ({ settings, expectedUpdatedDate }) =>
  invoke("save_settings", { settings, expected_updated_date: expectedUpdatedDate });

export const sopAckReport = () => invoke("ack_report");

export const sopSuggestEdit = ({ id, stepId, text }) =>
  invoke("suggest_edit", { id, step_id: stepId, text });

export const sopResolveSuggestion = ({ id, suggestionId, outcome, expectedUpdatedDate }) =>
  invoke("resolve_suggestion", { id, suggestion_id: suggestionId, outcome, expected_updated_date: expectedUpdatedDate });
