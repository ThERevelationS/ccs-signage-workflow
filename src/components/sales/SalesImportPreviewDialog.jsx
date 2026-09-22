import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const Metric = ({ label, value, tone = "text-gray-800" }) => (
  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
    <div className={`mt-0.5 text-lg font-bold ${tone}`}>{Number(value || 0).toLocaleString()}</div>
  </div>
);

export default function SalesImportPreviewDialog({
  open,
  preview,
  file,
  analyzing,
  applying,
  error,
  onClose,
  onApply,
  onDownloadIssues,
}) {
  if (!open) return null;
  const appliedResult = preview?.appliedResult || null;
  const summary = appliedResult ? {
    total: preview?.summary?.total || 0,
    create: appliedResult.created || 0,
    update: appliedResult.updated || 0,
    unchanged: appliedResult.unchanged || 0,
    conflict: appliedResult.conflicts || 0,
    ambiguous: appliedResult.ambiguous || 0,
    invalid: appliedResult.invalid || 0,
    baseline: preview?.summary?.baseline || 0,
  } : (preview?.summary || {});
  const issues = appliedResult?.issues || preview?.issues || [];
  const warnings = preview?.warnings || [];
  const changes = preview?.sample_changes || [];
  const blockingCount = Number(summary.invalid || 0) + Number(summary.ambiguous || 0) + Number(summary.conflict || 0);
  const changedCount = Number(summary.create || 0) + Number(summary.update || 0);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !applying && onClose?.()}>
      <DialogContent className="w-[96vw] max-w-4xl p-0">
        <div className="max-h-[88vh] overflow-y-auto">
          <DialogHeader className="border-b border-gray-100 p-4 sm:p-5">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              Sales Pipeline import preflight
            </DialogTitle>
            <div className="mt-1 text-xs text-gray-500">
              {file?.name || preview?.file_name || "Spreadsheet"}{preview?.sheet_name ? ` · Sheet: ${preview.sheet_name}${preview?.header_row ? ` · Header row ${preview.header_row}` : ""}` : ""} · {appliedResult ? "Import run complete." : analyzing ? "Analyzing without changing WorkOrders..." : "No WorkOrders have been changed yet."}
            </div>
          </DialogHeader>

          <div className="space-y-4 p-4 sm:p-5">
            {analyzing && (
              <div className="flex min-h-40 items-center justify-center rounded-xl border border-blue-100 bg-blue-50/50 p-6 text-sm text-blue-800">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Validating columns, matching WorkOrders, and calculating changes...
              </div>
            )}

            {!analyzing && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              <Metric label="Rows" value={summary.total} />
              <Metric label="New" value={summary.create} tone="text-green-700" />
              <Metric label="Changed" value={summary.update} tone="text-blue-700" />
              <Metric label="Unchanged" value={summary.unchanged} />
              <Metric label="Conflicts" value={summary.conflict} tone="text-amber-700" />
              <Metric label="Ambiguous" value={summary.ambiguous} tone="text-orange-700" />
              <Metric label="Invalid" value={summary.invalid} tone="text-red-700" />
              <Metric label="First Sync" value={summary.baseline} tone="text-violet-700" />
            </div>}

            {!analyzing && Number(summary.baseline || 0) > 0 && !appliedResult && (
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
                <div className="font-semibold">{Number(summary.baseline).toLocaleString()} existing record{Number(summary.baseline) === 1 ? " has" : "s have"} no previous import baseline.</div>
                <div className="mt-1 text-xs text-violet-800">For these first-sync matches, spreadsheet differences are treated as the initial source values after you confirm this preflight. Future imports can then detect Base44 edits made since the last sync.</div>
              </div>
            )}

            {!analyzing && (blockingCount > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div>
                    <div className="font-semibold">{blockingCount} row{blockingCount === 1 ? "" : "s"} need review.</div>
                    <div className="mt-1 text-xs text-amber-800">Those rows will be skipped. Safe rows can still import without guessing or overwriting ambiguous records.</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /><span className="font-semibold">Preflight found no blocking row issues.</span></div>
              </div>
            ))}

            {!analyzing && issues.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Rows needing review</div>
                    <div className="text-xs text-gray-500">Nothing in this list will be guessed.</div>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-10" onClick={onDownloadIssues}>Download issues</Button>
                </div>
                <div className="max-h-56 overflow-auto rounded-lg border border-gray-200">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-gray-50 text-gray-500">
                      <tr><th className="px-2 py-2">Row</th><th className="px-2 py-2">Customer</th><th className="px-2 py-2">Type</th><th className="px-2 py-2">Reason</th></tr>
                    </thead>
                    <tbody>
                      {issues.slice(0, 200).map((issue, index) => (
                        <tr key={`${issue.row}-${index}`} className="border-t border-gray-100 align-top">
                          <td className="px-2 py-2 font-medium">{issue.row}</td>
                          <td className="px-2 py-2">{issue.customer || "—"}</td>
                          <td className="px-2 py-2 capitalize">{issue.type}</td>
                          <td className="px-2 py-2 text-gray-600">{issue.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {issues.length > 200 && <div className="mt-1 text-[11px] text-gray-500">Showing first 200 issues. Download contains all issues.</div>}
              </section>
            )}

            {!analyzing && !appliedResult && changes.length > 0 && (
              <section>
                <div className="mb-2 text-sm font-semibold text-gray-900">Sample changes</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {changes.slice(0, 12).map((change) => (
                    <div key={`${change.row}-${change.customer}`} className="rounded-lg border border-gray-200 p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-gray-800">{change.customer || `Row ${change.row}`}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${change.action === "create" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{change.action === "create" ? "NEW" : "CHANGE"}</span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-gray-500">{(change.fields || []).join(", ") || "No field list"}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {!analyzing && !appliedResult && warnings.length > 0 && (
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-700">Matching warnings</div>
                <div className="mt-1 space-y-1 text-[11px] text-slate-600">
                  {warnings.slice(0, 8).map((warning, index) => <div key={index}>Row {warning.row}: {warning.message}</div>)}
                  {warnings.length > 8 && <div>+{warnings.length - 8} more</div>}
                </div>
              </section>
            )}

            {!analyzing && !appliedResult && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
                Blank spreadsheet cells leave existing Base44 values unchanged. Missing rows never delete or close WorkOrders. Ambiguous/conflicting rows are skipped instead of guessed.
              </div>
            )}

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="h-11 sm:h-9" disabled={applying || analyzing} onClick={onClose}>{appliedResult ? "Close" : "Cancel"}</Button>
              {!appliedResult && !analyzing && (
                <Button type="button" className="h-11 sm:h-9" disabled={applying || changedCount === 0} onClick={onApply}>
                  {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {changedCount === 0 ? "Nothing to change" : `Import ${changedCount} changed row${changedCount === 1 ? "" : "s"}`}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
