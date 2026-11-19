// MP-4.2 — Regional provider registry: planning bodies that administer
// zoning/permitting for member jurisdictions. { name, type, state,
// serves_counties[], evidence_url }. Used by MP-4.6 roster fallback and
// MP-4.8 serves_jurisdictions visibility — a jurisdiction with no site may
// still be covered by its ADD/RPC.
export const REGIONAL_PROVIDERS = [
  // ── Kentucky Area Development Districts (all 15) ──
  { name: 'Purchase ADD', type: 'regional', state: 'KY', serves_counties: ['ballard', 'calloway', 'carlisle', 'fulton', 'graves', 'hickman', 'marshall', 'mccracken'], evidence_url: 'https://www.purchaseadd.org' },
  { name: 'Pennyrile ADD', type: 'regional', state: 'KY', serves_counties: ['caldwell', 'christian', 'crittenden', 'hopkins', 'livingston', 'lyon', 'muhlenberg', 'todd', 'trigg'], evidence_url: 'https://www.peadd.org' },
  { name: 'Green River ADD', type: 'regional', state: 'KY', serves_counties: ['daviess', 'hancock', 'henderson', 'mclean', 'ohio', 'union', 'webster'], evidence_url: 'https://www.gradd.com' },
  { name: 'Barren River ADD', type: 'regional', state: 'KY', serves_counties: ['allen', 'barren', 'butler', 'edmonson', 'hart', 'logan', 'metcalfe', 'monroe', 'simpson', 'warren'], evidence_url: 'https://www.bradd.org' },
  { name: 'Lincoln Trail ADD', type: 'regional', state: 'KY', serves_counties: ['breckinridge', 'grayson', 'hardin', 'larue', 'marion', 'meade', 'nelson', 'washington'], evidence_url: 'https://www.ltadd.org' },
  { name: 'KIPDA', type: 'regional', state: 'KY', serves_counties: ['bullitt', 'henry', 'jefferson', 'oldham', 'shelby', 'spencer', 'trimble'], evidence_url: 'https://www.kipda.org' },
  { name: 'Northern Kentucky ADD', type: 'regional', state: 'KY', serves_counties: ['boone', 'campbell', 'carroll', 'gallatin', 'grant', 'kenton', 'owen', 'pendleton'], evidence_url: 'https://www.nkadd.org' },
  { name: 'Buffalo Trace ADD', type: 'regional', state: 'KY', serves_counties: ['bracken', 'fleming', 'lewis', 'mason', 'robertson'], evidence_url: 'https://www.btadd.com' },
  { name: 'Gateway ADD', type: 'regional', state: 'KY', serves_counties: ['bath', 'menifee', 'montgomery', 'morgan', 'rowan'], evidence_url: 'https://www.gwadd.org' },
  { name: 'FIVCO ADD', type: 'regional', state: 'KY', serves_counties: ['boyd', 'carter', 'elliott', 'greenup', 'lawrence'], evidence_url: 'https://www.fivco.org' },
  { name: 'Big Sandy ADD', type: 'regional', state: 'KY', serves_counties: ['floyd', 'johnson', 'magoffin', 'martin', 'pike'], evidence_url: 'https://www.bigsandy.org' },
  { name: 'Kentucky River ADD', type: 'regional', state: 'KY', serves_counties: ['breathitt', 'knott', 'lee', 'leslie', 'letcher', 'osprey', 'perry', 'wolfe'], evidence_url: 'https://www.kradd.net' },
  { name: 'Cumberland Valley ADD', type: 'regional', state: 'KY', serves_counties: ['bell', 'clay', 'harlan', 'jackson', 'knox', 'laurel', 'rockcastle', 'whitley'], evidence_url: 'https://www.cvadd.org' },
  { name: 'Lake Cumberland ADD', type: 'regional', state: 'KY', serves_counties: ['adair', 'casey', 'clinton', 'cumberland', 'green', 'mccreary', 'pulaski', 'russell', 'taylor', 'wayne'], evidence_url: 'https://www.lcadd.org' },
  { name: 'Bluegrass ADD', type: 'regional', state: 'KY', serves_counties: ['anderson', 'bourbon', 'boyle', 'clark', 'estill', 'fayette', 'franklin', 'garrard', 'harrison', 'jessamine', 'lincoln', 'madison', 'mercer', 'nicholas', 'powell', 'scott', 'woodford'], evidence_url: 'https://www.bgadd.org' },
  // ── Ohio Regional Planning Commissions / COGs (major metros + multi-county) ──
  { name: 'OKI Regional Council', type: 'regional', state: 'OH', serves_counties: ['butler', 'clermont', 'hamilton', 'warren'], evidence_url: 'https://www.oki.org' },
  { name: 'Miami Valley RPC', type: 'regional', state: 'OH', serves_counties: ['clark', 'darke', 'greene', 'miami', 'montgomery', 'preble'], evidence_url: 'https://www.mvrpc.org' },
  { name: 'NOACA', type: 'regional', state: 'OH', serves_counties: ['cuyahoga', 'geauga', 'lake', 'lorain', 'medina'], evidence_url: 'https://www.noaca.org' },
  { name: 'MORPC', type: 'regional', state: 'OH', serves_counties: ['delaware', 'fairfield', 'franklin', 'licking', 'union', 'madison', 'pickaway', 'knox', 'logan', 'morrow', 'marion', 'ross', 'fayette', 'athens', 'hocking'], evidence_url: 'https://www.morpc.org' },
  { name: 'TMACOG', type: 'regional', state: 'OH', serves_counties: ['lucas', 'wood', 'ottawa'], evidence_url: 'https://www.tmacog.org' },
  { name: 'LUC Regional Planning Commission', type: 'regional', state: 'OH', serves_counties: ['champaign', 'logan', 'union'], evidence_url: 'https://www.lucplanning.com' },
  { name: 'OARC', type: 'regional', state: 'OH', serves_counties: ['ashland', 'crawford', 'knox', 'marion', 'morrow', 'richland', 'wayne'], evidence_url: 'https://www.oarcweb.com' },
  { name: 'AMATS', type: 'regional', state: 'OH', serves_counties: ['portage', 'summit'], evidence_url: 'https://amatsplanning.org' },
  { name: 'Eastgate Regional Council', type: 'regional', state: 'OH', serves_counties: ['ashtabula', 'mahoning', 'trumbull'], evidence_url: 'https://www.eastgatecog.org' },
  { name: 'Ohio Mid-Eastern Governments Association (OMEGA)', type: 'regional', state: 'OH', serves_counties: ['belmont', 'carroll', 'columbiana', 'coshocton', 'guernsey', 'harrison', 'holmes', 'jefferson', 'muskingum', 'tuscarawas'], evidence_url: 'https://www.omegadistrict.org' },
];

export function regionalProvidersFor(countyName, state) {
  const c = String(countyName || '').toLowerCase().replace(/\s+county$/i, '').trim();
  if (!c) return [];
  return REGIONAL_PROVIDERS.filter((p) => String(p.state).toUpperCase() === String(state || '').toUpperCase() && p.serves_counties.includes(c));
}
