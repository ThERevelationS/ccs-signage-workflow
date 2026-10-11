import {normalizeAddressState} from './permittingAddressState.js';
const CENSUS='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb';
export const LOCATION_SOURCES={county:`${CENSUS}/State_County/MapServer/1`,place:`${CENSUS}/Places_CouSub_ConCity_SubMCD/MapServer/4`,township:`${CENSUS}/Places_CouSub_ConCity_SubMCD/MapServer/1`,oh_city:'https://maps.ohio.gov/arcgis/rest/services/Hosted/Ohio_Municipal_Boundaries/FeatureServer/0',oh_township:'https://maps.ohio.gov/arcgis/rest/services/OGRIP/boundaryData/MapServer/3',ky_city:'https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_CityBnd_Polygon_WGS84WM/MapServer/0'};
const norm=value=>String(value || '').trim().toLowerCase().replace(/^(city|village|town) of\s+/,'').replace(/\s+(city|village|town|county|township)$/,'').replace(/\s+/g,' ');
export function boundaryPosition(rings,point){
 if(!Array.isArray(rings)||!rings.length||!Number.isFinite(point?.lat)||!Number.isFinite(point?.lng))throw Error('Invalid boundary geometry.');
 let inside=false,distance=Infinity,count=0;const x=point.lng,y=point.lat,sx=111320*Math.cos(y*Math.PI/180),sy=111320;
 for(const ring of rings){if(!Array.isArray(ring)||ring.length<4)throw Error('Incomplete boundary geometry.');for(let i=0,j=ring.length-1;i<ring.length;j=i++){
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
 const city=street(part('locality') || part('postal_town'));
 const streetMatches=requested===found || (!address.includes(',')&&city&&requested.startsWith(found+' '+city+' '));
 return Boolean(address)&&streetMatches&&g.partial_match!==true&&g.geometry?.location_type==='ROOFTOP'&&g.types?.some(t=>['street_address','premise','subpremise'].includes(t))&&['street_number','route','administrative_area_level_1'].every(type=>parts.some(c=>c.types?.includes(type)));
}
export async function resolveSpatialLocation({geocode,fetchJSON,onProgress=async()=>{}}){
 const state=normalizeAddressState(geocode?.address_parts?.administrative_area_level_1).toUpperCase(),point={lat:geocode?.lat,lng:geocode?.lon};
 const base={status:'unresolved',state,point,checked_at:new Date().toISOString(),targets:[],boundaries:[],sources:[],reason:'We could not confirm the property location. An administrator needs to check it.'};
 if(!Number.isFinite(point.lat)||!Number.isFinite(point.lng)||!['OH','KY'].includes(state))return {...base,reason:'Enter a complete street address in Ohio or Kentucky.'};
 const fips=state==='OH'?'39':'21';
 async function query(kind,url){const params=new URLSearchParams({f:'json',where:'1=1',geometry:JSON.stringify({x:point.lng,y:point.lat,spatialReference:{wkid:4326}}),geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',distance:'25',units:'esriSRUnit_Meter',outFields:'*',returnGeometry:'true',outSR:'4326',resultRecordCount:'10'}),source=url+'/query?'+params;
  await onProgress({kind:'boundary_query',url:source,detail:`Checking ${kind} boundaries at ${point.lat}, ${point.lng}.`});const data=await fetchJSON(source);
  if(data.error||data.exceededTransferLimit||!Array.isArray(data.features)||data.features.length>10||data.features.length&&data.spatialReference?.wkid!==4326)throw Error(`${kind} boundary service returned incomplete or invalid data.`);
  base.sources.push({kind,url:source,checked_at:base.checked_at});return data.features.map(f=>({...f,...boundaryPosition(f.geometry?.rings,point),source_url:source,kind}));}
 try{
  const keys=[['county',LOCATION_SOURCES.county],['municipality',LOCATION_SOURCES.place],['state municipality',state==='OH'?LOCATION_SOURCES.oh_city:LOCATION_SOURCES.ky_city],...(state==='OH'?[['township',LOCATION_SOURCES.township],['state township',LOCATION_SOURCES.oh_township]]:[])];
  const rows=[];for(const [kind,url] of keys)rows.push(await query(kind,url));const [counties,places,statePlaces,townships=[],stateTownships=[]]=rows;
  const county=counties.filter(f=>f.inside);if(county.length!==1||String(county[0].attributes.STATE)!==fips)throw Error('County/state location is missing or conflicting.');
  const countyRow=county[0],countyName=countyRow.attributes.NAME,countyId=countyRow.attributes.GEOID;
  const cities=places.filter(f=>f.inside),stateCities=statePlaces.filter(f=>f.inside);let target;
  if(cities.length>1||stateCities.length>1||cities.length!==stateCities.length)throw Error('Official boundary sources disagree about the municipality.');
  if(cities.length===1){const c=cities[0],s=stateCities[0],sName=s.attributes.municipality || s.attributes.NAME;if(String(c.attributes.STATE)!==fips||norm(c.attributes.NAME)!==norm(sName))throw Error('Official municipal identities disagree.');target={name:c.attributes.NAME.replace(/\s+(city|village|town)$/i,''),state,type:'municipality',geoid:c.attributes.GEOID,county:countyName,county_geoid:countyId,geometry:c.geometry,source_url:s.source_url};}
  else if(state==='OH'){const t=townships.filter(f=>f.inside&&/\btownship$/i.test(f.attributes.NAME)),s=stateTownships.filter(f=>f.inside);if(t.length!==1||s.length!==1||String(t[0].attributes.STATE)!==fips||norm(t[0].attributes.NAME)!==norm(s[0].attributes.TOWNSHIP)||norm(countyName)!==norm(s[0].attributes.COUNTY))throw Error('Township location is missing or conflicting.');target={name:t[0].attributes.NAME,state,type:'township',geoid:t[0].attributes.GEOID,county:countyName,county_geoid:countyId,geometry:t[0].geometry,source_url:s[0].source_url};}
  else target={name:countyName,state,type:'county',geoid:countyId,county:countyName,county_geoid:countyId,geometry:countyRow.geometry,source_url:countyRow.source_url};
  base.targets=[{...target,geometry:undefined},{name:countyName,state,type:'county',geoid:countyId,county:countyName}].filter((t,i,all)=>all.findIndex(other=>other.geoid===t.geoid)===i);
  // Separate LineStrings preserve multipart and hole outlines without assuming ring orientation.
  base.boundaries=[{type:'Feature',properties:{name:target.name,source_url:target.source_url},geometry:{type:'MultiLineString',coordinates:target.geometry.rings}}];
  const relevant=[...counties,...places,...statePlaces,...(cities.length===0?[...townships,...stateTownships]:[])];
  if(!geocode.location_exact)return {...base,status:'needs_review',reason:'The map found an approximate address. We cannot confirm its jurisdiction yet.'};
  if(relevant.some(f=>f.distance_m<=25))return {...base,status:'needs_review',reason:'This address is close to a boundary. An administrator must confirm the property before it is used.'};
  return {...base,status:'location_verified',reason:`Building location is inside the checked ${target.name} government boundary. Office responsibility is checked separately.`,target:base.targets[0]};
 }catch(error){await onProgress({kind:'boundary_failed',detail:String(error.message || error)});return {...base,reason:'Government location data could not confirm this address. No jurisdiction was selected.',error:String(error.message || error)};}
}
export function exactConfiguredLocality(localities,resolution,profiles=[]){
 if(resolution?.status!=='location_verified'||!resolution.target)return null;const target=resolution.target;
 const matches=localities.filter(row=>{if(normalizeAddressState(row.state).toUpperCase()!==target.state||norm(row.name)!==norm(target.name))return false;
  const township=/township/i.test(row.name),county=/county$/i.test(String(row.name).trim());if(target.type==='county'&&!county||target.type!=='county'&&county)return false;if(target.type==='township'&&!township||target.type!=='township'&&township)return false;
  if(row.geographic_identity?.geoid)return row.geographic_identity.geoid===target.geoid;
  if(target.type==='township'){const profile=profiles.find(p=>p.id===row.jurisdiction_profile_id),county=row.county || row.parent_county?.name || profile?.parent_county?.name;return norm(county)===norm(target.county);}
  return true;});return matches.length===1?matches[0]:null;
}
