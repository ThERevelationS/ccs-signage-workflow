// src/components/channelLetterInstall/channelProposalRevisions.js
var clone = (o) => JSON.parse(JSON.stringify(o));
var now = () => (/* @__PURE__ */ new Date()).toISOString();
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

// src/components/channelLetterInstall/channelProposalLifecycle.js
var CHANNEL_LIFECYCLE_VERSION = 1;
var toModel = (p = {}) => ({
  ...p,
  accepted: p.proposal_accepted === true,
  accepted_by: p.proposal_accepted_by ?? null,
  accepted_at: p.proposal_accepted_at ?? null,
  prior_acceptance: p.prior_acceptance ?? null,
  reopened_reason: p.proposal_reopened_reason ?? null,
  revision_n: p.proposal_revision_n ?? 0,
  revisions: p.proposal_revisions ?? [],
  locked_fields: p.proposal_locked_fields ?? []
});
var acceptInstallationProposal = (project = {}, { accepted_by = null, prices = {}, totals = null } = {}) => {
  const r = acceptProposal(toModel(project), { accepted_by, prices, totals });
  return {
    proposal_accepted: true,
    proposal_accepted_by: r.accepted_by,
    proposal_accepted_at: r.accepted_at,
    pricing_basis_snapshot: r.pricing_basis_snapshot,
    proposal_reopened_reason: null
  };
};
var reopenInstallationProposal = (project = {}, reason = null) => {
  const m = toModel(project);
  const r = reopenProposal(m, reason);
  if (r === m) return null;
  return {
    proposal_accepted: false,
    proposal_accepted_by: null,
    proposal_accepted_at: null,
    pricing_basis_snapshot: null,
    prior_acceptance: r.prior_acceptance,
    proposal_reopened_reason: r.reopened_reason ?? null
  };
};
var proposalLifecycleState = (project = {}) => {
  if (project.proposal_accepted === true) return "accepted";
  if (project.prior_acceptance) return "reopened";
  return "draft";
};
var isProposalAccepted = (p = {}) => p?.proposal_accepted === true;
var PROPOSAL_LIFECYCLE_PATCH_KEYS = /* @__PURE__ */ new Set([
  "proposal_accepted",
  "proposal_accepted_by",
  "proposal_accepted_at",
  "pricing_basis_snapshot",
  "prior_acceptance",
  "proposal_reopened_reason",
  "proposal_revision_n",
  "proposal_revisions",
  "proposal_locked_fields",
  "updated_date"
]);
var patchOnlyTouchesLifecycle = (patch = {}) => Object.keys(patch).every((k) => PROPOSAL_LIFECYCLE_PATCH_KEYS.has(k));
export {
  CHANNEL_LIFECYCLE_VERSION,
  PROPOSAL_LIFECYCLE_PATCH_KEYS,
  acceptInstallationProposal,
  isProposalAccepted,
  patchOnlyTouchesLifecycle,
  proposalLifecycleState,
  reopenInstallationProposal
};
