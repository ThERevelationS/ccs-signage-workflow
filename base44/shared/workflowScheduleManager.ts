import { describeCron, nextRuns, firingMinutesOverlap, validateSchedule } from './cronSchedule.mjs';

const API_BASE = 'https://app.base44.com';
const HISTORY_PAGE = 200;

function fail(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  throw error;
}

function scheduleFields(workflow) {
  const config = workflow?.trigger?.config || {};
  return {
    trigger_type: String(config.trigger_type || ''),
    cron: String(config.cron_expression || ''),
    timezone: String(config.timezone || ''),
  };
}

function buildRow(workflow, now) {
  const { trigger_type, cron, timezone } = scheduleFields(workflow);
  const row = {
    id: workflow?.id || '',
    name: String(workflow?.name || ''),
    description: workflow?.description || null,
    status: String(workflow?.status || ''),
    status_reason: workflow?.status_reason ?? null,
    trigger_type,
    cron,
    timezone,
    schedule_text: '',
    next_runs: [],
    total_runs: Number(workflow?.total_runs || 0),
    consecutive_failures: Number(workflow?.consecutive_failures || 0),
    last_run_at: workflow?.last_run_at ?? null,
    last_run_status: workflow?.last_run_status ?? null,
    collisions: [],
    external_change: false,
    last_applied: null,
  };
  if (trigger_type === 'scheduled' && cron) {
    try { row.schedule_text = describeCron(cron); } catch { row.schedule_text = `Custom schedule (${cron})`; }
    try {
      row.next_runs = nextRuns(cron, timezone || 'UTC', now(), 3).map((d) => d.toISOString());
    } catch { row.next_runs = []; }
  }
  return row;
}

async function loadHistoryRows(historyEntity, query, maxRows = 2000) {
  const rows = [];
  let skip = 0;
  while (rows.length < maxRows) {
    const pageSize = Math.min(500, maxRows - rows.length);
    const page = await historyEntity.filter(query, '-created_date', pageSize, skip);
    if (!Array.isArray(page)) throw new Error('Workflow schedule history could not be read.');
    rows.push(...page);
    if (page.length < pageSize) break;
    skip += page.length;
  }
  return rows;
}

function actorFields(actor) {
  return {
    actor_email: String(actor?.email || '').trim().toLowerCase(),
    actor_name: String(actor?.full_name || actor?.email || ''),
  };
}

export function createWorkflowScheduleManager({
  fetchImpl, token, appId, historyEntity,
  now = () => new Date(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const app = String(appId || '').trim();

  function requireToken() {
    const secret = String(token || '').trim();
    if (!secret) {
      fail(503, 'not_configured', 'Base44 connection is not configured. Add the BASE44_WORKFLOWS_TOKEN app secret.');
    }
    return secret;
  }

  async function rawFetch(method, path, body) {
    const secret = requireToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      return await fetchImpl(`${API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function api(method, path, body) {
    let response;
    try {
      response = await rawFetch(method, path, body);
    } catch (error) {
      if (error?.status) throw error;
      fail(502, 'base44_unreachable', `Base44 could not be reached. ${String(error?.message || error).slice(0, 200)}`);
    }
    if (response.status === 429) {
      const retryAfter = Number(response?.headers?.get?.('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(5000, retryAfter * 1000) : 3000);
      try {
        response = await rawFetch(method, path, body);
      } catch (error) {
        if (error?.status) throw error;
        fail(502, 'base44_unreachable', `Base44 could not be reached. ${String(error?.message || error).slice(0, 200)}`);
      }
    }
    if (response.status === 429) {
      fail(503, 'base44_busy', 'Base44 is busy right now. Try again shortly.');
    }
    if (response.status === 401 || response.status === 403) {
      fail(502, 'base44_auth', "Base44 rejected the admin page's token (check BASE44_WORKFLOWS_TOKEN)");
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const secret = String(token || '').trim();
      const sanitized = secret ? String(text || 'no detail').split(secret).join('[redacted]') : String(text || 'no detail');
      fail(502, 'base44_error', `Base44 request failed (${response.status}): ${sanitized.slice(0, 300)}`);
    }
    if (response.status === 204) return null;
    return response.json().catch(() => null);
  }

  const workflowsPath = () => `/api/apps/${app}/workflows`;
  const workflowPath = (id) => `${workflowsPath()}/${encodeURIComponent(String(id || '').trim())}`;

  async function getWorkflow(id) {
    const workflow = await api('GET', workflowPath(id));
    if (!workflow?.id) fail(502, 'base44_error', 'Base44 returned an unreadable workflow record.');
    return workflow;
  }

  async function appliedHistoryByKind() {
    const rows = await loadHistoryRows(historyEntity, { outcome: 'applied' });
    const schedule = new Map();
    const status = new Map();
    const any = new Map();
    for (const row of rows) {
      const id = String(row?.workflow_id || '');
      if (!id) continue;
      const action = String(row?.action || '');
      if (!any.has(id)) any.set(id, row);
      if (!schedule.has(id) && (action === 'schedule_update' || action === 'adopt_external')) schedule.set(id, row);
      if (!status.has(id) && (action === 'status_change' || action === 'adopt_external')) status.set(id, row);
    }
    return { schedule, status, any };
  }

  function markExternal(row, current, marks) {
    const scheduleRow = marks.schedule.get(row.id);
    const statusRow = marks.status.get(row.id);
    if (!scheduleRow && !statusRow) return false;
    const scheduleChanged = scheduleRow
      ? String(scheduleRow.new_cron || '') !== row.cron || String(scheduleRow.new_timezone || '') !== row.timezone
      : false;
    const statusChanged = statusRow
      ? String(statusRow.new_status || '') !== row.status
      : false;
    return Boolean(scheduleChanged || statusChanged);
  }

  function lastAppliedFor(row, marks) {
    const historyRow = marks.any.get(row.id);
    if (!historyRow) return null;
    return {
      cron: historyRow.new_cron || '',
      timezone: historyRow.new_timezone || '',
      status: historyRow.new_status || '',
      at: historyRow.verified_at || historyRow.created_date || null,
      actor_email: historyRow.actor_email || '',
    };
  }

  async function list() {
    const items = await api('GET', `${workflowsPath()}?limit=200`);
    const workflows = Array.isArray(items) ? items : [];
    const details = [];
    for (let i = 0; i < workflows.length; i += 4) {
      const batch = workflows.slice(i, i + 4);
      details.push(...await Promise.all(batch.map((item) => api('GET', workflowPath(item.id)))));
    }
    const marks = await appliedHistoryByKind();
    const rows = details.filter(Boolean).map((workflow) => {
      const row = buildRow(workflow, now);
      row.external_change = markExternal(row, workflow, marks);
      row.last_applied = lastAppliedFor(row, marks);
      return row;
    });
    const scheduled = rows.filter((row) => row.status === 'active' && row.trigger_type === 'scheduled' && row.cron);
    for (let i = 0; i < scheduled.length; i += 1) {
      for (let j = i + 1; j < scheduled.length; j += 1) {
        const a = scheduled[i];
        const b = scheduled[j];
        try {
          const overlap = firingMinutesOverlap(a.cron, a.timezone || 'UTC', b.cron, b.timezone || 'UTC', now());
          if (overlap.length) {
            const at = overlap[0].toISOString();
            a.collisions.push({ workflow_id: b.id, name: b.name, next_shared: at });
            b.collisions.push({ workflow_id: a.id, name: a.name, next_shared: at });
          }
        } catch { /* an unparsable cron simply cannot collide */ }
      }
    }
    return rows;
  }

  async function runs({ workflow_id } = {}) {
    const id = String(workflow_id || '').trim();
    if (!id) fail(400, 'invalid_request', 'A workflow id is required.');
    const items = await api('GET', `${workflowPath(id)}/runs?limit=10`);
    return (Array.isArray(items) ? items : []).slice(0, 10).map((run) => ({
      run_id: run?.run_id || '',
      started_at: run?.started_at ?? null,
      completed_at: run?.completed_at ?? null,
      status: run?.status || '',
      error_message: run?.error_message ?? null,
      duration_ms: Number(run?.duration_ms || 0),
      trigger_type: run?.trigger_type || '',
    }));
  }

  async function findAppliedRequest(requestId) {
    if (!requestId) return null;
    const rows = await historyEntity.filter({ request_id: requestId }, '-created_date', 1, 0).catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    return row && String(row.outcome || '') === 'applied' ? row : null;
  }

  function requireRequestId(requestId) {
    const id = String(requestId || '').trim();
    if (id.length < 8 || id.length > 128) {
      fail(400, 'invalid_request', 'A request id between 8 and 128 characters is required.');
    }
    return id;
  }

  async function writeHistory(fields) {
    await historyEntity.create(fields);
  }

  async function updateSchedule({ workflow_id, cron_expression, timezone, expected_cron, expected_timezone, request_id } = {}, actor) {
    const id = String(workflow_id || '').trim();
    if (!id) fail(400, 'invalid_request', 'A workflow id is required.');
    const requestId = requireRequestId(request_id);
    const replay = await findAppliedRequest(requestId);
    if (replay) {
      return {
        replayed: true,
        workflow_id: id,
        cron: replay.new_cron || '',
        timezone: replay.new_timezone || '',
        status: replay.new_status || '',
      };
    }
    const cron = String(cron_expression || '').trim();
    const tz = String(timezone || '').trim();
    const validation = validateSchedule(cron, tz);
    if (!validation.ok) fail(400, 'invalid_schedule', validation.error);

    const current = await getWorkflow(id);
    const { trigger_type, cron: currentCron, timezone: currentTz } = scheduleFields(current);
    const historyBase = {
      workflow_id: id,
      workflow_name: String(current?.name || ''),
      action: 'schedule_update',
      previous_cron: currentCron,
      previous_timezone: currentTz,
      previous_status: String(current?.status || ''),
      new_cron: cron,
      new_timezone: tz,
      request_id: requestId,
      ...actorFields(actor),
    };
    if (trigger_type !== 'scheduled') {
      fail(400, 'invalid_request', 'This workflow is not on a cron schedule and cannot be edited here.');
    }
    if (currentCron !== String(expected_cron || '') || currentTz !== String(expected_timezone || '')) {
      await writeHistory({ ...historyBase, outcome: 'conflict', error: 'Schedule changed externally since it was loaded.' });
      fail(409, 'conflict', 'This schedule was changed in Base44 since you opened it. Reload to see the latest.');
    }

    await api('PUT', workflowPath(id), {
      trigger: {
        ...current.trigger,
        config: {
          ...current.trigger?.config,
          trigger_type: 'scheduled',
          schedule_mode: 'recurring',
          cron_expression: cron,
          timezone: tz,
        },
      },
    });

    const stored = await getWorkflow(id);
    const storedFields = scheduleFields(stored);
    if (storedFields.cron !== cron || storedFields.timezone !== tz) {
      await writeHistory({ ...historyBase, outcome: 'failed', error: 'Base44 did not keep the new schedule.' });
      fail(502, 'base44_error', 'Base44 did not keep the new schedule.');
    }
    await writeHistory({ ...historyBase, outcome: 'applied', verified_at: now().toISOString() });
    const row = buildRow(stored, now);
    row.last_applied = { cron, timezone: tz, status: row.status, at: now().toISOString(), actor_email: actorFields(actor).actor_email };
    return { row };
  }

  async function setStatus({ workflow_id, desired_status, expected_status, request_id } = {}, actor) {
    const id = String(workflow_id || '').trim();
    if (!id) fail(400, 'invalid_request', 'A workflow id is required.');
    const desired = String(desired_status || '').trim();
    if (!['active', 'inactive'].includes(desired)) fail(400, 'invalid_request', 'Status must be active or inactive.');
    const requestId = requireRequestId(request_id);
    const replay = await findAppliedRequest(requestId);
    if (replay) {
      return {
        replayed: true,
        workflow_id: id,
        cron: replay.new_cron || '',
        timezone: replay.new_timezone || '',
        status: replay.new_status || '',
      };
    }

    const current = await getWorkflow(id);
    const { cron: currentCron, timezone: currentTz } = scheduleFields(current);
    const currentStatus = String(current?.status || '');
    const historyBase = {
      workflow_id: id,
      workflow_name: String(current?.name || ''),
      action: 'status_change',
      previous_cron: currentCron,
      previous_timezone: currentTz,
      previous_status: currentStatus,
      new_status: desired,
      request_id: requestId,
      ...actorFields(actor),
    };
    if (currentStatus === desired) {
      return { row: buildRow(current, now), already: true };
    }
    if (currentStatus !== String(expected_status || '')) {
      await writeHistory({ ...historyBase, outcome: 'conflict', error: 'Status changed externally since it was loaded.' });
      fail(409, 'conflict', 'This job was changed in Base44 since you opened it. Reload to see the latest.');
    }
    await api('POST', `${workflowPath(id)}/toggle-status?status=${desired}`);
    const stored = await getWorkflow(id);
    if (String(stored?.status || '') !== desired) {
      await writeHistory({ ...historyBase, outcome: 'failed', error: 'Base44 did not keep the new status.' });
      fail(502, 'base44_error', 'Base44 did not keep the new status.');
    }
    await writeHistory({ ...historyBase, outcome: 'applied', verified_at: now().toISOString() });
    return { row: buildRow(stored, now) };
  }

  async function adoptExternal({ workflow_id } = {}, actor) {
    const id = String(workflow_id || '').trim();
    if (!id) fail(400, 'invalid_request', 'A workflow id is required.');
    const current = await getWorkflow(id);
    const { cron, timezone } = scheduleFields(current);
    await writeHistory({
      workflow_id: id,
      workflow_name: String(current?.name || ''),
      action: 'adopt_external',
      new_cron: cron,
      new_timezone: timezone,
      new_status: String(current?.status || ''),
      outcome: 'applied',
      verified_at: now().toISOString(),
      ...actorFields(actor),
    });
    return { adopted: true, workflow_id: id };
  }

  async function history({ workflow_id, limit = 50 } = {}) {
    const capped = Math.max(1, Math.min(100, Number(limit) || 50));
    const query = workflow_id ? { workflow_id: String(workflow_id) } : {};
    return loadHistoryRows(historyEntity, query, capped);
  }

  return { list, runs, updateSchedule, setStatus, adoptExternal, history };
}
