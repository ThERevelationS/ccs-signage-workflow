import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { loadGlobalSettingSingleton, saveGlobalSettingFromSnapshot } from '../../shared/globalSettingSingleton.ts';

// Quote approval threshold administration. The threshold lives as a
// GlobalSettings row (setting_key "quote_approval_threshold", setting_value
// { threshold: number }) — the same key the recordEstimateQuoteDelivery send
// gate reads. Reads are available to any signed-in staff session; writes
// require an admin and save through the shared singleton CAS helper so a
// stale editor cannot overwrite a newer value.
const SETTING_KEY = 'quote_approval_threshold';
const DEFAULT_THRESHOLD = 5000;

function thresholdFromRecord(record: any) {
  const raw = record?.setting_value;
  const parsed = Number(raw?.threshold ?? raw?.value ?? raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_THRESHOLD;
}

function recordView(record: any) {
  if (!record?.id) return null;
  return {
    id: record.id,
    setting_key: record.setting_key,
    setting_value: record.setting_value,
    updated_date: record.updated_date,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    if (!actor?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const Settings = base44.asServiceRole.entities.GlobalSettings;
    const action = String(body?.action || 'get').trim();

    if (action === 'get') {
      const record = await loadGlobalSettingSingleton({
        entity: Settings,
        settingKey: SETTING_KEY,
        label: 'Quote approval threshold',
      });
      return Response.json({
        success: true,
        threshold: thresholdFromRecord(record),
        record: recordView(record),
      });
    }

    if (action === 'save_threshold') {
      if (actor?.role !== 'admin') {
        return Response.json({ error: 'Admin access is required.' }, { status: 403 });
      }
      const next = Number(body?.threshold);
      if (!Number.isFinite(next) || next < 0 || next > 100000000) {
        return Response.json({ error: 'The quote approval threshold must be a number between 0 and 100,000,000.' }, { status: 400 });
      }
      const result = await saveGlobalSettingFromSnapshot({
        entity: Settings,
        settingKey: SETTING_KEY,
        settingValue: { threshold: next },
        expectedId: String(body?.expected_id || '').trim(),
        expectedUpdatedDate: String(body?.expected_updated_date || '').trim(),
        label: 'Quote approval threshold',
      });
      return Response.json({
        success: true,
        threshold: next,
        status: result?.status || 'updated',
        record: recordView(result?.record),
      });
    }

    return Response.json({ error: 'Invalid quote approval settings action.' }, { status: 400 });
  } catch (error: any) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 401, 403, 404, 409].includes(status) ? status : 500;
    if (safeStatus === 500) console.error('manageQuoteApprovalSettings error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Quote approval settings could not be saved safely.' : error?.message,
    }, { status: safeStatus });
  }
});
