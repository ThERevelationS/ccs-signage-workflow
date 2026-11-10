// O-092 (CMP-H01) -- guided-step progress strip. Reads authored project
// state and marks each workflow step done / active / pending:
//   Brief       -> project linked + customer name present
//   Structure   -> at least one foundation item authored
//   Walls/Caps  -> walls or wall caps authored
//   Signs/Site  -> poles, cabinets, or painted landscape cells authored
//   Review/Save -> the project has an acknowledged saved revision
// Steps are honest (derived, not fabricated) and non-interactive -- the
// canvas and panels do the real work; this only surfaces progress.

import { CheckCircle2, Circle } from "lucide-react";

function stepState(project, calc, savedSourceProject) {
  const cells = Object.keys(project?.landscape?.cells || {}).length;
  const steps = [
    { label: "Brief", tab: "foundations", done: !!(project?.id && project?.customer_name), hint: "customer + project basics" },
    { label: "Structure", tab: "foundations", done: (calc?.items || []).length > 0, hint: "foundation items" },
    { label: "Walls/Caps", tab: "caps", done: ((calc?.walls || []).length > 0 || (calc?.wallCaps || []).length > 0), hint: "walls + caps" },
    { label: "Signs/Site", tab: "signage", done: ((calc?.poles || []).length > 0 || (project?.signage_cabinets || []).length > 0 || cells > 0), hint: "poles, signs, landscape" },
    { label: "Review/Save", tab: "summary", done: !!savedSourceProject, hint: "saved revision" },
  ];
  const firstPending = steps.findIndex((s) => !s.done);
  return steps.map((s, i) => ({ ...s, active: i === firstPending }));
}

export default function FoundationGuidedSteps({ project, calc, savedSourceProject, onStepClick }) {
  const steps = stepState(project, calc, savedSourceProject);
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <div className="rounded-sm border border-gray-200 bg-white px-3 py-2" data-guided-steps="true" role="list" aria-label="Estimate progress">
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
        Guided setup <span className="font-normal normal-case text-gray-400">({doneCount}/{steps.length})</span>
      </div>
      <ol className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {steps.map((s, i) => (
          <li key={s.label} role="listitem" className="flex items-center gap-1.5">
            {s.done
              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              : <Circle className={`h-3.5 w-3.5 ${s.active ? "text-violet-600" : "text-gray-300"}`} aria-hidden="true" />}
            <button
              type="button"
              onClick={() => onStepClick?.(s.tab)}
              className={`text-[11px] hover:underline ${s.done ? "text-gray-400 line-through" : s.active ? "font-semibold text-violet-700" : "text-gray-500"}`}
              title={`Go to ${s.label}`}
            >
              {s.label}
            </button>
            <span className="text-[10px] text-gray-400">{s.done ? "" : s.hint}</span>
            {i < steps.length - 1 && <span className="text-gray-300" aria-hidden="true">&rarr;</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
