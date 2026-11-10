// O-079 -- photo intake: operator-supplied reference photos for the AI
// review context. Files upload via the shared `UploadFile` integration and
// record as `{ url, caption }` rows on `project.reference_photos`; the AI
// review treats them as visual context only -- never derived engineering
// truth. Photos persist on the project with the design.
import { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";

const MAX_PHOTOS = 12;

export default function FoundationPhotoIntake({ project, onChange, disabled }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
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
        const res = await base44.integrations.Core.UploadFile({ file });
        const url = res?.file_url || res?.url || "";
        if (url) added.push({ url, caption: file.name.replace(/\.[^.]+$/, "") });
      }
      if (added.length) onChange?.({ reference_photos: [...photos, ...added] });
    } catch (e) {
      setError(e?.message || "The photo upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (i) => onChange?.({ reference_photos: photos.filter((_, j) => j !== i) });
  const setCaption = (i, caption) => {
    const n = [...photos]; n[i] = { ...n[i], caption };
    onChange?.({ reference_photos: n });
  };

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3" data-photo-intake="true">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-gray-800">Reference photos</p>
          <p className="text-[11px] text-gray-500">Visual context for the AI review -- it never derives engineering values from them.</p>
        </div>
        <button type="button" disabled={disabled || uploading || photos.length >= MAX_PHOTOS}
          onClick={() => inputRef.current?.click()}
          className="h-7 px-2.5 rounded-sm border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {uploading ? "Uploading..." : "+ Add photo"}
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => add(e.target.files)} disabled={disabled || uploading} />
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      {photos.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-2" data-photo-grid="true">
          {photos.map((p, i) => {
            const url = typeof p === "string" ? p : p?.url;
            return (
              <div key={i} className="relative group">
                <img src={url} alt={p?.caption || `Photo ${i + 1}`}
                  className="h-16 w-full object-cover rounded border border-gray-200"
                  onError={(e) => { e.currentTarget.style.display = "none"; }} />
                <input value={p?.caption ?? ""} disabled={disabled}
                  onChange={(e) => setCaption(i, e.target.value)}
                  placeholder="Caption"
                  className="mt-0.5 w-full h-5 px-1 text-[10px] border border-gray-200 rounded-sm bg-white" />
                {!disabled && (
                  <button type="button" onClick={() => remove(i)} title="Remove photo"
                    className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-600 text-white text-[10px] leading-4 hidden group-hover:block">x</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
