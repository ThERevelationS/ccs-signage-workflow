import requirements from './permittingOfficeResearchRequirements.json' with {type:'json'};
import {safeAuthorityUrl} from './permittingSourceAuthorityPolicy.mjs';

export const OFFICE_RESEARCH_METHOD='office-research-requirements-v1';
export const officeResearchChecklist=requirements;
export const officeResearchFieldLabels={
 canonical_office_identity:'Office identity',official_role_evidence:'Official responsibility',explicit_service_area:'Service area',
 commercial_sign_scope:'Commercial sign applicability',delegation_or_contract_provider:'Contract or delegated provider',
 phone_email_address:'Contact information',official_source_url:'Official source',source_date_and_version:'Source date',
 document_archives_or_online_form_links:'Forms and online applications',illuminated_sign_applicability:'Illuminated signs',
 new_circuit_and_connection_scope:'New circuits and connections',permit_application:'Permit application',
 online_application_portal:'Online application portal',fees:'Fees',contractor_registration_or_licensing:'Contractor requirements',
 required_submittals:'Required submittals',inspection_provider:'Inspection provider',scheduling_contact_or_portal:'Inspection scheduling',
 required_inspection_stages:'Inspection stages',booking_lead_time:'Booking lead time',permit_number_or_prerequisites:'Before booking',
 access_and_concealment_conditions:'Access and concealment',reinspection_procedure_and_fees:'Reinspection and fees',
 utility_release_if_applicable:'Utility release'
};
export const officeResearchResponseSchema={type:'object',properties:{roles:{type:'array',maxItems:7,items:{type:'object',properties:{
 role:{type:'string',enum:requirements.roles.map(r=>r.key)},office_name:{type:['string','null']},
 official_source_url:{type:['string','null']},applicability:{type:'string',enum:['unknown','potentially_applicable','not_applicable_candidate']},
 service_area:{type:['string','null']},responsibility_quote:{type:['string','null']},delegation_quote:{type:['string','null']},
 contact_info:{type:'object'},research_fields:{type:'object'},notes:{type:['string','null']}
},required:['role']}}}};
export function officeResearchPrompt(){
 return '\n=== PERMITTING OFFICES AND ELECTRICAL WORK ===\n'+requirements.roles.map(role=>
  role.label+' ('+role.key+'): '+[...requirements.common_research_fields,...(role.research_fields || [])].map(k=>officeResearchFieldLabels[k] || k).join('; ')).join('\n')+
  '\nResearch electrical permit issuance separately from electrical inspections. Find explicit municipal/county delegation and third-party provider service-area evidence. Do not infer county responsibility from membership, a utility from electrical permits, or commercial-sign applicability from a residential guide. Follow official jurisdiction referrals to provider portals; label provider findings as unverified. Include electrical forms, fees, contractor rules, inspection scheduling and checklists as separate documents[] entries.\n'+
  requirements.completion_rules.join('\n')+
  '\nReturn office_research: {roles:[{role,office_name,official_source_url,applicability,service_area,responsibility_quote,delegation_quote,contact_info:{phone,email,address},research_fields:{field_key:exact finding or null},notes}]}. Use the role and research field keys above. Return all seven roles, with null/unknown where evidence is missing. These are research drafts, never staff_verified authority assignments.\n';
}
const clean=(v,max=1000)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):null;
export function normalizeOfficeResearch(input,{jurisdiction={},now=()=>new Date().toISOString()}={}){
 if(!input || !Array.isArray(input.roles))return null;
 const rows=input.roles.slice(0,30);
 return {method:OFFICE_RESEARCH_METHOD,researched_at:now(),verification_status:'needs_verification',
  profile_snapshot:{id:jurisdiction.id || null,name:jurisdiction.name || null,state:jurisdiction.state || null,type:jurisdiction.type || null},
  roles:requirements.roles.map(role=>{
   const matches=rows.filter(r=>r?.role===role.key),raw=matches.length===1?matches[0]:{};
   const url=safeAuthorityUrl(raw.official_source_url);
   const fields=[...requirements.common_research_fields,...(role.research_fields || [])];
   return {role:role.key,label:role.label,verification_status:'needs_verification',
    office_name:clean(raw.office_name,200),official_source_url:url || null,
    applicability:['potentially_applicable','not_applicable_candidate'].includes(raw.applicability)?raw.applicability:'unknown',
    service_area:clean(raw.service_area),responsibility_quote:clean(raw.responsibility_quote),delegation_quote:clean(raw.delegation_quote),
    contact_info:Object.fromEntries(['phone','email','address'].map(k=>[k,clean(raw.contact_info?.[k],300)])),
    research_fields:Object.fromEntries(fields.map(k=>[k,clean(raw.research_fields?.[k])])),
    notes:matches.length>1?'Multiple offices were returned for this role. Review which office covers this location.':clean(raw.notes)};
  })};
}
