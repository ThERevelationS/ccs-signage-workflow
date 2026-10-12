import {useState,useRef,useEffect} from 'react';
import {base44} from '@/api/base44Client';
import {useAuth} from '@/components/auth/EmailGate';
import AutomaticAddressScanResults from './AutomaticAddressScanResults';
export default function SavedAddressResearch({review=false}){
 const {sessionToken,currentUser}=useAuth();
 if(!sessionToken||!(currentUser?.id||currentUser?.email)||(review&&currentUser.role!=='admin'))return null;
 const scope=JSON.stringify([currentUser.id || currentUser.email,currentUser.role,sessionToken,review]);
 return <SavedResearchSession key={scope} sessionToken={sessionToken} review={review} />;
}
function SavedResearchSession({sessionToken,review}){
 const [page,setPage]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef(false);
 const version=useRef(0);
 useEffect(()=>{version.current++;setPage(null);setError('');setBusy(false);return()=>{version.current++;};},[sessionToken,review]);
 async function load(cursor){if(pending.current)return;pending.current=true;const attempt=++version.current;setBusy(true);setError('');try{const response=await base44.functions.invoke('getAddressResearchCollections',{browse:true,review,...(cursor?{cursor}:{}),session_token:sessionToken});if(attempt!==version.current)return;if(!Array.isArray(response.data?.collections))throw Error('Invalid response');setPage(response.data);}catch{if(attempt===version.current)setError('Saved research could not load. Try again.');}finally{if(attempt===version.current){pending.current=false;setBusy(false);}}}
 return <details className="border rounded p-3"><summary className="min-h-11 cursor-pointer text-sm font-semibold">{review?'Employee research to review':'My saved research'}</summary><p className="text-xs">{review?'Inspect employee source findings and saved originals before approving jurisdiction information.':'Return to files from your earlier address searches. These findings still need administrator review.'}</p><button type="button" className="min-h-11 border rounded px-3 text-sm" disabled={busy} onClick={()=>load()}>{busy?'Loading saved research…':review?(page?'Reload research to review':'Show employee research'):page?'Reload my research':'Show my research'}</button>{error&&<p role="alert" className="text-sm text-amber-800">{error}</p>}{page&&<>{!page.collections.length?<p role="status" className="text-sm">No saved research found.</p>:<AutomaticAddressScanResults key={page.collections.map(row=>row.id).join(',')} scanResult={{started:true,scans:[]}} archives={page} savedOnly/>}{page.next_cursor&&<button type="button" className="min-h-11 border rounded px-3 text-sm" disabled={busy} onClick={()=>load(page.next_cursor)}>Show older research</button>}</>}</details>;
}
