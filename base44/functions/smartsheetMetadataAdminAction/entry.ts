import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { secrets } from 'base44:runtime';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { loadGlobalSettingSingleton } from '../../shared/globalSettingSingleton.ts';
import { safeExternalFetch } from '../../shared/safeExternalFetch.ts';

const TOKEN_SECRET_NAME = 'SMARTSHEET_API_TOKEN';
const API_BASE = 'https://api.smartsheet.com/2.0';
const WORKFLOW_SHEET_ID = '8702703019812740';

const ALLOWED_TARGETS = Object.freeze({
  lead_source: {
    sheet_id: WORKFLOW_SHEET_ID,
    column_id: '4072653460557700',
    expected_title: 'Source',
    expected_type: 'PICKLIST',
  },
  current_task_description: {
    sheet_id: WORKFLOW_SHEET_ID,
    column_id: '4783818077955972',
    expected_title: 'Current Task Description',
    expected_type: 'PICKLIST',
  },
  current_task_assigned_to: {
    sheet_id: WORKFLOW_SHEET_ID,
    column_id: '3326787726927748',
    expected_title: 'Current Task Assigned to',
    expected_type: 'PICKLIST',
  },
});

function clean(value: unknown, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function optionKey(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Smartsheet returned an unreadable metadata response.'), { status: 502 });
  }
}

function headers(token: string) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'smartsheet-integration-source': 'APPLICATION,CincinnatiCustomSigns,Base44-Smartsheet-Metadata',
  };
}

async function getColumns(sheetId: string, token: string) {
  const response = await safeExternalFetch(`${API_BASE}/sheets/${sheetId}/columns?includeAll=true`, {
    method: 'GET',
    headers: headers(token),
  }, 0);
  if (!response.ok) {
    throw Object.assign(new Error(`Smartsheet column metadata read failed with HTTP ${response.status}.`), { status: 502 });
  }
  const body = await readJson(response);
  const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
  return rows.map((column: any) => ({
    id: String(column?.id ?? ''),
    title: clean(column?.title),
    type: clean(column?.type, 80),
    validation: column?.validation === true,
    options: Array.isArray(column?.options) ? column.options.map((option: unknown) => clean(option)).filter(Boolean) : [],
  })).filter((column: any) => column.id);
}

function getTargetColumn(columns: any[], target: any) {
  const column = columns.find((candidate) => candidate.id === target.column_id);
  if (!column) throw Object.assign(new Error('The verified Smartsheet column ID no longer exists. Re-run mapping analysis.'), { status: 409 });
  if (column.title !== target.expected_title || column.type !== target.expected_type) {
    throw Object.assign(new Error(
      `Smartsheet column metadata changed: expected ${target.expected_title} (${target.expected_type}), found ${column.title || 'unnamed'} (${column.type || 'unknown'}). Re-run semantic mapping review before changing options.`
    ), { status: 409 });
  }
  return column;
}

function additivePlan(currentOptions: string[], requestedOptions: string[]) {
  const currentByKey = new Map(currentOptions.map((option) => [optionKey(option), option]));
  const requested = [];
  const seen = new Set();
  for (const raw of requestedOptions || []) {
    const value = clean(raw);
    const key = optionKey(value);
    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    requested.push(value);
  }
  const additions = requested.filter((option) => !currentByKey.has(optionKey(option)));
  return { additions, next_options: [...currentOptions, ...additions] };
}

async function assertSafety(base44: any) {
  const setting = await loadGlobalSettingSingleton({
    entity: base44.asServiceRole.entities.GlobalSettings,
    settingKey: 'smartsheetSyncConfig',
    label: 'Smartsheet sync configuration',
  });
  const config = setting?.setting_value;
  if (!config || config.global_enabled !== false || config.observation_mode !== true || config.backup_before_write !== true) {
    throw Object.assign(new Error(
      'Smartsheet metadata changes are allowed only while global sync is OFF, observation mode is ON, and backup-before-write is ON.'
    ), { status: 409 });
  }
  return config;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    let actor = null;
    if (body?.session_token) {
      actor = await authenticateSignShopSession(base44, body.session_token);
    } else {
      actor = await base44.auth.me().catch(() => null);
    }
    if (actor?.role !== 'admin') {
      return Response.json({ success: false, error: 'Admin access is required.' }, { status: 403 });
    }

    const action = clean(body?.action, 80).toLowerCase();
    if (!['preview_append_options', 'append_options'].includes(action)) {
      return Response.json({ success: false, error: 'Invalid Smartsheet metadata action.' }, { status: 400 });
    }

    const targetKey = clean(body?.target, 80);
    const target = (ALLOWED_TARGETS as any)[targetKey];
    if (!target) {
      return Response.json({ success: false, error: 'This Smartsheet column is not approved for metadata option reconciliation.' }, { status: 400 });
    }

    await assertSafety(base44);

    const token = String(secrets.get(TOKEN_SECRET_NAME) || '').trim();
    if (!token) {
      return Response.json({ success: false, error: 'Smartsheet API token is not configured.' }, { status: 503 });
    }

    const beforeColumns = await getColumns(target.sheet_id, token);
    const before = getTargetColumn(beforeColumns, target);
    const plan = additivePlan(before.options, Array.isArray(body?.options) ? body.options : []);

    if (action === 'preview_append_options' || plan.additions.length === 0) {
      return Response.json({
        success: true,
        read_only: true,
        target: targetKey,
        sheet_id: target.sheet_id,
        column_id: target.column_id,
        column_title: before.title,
        existing_options: before.options,
        additions: plan.additions,
        next_options: plan.next_options,
        changed: false,
      });
    }

    if (body?.confirmation !== 'ADD_ONLY_VERIFIED_PICKLIST_OPTIONS') {
      return Response.json({
        success: false,
        error: 'Explicit additive-only picklist confirmation is required.',
      }, { status: 400 });
    }

    const response = await safeExternalFetch(
      `${API_BASE}/sheets/${target.sheet_id}/columns/${target.column_id}`,
      {
        method: 'PUT',
        headers: headers(token),
        body: JSON.stringify({ type: before.type, options: plan.next_options }),
      },
      0,
    );
    if (!response.ok) {
      throw Object.assign(new Error(`Smartsheet rejected the additive column-option update with HTTP ${response.status}.`), { status: 502 });
    }
    await readJson(response);

    const afterColumns = await getColumns(target.sheet_id, token);
    const after = getTargetColumn(afterColumns, target);
    const afterKeys = new Set(after.options.map(optionKey));
    const missing = plan.additions.filter((option) => !afterKeys.has(optionKey(option)));
    const removed = before.options.filter((option) => !afterKeys.has(optionKey(option)));
    if (missing.length || removed.length) {
      throw Object.assign(new Error(
        'Smartsheet returned success but additive option verification failed. No automatic retry was attempted.'
      ), { status: 502 });
    }

    return Response.json({
      success: true,
      metadata_write: true,
      additive_only: true,
      target: targetKey,
      sheet_id: target.sheet_id,
      column_id: target.column_id,
      column_title: after.title,
      additions: plan.additions,
      options: after.options,
      changed: plan.additions.length > 0,
    });
  } catch (error) {
    const status = Math.max(400, Math.min(599, Number((error as any)?.status || 500)));
    console.error('smartsheetMetadataAdminAction error:', error?.message || error);
    return Response.json({
      success: false,
      error: error?.message || 'Smartsheet metadata change could not be completed safely.',
    }, { status });
  }
});
