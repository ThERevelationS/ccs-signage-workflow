// Pure prompt builders for the permit AI plan step — kept free of React/SDK
// ("@/") imports so node tests can exercise them directly.

import { SIGN_TYPES, SIGN_SCOPES, describeSignsForPrompt, totalUnitCount } from "./permitSigns.js";

// ── Research-profile context assembly (pure — profile is plain data) ──

const PROFILE_DOC_TYPE_RANK = { sign_ordinance: 0, permit_application: 1, checklist: 2, fee_schedule: 3 };
const PROFILE_DOC_TITLE_RE = /sign|permit|zoning|electric|fee|application|checklist/i;

// ≤30 document briefs: preferred doc types first, then title-relevant ones.
export function profileDocumentBriefs(profile) {
  const docs = (Array.isArray(profile?.documents) ? profile.documents : [])
    .filter(d => d && d.superseded !== true);
  const ranked = docs.slice().sort((a, b) => {
    const ar = PROFILE_DOC_TYPE_RANK[a?.doc_type] ?? 9;
    const br = PROFILE_DOC_TYPE_RANK[b?.doc_type] ?? 9;
    if (ar !== br) return ar - br;
    const at = PROFILE_DOC_TITLE_RE.test(a?.title || "") ? 0 : 1;
    const bt = PROFILE_DOC_TITLE_RE.test(b?.title || "") ? 0 : 1;
    return at - bt;
  });
  return ranked.slice(0, 30).map(d => ({
    id: d.id || "",
    title: d.title || "",
    doc_type: d.doc_type || "",
    url: d.url || d.file_url || "",
    summary: String(d.ai_summary || "").slice(0, 400),
    excerpt: String(d.extracted_text || "").slice(0, 800),
  }));
}

const normOfficeName = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Attach ≤3 'potentially_applicable' research findings to each chosen office.
export function officeEvidenceFor(offices, profile) {
  const roles = (Array.isArray(profile?.office_research?.roles) ? profile.office_research.roles : [])
    .filter(r => r?.applicability === "potentially_applicable");
  return (Array.isArray(offices) ? offices : []).map(office => {
    const name = normOfficeName(office?.name);
    const evidence = roles
      .filter(r => {
        const rn = normOfficeName(r?.office_name || r?.label);
        return Boolean(rn && name && (rn === name || rn.includes(name) || name.includes(rn)));
      })
      .slice(0, 3)
      .map(r => ({
        role: r.role || "",
        quote: String(r.responsibility_quote || "").slice(0, 300),
        url: r.official_source_url || "",
      }));
    return { ...office, evidence };
  });
}

const PROFILE_RULE_FIELDS = [
  "sqft_width_height_rules",
  "height_allowances",
  "setback_rules",
  "lighting_allowances",
  "permit_requirements",
];

// The profile's size/height/setback/lighting fields as one JSON object,
// capped at 2,000 chars (longer fields truncate, later fields drop).
export function rulesOnFileJson(profile) {
  if (!profile) return "";
  const parts = [];
  let size = 2; // "{}"
  for (const key of PROFILE_RULE_FIELDS) {
    const v = profile[key];
    if (v === null || v === undefined || v === "") continue;
    let text = typeof v === "string" ? v : JSON.stringify(v);
    const overhead = key.length + 6; // "key":"…",
    const room = 2000 - size - overhead;
    if (room <= 0) break;
    if (text.length > room) text = text.slice(0, room);
    parts.push(`${JSON.stringify(key)}:${JSON.stringify(text)}`);
    size += overhead + text.length;
  }
  return parts.length ? `{${parts.join(",")}}` : "";
}

// Imported CoreBridge lines dump the order detail into product_notes: a header
// block ("Index · Product Name · Product Category · Is Vended · Price · Cost ·
// Margin") then "Part N" tokens each followed by the part's description, plus
// per-part price/cost/margin repeats. Extract just what the scan prompt needs.
const PART_TOKEN = /^Part \d+$/;
const MONEYISH = /^[$€£]?[\d,]+(\.\d+)?%?$/;
export function estimatePartsText(productNotes) {
  const none = { cbCategory: "", parts: [] };
  const tokens = String(productNotes || "").split(/\r?\n/).map(t => t.trim()).filter(Boolean);
  if (!tokens.length) return none;
  let cbCategory = "";
  const vendedIdx = tokens.indexOf("Is Vended");
  if (vendedIdx >= 0) {
    let i = vendedIdx + 1;
    while (i < tokens.length && ["Price", "Cost", "Margin"].includes(tokens[i])) i += 1;
    cbCategory = tokens[i + 2] || "";
  }
  const seen = new Set();
  const parts = [];
  tokens.forEach((t, i) => {
    if (parts.length >= 25 || !PART_TOKEN.test(t)) return;
    const desc = String(tokens[i + 1] || "").slice(0, 120);
    if (!desc || MONEYISH.test(desc)) return;
    const key = desc.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    parts.push(desc);
  });
  return { cbCategory, parts };
}

export const SIGN_SCAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    signs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: SIGN_TYPES.map(t => t.key) },
          count: { type: "number" },
          scope: { type: "string", enum: SIGN_SCOPES.map(s => s.key) },
          illuminated: { type: "boolean" },
          electrical: { type: "boolean" },
          faces: { type: "number" },
          width_in: { type: "number" },
          height_in: { type: "number" },
          letter_height_in: { type: "number" },
          overall_height_in: { type: "number" },
          clearance_in: { type: "number" },
          projection_in: { type: "number" },
          source_line: { type: "string" },
          size_source: { type: "string" },
          size_basis: { type: "string", enum: ["stated", "material", "none"] },
          notes: { type: "string" },
        },
      },
    },
    skipped_lines: { type: "array", items: { type: "string" } },
  },
  required: ["signs", "skipped_lines"],
};

// lines: [{ name, category, quantity, description, product_notes }] — already
// HTML-stripped/capped; CoreBridge category + parts come from product_notes.
export function buildSignScanPrompt({ estimate_number = "", project_name = "", client_name = "", site_address = "", lines = [] } = {}) {
  const typeList = SIGN_TYPES.map(t => `${t.key} — ${t.label}`).join("\n");
  const lineRows = (Array.isArray(lines) ? lines : [])
    .map(l => {
      const { cbCategory, parts } = estimatePartsText(l?.product_notes);
      const segs = [`${l?.name || "Line item"} | category: ${l?.category || ""}`];
      if (cbCategory) segs[0] += ` | CoreBridge category: ${cbCategory}`;
      segs.push(`qty: ${l?.quantity ?? 1}`);
      segs.push(l?.description || "");
      if (parts.length) segs.push(`parts: ${parts.join("; ").slice(0, 800)}`);
      return segs.join(" | ");
    })
    .join("\n");
  return `You read a sign company's estimate and list the physical signs on it that may need a permit.

Estimate: ${estimate_number} — ${project_name}
Customer: ${client_name}
Job site: ${site_address}

Line items (name | category as entered | CoreBridge category | quantity | description | parts used to build it):
${lineRows}

Sign types you may use (return the key):
${typeList}

Rules:
1. Return one entry per distinct sign product. "count" is how many identical signs that line covers — from the quantity or wording like "(2) blade signs". Default 1.
2. Choose "type" from the name and description. The category column is often wrong or empty; ignore it when it conflicts with the name or description. The CoreBridge category is usually more accurate than the category as entered.
3. Skip lines that are services or fees rather than signs: permit acquisition, design or artwork, surveys, travel, removal-only labor, deposits, discounts. List their names in skipped_lines.
4. "scope": new = a new sign; reface = new faces or panels in an existing cabinet or frame; repair = fix, refurbish, restore, or LED retrofit; removal = remove only; relocate = move an existing sign.
5. Sizes. Use the best source available, in this order:
   a. A size written in the product name or description (for example 24" x 30", 48"W x 44"H, 4' x 8').
   b. A size in a part that is the sign itself or its face, cabinet, or panel (for example "LED Retrofit - 4' x 8' x 6"", "Installation - Double Sided - 4x8", "Aluminum Wall Sign 48" x 168"").
   c. The size of the sheet or panel material the sign face is cut from (for example "ACM - Aluminum Composite 6mm, 4'x8'", "Aluminum .063 - 8' x 4'"), only when a and b give nothing.
   Never use sizes of hardware or stock rolls: studs, posts, post caps, sleeves, stakes, polycarbonate or vinyl rolls (for example "Polycarbonate 0.177" x 52" - Roll"). A third number such as the 6" in 4' x 8' x 6" is depth; leave it out.
   Convert to inches (width first, then height). Put the exact text the size came from in "size_source", and set "size_basis" to "stated" for a or b, "material" for c, or "none" when no size applies. Never guess a size.
6. illuminated = true only if the text says illuminated, lit, LED, neon, backlit, or EMC/digital. electrical = true when new wiring, power, or an LED retrofit is involved.
7. "source_line" is the line item name the sign came from. "notes" holds anything permit-relevant in the text (double-sided, landlord, historic, percent of window covered); otherwise empty.`;
}

const officeLine = (o) => {
  const parts = [o?.name || "Office"];
  parts.push(`roles: ${(Array.isArray(o?.roles) && o.roles.length ? o.roles.join(", ") : "none listed")}`);
  parts.push(o?.verified ? "verified" : "unverified");
  if (o?.phone) parts.push(o.phone);
  if (o?.email) parts.push(o.email);
  if (o?.website) parts.push(o.website);
  if (o?.submission_url) parts.push(`submission: ${o.submission_url}`);
  const evidence = (Array.isArray(o?.evidence) ? o.evidence : [])
    .map(e => `"${e?.quote || ""}"${e?.url ? ` (${e.url})` : ""}`)
    .filter(s => s !== '""')
    .join("; ");
  if (evidence) parts.push(`evidence: ${evidence}`);
  return `- ${parts.join(" | ")}`;
};

const jsonOr = (value, empty) => {
  if (Array.isArray(value)) return value.length ? JSON.stringify(value, null, 2) : empty;
  return value ? JSON.stringify(value, null, 2) : empty;
};

// Fallback SIGNS line when staff haven't entered per-sign detail yet.
const legacySignsLine = (input) => {
  const bits = [input?.newVsReplacement || "New sign", input?.signTypes || "type not specified"];
  if (input?.dimensions) bits.push(input.dimensions);
  if (input?.illuminated) bits.push("illuminated");
  if (input?.electricalWork) bits.push("electrical work");
  if (input?.freestanding) bits.push("freestanding");
  if (input?.emcDigital) bits.push("EMC/digital");
  if (input?.temporaryVsPermanent === "Temporary") bits.push("temporary");
  return `- ${bits.filter(Boolean).join(" · ")} (no per-sign detail entered — treat as one sign, number it #1)`;
};

/**
 * Workflow composition prompt. Context is assembled by the caller:
 *   offices: [{name, roles, verified, phone, email, website, submission_url, evidence:[{role,quote,url}]}]
 *   documents: profile document briefs; rulesOnFileJson: capped JSON string;
 *   approvedBriefs/pendingBriefs: rule citation briefs; sourceBriefs: PermittingSourceDocument briefs.
 */
export function buildPermitPlanPrompt({
  input = {},
  jurisdiction = {},
  offices = [],
  signs = [],
  installDate = "",
  county = "",
  documents = [],
  rulesOnFileJson = "",
  approvedBriefs = [],
  pendingBriefs = [],
  sourceBriefs = [],
} = {}) {
  const signsText = totalUnitCount(signs) > 0 ? describeSignsForPrompt(signs) : legacySignsLine(input);
  const officesText = (Array.isArray(offices) && offices.length)
    ? offices.map(officeLine).join("\n")
    : "(none selected — infer offices from the research below and mark them staff_confirmation_needed)";
  const jur = `${jurisdiction?.jurisdiction_name || "(unresolved — staff must confirm)"}${jurisdiction?.state ? `, ${jurisdiction.state}` : ""}${county ? ` (${county} County)` : ""}`;

  return `You are the permit coordinator for a sign company. Build the complete, ordered permit workflow for this job: every office below, from preparing the first application to final inspection and closeout.

JOB
- Customer: ${input?.customer || "(not provided)"}
- Site: ${input?.address || "(not provided)"}
- Jurisdiction: ${jur}
- Target install date: ${installDate || "not set"}

SIGNS (each numbered sign is one physical sign; refer to signs by number)
${signsText}

OFFICES SELECTED FOR THIS JOB (use these exact names in "office")
${officesText}

JURISDICTION RESEARCH (collected by our research system; not yet staff-approved)
Documents:
${Array.isArray(documents) && documents.length ? JSON.stringify(documents) : "(none on file)"}
Size, height, setback and lighting rules on file:
${rulesOnFileJson || "(none on file)"}
Approved rules (operational):
${jsonOr(approvedBriefs, "(none)")}
Pending-review rules:
${jsonOr(pendingBriefs, "(none)")}
Forms, fee schedules and code documents:
${jsonOr(sourceBriefs, "(none)")}

HOW TO BUILD THE WORKFLOW
1. Cover every selected office that has a role for these signs. Typical order: zoning or sign permit review (plus historic or design review, or a variance, when it applies), then the building or sign permit, then the electrical permit for illuminated or wired signs, then inspections, then final approval and closeout. Put a step earlier only when its office must approve before the next office will accept the application.
2. Break each office into its real actions instead of one line: prepare the application package, submit, pay fees, answer review comments, receive the permit, schedule inspections, pass final. Combine actions only when the same office handles them together.
3. A step may cover several signs; list their numbers in "signs". When signs need different permits (for example a reface that may be exempt and new illuminated letters), give them separate steps.
4. "required_documents": the drawings and documents this office will expect for these signs, such as a site plan, an elevation with dimensions, a sign area calculation, structural or foundation drawings for freestanding signs, UL listing and electrical specs for illuminated signs, landlord or owner authorization, contractor license or registration, and a certificate of insurance. List only what applies.
5. Cite sources. When a step relies on a document above, put its id in citations.source_document_id with a short excerpt. When it relies on an office's evidence, quote that evidence and include its URL in the excerpt. Never invent a fee amount, form number, URL, or deadline. If no source states it, leave the field empty and add a gap.
6. Flag risk. If a sign may exceed the size, height, or setback rules on file, may need a variance, may sit in a historic district, or projects over a public sidewalk (a right-of-way permit), add a step or a gap that says so.
7. "target_days_from_start": realistic working-day offsets from the start of permitting. "dependencies": indices of earlier steps that must finish first.
8. "basis": "approved_rule" only when an approved rule above backs the step; "pending_review" when a listed document, office evidence, or pending rule backs it; otherwise "staff_confirmation_needed" with a gap_reason.`;
}
