import * as React from "react";
import { FileUp, Info, Link2, Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableShell, Tr, Td, RecordLink, FilterSelect, RECORD_KINDS } from "@/components/kit";
import { UploadFile } from "@/api/integrations";
import { newAttachmentRow } from "./migrationModel";

// Attachments panel -- deliberately a stub, and honest about it. CoreBridge
// files (proofs, artwork, order attachments) are binary assets tied to records;
// they cannot travel through the CSV pipeline or the migration ledger. This
// scaffold is for the manual workaround staff actually do: match a source
// filename to a migrated record, upload the file to storage, and paste the
// returned URL onto the target record's file fields by hand.
export function MigrationAttachmentsPanel() {
  const [rows, setRows] = React.useState([]);

  const updateRow = (key, patch) => {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const pickFile = async (key, file) => {
    if (!file) return;
    updateRow(key, { file_name: file.name, uploading: true, error: "" });
    try {
      const res = await UploadFile({ file });
      const url = res?.file_url || res?.url || "";
      if (!url) throw new Error("Upload returned no file URL.");
      updateRow(key, { uploaded_url: url, uploading: false });
    } catch (e) {
      updateRow(key, { uploading: false, error: e?.message || "Upload failed." });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <strong>Files do not migrate through CSV.</strong> CoreBridge attachments (proofs, artwork,
          signed forms) are per-record binary files -- the CSV import only carries text fields. Use
          this scaffold to match filenames to migrated records and re-upload each file by hand; then
          paste the uploaded URL into the record's file field. There is no bulk path yet.
        </span>
      </div>

      <DataTableShell
        dense
        head={["Source filename", "Record type", "Record id", "Uploaded URL", ""]}
        isEmpty={!rows.length}
        emptyState={{
          title: "No files queued",
          message: "Add a row for each CoreBridge file you need to re-attach.",
        }}
      >
        {rows.map((row) => (
          <Tr key={row.key}>
            <Td className="min-w-48">
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                  {row.uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileUp className="h-3 w-3" />}
                  {row.file_name ? "Replace" : "Choose file"}
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) pickFile(row.key, f);
                    }}
                  />
                </label>
                <span className="truncate text-xs text-slate-600 dark:text-slate-300" title={row.file_name}>
                  {row.file_name || "\u2014"}
                </span>
              </div>
              {row.error && <div className="mt-0.5 text-[10px] text-red-600">{row.error}</div>}
            </Td>
            <Td>
              <FilterSelect
                value={row.record_kind}
                onChange={(e) => updateRow(row.key, { record_kind: e.target.value })}
                className="min-h-8 w-36 py-1 text-xs"
              >
                {RECORD_KINDS.map((kind) => (
                  <option key={kind} value={kind}>{kind}</option>
                ))}
              </FilterSelect>
            </Td>
            <Td>
              <div className="flex items-center gap-1.5">
                <Input
                  value={row.record_ref}
                  onChange={(e) => updateRow(row.key, { record_ref: e.target.value })}
                  placeholder="record id"
                  className="h-8 w-40 text-xs"
                />
                <RecordLink kind={row.record_kind} id={row.record_ref}>
                  <Link2 className="h-3.5 w-3.5" />
                </RecordLink>
              </div>
            </Td>
            <Td className="max-w-[220px]">
              {row.uploaded_url ? (
                <a
                  href={row.uploaded_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs text-sky-700 hover:underline dark:text-sky-400"
                  title={row.uploaded_url}
                >
                  {row.uploaded_url}
                </a>
              ) : (
                <span className="text-xs text-slate-400">{"\u2014"}</span>
              )}
            </Td>
            <Td className="w-10 text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-1.5 text-slate-400 hover:text-red-600"
                onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </Td>
          </Tr>
        ))}
      </DataTableShell>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-400">
          Uploads go to app file storage only -- linking the URL to a record is still a manual edit.
        </span>
        <Button variant="outline" size="sm" onClick={() => setRows((list) => [...list, newAttachmentRow()])}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add file row
        </Button>
      </div>
    </div>
  );
}
