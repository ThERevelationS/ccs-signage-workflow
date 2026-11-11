// O-082--O-085 -- conversational AI intake: a "Describe your design" text
// intake that `InvokeLLM` parses into a STRUCTURED foundation/pole draft,
// shows a proposal preview for operator review, then merges into the
// project on Apply. The parse is an intake proposal only -- the operator
// reviews every parsed field before it lands; nothing applies silently.
import { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Cpu, Loader2 } from "lucide-react";
import { validateFoundationProposal, stripCertification } from "./foundationModuleProposal";
import { ESTIMATOR_AI_MODEL } from "../../../../base44/shared/estimatorAiModelPolicy.js";

const PARSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          foundation_type: { type: "string" },
          quantity: { type: "number" },
          length_inches: { type: "number" },
          width_inches: { type: "number" },
          diameter: { type: "number" },
          depth_inches: { type: "number" },
        },
      },
    },
    poles: {
      type: "array",
      items: {
        type: "object",
        properties: { height_inches: { type: "number" }, description: { type: "string" } },
      },
    },
    notes: { type: "string" },
  },
};

const ITEM_TYPES = ["spread_foot", "drilled_pier", "continuous", "pillar"];

const sceneSummary = (project) => {
  const items = Array.isArray(project?.items) ? project.items : [];
  const poles = Array.isArray(project?.poles) ? project.poles : [];
  const dims = items.map(i => `${i.foundation_type || "?"} ${i.length_inches || "?"}x${i.width_inches || "?"}x${i.depth_inches || "?"}in`).slice(0, 8).join("; ");
  return `${items.length} foundations (${dims || "none"}) and ${poles.length} poles currently in the design`;
};

const catalogNames = (catalog) => {
  const names = [];
  for (const rows of Object.values(catalog || {})) {
    for (const r of rows || []) {
      const n = r?.material_name || r?.name || r?.service_name;
      if (n && !names.includes(n)) names.push(n);
    }
  }
  return names.slice(0, 24);
};

// O-085 (CMP-G08) -- priced alternatives: a deterministic catalog lookup
// matching the alternative's label against the catalog's priced entries --
// `computed_cost`/`matched_stock`/`matched_unit` record the priced match when
// the alternative's label names a catalog stock (never an invented price;
// an unmatched alternative stays `computed_cost: null` -- the described
// `cost_impact` text still surfaces).
const pricedAlternative = (label, catalog) => {
  if (typeof label !== "string" || !label) return { computed_cost: null };
  const lname = label.toLowerCase();
  for (const rows of Object.values(catalog || {})) {
    for (const r of rows || []) {
      const n = r?.material_name || r?.name || r?.service_name;
      if (!n || !lname.includes(String(n).toLowerCase())) continue;
      const unit = r?.cost_per_unit ?? r?.unit_price ?? r?.cost_per_sqft ?? null;
      return {
        computed_cost: Number.isFinite(unit) ? unit : null,
        matched_stock: n,
        matched_unit: r?.unit || "unit",
      };
    }
  }
  return { computed_cost: null };
};

// W-018 (AI-07) -- certification strip moved to foundationModuleProposal.js
// (the eval matrix's guards are executable from there); imported above.

// W-015 (AI-04) -- per-topic cost/scope implication: why a follow-up fact
// matters to the estimate (deterministic, never AI-invented).
const TOPIC_IMPLICATIONS = Object.freeze({
  "sign style": "sign style drives face count + artwork complexity",
  "sign weight": "sign weight drives footing size + embedment",
  "sign size": "sign size drives pole height + wind load",
  mounting: "mount type drives hardware + labor",
  "site constraints": "site constraints drive access + equipment",
  scope: "scope drives the line-item count + total",
  budget: "budget constrains the assembly choice",
});

export default function FoundationAiIntake({ project, catalog, onApply, disabled }) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState(null);
  // W-019 (AI-09) -- bounded parse history: each committed parse appends to a
  // capped array (last 10) so the operator sees the revision trail; the array
  // never grows unbounded.
  const [parseHistory, setParseHistory] = useState([]);
  // W-017 -- a proposal drafted against a stale base flags a warning the
  // operator confirms before applying.
  const [staleBase, setStaleBase] = useState(false);
  const [revisionText, setRevisionText] = useState("");
  // W-019 -- a token invalidates in-flight parse responses: a superseded or
  // cancelled request can't overwrite a newer proposal. InvokeLLM isn't
  // abortable; the server call completes but its result is discarded.
  const tokenRef = useRef(0);
  const cancel = () => { tokenRef.current += 1; setRunning(false); };
  // W-019 (AI-08) -- request-rate limit: a `parse` call inside the minimum
  // interval is skipped -- the InvokeLLM call isn't free; a rate limit bounds
  // the request cadence (never a silent drop -- a skip surfaces as an error).
  const lastParseRef = useRef(0);
  const PARSE_MIN_INTERVAL_MS = 2000;

  // O-088 -- a revision feeds the current proposal + the natural-language
  // edit back to the parser, so "add a pole" / "wider base" modify the
  // in-flight draft instead of discarding it. Fresh text (no proposal)
  // parses the whole description.
  const parse = async (revision = null) => {
    const t = (revision ?? text).trim();
    if (!t || running) return;
    // W-019 (AI-08) -- request-rate limit: a `parse` call inside the minimum
    // interval is skipped -- the InvokeLLM call isn't free; a skip surfaces
    // as an error, never a silent drop.
    const now = Date.now();
    if (now - lastParseRef.current < PARSE_MIN_INTERVAL_MS) {
      setError("Slow down -- a parse was just submitted. Wait a moment before parsing again.");
      return;
    }
    lastParseRef.current = now;
    const token = ++tokenRef.current;
    setRunning(true);
    setError("");
    try {
      // O-088 (CMP-G11) -- locked items carry `locked: true` in the prior-draft
      // JSON; the revision prompt tells the LLM to preserve locked rows'
      // positions/dimensions so a manual placement survives a revision.
      const prior = revision && proposal ? `Current draft: ${JSON.stringify({ items: proposal.items, poles: proposal.poles })}. Apply this revision, keep unmentioned rows; items with locked:true keep their position/dimensions unchanged: ${t}` : `Description: ${t}`;
      // O-084 -- the current scene feeds the parse so the LLM can flag where
      // the description contradicts the design ("says 2 poles but 3 exist").
      // O-085 -- the real catalog feeds the parse so any assembly proposal
      // references actual stock names, never invented materials.
      const stock = catalogNames(catalog).join(", ") || "none loaded";
      const res = await base44.integrations.Core.InvokeLLM({
        model: ESTIMATOR_AI_MODEL, // W-024 -- the pinned shared flagship
        prompt: `Parse this sign-foundation input into a structured draft. Return only the schema fields -- quantities/dimensions as finite inches, foundation_type one of ${ITEM_TYPES.join("/")} (guess "spread_foot" if unstated). Never invent engineering values; omit fields the text does not state. The design currently has ${sceneSummary(project)} -- flag any contradiction between the input and that design in "contradictions" (empty string if none). Available catalog stock: ${stock}. If a complete assembly can be proposed from that stock (concrete + pole + rebar + finish), put it in "suggestions" referencing only real stock names; empty string if none. List up to 4 structured alternatives in "alternatives" ({label, cost_impact, sensitivity}) -- a different stock/assembly choice with a brief cost-impact note and a sensitivity note (what uncertain input most changes its cost); empty array if none. List up to 6 grouped follow-up questions in "follow_ups" (topic + question) for missing facts the design still needs -- sign style/weight, mounting, site constraints, scope; empty array if fully described. ${prior}`,
        response_json_schema: {
          type: "object",
          properties: { ...PARSE_SCHEMA.properties, contradictions: { type: "string" }, suggestions: { type: "string" },
            alternatives: { type: "array", items: { type: "object", properties: { label: { type: "string" }, cost_impact: { type: "string" }, sensitivity: { type: "string" },
              // O-117 (CMP-I16) -- numeric sensitivity bound: `sensitivity_pct`
              // carries the ±% swing on the alternative's cost for the named
              // uncertain input -- a numeric bound, not just a text note.
              sensitivity_pct: { type: "number" } } } },
            follow_ups: { type: "array", items: { type: "object", properties: { topic: { type: "string" }, question: { type: "string" } } } },
            // O-083 (CMP-G06) -- a `concept_only` flag on the proposal
            // records whether the draft is a concept (fields still missing)
            // vs a complete spec -- the concept-only progress carries the
            // flag to the review so it isn't presented as verified data.
            concept_only: { type: "boolean" } },
        },
      });
      if (token !== tokenRef.current) return; // superseded -- discard
      const parsed = typeof res === "string" ? JSON.parse(res) : res;
      setProposal({
        items: (parsed.items || []).filter(i => i && typeof i === "object").map(i => ({
          foundation_type: ITEM_TYPES.includes(i.foundation_type) ? i.foundation_type : "spread_foot",
          quantity: i.quantity ?? "", length_inches: i.length_inches ?? "", width_inches: i.width_inches ?? "",
          diameter: i.diameter ?? "", depth_inches: i.depth_inches ?? "",
          // O-088 -- a locked item carries locked:true through the revision so
          // the LLM preserves its position/dimensions.
          locked: i.locked === true ? true : undefined,
        })),
        poles: (parsed.poles || []).filter(p => p && typeof p === "object").map(p => ({
          height_inches: p.height_inches ?? "", description: p.description ?? "",
        })),
        // W-018 (AI-07) -- certification strip: the AI cannot emit a priced
        // value, but it could phrase a suggestion as "certified"/"code-
        // compliant". Strip certification claims so a suggestion never reads
        // as engineering approval.
        notes: typeof parsed.notes === "string" ? stripCertification(parsed.notes) : "",
        contradictions: typeof parsed.contradictions === "string" ? parsed.contradictions : "",
        suggestions: typeof parsed.suggestions === "string" ? stripCertification(parsed.suggestions) : "",
        // O-085 (CMP-G08) -- structured alternatives with a cost-impact note:
        // up to 4 {label, cost_impact} rows alongside the free-text suggestion.
        alternatives: (Array.isArray(parsed.alternatives) ? parsed.alternatives : [])
          .filter(a => a && typeof a === "object" && typeof a.label === "string")
          .slice(0, 4).map(a => ({ label: stripCertification(a.label), cost_impact: typeof a.cost_impact === "string" ? stripCertification(a.cost_impact) : "", sensitivity: typeof a.sensitivity === "string" ? stripCertification(a.sensitivity) : "",
            sensitivity_pct: Number.isFinite(Number(a.sensitivity_pct)) ? Number(a.sensitivity_pct) : undefined })),
        followUps: (Array.isArray(parsed.follow_ups) ? parsed.follow_ups : [])
          .filter(f => f && typeof f === "object" && typeof f.question === "string")
          .slice(0, 6).map(f => ({ topic: f.topic || "Detail", question: f.question })),
        // O-083 (CMP-G06) -- a `concept_only` flag on the proposal records
        // whether the draft is a concept (fields still missing) vs a
        // complete spec -- the concept-only progress carries the flag to the
        // review so it isn't presented as verified data.
        concept_only: parsed.concept_only === true ? true : undefined,
        // W-016 -- the proposal carries the shared proposal-shape metadata so
        // a future applyModuleProposal can validate revision + allowlisted
        // operations; the intake's rows are its operations.
        schema_version: 1, module_key: "foundation",
        proposal_id: `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        base_project_revision: project?.updated_date ?? null,
        // W-016 (AI-05) -- brief + evidence_refs: the intake's description text
        // is its brief; evidence_refs points at the project's reference_photos
        // (context urls, never image bytes).
        brief: t.slice(0, 500),
        evidence_refs: (Array.isArray(project?.reference_photos) ? project.reference_photos : [])
          .map(p => ({ id: p?.id, url: p?.url, caption: p?.caption }))
          .filter(r => r.url),
        // W-014 (AI-03) -- user_locks/exclusions as first-class fields: locked
        // item indexes (the O-088 lock) travel as user_locks; exclusions is an
        // authored list the proposal carries (never silently dropped).
        user_locks: (parsed.items || []).map((i, ix) => i?.locked === true ? ix : null).filter(ix => ix !== null),
        exclusions: Array.isArray(parsed.exclusions) ? parsed.exclusions.filter(x => typeof x === "string") : [],
        // O-081 (CMP-G04) -- structured brief's conversational half:
        // photo_observations/preferences/conflicts/assumptions/questions_answered
        // fields the operator/AI records on the proposal (the confirmed-facts
        // + missing-inputs half is the brief; these are the conversational
        // tracking fields).
        photo_observations: Array.isArray(parsed.photo_observations) ? parsed.photo_observations.filter(x => typeof x === "string") : [],
        preferences: Array.isArray(parsed.preferences) ? parsed.preferences.filter(x => typeof x === "string") : [],
        conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts.filter(x => typeof x === "string") : [],
        assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.filter(x => typeof x === "string") : [],
        questions_answered: Array.isArray(parsed.questions_answered) ? parsed.questions_answered.filter(x => typeof x === "string") : [],
      });
      // W-019 -- bounded parse history: the committed parse appends to the
      // capped trail (last 10), so the operator sees the revision path.
      setParseHistory((h) => [...h, { description: t.slice(0, 120), at: Date.now(), revision: !!revision }].slice(-10));
    } catch (e) {
      setError(e?.message || "The description could not be parsed.");
    } finally {
      setRunning(false);
    }
  };

  const setField = (section, i, k, v) => {
    setProposal(prev => {
      const rows = [...prev[section]]; rows[i] = { ...rows[i], [k]: v };
      return { ...prev, [section]: rows };
    });
  };

  const apply = (force = false) => {
    if (!proposal || typeof onApply !== "function") return;
    // W-017 -- validate before apply: field/object issues block the merge and
    // surface to the operator; a valid proposal then merges through commit
    // (which carries the schema-valid + undo contract).
    const { valid, issues } = validateFoundationProposal(proposal);
    if (!valid) {
      setError(issues[0]?.message || "The proposal cannot be applied.");
      return;
    }
    // O-087 (CMP-G10) -- explicit base-version match: a proposal's
    // `schema_version` must match the record's `assembly_schema_version`
    // when both are present -- a proposal drafted against a different schema
    // version can't merge (a structural mismatch, not a stale timestamp).
    if (!force && proposal.schema_version != null && project?.assembly_schema_version != null
      && Number(proposal.schema_version) !== Number(project.assembly_schema_version)) {
      setError(`Proposal schema version ${proposal.schema_version} doesn't match the record's assembly schema ${project.assembly_schema_version} -- re-parse against the current record.`);
      return;
    }
    // W-017 + O-087 -- base-revision verification: a proposal drafted against
    // a stale base (project.updated_date moved) flags a stale-draft warning
    // before the merge. O-087's explicit base-version matching extends the
    // gate: a proposal carrying NO recorded base revision can't prove it
    // matches the current design -- it flags the same operator-confirmed path
    // (labeled "unverifiable"), never a silent pass.
    if (!force && project?.updated_date != null
      && (proposal.base_project_revision == null
        || proposal.base_project_revision !== project.updated_date)) {
      setStaleBase(proposal.base_project_revision == null ? "unverifiable" : "stale");
      return;
    }
    setStaleBase(false);
    const items = proposal.items
      .map(i => ({ ...i, quantity: Number(i.quantity) || 1 }))
      .filter(i => Number(i.length_inches) || Number(i.diameter) || Number(i.depth_inches));
    const poles = proposal.poles.filter(p => Number(p.height_inches));
    // O-087 (CMP-G10) -- referential validity: a proposed pole's `mounts_to`
    // (a 1-based item index) must reference an item that lands in the merge
    // (a bound pole to a non-existent item is a referential error, blocked
    // before the merge -- never a silent drop to a default mount).
    const badRef = poles.findIndex((p) => {
      const ref = Number(p.mounts_to);
      return p.mounts_to != null && p.mounts_to !== "" && (!Number.isInteger(ref) || ref < 1 || ref > items.length);
    });
    if (badRef >= 0) {
      setError(`Pole ${badRef + 1} mounts to item ${poles[badRef].mounts_to} -- no item lands at that index (only ${items.length} land). Fix the mount reference or remove it.`);
      return;
    }
    // W-019 (AI-08) -- idempotent apply receipt: `apply_receipt_id` records a
    // keyed receipt on the apply payload -- a consumer records the receipt so
    // a duplicate apply (a double-click/retry) doesn't double-land.
    const apply_receipt_id = `receipt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    onApply({ foundations: items, poles, apply_receipt_id });
    setProposal(null);
    setText("");
  };

  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/40 p-3" data-ai-intake="true">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-violet-800">
        <Cpu className="w-3.5 h-3.5" /> Describe your design
      </div>
      <p className="mt-0.5 text-[11px] text-gray-500">Free text parsed into a draft -- review every field before applying; nothing lands silently.</p>
      <div className="mt-1.5 flex gap-1.5">
        <textarea value={text} disabled={disabled || running} rows={2}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. two 4x4x3 spread footings and a 20ft pole"
          className="flex-1 px-2 py-1 text-[11px] border border-gray-200 rounded-sm bg-white" />
        <button type="button" onClick={parse} disabled={disabled || running || !text.trim()}
          className="h-auto px-2.5 rounded-sm bg-violet-600 text-white text-[11px] font-semibold hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1">
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : null}Parse
        </button>
        {running && (
          <button type="button" onClick={cancel}
            className="h-auto px-2 rounded-sm border border-gray-300 text-[11px] text-gray-600">Cancel</button>
        )}
      </div>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      {proposal && (
        <div className="mt-2 rounded-sm border border-gray-200 bg-white p-2" data-ai-proposal="true">
          {proposal.items.map((it, i) => (
            <div key={i} className="mb-1">
              <div className="grid grid-cols-6 gap-1 items-center">
                <select value={it.foundation_type} onChange={(e) => setField("items", i, "foundation_type", e.target.value)}
                  className="col-span-2 h-5 px-1 text-[10px] border border-gray-200 rounded-sm">
                  {ITEM_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                </select>
                {["quantity", "length_inches", "width_inches", "depth_inches"].map(k => (
                  <input key={k} value={it[k]} onChange={(e) => setField("items", i, k, e.target.value)}
                    placeholder={it[k] === "" ? "unknown" : k.split("_")[0]}
                    className={`h-5 px-1 text-[10px] border rounded-sm ${it[k] === "" ? "border-amber-300 bg-amber-50/40" : "border-gray-200"}`} />
                ))}
                {/* O-088 -- a locked item keeps its position/dimensions across a
                    revision (the prior-draft JSON carries locked:true). */}
                <label className="flex items-center gap-0.5 text-[9px] text-gray-500" title="Keep this item's position/dimensions unchanged across a revision">
                  <input
                    type="checkbox"
                    checked={it.locked === true}
                    onChange={(e) => setField("items", i, "locked", e.target.checked ? true : undefined)}
                    className="h-3 w-3"
                    aria-label={`Lock item ${i + 1}`}
                  />
                  Lock
                </label>
              </div>
              {/* O-083 -- a blank field is concept-only progress: it stays
                  unknown (never invented), flagged amber, with the reason it
                  matters stated. "I don't know" is an honest answer. */}
              <p className="text-[9px] text-amber-700/80 mt-0.5">
                {(() => {
                  // O-083 -- per-field why-it-matters: a contextual reason per
                  // missing field (not the generic bearing boilerplate).
                  const WHY = {
                    quantity: "sets how many footings to dig",
                    length_inches: "sets the footing's plan area for concrete volume",
                    width_inches: "sets the footing's plan area for concrete volume",
                    depth_inches: "sets the embedment for bearing + frost",
                  };
                  const missing = [["quantity", it.quantity], ["length_inches", it.length_inches], ["width_inches", it.width_inches], ["depth_inches", it.depth_inches]]
                    .filter(([, v]) => v === "").map(([k]) => k);
                  return missing.length
                    ? `Unknown: ${missing.map((k) => `${k.replace(/_inches$/, "")} (${WHY[k]})`).join(", ")}.`
                    : "";
                })()}
              </p>
            </div>
          ))}
          {proposal.poles.map((p, i) => (
            <div key={i} className="grid grid-cols-6 gap-1 mb-1 items-center">
              <input value={p.description ?? ""} onChange={(e) => setField("poles", i, "description", e.target.value)}
                placeholder="pole" className="col-span-4 h-5 px-1 text-[10px] border border-gray-200 rounded-sm" />
              <input value={p.height_inches} onChange={(e) => setField("poles", i, "height_inches", e.target.value)}
                placeholder="height in" className="col-span-2 h-5 px-1 text-[10px] border border-gray-200 rounded-sm" />
              {/* O-087 (CMP-G10) -- mount reference: `mounts_to` records which
                  item (1-based) the pole mounts to -- a bound pole to a
                  non-existent item is a referential error the apply blocks. */}
              <input value={p.mounts_to ?? ""} onChange={(e) => setField("poles", i, "mounts_to", e.target.value)}
                placeholder="mounts to item #" aria-label={`Pole ${i + 1} mounts to item`}
                title="Which item (1-based) this pole mounts to -- an invalid reference is a referential error"
                className="col-span-2 h-5 px-1 text-[10px] border border-gray-200 rounded-sm" />
            </div>
          ))}
          {proposal.notes && <p className="text-[10px] text-gray-500 italic">{proposal.notes}</p>}
          {proposal.contradictions && (
            <p className="mt-1 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-1.5 py-0.5">
              Contradiction: {proposal.contradictions}
            </p>
          )}
          {proposal.suggestions && (
            <p className="mt-1 text-[10px] text-sky-800 bg-sky-50 border border-sky-200 rounded-sm px-1.5 py-0.5">
              Suggested assembly: {proposal.suggestions}
            </p>
          )}
          {/* O-085 (CMP-G08) -- structured alternatives with cost-impact notes. */}
          {proposal.alternatives?.length > 0 && (
            <div className="mt-1 rounded-sm border border-sky-200 bg-sky-50 px-1.5 py-1">
              <p className="text-[10px] font-semibold text-sky-800">Alternatives</p>
              {proposal.alternatives.map((a, i) => {
                // O-085 (CMP-G08) -- priced alternative: a deterministic
                // catalog lookup on the alternative's label surfaces the
                // computed cost when the label names a catalog stock (never
                // an invented price; unmatched stays silent).
                const priced = pricedAlternative(a.label, catalog);
                return (
                  <p key={i} className="text-[10px] text-sky-700 mt-0.5">
                    {/* Lane E -- alternative_elected/alternative_applied: the
                        operator's election rides the alternative row (elected
                        = the operator picked it; applied = it was applied to
                        the design — never a silent apply). */}
                    <label className="inline-flex items-center gap-1 mr-1">
                      <input type="checkbox" checked={!!a.elected} onChange={(e) => { a.elected = e.target.checked; if (!e.target.checked) a.applied = false; setProposal({ ...proposal }); }}
                        aria-label={`Elect alternative ${i + 1}: ${a.label}`} className="h-3 w-3" />
                      <span className="sr-only">elect</span>
                    </label>
                    {a.label}{a.cost_impact ? ` - ${a.cost_impact}` : ""}
                    {a.elected && <span className="text-sky-800 font-semibold"> [elected]</span>}
                    {a.applied && <span className="text-green-700 font-semibold"> [applied]</span>}
                    {Number.isFinite(priced.computed_cost) && (
                      <span className="text-sky-800 font-semibold"> [@${priced.computed_cost}/{priced.matched_unit} {priced.matched_stock}]</span>
                    )}
                    {/* O-117 (CMP-I16) -- numeric sensitivity bound: the
                        alternative's ±% cost swing on the named uncertain
                        input renders alongside the text note. */}
                    {Number.isFinite(a.sensitivity_pct) && <span className="text-sky-600 font-semibold"> [±{a.sensitivity_pct}%]</span>}
                    {a.sensitivity && <span className="text-sky-500 italic"> ({a.sensitivity})</span>}
                  </p>
                );
              })}
            </div>
          )}
          {proposal.followUps?.length > 0 && (
            <div className="mt-1 rounded-sm border border-gray-200 bg-gray-50 px-1.5 py-1" data-follow-ups="true">
              <p className="text-[10px] font-semibold text-gray-700">Follow-ups</p>
              {proposal.followUps.map((f, i) => (
                <div key={i} className="mt-0.5">
                  <p className="text-[10px] text-gray-600">
                    <span className="font-medium text-gray-700">{f.topic}:</span> {f.question}
                    {/* W-015 (AI-04) -- per-question cost/scope implication:
                        why the fact matters to the estimate. */}
                    {TOPIC_IMPLICATIONS[f.topic?.toLowerCase()] && (
                      <span className="ml-1 text-gray-400 italic">({TOPIC_IMPLICATIONS[f.topic.toLowerCase()]})</span>
                    )}
                  </p>
                  {/* O-082 -- an answer appends to the description and re-parses;
                      the Q&A loop enriches the draft instead of starting over. */}
                  <input disabled={disabled || running}
                    placeholder="Answer, then Enter to refine"
                    className="mt-0.5 w-full h-5 px-1 text-[10px] border border-gray-200 rounded-sm bg-white"
                    onKeyDown={(e) => {
                      const v = e.currentTarget.value.trim();
                      if (e.key === "Enter" && v) {
                        setText(prev => `${prev}\n${f.question} ${v}`);
                        e.currentTarget.value = "";
                      }
                    }} />
                </div>
              ))}
            </div>
          )}
          {/* O-086 -- apply preview: what lands + what drops, before the
              operator commits. Rows with no dimension are dropped; the
              proposal APPENDS to the existing design, never replaces. */}
          {(() => {
            const validItems = proposal.items.filter(i => Number(i.length_inches) || Number(i.diameter) || Number(i.depth_inches)).length;
            const dropped = proposal.items.length - validItems;
            const validPoles = proposal.poles.filter(p => Number(p.height_inches)).length;
            return (
              <p className="text-[9px] text-gray-500 mt-1">
                Applies {validItems} foundation{validItems === 1 ? "" : "s"} + {validPoles} pole{validPoles === 1 ? "" : "s"} (appends to the current design)
                {dropped > 0 ? ` -- drops ${dropped} dimensionless row${dropped === 1 ? "" : "s"}` : ""}.
              </p>
            );
          })()}
          <div className="flex gap-1.5 items-center mt-1">
            <input value={revisionText} onChange={(e) => setRevisionText(e.target.value)} disabled={running}
              placeholder="Revise: 'add a pole', 'wider base'..."
              className="flex-1 h-6 px-1.5 text-[10px] border border-gray-200 rounded-sm bg-white" />
            <button type="button" onClick={() => { parse(revisionText); setRevisionText(""); }} disabled={running || !revisionText.trim()}
              className="h-6 px-2 text-[10px] border border-gray-300 rounded-sm disabled:opacity-50">Revise</button>
            <button type="button" onClick={() => setProposal(null)} className="h-6 px-2 text-[10px] border border-gray-300 rounded-sm">Discard</button>
            <button type="button" onClick={apply} className="h-6 px-2 text-[10px] bg-violet-600 text-white rounded-sm font-semibold">Apply to design</button>
          </div>
          {/* O-083 (CMP-G06) -- a `concept_only` flag surfaces the draft's
              partial state -- a concept (fields still missing) vs a
              complete spec, never presented as verified data. */}
          {proposal?.concept_only === true && (
            <div className="mt-1 rounded-sm border border-sky-200 bg-sky-50 px-1.5 py-1 text-[10px] text-sky-800">
              Concept draft -- the intake still lacks required fields. Review the flagged fields before applying.
            </div>
          )}
          {/* W-017/O-087 -- stale-base OR unverifiable-base warning + an
              explicit apply-anyway. */}
          {staleBase && (
            <div className="mt-1 flex items-center gap-2 rounded-sm border border-amber-200 bg-amber-50 px-1.5 py-1 text-[10px] text-amber-800">
              {staleBase === "unverifiable"
                ? "This proposal records no base revision -- it cannot be verified against the current design. Review, then apply anyway or regenerate."
                : "Draft is stale - the design changed since this proposal. Review the current design, then apply anyway or regenerate."}
              <button
                type="button"
                onClick={() => { setStaleBase(false); apply(true); }}
                className="ml-auto h-5 px-1.5 rounded-sm border border-amber-300 text-amber-800 hover:bg-amber-100"
              >Apply anyway</button>
            </div>
          )}
        </div>
      )}
      {/* W-019 (AI-09) -- bounded parse history: the revision trail (last 10
          committed parses). */}
      {parseHistory.length > 0 && (
        <div className="mt-1.5 text-[9px] text-gray-400" aria-live="polite">
          <span className="font-medium text-gray-500">Parse history:</span>{" "}
          {parseHistory.slice(-3).map((h, i) => (
            <span key={i}>
              {h.revision ? "revision: " : "parse: "}{h.description}
              {i < Math.min(3, parseHistory.length) - 1 ? ", " : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
