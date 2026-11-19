// src/components/channelLetterInstall/channelProposalRevisions.js
var CHANNEL_PROPOSAL_VERSION = 1;
var clone = (o) => JSON.parse(JSON.stringify(o));
var now = () => (/* @__PURE__ */ new Date()).toISOString();
var copyProposal = (p) => ({
  ...clone(p),
  id: `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  copied_from: p.id ?? null,
  accepted: false,
  accepted_by: null,
  accepted_at: null,
  pricing_basis_snapshot: null,
  revision_n: 0,
  revisions: []
});
var templateProposal = (p) => {
  const t = copyProposal(p);
  delete t.customer_id;
  delete t.customer_name;
  delete t.project_id;
  t.is_template = true;
  return t;
};
var lockProposal = (p, fields = []) => ({
  ...p,
  locked_fields: [.../* @__PURE__ */ new Set([...p.locked_fields || [], ...fields])]
});
var unlockProposal = (p, fields = []) => ({
  ...p,
  locked_fields: (p.locked_fields || []).filter((f) => !fields.includes(f))
});
var reviseProposal = (p, edits = {}) => {
  if (p.accepted === true) {
    return { proposal: p, applied: [], refused: Object.keys(edits), reason: "accepted proposals are frozen \u2014 reopen first" };
  }
  const locked = new Set(p.locked_fields || []);
  const applied = [];
  const refused = [];
  const next = clone(p);
  for (const [k, v] of Object.entries(edits)) {
    if (locked.has(k)) {
      refused.push(k);
      continue;
    }
    next[k] = v;
    applied.push(k);
  }
  if (applied.length) {
    next.revision_n = (p.revision_n || 0) + 1;
    next.revisions = [...p.revisions || [], { revision_n: next.revision_n, revised_at: now(), edits_applied: applied, snapshot: clone(p) }];
  }
  return { proposal: next, applied, refused };
};
var undoRevision = (p) => {
  const revs = p.revisions || [];
  if (!revs.length) return p;
  const last = revs[revs.length - 1];
  return { ...clone(last.snapshot), revisions: revs.slice(0, -1), revision_n: p.revision_n };
};
var acceptProposal = (p, { accepted_by = null, prices = {}, totals = null } = {}) => ({
  ...p,
  accepted: true,
  accepted_by,
  accepted_at: now(),
  pricing_basis_snapshot: {
    captured_at: now(),
    mode: p.mode ?? null,
    spec: clone(p.spec ?? null),
    optional_scopes: clone(p.optional_scopes ?? []),
    prices: clone(prices),
    totals: clone(totals),
    revision_n: p.revision_n ?? 0
  }
});
var reopenProposal = (p, reason) => {
  if (p.accepted !== true) return p;
  return {
    ...p,
    accepted: false,
    prior_acceptance: { accepted_by: p.accepted_by, accepted_at: p.accepted_at, pricing_basis_snapshot: p.pricing_basis_snapshot },
    accepted_by: null,
    accepted_at: null,
    pricing_basis_snapshot: null,
    reopened_reason: reason || null,
    reopened_at: now()
  };
};
export {
  CHANNEL_PROPOSAL_VERSION,
  acceptProposal,
  copyProposal,
  lockProposal,
  reopenProposal,
  reviseProposal,
  templateProposal,
  undoRevision,
  unlockProposal
};
