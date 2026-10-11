import {originalFileStatus,originalCollectionCounts} from './addressOriginalBatch.mjs';
export function OriginalCollectionStatus({collection}){
 const counts=originalCollectionCounts(collection);
 return <div className="space-y-1" aria-label="Original file status summary">
  <p>{counts.saved} saved · {counts.waiting} waiting · {counts.active} working · {counts.verify} need verification · {counts.review} need review</p>
  <progress className="w-full" aria-label="Verified saved originals" value={counts.saved} max={counts.total || 1}/>
  <p>{counts.saved} of {counts.total} originals verified. Waiting files have not started; this bar counts verified files only.</p>
  {collection.auto_refresh===false&&<p>Automatic downloads are paused for this collection. You can still save files manually.</p>}
 </div>;
}
export default function OriginalFileStatus({document}){
 const status=originalFileStatus(document);
 return <div className="space-y-1"><p>{status.label}</p>{status.retryAfter&&<p>Automatic retry waits until <time dateTime={status.retryAfter}>{new Date(status.retryAfter).toLocaleString()}</time>. You can try the manual file action now.</p>}</div>;
}
