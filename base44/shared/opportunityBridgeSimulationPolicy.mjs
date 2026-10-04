const clean = (value) => String(value ?? '').trim();

export const OPPORTUNITY_BRIDGE_SIMULATION = Object.freeze({
  MODE: 'simulation',
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 25,
  MAX_REQUESTED_WORK_ORDERS: 25,
  WRITE_CAPABILITY: false,
});

const FORBIDDEN_KEYS = new Set([
  'apply','write','commit','execute','persist','create','update','delete','link',
  'opportunity','opportunity_payload','payload','proposed_opportunity',
]);

const ALLOWED_ACTIONS = new Set([
  'proposed_create','proposed_recover_link','already_linked','hold','excluded',
]);

export class OpportunityBridgeSimulationRequestError extends Error {
  constructor(message, code = 'INVALID_SIMULATION_REQUEST') {
    super(message);
    this.name = 'OpportunityBridgeSimulationRequestError';
    this.code = code;
  }
}

export function parseOpportunityBridgeSimulationRequest(body = {}) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_KEYS.has(String(key).toLowerCase())) {
      throw new OpportunityBridgeSimulationRequestError(
        `Opportunity bridge production writes are disabled. Request field "${key}" is not accepted.`,
        'WRITE_REQUEST_REJECTED',
      );
    }
  }

  const mode = clean(input.mode || OPPORTUNITY_BRIDGE_SIMULATION.MODE).toLowerCase();
  if (mode !== OPPORTUNITY_BRIDGE_SIMULATION.MODE) {
    throw new OpportunityBridgeSimulationRequestError(
      'Opportunity bridge endpoint is simulation-only. mode must be "simulation".',
      'WRITE_MODE_DISABLED',
    );
  }
  if (input.dry_run === false || input.simulate === false) {
    throw new OpportunityBridgeSimulationRequestError(
      'Opportunity bridge endpoint cannot disable simulation mode.',
      'WRITE_MODE_DISABLED',
    );
  }

  const requestedLimit = Number(input.limit ?? OPPORTUNITY_BRIDGE_SIMULATION.DEFAULT_LIMIT);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    throw new OpportunityBridgeSimulationRequestError('limit must be a positive integer.');
  }
  const limit = Math.min(requestedLimit, OPPORTUNITY_BRIDGE_SIMULATION.MAX_LIMIT);

  const rawIds = Array.isArray(input.work_order_ids) ? input.work_order_ids : [];
  if (rawIds.length > OPPORTUNITY_BRIDGE_SIMULATION.MAX_REQUESTED_WORK_ORDERS) {
    throw new OpportunityBridgeSimulationRequestError(
      `work_order_ids is limited to ${OPPORTUNITY_BRIDGE_SIMULATION.MAX_REQUESTED_WORK_ORDERS} records per simulation.`,
    );
  }
  const workOrderIds = [...new Set(rawIds.map(clean).filter(Boolean))];
  if (workOrderIds.length !== rawIds.filter((value) => clean(value)).length) {
    throw new OpportunityBridgeSimulationRequestError('work_order_ids must contain unique nonblank WorkOrder ids.');
  }

  const rawActions = Array.isArray(input.actions) ? input.actions : [];
  const actions = rawActions.length
    ? [...new Set(rawActions.map((value) => clean(value).toLowerCase()).filter(Boolean))]
    : ['proposed_create','proposed_recover_link','already_linked'];
  for (const action of actions) {
    if (!ALLOWED_ACTIONS.has(action)) {
      throw new OpportunityBridgeSimulationRequestError(`Unsupported simulation action filter: ${action}`);
    }
  }

  return {
    mode: OPPORTUNITY_BRIDGE_SIMULATION.MODE,
    limit,
    work_order_ids: workOrderIds,
    actions,
    write_capability: false,
  };
}

export function selectOpportunityBridgeSimulationRows(planRows = [], request = {}) {
  const rows = Array.isArray(planRows) ? planRows : [];
  const idSet = new Set(Array.isArray(request.work_order_ids) ? request.work_order_ids : []);
  const actionSet = new Set(Array.isArray(request.actions) ? request.actions : []);
  const limit = Math.max(1, Math.min(
    Number(request.limit) || OPPORTUNITY_BRIDGE_SIMULATION.DEFAULT_LIMIT,
    OPPORTUNITY_BRIDGE_SIMULATION.MAX_LIMIT,
  ));

  return rows
    .filter((row) => !idSet.size || idSet.has(clean(row?.work_order_id)))
    .filter((row) => !actionSet.size || actionSet.has(clean(row?.action)))
    .slice(0, limit);
}
