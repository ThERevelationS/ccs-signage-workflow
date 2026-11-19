import { jsx, jsxs } from "react/jsx-runtime";
import { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
const MAX_PHOTOS = 12;
function FoundationPhotoIntake({ project, onChange, disabled }) {
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
        if (!file.type?.startsWith("image/")) {
          setError(`${file.name} is not an image.`);
          continue;
        }
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
    const n = [...photos];
    n[i] = { ...n[i], caption };
    onChange?.({ reference_photos: n });
  };
  return /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-gray-200 bg-white p-3", "data-photo-intake": "true", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs font-semibold text-gray-800", children: "Reference photos" }),
        /* @__PURE__ */ jsx("p", { className: "text-[11px] text-gray-500", children: "Visual context for the AI review -- it never derives engineering values from them." })
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          disabled: disabled || uploading || photos.length >= MAX_PHOTOS,
          onClick: () => inputRef.current?.click(),
          className: "h-7 px-2.5 rounded-sm border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50",
          children: uploading ? "Uploading..." : "+ Add photo"
        }
      )
    ] }),
    /* @__PURE__ */ jsx(
      "input",
      {
        ref: inputRef,
        type: "file",
        accept: "image/*",
        multiple: true,
        className: "hidden",
        onChange: (e) => add(e.target.files),
        disabled: disabled || uploading
      }
    ),
    error && /* @__PURE__ */ jsx("p", { className: "mt-1 text-[11px] text-red-600", children: error }),
    photos.length > 0 && /* @__PURE__ */ jsx("div", { className: "mt-2 grid grid-cols-3 gap-2", "data-photo-grid": "true", children: photos.map((p, i) => {
      const url = typeof p === "string" ? p : p?.url;
      return /* @__PURE__ */ jsxs("div", { className: "relative group", children: [
        /* @__PURE__ */ jsx(
          "img",
          {
            src: url,
            alt: p?.caption || `Photo ${i + 1}`,
            className: "h-16 w-full object-cover rounded border border-gray-200",
            onError: (e) => {
              e.currentTarget.style.display = "none";
            }
          }
        ),
        /* @__PURE__ */ jsx(
          "input",
          {
            value: p?.caption ?? "",
            disabled,
            onChange: (e) => setCaption(i, e.target.value),
            placeholder: "Caption",
            className: "mt-0.5 w-full h-5 px-1 text-[10px] border border-gray-200 rounded-sm bg-white"
          }
        ),
        !disabled && /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => remove(i),
            title: "Remove photo",
            className: "absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-600 text-white text-[10px] leading-4 hidden group-hover:block",
            children: "x"
          }
        )
      ] }, i);
    }) })
  ] });
}
export {
  FoundationPhotoIntake as default
};
