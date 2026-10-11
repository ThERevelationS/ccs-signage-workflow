// A manual pass continues the saved frontier without an arbitrary overall page cap.
export async function runAddressPageScan({collection,scanPage,stopped,onProgress}){
 let current=collection,checked=0,failed=0;
 while(current.discovery?.pending_pages?.length&&!current.discovery.blocked&&!stopped()){
  onProgress({checked,failed,current:current.discovery.pending_pages[0].url});
  const result=await scanPage(current);
  if(!result?.collection)throw Error('Page result was not confirmed. Check saved research before retrying.');
  current=result.collection;
  checked+=Number(result.attempted_pages || 0);
  failed+=(result.pages || []).filter(page=>page.status==='failed').length;
  onProgress({checked,failed,current:''});
  if(!result.attempted_pages)break;
 }
 return {checked,failed,stopped:stopped(),pending:current.discovery?.pending_pages?.length || 0,collection:current};
}

// Snapshot failures once: another failed attempt must never create an automatic retry loop.
export async function retryAddressFailedPages({collection,retryPage,stopped,onProgress}){
 const urls=[...new Set((collection.discovery?.gaps || []).filter(gap=>gap.reason==='page_fetch_failed').map(gap=>gap.url))];
 let current=collection,checked=0,failed=0,processed=0,skipped=0;
 for(const url of urls){
  if(stopped()||current.discovery?.blocked)break;
  if(!(current.discovery?.gaps || []).some(gap=>gap.reason==='page_fetch_failed'&&gap.url===url)){skipped++;processed++;continue;}
  onProgress({checked,failed,processed,total:urls.length,skipped});
  const result=await retryPage(current,url);
  if(!result?.collection)throw Error('Page retry result was not confirmed. Refresh saved research before retrying.');
  current=result.collection;
  if(result.success===false)throw Error(result.error || 'Saved page progress needs review.');
  checked+=Number(result.attempted_pages || 0);failed+=(result.pages || []).filter(page=>page.status==='failed').length;processed++;
  onProgress({checked,failed,processed,total:urls.length,skipped});
  if(!result.attempted_pages)break;
 }
 return {checked,failed,processed,total:urls.length,skipped,stopped:stopped(),collection:current};
}
