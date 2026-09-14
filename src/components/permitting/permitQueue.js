function asDateKey(value) {
  return String(value || "").trim().slice(0, 10);
}

function dayNumber(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asDateKey(dateKey));
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
}

function daysBetween(fromDate, toDate) {
  const from = dayNumber(fromDate);
  const to = dayNumber(toDate);
  if (from === null || to === null) return null;
  return to - from;
}

function formatDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asDateKey(dateKey));
  if (!match) return "";
  return `${Number(match[2])}/${Number(match[3])}/${match[1]}`;
}

function pluralDays(count) {
  return `${count} day${count === 1 ? "" : "s"}`;
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

function normalizedAssignment(value) {
  return String(value || "").trim().toLowerCase();
}

export function getPermitLineLifecycleReviews(line, today) {
  const reviews = [];
  const label = lineLabel(line);
  const todayKey = asDateKey(today);
  const approvalDate = asDateKey(line?.approval_date);
  const receivedDate = asDateKey(line?.permit_received_date);
  const expirationDate = asDateKey(line?.expiration_date);

  if (approvalDate && receivedDate && receivedDate < approvalDate) {
    reviews.push(`${label} has a permit received date before its approval date.`);
  }

  const latestLifecycleDate = [approvalDate, receivedDate].filter(Boolean).sort().pop() || "";
  if (expirationDate && latestLifecycleDate && expirationDate < latestLifecycleDate) {
    reviews.push(`${label} has an expiration date before its recorded approval/permit received date.`);
  }

  if (expirationDate && todayKey) {
    if (expirationDate < todayKey) {
      reviews.push(`${label} expired on ${formatDateKey(expirationDate)}.`);
    } else if (expirationDate === todayKey) {
      reviews.push(`${label} expires today (${formatDateKey(expirationDate)}).`);
    } else {
      const daysUntilExpiration = daysBetween(todayKey, expirationDate);
      if (daysUntilExpiration !== null && daysUntilExpiration <= 30) {
        reviews.push(`${label} expires in ${pluralDays(daysUntilExpiration)} (${formatDateKey(expirationDate)}).`);
      }
    }
  }

  return reviews;
}

export function isPermitGroupAssignedToUser(group, user) {
  const identities = [user?.full_name, user?.email]
    .map(normalizedAssignment)
    .filter(Boolean);
  if (identities.length === 0) return false;

  const assignments = [
    group?.work_order?.current_task_assigned_to,
    group?.work_order?.assigned_to,
    ...(Array.isArray(group?.lines) ? group.lines.map((line) => line?.assigned_to) : []),
  ].map(normalizedAssignment).filter(Boolean);

  return assignments.some((assignment) => identities.includes(assignment));
}

export function getPermitGroupReadiness(group, today = "") {
  const wo = group?.work_order || {};
  const lines = Array.isArray(group?.lines) ? group.lines : [];
  const openLines = lines.filter((line) => line?.status !== "completed");
  const blockers = [];
  const reviews = lines.flatMap((line) => getPermitLineLifecycleReviews(line, today));

  if (lines.length === 0) blockers.push("Permit workflow has not been configured yet.");

  openLines.forEach((line) => {
    const label = lineLabel(line);
    if (!String(line?.locality_id || line?.locality_name || "").trim()) blockers.push(`${label} is missing its locality.`);
    if (!Array.isArray(line?.steps) || line.steps.length === 0) blockers.push(`${label} has no workflow steps configured.`);
    if (line?.submitted_date && !asDateKey(line?.next_followup_date)) reviews.push(`${label} was submitted but has no next follow-up scheduled.`);
    if (line?.permit_received_date && line?.status !== "completed") reviews.push(`${label} has a permit received date but is not marked complete.`);
  });

  const hasOwner = [
    wo?.current_task_assigned_to,
    wo?.assigned_to,
    ...openLines.map((line) => line?.assigned_to),
  ].some((value) => normalizedAssignment(value));
  if (openLines.length > 0 && !hasOwner) reviews.push("No responsible person is assigned to this permitting job.");

  if (wo?._permittingRoutingMismatch) {
    reviews.push(wo._permittingRoutingWarning || "Work Order stage and Permitting task routing do not agree.");
  }

  const uniqueBlockers = [...new Set(blockers)];
  const uniqueReviews = [...new Set(reviews)];
  return {
    blockers: uniqueBlockers,
    reviews: uniqueReviews,
    issueCount: uniqueBlockers.length + uniqueReviews.length,
    hasBlockers: uniqueBlockers.length > 0,
    hasIssues: uniqueBlockers.length > 0 || uniqueReviews.length > 0,
  };
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
      timingLabel: "Not configured",
      urgencyDays: null,
    };
  }

  const openLines = lines.filter((line) => line?.status !== "completed");
  if (openLines.length === 0) {
    return {
      key: "completed",
      nextAction: "Permit workflow complete.",
      followupDate: "",
      timingLabel: "Complete",
      urgencyDays: null,
    };
  }

  const followups = openLines
    .map((line) => ({ line, date: asDateKey(line?.next_followup_date) }))
    .filter((row) => row.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const overdue = todayKey ? followups.find((row) => row.date < todayKey) : null;
  if (overdue) {
    const daysOverdue = Math.abs(daysBetween(todayKey, overdue.date) || 0);
    return {
      key: "overdue",
      nextAction: `Follow up with ${lineLabel(overdue.line)} now.`,
      followupDate: overdue.date,
      timingLabel: `${pluralDays(daysOverdue)} overdue · ${formatDateKey(overdue.date)}`,
      urgencyDays: -daysOverdue,
    };
  }

  const dueToday = todayKey ? followups.find((row) => row.date === todayKey) : null;
  if (dueToday) {
    return {
      key: "due_today",
      nextAction: `Follow up with ${lineLabel(dueToday.line)} today.`,
      followupDate: dueToday.date,
      timingLabel: `Due today · ${formatDateKey(dueToday.date)}`,
      urgencyDays: 0,
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
      timingLabel: "Needs next action",
      urgencyDays: null,
    };
  }

  const nextFuture = followups[0];
  const daysUntil = nextFuture && todayKey ? daysBetween(todayKey, nextFuture.date) : null;
  return {
    key: "waiting",
    nextAction: nextFuture
      ? `Waiting until ${formatDateKey(nextFuture.date)} to follow up with ${lineLabel(nextFuture.line)}.`
      : "Waiting on the next permit milestone.",
    followupDate: nextFuture?.date || "",
    timingLabel: nextFuture && daysUntil !== null
      ? `Follow up in ${pluralDays(daysUntil)} · ${formatDateKey(nextFuture.date)}`
      : "Waiting",
    urgencyDays: daysUntil,
  };
}

function queueSort(a, b) {
  const aState = a?.queueState || {};
  const bState = b?.queueState || {};
  if (aState.followupDate && bState.followupDate && aState.followupDate !== bState.followupDate) {
    return aState.followupDate.localeCompare(bState.followupDate);
  }
  if (aState.followupDate && !bState.followupDate) return -1;
  if (!aState.followupDate && bState.followupDate) return 1;
  const aName = String(a?.work_order?.client_name || a?.work_order?.title || "");
  const bName = String(b?.work_order?.client_name || b?.work_order?.title || "");
  return aName.localeCompare(bName);
}

export function summarizePermitQueue(groups, today) {
  const summary = Object.fromEntries(PERMIT_QUEUE_ORDER.map((key) => [key, []]));
  (Array.isArray(groups) ? groups : []).forEach((group) => {
    const state = getPermitGroupQueueState(group, today);
    const readiness = getPermitGroupReadiness(group, today);
    summary[state.key].push({ ...group, queueState: state, readiness });
  });
  PERMIT_QUEUE_ORDER.forEach((key) => summary[key].sort(queueSort));
  return summary;
}
