import { base44 } from "@/api/base44Client";
import { newStepId } from "./sopModel";

// AI helpers for the SOP module. Voice clips are transcribed with the
// platform's TranscribeAudio integration; freeform text and photos go through
// InvokeLLM with a JSON schema for structured drafts.

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    category: { type: "string" },
    summary: { type: "string" },
    estimated_minutes: { type: "number" },
    safety_notes: { type: "array", items: { type: "string" } },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
        },
        required: ["body"],
      },
    },
  },
  required: ["title", "steps"],
};

const STEP_FROM_PHOTO_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    body: { type: "string" },
  },
  required: ["body"],
};

export async function uploadFile(file) {
  const res = await base44.integrations.Core.UploadFile({ file });
  const url = res?.file_url || res?.url || "";
  if (!url) throw new Error("Upload did not return a file URL.");
  return url;
}

export async function transcribeAudioFile(file) {
  const fileUrl = await uploadFile(file);
  const res = await base44.integrations.Core.TranscribeAudio({ file_url: fileUrl });
  const text = typeof res === "string" ? res : (res?.text ?? res?.transcript ?? res?.output ?? "");
  if (!String(text).trim()) throw new Error("Transcription came back empty.");
  return { transcript: String(text).trim(), audio_url: fileUrl };
}

export async function draftSopFromText(text, categories) {
  const notes = String(text || "").trim();
  if (!notes) throw new Error("Describe the procedure first.");
  const categoryKeys = (categories || []).map((c) => c.key).join(", ");
  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `You write standard operating procedures (SOPs) for a commercial sign shop.
Turn the raw description below into a clear, complete SOP draft for shop employees.

Rules:
- Choose the best matching category key from: ${categoryKeys || "other"} (use "other" if unsure).
- Steps must be numbered in execution order, each with a short title and body written as concise imperative sentences.
- Write for a busy shop floor: plain language, no filler, mention measurements/PPE/tools when stated.
- Put hazards, PPE, and machine warnings in safety_notes (empty array if none were mentioned).
- estimated_minutes: rough time to perform the whole procedure (0 if unknown).
- Do not invent steps the description does not support; combine or split sensibly.

RAW DESCRIPTION:
${notes}`,
    response_json_schema: DRAFT_SCHEMA,
  });
  const draft = res && typeof res === "object" ? res : {};
  const steps = Array.isArray(draft.steps) ? draft.steps : [];
  if (!steps.length) throw new Error("AI returned no steps — try adding more detail.");
  return {
    title: String(draft.title || "").trim(),
    category: String(draft.category || "other").trim(),
    summary: String(draft.summary || "").trim(),
    estimated_minutes: Number(draft.estimated_minutes) || 0,
    safety_notes: (Array.isArray(draft.safety_notes) ? draft.safety_notes : []).map(String).filter(Boolean),
    steps: steps
      .filter((s) => s && (s.body || s.title))
      .map((s) => ({
        id: newStepId(),
        title: String(s.title || "").trim(),
        body: String(s.body || "").trim() ? `<p>${String(s.body).trim().replace(/\n+/g, "</p><p>")}</p>` : "",
        images: [],
        video_url: "",
        external_video_url: "",
      })),
  };
}

export async function polishStepText(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("There is no step text to polish.");
  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `Rewrite this SOP step so a shop employee can follow it exactly. Use clear imperative sentences, keep every fact, remove filler and transcription noise (ums, false starts). Return only the rewritten instruction text — no preamble.\n\nSTEP TEXT:\n${raw}`,
  });
  const cleaned = String(res || "").trim();
  if (!cleaned) throw new Error("Polish returned empty text.");
  return cleaned;
}

export async function reviewSopCompleteness(form, categories) {
  const steps = (form?.steps || []).map((s, i) => `${i + 1}. ${s.title || ""} — ${String(s.body || "").replace(/<[^>]*>/g, " ").trim()}`).join("\n");
  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `You are a strict SOP reviewer for a commercial sign shop. Review this draft procedure and list concrete issues ONLY — things a worker could get wrong, hurt, or confused by. Check: missing PPE/safety warnings, ambiguous wording, missing measurements/tools/materials, inconsistent units, steps with no clear action, missing "what good looks like" criteria, missing prerequisites.

Return at most 8 issues, each: severity (high|medium|low), step number or "general", and one-sentence fix. If the SOP is solid, return an empty issues array.

TITLE: ${form?.title || ""}
CATEGORY: ${form?.category || ""}
SAFETY NOTES: ${(form?.safety_notes || []).join(" | ") || "none"}
STEPS:
${steps || "(none)"}`,
    response_json_schema: {
      type: "object",
      properties: {
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              severity: { type: "string", enum: ["high", "medium", "low"] },
              step: { type: "string" },
              fix: { type: "string" },
            },
            required: ["severity", "fix"],
          },
        },
      },
      required: ["issues"],
    },
  });
  return Array.isArray(res?.issues) ? res.issues : [];
}

export async function stepTextFromImage(imageUrl) {
  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `You write SOP steps for a commercial sign shop. Look at this photo and write one procedure step that describes what is being done or what the reader must do/notice here. Return a short step title and 1-4 imperative sentences. Base it only on what is visible.`,
    file_urls: [imageUrl],
    response_json_schema: STEP_FROM_PHOTO_SCHEMA,
  });
  const out = res && typeof res === "object" ? res : {};
  if (!String(out.body || "").trim()) throw new Error("AI could not describe this photo.");
  return { title: String(out.title || "").trim(), body: String(out.body || "").trim() };
}
