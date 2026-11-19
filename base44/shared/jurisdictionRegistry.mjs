// MP-6.1 — Jurisdiction registry. State-level expansion is config, not code.
// Each entry carries the boundary/GIS sources, department taxonomy, and
// regional-organization hooks the pipeline consults for that state.
//
// Adding a state = add an entry (MP-6.2 recipe derives queue rows from the
// Census lists), then let the sweep/research workers run it.
export const JURISDICTION_REGISTRY = {
  OH: {
    country: 'US',
    name: 'Ohio',
    // Boundary truth: ODOT municipal + township corporation layers.
    municipalGis: 'https://gis.dot.state.oh.us/arcgis/rest/services/Boundaries/MapServer',
    townshipGis: 'https://gis.dot.state.oh.us/arcgis/rest/services/Boundaries/MapServer',
    countyGis: {
      // county -> parcel/auditor query adapter key (permitting-parcel-resolver)
      hamilton: 'hamiltonMuni', montgomery: 'montgomeryMuni',
    },
    // Ohio BBS certifies jurisdictions that self-administer building code;
    // non-certified areas fall to the county.
    deptTaxonomy: { certifiedRoster: 'ohio-bbs', regionalOrgKind: 'rpc' },
    // Major RPCs/COGs — full list lives in regionalProviders.mjs serves_counties.
    regionalOrgs: ['MORPC', 'OKI', 'MVPC', 'NEFCO', 'OMEGA', 'NOACA', 'TMACOG', 'LUC', 'BUCKEYE HILLS', 'OVRDC'],
    endpointLastVerified: '2026-11-04',
  },
  KY: {
    country: 'US',
    name: 'Kentucky',
    municipalGis: null, // KyGeoserver municipal boundary — wire on next pass
    townshipGis: null, // KY has no civil townships
    countyGis: {},
    // Electrical inspection: DHBC-certified inspectors statewide (KRS 227.480+).
    deptTaxonomy: { certifiedRoster: 'ky-dhbc', regionalOrgKind: 'add' },
    regionalOrgs: ['KIPDA', 'BRADD', 'ADD district rosters — see regionalProviders.mjs'],
    endpointLastVerified: '2026-11-04',
  },
};

export function registryFor(state) {
  return JURISDICTION_REGISTRY[String(state || '').toUpperCase()] || null;
}
