const RECORD_ACTION_EVENTS = new Set([
  'sales_lead_created', 'sales_status_changed', 'sales_status_won',
  'sales_status_lost', 'sales_status_on_hold', 'sales_rep_changed',
  'pending_import_created', 'duplicate_detected',
  'feature_report_submitted', 'feature_report_status_changed', 'feature_report_completed',
  'user_registered', 'user_password_reset', 'user_face_enrolled', 'user_role_changed',
  'jurisdiction_profile_created', 'jurisdiction_profile_updated', 'regulation_alert_created',
]);
const ORDER_DEADLINES = new Set(['order_date_needed_approaching', 'order_date_needed_passed', 'order_overdue']);
const RECORD_FILTERS = {
  record_status: 'status', record_type: 'type', record_priority: 'priority',
  record_stage: 'stage', record_role: 'role', record_state: 'state',
  record_severity: 'severity', record_doc_type: 'doc_type',
};

export function supportsRecordDestination(type = '') {
  return RECORD_ACTION_EVENTS.has(type) || (type.startsWith('order_') && !ORDER_DEADLINES.has(type));
}

export function matchesRecordFilters(condition = {}, record) {
  return Object.entries(RECORD_FILTERS).every(([key, field]) => {
    if (condition[key] == null || condition[key] === '') return true;
    return record && String(record[field] ?? '').trim().toLowerCase() === String(condition[key]).trim().toLowerCase();
  });
}

export function recordDestinationIds(rule) {
  if (!(rule.triggers || []).some(t => supportsRecordDestination(t.trigger_type))) return [];
  const ids = [];
  for (const action of rule.actions || []) {
    if (!['add_task', 'add_note'].includes(action.action_type)) continue;
    const id = String(action.action_config?.target_work_order_id || '').trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Object.assign(new Error('Record task/note actions require an explicit destination Work Order ID.'), { status: 400 });
    ids.push(id);
  }
  return [...new Set(ids)];
}

export function assertAutomationStructure(rule) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!Array.isArray(rule?.triggers) || !rule.triggers.length || rule.triggers.length > 100 ||
      !Array.isArray(rule?.actions) || !rule.actions.length || rule.actions.length > 100) {
    throw Object.assign(new Error('Choose between 1 and 100 events and actions.'), { status: 400 });
  }
  for (const trigger of rule.triggers) {
    if (!object(trigger) || typeof trigger.trigger_type !== 'string' || !trigger.trigger_type.trim() ||
        !object(trigger.trigger_condition || {}) || !['or', 'and', undefined].includes(trigger.logic)) {
      throw Object.assign(new Error('Each event requires a valid type, filters, and Any/All setting.'), { status: 400 });
    }
    const c = trigger.trigger_condition || {};
    if (c.min_quantity != null && c.max_quantity != null && Number(c.min_quantity) > Number(c.max_quantity)) {
      throw Object.assign(new Error('Minimum quantity cannot exceed maximum quantity.'), { status: 400 });
    }
  }
  const actionTypes = new Set(['send_email', 'change_stage', 'set_asap', 'assign_to', 'add_task', 'add_note',
    'set_due_date', 'create_rider', 'set_priority', 'mark_complete']);
  for (const action of rule.actions) {
    if (!object(action) || !actionTypes.has(action.action_type) || !object(action.action_config || {})) {
      throw Object.assign(new Error('Each action requires a supported type and valid settings.'), { status: 400 });
    }
  }
}
