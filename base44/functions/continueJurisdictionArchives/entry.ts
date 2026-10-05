import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { safeExternalFetch } from '../../shared/safeExternalFetch.ts';
import { continueJurisdictionArchiveBacklog, archiveKnownJurisdictionSource } from '../../shared/jurisdictionArchiveContinuation.mjs';
import { registerJurisdictionArchive } from '../../shared/jurisdictionArchiveCatalog.mjs';
import { PERMITTING_RESEARCH_CONFIG_KEY } from '../../shared/permittingResearchDispatchConfig.mjs';

Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const automatic = body.automatic === true;
    const jurisdictionId = String(body.jurisdiction_id || '').trim();
    if (automatic && (jurisdictionId || body.document_id || body.catalog_only || body.known_pdf)) return Response.json({ error: 'Automatic archival selects its own bounded backlog.' }, { status: 400 });
    if (!automatic && !jurisdictionId) return Response.json({ error: 'Manual archival requires a jurisdiction id.' }, { status: 400 });
    if (body.known_pdf && (body.catalog_only || !body.document_id ||
        !/^[a-f0-9]{64}$/.test(body.known_pdf.sha256 || '') || !Number.isInteger(body.known_pdf.bytes) ||
        body.known_pdf.bytes < 5 || body.known_pdf.bytes > 50 * 1024 * 1024))
      return Response.json({ error: 'Known PDF archival requires a selected document, retained SHA-256 and bounded byte count.' }, { status: 400 });
    const entity = base44.asServiceRole.entities.JurisdictionProfile;
    const options = {
      entity,
      catalogEntity: base44.asServiceRole.entities.PermittingSourceDocument,
      fetchSource: safeExternalFetch,
      uploadFile: data => base44.asServiceRole.integrations.Core.UploadFile(data),
      manual: !automatic,
    };
    if (body.catalog_only === true) {
      if (!body.document_id) return Response.json({ error: 'Catalog reconciliation requires a stable document id.' }, { status: 400 });
      return Response.json(await registerJurisdictionArchive({ ...options, jurisdictionId, documentId: String(body.document_id), automatic: false }));
    }
    if (!automatic) return Response.json(await archiveKnownJurisdictionSource({ ...options, jurisdictionId, documentId: String(body.document_id || ''), knownPdf: body.known_pdf || null }));
    const configs = await base44.asServiceRole.entities.GlobalSettings.filter({ setting_key: PERMITTING_RESEARCH_CONFIG_KEY }, 'created_date', 2);
    if (configs.length > 1) throw new Error('Duplicate dispatcher settings; automatic archival stopped.');
    if (configs[0]?.setting_value?.enabled === false) return Response.json({ success: true, skipped: true, reason: 'disabled' });
    return Response.json(await continueJurisdictionArchiveBacklog(options));
  } catch (error) {
    console.error('continueJurisdictionArchives:', error?.message || error);
    return Response.json({ error: 'Document archival could not complete safely.' }, { status: 500 });
  }
});
