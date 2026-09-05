import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CUSTOMER_FIELDS = new Set([
  'company_phone',
  'contact_office_phone',
  'contact_first_name',
  'contact_last_name',
  'contact_email',
  'contact_office_ext',
  'salesperson',
  'location',
  'default_tax_group',
  'terms',
  'location_address_1',
  'billing_address_1',
  'notes',
  'legacy_client_names',
]);

const CUSTOMER_PAGE_SIZE = 500;
const CUSTOMER_VERIFY_LIMIT = 50000;

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

const norm = (value: unknown) => String(value || '').trim().toLowerCase();

const canonicalRow = (rows: any[] = []) => rows.slice().sort((a, b) => {
  const aTime = Date.parse(a?.created_date || a?.updated_date || '') || 0;
  const bTime = Date.parse(b?.created_date || b?.updated_date || '') || 0;
  if (aTime !== bTime) return aTime - bTime;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
})[0] || null;

const cleanFields = (input: any = {}) => Object.fromEntries(
  Object.entries(input || {}).filter(([key]) => CUSTOMER_FIELDS.has(key))
);

const matchesCustomerName = (row: any, normalizedName: string) => {
  if (norm(row?.company_name) === normalizedName) return true;
  return (row?.legacy_client_names || []).some((value: unknown) => norm(value) === normalizedName);
};

async function findHistoricalMatch(CustomerService: any, normalizedName: string) {
  // Legacy aliases live inside each Customer record, so an exact company-name
  // filter alone is insufficient. Page through the full catalog with the same
  // Base44 list(sort, limit, skip) contract already used by other backends.
  // New rows sort to the end by created_date, which also keeps this scan stable
  // if another Customer is added while verification is in progress.
  const matches: any[] = [];
  let skip = 0;
  while (skip < CUSTOMER_VERIFY_LIMIT) {
    const page = await CustomerService.list('created_date', CUSTOMER_PAGE_SIZE, skip);
    if (!Array.isArray(page)) {
      throw new Error('The Customer catalog could not be verified safely. No Customer was created.');
    }
    for (const row of page) {
      if (matchesCustomerName(row, normalizedName)) matches.push(row);
    }
    if (page.length < CUSTOMER_PAGE_SIZE) return canonicalRow(matches);
    skip += CUSTOMER_PAGE_SIZE;
  }
  throw new Error(`The Customer catalog exceeds the ${CUSTOMER_VERIFY_LIMIT.toLocaleString()}-record verification safety limit. No Customer was created.`);
}

async function hasAnyCustomerReference(base44: any, customerId: string) {
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
    const companyName = String(body?.company_name || '').trim();
    const normalizedName = norm(companyName);
    if (!companyName || !normalizedName) {
      return Response.json({ error: 'Customer company name is required.' }, { status: 400 });
    }

    const fields = cleanFields(body?.fields || {});
    const updateExisting = body?.update_existing !== false;
    const creationKey = `estimate_customer:${normalizedName}`;
    const CustomerUser = base44.entities.Customer;
    const CustomerService = base44.asServiceRole.entities.Customer;

    // Never retrofit creation receipts onto historical rows. If the live catalog
    // already contains this company/legacy name, preserve that record and simply
    // apply the same estimator fields the old client path would have written.
    const historical = await findHistoricalMatch(CustomerService, normalizedName);
    if (historical?.id) {
      if (updateExisting && Object.keys(fields).length) await CustomerUser.update(historical.id, fields);
      return Response.json({ customer: updateExisting ? { ...historical, ...fields } : historical, reused: true, historical_match: true });
    }

    // A retry after a lost create response can find the estimator-created row by
    // receipt before attempting another create.
    let keyedRows = await CustomerService.filter({ estimator_creation_key: creationKey });
    const keyedMismatches = (keyedRows || []).filter((row: any) => norm(row?.company_name) !== normalizedName);
    if (keyedMismatches.length) {
      return Response.json({ error: 'A Customer creation receipt is already associated with a different company name. No Customer was changed.' }, { status: 409 });
    }
    const keyedExisting = canonicalRow(keyedRows || []);
    if (keyedExisting?.id) {
      if (updateExisting && Object.keys(fields).length) await CustomerUser.update(keyedExisting.id, fields);
      return Response.json({ customer: updateExisting ? { ...keyedExisting, ...fields } : keyedExisting, reused: true });
    }

    const created = await CustomerUser.create({
      company_name: companyName,
      customer_status: 'prospect',
      estimator_creation_key: creationKey,
      ...fields,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    keyedRows = await CustomerService.filter({ estimator_creation_key: creationKey });
    const mismatchedAfterCreate = (keyedRows || []).filter((row: any) => norm(row?.company_name) !== normalizedName);
    if (mismatchedAfterCreate.length) {
      return Response.json({ error: 'Customer creation could not safely converge because the creation receipt matched a different company name.' }, { status: 409 });
    }
    const canonical = canonicalRow(keyedRows || []) || created;

    if (canonical?.id && created?.id && canonical.id !== created.id) {
      // Delete only the row created by this request, only when it is still an
      // unreferenced race duplicate. Never merge/delete historical Customers.
      const referencedBy = await hasAnyCustomerReference(base44, created.id);
      if (referencedBy) {
        return Response.json({ error: `A simultaneous Customer duplicate was detected, but the losing row is already referenced by ${referencedBy}. No Customer was deleted.` }, { status: 409 });
      }
      await CustomerService.delete(created.id);
      if (updateExisting && Object.keys(fields).length) await CustomerUser.update(canonical.id, fields);
      return Response.json({
        customer: updateExisting ? { ...canonical, ...fields } : canonical,
        reused: true,
        concurrent_duplicate_discarded: true,
      });
    }

    return Response.json({ customer: canonical, reused: false });
  } catch (error) {
    console.error('ensureEstimateCustomer error:', error);
    return Response.json({ error: error?.message || 'Customer could not be created safely.' }, { status: 500 });
  }
});
