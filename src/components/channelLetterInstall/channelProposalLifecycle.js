// P-11 UI adapter — the pure proposal-lifecycle model works on short field
// names (accepted/revision_n/...); the ChannelLetterInstallation entity
// persists them under proposal_* names. This module maps between the two so
// the entity record is the single source of truth and the model logic stays
// pure. Only fields declared on the entity are emitted — nothing is dropped
// silently on save.
import {
  acceptProposal,
  reopenProposal,
} from "./channelProposalRevisions.js";

export const CHANNEL_LIFECYCLE_VERSION = 1;

const toModel = (p = {}) => ({
  ...p,
  accepted: p.proposal_accepted === true,
  accepted_by: p.proposal_accepted_by ?? null,
  accepted_at: p.proposal_accepted_at ?? null,
  prior_acceptance: p.prior_acceptance ?? null,
  reopened_reason: p.proposal_reopened_reason ?? null,
  revision_n: p.proposal_revision_n ?? 0,
  revisions: p.proposal_revisions ?? [],
  locked_fields: p.proposal_locked_fields ?? [],
});

// Accept the current proposal — freezes the pricing basis + stamps who/when.
// Returns the project-field patch; callers apply via updateProject.
export const acceptInstallationProposal = (project = {}, { accepted_by = null, prices = {}, totals = null } = {}) => {
  const r = acceptProposal(toModel(project), { accepted_by, prices, totals });
  return {
    proposal_accepted: true,
    proposal_accepted_by: r.accepted_by,
    proposal_accepted_at: r.accepted_at,
    pricing_basis_snapshot: r.pricing_basis_snapshot,
    proposal_reopened_reason: null,
  };
};

// Reopen an accepted proposal — requires a reason, preserves the prior
// acceptance as history. Returns null when the project is not accepted
// (caller treats it as a no-op; never silently reopens a draft).
export const reopenInstallationProposal = (project = {}, reason = null) => {
  const m = toModel(project);
  const r = reopenProposal(m, reason);
  if (r === m) return null;
  return {
    proposal_accepted: false,
    proposal_accepted_by: null,
    proposal_accepted_at: null,
    pricing_basis_snapshot: null,
    prior_acceptance: r.prior_acceptance,
    proposal_reopened_reason: r.reopened_reason ?? null,
  };
};

// Display-state helper — draft / accepted / reopened (was accepted, now
// editable again with prior-acceptance history on record).
export const proposalLifecycleState = (project = {}) => {
  if (project.proposal_accepted === true) return "accepted";
  if (project.prior_acceptance) return "reopened";
  return "draft";
};

// P-11 hard-freeze — while proposal_accepted the pricing basis is frozen:
// content mutations are refused until an explicit reopen. Only the keys in
// PROPOSAL_LIFECYCLE_PATCH_KEYS may change on an accepted record (the
// accept/reopen patches themselves plus the persistence updated_date stamp).
export const isProposalAccepted = (p = {}) => p?.proposal_accepted === true;

export const PROPOSAL_LIFECYCLE_PATCH_KEYS = new Set([
  "proposal_accepted",
  "proposal_accepted_by",
  "proposal_accepted_at",
  "pricing_basis_snapshot",
  "prior_acceptance",
  "proposal_reopened_reason",
  "proposal_revision_n",
  "proposal_revisions",
  "proposal_locked_fields",
  "updated_date",
]);

export const patchOnlyTouchesLifecycle = (patch = {}) =>
  Object.keys(patch).every((k) => PROPOSAL_LIFECYCLE_PATCH_KEYS.has(k));
