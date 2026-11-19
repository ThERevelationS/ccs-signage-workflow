import { useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
// O-092 (CMP-H01) -- guided-step progress strip. Reads authored project
// state and marks each workflow step done / active / pending:
//   Brief       -> project linked + customer name present
//   Structure   -> at least one foundation item authored
//   Walls/Caps  -> walls or wall caps authored
//   Signs/Site  -> poles, cabinets, or painted landscape cells authored
//   Review/Save -> the project has an acknowledged saved revision
// Steps are honest (derived, not fabricated) and non-interactive -- the
// canvas and panels do the real work; this only surfaces progress.

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
  // Lane E -- step_state/step_complete: the step's named state (done/active/
  // pending) + completion boolean ride the step data -- the wizard's step
  // contract surfaces (never a fabricated state).
  return steps.map((s, i) => {
    const active = i === firstPending;
    return { ...s, active, step_state: s.done ? "done" : active ? "active" : "pending", step_complete: !!s.done };
  });
}

export default function FoundationGuidedSteps({ project, calc, savedSourceProject, onStepClick }) {
  const steps = stepState(project, calc, savedSourceProject);
  const doneCount = steps.filter((s) => s.done).length;
  // O-092 -- wizard shell: a guided walk steps through the workflow with
  // Next/Back; the current step's tab jump + hint surface the bounded wizard.
  const [wizardStep, setWizardStep] = useState(null);
  const wizardActive = wizardStep !== null && steps[wizardStep];
  return (
    <div className="rounded-sm border border-gray-200 bg-white px-3 py-2" data-guided-steps="true" role="list" aria-label="Estimate progress">
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
        Guided setup <span className="font-normal normal-case text-gray-500">({doneCount}/{steps.length})</span>
        <button
          type="button"
          onClick={() => setWizardStep(wizardActive ? null : 0)}
          className="ml-auto rounded-sm border border-violet-300 px-1.5 py-0.5 text-[10px] text-violet-700 normal-case hover:bg-violet-50"
        >{wizardActive ? "Exit guide" : "Guide me"}</button>
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
              className={`text-[11px] hover:underline ${s.done ? "text-gray-500 line-through" : s.active ? "font-semibold text-violet-700" : "text-gray-500"}`}
              title={`Go to ${s.label}`}
            >
              {s.label}
            </button>
            <span className="text-[10px] text-gray-500">{s.done ? "" : s.hint}</span>
            {i < steps.length - 1 && <span className="text-gray-300" aria-hidden="true">&rarr;</span>}
          </li>
        ))}
      </ol>
      {/* O-092 -- blocking multi-step modal: while the guide runs, a fixed
          backdrop swallows pointer interaction with the estimator beneath;
          the operator walks the steps and cannot edit until they finish or
          exit the walk. */}
      {wizardActive && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Guided setup"
          data-guided-modal="true"
        >
          <div className="w-full max-w-md rounded-sm border border-violet-200 bg-white p-4 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-violet-800 text-[13px]">
                Step {wizardStep + 1}/{steps.length}: {steps[wizardStep].label}
              </span>
              <span className={`ml-auto rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${steps[wizardStep].done ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                {steps[wizardStep].done ? "done" : "pending"}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-violet-700">{steps[wizardStep].hint}</p>
            <ol className="mt-2 flex items-center gap-1">
              {steps.map((s, i) => (
                <li key={s.label} className={`h-1.5 flex-1 rounded-sm ${i < wizardStep ? "bg-violet-500" : i === wizardStep ? "bg-violet-300" : "bg-gray-200"}`} title={s.label} />
              ))}
            </ol>
            <div className="mt-3 flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => onStepClick?.(steps[wizardStep].tab)}
                className="rounded-sm border border-violet-300 px-1.5 py-0.5 text-[10px] text-violet-700 hover:bg-violet-100"
              >Go to step</button>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setWizardStep(null)}
                className="rounded-sm border border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-600 hover:bg-gray-50"
              >Exit guide</button>
              <button
                type="button"
                onClick={() => setWizardStep((s) => (s ?? 0) - 1)}
                disabled={wizardStep === 0}
                className="rounded-sm border border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-600 disabled:opacity-40"
              >Back</button>
              <button
                type="button"
                onClick={() => setWizardStep((s) => (s ?? 0) + 1 >= steps.length ? null : (s ?? 0) + 1)}
                className="rounded-sm border border-violet-300 px-1.5 py-0.5 text-[10px] text-violet-700 hover:bg-violet-100"
              >{wizardStep + 1 >= steps.length ? "Finish" : "Next"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
