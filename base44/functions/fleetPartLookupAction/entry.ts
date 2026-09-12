import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';

const nowIso = () => new Date().toISOString();
const norm = (value: unknown) => String(value ?? '').trim();
const normKey = (value: unknown) => norm(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
const uniqText = (value: unknown) => Array.isArray(value) ? [...new Set(value.map(item => norm(item)).filter(Boolean))] : [];
const canonical = (rows: any[] = []) => rows.slice().sort((a, b) => {
  const at = Date.parse(a?.created_date || '') || 0;
  const bt = Date.parse(b?.created_date || '') || 0;
  if (at !== bt) return at - bt;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
})[0] || null;

async function authorize(base44: any, adminRequired = false) {
  const user = await base44.auth.me().catch(() => null);
  if (!user?.email) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role === 'admin') return { user, admin: true };
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: user.email });
  const authorized = rows?.[0] || null;
  if (!authorized) return { error: Response.json({ error: 'This CCS account is not authorized for Fleet operations.' }, { status: 403 }) };
  if (adminRequired && authorized.role !== 'admin') return { error: Response.json({ error: 'Promoting or changing Fleet parts requires a CCS admin.' }, { status: 403 }) };
  return { user, admin: authorized.role === 'admin' };
}

function candidatePatch(source: any) {
  const out: any = {};
  const stringFields = [
    'query_text','detected_text','candidate_part_name','candidate_part_number','candidate_barcode_value',
    'candidate_category','candidate_subcategory','candidate_manufacturer','candidate_description',
    'candidate_specification','candidate_vendor','candidate_vendor_sku','candidate_vendor_url',
    'confidence','reasoning','verification_notes','compatibility_notes','storage_zone','storage_cabinet',
    'storage_shelf','storage_bin'
  ];
  for (const key of stringFields) if (Object.prototype.hasOwnProperty.call(source || {}, key)) out[key] = norm(source[key]);
  for (const key of ['uploaded_photo_urls','candidate_alternate_part_numbers','candidate_source_urls','suggested_equipment_ids','confirmed_equipment_ids']) {
    if (Object.prototype.hasOwnProperty.call(source || {}, key)) out[key] = uniqText(source[key]);
  }
  if (Object.prototype.hasOwnProperty.call(source || {}, 'quantity_found')) {
    const quantity = Number(source.quantity_found);
    out.quantity_found = Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
  }
  return out;
}

function partPayload(source: any, identification: any, actorEmail: string) {
  const quantity = source?.quantity_on_hand === '' || source?.quantity_on_hand == null ? (identification?.quantity_found ?? 0) : Number(source.quantity_on_hand);
  const minimum = source?.minimum_stock === '' || source?.minimum_stock == null ? 1 : Number(source.minimum_stock);
  const cost = source?.unit_cost === '' || source?.unit_cost == null ? undefined : Number(source.unit_cost);
  return {
    part_name: norm(source?.part_name || identification?.candidate_part_name),
    part_number: norm(source?.part_number || identification?.candidate_part_number),
    alternate_part_numbers: uniqText(source?.alternate_part_numbers ?? identification?.candidate_alternate_part_numbers),
    barcode_value: norm(source?.barcode_value || identification?.candidate_barcode_value),
    category: norm(source?.category || identification?.candidate_category || 'other'),
    subcategory: norm(source?.subcategory || identification?.candidate_subcategory),
    manufacturer: norm(source?.manufacturer || identification?.candidate_manufacturer),
    description: norm(source?.description || identification?.candidate_description),
    specification: norm(source?.specification || identification?.candidate_specification),
    quantity_on_hand: Number.isFinite(quantity) && quantity >= 0 ? quantity : 0,
    minimum_stock: Number.isFinite(minimum) && minimum >= 0 ? minimum : 1,
    unit_cost: Number.isFinite(cost as number) && Number(cost) >= 0 ? cost : undefined,
    location: norm(source?.location),
    storage_zone: norm(source?.storage_zone || identification?.storage_zone),
    storage_cabinet: norm(source?.storage_cabinet || identification?.storage_cabinet),
    storage_shelf: norm(source?.storage_shelf || identification?.storage_shelf),
    storage_bin: norm(source?.storage_bin || identification?.storage_bin),
    preferred_vendor: norm(source?.preferred_vendor || identification?.candidate_vendor),
    vendor_sku: norm(source?.vendor_sku || identification?.candidate_vendor_sku),
    vendor_url: norm(source?.vendor_url || identification?.candidate_vendor_url),
    primary_photo_url: norm(source?.primary_photo_url || identification?.uploaded_photo_urls?.[0]),
    photo_urls: uniqText(source?.photo_urls?.length ? source.photo_urls : identification?.uploaded_photo_urls),
    source_urls: uniqText(source?.source_urls?.length ? source.source_urls : identification?.candidate_source_urls),
    tags: uniqText(source?.tags),
    identity_status: source?.identity_status === 'verified' ? 'verified' : 'review_needed',
    identification_confidence: ['low','medium','high'].includes(source?.identification_confidence) ? source.identification_confidence : identification?.confidence || undefined,
    identification_method: ['manual','part_number','photo','barcode','ai_research','request_receive'].includes(source?.identification_method) ? source.identification_method : 'ai_research',
    identification_notes: norm(source?.identification_notes || identification?.verification_notes || identification?.reasoning),
    last_identified_at: nowIso(),
    last_identified_by: actorEmail,
    notes: norm(source?.notes),
    enable_low_stock_alerts: source?.enable_low_stock_alerts !== false,
    compatible_equipment_ids: uniqText(source?.compatible_equipment_ids?.length ? source.compatible_equipment_ids : identification?.confirmed_equipment_ids),
    compatibility_notes: norm(source?.compatibility_notes || identification?.compatibility_notes),
    created_from_identification_id: identification?.id || '',
  };
}

async function validateEquipment(Equipment: any, ids: string[]) {
  for (const id of ids || []) {
    const row = await Equipment.get(id).catch(() => null);
    if (!row) throw new Error(`Fleet equipment ${id} was not found.`);
    if (row.status === 'retired') throw new Error(`${row.name || 'Selected equipment'} is retired. Keep the part record if needed, but do not newly assign retired equipment as compatible.`);
  }
}

function duplicateIds(parts: any[], candidate: any, excludeId = '') {
  const candidateNumbers = new Set([
    normKey(candidate?.candidate_part_number || candidate?.part_number),
    normKey(candidate?.candidate_barcode_value || candidate?.barcode_value),
    ...uniqText(candidate?.candidate_alternate_part_numbers || candidate?.alternate_part_numbers).map(normKey),
  ].filter(Boolean));
  const manufacturer = norm(candidate?.candidate_manufacturer || candidate?.manufacturer).toLowerCase();
  const name = norm(candidate?.candidate_part_name || candidate?.part_name).toLowerCase();
  return parts.filter(part => {
    if (!part?.id || part.id === excludeId) return false;
    const partNumbers = [normKey(part.part_number), normKey(part.barcode_value), ...uniqText(part.alternate_part_numbers).map(normKey)].filter(Boolean);
    if (candidateNumbers.size && partNumbers.some(value => candidateNumbers.has(value))) return true;
    const sameManufacturer = manufacturer && norm(part.manufacturer).toLowerCase() === manufacturer;
    const sameName = name && norm(part.part_name).toLowerCase() === name;
    return !!(sameManufacturer && sameName);
  }).map(part => part.id);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = norm(body?.action);
    const adminRequired = ['promote','match_existing','dismiss'].includes(action);
    const auth = await authorize(base44, adminRequired);
    if (auth.error) return auth.error;

    const Identification = base44.asServiceRole.entities.FleetPartIdentification;
    const Part = base44.asServiceRole.entities.FleetPart;
    const Equipment = base44.asServiceRole.entities.FleetEquipment;

    if (action === 'analyze_result') {
      const creationKey = norm(body?.creation_key);
      const mode = norm(body?.search_mode);
      if (!creationKey || creationKey.length < 12 || creationKey.length > 200 || /\s/.test(creationKey)) return Response.json({ error: 'Part lookup session identity is missing or invalid.' }, { status: 409 });
      if (!['part_number','photo','barcode','text','combined'].includes(mode)) return Response.json({ error: 'Invalid part lookup mode.' }, { status: 400 });
      const patch = candidatePatch(body?.identification || body);
      await validateEquipment(Equipment, patch.confirmed_equipment_ids || []);
      const parts = await loadAllEntityRows({ entity: Part, sort: 'part_name', label: 'Fleet parts duplicate check' });
      const duplicates = duplicateIds(parts, patch);
      const desiredStatus = duplicates.length ? 'needs_review' : patch.confidence === 'high' ? 'analyzed' : 'needs_review';
      const existingRows = await Identification.filter({ creation_key: creationKey });
      if (existingRows.length > 1) return Response.json({ error: 'Multiple lookup sessions share this identity. Review the duplicates before retrying.' }, { status: 409 });
      const desired: any = {
        ...patch,
        status: desiredStatus,
        search_mode: mode,
        duplicate_part_ids: duplicates,
        analyzed_at: nowIso(),
        analyzed_by_email: auth.user.email,
        creation_key: creationKey,
      };
      if (existingRows[0]) {
        const expected = norm(body?.expected_updated_date || existingRows[0].updated_date);
        const updated = await updateFleetRecordIfCurrent({ entity: Identification, id: existingRows[0].id, expectedUpdatedAt: expected, patch: desired, label: 'Fleet part lookup session' });
        return Response.json({ success: true, identification: updated, duplicate_part_ids: duplicates });
      }
      const created = await Identification.create(desired);
      await new Promise(resolve => setTimeout(resolve, 75));
      const contenders = await Identification.filter({ creation_key: creationKey });
      if (contenders.length > 1) {
        const winner = canonical(contenders) || created;
        for (const row of contenders) if (row.id !== winner.id) await Identification.delete(row.id).catch(() => null);
        return Response.json({ success: true, identification: winner, duplicate_part_ids: winner.duplicate_part_ids || duplicates, reused: winner.id !== created.id });
      }
      return Response.json({ success: true, identification: created, duplicate_part_ids: duplicates });
    }

    const id = norm(body?.id || body?.identification_id);
    if (!id) return Response.json({ error: 'Fleet part identification id is required.' }, { status: 400 });
    const identification = await Identification.get(id).catch(() => null);
    if (!identification) return Response.json({ error: 'Fleet part identification was not found.' }, { status: 404 });

    if (action === 'update_review') {
      const patch = candidatePatch(body?.identification || body);
      await validateEquipment(Equipment, patch.confirmed_equipment_ids || identification.confirmed_equipment_ids || []);
      const parts = await loadAllEntityRows({ entity: Part, sort: 'part_name', label: 'Fleet parts duplicate check' });
      const duplicates = duplicateIds(parts, { ...identification, ...patch });
      const expected = norm(body?.expected_updated_date);
      if (!expected) return Response.json({ error: 'Lookup session version is missing. Reload before saving.' }, { status: 409 });
      const updated = await updateFleetRecordIfCurrent({
        entity: Identification,
        id,
        expectedUpdatedAt: expected,
        patch: { ...patch, duplicate_part_ids: duplicates, status: duplicates.length ? 'needs_review' : identification.status, reviewed_at: nowIso(), reviewed_by_email: auth.user.email },
        label: 'Fleet part lookup session',
      });
      return Response.json({ success: true, identification: updated, duplicate_part_ids: duplicates });
    }

    if (action === 'match_existing') {
      const partId = norm(body?.part_id);
      const part = partId ? await Part.get(partId).catch(() => null) : null;
      if (!part) return Response.json({ error: 'Selected Fleet part was not found.' }, { status: 404 });
      const expected = norm(body?.expected_updated_date);
      if (!expected) return Response.json({ error: 'Lookup session version is missing. Reload before matching.' }, { status: 409 });
      const updated = await updateFleetRecordIfCurrent({
        entity: Identification,
        id,
        expectedUpdatedAt: expected,
        patch: { status: 'matched_existing', promoted_part_id: part.id, reviewed_at: nowIso(), reviewed_by_email: auth.user.email },
        label: 'Fleet part lookup session',
      });
      return Response.json({ success: true, identification: updated, part });
    }

    if (action === 'dismiss') {
      const expected = norm(body?.expected_updated_date);
      if (!expected) return Response.json({ error: 'Lookup session version is missing. Reload before dismissing.' }, { status: 409 });
      const updated = await updateFleetRecordIfCurrent({ entity: Identification, id, expectedUpdatedAt: expected, patch: { status: 'dismissed', reviewed_at: nowIso(), reviewed_by_email: auth.user.email }, label: 'Fleet part lookup session' });
      return Response.json({ success: true, identification: updated });
    }

    if (action === 'promote') {
      if (identification.status === 'promoted' && identification.promoted_part_id) {
        const existing = await Part.get(identification.promoted_part_id).catch(() => null);
        if (existing) return Response.json({ success: true, reused: true, part: existing, identification });
      }
      const parts = await loadAllEntityRows({ entity: Part, sort: 'part_name', label: 'Fleet parts duplicate check' });
      const duplicates = duplicateIds(parts, { ...identification, ...(body?.part || {}) });
      if (duplicates.length && body?.confirm_duplicate_override !== true) {
        return Response.json({ error: 'Possible duplicate Fleet parts were found. Match this lookup to an existing part or explicitly confirm creating a separate inventory record.', duplicate_part_ids: duplicates }, { status: 409 });
      }
      const payload = partPayload(body?.part || {}, identification, auth.user.email);
      if (!payload.part_name || !payload.category) return Response.json({ error: 'Part name and category are required before promotion.' }, { status: 400 });
      await validateEquipment(Equipment, payload.compatible_equipment_ids || []);
      const creationKey = `part-identification:${id}`;
      const existingRows = await Part.filter({ creation_key: creationKey });
      let part = canonical(existingRows);
      if (!part) {
        part = await Part.create({ ...payload, creation_key: creationKey });
        await new Promise(resolve => setTimeout(resolve, 75));
        const contenders = await Part.filter({ creation_key: creationKey });
        const winner = canonical(contenders) || part;
        for (const row of contenders) if (row.id !== winner.id) await Part.delete(row.id).catch(() => null);
        part = winner;
      }
      const expected = norm(body?.expected_updated_date || identification.updated_date);
      const updatedIdentification = await updateFleetRecordIfCurrent({
        entity: Identification,
        id,
        expectedUpdatedAt: expected,
        patch: { status: 'promoted', promoted_part_id: part.id, duplicate_part_ids: duplicates, reviewed_at: nowIso(), reviewed_by_email: auth.user.email },
        label: 'Fleet part lookup session',
      });
      return Response.json({ success: true, part, identification: updatedIdentification });
    }

    return Response.json({ error: 'Unsupported Fleet part lookup action.' }, { status: 400 });
  } catch (error: any) {
    console.error('fleetPartLookupAction error:', error);
    if (error?.code === 'FLEET_RECORD_CONFLICT') return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: error?.message || 'Fleet part lookup operation failed.' }, { status: 500 });
  }
});
