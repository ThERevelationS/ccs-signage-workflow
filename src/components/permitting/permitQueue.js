function asDateKey(value) {
  return String(value || "").trim().slice(0, 10);
}

function isStepComplete(step, steps) {
  if (!step) return true;
  if (step.tied_to_step_id) {
    const tied = (steps || []).find((candidate) => candidate?.id === step.tied_to_step_id);
    if (tied?.checked) return true;
  }
  if (step.type === "checkbox") return !!step.checked;
  return !!String(step.value || "").trim();
}

function firstIncompleteStep(line) {
  const steps = Array.isArray(line?.steps) ? line.steps : [];
  return steps.find((step) => !isStepComplete(step, steps)) || null;
}

function lineLabel(line) {
  return String(line?.row_name || line?.office_type || line?.locality_name || "permit").trim();
}

export const PERMIT_QUEUE_META = {
  needs_setup: {
    label: "Needs Setup",
    shortLabel: "Setup",
    description: "Locality/workflow still needs to be selected",
    className: "border-violet-200 bg-violet-50 text-violet-800",
  },
  overdue: {
    label: "Overdue",
    shortLabel: "Overdue",
    description: "Follow-up date has passed",
    className: "border-red-200 bg-red-50 text-red-800",
  },
  due_today: {
    label: "Due Today",
    shortLabel: "Today",
    description: "Follow-up is due today",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  needs_action: {
    label: "Needs Action",
    shortLabel: "Action",
    description: "Active permit work with no future follow-up holding it",
    className: "border-blue-200 bg-blue-50 text-blue-800",
  },
  waiting: {
    label: "Waiting",
    shortLabel: "Waiting",
    description: "Waiting for a future follow-up date",
    className: "border-slate-200 bg-slate-50 text-slate-700",
  },
  completed: {
    label: "Completed",
    shortLabel: "Done",
    description: "All permit lines are complete",
    className: "border-green-200 bg-green-50 text-green-800",
  },
};

export const PERMIT_QUEUE_ORDER = [
  "needs_setup",
  "overdue",
  "due_today",
  "needs_action",
  "waiting",
  "completed",
];

export function getPermitGroupQueueState(group, today) {
  const lines = Array.isArray(group?.lines) ? group.lines : [];
  const todayKey = asDateKey(today);

  if (lines.length === 0) {
    return {
      key: "needs_setup",
      nextAction: "Select the locality and create the permit workflow.",
      followupDate: "",
    };
  }

  const openLines = lines.filter((line) => line?.status !== "completed");
  if (openLines.length === 0) {
    return {
      key: "completed",
      nextAction: "Permit workflow complete.",
      followupDate: "",
    };
  }

  const followups = openLines
    .map((line) => ({ line, date: asDateKey(line?.next_followup_date) }))
    .filter((row) => row.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const overdue = todayKey ? followups.find((row) => row.date < todayKey) : null;
  if (overdue) {
    return {
      key: "overdue",
      nextAction: `Follow up with ${lineLabel(overdue.line)} now.`,
      followupDate: overdue.date,
    };
  }

  const dueToday = todayKey ? followups.find((row) => row.date === todayKey) : null;
  if (dueToday) {
    return {
      key: "due_today",
      nextAction: `Follow up with ${lineLabel(dueToday.line)} today.`,
      followupDate: dueToday.date,
    };
  }

  const lineWithoutFutureFollowup = openLines.find((line) => !asDateKey(line?.next_followup_date));
  if (lineWithoutFutureFollowup) {
    const nextStep = firstIncompleteStep(lineWithoutFutureFollowup);
    return {
      key: "needs_action",
      nextAction: nextStep?.name
        ? `${nextStep.name} — ${lineLabel(lineWithoutFutureFollowup)}`
        : `Continue the ${lineLabel(lineWithoutFutureFollowup)} workflow.`,
      followupDate: "",
    };
  }

  const nextFuture = followups[0];
  return {
    key: "waiting",
    nextAction: nextFuture
      ? `Waiting until ${nextFuture.date} to follow up with ${lineLabel(nextFuture.line)}.`
      : "Waiting on the next permit milestone.",
    followupDate: nextFuture?.date || "",
  };
}

export function summarizePermitQueue(groups, today) {
  const summary = Object.fromEntries(PERMIT_QUEUE_ORDER.map((key) => [key, []]));
  (Array.isArray(groups) ? groups : []).forEach((group) => {
    const state = getPermitGroupQueueState(group, today);
    summary[state.key].push({ ...group, queueState: state });
  });
  return summary;
}
