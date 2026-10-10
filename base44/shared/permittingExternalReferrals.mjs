export const EXTERNAL_REFERRAL_METHOD = 'official-page-external-link-v1';
const host = value => value.toLowerCase().replace(/^www\./,'');
export function referralWebUrl(value) {
 try {
  if(typeof value!=='string' || value.length>2000)return null;
  const u=new URL(value);
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port)return null;
  const h=u.hostname.toLowerCase().replace(/\.$/,'');
  if(!h || h==='localhost' || /\.(localhost|local|internal|lan|home\.arpa)$/.test(h) ||
     h.includes(':') || /^\d+(?:\.\d+){3}$/.test(h))return null;
  u.hash='';return u;
 }catch{return null;}
}
export function externalReferralKind({url,title=''}) {
 const u=new URL(url),words=(title+' '+u.pathname).replace(/[_-]/g,' ');
 if(/\.(pdf|docx?|xlsx?|csv|txt)$/i.test(u.pathname))return 'downloadable_document';
 if(/(^|\.)amlegal\.com$|(^|\.)municode\.com$|(^|\.)ecode360\.com$/.test(u.hostname) ||
    /\b(codes?|ordinances?|regulations?|resolutions?)\b/i.test(words))return 'code_publisher';
 if(/\b(apply|applications?|forms?|portal|eztrak|citizenaccess|epermits)\b/i.test(words+' '+u.hostname))return 'online_form';
 if(/\b(departments?|building|zoning|electrical|electric|inspections?|inspectors?)\b/i.test(words))return 'department_reference';
 return 'other_permitting_resource';
}
export function createExternalPermittingReferral({url,title,sourcePageUrl,linkedHref,resolutionBaseUrl,element='anchor'}) {
 const target=referralWebUrl(url),page=referralWebUrl(sourcePageUrl),base=referralWebUrl(resolutionBaseUrl);
 if(!target || !page || !base || host(target.hostname)===host(page.hostname) ||
    host(base.hostname)!==host(page.hostname) || typeof linkedHref!=='string' || linkedHref.length>2000 ||
    typeof title!=='string' || title.length>1000)return null;
 let resolved;try{resolved=referralWebUrl(new URL(linkedHref,base).href);}catch{return null;}
 if(!resolved || resolved.href!==target.href)return null;
 return {url:target.href,title,source_page_url:page.href,linked_href:linkedHref,resolution_base_url:base.href,
  discovery_element:element,referral_kind:externalReferralKind({url:target.href,title}),
  provenance_method:EXTERNAL_REFERRAL_METHOD,verification_status:'needs_verification',
  fetch_scope_approved:false,authority_established:false};
}
export function validateExternalPermittingReferral(row,seedUrl) {
 if(!row || row.provenance_method!==EXTERNAL_REFERRAL_METHOD || row.verification_status!=='needs_verification' ||
    row.fetch_scope_approved!==false || row.authority_established!==false ||
    !/^[a-f0-9]{64}$/.test(row.source_page_sha256 || '') ||
    !['anchor','iframe','embed','object'].includes(row.discovery_element))throw Error('External referral provenance requires review.');
 const page=referralWebUrl(row.source_page_url),seed=referralWebUrl(seedUrl);
 if(!page || !seed || host(page.hostname)!==host(seed.hostname))throw Error('External referral belongs to another official source.');
 const rebuilt=createExternalPermittingReferral({url:row.url,title:row.title,sourcePageUrl:row.source_page_url,
  linkedHref:row.linked_href,resolutionBaseUrl:row.resolution_base_url,element:row.discovery_element});
 if(!rebuilt || rebuilt.referral_kind!==row.referral_kind)throw Error('External referral link identity requires review.');
 return row;
}
