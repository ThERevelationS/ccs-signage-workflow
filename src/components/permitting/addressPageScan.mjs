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
