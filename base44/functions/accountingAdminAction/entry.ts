import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import {
  createFoundationRecordWithRecovery,
} from '../../shared/opportunityFoundationPersistence.mjs';

const clean = (value: any) => String(value ?? '').trim();

// Session-authenticated gateway for back-office accounting admin tasks.
// IncomeAccount and COGSAccount both carry backend-only RLS, so every
// staff-facing read/write flows through here: a valid sign-shop session is
// required and writes go through base44.asServiceRole.entities.

// seed_gl_accounts installs the standard flat chart of accounts idempotently —
// each row carries a stable creation_request_key (seed-income-4000 /
// seed-cogs-5000) written through createFoundationRecordWithRecovery, so a
// retried or re-run seed verifies the existing row and creates zero duplicates.
const INCOME_SEED_ROWS = [
  { code: '4000', name: 'Sales Income' },
  { code: '4100', name: 'Sign Income' },
  { code: '4200', name: 'Service Income' },
  { code: '4300', name: 'Installation Income' },
  { code: '4400', name: 'Shipping & Freight Income' },
  { code: '4500', name: 'Discounts Taken' },
  { code: '4900', name: 'Other Income' },
];

const COGS_SEED_ROWS = [
  { code: '5000', name: 'Materials COGS' },
  { code: '5100', name: 'Substrate COGS' },
  { code: '5200', name: 'Vinyl & Media COGS' },
  { code: '5300', name: 'Ink & Consumables COGS' },
  { code: '5400', name: 'Hardware & Fasteners COGS' },
  { code: '5500', name: 'Labor COGS' },
  { code: '5600', name: 'Subcontracted Work COGS' },
  { code: '5900', name: 'Other COGS' },
];

const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { statusCode: status });

async function seedAccountRows({ entity, entityName, seedKey, rows, actor }: any) {
  // Sequential creates keep the shared entity-read budget calm and make the
  // per-row outcome order deterministic for the response audit trail.
  const out: any[] = [];
  let created = 0;
  let existing = 0;
  for (const row of rows) {
    const code = clean(row?.code);
    const name = clean(row?.name);
    if (!code || !name) throw bad(`${entityName} seed row is missing a code or name.`, 500);
    const creationKey = `seed-${seedKey}-${code}`;
    const result = await createFoundationRecordWithRecovery({
      entity,
      data: {
        creation_request_key: creationKey,
        schema_version: 1,
        code,
        name,
        status: 'active',
        updated_by: actor,
      },
      readMatches: () => entity.filter({ creation_request_key: creationKey }),
      label: `${entityName} seed ${code}`,
    });
    const wasCreated = result.status === 'created' || result.status === 'recovered';
    if (wasCreated) created += 1;
    else existing += 1;
    out.push({
      code,
      name,
      entity: entityName,
      status: wasCreated ? 'created' : 'existing',
    });
  }
  return { created, existing, rows: out };
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email) || clean(user?.id) || 'unknown';
    const action = clean(body?.action);
    if (!action) throw bad('An action is required.');

    const IncomeAccount = base44.asServiceRole.entities.IncomeAccount;
    const COGSAccount = base44.asServiceRole.entities.COGSAccount;

    if (action === 'seed_gl_accounts') {
      const income = await seedAccountRows({
        entity: IncomeAccount,
        entityName: 'IncomeAccount',
        seedKey: 'income',
        rows: INCOME_SEED_ROWS,
        actor,
      });
      const cogs = await seedAccountRows({
        entity: COGSAccount,
        entityName: 'COGSAccount',
        seedKey: 'cogs',
        rows: COGS_SEED_ROWS,
        actor,
      });
      return Response.json({
        success: true,
        action,
        income_created: income.created,
        income_existing: income.existing,
        cogs_created: cogs.created,
        cogs_existing: cogs.existing,
        rows: [...income.rows, ...cogs.rows],
      });
    }

    throw bad('Unknown accounting admin action.');
  } catch (error: any) {
    const status = Number(error?.statusCode || error?.status || 500);
    if ([400, 401, 403, 404, 409, 429].includes(status)) {
      return Response.json({ error: error?.message || 'Accounting admin action failed.' }, { status });
    }
    console.error('accountingAdminAction error:', error);
    return Response.json({ error: 'The accounting admin action could not be completed. Try again.' }, { status });
  }
});
