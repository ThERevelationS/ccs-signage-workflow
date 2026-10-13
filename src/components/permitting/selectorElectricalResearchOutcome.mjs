import {summarizeMatchedLocalityAuthority} from '../../../base44/shared/permittingAddressLocality.js';

const clean=value=>typeof value==='string'?value.trim():'';
const ROLES=['electrical_permit','electrical_inspection'];

/** Summarize one acknowledged manual jurisdiction research response, without
 * promoting discovered links, a geographic name match, or local office roles
 * to official authority. Never compare jurisdictions by name alone.
 */
export function summarizeSelectorElectricalResearchOutcome({response,target,locality,action}){
  const result=response?.data||response;
  if(result?.success!==true)throw Error('Research completion is not confirmed. Check saved Scan activity before retrying.');
  const updated=result.jurisdiction;
  if(!clean(target?.id)||updated?.id!==target.id||updated?.state!==target.state)
    throw Error('Returned jurisdiction identity does not match the requested record. Refresh saved information and review Scan activity.');
  const linked=Boolean(locality?.id&&clean(locality.jurisdiction_profile_id)===updated.id&&
    locality.state===updated.state);
  const electrical=linked?summarizeMatchedLocalityAuthority(locality).electrical_coverage:null;
  const recordedRoles=ROLES.map(role=>({
    role,status:electrical?.roles[role]||'not_assessed'
  }));
  const observedDocs=Number.isSafeInteger(result.discovered_documents)&&result.discovered_documents>=0
    ?result.discovered_documents:null;
  const savedDocuments=Array.isArray(updated.documents)?updated.documents.length:null;
  const runStatus=clean(result.scan_run?.status);
  const needsRunReview=Boolean(!runStatus||runStatus!=='complete'||
    result.archival?.success===false||result.discovery_scan?.success===false);
  return {
    profile_id:updated.id,state:updated.state,action:action==='research'?'research':'discovery',
    observed_docs:observedDocs,saved_documents:savedDocuments,needs_run_review:needsRunReview,
    has_exact_locality_link:linked,roles:recordedRoles,
    warning:'Source discovery does not assign permit issuers or inspection providers. Review the official documents, precise jurisdiction and canonical office separately.'
  };
}
