import {resolveSpatialLocation} from '../base44/shared/permittingSpatialResolution.mjs';
const fetchJSON=async(u)=>{const r=await fetch(u,{signal:AbortSignal.timeout(15000)});return r.json();};
const r=await resolveSpatialLocation({geocode:{lat:41.0605334,lon:-80.6636244,address_parts:{administrative_area_level_1:'Ohio'},location_exact:true},fetchJSON});
console.log(JSON.stringify({status:r.status,reason:r.reason,candidates:r.candidates,target:r.target,targets:r.targets},null,1));
