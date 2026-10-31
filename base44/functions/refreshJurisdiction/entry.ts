import {assertOfficialProfileResearchIdentity,assertResearchSourceIdentity} from '../../shared/permittingSourceIdentity.mjs';
import { retainOfficeResearchResponseHistory } from '../../shared/officeResearchResponseHistory.mjs';
import {validateSavedDiscoverySelection,discoverSelectedSavedDocument} from '../../shared/permittingSavedDocumentDiscovery.mjs';
import {authenticateSignShopSession} from '../../shared/signShopSession.ts';
import {createScanReporter,silentScanReporter} from '../../shared/permittingScanReporter.mjs';
import { readPermittingResourceResponse } from '../../shared/permittingResourceResponse.mjs';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { jurisdictionProtectionGuards, replaceJurisdictionFieldsIfUnchanged } from '../../shared/jurisdictionPersistence.mjs';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { hasWorkflowInvocationCapability } from '../../shared/workflowInvocationCapability.ts';
import { safeExternalFetch, assertSafeExternalUrl } from '../../shared/safeExternalFetch.ts';
import { sanitizeJurisdictionResearch } from '../../shared/jurisdictionResearchSanitizer.ts';
import {normalizeOfficeResearch} from '../../shared/permittingOfficeResearch.mjs';
import { invalidateVerifiedJurisdictionAfterResearch } from '../../shared/jurisdictionVerification.ts';
import { mergeJurisdictionResearchDocuments } from '../../shared/jurisdictionResearchDocumentMerge.mjs';
import { gateResearchRegulatoryPromotion } from '../../shared/jurisdictionResearchAuthorityGate.mjs';
import { scanOfficialPermittingPages, combineResearchAndDiscoveredDocuments, applyDiscoveryFetchTimestamp } from '../../shared/permittingDiscoveryScan.mjs';
import { RESEARCH_FETCH_TIMEOUT_MS } from '../../shared/jurisdictionResearchArchiveBudget.mjs';
import { archiveKnownJurisdictionSource } from '../../shared/jurisdictionArchiveContinuation.mjs';
import { gateResearchSourceUrls } from '../../shared/permittingResearchUrlTrust.mjs';

Deno.serve(async (req) => {
  let reporter:any=silentScanReporter;
  try {
    const base44 = createClientFromRequest(req);

    let body: any = {};
    try { body = await req.json(); } catch {}
    const isScheduledRun = await hasWorkflowInvocationCapability(body, 'refreshJurisdiction');
    const isTargetedAutomation = await hasWorkflowInvocationCapability(body, 'refreshJurisdictionTargeted');
    const { jurisdiction_id, jurisdictionId, settings } = body;
    const discoveryOnly = body?.discovery_only === true;
    const savedSelection=body.selected_saved_document ?? null;
    const rescanSourceUrl=body.rescan_source_url ?? null;
    if(rescanSourceUrl!==null && (!discoveryOnly || typeof rescanSourceUrl!=='string'))return Response.json({error:'Source rescan requires discovery-only mode and a saved URL'},{status:400});
    const recoverDepthUrl = body.recover_depth_url ?? null;
    if (recoverDepthUrl !== null && (!discoveryOnly || typeof recoverDepthUrl !== 'string')) return Response.json({error:'Depth recovery requires discovery-only mode and a selected URL'}, {status:400});
    if (recoverDepthUrl !== null && (body.recover_fetch_failures === true || body.recover_link_limits === true)) return Response.json({error:'Select one recovery mode'}, {status:400});
    if (body.recover_fetch_failures === true && !discoveryOnly) return Response.json({error:'Fetch recovery requires discovery-only mode'}, {status:400});
    if (body.recover_fetch_failures === true && body.recover_link_limits === true) return Response.json({error:'Select one recovery mode'}, {status:400});
    if (body.recover_link_limits === true && !discoveryOnly) return Response.json({error:'Link recovery requires discovery-only mode'}, {status:400});
    if (discoveryOnly && (isScheduledRun || isTargetedAutomation)) {
      return Response.json({ error: 'Discovery-only refresh requires an authenticated admin' }, { status: 403 });
    }
    const id = jurisdiction_id || jurisdictionId;

    let user: any = null;
    if (!isScheduledRun && !isTargetedAutomation) {
      user = await base44.auth.me().catch(() => null);
      if(!user&&body.session_token)user=await authenticateSignShopSession(base44,body.session_token);
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
      let selectedProfile:any=null;
      if(savedSelection!==null){
        if(!user || !discoveryOnly || body.defer_archive!==true || isScheduledRun || isTargetedAutomation ||
           rescanSourceUrl!==null || recoverDepthUrl!==null || body.recover_fetch_failures || body.recover_link_limits || settings)
          return Response.json({error:'Select one explicit discovery-only saved document action with deferred archival'},{status:400});
        selectedProfile=await base44.asServiceRole.entities.JurisdictionProfile.get(id);
        validateSavedDiscoverySelection(selectedProfile,savedSelection);
        await assertSafeExternalUrl(savedSelection.url);
      }
      if(body.action_token){
        if(!user || isScheduledRun || isTargetedAutomation)return Response.json({error:'Tracked manual scans require an authenticated admin'},{status:403});
        const target=await base44.asServiceRole.entities.JurisdictionProfile.get(id);
        reporter=await createScanReporter({entity:base44.asServiceRole.entities.PermittingScanRun,token:body.action_token,user,targetId:id,targetName:target.name,kind:discoveryOnly?'discovery':'research',label:`${discoveryOnly?'Rescan':'Research'} ${target.name}, ${target.state}`});
      }
      const result = savedSelection!==null ? await discoverSelectedSavedDocument({
        entity:base44.asServiceRole.entities.JurisdictionProfile,profile:selectedProfile,selection:savedSelection,
        onProgress:(event:any)=>reporter.emit(event,event.progress || {}),
        fetchPage:async(url:string)=>{
          const selectedHost=new URL(savedSelection.url).hostname.replace(/^www\./,'');
          const response=await safeExternalFetch(url,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(RESEARCH_FETCH_TIMEOUT_MS)},5,
            (candidate:URL)=>candidate.hostname.replace(/^www\./,'')===selectedHost && !candidate.port);
          return {...await readPermittingResourceResponse(response),finalUrl:response.url || url};
        }
      }) : await refreshJurisdictionRecord(base44, id, settings, discoveryOnly, body.defer_archive !== true && !isScheduledRun && !isTargetedAutomation, body.recover_link_limits === true, body.recover_fetch_failures === true, recoverDepthUrl,reporter,rescanSourceUrl,isTargetedAutomation || body.automatic_research === true);
      const scanRun=await reporter.finish(result.archival?.success===false || result.discovery_scan?.success===false?'completed_with_errors':'complete');
      return Response.json({...result,scan_run:scanRun});
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
    const identityReviews = [];
    const toRefresh = all.filter(j => {
      if (j.auto_refresh === false) return false;
      if (j.discovery_scan_state?.blocked) { identityReviews.push({id:j.id,reason:'automatic_profile_held_for_review'}); return false; }
      try { assertOfficialProfileResearchIdentity(j); return true; }
      catch (error) { identityReviews.push({id:j.id,reason:error.message}); return false; }
    }).slice(0, 5);
    const results = [];
    for (const j of toRefresh) {
      try {
        await refreshJurisdictionRecord(base44, j.id, undefined, false, true, false, false, null, silentScanReporter, null, true);
        results.push({ id: j.id, name: j.name, success: true });
      } catch (e) {
        results.push({ id: j.id, name: j.name, success: false, error: e.message });
      }
    }
    return Response.json({ batch: true, processed: results.length, results, identity_reviews: identityReviews });
  } catch (error) {
    await reporter.finish('failed',String(error?.message || error));
    const status = Number(error?.status || 500);
    const safeStatus = [400,401,403,404,409,503].includes(status) ? status : 500;
    console.error('refreshJurisdiction error:', error?.message || error);
    return Response.json({
      error: safeStatus === 500 ? 'Jurisdiction refresh could not be completed safely' : error.message,
    }, { status: safeStatus });
  }
});

async function refreshJurisdictionRecord(base44: any, id: string, settings?: any, discoveryOnly = false, archiveAfterRefresh = true, recoverLinkLimits = false, recoverFetchFailures = false, recoverDepthUrl: string | null = null,reporter:any=silentScanReporter,rescanSourceUrl:string|null=null,automatic=false) {
    const startedAt = Date.now();
    const jurisdiction = await base44.asServiceRole.entities.JurisdictionProfile.get(id);
    if (!jurisdiction) throw Object.assign(new Error('Jurisdiction not found'), { status: 404 });
    if (automatic && (jurisdiction.auto_refresh === false || jurisdiction.discovery_scan_state?.blocked)) throw Object.assign(new Error('Automatic research is held for this jurisdiction; review before dispatch.'),{status:409});
    if (automatic) assertOfficialProfileResearchIdentity(jurisdiction);
    if (discoveryOnly) assertResearchSourceIdentity(jurisdiction,jurisdiction);

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
    let seedUrlValid = false;
    try { const u = new URL(String(jurisdiction.permitting_url || '').trim()); seedUrlValid = u.protocol === 'http:' || u.protocol === 'https:'; } catch {}
    if (discoveryOnly && (!seedUrlValid || jurisdiction._manual_documents)) {
      throw Object.assign(new Error('Discovery requires a saved official permitting URL and unprotected document collection.'), { status: 400 });
    }
    let researchData: any;
    let sourceUrlReview: any[] = [];
    if (discoveryOnly) {
      researchData = { permitting_url: jurisdiction.permitting_url, documents: [] };
    } else {
      await reporter.emit({kind:'search',detail:`Researching ${jurisdiction.name}, ${jurisdiction.state}: official permitting/zoning pages, sign rules, applications, fees, portals and contacts. Internal AI web queries are not exposed.`},{stage:'AI research',indeterminate:true});
      const agentResult = await base44.asServiceRole.functions.invoke('jurisdictionResearchAgent', {
        jurisdictionName: jurisdiction.name,
        jurisdictionState: jurisdiction.state,
        jurisdictionType: jurisdiction.type,
        includeParentCounty,
        ...(reporter.id?{scan_run_id:reporter.id}:{})
      });
      researchData = sanitizeJurisdictionResearch(agentResult?.data?.data || agentResult?.data || agentResult);
      assertResearchSourceIdentity(jurisdiction,researchData);
      ({ research: researchData, review: sourceUrlReview } = gateResearchSourceUrls(jurisdiction, researchData));
      if (sourceUrlReview.length) {
        console.warn(`Held ${sourceUrlReview.length} AI source URL(s) for review on ${jurisdiction.name || id}: ${sourceUrlReview.map(r => r.reason).join(', ')}`);
        await reporter.emit({kind:'source_url_review',detail:'AI returned URLs outside the established official host or vetted government domains; held for admin review and not applied.',resources:sourceUrlReview.map(r=>({url:r.url,title:r.field,doc_type:r.reason}))});
      }
      await reporter.emit({kind:'found',detail:'AI returned source candidates; discovery and authority review still required.',resources:researchData?.documents || []});
      if(agentResult?.data?.research_instructions)await reporter.emit({kind:'search_instructions',detail:agentResult.data.research_instructions});
    }
    if (!researchData) throw Object.assign(new Error('No research data returned'), { status: 400 });

    // Harvest even when AI returns a partial document list. Discovery-only
    // requests follow linked official pages without spending research credits.
    let discoveryScan: any = null;
    // A held host change never becomes the crawl boundary; keep crawling the saved official URL.
    const heldPermittingUrl = sourceUrlReview.some(r => r.field === 'permitting_url');
    const discoverySeedUrl = researchData.permitting_url || (heldPermittingUrl && seedUrlValid ? jurisdiction.permitting_url : null);
    if (discoverySeedUrl && batchSettings.updateDocuments && !jurisdiction._manual_documents) {
      try {
        discoveryScan = await scanOfficialPermittingPages({
          onProgress:(event:any)=>reporter.emit(event,event.progress || {}),
          jurisdiction, seedUrl: discoverySeedUrl, maxPages: rescanSourceUrl?1:discoveryOnly ? 3 : 1,rescanUrl:rescanSourceUrl, recoverLinkLimits, recoverFetchFailures, recoverDepthUrl,
          resume: jurisdiction.discovery_scan_state || null, existingDocuments: jurisdiction.documents || [],
          fetchPage: async (url: string) => {
            const response = await safeExternalFetch(url, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(RESEARCH_FETCH_TIMEOUT_MS),
            });
            const resource = await readPermittingResourceResponse(response);
            return { ...resource, finalUrl: response.url || url };
          },
        });
        if (discoveryOnly && !discoveryScan.success && !jurisdiction.discovery_scan_state) throw new Error('Official-page discovery could not read the selected source.');
        researchData.documents = combineResearchAndDiscoveredDocuments(researchData.documents, discoveryScan.documents);
      } catch (error) {
        if (discoveryOnly || error?.code === 'SOURCE_IDENTITY_REVIEW_REQUIRED') throw error;
        discoveryScan = { success: false, documents: [], gaps: [{ reason: 'discovery_failed', requires_review: true }],
          jurisdiction_coverage_complete: false, authority_established: false, llm_calls: 0 };
        console.warn(`Official-page discovery failed for ${jurisdiction.name || id}: ${error?.message || error}`);
      }
    }

    // Build update object — replace with new data, keep manual overrides
    const updateData: any = {};
    if (discoveryScan?.continuation_state) updateData.discovery_scan_state = discoveryScan.continuation_state;

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
      if (researchData.office_research) updateData.office_research = retainOfficeResearchResponseHistory(
        normalizeOfficeResearch(researchData.office_research,{jurisdiction}), jurisdiction.office_research);
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
        source: d.source === "official_page_harvest" ? "official_page_harvest" : "ai_discovered",
        verification_notes: d.verification_notes || "",
        ...(d.resource_classification ? { resource_classification: d.resource_classification } : {}),
        ...(d.discovery_page_url ? {discovery_page_url:d.discovery_page_url, discovery_depth:d.discovery_depth} : {})
      }));

      // Source retention commits before any network/upload work. Archival uses
      // the same durable per-document receipt as scheduled continuation.
      documentAuthorityEvidence = newAiDocs;
      // Only pages actually fetched in this run earn its timestamp; harvested
      // links and AI suggestions stay undated until they are really fetched.
      updateData.documents = applyDiscoveryFetchTimestamp(
        mergeJurisdictionResearchDocuments(jurisdiction.documents, newAiDocs),
        discoveryScan, new Date().toISOString());
    }

    if (!discoveryOnly) updateData.last_updated = new Date().toISOString();
    const authorityGate = gateResearchRegulatoryPromotion({ jurisdiction, researchData, updateData, documentEvidence: documentAuthorityEvidence });
    if (authorityGate.blocked) {
      console.warn(`Blocked comprehensive rewrite promotion for ${jurisdiction.name || id}: ${authorityGate.reasons.join(', ')}`);
    }
    const finalUpdateData = invalidateVerifiedJurisdictionAfterResearch(jurisdiction, authorityGate.updateData);

    await reporter.emit({kind:'saving',detail:'Saving discovered sources with concurrency and manual-data protections.'},{stage:'Saving findings',indeterminate:true,current_url:''});
    let updated = await replaceJurisdictionFieldsIfUnchanged({
      entity: base44.asServiceRole.entities.JurisdictionProfile,
      jurisdiction,
      nextFields: finalUpdateData,
      guardFields: { ...jurisdictionProtectionGuards(jurisdiction, finalUpdateData, {
        respectManualProtection: batchSettings.skipManualData !== false,
      }), ...(discoveryScan?.continuation_state ? { _manual_documents: jurisdiction._manual_documents,
        ...(Object.hasOwn(finalUpdateData, 'permitting_url') ? {} : { permitting_url: jurisdiction.permitting_url }),
        ...(Object.hasOwn(finalUpdateData, 'website_url') ? {} : { website_url: jurisdiction.website_url }) } : {}) },
      label: `Jurisdiction research refresh ${jurisdiction.name || id}`,
    });

    let archival: any = null;
    if (archiveAfterRefresh && batchSettings.updateDocuments && !updated._manual_documents) {
      try {
        const result = await archiveKnownJurisdictionSource({
          entity: base44.asServiceRole.entities.JurisdictionProfile, jurisdictionId: id,
          catalogEntity: base44.asServiceRole.entities.PermittingSourceDocument,
          fetchSource: safeExternalFetch,
          uploadFile: data => base44.asServiceRole.integrations.Core.UploadFile(data),
          manual: Boolean(reporter.id),onProgress:(event:any)=>reporter.emit(event,event.progress || {}),
        });
        const { jurisdiction: archivedProfile, ...summary } = result;
        archival = summary;
        updated = archivedProfile || await base44.asServiceRole.entities.JurisdictionProfile.get(id);
      } catch (error) {
        // Retained links are already durable; archive failure cannot undo discovery.
        archival = { success: false, error: String(error?.message || error) };
        updated = await base44.asServiceRole.entities.JurisdictionProfile.get(id);
      }
    }
    return { success: true, jurisdiction: updated, archival, discovery_scan: discoveryScan, source_url_review: sourceUrlReview, discovery_only: discoveryOnly, research_attempts: discoveryOnly ? 0 : 1, discovered_documents: researchData.documents?.length || 0, runtime_ms: Date.now() - startedAt };
}