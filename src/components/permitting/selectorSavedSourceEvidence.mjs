import {isVerifiedPermitPDFArchive} from './permitArchiveVerification.js';

const DOC_TYPES={
  sign_ordinance:'Sign ordinance',permit_application:'Permit application',
  zoning_code:'Zoning code',fee_schedule:'Fee schedule',checklist:'Checklist',other:'Other resource'
};
const PROVENANCE={
  manual:'Saved manually',ai_discovered:'AI-discovered candidate',official_page_harvest:'Found on a recorded forms page'
};
export function savedSourceWebUrl(value){
  if(typeof value!=='string'||!value.trim())return '';
  try {
    const url=new URL(value.trim());
    return ['https:','http:'].includes(url.protocol)&&url.hostname&&
      !url.username&&!url.password?url.href:'';
  }catch{return '';}
}

/** One source record stays one entry. Titles, keyword hits and office names are
 * not used to infer electrical issuing or inspection authority.
 */
export function summarizeSavedSelectorSources(profile){
  const docs=Array.isArray(profile?.documents)?profile.documents:[];
  return docs.map((doc,i)=>{
    const row=doc&&typeof doc==='object'&&!Array.isArray(doc)?doc:{};
    const sourceUrl=savedSourceWebUrl(row.url);
    const storedUrl=savedSourceWebUrl(row.file_url);
    const verifiedArchive=Boolean(storedUrl&&isVerifiedPermitPDFArchive(row));
    const referralUrl=savedSourceWebUrl(row.discovery_page_url||row.external_referral_provenance?.source_page_url);
    return {
      key:`saved-source-${i}`,title:typeof row.title==='string'&&row.title.trim()?row.title.trim():`Saved resource ${i+1}`,
      category:DOC_TYPES[row.doc_type]||'Unclassified resource',
      provenance:PROVENANCE[row.source]||'Collection method not recorded',
      source_url:sourceUrl,stored_url:verifiedArchive?storedUrl:'',referral_url:referralUrl,
      archive_status:verifiedArchive?'verified_pdf_fingerprint':row.file_url?'archive_not_verified':'archive_not_recorded',
      protected:row.archive_pinned===true||row.pinned===true||row.source==='manual'
    };
  });
}
