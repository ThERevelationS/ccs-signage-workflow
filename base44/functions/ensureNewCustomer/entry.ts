import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ALLOWED_FIELDS = new Set([
  'company_name',
  'company_phone',
  'contact_first_name',
  'contact_last_name',
  'contact_email',
  'contact_office_phone',
  'contact_office_ext',
  'billing_address_1',
  'billing_city',
  'billing_state',
  'billing_postal_code',
  'terms',
  'pricing_tier',
]);

const CUSTOMER_REFERENCE_ENTITIES = [
  'VinylProject',
  'Order',
  'ChannelLetterInstallation',
  'WorkOrder',
  'MaintenanceProject',
  'Project',
  'CNCProject',
  'MetalProject',
  'FoundationProject',
  'AllInOneEstimate',
  'LaserProject',
  'CustomerNote',
  'BrickStoneProject',
  'CustomerSummary',
];

const clean = (value: unknown) => String(value || '').trim();

const normalize = (value: any): any => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result: any, key) => {
      if (value[key] !== undefined) result[key] = normalize(value[key]);
      return result;
    }, {});
  }
  return value;
};

const sameTarget = (row: any = {}, target: any = {}) => {
  const projected: any = {};
  for (const key of Object.keys(target)) projected[key] = row?.[key];
  return JSON.stringify(normalize(projected)) === JSON.stringify(normalize(target));
};

const canonicalRow = (rows: any[] = []) => rows.slice().sort((a, b) => {
  const aTime = Date.parse(a?.created_date || a?.updated_date || '') || 0;
  const bTime = Date.parse(b?.created_date || b?.updated_date || '') || 0;
  if (aTime !== bTime) return aTime - bTime;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
})[0] || null;

async function customerReference(base44: any, customerId: string) {
  for (const entityName of CUSTOMER_REFERENCE_ENTITIES) {
    const entity = base44.asServiceRole.entities[entityName];
    if (!entity?.filter) continue;
    const rows = await entity.filter({ customer_id: customerId });
    if ((rows || []).length) return entityName;
  }
  return '';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const creationKey = clean(body?.creation_key);
    const input = body?.customer && typeof body.customer === 'object' ? body.customer : {};
    if (!creationKey || creationKey.length > 256) {
      return Response.json({ error: 'A valid Customer creation key is required.' }, { status: 400 });
    }

    const customer: any = {};
    for (const [key, value] of Object.entries(input)) {
      if (ALLOWED_FIELDS.has(key)) customer[key] = value;
    }
    customer.company_name = clean(customer.company_name);
    customer.pricing_tier = Number.isFinite(Number(customer.pricing_tier)) ? Number(customer.pricing_tier) : 1;
    customer.customer_status = 'prospect';
    customer.is_active = true;
    customer.creation_request_key = creationKey;

    if (!customer.company_name) {
      return Response.json({ error: 'Customer company name is required.' }, { status: 400 });
    }

    const CustomerUser = base44.entities.Customer;
    const CustomerService = base44.asServiceRole.entities.Customer;
    const readKeyedRows = async () => CustomerService.filter({ creation_request_key: creationKey });
    const validateRows = (rows: any[] = []) => {
      const mismatches = (rows || []).filter((row: any) => !sameTarget(row, customer));
      if (mismatches.length) {
        throw Object.assign(new Error('This Customer creation receipt is already associated with different Customer data. No Customer was changed.'), { statusCode: 409 });
      }
      return canonicalRow(rows || []);
    };

    let rows = await readKeyedRows();
    const existing = validateRows(rows || []);
    if (existing?.id) return Response.json({ customer: existing, reused: true });

    let created;
    try {
      created = await CustomerUser.create(customer);
    } catch (createError) {
      rows = await readKeyedRows().catch(() => []);
      const recovered = validateRows(rows || []);
      if (recovered?.id) return Response.json({ customer: recovered, reused: true, recovered_after_create_error: true });
      throw createError;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
    rows = await readKeyedRows();
    const canonical = validateRows(rows || []) || created;

    if (canonical?.id && created?.id && canonical.id !== created.id) {
      const losingRows = await CustomerService.filter({ id: created.id });
      if (!Array.isArray(losingRows) || losingRows.length > 1) {
        return Response.json({ error: 'The losing duplicate Customer could not be re-read safely. No uncertain Customer was deleted.' }, { status: 409 });
      }
      const losing = losingRows[0] || null;
      if (losing?.id) {
        const referencedBy = await customerReference(base44, losing.id);
        if (referencedBy) {
          return Response.json({
            error: `A simultaneous duplicate Customer was detected, but the losing row is already referenced by ${referencedBy}. No Customer was deleted.`,
          }, { status: 409 });
        }
        const losingVersion = String(losing.updated_date || '').trim();
        if (!losingVersion) {
          return Response.json({ error: 'The losing duplicate Customer has no version metadata. No uncertain Customer was deleted.' }, { status: 409 });
        }
        let deleted;
        try {
          deleted = await CustomerService.deleteMany({
            id: losing.id,
            creation_request_key: creationKey,
            updated_date: losingVersion,
          });
        } catch (deleteError) {
          const afterError = await CustomerService.filter({ id: losing.id }).catch(() => null);
          if (!Array.isArray(afterError) || afterError.length !== 0) throw deleteError;
          deleted = { deleted: 1 };
        }
        if (!deleted || deleted.deleted !== 1) {
          const afterDelete = await CustomerService.filter({ id: losing.id }).catch(() => null);
          if (!Array.isArray(afterDelete) || afterDelete.length !== 0) {
            return Response.json({ error: 'The losing duplicate Customer changed before cleanup. No uncertain Customer was deleted; reload before retrying.' }, { status: 409 });
          }
        }
      }
      return Response.json({ customer: canonical, reused: true, concurrent_duplicate_discarded: true });
    }

    return Response.json({ customer: canonical, reused: false });
  } catch (error) {
    console.error('ensureNewCustomer error:', error);
    const status = Number(error?.statusCode || 500);
    return Response.json({ error: error?.message || 'Customer could not be created safely.' }, { status });
  }
});