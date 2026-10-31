
import {createScanReporter,silentScanReporter} from '../../shared/permittingScanReporter.mjs';
import {createClientFromRequest} from 'npm:@base44/sdk@0.8.25';
import {loadAllEntityRows} from '../../shared/pagedEntityRows.ts';
import {authenticateSignShopSession} from '../../shared/signShopSession.ts';
import {summarizeMatchedLocalityAuthority} from '../../shared/permittingAddressLocality.js';
import {strictGeocode,resolveSpatialLocation,exactConfiguredLocality} from '../../shared/permittingSpatialResolution.mjs';
import {normalizeAddressState} from '../../shared/permittingAddressState.js';
import {withEntityRateLimitRetry} from '../../shared/entityRateLimitRetry.ts';




async function fixedJSON(url:string,timeoutMs=15000){
 const response=await fetch(url,{signal:AbortSignal.timeout(timeoutMs)});
 if(!response.ok)throw Error('Location service returned HTTP '+response.status);
 const text=await response.text();if(text.length>8*1024*1024)throw Error('Location response exceeds its limit.');return JSON.parse(text);
}
// Keep this revision in responses and scan events so preview/live routing can be verified.
const ADDRESS_LOOKUP_REVISION='address-geocode-v5';
// A persistent Google denial is a configuration fault, not a transient error.
// Once observed, skip the doomed round-trip on later lookups until the cooldown
// lets one probe through (admin geocode_diagnostic calls always probe so a key
// fix can be verified without waiting). Free locators keep working meanwhile.
let googleDeniedUntil=0;
let googleDeniedService:any=null;
const GOOGLE_DENIED_TTL_MS=10*60*1000;
// Interpret provider text internally; only fixed diagnostic codes/messages leave this function.
function geocodingRejection(raw:unknown){
 const message=typeof raw==='string'?raw.slice(0,2000).toLowerCase():'';
 const suffix=' You do not need to re-enter this address.';
 if(/refer(?:r)?er restrictions/.test(message))return {diagnostic_code:'BROWSER_KEY_RESTRICTION',message:'Google rejected a website-restricted key for server address lookup. An administrator needs a separate server geocoding key.'+suffix};
 if(/billing/.test(message))return {diagnostic_code:'BILLING_REQUIRED',message:'Google rejected address lookup because billing needs attention in the map project. An administrator must check the project billing status.'+suffix};
 if(/api key.*(?:invalid|expired)|(?:invalid|expired).*api key/.test(message))return {diagnostic_code:'KEY_INVALID',message:'Google rejected the server geocoding key as invalid or expired. An administrator must check the configured server key.'+suffix};
 if(/(?:api|service).*(?:not been used|disabled|not enabled)/.test(message))return {diagnostic_code:'API_DISABLED',message:'Google reports that Geocoding API access is disabled. An administrator must check Geocoding API access in the map project.'+suffix};
 if(/(?:ip|site|application).*not authorized|ip.*restrict/.test(message))return {diagnostic_code:'APPLICATION_RESTRICTION',message:'Google rejected the server request under the key application restrictions. An administrator must check the server key restrictions.'+suffix};
 if(/not authorized to use this api|api.*not authorized/.test(message))return {diagnostic_code:'API_ACCESS_DENIED',message:'Google does not allow this server key to use Geocoding API. An administrator must check the enabled API and key API restrictions.'+suffix};
 return {diagnostic_code:'REQUEST_DENIED',message:'Google rejected the map location request. An administrator needs to check the server key, Geocoding API access and billing.'+suffix};
}
function addressResponse(data:any,init:any={}){
 const response=Response.json({...data,lookup_revision:ADDRESS_LOOKUP_REVISION},init);
 response.headers.set('X-CCS-Address-Revision',ADDRESS_LOOKUP_REVISION);
 return response;
}
// Reference catalogs change rarely; cache them briefly per isolate so bursts of
// lookups do not multiply service-role entity reads against the shared rate budget.
const catalogCache=new Map<string,{ts:number,data:{localities:any[],profiles:any[]}}>();
const catalogInflight=new Map<string,Promise<any>>();
const CATALOG_TTL_MS=5*60*1000;
async function loadCatalogs(base44:any,stateFilter:any){
 const key=stateFilter?.state||'all';
 const hit=catalogCache.get(key);
 if(hit&&Date.now()-hit.ts<CATALOG_TTL_MS)return hit.data;
 if(catalogInflight.has(key))return catalogInflight.get(key);
 const p=(async()=>{
  const [localities,profiles]=await Promise.all([
   loadAllEntityRows({entity:base44.asServiceRole.entities.PermitLocality,query:stateFilter,sort:'created_date',label:'Location matching catalog'}),
   loadAllEntityRows({entity:base44.asServiceRole.entities.JurisdictionProfile,query:stateFilter,sort:'created_date',label:'Location county identities'})]);
  catalogCache.set(key,{ts:Date.now(),data:{localities,profiles}});
  return {localities,profiles};
 })().finally(()=>catalogInflight.delete(key));
 catalogInflight.set(key,p);
 return p;
}
// Session tokens are stable; cache the actor briefly so repeated searches do not
// burn two auth reads per lookup against the shared entity rate budget.
const sessionCache=new Map<string,{ts:number,actor:any}>();
const SESSION_TTL_MS=90*1000;
async function cachedSession(base44:any,token:any){
 const key=String(token||'');
 const hit=sessionCache.get(key);
 if(hit&&Date.now()-hit.ts<SESSION_TTL_MS)return hit.actor;
 const actor=await authenticateSignShopSession(base44,token);
 if(sessionCache.size>500)sessionCache.clear();
 sessionCache.set(key,{ts:Date.now(),actor});
 return actor;
}
Deno.serve(async req=>{
 let reporter:any=silentScanReporter;
 let diagnostic=false;
 try{
  const base44=withEntityRateLimitRetry(createClientFromRequest(req),{maxRetries:4}),body=await req.json();
  // Admin diagnostics use normal platform authentication; ordinary searches keep
  // the existing Sign Shop session requirement and authority gates.
  diagnostic=body?.action==='geocode_diagnostic';
  const actor=diagnostic?await base44.auth.me().catch(()=>null):await cachedSession(base44,body?.session_token);
  if(diagnostic&&actor?.role!=='admin')return addressResponse({success:false,error:'Admin access required.'},{status:403});
  const address=typeof body.address==='string'?body.address.trim():'';
  if(!address||address.length>500)return addressResponse({success:false,error:'Enter a full street address of 500 characters or fewer.'},{status:400});
  if(!diagnostic&&body.action_token)reporter=await createScanReporter({entity:base44.asServiceRole.entities.PermittingScanRun,token:body.action_token,user:actor,targetId:'address-lookup',targetName:address,kind:'address',label:`Find jurisdiction for ${address}`});
  const progress=async(event:any)=>{const {progress,...item}=event;await reporter.emit(item,progress || {});};
  await reporter.emit({kind:'address_lookup',detail:`Looking up ${address}. Service revision: ${ADDRESS_LOOKUP_REVISION}.`},{stage:'Finding the building on the map',indeterminate:true});
  let geocode:any=null,geocodingService:any=null;
  const serviceFailure=(status:string,message:string,diagnostic_code?:string)=>geocodingService={status,issue:true,message,...(diagnostic_code?{diagnostic_code}:{})};
  try{
   // Never return the dedicated server key through getGoogleMapsKey.
   const key=Deno.env.get('GOOGLE_GEOCODING_API_KEY')?.trim() || Deno.env.get('GOOGLE_MAPS_API_KEY')?.trim();
   if(!key){serviceFailure('NOT_CONFIGURED','The map location service is not configured. An administrator needs to check its server key. You do not need to re-enter this address.');throw Error('Map geocoding is not configured.');}
   if(!diagnostic&&Date.now()<googleDeniedUntil)throw Object.assign(new Error('google-denied-cooldown'),{code:'GOOGLE_DENIED_COOLDOWN'});
   await reporter.emit({kind:'geocode_lookup',url:'https://maps.googleapis.com/maps/api/geocode/json',detail:`Searching for ${address}.`});
   const data=await fixedJSON(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}`);
   const serviceStatus=['OK','ZERO_RESULTS','REQUEST_DENIED','OVER_QUERY_LIMIT','OVER_DAILY_LIMIT','INVALID_REQUEST','UNKNOWN_ERROR'].includes(data.status)?data.status:'UNKNOWN_STATUS';
   const serviceResultCount=Array.isArray(data.results)?data.results.length:0;
   console.info('CCS address geocoder v5',{status:serviceStatus,result_count:serviceResultCount});
   await reporter.emit({kind:'geocode_service_result',detail:`Google Geocoding responded: ${serviceStatus}; ${serviceResultCount} address results.`});
   if(serviceStatus==='OK'&&!serviceResultCount)serviceFailure('EMPTY_RESULT','The map service returned an empty response. Try again later; no jurisdiction has been selected.');
   else if(serviceStatus==='ZERO_RESULTS')geocodingService={status:serviceStatus,issue:false,message:'No address match was returned. Check the street address.'};
   else if(serviceStatus==='REQUEST_DENIED'){const rejection=geocodingRejection(data.error_message);serviceFailure(serviceStatus,rejection.message,rejection.diagnostic_code);googleDeniedUntil=Date.now()+GOOGLE_DENIED_TTL_MS;googleDeniedService=geocodingService;}
   else if(serviceStatus!=='OK')serviceFailure(serviceStatus,serviceStatus==='OVER_QUERY_LIMIT'||serviceStatus==='OVER_DAILY_LIMIT'?'Google Geocoding reached its service limit. Try again later or ask an administrator to check quota and billing.':serviceStatus==='INVALID_REQUEST'?'The map service rejected the lookup request. An administrator needs to check the request setup.':'The map location service is temporarily unavailable. Try again later.');
   if(geocodingService)await reporter.emit({kind:'geocode_failed',detail:`Google Geocoding returned ${geocodingService.status}: ${geocodingService.message}`});
   if(data.status==='OK'&&data.results?.length){googleDeniedUntil=0;googleDeniedService=null;const g=data.results[0];geocode={lat:g.geometry?.location?.lat,lon:g.geometry?.location?.lng,display_name:g.formatted_address,location_exact:strictGeocode(data.results,address),address_parts:(g.address_components || []).reduce((a:any,c:any)=>{for(const t of c.types || [])a[t]=c.long_name;return a;},{})};}
  }catch(err:any){if(err?.code==='GOOGLE_DENIED_COOLDOWN'){geocodingService=googleDeniedService||geocodingService||{status:'REQUEST_DENIED',issue:true,message:'Google rejected the map location request. An administrator needs to check the server key, Geocoding API access and billing. You do not need to re-enter this address.'};await reporter.emit({kind:'geocode_service_result',detail:'Google Geocoding is still denied from the last check; trying the free locators first.'});await reporter.emit({kind:'geocode_failed',detail:`Google Geocoding skipped during denial cooldown: ${geocodingService.message}`});}else{if(!geocodingService)serviceFailure('UNAVAILABLE','The map location service could not be reached. Try again later; no jurisdiction has been selected.');await reporter.emit({kind:'geocode_failed',detail:`Google Geocoding returned ${geocodingService.status}: ${geocodingService.message}`});}}
  // Browser-resolved Census hint: the worker cannot reach census.gov (its fetch
 // hangs until abort), so the client geocodes via the browser and resubmits.
 const hint=body?.census_hint;
 if(!geocode&&hint&&Number.isFinite(Number(hint.lat))&&Number.isFinite(Number(hint.lng))){
  const hp=hint.address_parts||{};const hs=normalizeAddressState(hp.state||'');
  if(['oh','ky'].includes(hs)){
   geocode={lat:Number(hint.lat),lon:Number(hint.lng),display_name:hint.matched_address||address,location_exact:false,approximate_source:'browser_geocoder',address_parts:{administrative_area_level_1:hs,locality:hp.city||'',postal_code:hp.zip||''}};
   await reporter.emit({kind:'geocode_service_result',detail:'Browser map locator matched '+geocode.display_name+' as an approximate map location.'});
   if(geocodingService?.issue)geocodingService={...geocodingService,fallback_used:'browser_geocoder',fallback_message:'The browser map locator found an approximate map position after Google rejected the lookup.'};
  }
 }
 // Free fallback 1: OpenStreetMap Nominatim — no key; interpolation finds
 // approximate positions where strict street-number matching fails. Policy: one
 // serialized request per lookup, honest User-Agent, treated as approximate only.
 // OSM runs before Census because the worker historically cannot reach
 // census.gov — a doomed 15s wait used to precede every OSM attempt.
 if(!geocode){
  try{
   await reporter.emit({kind:'geocode_lookup',url:'https://nominatim.openstreetmap.org/search',detail:'Trying the public OpenStreetMap address locator.'});
   const osmResponse=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&addressdetails=1&q='+encodeURIComponent(address),{headers:{'User-Agent':'ccs-signage-permitting-lookup/1.0'},signal:AbortSignal.timeout(6000)});
   const osm=osmResponse.ok?await osmResponse.json():[];
   const hit=Array.isArray(osm)?osm[0]:null;
   const addr=hit?.address||{};
   const st=normalizeAddressState(addr.state||'');
   if(hit&&Number.isFinite(Number(hit.lat))&&Number.isFinite(Number(hit.lon))&&['oh','ky'].includes(st)){
    geocode={lat:Number(hit.lat),lon:Number(hit.lon),display_name:hit.display_name||address,location_exact:false,approximate_source:'nominatim',address_parts:{administrative_area_level_1:st,locality:addr.city||addr.town||addr.village||addr.municipality||'',postal_code:addr.postcode||''}};
    await reporter.emit({kind:'geocode_service_result',detail:'OpenStreetMap locator matched '+geocode.display_name+' as an approximate map location.'});
    if(geocodingService?.issue)geocodingService={...geocodingService,fallback_used:'nominatim',fallback_message:'The public OpenStreetMap locator found an approximate map position after other locators failed.'};
   }else await reporter.emit({kind:'geocode_service_result',detail:'OpenStreetMap locator returned no usable match.'});
  }catch{await reporter.emit({kind:'geocode_failed',detail:'The OpenStreetMap backup locator could not confirm the address either.'});}
 }
 // Free fallback 2 (last resort): US Census geocoder needs no key and returns
 // normalized addresses, but the worker often cannot reach census.gov — keep it
 // last with its own short timeout so an unreachable host cannot stall lookups.
 if(!geocode){
  try{
   await reporter.emit({kind:'geocode_lookup',url:'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress',detail:'Trying the public US Census address locator.'});
   const cleaned=address.replace(/s+,/g,',').replace(/,?s*(USA|United States|US)$/i,'');
   let match=null,matches=[];
   for(const candidate of [...new Set([cleaned,address])]){
    const census=await fixedJSON('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address='+encodeURIComponent(candidate)+'&benchmark=Public_AR_Current&format=json',5000);
    matches=census?.result?.addressMatches || [];
    if(matches.length){match=matches[0];break;}
   }
   await reporter.emit({kind:'geocode_service_result',detail:'Census address locator returned '+matches.length+' candidate match(es).'});
   const components=match?.addressComponents || {},state=normalizeAddressState(components.state || (match?.matchedAddress || '').split(',').slice(-2,-1)[0] || ''),city=components.city || '',zip=components.zip || '';
   if(match?.coordinates&&['oh','ky'].includes(state)){
    geocode={lat:match.coordinates.y,lon:match.coordinates.x,display_name:match.matchedAddress || address,location_exact:false,approximate_source:'us_census',address_parts:{administrative_area_level_1:state,locality:city,postal_code:zip}};
    await reporter.emit({kind:'geocode_service_result',detail:'Census address locator matched '+geocode.display_name+' as an approximate map location.'});
    if(geocodingService?.issue)geocodingService={...geocodingService,fallback_used:'us_census',fallback_message:'The public Census locator found an approximate map position after Google rejected the lookup.'};
   }
  }catch{await reporter.emit({kind:'geocode_failed',detail:'The Census backup locator could not confirm the address either.'});}
 }
 if(diagnostic)return addressResponse({success:true,diagnostic_only:true,geocode,geocoding_service:geocodingService,authority_established:false,apply_allowed:false,llm_calls:0,record_writes:0});
  await reporter.emit({kind:'geocode_result',detail:geocode?`Map result: ${geocode.display_name}; latitude ${geocode.lat}, longitude ${geocode.lon}. ${geocode.location_exact?'Street and building coordinates matched.':'Approximate or corrected address; review required.'}`:'No map location found.'},{stage:'Checking government boundaries',indeterminate:true});
  const resolution=await resolveSpatialLocation({geocode,fetchJSON:fixedJSON,onProgress:progress});
  const hasServiceIssue=Boolean(geocodingService?.issue&&resolution.status!=='location_verified');
  if(hasServiceIssue)resolution.reason=geocodingService.message;
  await reporter.emit({kind:'location_result',detail:resolution.reason},{stage:'Checking saved jurisdictions',indeterminate:true});
  const stateFilter=resolution.state?{state:resolution.state}:null;
  const {localities,profiles}=await loadCatalogs(base44,stateFilter);
  const matched=exactConfiguredLocality(localities,resolution,profiles);
  await reporter.emit({kind:'catalog_check',detail:`Checked ${localities.length} saved jurisdictions. ${matched?`Unique location match: ${matched.name}. ${matched.offices?.some(office=>office.authority_verification_status==='staff_verified')?'Checking reviewed office roles.':'Office setup needs review; website research stays in the review tools.'}`:'No unique confirmed match. Website research stays available in the review tools.'}`});
  // Never ask an LLM to choose a locality ID; never write research into approved
  // profiles or a Work Order. Research starts even when location needs review.
  const authority=summarizeMatchedLocalityAuthority(matched);
  const applyAllowed=Boolean(matched&&authority.verified_roles.includes('sign_permit')&&authority.verified_roles.includes('zoning'));
  // Website research and archive downloads are explicitly deferred: they made
  // every ordinary address search wait minutes even though jurisdiction selection
  // only needs the verified location and configured catalog match.
  const automatic=null;
  const addressArchives=null;
  const reason=matched?resolution.reason:resolution.status==='location_verified'?`Location is ${resolution.target.name}, but we are not sure which office handles permits there yet. Someone on the team can look it up in the review tools.`:resolution.reason;
  await reporter.emit({kind:'address_findings',detail:reason},{stage:applyAllowed?'Ready to use':'Administrator review needed',processed:1,total:1,indeterminate:false});
  return addressResponse({success:true,scan_run:await reporter.finish(hasServiceIssue?'completed_with_errors':'complete',hasServiceIssue?geocodingService.message:undefined),geocode,geocoding_service:geocodingService,location_resolution:resolution,automatic_scan:automatic,address_archives:addressArchives,research_deferred:true,suggested_locality:matched?{id:matched.id,name:matched.name,state:matched.state,zip:matched.zip,jurisdiction_profile_id:matched.jurisdiction_profile_id}:null,authority_review:authority,apply_allowed:applyAllowed,not_matched:!matched,ai_locality_name:resolution.target?.name || '',ai_state:resolution.state || '',ai_county:resolution.target?.county || '',match_confidence:matched?'high':'unresolved',match_method:matched?'government_boundary_intersection':'none',match_reason:reason,notes:!applyAllowed?'An administrator must confirm the location and sign/zoning office setup before this address is used.':''});
 }catch(error){
  const errorStatus=Number(error?.status||error?.response?.status||0);
  // A platform rate limit is transient: hand it back as 429 so the browser
  // backs off instead of treating the lookup as a deterministic failure.
  if(errorStatus===429||/rate limit|too many requests/i.test(String(error?.message||'')))return addressResponse({success:false,error:'Address lookup is busy. Try again shortly.',retry_after_ms:3000,error_detail:String(error?.message||error).slice(0,300)},{status:429,headers:{'Retry-After':'3'}});
  const status=[400,401,409,503].includes(errorStatus)?errorStatus:500;return addressResponse({success:false,scan_run:await reporter.finish('failed','Address lookup could not finish safely.'),error:status===500?'Address lookup could not finish safely. Please try again.':error.message,...(diagnostic||status!==500?{error_detail:String(error?.message||error).slice(0,300)}:{})},{status});}
});