const subscribers=new Set();
let installedHandler=null,previousHandler;

// Google's callback is global. Each mounted Permitting map owns a subscription,
// while an existing consumer keeps its handler and receives the same event.
export function subscribeGoogleMapsAuthFailure(callback){
 if(!subscribers.size){
  const previous=window.gm_authFailure;
  previousHandler=previous;
  installedHandler=function(...args){
   for(const entry of [...subscribers]){
    if(!subscribers.has(entry))continue;
    try{entry.callback(...args);}catch{/* One consumer must not block the others. */}
   }
   if(typeof previous==='function'){
    try{previous.apply(this,args);}catch{/* Preserve notification of all map consumers. */}
   }
  };
  window.gm_authFailure=installedHandler;
 }
 const entry={callback};subscribers.add(entry);let active=true;
 return()=>{
  if(!active)return;active=false;subscribers.delete(entry);
  if(!subscribers.size){
   // A different feature may have installed its own callback in the meantime.
   if(window.gm_authFailure===installedHandler){
    if(previousHandler===undefined)delete window.gm_authFailure;
    else window.gm_authFailure=previousHandler;
   }
   installedHandler=null;previousHandler=undefined;
  }
 };
}
