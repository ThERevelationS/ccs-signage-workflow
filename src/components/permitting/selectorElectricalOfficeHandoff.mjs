import {safeOfficeEvidenceUrl} from './localityOfficeReviewEvidence.js';
import {summarizeLocalityOfficeAuthority} from './localityAuthorityVerification.js';

const clean=value=>typeof value==='string'?value.trim():'';
const exactId=value=>typeof value==='string'&&Boolean(value.trim())&&value===value.trim();
const roles=[['electrical_permit','Electrical permit issuer'],['electrical_inspection','Electrical inspection provider']];

/** Read-only handoff: source links can inform office review only for an exact
 * locality -> repository ID AND state. Never match offices by name, website or county.
 * Review labels are historical local tracker flags, not proof of current authority.
 */
export function summarizeSelectorElectricalOfficeHandoff(profile,locality){
  const exact=Boolean(exactId(profile?.id)&&exactId(locality?.id)&&exactId(locality?.jurisdiction_profile_id)&&
    locality.jurisdiction_profile_id===profile.id&&
    ['OH','KY'].includes(profile.state)&&locality.state===profile.state);
  const empty=roles.map(([role,label])=>({role,label,status:'not_assessed',offices:[]}));
  if(!exact)return {status:'exact_link_required',roles:empty,legacy_broad_role_present:false,
    notice:'An exact saved locality-to-repository profile ID and state are required before these office records can be compared. Profile, locality and saved link IDs must be nonempty and unpadded; preserve malformed saved values for staff reconciliation instead of silently trimming them. Similar names, ZIP codes and county labels are not links.'};
  if(!Array.isArray(locality.offices))return {status:'offices_unavailable',roles:empty,legacy_broad_role_present:false,
    notice:'The linked locality office collection is not readable. Do not infer an issuing or inspection office.'};
  const all=locality.offices,ids=new Map();
  for(const office of all)if(clean(office?.id))ids.set(office.id,(ids.get(office.id)||0)+1);
  const legacy=all.some(office=>Array.isArray(office?.authority_roles)&&office.authority_roles.includes('electrical'));
  const reviewed=roles.map(([role,label])=>{
    const matching=all.filter(office=>Array.isArray(office?.authority_roles)&&office.authority_roles.includes(role));
    const canonicalIds=new Map();
    for(const office of matching){
      const id=clean(office?.government_office_id);
      if(id)canonicalIds.set(id,(canonicalIds.get(id)||0)+1);
    }
    const offices=matching.map(office=>{
      const id=clean(office?.id),unique=Boolean(id&&id===office.id&&ids.get(id)===1),summary=summarizeLocalityOfficeAuthority(office);
      const canonical=clean(office?.government_office_id);
      const canonicalUnique=Boolean(canonical&&canonical===office.government_office_id&&canonicalIds.get(canonical)===1);
      return {id,name:clean(office?.name)||'Unnamed configured office',
        canonical_id:canonical,recorded_review:summary.verified&&unique?'staff_reviewed':'requires_review',
        canonical_identity_unique:canonicalUnique,canonical_identity_issue:canonicalUnique?'':!canonical||canonical!==office.government_office_id?'missing_or_malformed':'duplicated',
        identity_unique:unique,has_review_notes:Boolean(clean(office?.authority_verification_notes)),
        has_reviewer:Boolean(clean(office?.authority_verified_by)&&clean(office?.authority_verified_at)),
        website:safeOfficeEvidenceUrl(office?.contact_website)};
    });
    return {role,label,status:matching.length===0?'not_recorded':matching.length>1?'multiple_saved_offices':
      !offices[0].identity_unique?'office_identity_conflict':!offices[0].canonical_identity_unique?'canonical_identity_conflict':offices[0].recorded_review==='staff_reviewed'?
        'staff_review_reference':'needs_staff_review',offices};
  });
  return {status:'exact_link_read',roles:reviewed,legacy_broad_role_present:legacy,
    notice:'These are configured tracker-office records, not official source or geographic authority verification. Staff must reconcile exact office IDs, separate issuing/inspection responsibility, service areas, current adopted documents and applicable parent-county overlays before using a role.'};
}
