import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { updateFleetRecordIfCurrent } from '../../shared/fleetRecordPersistence.ts';

const DOCUMENT_TYPES = new Set([
  'registration', 'insurance', 'manual', 'receipt', 'service_document',
  'inspection_document', 'photo', 'other',
]);

const text = (value: unknown) => String(value ?? '').trim();
const canonical = (rows: any[] = []) => rows.slice().sort((a, b) => {
  const at = Date.parse(a?.created_date || '') || 0;
  const bt = Date.parse(b?.created_date || '') || 0;
  if (at !== bt) return at - bt;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
})[0] || null;

async function requireAdmin(base44: any) {
  const user = await base44.auth.me().catch(() => null);
  if (!user?.email) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role === 'admin') return { user };
  const rows = await base44.asServiceRole.entities.AuthorizedEmail.filter({ email: user.email });
  if (rows?.[0]?.role !== 'admin') {
    return { error: Response.json({ error: 'Fleet document administration requires a CCS admin.' }, { status: 403 }) };
  }
  return { user };
}

const cleanPatch = (source: any) => {
  const allowed = ['title', 'document_type', 'document_date', 'expiration_date', 'notes'];
  const out: any = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(source || {}, key)) out[key] = source[key];
  if (Object.prototype.hasOwnProperty.call(out, 'title')) out.title = text(out.title);
  if (Object.prototype.hasOwnProperty.call(out, 'notes')) out.notes = text(out.notes);
  for (const key of ['document_date', 'expiration_date']) {
    if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = text(out[key]) || null;
  }
  return out;
};

const sameCreateIntent = (row: any, desired: any) =>
  text(row?.equipment_id) === text(desired?.equipment_id)
  && text(row?.title) === text(desired?.title)
  && text(row?.document_type) === text(desired?.document_type)
  && text(row?.file_url) === text(desired?.file_url)
  && text(row?.file_name) === text(desired?.file_name)
  && text(row?.mime_type) === text(desired?.mime_type)
  && Number(row?.file_size_bytes || 0) === Number(desired?.file_size_bytes || 0);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const auth = await requireAdmin(base44);
    if (auth.error) return auth.error;
    const user = auth.user;
    const body = await req.json().catch(() => ({}));
    const action = text(body?.action);

    const Document = base44.asServiceRole.entities.FleetEquipmentDocument;
    const Equipment = base44.asServiceRole.entities.FleetEquipment;

    if (action === 'create') {
      const creationKey = text(body?.creation_key);
      if (!creationKey || creationKey.length < 12 || creationKey.length > 200 || /\s/.test(creationKey)) {
        return Response.json({ error: 'Fleet document create identity is missing or invalid. Reopen Add Document and try again.' }, { status: 409 });
      }
      const source = body?.document || {};
      const equipmentId = text(source.equipment_id);
      const patch = cleanPatch(source);
      const fileUrl = text(source.file_url);
      const fileName = text(source.file_name);
      const mimeType = text(source.mime_type);
      const fileSize = Math.max(0, Number(source.file_size_bytes || 0));
      if (!equipmentId || !text(patch.title) || !DOCUMENT_TYPES.has(text(patch.document_type)) || !fileUrl || !fileName) {
        return Response.json({ error: 'Equipment, title, document type, and uploaded file are required.' }, { status: 400 });
      }
      const equipment = await Equipment.get(equipmentId).catch(() => null);
      if (!equipment) return Response.json({ error: 'Fleet equipment not found.' }, { status: 404 });

      const desired = {
        equipment_id: equipmentId,
        ...patch,
        file_url: fileUrl,
        file_name: fileName,
        mime_type: mimeType,
        file_size_bytes: Number.isFinite(fileSize) ? fileSize : 0,
        uploaded_by_email: user.email,
        uploaded_by_name: user.full_name || user.name || user.email,
        creation_key: creationKey,
        is_archived: false,
      };

      const existingRows = await Document.filter({ creation_key: creationKey });
      if (existingRows.length > 1) {
        return Response.json({ error: 'Multiple Fleet documents share this create identity. Review the records before retrying.' }, { status: 409 });
      }
      if (existingRows[0]) {
        if (!sameCreateIntent(existingRows[0], desired)) {
          return Response.json({ error: 'This create identity already belongs to different Fleet document details. Reopen Add Document.' }, { status: 409 });
        }
        return Response.json({ success: true, reused: true, document: existingRows[0] });
      }

      const created = await Document.create(desired);
      await new Promise((resolve) => setTimeout(resolve, 75));
      const contenders = await Document.filter({ creation_key: creationKey });
      if (contenders.length > 1) {
        const winner = canonical(contenders) || created;
        if (winner.id !== created.id) {
          await Document.delete(created.id).catch(() => null);
          if (!sameCreateIntent(winner, desired)) {
            return Response.json({ error: 'Another Fleet document create won this identity with different details. The duplicate was discarded; reopen Add Document.' }, { status: 409 });
          }
          return Response.json({ success: true, reused: true, document: winner });
        }
        for (const duplicate of contenders) if (duplicate.id !== winner.id) await Document.delete(duplicate.id).catch(() => null);
      }
      return Response.json({ success: true, document: created });
    }

    const id = text(body?.id || body?.document_id);
    if (!id) return Response.json({ error: 'Fleet document id is required.' }, { status: 400 });
    const existing = await Document.get(id).catch(() => null);
    if (!existing) return Response.json({ error: 'Fleet document not found.' }, { status: 404 });

    if (action === 'update') {
      const patch = cleanPatch(body?.document || {});
      if (Object.prototype.hasOwnProperty.call(patch, 'document_type') && !DOCUMENT_TYPES.has(text(patch.document_type))) {
        return Response.json({ error: 'Invalid Fleet document type.' }, { status: 400 });
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'title') && !patch.title) {
        return Response.json({ error: 'Fleet document title cannot be blank.' }, { status: 400 });
      }
      const updated = await updateFleetRecordIfCurrent({
        entity: Document,
        id,
        expectedUpdatedAt: text(body?.expected_updated_date || ''),
        patch,
        label: 'Fleet equipment document',
      });
      return Response.json({ success: true, document: updated });
    }

    if (action === 'archive' || action === 'restore') {
      const archived = action === 'archive';
      const updated = await updateFleetRecordIfCurrent({
        entity: Document,
        id,
        expectedUpdatedAt: text(body?.expected_updated_date || ''),
        patch: archived
          ? { is_archived: true, archived_at: new Date().toISOString(), archived_by: user.email }
          : { is_archived: false, archived_at: null, archived_by: '' },
        label: 'Fleet equipment document',
      });
      return Response.json({ success: true, document: updated });
    }

    return Response.json({ error: 'Unsupported Fleet document action.' }, { status: 400 });
  } catch (error: any) {
    console.error('fleetEquipmentDocumentAction error:', error);
    if (error?.code === 'FLEET_RECORD_CONFLICT') return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: error?.message || 'Fleet document operation failed.' }, { status: 500 });
  }
});
