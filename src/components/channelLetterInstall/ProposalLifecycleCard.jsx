// P-11 UI consumer: proposal accept/reopen lifecycle on the Summary tab.
// Acceptance freezes a pricing-basis snapshot onto the entity record and
// stamps who/when; reopening requires a reason and preserves the prior
// acceptance as history. Both paths go through the pure lifecycle adapter —
// this card only renders state and collects intent.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, RotateCcw, History, Lock } from "lucide-react";
import {
  acceptInstallationProposal,
  reopenInstallationProposal,
  proposalLifecycleState,
} from "./channelProposalLifecycle.js";

const fmtWhen = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

export default function ProposalLifecycleCard({ project, currentUser, onUpdateProject }) {
  const state = proposalLifecycleState(project || {});
  const accepted = state === "accepted";
  const prior = project?.prior_acceptance;
  const revisionN = project?.proposal_revision_n ?? 0;

  const onAccept = () => {
    const who = currentUser?.full_name || currentUser?.email || null;
    const patch = acceptInstallationProposal(project, {
      accepted_by: who,
      prices: {
        total_materials_cost: project?.total_materials_cost ?? null,
        grand_total: project?.grand_total ?? null,
        sell_price: project?.sell_price ?? null,
      },
      totals: {
        items: (project?.items || []).length,
        letter_purchases: (project?.letter_purchases || []).length,
      },
    });
    onUpdateProject(patch);
  };

  const onReopen = () => {
    const reason = window.prompt("Reopen this accepted proposal? Enter a reason for the audit trail:");
    if (reason === null) return;
    const patch = reopenInstallationProposal(project, reason);
    if (patch) onUpdateProject(patch);
  };

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Lock className="w-5 h-5 text-slate-600" />
          Proposal Lifecycle
          {accepted && <Badge className="bg-emerald-600 text-white ml-1">Accepted</Badge>}
          {state === "reopened" && <Badge className="bg-amber-100 text-amber-800 border border-amber-200 ml-1">Reopened draft</Badge>}
          {state === "draft" && <Badge variant="outline" className="ml-1">Draft</Badge>}
          {revisionN > 0 && <Badge variant="outline" className="text-[10px]">rev {revisionN}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {accepted ? (
          <>
            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-emerald-800 text-xs">
              Accepted{project?.proposal_accepted_by ? ` by ${project.proposal_accepted_by}` : ""} on{" "}
              {fmtWhen(project?.proposal_accepted_at)}. The pricing basis is frozen on the record — reopen
              to make changes (the reopen is recorded with your reason).
            </div>
            {project?.pricing_basis_snapshot && (
              <div className="text-[11px] text-slate-500">
                Pricing basis captured {fmtWhen(project.pricing_basis_snapshot.captured_at)}
                {project.pricing_basis_snapshot.totals?.items != null && ` — ${project.pricing_basis_snapshot.totals.items} install items`}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={onReopen} className="h-8 text-xs">
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reopen proposal…
            </Button>
          </>
        ) : (
          <>
            {state === "reopened" && prior && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-medium">
                  <History className="w-3.5 h-3.5" /> Prior acceptance on record
                </div>
                <div>
                  Was accepted{prior.accepted_by ? ` by ${prior.accepted_by}` : ""} on {fmtWhen(prior.accepted_at)}.
                  {project?.proposal_reopened_reason && <> Reopened: “{project.proposal_reopened_reason}”.</>}
                </div>
              </div>
            )}
            <p className="text-xs text-slate-500">
              Accepting stamps the operator and freezes the current pricing basis on the record for the
              audit trail. Reopen later requires a reason and preserves this acceptance as history.
            </p>
            <Button size="sm" onClick={onAccept} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Accept proposal
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
