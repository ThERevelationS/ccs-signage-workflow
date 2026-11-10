// O-082--O-085 -- conversational AI intake: a "Describe your design" text
// intake that `InvokeLLM` parses into a STRUCTURED foundation/pole draft,
// shows a proposal preview for operator review, then merges into the
// project on Apply. The parse is an intake proposal only -- the operator
// reviews every parsed field before it lands; nothing applies silently.
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Cpu, Loader2 } from "lucide-react";

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

export default function FoundationAiIntake({ onApply, disabled }) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState(null);
  const [revisionText, setRevisionText] = useState("");

  // O-088 -- a revision feeds the current proposal + the natural-language
  // edit back to the parser, so "add a pole" / "wider base" modify the
  // in-flight draft instead of discarding it. Fresh text (no proposal)
  // parses the whole description.
  const parse = async (revision = null) => {
    const t = (revision ?? text).trim();
    if (!t || running) return;
    setRunning(true);
    setError("");
    try {
      const prior = revision && proposal ? `Current draft: ${JSON.stringify({ items: proposal.items, poles: proposal.poles })}. Apply this revision, keep unmentioned rows: ${t}` : `Description: ${t}`;
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Parse this sign-foundation input into a structured draft. Return only the schema fields -- quantities/dimensions as finite inches, foundation_type one of ${ITEM_TYPES.join("/")} (guess "spread_foot" if unstated). Never invent engineering values; omit fields the text does not state. ${prior}`,
        response_json_schema: PARSE_SCHEMA,
      });
      const parsed = typeof res === "string" ? JSON.parse(res) : res;
      setProposal({
        items: (parsed.items || []).filter(i => i && typeof i === "object").map(i => ({
          foundation_type: ITEM_TYPES.includes(i.foundation_type) ? i.foundation_type : "spread_foot",
          quantity: i.quantity ?? "", length_inches: i.length_inches ?? "", width_inches: i.width_inches ?? "",
          diameter: i.diameter ?? "", depth_inches: i.depth_inches ?? "",
        })),
        poles: (parsed.poles || []).filter(p => p && typeof p === "object").map(p => ({
          height_inches: p.height_inches ?? "", description: p.description ?? "",
        })),
        notes: typeof parsed.notes === "string" ? parsed.notes : "",
      });
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

  const apply = () => {
    if (!proposal || typeof onApply !== "function") return;
    const items = proposal.items
      .map(i => ({ ...i, quantity: Number(i.quantity) || 1 }))
      .filter(i => Number(i.length_inches) || Number(i.diameter) || Number(i.depth_inches));
    const poles = proposal.poles.filter(p => Number(p.height_inches));
    onApply({ foundations: items, poles });
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
              </div>
              {/* O-083 -- a blank field is concept-only progress: it stays
                  unknown (never invented), flagged amber, with the reason it
                  matters stated. "I don't know" is an honest answer. */}
              <p className="text-[9px] text-amber-700/80 mt-0.5">
                {[it.quantity === "" && "qty", it.length_inches === "" && "length", it.width_inches === "" && "width", it.depth_inches === "" && "depth"].filter(Boolean).join(" · ")
                  ? `Unknown: ${[it.quantity === "" && "quantity", it.length_inches === "" && "length", it.width_inches === "" && "width", it.depth_inches === "" && "depth"].filter(Boolean).join(", ")} -- needed for concrete volume and bearing.`
                  : ""}
              </p>
            </div>
          ))}
          {proposal.poles.map((p, i) => (
            <div key={i} className="grid grid-cols-6 gap-1 mb-1 items-center">
              <input value={p.description ?? ""} onChange={(e) => setField("poles", i, "description", e.target.value)}
                placeholder="pole" className="col-span-4 h-5 px-1 text-[10px] border border-gray-200 rounded-sm" />
              <input value={p.height_inches} onChange={(e) => setField("poles", i, "height_inches", e.target.value)}
                placeholder="height in" className="col-span-2 h-5 px-1 text-[10px] border border-gray-200 rounded-sm" />
            </div>
          ))}
          {proposal.notes && <p className="text-[10px] text-gray-500 italic">{proposal.notes}</p>}
          <div className="flex gap-1.5 items-center mt-1">
            <input value={revisionText} onChange={(e) => setRevisionText(e.target.value)} disabled={running}
              placeholder="Revise: 'add a pole', 'wider base'..."
              className="flex-1 h-6 px-1.5 text-[10px] border border-gray-200 rounded-sm bg-white" />
            <button type="button" onClick={() => { parse(revisionText); setRevisionText(""); }} disabled={running || !revisionText.trim()}
              className="h-6 px-2 text-[10px] border border-gray-300 rounded-sm disabled:opacity-50">Revise</button>
            <button type="button" onClick={() => setProposal(null)} className="h-6 px-2 text-[10px] border border-gray-300 rounded-sm">Discard</button>
            <button type="button" onClick={apply} className="h-6 px-2 text-[10px] bg-violet-600 text-white rounded-sm font-semibold">Apply to design</button>
          </div>
        </div>
      )}
    </div>
  );
}
