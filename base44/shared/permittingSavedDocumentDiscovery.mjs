import {scanOfficialPermittingPages} from './permittingDiscoveryScan.mjs';
import {mergeJurisdictionResearchDocuments} from './jurisdictionResearchDocumentMerge.mjs';
import {replaceJurisdictionFieldsIfUnchanged} from './jurisdictionPersistence.mjs';

const fail = message => {throw Object.assign(Error(message),{status:409});};
const exact = value => typeof value==='string' && value.length>0 && value===value.trim();
const urlKey = value => {const u=new URL(value);u.hash='';u.hostname=u.hostname.replace(/^www\./,'');return u.href;};
export function validateSavedDiscoverySelection(profile, selection) {
 if(!profile || !selection || !exact(selection.document_id) || !exact(selection.url) ||
    !exact(selection.profile_version) || selection.profile_version!==profile.updated_date ||
    selection.profile_id!==profile.id || selection.name!==profile.name ||
    selection.state!==profile.state || selection.type!==profile.type ||
    !exact(profile.id) || !exact(profile.name) || !['OH','KY'].includes(profile.state) ||
    !['city','village','township','county'].includes(profile.type))
  fail('Saved document selection is stale or its exact jurisdiction identity changed. Reload before selecting.');
 if(profile._manual_documents || !profile.permitting_url || profile.discovery_scan_state?.blocked ||
    profile.discovery_scan_state?.method!=='official-page-frontier-v1')
  fail('Saved document discovery requires an unprotected collection and existing official frontier.');
 const docs=profile.documents || [], matches=docs.filter(d=>d?.id===selection.document_id);
 if(matches.length!==1 || matches[0].url!==selection.url)fail('Selected saved document changed or has duplicate identity.');
 const doc=matches[0];
 if(doc.source==='manual' || doc.pinned || doc.archive_pinned || doc.file_url || doc.source_sha256 ||
    doc.stored_sha256 || doc.archive_state || doc.resource_classification?.kind==='pdf')
  fail('Protected, archived or PDF selections require their existing review path.');
 let selected, root;
 try {selected=new URL(selection.url);root=new URL(profile.permitting_url);}catch{fail('Selected source URL is invalid.');}
 if(selection.url.length>2000 || !['http:','https:'].includes(selected.protocol) ||
    selected.username || selected.password || selected.hash || selected.port ||
    selected.hostname.replace(/^www\./,'')!==root.hostname.replace(/^www\./,'') ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(selected.hostname) ||
    /(?:^|\.)(?:localhost|local|internal|lan)$/.test(selected.hostname))
  fail('Selected document must have a safe exact URL on the saved official host.');
 if(docs.filter(d=>{try{return urlKey(d.url)===urlKey(selection.url);}catch{return false;}}).length!==1)
  fail('Selected saved URL has duplicate documents.');
 const history=profile.discovery_scan_state.saved_document_scans || [];
 if(!Array.isArray(history) || history.length>=20 || JSON.stringify(history).length>512000)
  fail('Saved document discovery history requires review.');
 if(history.some(row=>row.document_id===doc.id || row.source_url===doc.url))
  fail('This saved document already has discovery history. Review the saved receipt before another scan.');
 return doc;
}
export async function discoverSelectedSavedDocument({entity,profile,selection,fetchPage,onProgress=async()=>{}}) {
 const doc=validateSavedDiscoverySelection(profile,selection);
 // Fresh pre-fetch read rejects edits after preflight. The original frontier is
 // never used as a fabricated authorization for this separate one-page action.
 validateSavedDiscoverySelection(await entity.get(profile.id),selection);
 const scan=await scanOfficialPermittingPages({jurisdiction:profile,seedUrl:doc.url,maxPages:1,maxDepth:2,
  existingDocuments:profile.documents || [],fetchPage,onProgress});
 if(!scan.success)throw Object.assign(Error('Selected saved source could not be read; nothing was saved.'),{status:409});
 // Harvested links were observed, not fetched. Only the selected page was
 // actually read; commit its timestamp with the receipt under the same guards.
 const scannedAt=new Date().toISOString();
 const documents=scan.documents.map(d=>({...d,id:crypto.randomUUID()}));
 const receipt={method:'explicit-saved-document-page-v1',document_id:doc.id,source_url:doc.url,
  profile_version:selection.profile_version,scanned_at:scannedAt,
  continuation_state:scan.continuation_state,pages:scan.pages,attempted_pages:scan.attempted_pages,
  jurisdiction_coverage_complete:false,authority_established:false};
 const nextFields={documents:mergeJurisdictionResearchDocuments(profile.documents,documents)
  .map(d=>d.id===doc.id?{...d,last_fetched:scannedAt}:d),
  discovery_scan_state:{...profile.discovery_scan_state,saved_document_scans:[
   ...(profile.discovery_scan_state.saved_document_scans || []),receipt]}};
 await onProgress({kind:'saving',detail:'Saving selected source findings; original frontier retained.',progress:{stage:'Saving findings',indeterminate:true}});
 const updated=await replaceJurisdictionFieldsIfUnchanged({entity,jurisdiction:profile,nextFields,
  guardFields:{updated_date:profile.updated_date,name:profile.name,state:profile.state,type:profile.type,
   permitting_url:profile.permitting_url,website_url:profile.website_url,_manual_documents:profile._manual_documents},
  label:'Explicit saved document discovery'});
 return {success:true,jurisdiction:updated,discovery_scan:scan,selected_document_receipt:receipt,
  discovery_only:true,research_attempts:0,llm_calls:0,archival:null};
}
