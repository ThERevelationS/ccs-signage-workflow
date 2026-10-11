import {base44} from '@/api/base44Client';
let pending=null;
function bounded(promise,message){
 let timer;
 return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),20000);})]).finally(()=>clearTimeout(timer));
}
export function loadGoogleMaps(sessionToken){
 if(window.google?.maps?.Map)return (async()=>{const maps=window.google.maps;if(!maps.geometry?.spherical&&maps.importLibrary)await bounded(maps.importLibrary('geometry'),'Map tools connection timed out.');return maps;})();
 if(pending)return pending;
 pending=(async()=>{const response=await bounded(base44.functions.invoke('getGoogleMapsKey',{session_token:sessionToken}),'Map configuration connection timed out.');const key=response?.data?.apiKey;if(!key)throw Error('Map configuration is unavailable.');
  await new Promise((resolve,reject)=>{const id='permitting-google-maps-script',old=document.getElementById(id);old?.remove();const script=document.createElement('script');script.id=id;const callback='permittingMapsReady';let timer;
   function cleanup(){clearTimeout(timer);delete window[callback];}
   window[callback]=()=>{cleanup();window.google?.maps?.Map?resolve():reject(Error('Map did not initialize.'));};
   script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&libraries=geometry&callback=${callback}`;script.async=true;script.onerror=()=>{cleanup();script.remove();reject(Error('Map could not connect.'));};timer=setTimeout(()=>{cleanup();script.remove();reject(Error('Map connection timed out.'));},20000);document.head.appendChild(script);
  });return window.google.maps;
 })().catch(error=>{pending=null;throw error;});return pending;
}
