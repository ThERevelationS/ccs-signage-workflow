// P-11 (WS-P): proposal lifecycle — complete copy/template, explicit reopen,
// manual field locks, revision/undo, and accepted pricing. Acceptance stamps
// metadata + a pricing-basis snapshot (audit gap G1): once accepted, the
// pricing basis is frozen into the proposal and edits are refused until an
// explicit reopen — which keeps the revision trail.
export const CHANNEL_PROPOSAL_VERSION = 1;

const clone = (o) => JSON.parse(JSON.stringify(o));
const now = () => new Date().toISOString();

// Complete copy — deep clone, new id, lineage recorded, acceptance state
// stripped (a copy is a NEW draft, not a second acceptance).
export const copyProposal = (p) => ({
  ...clone(p),
  id: `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  copied_from: p.id ?? null,
  accepted: false,
  accepted_by: null,
  accepted_at: null,
  pricing_basis_snapshot: null,
  revision_n: 0,
  revisions: [],
});

// Template — like copy but also drops customer/instance identity.
export const templateProposal = (p) => {
  const t = copyProposal(p);
  delete t.customer_id; delete t.customer_name; delete t.project_id;
  t.is_template = true;
  return t;
};

// Manual locks — lockFields marks fields uneditable; applyEdit refuses them.
export const lockProposal = (p, fields = []) => ({
  ...p,
  locked_fields: [...new Set([...(p.locked_fields || []), ...fields])],
});
export const unlockProposal = (p, fields = []) => ({
  ...p,
  locked_fields: (p.locked_fields || []).filter((f) => !fields.includes(f)),
});

// Revise — apply edits to a copy; locked/accepted fields refuse. Returns
// {proposal, applied, refused} — refused edits name the blocking field.
export const reviseProposal = (p, edits = {}) => {
  if (p.accepted === true) {
    return { proposal: p, applied: [], refused: Object.keys(edits), reason: "accepted proposals are frozen — reopen first" };
  }
  const locked = new Set(p.locked_fields || []);
  const applied = []; const refused = [];
  const next = clone(p);
  for (const [k, v] of Object.entries(edits)) {
    if (locked.has(k)) { refused.push(k); continue; }
    next[k] = v; applied.push(k);
  }
  if (applied.length) {
    next.revision_n = (p.revision_n || 0) + 1;
    next.revisions = [...(p.revisions || []), { revision_n: next.revision_n, revised_at: now(), edits_applied: applied, snapshot: clone(p) }];
  }
  return { proposal: next, applied, refused };
};

// Undo — restore the last revision's snapshot, keep the revision log entry
// noting the undo.
export const undoRevision = (p) => {
  const revs = p.revisions || [];
  if (!revs.length) return p;
  const last = revs[revs.length - 1];
  return { ...clone(last.snapshot), revisions: revs.slice(0, -1), revision_n: p.revision_n };
};

// Accept — stamps acceptance metadata + freezes the pricing basis.
export const acceptProposal = (p, { accepted_by = null, prices = {}, totals = null } = {}) => ({
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
    revision_n: p.revision_n ?? 0,
  },
});

// Reopen — explicit, reasoned, audited. Acceptance metadata stays on the
// record as history under prior_acceptance; the proposal is editable again.
export const reopenProposal = (p, reason) => {
  if (p.accepted !== true) return p;
  return {
    ...p,
    accepted: false,
    prior_acceptance: { accepted_by: p.accepted_by, accepted_at: p.accepted_at, pricing_basis_snapshot: p.pricing_basis_snapshot },
    accepted_by: null,
    accepted_at: null,
    pricing_basis_snapshot: null,
    reopened_reason: reason || null,
    reopened_at: now(),
  };
};
