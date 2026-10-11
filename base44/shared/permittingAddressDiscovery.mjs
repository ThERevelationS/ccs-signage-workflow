import {scanOfficialPermittingPages} from './permittingDiscoveryScan.mjs';
// Address research is read-only. Location targets come from government geometry;
// searched sites and discovered resources never establish office authority.
export async function discoverUnmatchedAddress({address,resolution,profiles=[],research,fetchPage,onProgress=async()=>{}}){
 const targets=resolution.targets?.length?resolution.targets:[{name:address,state:resolution.state,type:'unconfirmed address'}];
 const scans=[];
 for(const target of targets){
  const prompt=`Find the official government website and permitting department for ${target.name}, ${target.state || ''}, ${target.type}. Address context: ${address}. Return website_url and permitting_url only when sourced; otherwise empty. Do not decide the jurisdiction from the postal city. This is reference research, not a verified authority assignment.`;
  await onProgress({kind:'automatic_search',detail:prompt+' Internal search queries and visited pages are not exposed by the research service.',progress:{stage:`Finding official sources for ${target.name}`,indeterminate:true}});
  try{
   let candidate=profiles.find(p=>p.name?.toLowerCase()===target.name?.toLowerCase()&&p.state?.toUpperCase()===target.state?.toUpperCase());
   if(!candidate?.website_url&&!candidate?.permitting_url)candidate=await research(prompt);
   const seed=candidate?.permitting_url || candidate?.website_url;
   if(!seed){scans.push({target,status:'needs_review',error:'No official website could be located.'});await onProgress({kind:'automatic_no_source',detail:`No official website found for ${target.name}.`});continue;}
   const url=new URL(seed);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Website candidate is invalid.');
   await onProgress({kind:'automatic_source',url:url.href,detail:`Checking the candidate website for ${target.name}; authority remains unverified.`});
   const scan=await scanOfficialPermittingPages({seedUrl:url.href,fetchPage,maxPages:3,maxDepth:2,onProgress});
   scans.push({target,status:scan.success?'reference_found':'needs_review',...scan});
  }catch(error){scans.push({target,status:'needs_review',error:String(error.message || error)});await onProgress({kind:'automatic_scan_failed',detail:`${target.name}: ${String(error.message || error)}`});}
 }
 return {started:true,reference_only:true,scans,authority_established:false,requires_review:true};
}
