// O-079 -- photo intake: operator-supplied reference photos for the AI
// review context. Files upload via the shared `UploadFile` integration and
// record as `{ url, caption, notes }` rows on `project.reference_photos`;
// the AI review treats them as visual context only -- never derived
// engineering truth. Multi-photo with thumbnails, captions, per-photo
// notes, reorder/remove, file/type/size validation, and an explicit consent
// gate before any external upload.
import { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";

const MAX_PHOTOS = 12;
const MAX_BYTES = 12 * 1024 * 1024;

export default function FoundationPhotoIntake({ project, onChange, disabled }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [consented, setConsented] = useState(false);
  const photos = Array.isArray(project?.reference_photos) ? project.reference_photos : [];

  const add = async (files) => {
    const incoming = Array.from(files || []).filter(Boolean);
    if (!incoming.length) return;
    if (photos.length + incoming.length > MAX_PHOTOS) {
      setError(`A design may carry at most ${MAX_PHOTOS} reference photos.`);
      return;
    }
    setError("");
    setUploading(true);
    try {
      const added = [];
      for (const file of incoming) {
        if (!file.type?.startsWith("image/")) { setError(`${file.name} is not an image.`); continue; }
        if (file.size > MAX_BYTES) { setError(`${file.name} exceeds ${MAX_BYTES / 1048576} MB.`); continue; }
        const res = await base44.integrations.Core.UploadFile({ file });
        const url = res?.file_url || res?.url || "";
        if (url) added.push({ url, caption: file.name.replace(/\.[^.]+$/, ""), notes: "" });
      }
      if (added.length) onChange?.({ reference_photos: [...photos, ...added] });
    } catch (e) {
      setError(e?.message || "The photo upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const update = (i, field, value) => {
    const n = [...photos]; n[i] = { ...n[i], [field]: value };
    onChange?.({ reference_photos: n });
  };
  const remove = (i) => onChange?.({ reference_photos: photos.filter((_, j) => j !== i) });
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= photos.length) return;
    const n = [...photos]; [n[i], n[j]] = [n[j], n[i]];
    onChange?.({ reference_photos: n });
  };

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3" data-photo-intake="true">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-gray-800">Reference photos</p>
          <p className="text-[11px] text-gray-500">Visual context for the AI review -- it never derives engineering values from them.</p>
        </div>
        <button type="button" disabled={disabled || uploading || photos.length >= MAX_PHOTOS || !consented}
          onClick={() => inputRef.current?.click()}
          className="h-7 px-2.5 rounded-sm border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {uploading ? "Uploading..." : "+ Add photo"}
        </button>
      </div>
      <label className="mt-1.5 flex items-start gap-1.5 text-[11px] text-gray-600">
        <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} className="mt-0.5" disabled={disabled} />
        <span>I confirm these photos may be sent to external AI processing for design context.</span>
      </label>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => add(e.target.files)} disabled={disabled || uploading || !consented} />
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      {photos.length > 0 && (
        <div className="mt-2 space-y-1.5" data-photo-grid="true">
          {photos.map((p, i) => {
            const url = typeof p === "string" ? p : p?.url;
            return (
              <div key={i} className="flex gap-1.5 items-start group">
                <img src={url} alt={p?.caption || `Photo ${i + 1}`}
                  className="h-14 w-14 object-cover rounded border border-gray-200 flex-none"
                  onError={(e) => { e.currentTarget.style.display = "none"; }} />
                <div className="min-w-0 flex-1">
                  <input value={p?.caption ?? ""} disabled={disabled}
                    onChange={(e) => update(i, "caption", e.target.value)}
                    placeholder="Caption"
                    className="w-full h-5 px-1 text-[10px] border border-gray-200 rounded-sm bg-white" />
                  <input value={p?.notes ?? ""} disabled={disabled}
                    onChange={(e) => update(i, "notes", e.target.value)}
                    placeholder="Notes for the review"
                    className="mt-0.5 w-full h-5 px-1 text-[10px] border border-gray-100 rounded-sm bg-white" />
                </div>
                {!disabled && (
                  <div className="flex flex-col gap-0.5 flex-none">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move up"
                      className="h-4 w-4 text-[10px] border border-gray-200 rounded-sm disabled:opacity-40">^</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1} title="Move down"
                      className="h-4 w-4 text-[10px] border border-gray-200 rounded-sm disabled:opacity-40">v</button>
                    <button type="button" onClick={() => remove(i)} title="Remove"
                      className="h-4 w-4 text-[10px] bg-red-600 text-white rounded-sm hidden group-hover:block">x</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
