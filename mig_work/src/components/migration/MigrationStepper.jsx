import * as React from "react";
import { Check, CircleDot } from "lucide-react";

import { cn } from "@/lib/utils";
import { WIZARD_STEPS, wizardStepIndex } from "./migrationModel";

// Wizard stepper: Upload -> Map -> Dry run -> Import -> Report. Steps before
// the current one are checkmarked and clickable (Back navigation); steps
// ahead are locked because each depends on the previous step's server output
// (preview -> dry run -> live run -> report).
export function MigrationStepper({ current, maxReached, onSelect }) {
  const currentIndex = wizardStepIndex(current);
  const reached = Math.max(wizardStepIndex(maxReached), currentIndex);
  return (
    <ol className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
      {WIZARD_STEPS.map((step, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "active" : "pending";
        const reachable = i <= reached;
        return (
          <li key={step.key} className="flex items-center">
            {i > 0 && <span className="mx-1.5 h-px w-4 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />}
            <button
              type="button"
              disabled={!reachable || i === currentIndex}
              onClick={() => reachable && onSelect?.(step.key)}
              data-step={step.key}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                state === "active" && "bg-violet-600 text-white",
                state === "done" && "text-slate-700 hover:bg-violet-50 dark:text-slate-200 dark:hover:bg-slate-800",
                state === "pending" && "text-slate-400 dark:text-slate-500",
                (!reachable || i === currentIndex) && "cursor-default"
              )}
            >
              {state === "done" ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : state === "active" ? (
                <CircleDot className="h-3.5 w-3.5" />
              ) : (
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-300 text-[9px] dark:border-slate-600">
                  {i + 1}
                </span>
              )}
              {step.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
