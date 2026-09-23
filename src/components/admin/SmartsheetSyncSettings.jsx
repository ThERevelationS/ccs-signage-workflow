import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Check, Loader2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import {
  loadSingleGlobalSetting,
  saveGlobalSettingValueIfUnchanged,
} from "@/components/shared/globalSettingsPersistence";
import {
  getAllSmartsheetRows,
  getSmartsheetColumns,
  getSmartsheetSyncStatus,
  listSmartsheetSheets,
  testSmartsheetConnection,
} from "@/components/admin/smartsheetSyncPersistence";
import {
  SMARTSHEET_MAPPING_BLUEPRINTS,
  analyzeSmartsheetColumns,
  buildVerifiedSmartsheetBinding,
  mappingDirectionLabel,
  mappingTransformLabel,
} from "@/components/admin/smartsheetMappingModel";
import { SMARTSHEET_CUSTOMER_RESOLUTION_POLICY } from "@/components/admin/smartsheetCustomerResolutionModel";
import { buildSmartsheetDryRunPreview } from "@/components/admin/smartsheetDryRunModel";
import { buildSmartsheetCreationReadiness } from "@/components/admin/smartsheetCreationReadinessModel";
import {
  blockSmartsheetCrossSheetCustomerConflicts,
  buildSmartsheetControlledCreationProposals,
} from "@/components/admin/smartsheetControlledCreationProposalModel";
import SmartsheetControlledCreationProposalsCard from "@/components/admin/SmartsheetControlledCreationProposalsCard";
import { buildSmartsheetRolloutBaseline } from "@/components/admin/smartsheetRolloutModel";
import {
  buildCreateNewCustomerDecision,
  buildCustomerResolutionReviewGroups,
  buildUseExistingCustomerDecision,
  clearCustomerReviewDecision,
  DEFAULT_SMARTSHEET_CUSTOMER_REVIEW,
  mergeSmartsheetCustomerReview,
  setCustomerReviewDecision,
} from "@/components/admin/smartsheetCustomerResolutionReviewModel";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import {
  enforceSmartsheetBackendSafety,
  smartsheetWriteControlsLocked,
} from "@/components/admin/smartsheetSyncSafetyModel";

const SETTING_KEY = "smartsheetSyncConfig";
const CUSTOMER_REVIEW_SETTING_KEY = "smartsheetCustomerResolutionReview";

const DEFAULT_CONFIG = {
  schema_version: 3,
  global_enabled: false,
  observation_mode: true,
  backup_before_write: true,
  mass_change_limit_count: 25,
  mass_change_limit_percent: 10,
  sales: {
    label: "Sales Pipeline",
    smartsheet_sheet_name: "Workflow",
    smartsheet_sheet_id: "",
    column_bindings: {},
    bindings_verified_at: "",
    rollout_baseline: null,
    mirror_enabled: false,
    importer_enabled: false,
    pull_enabled: false,
    push_enabled: false,
    create_base44_from_smartsheet: false,
    create_smartsheet_from_base44: false,
  },
  orders: {
    label: "Order Form",
    smartsheet_sheet_name: "Order Request",
    smartsheet_sheet_id: "",
    column_bindings: {},
    bindings_verified_at: "",
    rollout_baseline: null,
    mirror_enabled: false,
    importer_enabled: false,
    pull_enabled: false,
    push_enabled: false,
    create_base44_from_smartsheet: false,
    create_smartsheet_from_base44: false,
  },
};

function mergeConfig(saved = {}, { writeBackendAvailable = false } = {}) {
  return enforceSmartsheetBackendSafety({
    ...DEFAULT_CONFIG,
    ...(saved || {}),
    sales: { ...DEFAULT_CONFIG.sales, ...(saved?.sales || {}) },
    orders: { ...DEFAULT_CONFIG.orders, ...(saved?.orders || {}) },
  }, { writeBackendAvailable });
}

function MappingPlan({ title, rows }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="mt-1 text-xs text-gray-500">Blueprint only. Actual Smartsheet column IDs are not bound until the live sheets are inspected.</p>
        </div>
        <Badge variant="outline" className="shrink-0">{rows.length} fields</Badge>
      </div>
      <div className="mt-3 max-h-80 overflow-y-auto divide-y rounded-lg border bg-white">
        {rows.map((row) => (
          <div key={row.field} className="grid grid-cols-1 gap-2 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
            <div className="min-w-0">
              <div className="font-medium text-gray-800">{row.label}</div>
              <div className="font-mono text-[10px] text-gray-500">{row.field}</div>
              {row.suggestedNames?.length > 0 && (
                <div className="mt-1 text-[10px] text-gray-500">Likely Smartsheet labels: {row.suggestedNames.join(", ")}</div>
              )}
            </div>
            <Badge variant="outline" className="w-fit">{mappingDirectionLabel(row.direction)}</Badge>
            <Badge variant="outline" className="w-fit">{mappingTransformLabel(row.transform)}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveMappingAnalysisCard({ title, result }) {
  if (!result) return null;

  if (result.status !== "ready") {
    const message = result.status === "ambiguous_sheet"
      ? `Multiple accessible sheets match "${result.expectedName}". Review them before choosing one.`
      : `No accessible sheet exactly matches "${result.expectedName}".`;
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <div className="font-semibold">{title}</div>
        <div className="mt-1">{message}</div>
        {result.sheetMatches?.length > 0 && (
          <div className="mt-2 space-y-1">
            {result.sheetMatches.map((sheet) => <div key={sheet.id}>{sheet.name} — ID {sheet.id}</div>)}
          </div>
        )}
      </div>
    );
  }

  const { sheet, analysis } = result;
  return (
    <div className="rounded-lg border border-blue-200 bg-white/80 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="mt-1 text-[11px] text-gray-500">{sheet.name} • Sheet ID {sheet.id}</div>
        </div>
        <div className="flex flex-wrap gap-1 text-[11px]">
          <Badge className="bg-green-100 text-green-700">{analysis.counts.matched} matched</Badge>
          <Badge className="bg-amber-100 text-amber-800">{analysis.counts.missing} missing</Badge>
          <Badge className="bg-red-100 text-red-700">{analysis.counts.conflict} conflicts</Badge>
          <Badge variant="outline">{analysis.counts.protected} protected</Badge>
        </div>
      </div>

      <div className="mt-3 max-h-96 overflow-y-auto divide-y rounded-md border bg-white">
        {analysis.fields.map((field) => {
          const column = field.matches?.[0];
          const statusClass = field.status === "matched"
            ? "bg-green-100 text-green-700"
            : field.status === "conflict"
              ? "bg-red-100 text-red-700"
              : field.status === "missing"
                ? "bg-amber-100 text-amber-800"
                : "bg-gray-100 text-gray-700";
          return (
            <div key={field.field} className="grid grid-cols-1 gap-2 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="font-medium text-gray-800">{field.label}</div>
                <div className="font-mono text-[10px] text-gray-500">{field.field}</div>
              </div>
              <div className="min-w-0 text-gray-600">
                {field.status === "matched" && column ? (
                  <>
                    <div className="font-medium truncate">{column.title}</div>
                    <div className="text-[10px]">Column ID {column.id} • {column.type || "UNKNOWN"}</div>
                  </>
                ) : field.status === "conflict" ? (
                  <div>{field.matches.map((match) => `${match.title} (ID ${match.id})`).join(", ")}</div>
                ) : field.status === "protected" ? (
                  <div>Base44 only — no Smartsheet binding</div>
                ) : (
                  <div>No exact approved column-name match</div>
                )}
              </div>
              <Badge className={statusClass}>{field.status}</Badge>
            </div>
          );
        })}
      </div>

      {analysis.unmappedColumns.length > 0 && (
        <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-2 text-[11px] text-gray-600">
          <span className="font-semibold">Unmapped Smartsheet columns:</span>{" "}
          {analysis.unmappedColumns.map((column) => `${column.title} (ID ${column.id})`).join(", ")}
        </div>
      )}
    </div>
  );
}

function CustomerResolutionReviewQueue({
  preview,
  dataset,
  reviewState,
  onSaveChoice,
  onClearChoice,
  saving = false,
}) {
  const rolloutPreview = preview?.preview?.rolloutPreview || null;
  if (!rolloutPreview || rolloutPreview.baseline_state !== "captured") return null;

  const review = buildCustomerResolutionReviewGroups({
    rows: preview?.preview?.rows || [],
    rolloutPreview,
    dataset,
    sheetId: preview?.sheet_id,
    reviewState,
  });
  const groups = review.groups || [];
  const summary = review.summary || {};

  return (
    <div className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50/50">
      <div className="border-b border-cyan-200 px-3 py-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-semibold text-cyan-950">Post-baseline Customer review</div>
            <div className="mt-1 text-[10px] text-cyan-900">
              Decisions are saved separately for future sync use. They do not change Customers, aliases, WorkOrders, Orders, or Smartsheet rows.
            </div>
          </div>
          <div className="flex flex-wrap gap-1 text-[10px]">
            <Badge variant="outline">{summary.total_unique || 0} new names</Badge>
            <Badge className="bg-green-100 text-green-700">{summary.exact_existing || 0} exact existing</Badge>
            <Badge className="bg-amber-100 text-amber-800">{summary.needs_decision || 0} need decision</Badge>
            <Badge className="bg-blue-100 text-blue-700">{summary.decided_existing || 0} existing approved</Badge>
            <Badge className="bg-violet-100 text-violet-800">{summary.decided_new || 0} new approved</Badge>
            {summary.blocked_missing_name > 0 && (
              <Badge className="bg-red-100 text-red-700">{summary.blocked_missing_name} missing name</Badge>
            )}
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="px-3 py-4 text-xs text-cyan-900">
          No new post-baseline customer names are waiting for review.
        </div>
      ) : (
        <div className="max-h-[32rem] overflow-y-auto divide-y divide-cyan-100">
          {groups.slice(0, 100).map((group) => {
            const candidates = Array.isArray(group.candidates) ? group.candidates.slice(0, 5) : [];
            const decision = group.decision;
            return (
              <div key={group.key} className="space-y-2 bg-white/80 px-3 py-3 text-xs">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900">{group.source_name}</div>
                    <div className="mt-0.5 text-[10px] text-gray-500">
                      {group.row_count.toLocaleString()} new Smartsheet row{group.row_count === 1 ? "" : "s"}
                      {group.row_numbers?.length ? ` • rows ${group.row_numbers.join(", ")}` : ""}
                    </div>
                    {group.reason && <div className="mt-1 text-[10px] text-gray-500">{group.reason}</div>}
                  </div>
                  <Badge
                    className={
                      group.resolution_state === "exact_existing"
                        ? "bg-green-100 text-green-700"
                        : group.resolution_state === "decided"
                          ? "bg-blue-100 text-blue-700"
                          : group.resolution_state === "blocked_missing_name"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-800"
                    }
                  >
                    {group.resolution_state === "exact_existing"
                      ? "exact existing"
                      : group.resolution_state === "decided"
                        ? "decision saved"
                        : group.resolution_state === "blocked_missing_name"
                          ? "blocked"
                          : "review required"}
                  </Badge>
                </div>

                {group.resolution_state === "exact_existing" && (
                  <div className="rounded-md border border-green-200 bg-green-50 p-2 text-[11px] text-green-900">
                    Existing Base44 Customer: <strong>{group.recommended_company_name}</strong>. No manual customer decision is required.
                  </div>
                )}

                {decision && (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-950">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        {decision.action === "use_existing_customer"
                          ? <>Use existing Customer <strong>{decision.company_name}</strong>{decision.remember_alias ? " and plan this Smartsheet spelling as an alias." : "."}</>
                          : <>Approve <strong>{decision.proposed_company_name}</strong> as a future new-Customer candidate.</>}
                        <div className="mt-1 text-[10px] text-blue-800">Review decision only; nothing has been created or edited.</div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11 shrink-0"
                        disabled={saving}
                        onClick={() => onClearChoice(group)}
                      >
                        Clear decision
                      </Button>
                    </div>
                  </div>
                )}

                {!decision && group.review_required && (
                  <div className="space-y-2">
                    {candidates.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Existing Customer candidates</div>
                        {candidates.map((candidate) => (
                          <div key={candidate.customer_id} className="flex flex-col gap-2 rounded-md border bg-gray-50 p-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <div className="font-medium text-gray-800">{candidate.company_name}</div>
                              <div className="text-[10px] text-gray-500">
                                Score {candidate.score || 0}
                                {candidate.reasons?.length ? ` • ${candidate.reasons.join(", ")}` : ""}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="min-h-11"
                                disabled={saving}
                                onClick={() => onSaveChoice({
                                  group,
                                  action: "use_existing_customer",
                                  candidate,
                                  rememberAlias: false,
                                })}
                              >
                                Use existing
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="min-h-11"
                                disabled={saving}
                                onClick={() => onSaveChoice({
                                  group,
                                  action: "use_existing_customer",
                                  candidate,
                                  rememberAlias: true,
                                })}
                              >
                                Use + plan alias
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-col gap-2 rounded-md border border-violet-200 bg-violet-50 p-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-[11px] text-violet-900">
                        None of those are the same company? Approve this name as a future new Customer. This still creates nothing now.
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11 shrink-0"
                        disabled={saving || !group.normalized_name}
                        onClick={() => onSaveChoice({
                          group,
                          action: "create_new_customer",
                        })}
                      >
                        Approve new Customer
                      </Button>
                    </div>
                  </div>
                )}

                {group.resolution_state === "blocked_missing_name" && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-900">
                    A customer name is required before this row can enter customer resolution.
                  </div>
                )}
              </div>
            );
          })}
          {groups.length > 100 && (
            <div className="bg-cyan-50 px-3 py-2 text-[10px] text-cyan-900">
              Showing the first 100 of {groups.length.toLocaleString()} post-baseline customer names.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DryRunPreviewCard({
  title,
  preview,
  newRecordLabel,
  dataset,
  reviewState,
  onSaveCustomerReview,
  onClearCustomerReview,
  reviewSaving,
  reviewedCreationReadiness,
  creationProposals,
  crossSheetConflicts = [],
}) {
  if (!preview) return null;
  const summary = preview.preview?.summary || {};
  const customerSummary = preview.preview?.customerSummary || {};
  const uniqueCustomerSummary = preview.preview?.uniqueCustomerSummary || {};
  const customerGroups = preview.preview?.customerGroups || [];
  const rolloutPreview = preview.preview?.rolloutPreview || null;
  const rolloutSummary = rolloutPreview?.summary || {};
  const rolloutRows = rolloutPreview?.classifications || [];
  const creationReadiness = reviewedCreationReadiness || preview.preview?.creationReadiness || null;
  const readinessSummary = creationReadiness?.summary || {};
  const readinessRows = creationReadiness?.rows || [];

  return (
    <div className="rounded-lg border border-violet-200 bg-white/80 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="mt-1 text-[11px] text-gray-500">
            Complete read-only scan: {Number(preview.returned_row_count || 0).toLocaleString()} of {Number(preview.total_row_count || 0).toLocaleString()} Smartsheet rows
            {preview.pages_loaded ? ` • ${preview.pages_loaded} API page${preview.pages_loaded === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-1 text-[11px]">
          <Badge className="bg-green-100 text-green-700">{summary.linked_same || 0} linked same</Badge>
          <Badge className="bg-amber-100 text-amber-800">{summary.linked_different || 0} linked different</Badge>
          <Badge className="bg-blue-100 text-blue-700">{summary.candidate || 0} existing-record candidates</Badge>
          <Badge className="bg-red-100 text-red-700">{summary.ambiguous || 0} record ambiguous</Badge>
          <Badge className="bg-violet-100 text-violet-800">{summary.new_record || 0} new {newRecordLabel || "records"}</Badge>
          <Badge variant="outline">{summary.empty || 0} empty</Badge>
        </div>
      </div>

      {rolloutPreview && (summary.new_record || 0) > 0 && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/70 p-2 text-[11px] text-amber-950">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 font-semibold">Rollout creation gate:</span>
            <Badge variant="outline">{rolloutSummary.proposed_new_records || 0} unlinked proposed records</Badge>
            {rolloutPreview.baseline_state === "captured" && (
              <Badge className="bg-blue-100 text-blue-700">
                baseline {Number(rolloutPreview.baseline_row_count || 0).toLocaleString()} rows
              </Badge>
            )}
            {rolloutSummary.historical_external > 0 && (
              <Badge className="bg-gray-100 text-gray-700">{rolloutSummary.historical_external} historical/external</Badge>
            )}
            {rolloutSummary.legacy_terminal > 0 && (
              <Badge className="bg-slate-100 text-slate-700">{rolloutSummary.legacy_terminal} terminal-history signals</Badge>
            )}
            {rolloutSummary.manual_backfill_review > 0 && (
              <Badge className="bg-amber-100 text-amber-800">{rolloutSummary.manual_backfill_review} manual backfill review</Badge>
            )}
            {rolloutSummary.post_baseline_new > 0 && (
              <Badge className="bg-blue-100 text-blue-700">{rolloutSummary.post_baseline_new} new after baseline</Badge>
            )}
            <Badge className="bg-red-100 text-red-700">{rolloutPreview.auto_create_eligible || 0} automatic creates</Badge>
          </div>
          <div className="mt-1 text-[10px] text-amber-900">{rolloutPreview.policy}</div>
          {rolloutRows.length > 0 && (
            <div className="mt-2 max-h-56 overflow-y-auto divide-y rounded border border-amber-200 bg-white/80">
              {rolloutRows.slice(0, 100).map((item) => {
                const outcomeLabel = item.outcome === "historical_external"
                  ? "historical / external"
                  : item.outcome === "legacy_terminal"
                    ? "legacy terminal"
                    : item.outcome === "post_baseline_new"
                      ? "new after baseline"
                      : "manual review";
                return (
                  <div key={item.row_id} className="grid grid-cols-1 gap-1 px-2 py-1.5 sm:grid-cols-[75px_minmax(0,1fr)_auto] sm:items-center">
                    <div className="text-gray-500">Row {item.row_number || "—"}</div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-800">{item.label}</div>
                      <div className="truncate text-[10px] text-gray-500">
                        {item.task_text ? `Task: ${item.task_text} • ` : ""}{item.reason}
                      </div>
                    </div>
                    <Badge variant="outline" className="w-fit">{outcomeLabel}</Badge>
                  </div>
                );
              })}
              {rolloutRows.length > 100 && (
                <div className="px-2 py-1.5 text-[10px] text-gray-500">
                  Showing the first 100 of {rolloutRows.length.toLocaleString()} rollout-classified rows. Summary counts include all rows.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {creationReadiness?.state === "ready" && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50/60 p-2 text-[11px] text-emerald-950">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 font-semibold">Future creation readiness:</span>
            <Badge variant="outline">{readinessSummary.post_baseline_rows || 0} post-baseline rows</Badge>
            <Badge className="bg-green-100 text-green-700">{readinessSummary.ready_for_controlled_create_review || 0} data-ready</Badge>
            {readinessSummary.blocked_customer > 0 && (
              <Badge className="bg-amber-100 text-amber-800">{readinessSummary.blocked_customer} customer blocked</Badge>
            )}
            {readinessSummary.blocked_required_fields > 0 && (
              <Badge className="bg-amber-100 text-amber-800">{readinessSummary.blocked_required_fields} required-data blocked</Badge>
            )}
            {readinessSummary.blocked_existing_record > 0 && (
              <Badge className="bg-red-100 text-red-700">{readinessSummary.blocked_existing_record} existing-record blocked</Badge>
            )}
            {readinessSummary.blocked_empty > 0 && (
              <Badge variant="outline">{readinessSummary.blocked_empty} empty</Badge>
            )}
            <Badge className="bg-red-100 text-red-700">{creationReadiness.automatic_creates || 0} automatic creates</Badge>
          </div>
          <div className="mt-1 text-[10px] text-emerald-900">
            “Data-ready” means required schema fields and Customer resolution are complete enough for a later controlled create review. It does not authorize or perform creation.
          </div>
          {readinessRows.length > 0 && (
            <div className="mt-2 max-h-64 overflow-y-auto divide-y rounded border border-emerald-200 bg-white/80">
              {readinessRows.slice(0, 100).map((item) => (
                <div key={item.row_id} className="grid grid-cols-1 gap-1 px-2 py-2 sm:grid-cols-[75px_minmax(0,1fr)_auto] sm:items-start">
                  <div className="text-gray-500">Row {item.row_number || "—"}</div>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-800">{item.label}</div>
                    {item.ready_for_controlled_create_review ? (
                      <div className="text-[10px] text-green-700">
                        Required data present • Customer {item.customer?.state === "approved_new_customer" ? "approved as new" : item.customer?.company_name || "resolved"}
                      </div>
                    ) : (
                      <div className="text-[10px] text-amber-800">
                        {item.blockers.map((entry) => entry.label).join(" • ")}
                      </div>
                    )}
                  </div>
                  <Badge
                    className={item.ready_for_controlled_create_review ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}
                  >
                    {item.ready_for_controlled_create_review ? "data-ready" : "blocked"}
                  </Badge>
                </div>
              ))}
              {readinessRows.length > 100 && (
                <div className="px-2 py-1.5 text-[10px] text-gray-500">
                  Showing the first 100 of {readinessRows.length.toLocaleString()} post-baseline rows. Summary counts include all rows.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(summary.new_record || 0) > 0 && (
        <div className="mt-3 space-y-2 rounded-md border border-blue-100 bg-blue-50/60 p-2 text-[11px]">
          <div className="flex flex-wrap gap-1">
            <span className="mr-1 font-semibold text-blue-900">Row-level customer resolution:</span>
            <Badge className="bg-green-100 text-green-700">{customerSummary.exact_company || 0} exact</Badge>
            <Badge className="bg-green-100 text-green-700">{customerSummary.exact_alias || 0} approved alias</Badge>
            <Badge className="bg-amber-100 text-amber-800">{(customerSummary.strong_review || 0) + (customerSummary.close_review || 0)} review</Badge>
            <Badge className="bg-red-100 text-red-700">{customerSummary.ambiguous || 0} ambiguous</Badge>
            <Badge className="bg-violet-100 text-violet-800">{customerSummary.new_customer || 0} new-client proposals</Badge>
            <Badge variant="outline">{customerSummary.needs_name || 0} missing customer name</Badge>
          </div>
          <div className="flex flex-wrap gap-1 border-t border-blue-100 pt-2">
            <span className="mr-1 font-semibold text-blue-900">Unique Smartsheet customer names:</span>
            <Badge variant="outline">{uniqueCustomerSummary.total_unique || 0} total</Badge>
            <Badge className="bg-green-100 text-green-700">{uniqueCustomerSummary.exact_company || 0} exact</Badge>
            <Badge className="bg-green-100 text-green-700">{uniqueCustomerSummary.exact_alias || 0} approved alias</Badge>
            <Badge className="bg-amber-100 text-amber-800">{(uniqueCustomerSummary.strong_review || 0) + (uniqueCustomerSummary.close_review || 0)} review</Badge>
            <Badge className="bg-red-100 text-red-700">{uniqueCustomerSummary.ambiguous || 0} ambiguous</Badge>
            <Badge className="bg-violet-100 text-violet-800">{uniqueCustomerSummary.new_customer || 0} new-client proposals</Badge>
            <Badge variant="outline">{uniqueCustomerSummary.needs_name || 0} missing name</Badge>
          </div>
        </div>
      )}

      <CustomerResolutionReviewQueue
        preview={preview}
        dataset={dataset}
        reviewState={reviewState}
        onSaveChoice={onSaveCustomerReview}
        onClearChoice={onClearCustomerReview}
        saving={reviewSaving}
      />
      <SmartsheetControlledCreationProposalsCard
        proposals={creationProposals}
        dataset={dataset}
        crossSheetConflicts={crossSheetConflicts}
      />

      {customerGroups.length > 0 && (
        <div className="mt-3 rounded-md border border-gray-200 bg-white">
          <div className="border-b bg-gray-50 px-3 py-2">
            <div className="text-xs font-semibold text-gray-800">Deduplicated customer-resolution queue</div>
            <div className="mt-0.5 text-[10px] text-gray-500">
              One normalized Smartsheet customer name per row below. Row counts show how many proposed {newRecordLabel || "records"} would reuse that decision.
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y">
            {customerGroups.slice(0, 100).map((group) => {
              const outcomeClass = ["exact_company", "exact_alias"].includes(group.outcome)
                ? "bg-green-100 text-green-700"
                : ["strong_review", "close_review"].includes(group.outcome)
                  ? "bg-amber-100 text-amber-800"
                  : group.outcome === "ambiguous"
                    ? "bg-red-100 text-red-700"
                    : group.outcome === "new_customer"
                      ? "bg-violet-100 text-violet-800"
                      : "bg-gray-100 text-gray-700";
              const outcomeLabel = group.outcome === "exact_company"
                ? "exact customer"
                : group.outcome === "exact_alias"
                  ? "approved alias"
                  : group.outcome === "strong_review"
                    ? "strong review"
                    : group.outcome === "close_review"
                      ? "review"
                      : group.outcome === "ambiguous"
                        ? "ambiguous"
                        : group.outcome === "new_customer"
                          ? "new client"
                          : "missing name";
              return (
                <div key={group.key} className="grid grid-cols-1 gap-2 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800">{group.display_name}</div>
                    <div className="mt-0.5 text-[10px] text-gray-500">
                      {group.row_count.toLocaleString()} Smartsheet row{group.row_count === 1 ? "" : "s"}
                      {group.recommended_company_name ? ` • proposed Base44 Customer: ${group.recommended_company_name}` : ""}
                      {group.recommended_score ? ` • score ${group.recommended_score}` : ""}
                    </div>
                    {group.reason && <div className="mt-0.5 text-[10px] text-gray-500">{group.reason}</div>}
                  </div>
                  <Badge className={outcomeClass}>{outcomeLabel}</Badge>
                </div>
              );
            })}
          </div>
          {customerGroups.length > 100 && (
            <div className="border-t bg-gray-50 px-3 py-2 text-[10px] text-gray-500">
              Showing the first 100 of {customerGroups.length.toLocaleString()} unique customer names. Summary counts include all names.
            </div>
          )}
        </div>
      )}

      <div className="mt-3 max-h-96 overflow-y-auto divide-y rounded-md border bg-white">
        {(preview.preview?.rows || []).slice(0, 100).map((row) => (
          <div key={row.row_id} className="grid grid-cols-1 gap-2 px-3 py-2 text-xs sm:grid-cols-[90px_minmax(0,1fr)_auto] sm:items-center">
            <div className="text-gray-500">
              <div>Row {row.row_number || "—"}</div>
              <div className="font-mono text-[9px] truncate" title={row.row_id}>{row.row_id}</div>
            </div>
            <div className="min-w-0">
              <div className="font-medium text-gray-800 truncate">
                {row.base44_label || row.values?.customer_name || row.values?.client_name || row.values?.description || "Unlinked Smartsheet row"}
              </div>
              <div className="text-[10px] text-gray-500">
                {row.match_method === "stable_id"
                  ? "Stable Smartsheet row ID link"
                  : row.match_method === "legacy_source_id"
                    ? "Legacy Sales source-ID candidate"
                    : row.match_method === "exact_composite"
                      ? "Exact composite existing-record candidate"
                      : row.match_method === "ambiguous"
                        ? `${row.candidate_count} possible Base44 records — review required`
                        : row.status === "new_record"
                          ? `Proposed new Base44 ${newRecordLabel || "record"}`
                          : "No Base44 record selected"}
                {row.differences?.length ? ` • ${row.differences.length} mapped difference${row.differences.length === 1 ? "" : "s"}` : ""}
              </div>
              {row.customer_resolution && (
                <div className={`mt-1 text-[10px] ${["exact_company", "exact_alias"].includes(row.customer_resolution.outcome) ? "text-green-700" : ["strong_review", "close_review"].includes(row.customer_resolution.outcome) ? "text-amber-700" : row.customer_resolution.outcome === "ambiguous" ? "text-red-700" : "text-violet-700"}`}>
                  Customer: {row.customer_resolution.outcome === "exact_company"
                    ? `exact Base44 match → ${row.customer_resolution.recommended_company_name}`
                    : row.customer_resolution.outcome === "exact_alias"
                      ? `approved alias → ${row.customer_resolution.recommended_company_name}`
                      : ["strong_review", "close_review"].includes(row.customer_resolution.outcome)
                        ? `review ${row.customer_resolution.recommended_company_name || "candidate"}${row.customer_resolution.recommended_score ? ` (score ${row.customer_resolution.recommended_score})` : ""}`
                        : row.customer_resolution.outcome === "ambiguous"
                          ? `${row.customer_resolution.candidates?.length || 0} plausible customers — explicit selection required`
                          : row.customer_resolution.outcome === "new_customer"
                            ? "no plausible existing Customer — new-client proposal"
                            : "customer name is missing"}
                </div>
              )}
              {row.differences?.length > 0 && (
                <div className="mt-1 text-[10px] text-amber-700">
                  Differences: {row.differences.slice(0, 5).map((difference) => difference.label).join(", ")}
                  {row.differences.length > 5 ? ` +${row.differences.length - 5} more` : ""}
                </div>
              )}
            </div>
            <Badge variant="outline" className="w-fit">{row.status.replaceAll("_", " ")}</Badge>
          </div>
        ))}
      </div>

      {(preview.preview?.rows || []).length > 100 && (
        <div className="mt-2 text-[11px] text-gray-500">Summary covers every row; showing the first 100 rows in this panel.</div>
      )}
    </div>
  );
}

function IntegrationCard({ title, subtitle, value, onChange, writeControlsLocked = true }) {
  const patch = (next) => onChange({ ...value, ...next });
  return (
    <div className="rounded-xl border border-gray-200 bg-white/70 p-4 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge className={value.mirror_enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
            {value.mirror_enabled ? "Mirror armed" : "Mirror off"}
          </Badge>
          <Badge variant="outline">{Object.keys(value.column_bindings || {}).length} column IDs bound</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Smartsheet sheet name</Label>
          <Input
            value={value.smartsheet_sheet_name || ""}
            onChange={(e) => patch({ smartsheet_sheet_name: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Smartsheet sheet ID</Label>
          <Input
            value={value.smartsheet_sheet_id || ""}
            onChange={(e) => patch({ smartsheet_sheet_id: e.target.value.trim() })}
            placeholder="Discovered from API later"
            className="mt-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[
          ["mirror_enabled", "Enable mirror", "Master switch for this dataset."],
          ["importer_enabled", "Enable manual importer", "Admin-only spreadsheet fallback."],
          ["pull_enabled", "Pull Smartsheet → Base44", "Updates approved mapped fields only."],
          ["push_enabled", "Push Base44 → Smartsheet", "Updates approved mapped fields only."],
          ["create_base44_from_smartsheet", "Create in Base44 from new Smartsheet rows", "Requires client/relationship resolution."],
          ["create_smartsheet_from_base44", "Create in Smartsheet from new Base44 rows", "Creates one linked row per Base44 record."],
        ].map(([key, label, help]) => (
          <div key={key} className="flex min-h-12 items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
            <div>
              <div className="text-sm font-medium text-gray-800">{label}</div>
              <div className="text-[11px] text-gray-500">{help}</div>
            </div>
            <Switch
              checked={Boolean(value[key])}
              onCheckedChange={(checked) => patch({ [key]: checked })}
              disabled={writeControlsLocked && key !== "importer_enabled"}
            />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>Permanent rule:</strong> missing or deleted Smartsheet rows will never delete Base44 records. Base44-only rows remain in Base44 and may be excluded from the mirror.
      </div>
    </div>
  );
}

export default function SmartsheetSyncSettings({ sessionToken }) {
  const [record, setRecord] = useState(null);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [customerReviewRecord, setCustomerReviewRecord] = useState(null);
  const [customerReview, setCustomerReview] = useState(DEFAULT_SMARTSHEET_CUSTOMER_REVIEW);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [apiStatus, setApiStatus] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiMessage, setApiMessage] = useState("");
  const [availableSheets, setAvailableSheets] = useState([]);
  const [columnPreview, setColumnPreview] = useState(null);
  const [liveMappingAnalysis, setLiveMappingAnalysis] = useState(null);
  const [dryRunPreview, setDryRunPreview] = useState(null);

  const writesArmed = useMemo(() => Boolean(
    config.global_enabled &&
    !config.observation_mode &&
    ((config.sales.mirror_enabled && (config.sales.pull_enabled || config.sales.push_enabled)) ||
      (config.orders.mirror_enabled && (config.orders.pull_enabled || config.orders.push_enabled)))
  ), [config]);

  const liveMappingsReadyToBind = useMemo(() => {
    const results = [liveMappingAnalysis?.sales, liveMappingAnalysis?.orders];
    return results.every((result) =>
      result?.status === "ready"
      && Number(result.analysis?.counts?.missing || 0) === 0
      && Number(result.analysis?.counts?.conflict || 0) === 0
    );
  }, [liveMappingAnalysis]);

  // Recalculate from the read-only row snapshot whenever a Customer review decision changes.
  // Stored previews are never a creation authorization and contain no live write callback.
  const controlledCreationReview = useMemo(() => {
    if (!dryRunPreview) return null;
    const build = (dataset) => {
      const snapshot = dryRunPreview[dataset];
      const creationReadiness = buildSmartsheetCreationReadiness({
        rows: snapshot?.preview?.rows || [],
        rolloutBaseline: config[dataset].rollout_baseline,
        rolloutPreview: snapshot?.preview?.rolloutPreview,
        dataset,
        sheetId: snapshot?.sheet_id,
        customerReviewState: customerReview,
      });
      const proposals = buildSmartsheetControlledCreationProposals({
        rows: snapshot?.preview?.rows || [],
        creationReadiness,
        dataset,
        sheetId: snapshot?.sheet_id,
        customers: dryRunPreview.customer_catalog || [],
        base44Records: snapshot?.record_catalog || [],
        blueprint: SMARTSHEET_MAPPING_BLUEPRINTS[dataset],
        columnBindings: snapshot?.column_bindings || {},
      });
      return { creationReadiness, proposals };
    };
    const sales = build("sales");
    const orders = build("orders");
    const checked = blockSmartsheetCrossSheetCustomerConflicts(sales.proposals, orders.proposals);
    return {
      sales: { creationReadiness: sales.creationReadiness, proposals: checked.sales },
      orders: { creationReadiness: orders.creationReadiness, proposals: checked.orders },
      conflicts: checked.conflicts,
    };
  }, [dryRunPreview, config.sales.rollout_baseline, config.orders.rollout_baseline, customerReview]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [loaded, loadedReview] = await Promise.all([
        loadSingleGlobalSetting({
          entity: base44.entities.GlobalSettings,
          settingKey: SETTING_KEY,
          label: "Smartsheet sync configuration",
        }),
        loadSingleGlobalSetting({
          entity: base44.entities.GlobalSettings,
          settingKey: CUSTOMER_REVIEW_SETTING_KEY,
          label: "Smartsheet customer-resolution review",
        }),
      ]);
      setRecord(loaded);
      setConfig(mergeConfig(loaded?.setting_value));
      setCustomerReviewRecord(loadedReview);
      setCustomerReview(mergeSmartsheetCustomerReview(loadedReview?.setting_value));
    } catch (err) {
      console.error("Smartsheet sync settings could not be loaded:", err);
      setError(err?.message || "Smartsheet sync settings could not be loaded safely.");
    } finally {
      setLoading(false);
    }
  };

  const loadApiStatus = async () => {
    if (!sessionToken) return;
    setApiLoading(true);
    setApiMessage("");
    try {
      const status = await getSmartsheetSyncStatus({ sessionToken });
      setApiStatus(status);
    } catch (err) {
      setApiMessage(err?.message || "Smartsheet API status could not be loaded.");
    } finally {
      setApiLoading(false);
    }
  };

  const testApi = async () => {
    if (!sessionToken || apiLoading) return;
    setApiLoading(true);
    setApiMessage("");
    try {
      const result = await testSmartsheetConnection({ sessionToken });
      setApiMessage(`Read-only connection verified. ${Number(result.total_accessible_sheets || 0).toLocaleString()} accessible sheet${Number(result.total_accessible_sheets || 0) === 1 ? "" : "s"}.`);
      await loadApiStatus();
    } catch (err) {
      setApiMessage(err?.message || "Smartsheet connection test failed.");
    } finally {
      setApiLoading(false);
    }
  };

  const discoverSheets = async () => {
    if (!sessionToken || apiLoading) return;
    setApiLoading(true);
    setApiMessage("");
    try {
      const result = await listSmartsheetSheets({ sessionToken });
      setAvailableSheets(Array.isArray(result.sheets) ? result.sheets : []);
      setApiMessage(`Discovered ${Number(result.total_accessible_sheets || 0).toLocaleString()} accessible Smartsheet sheet${Number(result.total_accessible_sheets || 0) === 1 ? "" : "s"}. No data was changed.`);
    } catch (err) {
      setApiMessage(err?.message || "Smartsheet sheet discovery failed.");
    } finally {
      setApiLoading(false);
    }
  };

  const analyzeLiveMappings = async () => {
    if (!sessionToken || apiLoading) return;
    setApiLoading(true);
    setApiMessage("");
    setLiveMappingAnalysis(null);
    setDryRunPreview(null);
    try {
      await testSmartsheetConnection({ sessionToken });
      const discovery = await listSmartsheetSheets({ sessionToken });
      const sheets = Array.isArray(discovery.sheets) ? discovery.sheets : [];
      setAvailableSheets(sheets);

      const profiles = [
        {
          key: "sales",
          title: "Sales Pipeline ↔ Workflow",
          expectedName: config.sales.smartsheet_sheet_name || "Workflow",
          expectedId: String(config.sales.smartsheet_sheet_id || "").trim(),
          blueprint: SMARTSHEET_MAPPING_BLUEPRINTS.sales,
        },
        {
          key: "orders",
          title: "Order Form ↔ Order Request",
          expectedName: config.orders.smartsheet_sheet_name || "Order Request",
          expectedId: String(config.orders.smartsheet_sheet_id || "").trim(),
          blueprint: SMARTSHEET_MAPPING_BLUEPRINTS.orders,
        },
      ];

      const results = {};
      for (const profile of profiles) {
        const normalizedExpectedName = String(profile.expectedName || "").trim().toLowerCase();
        const sheetMatches = profile.expectedId
          ? sheets.filter((sheet) => String(sheet.id) === profile.expectedId)
          : sheets.filter((sheet) => String(sheet.name || "").trim().toLowerCase() === normalizedExpectedName);

        if (sheetMatches.length !== 1) {
          results[profile.key] = {
            status: sheetMatches.length > 1 ? "ambiguous_sheet" : "missing_sheet",
            expectedName: profile.expectedName,
            expectedId: profile.expectedId,
            sheetMatches,
          };
          continue;
        }

        const sheet = sheetMatches[0];
        const columnsResult = await getSmartsheetColumns({ sessionToken, sheetId: sheet.id });
        const columns = Array.isArray(columnsResult.columns) ? columnsResult.columns : [];
        results[profile.key] = {
          status: "ready",
          title: profile.title,
          sheet,
          analysis: analyzeSmartsheetColumns(profile.blueprint, columns),
        };
      }

      setLiveMappingAnalysis(results);
      const readyResults = Object.values(results).filter((result) => result.status === "ready");
      const matched = readyResults.reduce((sum, result) => sum + result.analysis.counts.matched, 0);
      const missing = readyResults.reduce((sum, result) => sum + result.analysis.counts.missing, 0);
      const conflicts = readyResults.reduce((sum, result) => sum + result.analysis.counts.conflict, 0);
      const unresolvedSheets = Object.values(results).length - readyResults.length;
      setApiMessage(
        `Read-only live mapping analysis complete: ${matched} exact field matches, ${missing} missing field matches, ${conflicts} field conflicts, ${unresolvedSheets} unresolved target sheet${unresolvedSheets === 1 ? "" : "s"}. No settings or business data were changed.`
      );
    } catch (err) {
      setApiMessage(err?.message || "Smartsheet live mapping analysis failed.");
    } finally {
      setApiLoading(false);
    }
  };

  const bindVerifiedMappings = async () => {
    if (!liveMappingsReadyToBind || saving) return;
    if (!config.observation_mode || config.global_enabled) {
      setError("Verified ID binding is only allowed while observation mode is ON and the global sync switch is OFF.");
      return;
    }

    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const verifiedAt = new Date().toISOString();
      const salesBinding = buildVerifiedSmartsheetBinding(liveMappingAnalysis.sales);
      const orderBinding = buildVerifiedSmartsheetBinding(liveMappingAnalysis.orders);
      const nextConfig = mergeConfig({
        ...config,
        schema_version: 3,
        sales: {
          ...config.sales,
          ...salesBinding,
          bindings_verified_at: verifiedAt,
        },
        orders: {
          ...config.orders,
          ...orderBinding,
          bindings_verified_at: verifiedAt,
        },
      });
      const savedRecord = await saveGlobalSettingValueIfUnchanged({
        entity: base44.entities.GlobalSettings,
        loadedRecord: record,
        settingKey: SETTING_KEY,
        nextValue: nextConfig,
        label: "Verified Smartsheet ID bindings",
      });
      setRecord(savedRecord);
      setConfig(mergeConfig(savedRecord?.setting_value));
      setSaved(true);
      setApiMessage(
        `Verified permanent IDs saved in observation mode: ${Object.keys(salesBinding.column_bindings).length} Workflow columns and ${Object.keys(orderBinding.column_bindings).length} Order Request columns. No business data was changed.`
      );
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      console.error("Verified Smartsheet binding save blocked:", err);
      setError(err?.message || "Verified Smartsheet bindings could not be saved safely.");
    } finally {
      setSaving(false);
    }
  };

  const previewLiveRows = async () => {
    if (!sessionToken || apiLoading || !liveMappingsReadyToBind) return;
    setApiLoading(true);
    setApiMessage("");
    setDryRunPreview(null);
    try {
      const salesBinding = buildVerifiedSmartsheetBinding(liveMappingAnalysis.sales);
      const orderBinding = buildVerifiedSmartsheetBinding(liveMappingAnalysis.orders);
      const salesColumnIds = Object.values(salesBinding.column_bindings).map((binding) => binding.column_id);
      const orderColumnIds = Object.values(orderBinding.column_bindings).map((binding) => binding.column_id);

      const [salesSheet, orderSheet, salesRows, orderRows, customers] = await Promise.all([
        getAllSmartsheetRows({
          sessionToken,
          sheetId: salesBinding.smartsheet_sheet_id,
          columnIds: salesColumnIds,
          pageSize: 200,
          maxRows: 10000,
        }),
        getAllSmartsheetRows({
          sessionToken,
          sheetId: orderBinding.smartsheet_sheet_id,
          columnIds: orderColumnIds,
          pageSize: 200,
          maxRows: 10000,
        }),
        loadAllEntityRows({
          entity: base44.entities.WorkOrder,
          sort: "-updated_date",
          pageSize: 500,
          maxRows: 20000,
          label: "Smartsheet Sales dry-run WorkOrders",
        }),
        loadAllEntityRows({
          entity: base44.entities.Order,
          sort: "-updated_date",
          pageSize: 500,
          maxRows: 20000,
          label: "Smartsheet Order dry-run records",
        }),
        loadAllEntityRows({
          entity: base44.entities.Customer,
          sort: "company_name",
          pageSize: 500,
          maxRows: 50000,
          label: "Smartsheet customer-resolution catalog",
        }),
      ]);

      const salesPreview = buildSmartsheetDryRunPreview({
        sheetId: salesBinding.smartsheet_sheet_id,
        smartsheetRows: salesSheet.rows,
        base44Rows: salesRows,
        customers,
        blueprint: SMARTSHEET_MAPPING_BLUEPRINTS.sales,
        columnBindings: salesBinding.column_bindings,
        dataset: "sales",
        rolloutBaseline: config.sales.rollout_baseline,
        customerReviewState: customerReview,
      });
      const orderPreview = buildSmartsheetDryRunPreview({
        sheetId: orderBinding.smartsheet_sheet_id,
        smartsheetRows: orderSheet.rows,
        base44Rows: orderRows,
        customers,
        blueprint: SMARTSHEET_MAPPING_BLUEPRINTS.orders,
        columnBindings: orderBinding.column_bindings,
        dataset: "orders",
        rolloutBaseline: config.orders.rollout_baseline,
        customerReviewState: customerReview,
      });

      setDryRunPreview({
        sales: {
          ...salesSheet, preview: salesPreview, column_bindings: salesBinding.column_bindings,
          record_catalog: salesRows.map(({ id, customer_id, client_name, title, deleted }) => ({
            id, customer_id, client_name, title, deleted,
          })),
        },
        orders: {
          ...orderSheet, preview: orderPreview, column_bindings: orderBinding.column_bindings,
          record_catalog: orderRows.map(({ id, customer_id, customer_name, request_type, description, deleted }) => ({
            id, customer_id, customer_name, request_type, description, deleted,
          })),
        },
        customer_catalog: customers.map((customer) => ({
          id: customer.id,
          company_name: customer.company_name,
          legacy_client_names: customer.legacy_client_names || [],
        })),
      });
      setApiMessage(
        `Complete read-only dry run: ${Number(salesSheet.returned_row_count || 0).toLocaleString()} Workflow rows, ${Number(orderSheet.returned_row_count || 0).toLocaleString()} Order Request rows, and ${customers.length.toLocaleString()} Base44 Customers inspected. No links or business records were changed.`
      );
    } catch (err) {
      setApiMessage(err?.message || "Smartsheet row dry run failed.");
    } finally {
      setApiLoading(false);
    }
  };

  const captureRolloutBaseline = async () => {
    if (saving || !dryRunPreview) return;
    if (!config.observation_mode || config.global_enabled) {
      setError("Rollout baseline capture is only allowed while observation mode is ON and global sync is OFF.");
      return;
    }
    if (config.sales.rollout_baseline?.captured_at || config.orders.rollout_baseline?.captured_at) {
      setError("A rollout baseline is already captured. This screen will not overwrite or move the baseline forward.");
      return;
    }

    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const capturedAt = new Date().toISOString();
      const buildBaseline = (preview, label) => {
        const total = Number(preview?.total_row_count || 0);
        const returned = Number(preview?.returned_row_count || 0);
        const rows = preview?.preview?.rows || [];
        if (!total || returned !== total || rows.length !== returned) {
          throw new Error(`${label} must have a complete stable dry run before baseline capture.`);
        }
        const baseline = buildSmartsheetRolloutBaseline({
          sheetId: preview.sheet_id,
          sheetVersion: preview.sheet_version,
          rows,
          capturedAt,
        });
        if (baseline.row_count !== returned) {
          throw new Error(`${label} row IDs were incomplete or duplicated. Baseline capture was blocked.`);
        }
        return baseline;
      };

      const salesBaseline = buildBaseline(dryRunPreview.sales, "Workflow");
      const orderBaseline = buildBaseline(dryRunPreview.orders, "Order Request");
      const nextConfig = mergeConfig({
        ...config,
        schema_version: 3,
        sales: {
          ...config.sales,
          rollout_baseline: salesBaseline,
        },
        orders: {
          ...config.orders,
          rollout_baseline: orderBaseline,
        },
      });
      const savedRecord = await saveGlobalSettingValueIfUnchanged({
        entity: base44.entities.GlobalSettings,
        loadedRecord: record,
        settingKey: SETTING_KEY,
        nextValue: nextConfig,
        label: "Smartsheet rollout baseline",
      });
      setRecord(savedRecord);
      setConfig(mergeConfig(savedRecord?.setting_value));
      setDryRunPreview(null);
      setSaved(true);
      setApiMessage(
        `Rollout baseline captured in observation mode: ${salesBaseline.row_count.toLocaleString()} Workflow row IDs and ${orderBaseline.row_count.toLocaleString()} Order Request row IDs. Re-run Preview Rows to classify anything added afterward. No Customers, WorkOrders, Orders, or Smartsheet rows were changed.`
      );
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      console.error("Smartsheet rollout baseline capture blocked:", err);
      setError(err?.message || "Smartsheet rollout baseline could not be captured safely.");
    } finally {
      setSaving(false);
    }
  };

  const saveCustomerReviewChoice = async ({
    group,
    action,
    candidate = null,
    rememberAlias = false,
  } = {}) => {
    if (reviewSaving || !group?.decision_key) return;
    if (!config.observation_mode || config.global_enabled) {
      setError("Customer-resolution review decisions are only allowed while observation mode is ON and global sync is OFF.");
      return;
    }

    const profile = group.dataset === "sales" ? config.sales : group.dataset === "orders" ? config.orders : null;
    const baseline = profile?.rollout_baseline;
    if (!baseline?.captured_at || String(baseline.sheet_id || "") !== String(group.sheet_id || "")) {
      setError("Capture the matching rollout baseline before saving customer-resolution decisions.");
      return;
    }

    setReviewSaving(true);
    setError("");
    try {
      const decidedAt = new Date().toISOString();
      const decision = action === "use_existing_customer"
        ? buildUseExistingCustomerDecision({
          group,
          customerId: candidate?.customer_id,
          companyName: candidate?.company_name,
          rememberAlias,
          decidedAt,
        })
        : action === "create_new_customer"
          ? buildCreateNewCustomerDecision({ group, decidedAt })
          : null;
      if (!decision) throw new Error("Choose a valid customer-resolution decision.");

      const nextReview = setCustomerReviewDecision(customerReview, group.decision_key, decision);
      const savedRecord = await saveGlobalSettingValueIfUnchanged({
        entity: base44.entities.GlobalSettings,
        loadedRecord: customerReviewRecord,
        settingKey: CUSTOMER_REVIEW_SETTING_KEY,
        nextValue: nextReview,
        label: "Smartsheet customer-resolution review",
      });
      setCustomerReviewRecord(savedRecord);
      setCustomerReview(mergeSmartsheetCustomerReview(savedRecord?.setting_value));
      setApiMessage(
        action === "create_new_customer"
          ? `Review decision saved for ${group.source_name}: approved as a future new-Customer candidate. No Customer or business record was created.`
          : `Review decision saved for ${group.source_name}: use ${candidate?.company_name}${rememberAlias ? " and plan this Smartsheet name as an alias" : ""}. No Customer was changed and no business record was created.`
      );
    } catch (err) {
      console.error("Smartsheet customer-resolution review save blocked:", err);
      setError(err?.message || "Customer-resolution review decision could not be saved safely.");
    } finally {
      setReviewSaving(false);
    }
  };

  const clearCustomerReviewChoice = async (group) => {
    if (reviewSaving || !group?.decision_key) return;
    if (!config.observation_mode || config.global_enabled) {
      setError("Customer-resolution review decisions are only allowed while observation mode is ON and global sync is OFF.");
      return;
    }

    setReviewSaving(true);
    setError("");
    try {
      const nextReview = clearCustomerReviewDecision(customerReview, group.decision_key);
      const savedRecord = await saveGlobalSettingValueIfUnchanged({
        entity: base44.entities.GlobalSettings,
        loadedRecord: customerReviewRecord,
        settingKey: CUSTOMER_REVIEW_SETTING_KEY,
        nextValue: nextReview,
        label: "Smartsheet customer-resolution review",
      });
      setCustomerReviewRecord(savedRecord);
      setCustomerReview(mergeSmartsheetCustomerReview(savedRecord?.setting_value));
      setApiMessage(`Customer-resolution review decision cleared for ${group.source_name}. No Customer or business record was changed.`);
    } catch (err) {
      console.error("Smartsheet customer-resolution review clear blocked:", err);
      setError(err?.message || "Customer-resolution review decision could not be cleared safely.");
    } finally {
      setReviewSaving(false);
    }
  };

  useEffect(() => {
    load();
    loadApiStatus();
  }, [sessionToken]);

  const inspectSheetColumns = async (sheet) => {
    if (!sessionToken || apiLoading || !sheet?.id) return;
    setApiLoading(true);
    setApiMessage("");
    try {
      const result = await getSmartsheetColumns({ sessionToken, sheetId: sheet.id });
      setColumnPreview({
        sheetId: String(sheet.id),
        sheetName: sheet.name || String(sheet.id),
        columns: Array.isArray(result.columns) ? result.columns : [],
      });
      setApiMessage(`Loaded ${Number(result.columns?.length || 0).toLocaleString()} columns from ${sheet.name || sheet.id}. Read only; no data changed.`);
    } catch (err) {
      setApiMessage(err?.message || "Smartsheet column discovery failed.");
    } finally {
      setApiLoading(false);
    }
  };

  const assignSheet = (profileKey, sheet) => {
    if (!sheet?.id) return;
    setConfig((current) => ({
      ...current,
      [profileKey]: {
        ...current[profileKey],
        smartsheet_sheet_id: String(sheet.id),
        smartsheet_sheet_name: sheet.name || current[profileKey]?.smartsheet_sheet_name || "",
      },
    }));
    setApiMessage(`${sheet.name || sheet.id} selected for ${profileKey === "sales" ? "Sales Pipeline" : "Order Form"}. Save Settings to persist this assignment.`);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const normalized = mergeConfig(config, {
        writeBackendAvailable: apiStatus?.write_actions_available === true,
      });
      const savedRecord = await saveGlobalSettingValueIfUnchanged({
        entity: base44.entities.GlobalSettings,
        loadedRecord: record,
        settingKey: SETTING_KEY,
        nextValue: normalized,
        label: "Smartsheet sync configuration",
      });
      setRecord(savedRecord);
      setConfig(mergeConfig(savedRecord?.setting_value));
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      console.error("Smartsheet sync settings save blocked:", err);
      setError(err?.message || "Smartsheet sync settings changed elsewhere. Reload before saving.");
    } finally {
      setSaving(false);
    }
  };

  const setProfile = (key, next) => setConfig((current) => ({ ...current, [key]: next }));

  if (loading) {
    return <div className="flex items-center justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="clay-card p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                Smartsheet Sync
              </h2>
              <Badge className={config.global_enabled ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}>
                {config.global_enabled ? "Globally enabled" : "Global kill switch OFF"}
              </Badge>
              <Badge className={config.observation_mode ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}>
                {config.observation_mode ? "Observation only" : "Writes allowed by mode"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              One controlled bridge for Sales Pipeline ↔ Workflow and Order Form ↔ Order Request. Row/column position is never used as identity.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={load} disabled={saving}>
              <RefreshCw className="h-4 w-4 mr-2" />Reload
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : saved ? <Check className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {saved ? "Saved" : "Save Settings"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        )}

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold">Smartsheet API connection</div>
              <div className="mt-1 text-xs">
                Credential: {apiStatus?.configured ? "configured securely on the server" : "not configured"}.
                {" "}The token is never stored in this settings record or returned to the browser.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={loadApiStatus} disabled={apiLoading || !sessionToken}>
                {apiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-2">API Status</span>
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={testApi} disabled={apiLoading || !apiStatus?.configured}>
                Test Read Only
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={discoverSheets} disabled={apiLoading || !apiStatus?.configured}>
                Discover Sheets
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={analyzeLiveMappings} disabled={apiLoading || !apiStatus?.configured}>
                Analyze Live Mapping
              </Button>
            </div>
          </div>

          {!apiStatus?.configured && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              Add the rotated token as the Base44 app secret <code className="font-mono">SMARTSHEET_API_TOKEN</code>. Do not place it in source code or GlobalSettings.
            </div>
          )}

          {apiStatus && smartsheetWriteControlsLocked(apiStatus) && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
              The deployed Smartsheet backend is read-only. Global sync and all mirror/pull/push/create controls are locked off until the backend explicitly advertises write actions.
            </div>
          )}

          {apiMessage && <div className="text-xs">{apiMessage}</div>

          {availableSheets.length > 0 && (
            <div className="rounded-md border border-blue-200 bg-white/70 p-2">
              <div className="text-xs font-semibold mb-2">Accessible sheets — review only</div>
              <div className="max-h-52 overflow-y-auto divide-y">
                {availableSheets.map((sheet) => {
                  const isWorkflow = sheet.name === "Workflow";
                  const isOrderRequest = sheet.name === "Order Request";
                  return (
                    <div key={sheet.id} className="flex flex-col gap-2 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{sheet.name}</div>
                        <div className="text-gray-500">ID {sheet.id}{sheet.access_level ? ` • ${sheet.access_level}` : ""}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {(isWorkflow || isOrderRequest) && (
                          <Badge className="bg-green-100 text-green-700 shrink-0">Expected sheet</Badge>
                        )}
                        <Button type="button" size="sm" variant="outline" onClick={() => inspectSheetColumns(sheet)} disabled={apiLoading}>
                          Inspect columns
                        </Button>
                        {isWorkflow && (
                          <Button type="button" size="sm" variant="outline" onClick={() => assignSheet("sales", sheet)}>
                            Use for Sales
                          </Button>
                        )}
                        {isOrderRequest && (
                          <Button type="button" size="sm" variant="outline" onClick={() => assignSheet("orders", sheet)}>
                            Use for Orders
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {columnPreview && (
            <div className="rounded-md border border-blue-200 bg-white/70 p-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold">
                  {columnPreview.sheetName} columns
                </div>
                <div className="text-[11px] text-gray-500">Sheet ID {columnPreview.sheetId}</div>
              </div>
              <div className="mt-2 max-h-64 overflow-y-auto divide-y">
                {columnPreview.columns.length === 0 ? (
                  <div className="py-3 text-xs text-gray-500">No columns returned.</div>
                ) : columnPreview.columns.map((column) => (
                  <div key={column.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{column.title}</div>
                      <div className="text-gray-500">
                        Column ID {column.id}{column.primary ? " • Primary" : ""}{column.system_column_type ? ` • ${column.system_column_type}` : ""}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0">{column.type || "UNKNOWN"}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {liveMappingAnalysis && (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-semibold">Live mapping proposal — read only</div>
                  <div className="mt-1 text-[11px] text-gray-600">
                    Permanent binding is blocked unless both sheets have zero missing fields and zero conflicts.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={previewLiveRows}
                    disabled={apiLoading || !liveMappingsReadyToBind}
                  >
                    {apiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Preview Rows
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={bindVerifiedMappings}
                    disabled={saving || !liveMappingsReadyToBind || !config.observation_mode || config.global_enabled}
                  >
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                    Bind Verified IDs
                  </Button>
                </div>
              </div>
              <LiveMappingAnalysisCard title="Sales Pipeline ↔ Workflow" result={liveMappingAnalysis.sales} />
              <LiveMappingAnalysisCard title="Order Form ↔ Order Request" result={liveMappingAnalysis.orders} />

              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-950">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold">Rollout baseline</div>
                    <div className="mt-1 text-[11px]">
                      Saves only the permanent Smartsheet row IDs from a complete read-only preview. It does not create Customers, WorkOrders, Orders, links, or Smartsheet changes.
                    </div>
                  </div>
                  {!config.sales.rollout_baseline?.captured_at && !config.orders.rollout_baseline?.captured_at && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={captureRolloutBaseline}
                      disabled={saving || !dryRunPreview || !config.observation_mode || config.global_enabled}
                    >
                      {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                      Capture Rollout Baseline
                    </Button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline">
                    Workflow: {config.sales.rollout_baseline?.captured_at
                      ? `${Number(config.sales.rollout_baseline.row_count || 0).toLocaleString()} rows captured`
                      : "not captured"}
                  </Badge>
                  <Badge variant="outline">
                    Order Request: {config.orders.rollout_baseline?.captured_at
                      ? `${Number(config.orders.rollout_baseline.row_count || 0).toLocaleString()} rows captured`
                      : "not captured"}
                  </Badge>
                  {(config.sales.rollout_baseline?.captured_at || config.orders.rollout_baseline?.captured_at) && (
                    <Badge className="bg-green-100 text-green-700">immutable from this screen</Badge>
                  )}
                </div>
                {!dryRunPreview && !config.sales.rollout_baseline?.captured_at && !config.orders.rollout_baseline?.captured_at && (
                  <div className="mt-2 text-[10px] text-amber-900">
                    Run Preview Rows first. Baseline capture stays disabled until both full-sheet scans finish successfully.
                  </div>
                )}
              </div>

              {dryRunPreview && (
                <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
                  <div>
                    <div className="text-xs font-semibold text-violet-900">Observation-only row dry run</div>
                    <div className="mt-1 text-[11px] text-violet-800">
                      Stable links are compared directly. Legacy/exact matches are candidates only and are never linked automatically.
                    </div>
                  </div>
                  <DryRunPreviewCard
                    title="Workflow row preview"
                    preview={dryRunPreview.sales}
                    newRecordLabel="WorkOrders"
                    dataset="sales"
                    reviewState={customerReview}
                    onSaveCustomerReview={saveCustomerReviewChoice}
                    onClearCustomerReview={clearCustomerReviewChoice}
                    reviewSaving={reviewSaving}
                    reviewedCreationReadiness={controlledCreationReview?.sales?.creationReadiness}
                    creationProposals={controlledCreationReview?.sales?.proposals}
                    crossSheetConflicts={controlledCreationReview?.conflicts}
                  />
                  <DryRunPreviewCard
                    title="Order Request row preview"
                    preview={dryRunPreview.orders}
                    newRecordLabel="Orders"
                    dataset="orders"
                    reviewState={customerReview}
                    onSaveCustomerReview={saveCustomerReviewChoice}
                    onClearCustomerReview={clearCustomerReviewChoice}
                    reviewSaving={reviewSaving}
                    reviewedCreationReadiness={controlledCreationReview?.orders?.creationReadiness}
                    creationProposals={controlledCreationReview?.orders?.proposals}
                    crossSheetConflicts={controlledCreationReview?.conflicts}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
            <div>
              <div className="text-sm font-medium">Global sync</div>
              <div className="text-[11px] text-gray-500">Emergency kill switch.</div>
            </div>
            <Switch
              checked={config.global_enabled}
              onCheckedChange={(checked) => setConfig((c) => ({ ...c, global_enabled: checked }))}
              disabled={smartsheetWriteControlsLocked(apiStatus)}
            />
          </div>
          <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
            <div>
              <div className="text-sm font-medium">Observation mode</div>
              <div className="text-[11px] text-gray-500">Preview changes; perform no sync writes.</div>
            </div>
            <Switch
              checked={config.observation_mode}
              onCheckedChange={(checked) => setConfig((c) => ({ ...c, observation_mode: checked }))}
              disabled={smartsheetWriteControlsLocked(apiStatus)}
            />
          </div>
          <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
            <div>
              <div className="text-sm font-medium">Backup before writes</div>
              <div className="text-[11px] text-gray-500">Required safety gate for future writes.</div>
            </div>
            <Switch checked={config.backup_before_write} onCheckedChange={(checked) => setConfig((c) => ({ ...c, backup_before_write: checked }))} />
          </div>
          <div className={`rounded-lg border p-3 text-xs ${writesArmed ? "border-red-300 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"}`}>
            <div className="font-semibold">{writesArmed ? "Write-capable configuration" : "No live sync writes armed"}</div>
            <div className="mt-1">A later backend gate will independently enforce these settings.</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Mass-change hard stop (records)</Label>
            <Input
              type="number"
              min="1"
              max="1000"
              value={config.mass_change_limit_count}
              onChange={(e) => setConfig((c) => ({ ...c, mass_change_limit_count: Math.max(1, Number(e.target.value) || 1) }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Mass-change hard stop (% of linked records)</Label>
            <Input
              type="number"
              min="1"
              max="100"
              value={config.mass_change_limit_percent}
              onChange={(e) => setConfig((c) => ({ ...c, mass_change_limit_percent: Math.min(100, Math.max(1, Number(e.target.value) || 1)) }))}
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <IntegrationCard
        title="Sales Pipeline ↔ Workflow"
        subtitle="WorkOrder Sales records will map to the Smartsheet Workflow sheet by stable IDs and approved field translations."
        value={config.sales}
        onChange={(next) => setProfile("sales", next)}
        writeControlsLocked={smartsheetWriteControlsLocked(apiStatus)}
      />

      <IntegrationCard
        title="Order Form ↔ Order Request"
        subtitle="Order records will map to the Smartsheet Order Request sheet, including controlled customer/work-order relationship setup."
        value={config.orders}
        onChange={(next) => setProfile("orders", next)}
        writeControlsLocked={smartsheetWriteControlsLocked(apiStatus)}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <MappingPlan title="Sales Pipeline mapping blueprint" rows={SMARTSHEET_MAPPING_BLUEPRINTS.sales} />
        <MappingPlan title="Order Form mapping blueprint" rows={SMARTSHEET_MAPPING_BLUEPRINTS.orders} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Client resolution policy</h3>
            <p className="mt-1 text-xs text-gray-500">Recommendations only in the current build. No Customer is linked, renamed, or created automatically.</p>
          </div>
          <Badge variant="outline">Review first</Badge>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {SMARTSHEET_CUSTOMER_RESOLUTION_POLICY.map((rule) => (
            <div key={rule.key} className="rounded-lg border bg-white p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-gray-800">{rule.label}</div>
                <Badge variant="outline" className="shrink-0">{rule.outcome}</Badge>
              </div>
              <div className="mt-1 text-gray-500">{rule.behavior}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          Once you confirm that differently named records are the same company, the approved Smartsheet name can be preserved in the existing Base44 <code className="font-mono">legacy_client_names</code> alias list. That translates future rows without forcing either system to rename the customer.
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Client resolution policy</h3>
            <p className="mt-1 text-xs text-gray-500">Recommendations only in the current build. No Customer is linked, renamed, or created automatically.</p>
          </div>
          <Badge variant="outline">Review first</Badge>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {SMARTSHEET_CUSTOMER_RESOLUTION_POLICY.map((rule) => (
            <div key={rule.key} className="rounded-lg border bg-white p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-gray-800">{rule.label}</div>
                <Badge variant="outline" className="shrink-0">{rule.outcome}</Badge>
              </div>
              <div className="mt-1 text-gray-500">{rule.behavior}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          Once you confirm that differently named records are the same company, the approved Smartsheet name can be preserved in the existing Base44 <code className="font-mono">legacy_client_names</code> alias list. That translates future rows without forcing either system to rename the customer.
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Safety rules locked into the design</div>
        <div className="mt-2 text-xs leading-relaxed">
          Smartsheet never deletes Base44 records. Base44-only records may remain unmirrored. New external rows must resolve/create the correct Base44 Customer and relationships. Ambiguous matches stop for review. Sorting or rearranging rows/columns never changes identity.
        </div>
      </div>
    </div>
  );
}
