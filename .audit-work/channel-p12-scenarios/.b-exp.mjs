// src/components/channelLetterInstall/channelExportModel.js
var CHANNEL_EXPORT_VERSION = 1;
var money = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
var channelQuoteExport = ({ description, mode, takeoff, optional_scopes = [], prices = {}, totals = null } = {}) => {
  const lines = (takeoff?.rows || []).filter((r) => r.qty !== null && r.qty !== void 0).map((r) => ({
    description: r.item,
    qty: r.qty,
    unit: r.unit,
    unit_price: money(prices[r.item]),
    total: money(prices[r.item]) !== null ? r.qty * money(prices[r.item]) : null,
    priced: money(prices[r.item]) !== null
  }));
  return {
    kind: "quote",
    version: CHANNEL_EXPORT_VERSION,
    mode: mode || null,
    description: description || null,
    sections: [{ title: "Included scope", lines }],
    optional_scopes: optional_scopes.map((s) => ({ key: s.key, description: s.description, unit_price: money(s.unit_price), optional: true })),
    totals: totals || null,
    unverified: lines.filter((l) => !l.priced).map((l) => ({ field: l.description, reason: "no unit price" }))
  };
};
var channelFabricationExport = (takeoff) => {
  const byCat = {};
  for (const r of takeoff?.rows || []) (byCat[r.category] = byCat[r.category] || []).push(r);
  return {
    kind: "fabrication_takeoff",
    version: CHANNEL_EXPORT_VERSION,
    fabricated: takeoff?.fabricated === true,
    sections: Object.entries(byCat).map(([category, rows]) => ({
      title: category,
      rows: rows.map((r) => ({ item: r.item, qty: r.qty, unit: r.unit, source: r.source, note: r.note }))
    })),
    unverified: (takeoff?.rows || []).filter((r) => r.source === "estimated" || r.qty === null).map((r) => ({ field: r.item, reason: r.qty === null ? "qty unresolved" : "estimated qty" }))
  };
};
var channelLayoutExport = (layout) => ({
  kind: "layout",
  version: CHANNEL_EXPORT_VERSION,
  resolvable: layout?.resolvable === true,
  sections: layout?.resolvable ? [{
    title: "Elevation",
    envelope: layout.envelope,
    letters: layout.letters.map((l) => ({ index: l.index, char: l.char, x: l.x, width: l.width, height: l.height })),
    raceway: layout.raceway,
    backer: layout.backer,
    illumination: layout.illumination,
    finish_color: layout.finish_color,
    alignment: layout.alignment,
    spacing_inches: layout.spacing_inches
  }] : [],
  unverified: (layout?.issues || []).map((i) => ({ field: i.field, reason: i.message }))
});
var channelInstallExport = ({ items = [], spec = {}, validation = null } = {}) => ({
  kind: "installation",
  version: CHANNEL_EXPORT_VERSION,
  sections: [{
    title: "Install lines",
    items: items.map((it) => ({
      description: it.description || null,
      qty_letters: it.qty_letters ?? null,
      installation_type: it.installation_type || null,
      height_feet: it.installation_height_feet ?? null,
      raceway_length_feet: it.raceway_length_feet ?? null,
      is_allowance: it.is_allowance === true,
      is_estimate_level: it.is_estimate_level === true
    }))
  }, {
    title: "Site",
    install_height_feet: spec.install_height_feet ?? null,
    wall_material: spec.wall_material || null,
    electrical_scope: spec.electrical_scope || null,
    required_crew: spec.required_crew ?? null
  }],
  unverified: (validation?.issues || []).map((i) => ({ field: i.field, reason: i.message, severity: i.severity })),
  ready: validation ? validation.ready : null
});
var channelExportBundle = ({ scope, layout, items, spec, validation, prices = {}, description = null, totals = null } = {}) => ({
  version: CHANNEL_EXPORT_VERSION,
  generated_from: { mode: scope?.mode || null, takeoff_version: scope?.takeoff?.version ?? null },
  documents: {
    quote: channelQuoteExport({ description, mode: scope?.mode, takeoff: scope?.takeoff, optional_scopes: scope?.optional_scopes, prices, totals }),
    fabrication_takeoff: channelFabricationExport(scope?.takeoff),
    layout: channelLayoutExport(layout),
    installation: channelInstallExport({ items, spec, validation })
  }
});
export {
  CHANNEL_EXPORT_VERSION,
  channelExportBundle,
  channelFabricationExport,
  channelInstallExport,
  channelLayoutExport,
  channelQuoteExport
};
