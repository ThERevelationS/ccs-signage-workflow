const OH_KY = new Set(['OH','KY']);
const ELECTRICAL = new Set(['electrical_permit','electrical_inspection']);
const METHOD = 'office-authority-v1';
const str = value => typeof value === 'string' ? value.trim() : '';
const validId = value => typeof value === 'string' && value.length > 0 && value === value.trim();
const validSequence = n => Number.isSafeInteger(n) && n > 0;

/** Historical event/receipt linkage only. This never rechecks source, current law, address geometry,
 * canonical-office catalog metadata, or the backend's fresh evidence gate.
 */
export function reconcileRecordedAuthorityReviewEvents(localities, profiles, events) {
  if (![localities, profiles, events].every(Array.isArray))
    throw Error('Invalid recorded authority event inventory');
  const profileById = new Map(), scopedProfiles = new Set();
  for (const profile of profiles) {
    if (!validId(profile?.id) || profileById.has(profile.id))
      throw Error('Invalid or duplicate jurisdiction profile identity in review audit');
    profileById.set(profile.id, profile);
    if (OH_KY.has(str(profile.state).toUpperCase())) scopedProfiles.add(profile.id);
  }
  const eventsByProfile = new Map(), seenEvents = new Set();
  for (const event of events) {
    if (!validId(event?.id) || seenEvents.has(event.id))
      throw Error('Invalid or repeated immutable authority event ID');
    seenEvents.add(event.id);
    if (event.method !== METHOD || !scopedProfiles.has(event.jurisdiction_id)) continue;
    eventsByProfile.set(event.jurisdiction_id, [...(eventsByProfile.get(event.jurisdiction_id) || []),event]);
  }
  const totals = () => ({saved_verified_role_assignments:0, recorded_event_reference:0,
    no_exact_review:0, unresolved_link_or_office:0, review_revoked:0, event_uncommitted:0,
    event_ambiguous:0, review_record_conflict:0, pending_receipt:0});
  const states = { OH:totals(), KY:totals() }, items = [], seenLocalities = new Set();
  for (const locality of localities) {
    if (!validId(locality?.id) || seenLocalities.has(locality.id))
      throw Error('Invalid or duplicate locality identity in review audit');
    seenLocalities.add(locality.id);
    const state = str(locality.state).toUpperCase();
    if (!OH_KY.has(state)) continue;
    if (locality.offices !== undefined && !Array.isArray(locality.offices))
      throw Error('Malformed saved locality office collection');
    const profileId = str(locality.jurisdiction_profile_id), profile = profileById.get(profileId);
    const sameState = profile && str(profile.state).toUpperCase()===state;
    const receipt = profile?.office_authority_review_state;
    const sequence = receipt?.committed_sequence ?? 0;
    const validReceipt = receipt === undefined || receipt === null ||
      (typeof receipt==='object' && Number.isSafeInteger(sequence) && sequence>=0);
    const receiptPending = receipt?.status==='creating' || receipt?.status==='uncertain' || !validReceipt;
    const profileEvents = profileId ? (eventsByProfile.get(profileId)||[]) : [];
    for (const [officeIndex,office] of (locality.offices || []).entries()) {
      if (office?.authority_verification_status!=='staff_verified') continue;
      const roles = Array.isArray(office.authority_roles) ? [...new Set(office.authority_roles.filter(r=>typeof r==='string'))] : [];
      for (const role of roles) {
        if (!role || role==='electrical') continue; // legacy broad electrical never proves either specific role
        states[state].saved_verified_role_assignments++;
        const officeId = str(office.government_office_id);
        const row = {state,locality_id:locality.id,locality_name:str(locality.name)||'Unnamed locality',
          office_id:str(office.id),office_name:str(office.name)||'Unnamed office',office_index:officeIndex,
          jurisdiction_profile_id:profileId,government_office_id:officeId,role,review_id:'',sequence:null,
          status:'',source_document_id:''};
        if (!validId(locality.jurisdiction_profile_id) || !sameState || !officeId) {
          row.status='unresolved_link_or_office';
        } else if (receiptPending) {
          row.status='pending_receipt';
        } else {
          // Only exact profile, canonical office and role. Different coverage areas are not interchangeable.
          const matches=profileEvents.filter(e=>e.role===role &&
            str(e.office_snapshot?.government_office_id)===officeId);
          if (!matches.length) row.status='no_exact_review';
          else {
            const uncommitted = matches.some(e=>!validSequence(e.sequence) || e.sequence>sequence);
            const committed = matches.filter(e=>validSequence(e.sequence) && e.sequence<=sequence);
            if (uncommitted) row.status='event_uncommitted';
            else if (!committed.length) row.status='no_exact_review';
            else {
              const grouped = new Map();
              for (const event of committed) {
                const key = str(event.relation_key);
                if (!key) {row.status='review_record_conflict';break;}
                grouped.set(key,[...(grouped.get(key)||[]),event]);
              }
              if (!row.status) {
                const latest = [];
                for (const group of grouped.values()) {
                  const max = Math.max(...group.map(e=>e.sequence));
                  const atMax=group.filter(e=>e.sequence===max);
                  if(atMax.length!==1){row.status='event_ambiguous';break;}
                  latest.push(atMax[0]);
                }
                if (!row.status) {
                  if (latest.length!==1) row.status='event_ambiguous';
                  else {
                    const event=latest[0];
                    row.review_id=event.id;row.sequence=event.sequence;
                    row.source_document_id=str(event.source_document_id);
                    if (event.action==='revoke') row.status='review_revoked';
                    else if (event.action!=='verify' || event.profile_snapshot?.id!==profileId ||
                      str(event.profile_snapshot?.state).toUpperCase()!==state ||
                      str(event.office_snapshot?.government_office_id)!==officeId ||
                      event.responsibility_confirmed!==true || event.address_authority_resolved!==false ||
                      !str(event.coverage_area) || !str(event.source_document_id) &&
                      !str(event.html_evidence_id) || !str(event.requested_by) || !str(event.source_review_id) &&
                      event.evidence_kind!=='official_html')
                      row.status='review_record_conflict';
                    else row.status='recorded_event_reference';
                  }
                }
              }
            }
          }
        }
        if (row.status==='recorded_event_reference') {
          states[state].recorded_event_reference++;
        } else {
          states[state][row.status]++;
          items.push(row);
        }
      }
    }
  }
  items.sort((a,b)=>(a.state==='OH'?0:1)-(b.state==='OH'?0:1)
    || a.locality_name.localeCompare(b.locality_name) || a.locality_id.localeCompare(b.locality_id)
    || a.office_index-b.office_index || a.role.localeCompare(b.role));
  return {states,items,source_method:METHOD,authority_verified:false,source_currentness_verified:false,
    complete:false,
    notice:'Immutable authority event cross-reference only. An event with a committed sequence is historical evidence, not fresh source verification. The backend must independently recheck current sources, office identity, role, service area and revocations. Missing entries are limited to readable records. This audit never approves or edits authority.'};
}
