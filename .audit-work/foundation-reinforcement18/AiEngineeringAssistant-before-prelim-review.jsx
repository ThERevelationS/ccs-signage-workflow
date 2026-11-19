import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Cpu, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function AiEngineeringAssistant({ project, onResult }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const recommendation = project.ai_engineering_recommendation;

  const run = async () => {
    setRunning(true);
    setError("");
    try {
      const summary = (project.items || []).map((it, i) => ({
        n: i + 1,
        type: it.foundation_type,
        quantity: it.quantity,
        length_in: it.length_inches,
        width_in: it.width_inches,
        diameter_in: it.diameter,
        depth_in: it.depth_inches,
        rebar: it.include_rebar ? it.rebar_size : "none",
      }));
      const poles = (project.poles || []).map((p) => ({
        height_in: p.height_inches,
        signs: (p.signs || []).length,
      }));

      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a structural engineer sizing sign foundations and poles.
Foundations: ${JSON.stringify(summary)}
Poles: ${JSON.stringify(poles)}
Concrete mix: ${project.project_concrete_type || "unspecified"}

Give concise wind-load and sizing recommendations: assumed wind speed and exposure, overturning/embedment check per each foundation, whether the footing/pillar size and depth are adequate, recommended rebar, and any red flags. Use short markdown sections and keep it under 250 words.`,
        response_json_schema: {
          type: "object",
          properties: {
            recommendation_markdown: { type: "string" },
            adequate: { type: "boolean" },
            assumed_wind_speed_mph: { type: "number" },
          },
        },
      });

      onResult({
        ai_engineering_recommendation: res.recommendation_markdown || "",
        ai_engineering_data: {
          adequate: res.adequate,
          assumed_wind_speed_mph: res.assumed_wind_speed_mph,
          generated_at: new Date().toISOString(),
        },
      });
    } catch (e) {
      setError(e.message || "The engineering calculator could not run.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-sm p-3 mb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Cpu className="w-4 h-4 text-violet-600 mt-0.5" />
          <div>
            <h3 className="text-[13px] font-bold text-violet-900">AI Engineering Assistant</h3>
            <p className="text-[11px] text-violet-700">
              Generate concise wind load calculations and sizing recommendations for your foundation
              and poles.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="h-[30px] px-3 flex items-center gap-1.5 rounded-sm bg-violet-600 text-white text-[12px] font-semibold hover:bg-violet-700 disabled:opacity-60 flex-shrink-0"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cpu className="w-3.5 h-3.5" />}
          {running ? "Calculating…" : "Run AI Engineering Calculator"}
        </button>
      </div>

      {error && <div className="mt-2 text-[11px] text-red-600">{error}</div>}

      {recommendation && (
        <div className="mt-3 bg-white border border-violet-200 rounded-sm p-3 text-[12px] text-gray-700 prose prose-sm max-w-none">
          <ReactMarkdown>{recommendation}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}