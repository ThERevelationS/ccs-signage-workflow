import {normalizeAddressState} from './permittingAddressState.js';
const CENSUS='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb';
export const LOCATION_SOURCES={county:`${CENSUS}/State_County/MapServer/1`,place:`${CENSUS}/Places_CouSub_ConCity_SubMCD/MapServer/4`,township:`${CENSUS}/Places_CouSub_ConCity_SubMCD/MapServer/1`,oh_city:'https://maps.ohio.gov/arcgis/rest/services/Hosted/Ohio_Municipal_Boundaries/FeatureServer/0',oh_township:'https://maps.ohio.gov/arcgis/rest/services/OGRIP/boundaryData/MapServer/3',ky_city:'https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_CityBnd_Polygon_WGS84WM/MapServer/0'};
const norm=value=>String(value || '').trim().toLowerCase().replace(/^(city|village|town) of\s+/,'').replace(/\s+(city|village|town|county|township)$/,'').replace(/\s+/g,' ');
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
export async function resolveSpatialLocation({geocode,fetchJSON,onProgress=async()=>{}}){
 const state=normalizeAddressState(geocode?.address_parts?.administrative_area_level_1).toUpperCase(),point={lat:geocode?.lat,lng:geocode?.lon};
 const base={status:'unresolved',state,point,checked_at:new Date().toISOString(),targets:[],boundaries:[],sources:[],reason:'We could not confirm the property location. An administrator needs to check it.'};
 if(!Number.isFinite(point.lat)||!Number.isFinite(point.lng)||!['OH','KY'].includes(state))return {...base,reason:'Enter a complete street address in Ohio or Kentucky.'};
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
  const county=counties.filter(f=>f.inside);
  // Conflicting or missing county coverage is a legitimate state: the pin sits
  // on a county line (or in a boundary gap). Return every candidate the
  // official services returned — never silently pick one.
  if(county.length!==1){
   const countyCands=counties.filter(f=>String(f.attributes.STATE)===fips).map(f=>({name:f.attributes.NAME,state,type:'county',geoid:String(f.attributes.GEOID||''),county:f.attributes.NAME,inside:!!f.inside,distance_m:Math.round(f.distance_m||0),supported_by:['Census county boundary']}));
   if(countyCands.length)return {...base,status:'needs_review',reason:'This address sits on or near a county line — the map cannot decide between these counties. Pick the correct one.',candidates:countyCands,target:null};
   throw Error('County/state location is missing or conflicting.');
  }
  if(String(county[0].attributes.STATE)!==fips||!new RegExp('^'+fips+'[0-9]{3}$').test(String(county[0].attributes.GEOID)))throw Error('County/state location is missing or conflicting.');
  const countyRow=county[0],countyName=countyRow.attributes.NAME,countyId=countyRow.attributes.GEOID;
  const cities=places.filter(f=>f.inside),stateCities=statePlaces.filter(f=>f.inside);let target;
  // Merge every municipality either source returned into honest candidates so
  // a disagreement shows the user the real choices instead of dead-ending.
  const stateSrc=(state==='OH'?'Ohio':'Kentucky')+' state municipal boundary';
  const muniCands=[];
  const addMuni=(f,src)=>{const name=String(f.attributes.NAME||f.attributes.municipality||'').replace(/\s+(city|village|town)$/i,'').trim();if(!name)return;const ex=muniCands.find(c=>norm(c.name)===norm(name));if(ex){if(!ex.supported_by.includes(src))ex.supported_by.push(src);if(f.inside&&!ex.inside_sources.includes(src))ex.inside_sources.push(src);ex.inside=ex.inside||!!f.inside;ex.geoid=ex.geoid||String(f.attributes.GEOID||'');ex.distance_m=Math.min(ex.distance_m,Math.round(f.distance_m||0));}else muniCands.push({name,state,type:'municipality',geoid:String(f.attributes.GEOID||''),county:countyName,county_geoid:countyId,inside:!!f.inside,distance_m:Math.round(f.distance_m||0),supported_by:[src],inside_sources:f.inside?[src]:[]});};
  places.forEach(f=>addMuni(f,'Census municipal boundary'));statePlaces.forEach(f=>addMuni(f,stateSrc));
  let coverageGap=false;
  if(cities.length>1||stateCities.length>1){
   if(muniCands.length)return {...base,status:'needs_review',reason:'Official boundary sources disagree about the municipality here. Pick the correct jurisdiction below.',candidates:muniCands,target:null};
   throw Error('Official boundary sources disagree about the municipality.');
  }
  if(cities.length!==stateCities.length){
   if(muniCands.length===1){
    // Coverage gap, not an identity conflict: every returned feature names the
    // same municipality, one source just doesn't cover this pin (typically a
    // Census place boundary lagging a state-recorded annexation). The state
    // municipal layer is authoritative for membership — resolve from the
    // containing source and flag the gap on the target.
    const s=stateCities[0]||cities[0];
    const nm=String(s.attributes.NAME||s.attributes.municipality||'').replace(/\s+(city|village|town)$/i,'').trim();
    const sameNameCensus=cities[0]||places.find(f=>norm(String(f.attributes.NAME||'').replace(/\s+(city|village|town)$/i,''))===norm(nm));
    target={name:nm,state,type:'municipality',geoid:String(sameNameCensus?.attributes.GEOID||''),county:countyName,county_geoid:countyId,geometry:s.geometry,source_url:s.source_url,coverage_note:'One boundary source does not yet cover this spot — the state municipal boundary was used.'};
    coverageGap=true;
   }else if(muniCands.length)return {...base,status:'needs_review',reason:'Official boundary sources disagree about the municipality here. Pick the correct jurisdiction below.',candidates:muniCands,target:null};
   else throw Error('Official boundary sources disagree about the municipality.');
  }
  else if(cities.length===1){const c=cities[0],s=stateCities[0],sName=s.attributes.municipality || s.attributes.NAME;if(String(c.attributes.STATE)!==fips||!new RegExp('^'+fips+'[0-9]{5}$').test(String(c.attributes.GEOID))||norm(c.attributes.NAME)!==norm(sName)){if(muniCands.length)return {...base,status:'needs_review',reason:'Official boundary sources name different municipalities here. Pick the correct jurisdiction below.',candidates:muniCands,target:null};throw Error('Official municipal identities disagree.');}target={name:c.attributes.NAME.replace(/\s+(city|village|town)$/i,''),state,type:'municipality',geoid:c.attributes.GEOID,county:countyName,county_geoid:countyId,geometry:c.geometry,source_url:s.source_url};}
  else if(state==='OH'){const twpRows=await Promise.all([query('township',LOCATION_SOURCES.township),query('state township',LOCATION_SOURCES.oh_township)]);townships=twpRows[0].features;stateTownships=twpRows[1].features;if(twpRows[0].failed&&twpRows[1].failed)throw Error('Township boundary services are unavailable — retryable.');const t=townships.filter(f=>f.inside&&/\btownship$/i.test(f.attributes.NAME)),s=stateTownships.filter(f=>f.inside);if(t.length!==1||s.length!==1||String(t[0].attributes.STATE)!==fips||!new RegExp('^'+countyId+'[0-9]{5}$').test(String(t[0].attributes.GEOID))||norm(t[0].attributes.NAME)!==norm(s[0].attributes.TOWNSHIP)||norm(countyName)!==norm(s[0].attributes.COUNTY)){const twpCands=[...townships.filter(f=>/\btownship$/i.test(f.attributes.NAME)).map(f=>({name:f.attributes.NAME,state,type:'township',geoid:String(f.attributes.GEOID||''),county:countyName,inside:!!f.inside,distance_m:Math.round(f.distance_m||0),supported_by:['Census township boundary'],inside_sources:f.inside?['Census township boundary']:[]})),...stateTownships.map(f=>({name:String(f.attributes.TOWNSHIP||'').trim(),state,type:'township',geoid:'',county:countyName,inside:!!f.inside,distance_m:Math.round(f.distance_m||0),supported_by:['Ohio state township boundary'],inside_sources:f.inside?['Ohio state township boundary']:[]}))].filter(c=>c.name);if(twpCands.length)return {...base,status:'needs_review',reason:'Official boundary sources disagree about the township here. Pick the correct jurisdiction below.',candidates:twpCands,target:null};throw Error('Township location is missing or conflicting.');}target={name:t[0].attributes.NAME,state,type:'township',geoid:t[0].attributes.GEOID,county:countyName,county_geoid:countyId,geometry:t[0].geometry,source_url:s[0].source_url};}
  else target={name:countyName,state,type:'county',geoid:countyId,county:countyName,county_geoid:countyId,geometry:countyRow.geometry,source_url:countyRow.source_url};
  base.targets=[{...target,geometry:undefined},{name:countyName,state,type:'county',geoid:countyId,county:countyName}].filter((t,i,all)=>all.findIndex(other=>other.geoid===t.geoid)===i);
  // Separate LineStrings preserve multipart and hole outlines without assuming ring orientation.
  base.boundaries=[{type:'Feature',properties:{name:target.name,source_url:target.source_url},geometry:{type:'MultiLineString',coordinates:target.geometry.rings}}];
  // In a coverage gap, the not-inside polygon is the same-name artifact whose
  // edge caused the gap — it must not trigger the proximity check. Everywhere
  // else all returned features count.
  const muniRelevant=coverageGap?[...places,...statePlaces].filter(f=>f.inside):[...places,...statePlaces];
  const relevant=[...counties,...muniRelevant,...(cities.length===0&&stateCities.length===0?[...townships,...stateTownships]:[])];
  // Approximate geocodes (e.g. the free Census locator interpolating a street
  // range) can still confirm jurisdiction — but only when the point sits well
  // inside every checked boundary. The 150m guard covers street-range
  // interpolation error; an exact provider result keeps the 25m edge check.
  const edge=geocode.approximate_source?150:25;
  if(!geocode.location_exact&&!geocode.approximate_source)return {...base,status:'needs_review',target:base.targets[0],reason:'The map found an approximate address. We cannot confirm its jurisdiction yet.'};
  if(relevant.some(f=>f.distance_m<=edge)){
   // A near-edge pin is not a guess when the address's own city text
   // corroborates the boundary it landed in — the entered city name is
   // independent evidence. Applies to municipal targets only; a city name
   // can never prove which township a parcel sits in.
   const enteredCity=norm(geocode?.address_parts?.locality||geocode?.address_parts?.postal_town||'');
   if(target&&target.type==='municipality'&&enteredCity&&enteredCity===norm(target.name))
    return {...base,status:'location_verified',reason:`The map pin sits close to a boundary, but the address's own city matches the ${target.name} boundary containing it — resolving to ${target.name}. Spot-check the pin on the map.`,target:base.targets[0],corroborated_by:'entered_city_name'};
   return {...base,status:'needs_review',target:base.targets[0],reason:'This address is close to a boundary. An administrator must confirm the property before it is used.'};
  }
  if(!geocode.location_exact)return {...base,status:'location_verified',reason:`Approximate map position is inside the checked ${target.name} government boundary. An administrator should spot-check the pin; office responsibility is checked separately.`,target:base.targets[0]};
  return {...base,status:'location_verified',reason:`Building location is inside the checked ${target.name} government boundary. Office responsibility is checked separately.`,target:base.targets[0]};
 }catch(error){await onProgress({kind:'boundary_failed',detail:String(error.message || error)});return {...base,reason:'Government location data could not confirm this address. No jurisdiction was selected.',error:String(error.message || error)};}
}
export function exactConfiguredLocality(localities,resolution,profiles=[]){
 if(resolution?.status!=='location_verified'||!resolution.target)return null;const target=resolution.target;
 const matches=localities.filter(row=>{if(normalizeAddressState(row.state).toUpperCase()!==target.state||norm(row.name)!==norm(target.name))return false;
  const township=/township/i.test(row.name),county=/county$/i.test(String(row.name).trim());if(target.type==='county'&&!county||target.type!=='county'&&county)return false;if(target.type==='township'&&!township||target.type!=='township'&&township)return false;
  if(row.geographic_identity?.geoid)return row.geographic_identity.geoid===target.geoid;
  if(target.type!=='county'){const profile=profiles.find(p=>p.id===row.jurisdiction_profile_id),county=row.county || row.parent_county?.name || profile?.parent_county?.name;return norm(county)===norm(target.county);}
  return true;});return matches.length===1?matches[0]:null;
}
