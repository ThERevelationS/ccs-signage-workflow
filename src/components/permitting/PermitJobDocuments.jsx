import { ExternalLink, FileText, FolderOpen, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openExternalHttpUrl, safeExternalHttpUrl } from "@/utils/safeExternalUrl";

function fileMeta(file) {
  const bits = [];
  if (file?.uploaded_by) bits.push(file.uploaded_by);
  if (file?.uploaded_at) {
    const date = new Date(file.uploaded_at);
    if (!Number.isNaN(date.getTime())) bits.push(date.toLocaleDateString());
  }
  return bits.join(" · ");
}

export default function PermitJobDocuments({ workOrder, onManageFiles }) {
  const files = Array.isArray(workOrder?.files) ? workOrder.files : [];
  const driveUrl = safeExternalHttpUrl(workOrder?.google_drive_folder_url);

  return (
    <div className="border-t bg-slate-50/50 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Paperclip className="h-4 w-4 flex-shrink-0 text-slate-500" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-800">Job files</div>
            <div className="text-[10px] text-slate-500">
              {files.length} attached file{files.length === 1 ? "" : "s"}{driveUrl ? " · Drive folder linked" : ""}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {driveUrl && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => openExternalHttpUrl(driveUrl)}
            >
              <FolderOpen className="h-3.5 w-3.5" /> Drive folder
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={onManageFiles}
          >
            Manage files <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="mt-2 rounded-md border border-dashed border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
          No Work Order files are attached yet. Use Manage files to upload permit applications, approvals, plans, photos, or other job documents.
        </div>
      ) : (
        <div className="mt-2 grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
          {files.map((file, index) => {
            const safeUrl = safeExternalHttpUrl(file?.url);
            const key = file?.id || `${file?.name || "file"}-${index}`;
            return (
              <button type="button"
                key={key}
                type="button"
                disabled={!safeUrl}
                onClick={() => openExternalHttpUrl(safeUrl)}
                className="flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/50 disabled:cursor-not-allowed disabled:opacity-50"
                title={safeUrl ? `Open ${file?.name || "file"}` : "This file does not have a usable link"}
              >
                <FileText className="h-4 w-4 flex-shrink-0 text-blue-600" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium text-slate-700">{file?.name || "Unnamed file"}</span>
                  {fileMeta(file) && <span className="block truncate text-[9px] text-slate-400">{fileMeta(file)}</span>}
                </span>
                {safeUrl && <ExternalLink className="h-3 w-3 flex-shrink-0 text-slate-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
