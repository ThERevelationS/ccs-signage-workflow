import {retainAddressResearchFiles} from '../../shared/permittingAddressArchive.mjs';
import {createScanReporter,silentScanReporter} from '../../shared/permittingScanReporter.mjs';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.25';
import {loadAllEntityRows} from '../../shared/pagedEntityRows.ts';
import {authenticateSignShopSession} from '../../shared/signShopSession.ts';
import {summarizeMatchedLocalityAuthority} from '../../shared/permittingAddressLocality.js';
import {strictGeocode,resolveSpatialLocation,exactConfiguredLocality} from '../../shared/permittingSpatialResolution.mjs';
import {discoverUnmatchedAddress} from '../../shared/permittingAddressDiscovery.mjs';
import {safeExternalFetch} from '../../shared/safeExternalFetch.ts';
import {readPermittingResourceResponse} from '../../shared/permittingResourceResponse.mjs';

async function fixedJSON(url:string){
 const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Location service returned HTTP '+response.status);
 const text=await response.text();if(text.length>8*1024*1024)throw Error('Location response exceeds its limit.');return JSON.parse(text);
}
const ADDRESS_LOOKUP_REVISION='address-geocode-v4';
function addressResponse(data:any,init:any={}){
 const response=Response.json({...data,lookup_revision:ADDRESS_LOOKUP_REVISION},init);
 response.headers.set('X-CCS-Address-Revision',ADDRESS_LOOKUP_REVISION);
 return response;
}
Deno.serve(async req=>{
 let reporter:any=silentScanReporter;
 try{
  const base44=createClientFromRequest(req),body=await req.json(),actor=await authenticateSignShopSession(base44,body?.session_token);
  const address=typeof body.address==='string'?body.address.trim():'';
  if(!address||address.length>500)return addressResponse({success:false,error:'Enter a full street address of 500 characters or fewer.'},{status:400});
  if(body.action_token)reporter=await createScanReporter({entity:base44.asServiceRole.entities.PermittingScanRun,token:body.action_token,user:actor,targetId:'address-lookup',targetName:address,kind:'address',label:`Find jurisdiction for ${address}`});
  const progress=async(event:any)=>{const {progress,...item}=event;await reporter.emit(item,progress || {});};
  await reporter.emit({kind:'address_lookup',detail:`Looking up ${address}. Service revision: ${ADDRESS_LOOKUP_REVISION}.`},{stage:'Finding the building on the map',indeterminate:true});
  let geocode:any=null,geocodingService:any=null;
  const serviceFailure=(status:string,message:string)=>geocodingService={status,issue:true,message};
  try{
   const key=Deno.env.get('GOOGLE_MAPS_API_KEY');
   if(!key){serviceFailure('NOT_CONFIGURED','The map location service is not configured. An administrator needs to check its server key. You do not need to re-enter this address.');throw Error('Map geocoding is not configured.');}
   await reporter.emit({kind:'geocode_lookup',url:'https://maps.googleapis.com/maps/api/geocode/json',detail:`Searching for ${address}.`});
   const data=await fixedJSON(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}`);
   const serviceStatus=['OK','ZERO_RESULTS','REQUEST_DENIED','OVER_QUERY_LIMIT','OVER_DAILY_LIMIT','INVALID_REQUEST','UNKNOWN_ERROR'].includes(data.status)?data.status:'UNKNOWN_STATUS';
   const serviceResultCount=Array.isArray(data.results)?data.results.length:0;
   console.info('CCS address geocoder v4',{status:serviceStatus,result_count:serviceResultCount});
   await reporter.emit({kind:'geocode_service_result',detail:`Google Geocoding responded: ${serviceStatus}; ${serviceResultCount} address results.`});
   if(serviceStatus==='OK'&&!serviceResultCount)serviceFailure('EMPTY_RESULT','The map service returned an empty response. Try again later; no jurisdiction has been selected.');
   else if(serviceStatus==='ZERO_RESULTS')geocodingService={status:serviceStatus,issue:false,message:'No address match was returned. Check the street address.'};
   else if(serviceStatus!=='OK')serviceFailure(serviceStatus,serviceStatus==='REQUEST_DENIED'?'Google rejected the map location request. An administrator needs to check the server key, Geocoding API access and billing. You do not need to re-enter this address.':serviceStatus==='OVER_QUERY_LIMIT'||serviceStatus==='OVER_DAILY_LIMIT'?'Google Geocoding reached its service limit. Try again later or ask an administrator to check quota and billing.':serviceStatus==='INVALID_REQUEST'?'The map service rejected the lookup request. An administrator needs to check the request setup.':'The map location service is temporarily unavailable. Try again later.');
   if(geocodingService)await reporter.emit({kind:'geocode_failed',detail:`Google Geocoding returned ${geocodingService.status}: ${geocodingService.message}`});
   if(data.status==='OK'&&data.results?.length){const g=data.results[0];geocode={lat:g.geometry?.location?.lat,lon:g.geometry?.location?.lng,display_name:g.formatted_address,location_exact:strictGeocode(data.results,address),address_parts:(g.address_components || []).reduce((a:any,c:any)=>{for(const t of c.types || [])a[t]=c.long_name;return a;},{})};}
  }catch{if(!geocodingService)serviceFailure('UNAVAILABLE','The map location service could not be reached. Try again later; no jurisdiction has been selected.');await reporter.emit({kind:'geocode_failed',detail:`Google Geocoding returned ${geocodingService.status}: ${geocodingService.message}`});}
  await reporter.emit({kind:'geocode_result',detail:geocode?`Map result: ${geocode.display_name}; latitude ${geocode.lat}, longitude ${geocode.lon}. ${geocode.location_exact?'Street and building coordinates matched.':'Approximate or corrected address; review required.'}`:'No map location found.'},{stage:'Checking government boundaries',indeterminate:true});
  const resolution=await resolveSpatialLocation({geocode,fetchJSON:fixedJSON,onProgress:progress});
  const hasServiceIssue=Boolean(geocodingService?.issue&&resolution.status!=='location_verified');
  if(hasServiceIssue)resolution.reason=geocodingService.message;
  await reporter.emit({kind:'location_result',detail:resolution.reason},{stage:'Checking saved jurisdictions',indeterminate:true});
  const localities=await loadAllEntityRows({entity:base44.asServiceRole.entities.PermitLocality,sort:'created_date',label:'Location matching catalog'});
  const profiles=await loadAllEntityRows({entity:base44.asServiceRole.entities.JurisdictionProfile,sort:'created_date',label:'Location county identities'});
  const matched=exactConfiguredLocality(localities,resolution,profiles);
  await reporter.emit({kind:'catalog_check',detail:`Checked ${localities.length} saved jurisdictions. ${matched?`Unique location match: ${matched.name}. ${matched.offices?.some(office=>office.authority_verification_status==='staff_verified')?'Checking reviewed office roles.':'Office setup needs review; starting research.'}`:'No unique confirmed match. Starting automatic website research.'}`});
  // Never ask an LLM to choose a locality ID; never write research into approved
  // profiles or a Work Order. Research starts even when location needs review.
  const authority=summarizeMatchedLocalityAuthority(matched);
  const applyAllowed=Boolean(matched&&authority.verified_roles.includes('sign_permit')&&authority.verified_roles.includes('zoning'));
  const automatic=applyAllowed?null:await discoverUnmatchedAddress({address,resolution,profiles,onProgress:progress,
   research:async(prompt:string)=>base44.asServiceRole.integrations.Core.InvokeLLM({prompt,add_context_from_internet:true,model:'gemini_3_flash',response_json_schema:{type:'object',properties:{website_url:{type:'string'},permitting_url:{type:'string'}}}}),
   fetchPage:async(url:string)=>{const response=await safeExternalFetch(url,{method:'GET',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'CCS-Permitting-Address/1.0'}},3);return readPermittingResourceResponse(response);}
  });
  const addressArchives=await retainAddressResearchFiles({entity:base44.asServiceRole.entities.PermittingAddressArchive,scanRunId:reporter.id,actor,resolution,automatic,onProgress:progress,
   fetchSource:(url:string,init:any,host:string|null)=>safeExternalFetch(url,init,3,host?(candidate:any)=>candidate.protocol==='https:'&&candidate.hostname.toLowerCase().replace(/^www\./,'')===host:undefined),
   uploadFile:(data:any)=>base44.asServiceRole.integrations.Core.UploadFile(data)});
  const reason=matched?resolution.reason:resolution.status==='location_verified'?`Location is ${resolution.target.name}, but its saved office setup is missing or ambiguous. Automatic research is ready for administrator review.`:resolution.reason;
  await reporter.emit({kind:'address_findings',detail:reason},{stage:applyAllowed?'Ready to use':'Administrator review needed',processed:1,total:1,indeterminate:false});
  return addressResponse({success:true,scan_run:await reporter.finish(hasServiceIssue||addressArchives?.status==='needs_review'?'completed_with_errors':'complete',hasServiceIssue?geocodingService.message:undefined),geocode,geocoding_service:geocodingService,location_resolution:resolution,automatic_scan:automatic,address_archives:addressArchives,suggested_locality:matched?{id:matched.id,name:matched.name,state:matched.state,zip:matched.zip,jurisdiction_profile_id:matched.jurisdiction_profile_id}:null,authority_review:authority,apply_allowed:applyAllowed,not_matched:!matched,ai_locality_name:resolution.target?.name || '',ai_state:resolution.state || '',ai_county:resolution.target?.county || '',match_confidence:matched?'high':'unresolved',match_method:matched?'government_boundary_intersection':'none',match_reason:reason,notes:!applyAllowed?'An administrator must confirm the location and sign/zoning office setup before this address is used.':''});
 }catch(error){const status=[400,401,409,503].includes(Number(error?.status))?Number(error.status):500;return addressResponse({success:false,scan_run:await reporter.finish('failed','Address lookup could not finish safely.'),error:status===500?'Address lookup could not finish safely. Please try again.':error.message},{status});}
});
