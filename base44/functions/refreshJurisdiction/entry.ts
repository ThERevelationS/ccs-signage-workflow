import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { jurisdictionProtectionGuards, replaceJurisdictionFieldsIfUnchanged } from '../../shared/jurisdictionPersistence.mjs';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { hasWorkflowInvocationCapability } from '../../shared/workflowInvocationCapability.ts';
import { safeExternalFetch } from '../../shared/safeExternalFetch.ts';
import { sanitizeJurisdictionResearch } from '../../shared/jurisdictionResearchSanitizer.ts';
import { invalidateVerifiedJurisdictionAfterResearch } from '../../shared/jurisdictionVerification.ts';
import { findExistingJurisdictionDocument, mergeJurisdictionResearchDocuments } from '../../shared/jurisdictionResearchDocumentMerge.mjs';
import { gateResearchRegulatoryPromotion } from '../../shared/jurisdictionResearchAuthorityGate.mjs';
import { discoverOfficialPermittingResources } from '../../shared/jurisdictionPermittingLinkDiscovery.mjs';
import {
  DEFAULT_RESEARCH_ARCHIVE_LIMIT,
  RESEARCH_EXTRACT_TIMEOUT_MS,
  RESEARCH_FETCH_TIMEOUT_MS,
  RESEARCH_UPLOAD_TIMEOUT_MS,
  canArchiveResearchDocument,
  withResearchArchiveTimeout,
} from '../../shared/jurisdictionResearchArchiveBudget.mjs';

const MAX_RESEARCH_DOCUMENT_BYTES = 50 * 1024 * 1024;

async function readResearchDocumentBytes(response: Response, maxBytes = MAX_RESEARCH_DOCUMENT_BYTES) {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw Object.assign(new Error('Official resource exceeds its byte safety limit.'), { status: 413 });
  }
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw Object.assign(new Error('Official resource exceeds its byte safety limit.'), { status: 413 });
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw Object.assign(new Error('Official resource exceeds its byte safety limit.'), { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body: any = {};
    try { body = await req.json(); } catch {}
    const isScheduledRun = await hasWorkflowInvocationCapability(body, 'refreshJurisdiction');
    const isTargetedAutomation = await hasWorkflowInvocationCapability(body, 'refreshJurisdictionTargeted');
    const { jurisdiction_id, jurisdictionId, settings } = body;
    const discoveryOnly = body?.discovery_only === true;
    if (discoveryOnly && (isScheduledRun || isTargetedAutomation)) {
      return Response.json({ error: 'Discovery-only refresh requires an authenticated admin' }, { status: 403 });
    }
    const id = jurisdiction_id || jurisdictionId;

    let user: any = null;
    if (!isScheduledRun && !isTargetedAutomation) {
      user = await base44.auth.me().catch(() => null);
      if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
      if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // A selected jurisdiction is permitted for an authenticated admin or the
    // narrowly scoped targeted-refresh capability used by the credit-controlled
    // permitting dispatcher. The weekly batch capability remains unable to
    // select arbitrary jurisdiction ids.
    if (id || settings || discoveryOnly) {
      if (isScheduledRun) return Response.json({ error: 'Scheduled refresh does not accept caller-selected jurisdiction data' }, { status: 400 });
      if (!id) return Response.json({ error: 'Jurisdiction id is required for a targeted refresh' }, { status: 400 });
      const result = await refreshJurisdictionRecord(base44, id, settings, discoveryOnly);
      return Response.json(result);
    }

    if (isTargetedAutomation) {
      return Response.json({ error: 'Targeted refresh requires a jurisdiction id' }, { status: 400 });
    }

    // Scheduled/batch mode: verified workflow capability or authenticated admin.
    const all = await loadAllEntityRows({
      entity: base44.asServiceRole.entities.JurisdictionProfile,
      sort: 'last_updated',
      label: 'Scheduled jurisdiction refresh catalog',
    });
    const toRefresh = all.filter(j => j.auto_refresh !== false).slice(0, 5);
    const results = [];
    for (const j of toRefresh) {
      try {
        await refreshJurisdictionRecord(base44, j.id, undefined);
        results.push({ id: j.id, name: j.name, success: true });
      } catch (e) {
        results.push({ id: j.id, name: j.name, success: false, error: e.message });
      }
    }
    return Response.json({ batch: true, processed: results.length, results });
  } catch (error) {
    const status = Number(error?.status || 500);
    const safeStatus = [400, 404].includes(status) ? status : 500;
    console.error('refreshJurisdiction error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Jurisdiction refresh could not be completed safely' : error.message,
    }, { status: safeStatus });
  }
});

async function refreshJurisdictionRecord(base44: any, id: string, settings?: any, discoveryOnly = false) {
    const startedAt = Date.now();
    const jurisdiction = await base44.asServiceRole.entities.JurisdictionProfile.get(id);
    if (!jurisdiction) throw Object.assign(new Error('Jurisdiction not found'), { status: 404 });

    const batchSettings = discoveryOnly ? {
      updateWebsites: false, updatePermittingUrls: false, updateRequirements: false,
      updateDocuments: true, skipManualData: true,
    } : settings || {
      updateWebsites: true,
      updatePermittingUrls: true,
      updateRequirements: true,
      updateDocuments: true,
      skipManualData: true
    };

    // Use the full jurisdiction research agent (same prompt used for new jurisdiction creation)
    const includeParentCounty = jurisdiction.type !== 'county';
    if (discoveryOnly && (!jurisdiction.permitting_url || jurisdiction._manual_documents)) {
      throw Object.assign(new Error('Discovery requires a saved official permitting URL and unprotected document collection.'), { status: 400 });
    }
    let researchData: any;
    if (discoveryOnly) {
      researchData = { permitting_url: jurisdiction.permitting_url, documents: [] };
    } else {
      const agentResult = await base44.asServiceRole.functions.invoke('jurisdictionResearchAgent', {
        jurisdictionName: jurisdiction.name,
        jurisdictionState: jurisdiction.state,
        jurisdictionType: jurisdiction.type,
        includeParentCounty
      });
      researchData = sanitizeJurisdictionResearch(agentResult?.data?.data || agentResult?.data || agentResult);
    }
    if (!researchData) throw Object.assign(new Error('No research data returned'), { status: 400 });

    // When the LLM identifies an official permitting/forms page but returns no
    // document records, harvest relevant same-host links from that one verified
    // page. This is a deterministic fallback, not an additional LLM call.
    if ((!researchData.documents || researchData.documents.length === 0) && researchData.permitting_url) {
      try {
        const pageResponse = await safeExternalFetch(researchData.permitting_url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(RESEARCH_FETCH_TIMEOUT_MS),
        });
        const contentType = String(pageResponse.headers.get('content-type') || '').toLowerCase();
        if (pageResponse.ok && (contentType.includes('text/html') || contentType.includes('application/xhtml+xml'))) {
          const pageHtml = new TextDecoder().decode(await readResearchDocumentBytes(pageResponse, 2 * 1024 * 1024));
          const finalPageUrl = pageResponse.url || researchData.permitting_url;
          if (new URL(finalPageUrl).hostname.replace(/^www\./, '') !== new URL(researchData.permitting_url).hostname.replace(/^www\./, '')) {
            throw new Error('Permitting page redirected outside its official host.');
          }
          researchData.documents = discoverOfficialPermittingResources(pageHtml, finalPageUrl);
        } else if (discoveryOnly) {
          throw new Error('Official permitting page did not return an HTML resource.');
        }
      } catch (error) {
        if (discoveryOnly) throw error;
        console.warn(`Permitting page link harvest failed for ${jurisdiction.name || id}: ${error?.message || error}`);
      }
    }

    // Build update object — replace with new data, keep manual overrides
    const updateData = {};

    if (batchSettings.updateWebsites && (!batchSettings.skipManualData || !jurisdiction._manual_website_url)) {
      if (researchData.website_url) updateData.website_url = researchData.website_url;
    }

    if (batchSettings.updatePermittingUrls && (!batchSettings.skipManualData || !jurisdiction._manual_permitting_url)) {
      if (researchData.permitting_url) updateData.permitting_url = researchData.permitting_url;
    }

    if (researchData.cagis_database_url) {
      updateData.cagis_database_url = researchData.cagis_database_url;
    }

    if (batchSettings.updateRequirements && (!batchSettings.skipManualData || !jurisdiction._manual_requirements)) {
      // Always replace with new research data — don't fall back to old
      if (researchData.permit_requirements && Object.keys(researchData.permit_requirements).length > 0) {
        updateData.permit_requirements = researchData.permit_requirements;
      }
      if (researchData.ai_summary) updateData.ai_summary = researchData.ai_summary;
      if (researchData.contact_info && Object.keys(researchData.contact_info).some(k => researchData.contact_info[k])) {
        updateData.contact_info = researchData.contact_info;
      }
      if (researchData.sqft_width_height_rules) updateData.sqft_width_height_rules = researchData.sqft_width_height_rules;
      if (researchData.height_allowances) updateData.height_allowances = researchData.height_allowances;
      if (researchData.setback_rules) updateData.setback_rules = researchData.setback_rules;
      if (researchData.lighting_allowances) updateData.lighting_allowances = researchData.lighting_allowances;
    }

    if (includeParentCounty && researchData.parent_county?.name) {
      updateData.parent_county = researchData.parent_county;
    }

    let documentAuthorityEvidence: any[] = [];

    // Retain every previously sourced document, especially downloaded forms and
    // searchable text. AI omissions are not evidence that official files vanished.
    if (batchSettings.updateDocuments && (!batchSettings.skipManualData || !jurisdiction._manual_documents)) {
      const newAiDocs = (researchData.documents || []).map((d, i) => ({
        id: `ai_${Date.now()}_${i}`,
        title: d.title || "Untitled",
        url: d.url || "",
        doc_type: d.doc_type || "other",
        ai_summary: d.ai_summary || "",
        source: "ai_discovered",
        verification_notes: d.verification_notes || "",
        last_fetched: new Date().toISOString()
      }));

      // Persist every discovered source URL immediately, but bound expensive
      // archival work so one refresh cannot spend its whole execution window
      // downloading/extracting a long document list. Later refreshes can archive
      // additional sources that still lack file_url/source_sha256.
      const processedDocs = [];
      let archivesStarted = 0;
      for (const doc of newAiDocs) {
        const existing = findExistingJurisdictionDocument(jurisdiction.documents, doc);
        const shouldArchive = canArchiveResearchDocument({
          document: doc,
          existingDocument: existing,
          archivesStarted,
          archiveLimit: DEFAULT_RESEARCH_ARCHIVE_LIMIT,
        });
        if (!shouldArchive) {
          processedDocs.push(doc);
          continue;
        }
        archivesStarted += 1;
        let retainedDoc = doc;
        try {
          const downloadResult = await safeExternalFetch(doc.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(RESEARCH_FETCH_TIMEOUT_MS),
          });
          if (!downloadResult.ok) {
            processedDocs.push(doc);
            continue;
          }

          const responseType = String(downloadResult.headers.get('content-type') || '').toLowerCase();
          if (responseType.includes('text/html') || responseType.includes('application/xhtml+xml')) {
            processedDocs.push(doc);
            continue;
          }
          const fileBytes = await readResearchDocumentBytes(downloadResult);
          if (fileBytes.byteLength === 0) {
            processedDocs.push(doc);
            continue;
          }

          const contentType = downloadResult.headers.get('content-type') || 'application/octet-stream';
          const ext = doc.url.split('?')[0].split('.').pop()?.toLowerCase() || 'pdf';
          const mimeMap = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', txt: 'text/plain', csv: 'text/csv' };
          const mimeType = mimeMap[ext] || contentType.split(';')[0].trim() || 'application/octet-stream';

          const fileName = decodeURIComponent(new URL(doc.url).pathname.split('/').pop() || `official-resource.${ext}`);
          const fileBlob = new File([fileBytes], fileName, { type: mimeType });
          const uploadResult = await withResearchArchiveTimeout(
            base44.asServiceRole.integrations.Core.UploadFile({ file: fileBlob }),
            RESEARCH_UPLOAD_TIMEOUT_MS,
            'Research document upload',
          );

          if (!uploadResult?.file_url) {
            processedDocs.push(doc);
            continue;
          }

          // Persist successful archive evidence even if extraction fails. The
          // deterministic path never invokes an LLM or extraction integration.
          const digest = await crypto.subtle.digest('SHA-256', fileBytes);
          retainedDoc = {
            ...doc, file_url: uploadResult.file_url,
            source_sha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
            source_bytes: fileBytes.byteLength,
            stored_sha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''),
            stored_bytes: fileBytes.byteLength,
            downloaded_at: new Date().toISOString(),
          };
          if (discoveryOnly) {
            processedDocs.push(retainedDoc);
            continue;
          }
          const extractResult = await withResearchArchiveTimeout(
            base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
              file_url: uploadResult.file_url,
              json_schema: {
                type: "object",
                properties: {
                  content: { type: "string", description: "Full text content of the document" },
                  summary: { type: "string", description: "Summary of key sign permit requirements in this document" }
                }
              }
            }),
            RESEARCH_EXTRACT_TIMEOUT_MS,
            'Research document extraction',
          );

          processedDocs.push({
            ...retainedDoc,
            extracted_text: extractResult?.output?.content || "",
            ai_summary: extractResult?.output?.summary || doc.ai_summary
          });
        } catch (e) {
          console.error(`Failed to process doc ${doc.title}:`, e.message);
          processedDocs.push(retainedDoc);
        }
      }

      documentAuthorityEvidence = processedDocs;
      updateData.documents = mergeJurisdictionResearchDocuments(jurisdiction.documents, processedDocs);
    }

    if (!discoveryOnly) updateData.last_updated = new Date().toISOString();
    const authorityGate = gateResearchRegulatoryPromotion({ jurisdiction, researchData, updateData, documentEvidence: documentAuthorityEvidence });
    if (authorityGate.blocked) {
      console.warn(`Blocked comprehensive rewrite promotion for ${jurisdiction.name || id}: ${authorityGate.reasons.join(', ')}`);
    }
    const finalUpdateData = invalidateVerifiedJurisdictionAfterResearch(jurisdiction, authorityGate.updateData);

    const updated = await replaceJurisdictionFieldsIfUnchanged({
      entity: base44.asServiceRole.entities.JurisdictionProfile,
      jurisdiction,
      nextFields: finalUpdateData,
      guardFields: jurisdictionProtectionGuards(jurisdiction, finalUpdateData, {
        respectManualProtection: batchSettings.skipManualData !== false,
      }),
      label: `Jurisdiction research refresh ${jurisdiction.name || id}`,
    });

    return { success: true, jurisdiction: updated, discovery_only: discoveryOnly, research_attempts: discoveryOnly ? 0 : 1, discovered_documents: researchData.documents?.length || 0, runtime_ms: Date.now() - startedAt };
}