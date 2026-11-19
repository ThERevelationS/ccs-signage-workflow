import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Cpu, Loader2 } from "lucide-react";
import { validateFoundationProposal } from "./foundationModuleProposal";
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
          depth_inches: { type: "number" }
        }
      }
    },
    poles: {
      type: "array",
      items: {
        type: "object",
        properties: { height_inches: { type: "number" }, description: { type: "string" } }
      }
    },
    notes: { type: "string" }
  }
};
const ITEM_TYPES = ["spread_foot", "drilled_pier", "continuous", "pillar"];
const sceneSummary = (project) => {
  const items = Array.isArray(project?.items) ? project.items : [];
  const poles = Array.isArray(project?.poles) ? project.poles : [];
  const dims = items.map((i) => `${i.foundation_type || "?"} ${i.length_inches || "?"}x${i.width_inches || "?"}x${i.depth_inches || "?"}in`).slice(0, 8).join("; ");
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
function FoundationAiIntake({ project, catalog, onApply, disabled }) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState(null);
  const [revisionText, setRevisionText] = useState("");
  const parse = async (revision = null) => {
    const t = (revision ?? text).trim();
    if (!t || running) return;
    setRunning(true);
    setError("");
    try {
      const prior = revision && proposal ? `Current draft: ${JSON.stringify({ items: proposal.items, poles: proposal.poles })}. Apply this revision, keep unmentioned rows: ${t}` : `Description: ${t}`;
      const stock = catalogNames(catalog).join(", ") || "none loaded";
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Parse this sign-foundation input into a structured draft. Return only the schema fields -- quantities/dimensions as finite inches, foundation_type one of ${ITEM_TYPES.join("/")} (guess "spread_foot" if unstated). Never invent engineering values; omit fields the text does not state. The design currently has ${sceneSummary(project)} -- flag any contradiction between the input and that design in "contradictions" (empty string if none). Available catalog stock: ${stock}. If a complete assembly can be proposed from that stock (concrete + pole + rebar + finish), put it in "suggestions" referencing only real stock names; empty string if none. List up to 6 grouped follow-up questions in "follow_ups" (topic + question) for missing facts the design still needs -- sign style/weight, mounting, site constraints, scope; empty array if fully described. ${prior}`,
        response_json_schema: {
          type: "object",
          properties: {
            ...PARSE_SCHEMA.properties,
            contradictions: { type: "string" },
            suggestions: { type: "string" },
            follow_ups: { type: "array", items: { type: "object", properties: { topic: { type: "string" }, question: { type: "string" } } } }
          }
        }
      });
      const parsed = typeof res === "string" ? JSON.parse(res) : res;
      setProposal({
        items: (parsed.items || []).filter((i) => i && typeof i === "object").map((i) => ({
          foundation_type: ITEM_TYPES.includes(i.foundation_type) ? i.foundation_type : "spread_foot",
          quantity: i.quantity ?? "",
          length_inches: i.length_inches ?? "",
          width_inches: i.width_inches ?? "",
          diameter: i.diameter ?? "",
          depth_inches: i.depth_inches ?? ""
        })),
        poles: (parsed.poles || []).filter((p) => p && typeof p === "object").map((p) => ({
          height_inches: p.height_inches ?? "",
          description: p.description ?? ""
        })),
        notes: typeof parsed.notes === "string" ? parsed.notes : "",
        contradictions: typeof parsed.contradictions === "string" ? parsed.contradictions : "",
        suggestions: typeof parsed.suggestions === "string" ? parsed.suggestions : "",
        followUps: (Array.isArray(parsed.follow_ups) ? parsed.follow_ups : []).filter((f) => f && typeof f === "object" && typeof f.question === "string").slice(0, 6).map((f) => ({ topic: f.topic || "Detail", question: f.question })),
        // W-016 -- the proposal carries the shared proposal-shape metadata so
        // a future applyModuleProposal can validate revision + allowlisted
        // operations; the intake's rows are its operations.
        schema_version: 1,
        module_key: "foundation",
        proposal_id: `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        base_project_revision: project?.updated_date ?? null
      });
    } catch (e) {
      setError(e?.message || "The description could not be parsed.");
    } finally {
      setRunning(false);
    }
  };
  const setField = (section, i, k, v) => {
    setProposal((prev) => {
      const rows = [...prev[section]];
      rows[i] = { ...rows[i], [k]: v };
      return { ...prev, [section]: rows };
    });
  };
  const apply = () => {
    if (!proposal || typeof onApply !== "function") return;
    const { valid, issues } = validateFoundationProposal(proposal);
    if (!valid) {
      setError(issues[0]?.message || "The proposal cannot be applied.");
      return;
    }
    const items = proposal.items.map((i) => ({ ...i, quantity: Number(i.quantity) || 1 })).filter((i) => Number(i.length_inches) || Number(i.diameter) || Number(i.depth_inches));
    const poles = proposal.poles.filter((p) => Number(p.height_inches));
    onApply({ foundations: items, poles });
    setProposal(null);
    setText("");
  };
  return /* @__PURE__ */ jsxs("div", { className: "rounded-md border border-violet-200 bg-violet-50/40 p-3", "data-ai-intake": "true", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 text-[12px] font-semibold text-violet-800", children: [
      /* @__PURE__ */ jsx(Cpu, { className: "w-3.5 h-3.5" }),
      " Describe your design"
    ] }),
    /* @__PURE__ */ jsx("p", { className: "mt-0.5 text-[11px] text-gray-500", children: "Free text parsed into a draft -- review every field before applying; nothing lands silently." }),
    /* @__PURE__ */ jsxs("div", { className: "mt-1.5 flex gap-1.5", children: [
      /* @__PURE__ */ jsx(
        "textarea",
        {
          value: text,
          disabled: disabled || running,
          rows: 2,
          onChange: (e) => setText(e.target.value),
          placeholder: "e.g. two 4x4x3 spread footings and a 20ft pole",
          className: "flex-1 px-2 py-1 text-[11px] border border-gray-200 rounded-sm bg-white"
        }
      ),
      /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          onClick: parse,
          disabled: disabled || running || !text.trim(),
          className: "h-auto px-2.5 rounded-sm bg-violet-600 text-white text-[11px] font-semibold hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1",
          children: [
            running ? /* @__PURE__ */ jsx(Loader2, { className: "w-3 h-3 animate-spin" }) : null,
            "Parse"
          ]
        }
      )
    ] }),
    error && /* @__PURE__ */ jsx("p", { className: "mt-1 text-[11px] text-red-600", children: error }),
    proposal && /* @__PURE__ */ jsxs("div", { className: "mt-2 rounded-sm border border-gray-200 bg-white p-2", "data-ai-proposal": "true", children: [
      proposal.items.map((it, i) => /* @__PURE__ */ jsxs("div", { className: "mb-1", children: [
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-6 gap-1 items-center", children: [
          /* @__PURE__ */ jsx(
            "select",
            {
              value: it.foundation_type,
              onChange: (e) => setField("items", i, "foundation_type", e.target.value),
              className: "col-span-2 h-5 px-1 text-[10px] border border-gray-200 rounded-sm",
              children: ITEM_TYPES.map((t) => /* @__PURE__ */ jsx("option", { value: t, children: t.replace(/_/g, " ") }, t))
            }
          ),
          ["quantity", "length_inches", "width_inches", "depth_inches"].map((k) => /* @__PURE__ */ jsx(
            "input",
            {
              value: it[k],
              onChange: (e) => setField("items", i, k, e.target.value),
              placeholder: it[k] === "" ? "unknown" : k.split("_")[0],
              className: `h-5 px-1 text-[10px] border rounded-sm ${it[k] === "" ? "border-amber-300 bg-amber-50/40" : "border-gray-200"}`
            },
            k
          ))
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-[9px] text-amber-700/80 mt-0.5", children: (() => {
          const missing = [it.quantity === "" && "quantity", it.length_inches === "" && "length", it.width_inches === "" && "width", it.depth_inches === "" && "depth"].filter(Boolean);
          return missing.length ? `Unknown: ${missing.join(", ")} -- needed for concrete volume and bearing.` : "";
        })() })
      ] }, i)),
      proposal.poles.map((p, i) => /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-6 gap-1 mb-1 items-center", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            value: p.description ?? "",
            onChange: (e) => setField("poles", i, "description", e.target.value),
            placeholder: "pole",
            className: "col-span-4 h-5 px-1 text-[10px] border border-gray-200 rounded-sm"
          }
        ),
        /* @__PURE__ */ jsx(
          "input",
          {
            value: p.height_inches,
            onChange: (e) => setField("poles", i, "height_inches", e.target.value),
            placeholder: "height in",
            className: "col-span-2 h-5 px-1 text-[10px] border border-gray-200 rounded-sm"
          }
        )
      ] }, i)),
      proposal.notes && /* @__PURE__ */ jsx("p", { className: "text-[10px] text-gray-500 italic", children: proposal.notes }),
      proposal.contradictions && /* @__PURE__ */ jsxs("p", { className: "mt-1 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-1.5 py-0.5", children: [
        "Contradiction: ",
        proposal.contradictions
      ] }),
      proposal.suggestions && /* @__PURE__ */ jsxs("p", { className: "mt-1 text-[10px] text-sky-800 bg-sky-50 border border-sky-200 rounded-sm px-1.5 py-0.5", children: [
        "Suggested assembly: ",
        proposal.suggestions
      ] }),
      proposal.followUps?.length > 0 && /* @__PURE__ */ jsxs("div", { className: "mt-1 rounded-sm border border-gray-200 bg-gray-50 px-1.5 py-1", "data-follow-ups": "true", children: [
        /* @__PURE__ */ jsx("p", { className: "text-[10px] font-semibold text-gray-700", children: "Follow-ups" }),
        proposal.followUps.map((f, i) => /* @__PURE__ */ jsxs("div", { className: "mt-0.5", children: [
          /* @__PURE__ */ jsxs("p", { className: "text-[10px] text-gray-600", children: [
            /* @__PURE__ */ jsxs("span", { className: "font-medium text-gray-700", children: [
              f.topic,
              ":"
            ] }),
            " ",
            f.question
          ] }),
          /* @__PURE__ */ jsx(
            "input",
            {
              disabled: disabled || running,
              placeholder: "Answer, then Enter to refine",
              className: "mt-0.5 w-full h-5 px-1 text-[10px] border border-gray-200 rounded-sm bg-white",
              onKeyDown: (e) => {
                const v = e.currentTarget.value.trim();
                if (e.key === "Enter" && v) {
                  setText((prev) => `${prev}
${f.question} ${v}`);
                  e.currentTarget.value = "";
                }
              }
            }
          )
        ] }, i))
      ] }),
      (() => {
        const validItems = proposal.items.filter((i) => Number(i.length_inches) || Number(i.diameter) || Number(i.depth_inches)).length;
        const dropped = proposal.items.length - validItems;
        const validPoles = proposal.poles.filter((p) => Number(p.height_inches)).length;
        return /* @__PURE__ */ jsxs("p", { className: "text-[9px] text-gray-500 mt-1", children: [
          "Applies ",
          validItems,
          " foundation",
          validItems === 1 ? "" : "s",
          " + ",
          validPoles,
          " pole",
          validPoles === 1 ? "" : "s",
          " (appends to the current design)",
          dropped > 0 ? ` -- drops ${dropped} dimensionless row${dropped === 1 ? "" : "s"}` : "",
          "."
        ] });
      })(),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-1.5 items-center mt-1", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            value: revisionText,
            onChange: (e) => setRevisionText(e.target.value),
            disabled: running,
            placeholder: "Revise: 'add a pole', 'wider base'...",
            className: "flex-1 h-6 px-1.5 text-[10px] border border-gray-200 rounded-sm bg-white"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => {
              parse(revisionText);
              setRevisionText("");
            },
            disabled: running || !revisionText.trim(),
            className: "h-6 px-2 text-[10px] border border-gray-300 rounded-sm disabled:opacity-50",
            children: "Revise"
          }
        ),
        /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setProposal(null), className: "h-6 px-2 text-[10px] border border-gray-300 rounded-sm", children: "Discard" }),
        /* @__PURE__ */ jsx("button", { type: "button", onClick: apply, className: "h-6 px-2 text-[10px] bg-violet-600 text-white rounded-sm font-semibold", children: "Apply to design" })
      ] })
    ] })
  ] });
}
export {
  FoundationAiIntake as default
};
