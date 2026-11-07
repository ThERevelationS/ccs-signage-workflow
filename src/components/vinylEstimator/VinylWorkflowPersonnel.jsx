// Per-workflow personnel (Designer / Printer Operator / Weeder, etc.)
// Roles + rates are sourced from the Labor Inventory (shop_labor rows) and
// passed in via `roleOptions`. When ANY row has hours > 0, the calculator uses
// these rows for labor cost INSTEAD of operator_rate × minutes.


import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, X, AlertTriangle } from "lucide-react";
import { hasIssueFor, vinylDraftValue, vinylNumber } from "./vinylPricingAvailability";

const num = (v) => parseFloat(v) || 0;

export default function VinylWorkflowPersonnel({ personnel = [], onChange, suggestedHours = 0, roleOptions = [], issues = [], issuesId }) {
  const update = (idx, patch) => {
    const next = [...personnel];
    // User edited this row — stop the auto-sync from overwriting it.
    next[idx] = { ...next[idx], ...patch, _auto: false };
    // Strict: a malformed rate/hour produces no total instead of a laundered
    // $0 — the issue checker flags the row so it can't slip a silent zero in.
    const r = vinylNumber(next[idx].hourly_rate);
    const h = vinylNumber(next[idx].hours);
    next[idx].total_cost = (r !== null && h !== null) ? r * h : null;
    onChange(next);
  };
  const remove = (idx) => {
    if (!confirm(`Remove role "${personnel[idx]?.role || "this role"}" from this workflow?`)) return;
    onChange(personnel.filter((_, i) => i !== idx));
  };
  const add = (role) => {
    const preset = roleOptions.find(r => r.role === role) || { role, hourly_rate: 50 };
    onChange([...(personnel || []), {
      role: preset.role,
      hourly_rate: preset.hourly_rate,
      hours: 0,
      total_cost: 0,
    }]);
  };

  const totalCost  = personnel.reduce((s, p) => s + num(p.total_cost), 0);
  const totalHours = personnel.reduce((s, p) => s + num(p.hours), 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" /> Workflow Personnel
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value="" onValueChange={(v) => v && add(v)}>
              <SelectTrigger className="h-8 w-52 text-xs">
                <SelectValue placeholder="+ Add role…" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map(r => (
                  <SelectItem key={r.role} value={r.role}>{r.role} · ${r.hourly_rate}/hr</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {personnel.length === 0 ? (
          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-3">
            No per-role personnel set. Labor is being calculated at the printer's operator rate
            ({suggestedHours.toFixed(2)} hr machine + weeding + install). Add roles above for
            granular Designer / Printer Operator / Application costing.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-slate-500">
              <div className="col-span-5">Role</div>
              <div className="col-span-3 text-right">$/hr</div>
              <div className="col-span-2 text-right">Hours</div>
              <div className="col-span-2 text-right">Total</div>
            </div>
            {personnel.map((p, idx) => {
              const rowIssues = issues.filter(i => i.itemIndex === idx);
              return (
              <div key={idx}>
                <div className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-5">
                  <Input value={p.role || ""} onChange={(e) => update(idx, { role: e.target.value })} className="h-8 text-sm" />
                </div>
                <div className="col-span-3">
                  <Input type="number" step="0.5" value={p.hourly_rate ?? ""}
                    onChange={(e) => update(idx, { hourly_rate: vinylDraftValue(e.target.value) })}
                    aria-invalid={hasIssueFor(issues, "hourly_rate", idx) || undefined}
                    aria-describedby={hasIssueFor(issues, "hourly_rate", idx) ? `${issuesId || "vinyl-wf-issues"}-role-${idx}` : undefined}
                    className="h-8 text-sm text-right tabular-nums" />
                </div>
                <div className="col-span-2">
                  <Input type="number" step="0.25" value={p.hours ?? ""}
                    onChange={(e) => update(idx, { hours: vinylDraftValue(e.target.value) })}
                    aria-invalid={hasIssueFor(issues, "hours", idx) || undefined}
                    aria-describedby={hasIssueFor(issues, "hours", idx) ? `${issuesId || "vinyl-wf-issues"}-role-${idx}` : undefined}
                    className="h-8 text-sm text-right tabular-nums" />
                </div>
                <div className="col-span-1 text-right text-sm tabular-nums">
                  {vinylNumber(p.total_cost) !== null ? `$${num(p.total_cost).toFixed(2)}` : "—"}
                </div>
                <div className="col-span-1 text-right">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(idx)}>
                    <X className="w-3.5 h-3.5 text-red-600" />
                  </Button>
                </div>
                </div>
                {rowIssues.length > 0 && (
                  <div role="status" id={`${issuesId || "vinyl-wf-issues"}-role-${idx}`}
                    className="flex items-start gap-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <div className="space-y-0.5">
                      {rowIssues.map((it, i2) => <div key={i2}>{it.message}</div>)}
                    </div>
                  </div>
                )}
              </div>
              );
            })}
            <div className="flex justify-between text-xs pt-2 border-t border-slate-100">
              <span className="text-slate-500">{totalHours.toFixed(2)} hr total</span>
              <span className="font-semibold tabular-nums">${totalCost.toFixed(2)}</span>
            </div>
          </>
        )}
        {personnel.length === 0 && roleOptions.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            <span className="text-[10px] text-slate-500 mr-1">Quick add:</span>
            {["Designer", "Printer Operator", "Application Technician"].map(role => (
              roleOptions.some(r => r.role === role) && (
                <Button key={role} size="sm" variant="outline" className="h-6 text-xs" onClick={() => add(role)}>
                  <Plus className="w-3 h-3 mr-1" /> {role}
                </Button>
              )
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}