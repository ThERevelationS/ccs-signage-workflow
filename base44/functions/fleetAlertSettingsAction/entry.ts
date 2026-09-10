import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';

const SUPPORTED_RULES = new Set(['speed', 'fuel_level']);
const normalizeVin = (value: unknown) => String(value || '').trim().toUpperCase();

async function requireAdmin(base44: any) {
  const user = await base44.auth.me().catch(() => null);
  if (!user?.email) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role === 'admin') return { user };
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: user.email });
  if (rows?.[0]?.role !== 'admin') return { error: Response.json({ error: 'Fleet alert settings require a CCS admin.' }, { status: 403 }) };
  return { user };
}

function cleanRule(input: any) {
  const key = String(input?.rule_key || '').trim();
  if (!SUPPORTED_RULES.has(key)) throw new Error(`Unsupported CCS Fleet alert rule: ${key || 'missing rule key'}`);
  const enabled = input?.enabled === true;
  const rawThreshold = input?.threshold;
  const hasThreshold = rawThreshold !== '' && rawThreshold != null;
  const threshold = hasThreshold ? Number(rawThreshold) : null;
  if (hasThreshold && !Number.isFinite(threshold)) throw new Error(`${key} threshold must be a number.`);
  if (enabled && threshold == null) throw new Error(`${key} threshold is required when the rule is enabled.`);
  if (key === 'speed' && threshold != null && (threshold < 1 || threshold > 150)) throw new Error('Speed threshold must be between 1 and 150 mph.');
  if (key === 'fuel_level' && threshold != null && (threshold < 1 || threshold > 100)) throw new Error('Fuel threshold must be between 1% and 100%.');
  return { rule_key: key, enabled, threshold };
}

function effectiveRule(vehicleRows: any[], globalRows: any[], key: string) {
  const vehicle = vehicleRows.find(row => row.rule_key === key) || null;
  if (vehicle) return { ...vehicle, inherited: false, source: 'vehicle' };
  const global = globalRows.find(row => row.rule_key === key) || null;
  if (global) return { ...global, inherited: true, source: 'global' };
  return { rule_key: key, enabled: false, threshold: null, inherited: false, source: 'default' };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await requireAdmin(base44);
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const vin = normalizeVin(body?.vehicle_vin);
    if (!vin || vin.length > 32) return Response.json({ error: 'A valid vehicle VIN is required.' }, { status: 400 });

    const Settings = base44.asServiceRole.entities.FleetAlertSetting;
    const [vehicleRows, globalRows] = await Promise.all([
      Settings.filter({ scope: 'vehicle', vehicle_vin: vin }),
      Settings.filter({ scope: 'global' }),
    ]);

    for (const key of SUPPORTED_RULES) {
      const vehicleDuplicates = (vehicleRows || []).filter((row: any) => row.rule_key === key);
      if (vehicleDuplicates.length > 1) return Response.json({ error: `Multiple vehicle-specific ${key} alert rows exist for ${vin}. Resolve the duplicate settings before editing.` }, { status: 409 });
      const globalDuplicates = (globalRows || []).filter((row: any) => row.rule_key === key);
      if (globalDuplicates.length > 1) return Response.json({ error: `Multiple global ${key} Fleet alert rows exist. Resolve the duplicate settings before editing vehicle overrides.` }, { status: 409 });
    }

    if (action === 'get') {
      return Response.json({
        success: true,
        vehicle_vin: vin,
        rules: Array.from(SUPPORTED_RULES).map(key => effectiveRule(vehicleRows || [], globalRows || [], key)),
      });
    }

    if (action !== 'save_vehicle') return Response.json({ error: "Unknown action. Use 'get' or 'save_vehicle'." }, { status: 400 });
    if (!Array.isArray(body?.rules)) return Response.json({ error: 'rules must be an array.' }, { status: 400 });

    const cleaned = body.rules.map(cleanRule);
    const suppliedKeys = new Set(cleaned.map((rule: any) => rule.rule_key));
    if (suppliedKeys.size !== SUPPORTED_RULES.size || Array.from(SUPPORTED_RULES).some(key => !suppliedKeys.has(key))) {
      return Response.json({ error: 'Save both supported CCS Fleet rules together.' }, { status: 400 });
    }

    const saved: any[] = [];
    for (const rule of cleaned) {
      const existing = (vehicleRows || []).find((row: any) => row.rule_key === rule.rule_key) || null;
      const patch: any = {
        scope: 'vehicle',
        vehicle_vin: vin,
        rule_key: rule.rule_key,
        enabled: rule.enabled,
        notes: 'Managed from CCS Fleet Tracking alert settings.',
      };
      // Disabled rules may omit a threshold. Do not write null into an optional numeric field;
      // an existing threshold can remain dormant and becomes relevant only if the rule is enabled again.
      if (rule.threshold != null) patch.threshold = rule.threshold;
      saved.push(existing ? await Settings.update(existing.id, patch) : await Settings.create(patch));
    }

    return Response.json({ success: true, vehicle_vin: vin, rules: saved });
  } catch (error) {
    console.error('fleetAlertSettingsAction error:', error);
    return Response.json({ error: error?.message || 'Fleet alert settings could not be saved.' }, { status: 500 });
  }
});