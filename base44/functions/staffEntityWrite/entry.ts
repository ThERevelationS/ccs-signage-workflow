import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { coerceToDeclaredScalars } from '../../shared/entityWriteTypeGuard.ts';

// Session-authenticated write gateway for staff-tier entities. Entity RLS is
// backend-only now, so every staff-facing mutation flows through this narrow
// path: a valid sign-shop session is required, the entity/operation must be
// explicitly allowed below, and operator-style keys ($set, $where, ...) are
// rejected at any depth so the payload can only ever describe a plain record.
const WRITE_OPS: Record<string, Set<string>> = {
  AllInOneEstimate: new Set(['updateMany', 'delete']),
  BuilderPart: new Set(['create', 'updateMany']),
  BuilderPartGroup: new Set(['updateMany']),
  BuilderProduct: new Set(['create', 'updateMany']),
  BrickStoneProject: new Set(['create']),
  ChannelLetterInstallEquipment: new Set(['updateMany', 'deleteMany']),
  ChecklistSubItem: new Set(['create', 'updateMany', 'deleteMany']),
  CustomItemsProject: new Set(['create', 'update', 'updateMany', 'delete']),
  Inventory: new Set(['create', 'updateMany']),
  Customer: new Set(['updateMany']),
  CustomerLocation: new Set(['create', 'updateMany']),
  FoundationProject: new Set(['create', 'updateMany']),
  FoundationInventory: new Set(['create', 'updateMany', 'deleteMany']),
  // GeneralTask is backend-only RLS — the CAS helpers (updateGeneralTaskIfUn-
  // changed/deleteGeneralTaskIfUnchanged) drive updateMany/deleteMany, and the
  // plain update/delete pair covers the simple paths. Staff-wide: general
  // office tasks are shared objects, not per-user rows.
  GeneralTask: new Set(['create', 'update', 'updateMany', 'delete', 'deleteMany']),
  GlobalSettings: new Set(['updateMany']),
  ImportJob: new Set(['create', 'update']),
  InventoryCostHistory: new Set(['create']),
  JurisdictionProfile: new Set(['create', 'update']),
  LaborLevel: new Set(['create', 'updateMany', 'delete']),
  MachineRate: new Set(['create', 'updateMany', 'delete']),
  PermitLocality: new Set(['create', 'update']),
  SourceCollectionQueue: new Set(['create', 'updateMany']),
  PermitResolutionRule: new Set(['create', 'update', 'updateMany']),
  SignageFact: new Set(['create', 'update']),
  SignageFactIndex: new Set(['create', 'update', 'updateMany']),
  SignageFact: new Set(['create', 'update']),
  SignageFactIndex: new Set(['create', 'update', 'updateMany']),
  SignageFact: new Set(['create', 'update']),
  SignageFactIndex: new Set(['create', 'update', 'updateMany']),
  SignageFact: new Set(['create', 'update']),
  SignageFactIndex: new Set(['create', 'update', 'updateMany']),
  SignageFact: new Set(['create', 'update']),
  SignageFactIndex: new Set(['create', 'update', 'updateMany']),
  LegacyMigrationMap: new Set(['create']),
  // CRM event queue rows live on OpportunityActivity: staff create typed
  // contact events and close them out with the same single-record
  // conditional updateMany every other estimator entity uses here.
  OpportunityActivity: new Set(['create', 'updateMany']),
  PermitLineItem: new Set(['create', 'update', 'updateMany', 'delete']),
  PermittingWorkflowDraft: new Set(['create', 'update']),
  PricingTierMatrix: new Set(['create', 'updateMany', 'delete']),
  RegulationAlert: new Set(['update', 'delete']),
  SavedQueueView: new Set(['create', 'updateMany', 'delete']),
  SalesLocation: new Set(['create', 'update']),
  SipChecklistTemplate: new Set(['create', 'update', 'delete']),
  WorkOrder: new Set(['create', 'updateMany']),
  TaxGroup: new Set(['create', 'update', 'delete']),
  MarkupTier: new Set(['create', 'update']),

  // Estimator/queue registries (masterplan A-29). Reference-data writes are
  // admin-gated below; audit/timer rows are staff-writeable because the
  // surfaces that emit them run under any staff session.
  CatalogPartGroup: new Set(['create', 'updateMany', 'delete']),
  CrmEventType: new Set(['create', 'updateMany', 'delete']),
  GlobalPricingTier: new Set(['create', 'updateMany', 'delete']),
  Machine: new Set(['create', 'updateMany', 'delete']),
  ModifierOption: new Set(['create', 'updateMany', 'delete']),
  OriginationNode: new Set(['create', 'updateMany', 'delete']),
  PricingModifier: new Set(['create', 'updateMany', 'delete']),
  PricingTemplate: new Set(['create', 'updateMany', 'delete']),
  ProductActivity: new Set(['create']),
  ProductSubstatus: new Set(['create', 'updateMany', 'delete']),
  Responsibility: new Set(['create', 'updateMany', 'delete']),
  WorkOrderTimeEntry: new Set(['create', 'updateMany']),
  COGSAccount: new Set(['create', 'updateMany', 'delete']),
  IncomeAccount: new Set(['create', 'updateMany', 'delete']),
  TaxAgency: new Set(['create', 'updateMany', 'delete']),
  // J-02 report catalog: definition rows (FeatureReport rows carrying
  // report_key) are admin-managed reference data — same CAS write lane as
  // the other registries. Reads stay admin-tier in staffDataRead.
  FeatureReport: new Set(['create', 'updateMany', 'deleteMany']),
};

// Registry/config entities whose writes are restricted to admins (GL accounts,
// tax agencies, pricing configuration, queue reference data). Reads stay
// staff-tier in staffDataRead; mutation is admin-only like TaxGroup.
const ADMIN_ONLY_WRITE = new Set([
  'FoundationInventory',
  'COGSAccount',
  'IncomeAccount',
  'TaxAgency',
  'PermitResolutionRule',
  'CatalogPartGroup',
  'CrmEventType',
  'GlobalPricingTier',
  'Machine',
  'ModifierOption',
  'OriginationNode',
  'PricingModifier',
  'PricingTemplate',
  'ProductSubstatus',
  'Responsibility',
  'FeatureReport',
  // F-24: pricing/labor/import config — the new admin tabs gate these UI-side,
  // but the gateway must fail closed the same way for non-admin sessions.
  'LaborLevel',
  'BuilderPartGroup',
  'ImportJob',
]);

function rejectOperatorKeys(value: unknown, path = 'data'): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith('$')) {
      throw Object.assign(new Error(`Operator-style field "${path}.${key}" is not allowed.`), { status: 400 });
    }
    rejectOperatorKeys(val, `${path}.${key}`);
  }
}

const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { status });

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    if (!user?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });

    const entityName = String(body?.entity || '').trim();
    const op = String(body?.op || '').trim();
    const allowed = WRITE_OPS[entityName];
    if (!allowed || !allowed.has(op)) {
      return Response.json({ error: 'This record type cannot be written here.' }, { status: 403 });
    }
    // New jurisdiction records are created only through the admin draft flow —
    // the UI gates this already; the server must fail closed the same way.
    if (entityName === 'PermitLocality' && (op === 'create' || op === 'update') && user.role !== 'admin') {
      // Sole non-admin exception: "Apply when verified" queues a deferred office
      // apply as pending_applies on the locality — staff may write ONLY that
      // field, and only as an array of well-formed entries. Everything else
      // about the jurisdiction record stays admin-locked.
      const pd = body?.data;
      const pkeys = pd && typeof pd === 'object' && !Array.isArray(pd) ? Object.keys(pd) : [];
      const PENDING_APPLY_KEYS = new Set(['work_order_id', 'requested_by', 'requested_at', 'exclude_electrical', 'skip_office_keys']);
      const pendingAppliesOnly = op === 'update'
        && pkeys.length === 1 && pkeys[0] === 'pending_applies'
        && Array.isArray((pd as any)?.pending_applies)
        && (pd as any).pending_applies.length <= 100
        && (pd as any).pending_applies.every((p: any) =>
          p && typeof p === 'object' && !Array.isArray(p)
          && Object.keys(p).every((k: string) => PENDING_APPLY_KEYS.has(k))
          && typeof p.work_order_id === 'string' && p.work_order_id.trim().length > 0 && p.work_order_id.length <= 64
          && (p.requested_by === undefined || (typeof p.requested_by === 'string' && p.requested_by.length <= 200))
          && (p.requested_at === undefined || (typeof p.requested_at === 'string' && p.requested_at.length <= 40))
          && (p.exclude_electrical === undefined || typeof p.exclude_electrical === 'boolean')
          && (p.skip_office_keys === undefined || (Array.isArray(p.skip_office_keys) && p.skip_office_keys.length <= 50 && p.skip_office_keys.every((k: any) => typeof k === 'string' && k.length <= 120))));
      if (!pendingAppliesOnly) {
        return Response.json({ error: 'Only administrators can edit jurisdictions.' }, { status: 403 });
      }
    }
    // Tax rates feed every quote's tax_percent — admin-gated like jurisdictions.
    if ((entityName === 'TaxGroup' || entityName === 'MarkupTier' || ADMIN_ONLY_WRITE.has(entityName)) && user.role !== 'admin') {
      return Response.json({ error: `Only administrators can manage ${entityName} records.` }, { status: 403 });
    }
    if (entityName === 'SalesLocation' && user.role !== 'admin') {
      return Response.json({ error: 'Only administrators can manage locations.' }, { status: 403 });
    }
    // Research-queue rows feed the permitting research backlog dispatch —
    // admin-gated like jurisdictions so only admins can schedule research.
    if (entityName === 'SourceCollectionQueue' && user.role !== 'admin') {
      return Response.json({ error: 'Only administrators can queue permitting research.' }, { status: 403 });
    }

    const data = body?.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : {};
    if (JSON.stringify(data).length > 200000) throw bad('Record payload is too large.');
    rejectOperatorKeys(data);
    // Identity/system fields are never client-supplied.
    for (const f of ['id', 'created_date', 'updated_date', 'created_by']) delete (data as any)[f];
    // SavedQueueView ownership is server-authoritative — the session email is
    // stamped, never trusted from the payload, so one staff session cannot
    // create views in another user's name.
    if (entityName === 'SavedQueueView' && op === 'create') {
      (data as any).owner_email = String(user.email);
      (data as any).user_email = String(user.email);
    }

    if (entityName === 'MarkupTier' && (op === 'create' || op === 'update')) {
      const tierNum = Math.floor(Number(data?.tier_number));
      if (!Number.isInteger(tierNum) || tierNum < 1 || tierNum > 8) throw bad('tier_number must be an integer 1-8.');
      if (!String(data?.tier_name || '').trim()) throw bad('tier_name is required.');
      if (data?.markups !== undefined && (typeof data.markups !== 'object' || data.markups === null || Array.isArray(data.markups))) throw bad('markups must be a {category_key: multiplier} object.');
      if (data?.markups) for (const [k, v] of Object.entries(data.markups)) {
        if (!Number.isFinite(Number(v)) || Number(v) <= 0 || Number(v) > 100) throw bad(`markups.${k} must be a multiplier between 0 and 100.`);
      }
    }
    if (entityName === 'TaxGroup' && (op === 'create' || op === 'update')) {
      const pct = Number(data?.tax_percent ?? 0);
      // Rows written before the group_name convention carried `name` — normalize either.
      if (!data?.group_name && data?.name) (data as any).group_name = data.name;
      delete (data as any).name;
      if (!String(data?.group_name || '').trim()) return Response.json({ error: 'Tax group needs a name.' }, { status: 400 });
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) return Response.json({ error: 'Tax percent must be between 0 and 100.' }, { status: 400 });
      (data as any).group_name = String(data.group_name).trim().slice(0, 120);
      (data as any).tax_percent = Math.round(pct * 1000) / 1000;
    }

    const entity = (base44.asServiceRole.entities as any)[entityName];
    if (!entity) throw bad('Unknown record type.');

    // WS-7: normalize array-into-scalar fields (assigned_to: ["name"]) to the
    // declared type before they can poison reads. Throws 400 on multi-element
    // arrays so the caller bug surfaces loudly instead of silently truncating.
    const coercedFields = coerceToDeclaredScalars(entityName, data);
    if (coercedFields.length) console.log(`staffEntityWrite coerced scalar fields on ${entityName}: ${coercedFields.join(', ')}`);

    // Office-authority roles are a fixed vocabulary — a write carrying an
    // unknown role string (typo, merged types) must not land. Keeps
    // electrical issuer/inspector and city/township roles strictly separate.
    const KNOWN_ROLES = new Set(['sign_permit', 'zoning', 'building', 'electrical', 'electrical_permit', 'electrical_inspection', 'right_of_way', 'historic_review', 'planning', 'transportation', 'other']);
    const badRole = (roles: any[]) => (Array.isArray(roles) ? roles : []).find((r: any) => typeof r === 'string' && r.trim() && !KNOWN_ROLES.has(r));
    if (entityName === 'PermitLineItem' && (op === 'create' || op === 'update')) {
      const bad = badRole(data?.office_types || []);
      if (bad) return Response.json({ error: `Unknown office role "${bad}" — must be one of: ${[...KNOWN_ROLES].join(', ')}.` }, { status: 400 });
    }
    if (entityName === 'PermitLocality' && (op === 'create' || op === 'update') && Array.isArray(data?.offices)) {
      const bad = data.offices.map((o: any) => badRole(o?.authority_roles || [])).find(Boolean);
      if (bad) return Response.json({ error: `Unknown office role "${bad}" — must be one of: ${[...KNOWN_ROLES].join(', ')}.` }, { status: 400 });
    }

    // Evidence-gated verification: a jurisdiction can't be marked 'verified'
    // without a usable source — a document or an office portal link. Keeps
    // unapproved findings from being presented as confirmed truth.
    if (entityName === 'JurisdictionProfile' && op === 'update' && data?.verification_status === 'verified') {
      const hasDoc = Array.isArray(data?.documents) && data.documents.length > 0;
      const hasOfficeSource = Array.isArray(data?.offices) && data.offices.some((o: any) => String(o?.portal_url || o?.source_url || '').trim());
      const hasManualDoc = data?._manual_documents && Object.keys(data._manual_documents).length > 0;
      if (!hasDoc && !hasOfficeSource && !hasManualDoc) {
        return Response.json({ error: 'A jurisdiction can only be marked verified with at least one usable source — a document or an office portal link.' }, { status: 400 });
      }
    }

    if (op === 'create') {
      // Jurisdiction drafts are name+state-unique: a double-submit or racing
      // session must converge on one row instead of minting duplicates.
      if (entityName === 'PermitLocality') {
        const rawName = String(data?.name || '').trim();
        const wantName = rawName.toLowerCase();
        const wantState = String(data?.state || '').trim().toLowerCase();
        if (rawName) {
          const dup = await entity.filter({ name: rawName }, null, 50).catch(() => []);
          const wantProfile = String(data?.jurisdiction_profile_id || '').trim();
          const existing = (Array.isArray(dup) ? dup : []).find((r: any) =>
            String(r?.name || '').trim().toLowerCase() === wantName &&
            String(r?.state || '').trim().toLowerCase() === wantState &&
            // Same-name city/township/county rows are legitimately separate
            // jurisdictions — never dedupe across different linked profiles.
            (!wantProfile || !String(r?.jurisdiction_profile_id || '').trim() || String(r?.jurisdiction_profile_id).trim() === wantProfile)
          );
          if (existing?.id) return Response.json({ success: true, record: existing, deduplicated: true });
        }
      }
      const created = await entity.create(data);
      return Response.json({ success: true, record: created });
    }

    if (entityName === 'FoundationInventory' && op === 'deleteMany') {
      const query = body?.query;
      if (!query || typeof query !== 'object' || Array.isArray(query)
        || typeof query.id !== 'string' || !query.id.trim()
        || typeof query.updated_date !== 'string' || !query.updated_date.trim()
        || (body?.id !== undefined && body.id !== query.id)) {
        throw bad('A Foundation catalog conditional delete requires matching string id and updated_date anchors.');
      }
    }
    const catalogDeleteId = entityName === 'FoundationInventory' && op === 'deleteMany' ? body?.query?.id : '';
    const id = String(body?.id || catalogDeleteId || '').trim();
    if (!id) throw bad('Record id is required.');
    const current = await entity.get(id).catch(() => null);
    if (!current?.id) return Response.json({ error: 'Record not found.' }, { status: 404 });

    // SavedQueueView mutations are owner-only (admins excepted) — shared views
    // stay readable by every session but only their owner may edit or delete.
    if (entityName === 'SavedQueueView') {
      const owner = String((current as any)?.owner_email || (current as any)?.user_email || '').trim().toLowerCase();
      if (owner && owner !== String(user.email).toLowerCase() && user.role !== 'admin') {
        return Response.json({ error: 'Saved queue views can only be changed by their owner.' }, { status: 403 });
      }
      // Ownership is fixed at create — never rewritable through an update or a
      // $set patch, or a view could be "transferred" onto another user.
      delete (data as any).owner_email;
      delete (data as any).user_email;
      if (body?.update?.$set && typeof body.update.$set === 'object') {
        delete (body.update.$set as any).owner_email;
        delete (body.update.$set as any).user_email;
      }
    }

    if (op === 'update') {
      const expected = String(body?.expected_updated_date || '').trim();
      if (expected && expected !== String(current.updated_date || '')) {
        return Response.json({ error: 'This record changed in another session. Reload before saving.' }, { status: 409 });
      }
      // Jurisdiction edits keep an audit trail: who changed what, when.
      if (entityName === 'PermitLocality') {
        const changed = Object.keys(data).filter((f) => String(current?.[f] ?? '') !== String(data?.[f] ?? ''));
        if (changed.length) {
          const log = Array.isArray(current?.change_log) ? current.change_log.slice(-49) : [];
          log.push({ at: new Date().toISOString(), by: String(user.email || ''), changed_fields: changed });
          data.change_log = log;
        }
      }
      const saved = await entity.update(id, data);
      return Response.json({ success: true, record: saved });
    }

    if (op === 'updateMany') {
      // Narrow single-record conditional write mirroring the SDK's
      // updateMany({ id, updated_date }, { $set }) contract the front-end CAS
      // helpers use. Anything broader — extra query keys, operator queries, or
      // non-$set update shapes — would become a bulk-edit oracle, so it is
      // rejected outright.
      const query = body?.query;
      const update = body?.update;
      if (entityName === 'FoundationProject' && (typeof query?.id !== 'string' || typeof query?.updated_date !== 'string')) {
        throw bad('A foundation conditional update requires string id and updated_date values.');
      }
      const queryKeys = query && typeof query === 'object' && !Array.isArray(query) ? Object.keys(query) : [];
      const queryId = String((query as any)?.id || '').trim();
      const queryVersion = String((query as any)?.updated_date || '').trim();
      if (queryKeys.length !== 2 || !queryId || !queryVersion || queryId !== id) {
        throw bad('A conditional update must target exactly one record id and updated_date.');
      }
      const updateKeys = update && typeof update === 'object' && !Array.isArray(update) ? Object.keys(update) : [];
      if (updateKeys.length !== 1 || updateKeys[0] !== '$set') {
        throw bad('Only $set updates are allowed here.');
      }
      const patch = (update as any).$set;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw bad('An update payload is required.');
      rejectOperatorKeys(patch);
      // Identity/system fields are never client-supplied.
      for (const f of ['id', 'created_date', 'updated_date', 'created_by']) delete (patch as any)[f];
      coerceToDeclaredScalars(entityName, patch);
      const result = await entity.updateMany({ id: queryId, updated_date: queryVersion }, { $set: patch });
      return Response.json({ success: true, result });
    }

    if (op === 'deleteMany') {
      // Client deleteMany is only used for CAS deletes ({id, updated_date,
      // ...guardFields}). Refuse unanchored queries so a staff caller can never
      // turn this op into a bulk table wipe.
      const delQuery = body?.query;
      if (
        !delQuery || typeof delQuery !== 'object' || Array.isArray(delQuery)
        || !String((delQuery as Record<string, unknown>).id || '').trim()
        || !String((delQuery as Record<string, unknown>).updated_date || '').trim()
      ) {
        throw bad('deleteMany requires an id and updated_date anchored query.');
      }
      rejectOperatorKeys(delQuery, 'query');
      const result = await entity.deleteMany(delQuery);
      return Response.json({ success: true, result });
    }

    if (op === 'delete') {
      // A jurisdiction with linked permit lines can't be deleted — the jobs
      // would orphan. Relink the lines to another locality first.
      if (entityName === 'PermitLocality') {
        const linked = await base44.asServiceRole.entities.PermitLineItem.filter({ locality_id: id, deleted: { $ne: true } }, null, 5, 0).catch(() => []);
        if (Array.isArray(linked) && linked.length) {
          return Response.json({ error: `This jurisdiction is still linked to ${linked.length === 5 ? '5+' : linked.length} job line(s). Relink them before deleting it.` }, { status: 409 });
        }
      }
      await entity.delete(id);
      return Response.json({ success: true, deleted: true });
    }

    throw bad('Unsupported operation.');
  } catch (error: any) {
    const status = Number(error?.status || 500);
    if ([400, 401, 403, 404, 409, 429].includes(status)) {
      return Response.json({ error: error?.message || 'Write failed.' }, { status });
    }
    console.error('staffEntityWrite error:', error);
    return Response.json({ error: 'The record could not be saved. Try again.' }, { status: 500 });
  }
});