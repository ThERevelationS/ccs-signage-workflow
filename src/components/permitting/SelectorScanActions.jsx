import {normalizeAddressState} from '../../shared/permittingAddressState.js';
import {useState,useRef,useEffect} from 'react';
import {base44} from '@/api/base44Client';
import {useAuth} from '@/components/auth/EmailGate';
import {useResearchProgress} from './ResearchProgressContext';
import OfficialSourceRescans from './OfficialSourceRescans';
import OfficeRescanButton from './OfficeRescanButton';
import {findRepositoryJurisdictionMatches,hasDuplicateRepositoryIdentity} from './jurisdictionPermitBridge';
import {createJurisdictionIfAbsent} from './jurisdictionPersistence';
export default function SelectorScanActions({locality,result,profiles,onProfileUpdated,loading,unavailable}){
 const {currentUser}=useAuth(),{runAction}=useResearchProgress(),[busy,setBusy]=useState(new Set()),[error,setError]=useState('');
 const alive=useRef(true);useEffect(()=>()=>{alive.current=false;},[]);
 const matches=findRepositoryJurisdictionMatches(profiles,locality?{suggested_locality:locality,ai_state:locality.state}:result);
 const name=locality?.name || result?.ai_locality_name,state=normalizeAddressState(locality?.state || result?.ai_state).toUpperCase();
 const brokenLink=Boolean(locality?.jurisdiction_profile_id || result?.suggested_locality?.jurisdiction_profile_id)&&matches.length===0;
 const canScan=currentUser?.role==='admin'&&!unavailable;
 async function scan(profile,research=false){const key=profile?.id || 'new';if(busy.has(key))return;setBusy(prev=>new Set([...prev,key]));setError('');try{
  let target=profile;
  if(!target){const created=await createJurisdictionIfAbsent({entity:base44.entities.JurisdictionProfile,data:{name,state,type:/township/i.test(name)?'township':/county/i.test(name)?'county':'city',auto_refresh:false,ai_summary:'Research requested from project jurisdiction selector.'},label:`Selector research ${name}, ${state}`});target=created.record;}
  const response=await runAction('refreshJurisdiction',{jurisdiction_id:target.id,...(!research?{discovery_only:true,defer_archive:true,rescan_source_url:target.permitting_url}:{})},`${research?'Research':'Scan website'} ${target.name}, ${target.state}`);
  if(alive.current)onProfileUpdated(response.data?.jurisdiction || await base44.entities.JurisdictionProfile.get(target.id));
 }catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setBusy(prev=>{const next=new Set(prev);next.delete(key);return next;});}}
 if(!locality&&!result)return null;
 return <section aria-label="Scan this jurisdiction" className="rounded-lg border bg-white p-3 space-y-3 min-w-0">
  <h3 className="font-semibold text-sm">Check this place</h3>
  <p className="text-xs text-gray-600">Scan for forms and links. Use “Find missing information” to research contacts and requirements. Findings still need review.</p>
  {currentUser?.role!=='admin'&&<p className="text-xs">An administrator can start scans here. You can still choose a jurisdiction.</p>}
  {unavailable&&<p role="alert" className="text-xs text-red-700">Saved information could not load. Close and reopen this window to try again.</p>}
  {loading&&<p role="status" className="text-xs">Loading saved information…</p>}
  {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
  {brokenLink&&<p className="text-xs text-amber-800">This place’s saved information link is missing. Ask an administrator to repair it before scanning.</p>}
  {!loading&&matches.map(profile=>{const duplicate=hasDuplicateRepositoryIdentity(profiles,profile),pending=busy.has(profile.id);return <div key={profile.id} className="space-y-2 border-t pt-2 min-w-0">
   <p className="text-sm font-medium break-words">{profile.name}, {profile.state}</p>
   <p className="text-xs text-gray-600">{profile.documents?.length || 0} saved forms and links{profile.last_updated?` · Last checked ${new Date(profile.last_updated).toLocaleDateString()}`:''}</p>
   {duplicate&&<p className="text-xs text-amber-800">More than one saved record exists for this place. Resolve that before scanning.</p>}
   <div className="flex flex-wrap gap-2"><button type="button" className="min-h-11 rounded border px-3 text-sm" disabled={!canScan||pending||duplicate||!profile.permitting_url||profile._manual_documents} onClick={()=>scan(profile)}>{pending?'Working…':'Scan website'}</button><button type="button" className="min-h-11 rounded border px-3 text-sm" disabled={!canScan||pending||duplicate} onClick={()=>scan(profile,true)}>Find missing information</button></div>
   {!profile.permitting_url&&<p className="text-xs">No saved permitting website yet. Choose “Find missing information” first.</p>}
   {profile._manual_documents&&<p className="text-xs">Staff protected this document list. Website scans are paused.</p>}
   {canScan&&profile.permitting_url&&<OfficialSourceRescans jurisdiction={profile} onUpdate={onProfileUpdated}/>}
  </div>;})}
  {!loading&&!matches.length&&!brokenLink&&name&&state&&<div className="space-y-2"><p className="text-xs">No saved research for {name}, {state}. Check this name before starting.</p><button type="button" className="min-h-11 rounded border px-3 text-sm" disabled={!canScan||busy.has('new')} onClick={()=>scan(null,true)}>{busy.has('new')?'Working…':`Find information for ${name}`}</button></div>}
  {canScan&&locality?.offices?.length>0&&<details><summary className="min-h-11 py-2 cursor-pointer text-sm">Check individual offices</summary>{locality.offices.map(office=><div key={office.id} className="border-t py-2"><p className="text-sm font-medium">{office.name || 'Office'}</p><OfficeRescanButton localityId={locality.id} office={office} showSaveNote={false}/></div>)}</details>}
 </section>;
}
