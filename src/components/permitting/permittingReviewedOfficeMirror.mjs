const statesInScope = new Set(['OH','KY']);
const roles = new Set(['sign_permit','zoning','building','electrical','electrical_permit','electrical_inspection','right_of_way','historic_review','planning','transportation','other']);
const string = value => typeof value === 'string' ? value.trim() : '';
const stable = value => typeof value === 'string' && value.trim() !== '' && value === value.trim();
const byOhioFirst = (a,b) => (a.state==='OH'?0:1)-(b.state==='OH'?0:1)
  || a.profile_name.localeCompare(b.profile_name) || a.profile_id.localeCompare(b.profile_id)
  || a.role.localeCompare(b.role) || a.review_id.localeCompare(b.review_id);

/** Read-only comparison of immutable review histories to saved tracker office copies.
 * A saved copy is optional and is never evidence of a permit issuer, service area or approval.
 * Historical committed events are NOT subjected to the backend's fresh evidence verification.
 */
export function reconcileReviewedOfficesWithoutSavedCopies(localities, profiles, events) {
  if (![localities, profiles, events].every(Array.isArray))
    throw Error('Invalid authority-review mirror inventory');
  const profileMap = new Map(), localityIds = new Set(), eventIds = new Set();
  for (const profile of profiles) {
    if (!stable(profile?.id) || profileMap.has(profile.id))
      throw Error('Invalid or duplicate profile identity in authority-review mirror');
    profileMap.set(profile.id,profile);
  }
  const copies = new Map();
  for (const locality of localities) {
    if (!stable(locality?.id) || localityIds.has(locality.id))
      throw Error('Invalid or duplicate saved locality identity in authority-review mirror');
    localityIds.add(locality.id);
    if (locality.offices !== undefined && !Array.isArray(locality.offices))
      throw Error('Malformed saved office copies in authority-review mirror');
    if (!stable(locality.jurisdiction_profile_id)) continue;
    const id = locality.jurisdiction_profile_id;
    copies.set(id,[...(copies.get(id)||[]),locality]);
  }
  const grouped = new Map(), excluded_event_ids = [];
  for (const event of events) {
    if (!stable(event?.id) || eventIds.has(event.id))
      throw Error('Invalid or duplicate immutable authority review ID');
    eventIds.add(event.id);
    if (event.method!=='office-authority-v1') continue;
    const profile = profileMap.get(event.jurisdiction_id);
    const state = string(profile?.state || event.profile_snapshot?.state).toUpperCase();
    if (!statesInScope.has(state)) {excluded_event_ids.push(event.id);continue;}
    // Missing relation keys are individual review items, never clustered into an invented relationship.
    const key = JSON.stringify([event.jurisdiction_id,string(event.relation_key) || 'invalid:'+event.id]);
    grouped.set(key,[...(grouped.get(key)||[]),event]);
  }
  const counts = () => ({relation_histories:0, saved_copy_reference_only:0, no_saved_locality:0,
    no_saved_office:0, role_not_assigned:0, office_needs_review:0,
    shared_locality_reference:0, locality_state_conflict:0, revoked:0,
    uncommitted_or_uncertain:0, ambiguous_history:0, invalid_review_identity:0,
    target_profile_unavailable:0});
  const states = {OH:counts(),KY:counts()}, items=[];
  for (const group of grouped.values()) {
    const first=group[0], profile=profileMap.get(first.jurisdiction_id);
    const state=string(profile?.state || first.profile_snapshot?.state).toUpperCase();
    const tally=states[state];tally.relation_histories++;
    const profileId=string(first.jurisdiction_id), saved=copies.get(profileId)||[];
    const receipt=profile?.office_authority_review_state;
    const committed=receipt?.committed_sequence ?? 0;
    const pending=receipt?.status==='creating' || receipt?.status==='uncertain' ||
      !Number.isSafeInteger(committed) || committed<0;
    const eligible=group.filter(e=>Number.isSafeInteger(e.sequence) && e.sequence>0 && e.sequence<=committed);
    let status='', latest=null;
    if (!profile) status='target_profile_unavailable';
    else if (pending || !eligible.length) status='uncommitted_or_uncertain';
    else {
      const top=Math.max(...eligible.map(e=>e.sequence));
      const heads=eligible.filter(e=>e.sequence===top);
      if (heads.length!==1) status='ambiguous_history';
      else {
        latest=heads[0];
        if (group.some(e=>!Number.isSafeInteger(e.sequence) || e.sequence<1 || e.sequence>committed))
          status='uncommitted_or_uncertain';
        else if (latest.action==='revoke') status='revoked';
        else if (latest.action!=='verify' || !stable(latest.relation_key) ||
          latest.profile_snapshot?.id!==profileId ||
          string(latest.profile_snapshot?.state).toUpperCase()!==state ||
          !stable(latest.office_snapshot?.government_office_id) ||
          !roles.has(latest.role) || !string(latest.coverage_area) ||
          latest.responsibility_confirmed!==true || latest.address_authority_resolved!==false)
          status='invalid_review_identity';
      }
    }
    const active=latest||first;
    const row={state, profile_id:profileId, profile_name:string(profile?.name || active.profile_snapshot?.name) || 'Unknown jurisdiction',
      review_id:active.id, sequence:active.sequence, role:string(active.role), coverage_area:string(active.coverage_area),
      canonical_office_id:string(active.office_snapshot?.government_office_id),
      canonical_office_name:string(active.office_snapshot?.name), saved_locality_ids:[],
      office_copy_ids:[], status};
    if (!status) {
      const exact=saved.filter(locality=>string(locality.state).toUpperCase()===state);
      row.saved_locality_ids=exact.map(locality=>locality.id);
      if (!exact.length) status=saved.length?'locality_state_conflict':'no_saved_locality';
      else if (exact.length>1) status='shared_locality_reference';
      else {
        const matchingOffices=(exact[0].offices||[]).filter(office=>
          string(office?.government_office_id)===row.canonical_office_id);
        row.office_copy_ids=matchingOffices.map(office=>string(office.id));
        if (!matchingOffices.length) status='no_saved_office';
        else if (!matchingOffices.some(office=>Array.isArray(office.authority_roles) && office.authority_roles.includes(row.role)))
          status='role_not_assigned';
        else if (!matchingOffices.some(office=>Array.isArray(office.authority_roles) &&
          office.authority_roles.includes(row.role) && office.authority_verification_status==='staff_verified'))
          status='office_needs_review';
        else status='saved_copy_reference_only';
      }
    }
    row.status=status;
    tally[status]++;
    // Revoked relationships require no office mirroring; retain the count without a false gap.
    if(status!=='saved_copy_reference_only' && status!=='revoked')items.push(row);
  }
  items.sort(byOhioFirst);
  return {states,items,excluded_event_ids,authority_verified:false,source_currentness_verified:false,
    complete:false,notice:'Read-only comparison of historical review events and saved tracker office copies. Missing copies are optional workflow gaps, not missing government authorities. Revoked decisions do not require a saved office copy. IDs and role assignments are compared exactly; no names or county membership establish a match. Read permissions and non-atomic pagination limit these counts; current legal authority requires independent fresh evidence review.'};
}
