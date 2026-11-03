import {normalizeAddressState} from './permittingAddressState.js';
const CENSUS='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb';
export const LOCATION_SOURCES={county:`${CENSUS}/State_County/MapServer/1`,place:`${CENSUS}/Places_CouSub_ConCity_SubMCD/MapServer/4`,township:`${CENSUS}/Places_CouSub_ConCity_SubMCD/MapServer/1`,oh_city:'https://maps.ohio.gov/arcgis/rest/services/Hosted/Ohio_Municipal_Boundaries/FeatureServer/0',oh_township:'https://maps.ohio.gov/arcgis/rest/services/OGRIP/boundaryData/MapServer/3',ky_city:'https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_CityBnd_Polygon_WGS84WM/MapServer/0'};
const norm=value=>String(value || '').trim().toLowerCase().replace(/^(city|village|town) of\s+/,'').replace(/\s+(city|village|town|county|township)$/,'').replace(/\s+/g,' ');
// Loose jurisdiction-name equivalence: official sources spell the same place
// differently (St./Saint, Ft./Fort, Mt./Mount, spacing like "Sugar Creek" vs
// "Sugarcreek"). Same-name artifacts are not jurisdictional disagreements.
const loose=value=>norm(value).replace(/\bst\.?\b/g,'saint').replace(/\bft\.?\b/g,'fort').replace(/\bmt\.?\b/g,'mount').replace(/[^a-z0-9]/g,'');
const sameJ=(a,b)=>{const x=norm(a),y=norm(b);return Boolean(x&&y&&(x===y||loose(a)===loose(b)));};
export function boundaryPosition(rings,point){
 if(!Array.isArray(rings)||!rings.length||!Number.isFinite(point?.lat)||!Number.isFinite(point?.lng))throw Error('Invalid boundary geometry.');
 let inside=false,distance=Infinity,count=0;const x=point.lng,y=point.lat,sx=111320*Math.cos(y*Math.PI/180),sy=111320;
 for(const ring of rings){if(!Array.isArray(ring)||ring.length<4||ring[0]?.[0]!==ring[ring.length-1]?.[0]||ring[0]?.[1]!==ring[ring.length-1]?.[1])throw Error('Incomplete boundary geometry.');for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[j],b=ring[i];if(!Array.isArray(a)||a.length<2||!Array.isArray(b)||b.length<2||!a.slice(0,2).every(Number.isFinite)||!b.slice(0,2).every(Number.isFinite)||Math.abs(a[0])>180||Math.abs(a[1])>90)throw Error('Invalid boundary coordinates.');if(++count>100000)throw Error('Boundary geometry too large.');
  if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  const ax=(a[0]-x)*sx,ay=(a[1]-y)*sy,bx=(b[0]-x)*sx,by=(b[1]-y)*sy,dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy || 1)));distance=Math.min(distance,Math.hypot(ax+t*dx,ay+t*dy));
 }}return {inside,distance_m:distance};
}
export function strictGeocode(results,address=''){
 if(!Array.isArray(results)||results.length!==1)return false;const g=results[0],parts=g.address_components || [];
 const part=type=>parts.find(c=>c.types?.includes(type))?.long_name || '';
 const street=value=>String(value).toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean).map(w=>({street:'st',road:'rd',drive:'dr',avenue:'ave',boulevard:'blvd',lane:'ln',court:'ct',parkway:'pkwy',highway:'hwy',north:'n',south:'s',east:'e',west:'w'}[w] || w)).join(' ');
 const requested=street(address.split(',')[0].replace(/\s+(apt|suite|unit|#)\s*.*$/i,'')),found=street(part('street_number')+' '+part('route'));
 const stateMatch=address.match(/(?:,\s*|\s)(Ohio|Kentucky|OH|KY)(?:\s+[0-9]{5}(?:-[0-9]{4})?)?(?:,?\s+(?:USA|United States))?\s*$/i),zipMatch=address.match(/\b([0-9]{5})(?:-[0-9]{4})?\s*$/);
 const stateMatches=stateMatch?normalizeAddressState(stateMatch[1])===normalizeAddressState(part('administrative_area_level_1')):false;
 const zipMatches=!zipMatch||zipMatch[1]===part('postal_code');
 const city=street(part('locality') || part('postal_town'));
 const streetMatches=requested===found || (!address.includes(',')&&city&&requested.startsWith(found+' '+city+' '));
 const enteredCity=address.includes(',')?address.split(',')[1].replace(/\s+(OH|Ohio|KY|Kentucky)(?:\s+[0-9]{5}(?:-[0-9]{4})?)?\s*$/i,'').trim():'';
 const formattedCity=String(g.formatted_address || '').split(',')[1]?.replace(/\s+(OH|Ohio|KY|Kentucky)(?:\s+[0-9]{5}(?:-[0-9]{4})?)?\s*$/i,'').trim();
 const cityMatches=!enteredCity||[part('locality'),part('postal_town'),formattedCity].some(value=>value&&norm(value)===norm(enteredCity));
 return Boolean(address)&&stateMatches&&zipMatches&&streetMatches&&cityMatches&&g.partial_match!==true&&g.geometry?.location_type==='ROOFTOP'&&g.types?.some(t=>['street_address','premise','subpremise'].includes(t))&&['street_number','route','administrative_area_level_1'].every(type=>parts.some(c=>c.types?.includes(type)));
}
// Staff-review rules (PermitResolutionRule): every confirmed review mints a
// reusable rule — postal names that map to a jurisdiction, parcel-confirmed
// address overrides, per-county source preferences. A matching rule resolves
// the flag class permanently instead of per address.
const addrKey=a=>norm(String(a||'').split(',')[0].replace(/\s+(apt|suite|unit|ste|#)\s*.*$/i,''));
function applyResolutionRules(rules,{enteredCity,enteredAddr,state,countyName,candidates=[],target=null}){
 if(!Array.isArray(rules)||!rules.length)return null;
 for(const r of rules){
  if(!r||r.active===false)continue;
  if(String(r.state||'').toUpperCase()!==state)continue;
  const rt=String(r.rule_type||'');
  if(rt==='postal_name_map'){
   if(!enteredCity||!sameJ(r.entered_name,enteredCity))continue;
   if(r.county&&!sameJ(r.county,countyName))continue;
  }else if(rt==='address_override'){
   if(!enteredAddr||addrKey(r.address_key)!==addrKey(enteredAddr))continue;
   if(r.county&&!sameJ(r.county,countyName))continue;
  }else if(rt==='source_preference'){
   if(r.county&&!sameJ(r.county,countyName))continue;
   const prefState=/state/i.test(String(r.preferred_source||'state'));
   const inside=candidates.filter(c=>c.inside&&c.inside_sources?.some(s=>prefState?/state/i.test(s):/census/i.test(s)));
   if(inside.length===1)return{pick:inside[0],rule:r};
   continue;
  }else continue;
  const hit=candidates.find(c=>sameJ(c.name,r.jurisdiction_name));
  if(hit)return{pick:hit,rule:r};
  if(target&&sameJ(target.name,r.jurisdiction_name))return{pick:target,rule:r};
  if(/county/i.test(String(r.jurisdiction_type||''))&&sameJ(r.jurisdiction_name,countyName))return{pick:{name:countyName,type:'county'},rule:r};
 }
 return null;
}
export async function resolveSpatialLocation({geocode,fetchJSON,onProgress=async()=>{},rules=[],enteredAddress=''}){
 const state=normalizeAddressState(geocode?.address_parts?.administrative_area_level_1).toUpperCase(),point={lat:geocode?.lat,lng:geocode?.lon};
 const base={status:'unresolved',state,point,checked_at:new Date().toISOString(),targets:[],boundaries:[],sources:[],reason:'We could not confirm the property location. An administrator needs to check it.'};
 // Not-a-real-address gate: input with no mailable street structure (phone/ID
 // numbers, plus codes, missing street numbers) is a permanent data-quality
 // reject — never a human review and never retried. Checked on the RAW street
 // part so the '+' in a plus code survives.
 const streetPartRaw=String(enteredAddress||'').split(',')[0].trim();
 const invalidReason=(()=>{
  if(!streetPartRaw)return 'Enter a numbered street address.';
  if(/^[0-9A-Z]{4}\+[0-9A-Z]{2,}/i.test(streetPartRaw))return 'This looks like a map plus-code, not a street address. Enter a numbered street address.';
  const streetPart=norm(streetPartRaw);
  if(streetPart&&!/[a-z]/.test(streetPart))return 'This looks like a phone or ID number, not a street address. Enter a numbered street address.';
  if(streetPart&&!/\d/.test(streetPart))return 'This is missing a house or street number — enter a numbered street address.';
  return null;
 })();
 if(invalidReason)return {...base,status:'invalid_input',reason:invalidReason};
 if(!Number.isFinite(point.lat)||!Number.isFinite(point.lng)||!['OH','KY'].includes(state))return {...base,status:'invalid_input',reason:'Enter a complete street address in Ohio or Kentucky.'};
 const fips=state==='OH'?'39':'21';
 async function query(kind,url){const params=new URLSearchParams({f:'json',where:'1=1',geometry:JSON.stringify({x:point.lng,y:point.lat,spatialReference:{wkid:4326}}),geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',distance:'25',units:'esriSRUnit_Meter',outFields:'*',returnGeometry:'true',outSR:'4326',resultRecordCount:'10'}),source=url+'/query?'+params;
  await onProgress({kind:'boundary_query',url:source,detail:`Checking ${kind} boundaries at ${point.lat}, ${point.lng}.`});let data;
  try{data=await fetchJSON(source);}catch(fetchErr){const errTxt=String(fetchErr.message||fetchErr).slice(0,200);base.sources.push({kind,url:source,checked_at:base.checked_at,source_error:errTxt});return {features:[],failed:true,kind,error:errTxt};}
  if(data.error||data.exceededTransferLimit||!Array.isArray(data.features)||data.features.length>10||data.features.length&&data.spatialReference?.wkid!==4326){base.sources.push({kind,url:source,checked_at:base.checked_at,source_error:'incomplete or invalid data'});return {features:[],failed:true,kind,error:'incomplete or invalid data'};}
  base.sources.push({kind,url:source,checked_at:base.checked_at});return {features:data.features.map(f=>({...f,...boundaryPosition(f.geometry?.rings,point),source_url:source,kind})),failed:false,kind};}
 try{
  const keys=[['county',LOCATION_SOURCES.county],['municipality',LOCATION_SOURCES.place],['state municipality',state==='OH'?LOCATION_SOURCES.oh_city:LOCATION_SOURCES.ky_city]];
  const rows=await Promise.all(keys.map(([kind,url])=>query(kind,url)));const [counties,places,statePlaces]=rows.map(r=>r.features);let townships=[],stateTownships=[];
  // A single-source outage degrades into the existing coverage-gap/disagreement
  // logic — but if EVERY municipal source failed, the city answer is unknowable
  // and the address must NOT fall through to the county fallback. Fail loudly so
  // the caller retries instead of silently dropping a real municipality.
  if(rows[1].failed&&rows[2].failed)throw Error('Municipal boundary services are unavailable — retryable.');
 // The geocoder's own jurisdiction claims are independent corroboration:
 // locality = the city/village the provider assigns this address, level_3 =
 // county subdivision (township in Ohio), level_2 = county. postal_town is
 // the USPS city name — it is NOT a jurisdiction claim and never picks one.
 const parts=geocode?.address_parts||{},geoLocality=parts.locality||'',geoTwp=parts.administrative_area_level_3||'',geoCounty=parts.administrative_area_level_2||'';
 // The city as the user TYPED it — postal names are normal (USPS city ≠
 // jurisdiction); a staff postal_name_map rule can still resolve them.
 const enteredCity=norm(String(enteredAddress||'').split(',')[1]?.replace(/\s+(OH|Ohio|KY|Kentucky|USA|United States)(?:\s+[0-9]{5}(?:-[0-9]{4})?)?\s*$/i,''));
 let county=counties.filter(f=>f.inside);
 // County gates before flagging: same-name sliver duplicates merge to one
 // county; a zero-hit gap adopts its single clearly-nearest county inside the
 // geocode-edge distance. Only a genuine multi-county overlap or an empty
 // no-man's-land stays a review case.
 if(county.length>1){const merged=[...new Set(county.map(f=>loose(f.attributes.NAME)))];if(merged.length===1)county=[county[0]];}
 if(county.length===0){const near=counties.filter(f=>String(f.attributes.STATE)===fips).sort((a,b)=>(a.distance_m||0)-(b.distance_m||0));if(near.length&&near[0].distance_m<=(geocode.approximate_source?150:25)&&(near.length===1||near[0].distance_m<near[1].distance_m))county=[near[0]];}
 if(county.length!==1){
  const countyCands=counties.filter(f=>String(f.attributes.STATE)===fips).map(f=>({name:f.attributes.NAME,state,type:'county',geoid:String(f.attributes.GEOID||''),county:f.attributes.NAME,inside:!!f.inside,distance_m:Math.round(f.distance_m||0),supported_by:['Census county boundary']}));
  // Review rules last-word gate: a confirmed postal/parcel/source rule can
  // still decide a county-line flag.
  const cr=applyResolutionRules(rules,{enteredCity,enteredAddr:enteredAddress,state,countyName:geoCounty,candidates:countyCands});
  if(cr){const f=counties.find(x=>sameJ(x.attributes.NAME,cr.pick.name));if(f)county=[f];}
  if(county.length!==1){
   if(countyCands.length)return {...base,status:'needs_review',reason:'This address sits on or near a county line — the map cannot decide between these counties. Pick the correct one.',candidates:countyCands,target:null};
   throw Error('County/state location is missing or conflicting.');
  }
 }
 if(String(county[0].attributes.STATE)!==fips||!new RegExp('^'+fips+'[0-9]{3}$').test(String(county[0].attributes.GEOID)))throw Error('County/state location is missing or conflicting.');
 const countyRow=county[0],countyName=countyRow.attributes.NAME,countyId=countyRow.attributes.GEOID;
 const cities=places.filter(f=>f.inside),stateCities=statePlaces.filter(f=>f.inside);let target;
 // Merge every municipality either source returned into honest candidates so
 // a disagreement shows the user the real choices instead of dead-ending.
 const stateSrc=(state==='OH'?'Ohio':'Kentucky')+' state municipal boundary';
 const muniCands=[];
 const addMuni=(f,src)=>{const name=String(f.attributes.NAME||f.attributes.municipality||'').replace(/\s+(city|village|town)$/i,'').trim();if(!name)return;const ex=muniCands.find(c=>sameJ(c.name,name));if(ex){if(!ex.supported_by.includes(src))ex.supported_by.push(src);if(f.inside&&!ex.inside_sources.includes(src))ex.inside_sources.push(src);ex.inside=ex.inside||!!f.inside;ex.geoid=ex.geoid||String(f.attributes.GEOID||'');ex.distance_m=Math.min(ex.distance_m,Math.round(f.distance_m||0));}else muniCands.push({name,state,type:'municipality',geoid:String(f.attributes.GEOID||''),county:countyName,county_geoid:countyId,inside:!!f.inside,distance_m:Math.round(f.distance_m||0),supported_by:[src],inside_sources:f.inside?[src]:[]});};
 places.forEach(f=>addMuni(f,'Census municipal boundary'));statePlaces.forEach(f=>addMuni(f,stateSrc));
 // Municipality consensus gates — run BEFORE flagging:
 //  1. Every returned feature merged to a single name → sources agree modulo
 //     spelling (St./Saint, Sugar Creek/Sugarcreek) — not a conflict.
 //  2. Exactly one candidate is inside across sources → the others are just
 //     near hits; the inside hit wins.
 //  3. Overlap conflict → the authoritative state municipal layer decides
 //     (OGRIP carries official annexations; Census place boundaries lag).
 //  4. Still tied → the geocoder's locality claim picks a side.
 const insideMuni=muniCands.filter(c=>c.inside&&c.inside_sources.length);
 let muniPick=null;
 if(muniCands.length===1&&insideMuni.length)muniPick=muniCands[0];
 else if(insideMuni.length===1)muniPick=insideMuni[0];
 else if(insideMuni.length>1){
  const stOnly=insideMuni.filter(c=>c.inside_sources.includes(stateSrc));
  if(stOnly.length===1)muniPick=stOnly[0];
  else{const hit=insideMuni.find(c=>sameJ(c.name,geoLocality));if(hit)muniPick=hit;}
 }
 let pickVia='source_consensus';
 if(!muniPick&&(cities.length||stateCities.length)){
  // Review rules last-word gate before the municipal flag stands.
  const mr=applyResolutionRules(rules,{enteredCity,enteredAddr:enteredAddress,state,countyName,candidates:muniCands});
  if(mr){muniPick=mr.pick;pickVia='resolution_rule';}
 }
 if(muniPick){
  const feat=[...places,...statePlaces].find(f=>f.inside&&sameJ(String(f.attributes.NAME||f.attributes.municipality||'').replace(/\s+(city|village|town)$/i,''),muniPick.name));
  const censFeat=places.find(f=>sameJ(String(f.attributes.NAME||'').replace(/\s+(city|village|town)$/i,''),muniPick.name));
  const best=feat||censFeat;
  target={name:muniPick.name,state,type:'municipality',geoid:String(censFeat?.attributes.GEOID||muniPick.geoid||''),county:countyName,county_geoid:countyId,geometry:best?.geometry,source_url:best?.source_url,resolved_by:pickVia};
 }else if(cities.length||stateCities.length){
  if(muniCands.length)return {...base,status:'needs_review',reason:'Official boundary sources disagree about the municipality here. Pick the correct jurisdiction below.',candidates:muniCands,target:null};
  throw Error('Official boundary sources disagree about the municipality.');
 }
 else if(state==='OH'){const twpRows=await Promise.all([query('township',LOCATION_SOURCES.township),query('state township',LOCATION_SOURCES.oh_township)]);townships=twpRows[0].features;stateTownships=twpRows[1].features;if(twpRows[0].failed&&twpRows[1].failed)throw Error('Township boundary services are unavailable — retryable.');
  // Township consensus gates: same-name merge first (Sugarcreek/SUGAR CREEK),
  // then inside-consensus, then the state township layer, then the geocoder's
  // county-subdivision claim — flags only a genuine multi-township conflict.
  const twpCands=[];const addTwp=(f,nm,src)=>{const name=String(nm||'').trim();if(!name)return;const ex=twpCands.find(c=>sameJ(c.name,name));if(ex){if(!ex.supported_by.includes(src))ex.supported_by.push(src);if(f.inside&&!ex.inside_sources.includes(src))ex.inside_sources.push(src);ex.inside=ex.inside||!!f.inside;ex.geoid=ex.geoid||String(f.attributes.GEOID||'');ex.distance_m=Math.min(ex.distance_m,Math.round(f.distance_m||0));}else twpCands.push({name,state,type:'township',geoid:String(f.attributes.GEOID||''),county:countyName,inside:!!f.inside,distance_m:Math.round(f.distance_m||0),supported_by:[src],inside_sources:f.inside?[src]:[]});};
  townships.filter(f=>/\btownship$/i.test(f.attributes.NAME)).forEach(f=>addTwp(f,f.attributes.NAME,'Census township boundary'));stateTownships.forEach(f=>addTwp(f,f.attributes.TOWNSHIP,'Ohio state township boundary'));
  const insideTwp=twpCands.filter(c=>c.inside&&c.inside_sources.length);let twpPick=null;
  if(twpCands.length===1&&insideTwp.length)twpPick=twpCands[0];
  else if(insideTwp.length===1)twpPick=insideTwp[0];
  else if(insideTwp.length>1){const stOnly=insideTwp.filter(c=>c.inside_sources.includes('Ohio state township boundary'));if(stOnly.length===1)twpPick=stOnly[0];else{const hit=insideTwp.find(c=>sameJ(c.name,geoTwp));if(hit)twpPick=hit;}}
  if(!twpPick){const tr=applyResolutionRules(rules,{enteredCity,enteredAddr:enteredAddress,state,countyName,candidates:twpCands});if(tr)twpPick=tr.pick;}
  if(!twpPick){if(twpCands.length)return {...base,status:'needs_review',reason:'Official boundary sources disagree about the township here. Pick the correct jurisdiction below.',candidates:twpCands,target:null};throw Error('Township location is missing or conflicting.');}
  const tf=[...townships,...stateTownships].find(f=>f.inside&&sameJ(String(f.attributes.NAME||f.attributes.TOWNSHIP||''),twpPick.name)),censT=townships.find(f=>sameJ(String(f.attributes.NAME||''),twpPick.name));
  target={name:twpPick.name,state,type:'township',geoid:String(censT?.attributes.GEOID||twpPick.geoid||''),county:countyName,county_geoid:countyId,geometry:(tf||censT)?.geometry,source_url:(tf||censT)?.source_url,resolved_by:'source_consensus'};}
 else target={name:countyName,state,type:'county',geoid:countyId,county:countyName,county_geoid:countyId,geometry:countyRow.geometry,source_url:countyRow.source_url};
 // County-authority layer: a county_gis_layer rule registers the county's own
 // GIS boundary service for a decision level (e.g. civil townships). Counties
 // draw their own civil boundaries — Census TIGER lines lag annexations, so a
 // county GIS hit outranks TIGER for that level. preferred_source = ArcGIS
 // query URL template with {lon}/{lat}; geoid = the name field to read.
 const gisRule=(rules||[]).find(r=>r&&r.active!==false&&String(r.state||'').toUpperCase()===state&&r.rule_type==='county_gis_layer'&&sameJ(r.county,countyName)&&sameJ(String(r.jurisdiction_type||''),String(target?.type||'')));
 let gisDecided=false;
 if(gisRule&&target){
  try{
   const url=String(gisRule.preferred_source||'').replace('{lon}',point.lng).replace('{lat}',point.lat);
   const gj=await fetchJSON(url);
   const hit=(gj?.features||[]).map(f=>String(f?.attributes?.[gisRule.geoid||'NAME']||'').trim()).find(Boolean)||'';
   if(hit){
    gisDecided=true;
    if(sameJ(hit,target.name)){target={...target,county_gis:hit};}
    else{const prev=target.name;const gf=[...counties,...places,...statePlaces,...(townships||[]),...(stateTownships||[])].find(f=>sameJ(String(f.attributes.NAME||f.attributes.municipality||f.attributes.TOWNSHIP||''),hit));target={...target,name:hit,county_gis:hit,resolved_by:'county_gis',geometry:gf?.geometry||target.geometry,geoid:gf?String(gf.attributes.GEOID||target.geoid):target.geoid};await onProgress({kind:'boundary',detail:'County GIS places this in '+hit+' — overriding the Census '+prev+' boundary.'});}
   }
  }catch{/* county service down — fall through to Census logic */}
 }
 base.targets=[{...target,geometry:undefined},{name:countyName,state,type:'county',geoid:countyId,county:countyName}].filter((t,i,all)=>all.findIndex(other=>other.geoid===t.geoid)===i);
 // Separate LineStrings preserve multipart and hole outlines without assuming ring orientation.
 // The containing county's ring rides along as a context feature — targets
 // already names it, so the map can draw the county line around the pick.
 base.boundaries=[{type:'Feature',properties:{name:target.name,type:target.type,role:'target',source_url:target.source_url},geometry:{type:'MultiLineString',coordinates:target.geometry.rings}},
 ...(target.type==='county'||!countyRow?.geometry?.rings?[]:[{type:'Feature',properties:{name:countyName,type:'county',role:'context',source_url:countyRow.source_url},geometry:{type:'MultiLineString',coordinates:countyRow.geometry.rings}}])];
 // A near feature that names the SAME jurisdiction as the resolved target is
 // the boundary drawn twice by two sources — not the edge of another place.
 const featName=f=>String(f.attributes.NAME||f.attributes.municipality||f.attributes.TOWNSHIP||'');
 const relevant=[...counties,...places,...statePlaces,...(cities.length===0&&stateCities.length===0?[...townships,...stateTownships]:[])].filter(f=>!sameJ(featName(f),target.name));
 // Boundary-adjacent jurisdictions, typed by source layer — the candidate set
 // a review rule may pick from at the edge/approx sites. A rule still can't
 // conjure a jurisdiction the boundary data never saw, but it CAN choose the
 // neighboring place the pin almost touched (e.g. county GIS puts the parcel
 // in the next township over and TIGER's line is wrong).
 const nearCands=[];const addNear=(f,type)=>{const name=featName(f);if(!name||nearCands.some(c=>sameJ(c.name,name)))return;nearCands.push({name,state,type,geoid:String(f.attributes.GEOID||''),county:countyName,distance_m:Math.round(f.distance_m||0),inside:false});};
 counties.forEach(f=>addNear(f,'county'));places.forEach(f=>addNear(f,'municipality'));statePlaces.forEach(f=>addNear(f,'municipality'));(townships||[]).forEach(f=>addNear(f,'township'));(stateTownships||[]).forEach(f=>addNear(f,'township'));
 // Approximate geocodes (e.g. the free Census locator interpolating a street
 // range) can still confirm jurisdiction — but only when the point sits well
 // inside every checked boundary. The 150m guard covers street-range
 // interpolation error; an exact provider result keeps the 25m edge check.
 const edge=geocode.approximate_source?150:25;
 if(!geocode.location_exact&&!geocode.approximate_source){
  // Same corroboration ladder as the boundary-edge gate: the geocoder's own
  // jurisdiction claim at the target's level, then the entered-city match,
  // then review rules — flag only when no independent evidence agrees.
  const geoClaim=target.type==='municipality'?geoLocality:target.type==='township'?geoTwp:target.type==='county'?geoCounty:'';
  if(target&&geoClaim&&sameJ(geoClaim,target.name))
   return {...base,status:'location_verified',reason:'Map position is approximate, but the geocoder independently places this address in '+target.name+' — resolving to '+target.name+'. Spot-check the pin on the map.',target:base.targets[0],corroborated_by:'geocoder_jurisdiction'};
  // NOTE: enteredCity is deliberately NOT a corroborator here — unlike the
  // rooftop-pin edge site, an interpolated pin's position is itself unproven,
  // so entered city + inside-boundary agreeing can be wrong together (USPS
  // naming and interpolation share the same bias). Only the geocoder's own
  // jurisdiction claim or a staff rule can rescue an approximate pin.
  const ar=applyResolutionRules(rules,{enteredCity,enteredAddr:enteredAddress,state,countyName,candidates:nearCands,target});
  if(ar)return {...base,status:'location_verified',reason:'Map position is approximate, but a confirmed review rule places this address in '+ar.pick.name+' — resolving to '+ar.pick.name+'. Spot-check the pin on the map.',target:ar.pick,corroborated_by:'resolution_rule'};
  return {...base,status:'needs_review',target:base.targets[0],reason:'The map found an approximate address. We cannot confirm its jurisdiction yet.'};
 }
 // When the county's own GIS already adjudicated this level, a near Census
 // feature is TIGER's line disagreeing with the county — not a real edge.
 if(!gisDecided&&relevant.some(f=>f.distance_m<=edge)){
  // Edge gates before flagging — independent corroboration resolves the pin:
  //  1. The geocoder's own jurisdiction claim for this level agrees with the
  //     geometry (locality for cities, level_3 for townships, level_2 for
  //     counties). postal_town is USPS naming — never evidence.
  //  2. The entered city text matching the inside municipality still rescues.
  const geoLocalityClaim=norm(parts.locality||'');
  const geoClaim=target.type==='municipality'?geoLocality:target.type==='township'?geoTwp:target.type==='county'?geoCounty:'';
  if(target&&geoClaim&&sameJ(geoClaim,target.name))
   return {...base,status:'location_verified',reason:'The map pin sits close to a boundary, but the geocoder independently places this address in '+target.name+' — resolving to '+target.name+'. Spot-check the pin on the map.',target:base.targets[0],corroborated_by:'geocoder_jurisdiction'};
  if(target&&target.type==='municipality'&&enteredCity&&sameJ(enteredCity,target.name))
   return {...base,status:'location_verified',reason:'The map pin sits close to a boundary, but the address\'s own city matches the '+target.name+' boundary containing it — resolving to '+target.name+'. Spot-check the pin on the map.',target:base.targets[0],corroborated_by:'entered_city_name'};
  // Review rules last-word gate before the edge flag stands.
  const er=applyResolutionRules(rules,{enteredCity,enteredAddr:enteredAddress,state,countyName,candidates:nearCands,target});
  if(er)return {...base,status:'location_verified',reason:'The map pin sits close to a boundary, but a confirmed review rule places this address in '+er.pick.name+' — resolving to '+er.pick.name+'. Spot-check the pin on the map.',target:er.pick,corroborated_by:'resolution_rule'};
  return {...base,status:'needs_review',target:base.targets[0],reason:'This address is close to a boundary. An administrator must confirm the property before it is used.'};
 }
  if(!geocode.location_exact)return {...base,status:'location_verified',reason:`Approximate map position is inside the checked ${target.name} government boundary. An administrator should spot-check the pin; office responsibility is checked separately.`,target:base.targets[0]};
  return {...base,status:'location_verified',reason:`Building location is inside the checked ${target.name} government boundary. Office responsibility is checked separately.`,target:base.targets[0]};
 }catch(error){await onProgress({kind:'boundary_failed',detail:String(error.message || error)});return {...base,reason:'Government location data could not confirm this address. No jurisdiction was selected.',error:String(error.message || error)};}
}
export function exactConfiguredLocality(localities,resolution,profiles=[]){
 if(resolution?.status!=='location_verified'||!resolution.target)return null;const target=resolution.target;
 const matches=localities.filter(row=>{if(normalizeAddressState(row.state).toUpperCase()!==target.state||!sameJ(row.name,target.name))return false;
  const township=/township/i.test(row.name),county=/county$/i.test(String(row.name).trim());if(target.type==='county'&&!county||target.type!=='county'&&county)return false;if(target.type==='township'&&!township||target.type!=='township'&&township)return false;
  if(row.geographic_identity?.geoid)return row.geographic_identity.geoid===target.geoid;
  if(target.type!=='county'){const profile=profiles.find(p=>p.id===row.jurisdiction_profile_id),county=row.county || row.parent_county?.name || profile?.parent_county?.name;return sameJ(county,target.county);}
  return true;});return matches.length===1?matches[0]:null;
}
