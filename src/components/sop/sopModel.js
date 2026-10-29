import { safeExternalHttpUrl } from "@/utils/safeExternalUrl";

// Shared SOP helpers: default categories, step/record factories, and external
// video link → embeddable URL conversion. Keep these framework-free so the
// editor, detail, and AI paths all shape records the same way.

export const DEFAULT_SOP_CATEGORIES = [
  { key: "design", label: "Design", color: "#60A5FA", icon: "Pencil" },
  { key: "cnc_router", label: "CNC Router", color: "#4ADE80", icon: "Router" },
  { key: "cnc_laser", label: "CNC Laser", color: "#F87171", icon: "Zap" },
  { key: "painting", label: "Painting", color: "#C084FC", icon: "Paintbrush" },
  { key: "installation", label: "Installation", color: "#FB923C", icon: "Truck" },
  { key: "fabrication", label: "Fabrication", color: "#A3E635", icon: "Wrench" },
  { key: "estimating", label: "Estimating", color: "#FBBF24", icon: "Calculator" },
  { key: "other", label: "Other", color: "#94A3B8", icon: "Folder" },
];

let stepSeq = 0;
export const newStepId = () => `step_${Date.now().toString(36)}_${(stepSeq += 1)}`;

export const newStep = (overrides = {}) => ({
  id: newStepId(),
  title: "",
  body: "",
  images: [],
  video_url: "",
  external_video_url: "",
  ...overrides,
});

export const newSopDraft = (settings, user) => ({
  title: "",
  category: settings?.categories?.[0]?.key || "other",
  summary: "",
  cover_image_url: "",
  steps: [newStep()],
  safety_notes: [],
  attachments: [],
  tags: [],
  estimated_minutes: 0,
  requires_ack: settings?.require_ack_default === true,
  pinned: false,
  sort_order: 0,
  created_by_email: user?.email || "",
});

export const newRequestKey = () =>
  `sop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export function categoryByKey(settings, key) {
  const list = settings?.categories?.length ? settings.categories : DEFAULT_SOP_CATEGORIES;
  return list.find((c) => c.key === key) || list.find((c) => c.key === "other") || list[0];
}

// Converts a pasted video link into an embeddable URL. YouTube watch/shorts/
// youtu.be links become youtube-nocookie embeds; Vimeo links become player
// embeds; anything else that is a safe http(s) URL is returned as-is and the
// caller renders a plain link instead of an iframe.
export function externalVideoEmbedUrl(value) {
  const url = safeExternalHttpUrl(value);
  if (!url) return { embed: "", link: "" };
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) return { embed: `https://www.youtube-nocookie.com/embed/${id}`, link: url };
    }
    if (host.endsWith("youtube.com")) {
      const id = u.searchParams.get("v") || (u.pathname.startsWith("/shorts/") ? u.pathname.split("/")[2] : "");
      if (id) return { embed: `https://www.youtube-nocookie.com/embed/${id}`, link: url };
    }
    if (host.endsWith("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return { embed: `https://player.vimeo.com/video/${id}`, link: url };
    }
    return { embed: "", link: url };
  } catch {
    return { embed: "", link: "" };
  }
}

export function attachmentKindFromFile(file) {
  const type = String(file?.type || "");
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type === "application/pdf" || type.startsWith("text/") || type.includes("document") || type.includes("sheet")) return "doc";
  return "other";
}

export function latestAckFor(sop, email) {
  const target = String(email || "").toLowerCase();
  if (!target || !Array.isArray(sop?.acknowledged_viewers)) return null;
  const matches = sop.acknowledged_viewers.filter(
    (v) => String(v?.email || "").toLowerCase() === target
  );
  return matches.length ? matches[matches.length - 1] : null;
}

export function needsAcknowledgement(sop, email) {
  if (!sop || sop.status !== "published" || sop.requires_ack !== true) return false;
  const version = Number(sop.version) || 1;
  const ack = latestAckFor(sop, email);
  return !ack || Number(ack.version) !== version;
}

export const stripHtml = (html) =>
  String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
