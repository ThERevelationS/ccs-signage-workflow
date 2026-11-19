// Local harness: geocode flagged addresses (Nominatim) + run resolveSpatialLocation locally.
import {resolveSpatialLocation} from './base44/shared/permittingSpatialResolution.mjs';
import {readFileSync} from 'node:fs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchJSON(url){const r=await fetch(url,{headers:{'User-Agent':'ccs-gate-test/1.0'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
async function geocodeNominatim(addr){
 const u='https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=us&limit=1&q='+encodeURIComponent(addr);
 const j=await fetchJSON(u);const g=j[0];if(!g)return null;
 return{lat:+g.lat,lon:+g.lon,location_exact:g.type==='house'||g.addresstype==='building',approximate_source:g.addresstype!=='building'?'nominatim':'',
  address_parts:{locality:g.address?.city||g.address?.town||g.address?.village||'',postal_town:g.address?.town||'',administrative_area_level_2:g.address?.county||'',administrative_area_level_3:g.address?.township||g.address?.suburb||'',administrative_area_level_1:g.address?.state||''}};
}
const items=JSON.parse(readFileSync('.flagged-addrs.json','utf8'));
const out=[];
for(const it of items.slice(0,+process.argv[2]||15)){
 try{
  const g=await geocodeNominatim(it.a);await sleep(1100);
  if(!g){out.push({a:it.a,r:'geocode-miss'});console.log('MISS',it.a.slice(0,45));continue;}
  const evs=[];const r=await resolveSpatialLocation({geocode:g,fetchJSON,onProgress:async e=>evs.push(e)});
  const cls=r.status!=='needs_review'?r.status:(r.reason?.includes('close to a boundary')?'edge':r.reason?.includes('different municipalities')?'muni_name':r.reason?.includes('disagree about the municipality')?'muni_disagree':r.reason?.includes('disagree about the township')?'twp_disagree':r.reason?.includes('county line')?'county':'other');
  out.push({a:it.a,r:cls,target:r.target?r.target.name:null,cands:r.candidates?.map(c=>({n:c.name,in:c.inside,by:c.inside_sources||c.supported_by,d:c.distance_m}))});
  console.log(cls.padEnd(14),(it.a||'').slice(0,44).padEnd(46),'→',r.target?.name||'',r.candidates?JSON.stringify(r.candidates.map(c=>c.name+(c.inside?'*':''))).slice(0,60):'');
 }catch(e){out.push({a:it.a,r:'err:'+String(e).slice(0,60)});console.log('ERR',it.a.slice(0,45),String(e).slice(0,80));}
}
console.log('\nclasses:',JSON.stringify(out.reduce((m,o)=>(m[o.r]=(m[o.r]||0)+1,m),{})));
readFileSync; // keep
import('node:fs').then(fs=>fs.writeFileSync('.gate-test-out.json',JSON.stringify(out,null,1)));
