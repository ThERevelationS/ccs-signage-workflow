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

const OUTSTANDING_CLOSEOUT_STATUSES = new Set([
  "inspection_required",
  "inspection_scheduled",
  "inspection_failed",
  "inspection_passed",
]);

const ACTIVE_CORRECTION_STATUSES = new Set([
  "corrections_received",
  "working_corrections",
]);

function normalizedCloseoutStatus(line) {
  return String(line?.closeout_status || "").trim().toLowerCase();
}

export function getPermitLineHandoffReadiness(line, today = "") {
  const blockers = [];
  const reviews = [];
  const label = lineLabel(line);
  const todayKey = asDateKey(today);
  const closeoutStatus = normalizedCloseoutStatus(line);
  const inspectionDate = asDateKey(line?.inspection_date);
  const closeoutDate = asDateKey(line?.closeout_date);
  const feeStatus = String(line?.jurisdiction_fee_status || "").trim().toLowerCase();
  const feeAmount = line?.jurisdiction_fee_amount;
  const feePaidDate = asDateKey(line?.jurisdiction_fee_paid_date);
  const correctionStatus = String(line?.correction_status || "").trim().toLowerCase();
  const correctionsReceivedDate = asDateKey(line?.corrections_received_date);
  const resubmittedDate = asDateKey(line?.resubmitted_date);
  const submittedDate = asDateKey(line?.submitted_date);
  const approvalDate = asDateKey(line?.approval_date);
  const receivedDate = asDateKey(line?.permit_received_date);
  const expirationDate = asDateKey(line?.expiration_date);
  const permitReceived = !!receivedDate;
  const hasPermitIdentifier = !!String(line?.permit_number || line?.application_reference_number || "").trim();
  const lateLifecycle = line?.status === "completed" || permitReceived || !!closeoutStatus;

  if (feeStatus === "due") blockers.push(`${label} still has a jurisdiction fee recorded as due.`);

  if (line?.status === "completed" && !permitReceived) {
    reviews.push(`${label} is marked complete but has no permit issued/received date recorded.`);
  }
  if (submittedDate && approvalDate && approvalDate < submittedDate) {
    reviews.push(`${label} has an approval date before its submitted date.`);
  }
  if (submittedDate && receivedDate && receivedDate < submittedDate) {
    reviews.push(`${label} has a permit received date before its submitted date.`);
  }
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

  if (OUTSTANDING_CLOSEOUT_STATUSES.has(closeoutStatus)) {
    const closeoutLabels = {
      inspection_required: "still requires an inspection",
      inspection_scheduled: "still has a scheduled inspection to complete",
      inspection_failed: "has a failed inspection that still needs resolution",
      inspection_passed: "passed inspection but still needs final closeout",
    };
    blockers.push(`${label} ${closeoutLabels[closeoutStatus]}.`);
  }

  if (permitReceived && !hasPermitIdentifier) {
    reviews.push(`${label} was issued/received but has no permit or application/reference number recorded.`);
  }

  if (permitReceived && line?.status !== "completed" && closeoutStatus !== "closed_out") {
    reviews.push(`${label} was issued/received but the permit workflow line is still active.`);
  }
  if (submittedDate && !permitReceived && !asDateKey(line?.next_followup_date)) {
    reviews.push(`${label} was submitted but has no next follow-up scheduled.`);
  }

  if (typeof feeAmount === "number" && Number.isFinite(feeAmount) && feeAmount < 0) {
    reviews.push(`${label} has a negative jurisdiction fee amount.`);
  }
  if (typeof feeAmount === "number" && Number.isFinite(feeAmount) && feeAmount > 0 && !feeStatus) {
    reviews.push(`${label} has an actual jurisdiction fee recorded but no payment status.`);
  }
  if (feeStatus === "paid" && !feePaidDate) {
    reviews.push(`${label} is marked fee paid but has no paid date.`);
  }
  if (feePaidDate && feeStatus !== "paid") {
    const statusLabel = feeStatus || "not recorded";
    reviews.push(`${label} has a fee paid date but payment status is ${statusLabel}.`);
  }

  if (lateLifecycle && ACTIVE_CORRECTION_STATUSES.has(correctionStatus)) {
    blockers.push(`${label} still has active corrections recorded.`);
  }
  if ((correctionStatus === "corrections_received" || correctionStatus === "working_corrections") && !correctionsReceivedDate) {
    reviews.push(`${label} is in corrections but has no corrections received date.`);
  }
  if (correctionStatus === "resubmitted" && !resubmittedDate) {
    reviews.push(`${label} is marked resubmitted but has no resubmitted date.`);
  }
  if (correctionStatus === "resubmitted" && !correctionsReceivedDate) {
    reviews.push(`${label} is marked resubmitted but has no corrections received date.`);
  }
  if (submittedDate && correctionsReceivedDate && correctionsReceivedDate < submittedDate) {
    reviews.push(`${label} has a corrections received date before its submitted date.`);
  }
  if (correctionsReceivedDate && resubmittedDate && resubmittedDate < correctionsReceivedDate) {
    reviews.push(`${label} has a resubmitted date before its corrections received date.`);
  }

  if (closeoutStatus && !receivedDate) {
    reviews.push(`${label} has inspection/closeout tracking but no permit received date.`);
  }
  if (["inspection_scheduled", "inspection_failed", "inspection_passed"].includes(closeoutStatus) && !inspectionDate) {
    reviews.push(`${label} has an inspection state but no inspection date.`);
  }
  if (receivedDate && inspectionDate && inspectionDate < receivedDate) {
    reviews.push(`${label} has an inspection date before its permit received date.`);
  }
  if (closeoutStatus === "closed_out" && !closeoutDate) {
    reviews.push(`${label} is marked closed out but has no closeout date.`);
  }
  if (closeoutDate && closeoutStatus !== "closed_out") {
    const statusLabel = closeoutStatus || "not recorded";
    reviews.push(`${label} has a closeout date but closeout status is ${statusLabel}.`);
  }
  if (inspectionDate && closeoutDate && closeoutDate < inspectionDate) {
    reviews.push(`${label} has a closeout date before its inspection date.`);
  }
  if (receivedDate && closeoutDate && closeoutDate < receivedDate) {
    reviews.push(`${label} has a closeout date before its permit received date.`);
  }
  if (closeoutStatus === "closed_out" && line?.status !== "completed") {
    reviews.push(`${label} is marked closed out but the permit workflow line is not marked complete.`);
  }

  return {
    applicable: lateLifecycle || blockers.length > 0 || reviews.length > 0,
    blockers,
    reviews,
    issueCount: blockers.length + reviews.length,
    hasBlockers: blockers.length > 0,
    hasIssues: blockers.length > 0 || reviews.length > 0,
    isReady: lateLifecycle && blockers.length === 0 && reviews.length === 0,
  };
}

export function isPermitLineEffectivelyComplete(line) {
  if (line?.status !== "completed") return false;
  if (!asDateKey(line?.permit_received_date)) return false;
  if (OUTSTANDING_CLOSEOUT_STATUSES.has(normalizedCloseoutStatus(line))) return false;
  if (String(line?.jurisdiction_fee_status || "").trim().toLowerCase() === "due") return false;
  if (ACTIVE_CORRECTION_STATUSES.has(String(line?.correction_status || "").trim().toLowerCase())) return false;
  return true;
}

export function getPermitLineLifecycleSummary(line) {
  const closeoutStatus = normalizedCloseoutStatus(line);
  if (closeoutStatus === "closed_out") return { key: "closed_out", label: "Closed out", shortLabel: "Closed out", tone: "success" };
  if (closeoutStatus === "inspection_failed") return { key: "inspection_failed", label: "Inspection failed", shortLabel: "Inspection failed", tone: "danger" };
  if (closeoutStatus === "inspection_passed") return { key: "inspection_passed", label: "Inspection passed · closeout needed", shortLabel: "Inspection passed", tone: "info" };
  if (closeoutStatus === "inspection_scheduled") return { key: "inspection_scheduled", label: "Inspection scheduled", shortLabel: "Inspection scheduled", tone: "info" };
  if (closeoutStatus === "inspection_required") return { key: "inspection_required", label: "Inspection needed", shortLabel: "Inspection needed", tone: "warning" };

  if (asDateKey(line?.permit_received_date)) return { key: "permit_issued", label: "Permit issued", shortLabel: "Permit issued", tone: "success" };
  if (asDateKey(line?.approval_date)) return { key: "approved", label: "Approved", shortLabel: "Approved", tone: "success" };

  const correctionStatus = String(line?.correction_status || "").trim().toLowerCase();
  if (correctionStatus === "corrections_received" || correctionStatus === "working_corrections") {
    return { key: "corrections", label: "Corrections", shortLabel: "Corrections", tone: "warning" };
  }
  if (correctionStatus === "resubmitted") return { key: "resubmitted", label: "Resubmitted", shortLabel: "Resubmitted", tone: "info" };
  if (asDateKey(line?.submitted_date)) return { key: "submitted", label: "Submitted", shortLabel: "Submitted", tone: "info" };
  return { key: "pre_submission", label: "Not submitted yet", shortLabel: "Not sent", tone: "neutral" };
}

const PERMIT_LIFECYCLE_PROGRESS_ORDER = [
  "pre_submission",
  "submitted",
  "corrections",
  "resubmitted",
  "approved",
  "permit_issued",
  "inspection_required",
  "inspection_scheduled",
  "inspection_failed",
  "inspection_passed",
  "closed_out",
];

export function getPermitGroupProgress(group, today = "") {
  const lines = Array.isArray(group?.lines) ? group.lines : [];
  const stagesByKey = new Map();
  let completedCount = 0;
  let handoffApplicableCount = 0;
  let handoffReadyCount = 0;
  let handoffIssueCount = 0;
  let handoffBlockedCount = 0;

  lines.forEach((line) => {
    if (isPermitLineEffectivelyComplete(line)) completedCount += 1;

    const lifecycle = getPermitLineLifecycleSummary(line);
    const current = stagesByKey.get(lifecycle.key);
    if (current) current.count += 1;
    else stagesByKey.set(lifecycle.key, { ...lifecycle, count: 1 });

    const handoff = getPermitLineHandoffReadiness(line, today);
    if (handoff.applicable) {
      handoffApplicableCount += 1;
      if (handoff.isReady) handoffReadyCount += 1;
      if (handoff.hasIssues) handoffIssueCount += 1;
      if (handoff.hasBlockers) handoffBlockedCount += 1;
    }
  });

  const lifecycleStages = PERMIT_LIFECYCLE_PROGRESS_ORDER
    .map((key) => stagesByKey.get(key))
    .filter(Boolean);

  return {
    totalCount: lines.length,
    completedCount,
    activeCount: Math.max(0, lines.length - completedCount),
    lifecycleStages,
    handoffApplicableCount,
    handoffReadyCount,
    handoffIssueCount,
    handoffBlockedCount,
  };
}

export function getPermitLineLifecycleReviews(line, today) {
  const reviews = [];
  const label = lineLabel(line);
  const todayKey = asDateKey(today);
  const submittedDate = asDateKey(line?.submitted_date);
  const approvalDate = asDateKey(line?.approval_date);
  const receivedDate = asDateKey(line?.permit_received_date);
  const expirationDate = asDateKey(line?.expiration_date);
  const feeStatus = String(line?.jurisdiction_fee_status || "").trim().toLowerCase();
  const feePaidDate = asDateKey(line?.jurisdiction_fee_paid_date);
  const feeAmount = line?.jurisdiction_fee_amount;
  const correctionStatus = String(line?.correction_status || "").trim().toLowerCase();
  const correctionsReceivedDate = asDateKey(line?.corrections_received_date);
  const resubmittedDate = asDateKey(line?.resubmitted_date);
  const closeoutStatus = normalizedCloseoutStatus(line);
  const inspectionDate = asDateKey(line?.inspection_date);
  const closeoutDate = asDateKey(line?.closeout_date);

  if (line?.status === "completed" && !receivedDate) {
    reviews.push(`${label} is marked complete but has no permit received date.`);
  }
  if (submittedDate && approvalDate && approvalDate < submittedDate) {
    reviews.push(`${label} has an approval date before its submitted date.`);
  }
  if (submittedDate && receivedDate && receivedDate < submittedDate) {
    reviews.push(`${label} has a permit received date before its submitted date.`);
  }
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

  if (typeof feeAmount === "number" && Number.isFinite(feeAmount) && feeAmount < 0) {
    reviews.push(`${label} has a negative jurisdiction fee amount.`);
  }
  if (feeStatus === "paid" && !feePaidDate) {
    reviews.push(`${label} is marked fee paid but has no paid date.`);
  }
  if (feePaidDate && feeStatus !== "paid") {
    const statusLabel = feeStatus || "not recorded";
    reviews.push(`${label} has a fee paid date but payment status is ${statusLabel}.`);
  }

  if ((correctionStatus === "corrections_received" || correctionStatus === "working_corrections") && !correctionsReceivedDate) {
    reviews.push(`${label} is in corrections but has no corrections received date.`);
  }
  if (correctionStatus === "resubmitted" && !resubmittedDate) {
    reviews.push(`${label} is marked resubmitted but has no resubmitted date.`);
  }
  if (correctionStatus === "resubmitted" && !correctionsReceivedDate) {
    reviews.push(`${label} is marked resubmitted but has no corrections received date.`);
  }
  if (submittedDate && correctionsReceivedDate && correctionsReceivedDate < submittedDate) {
    reviews.push(`${label} has a corrections received date before its submitted date.`);
  }
  if (correctionsReceivedDate && resubmittedDate && resubmittedDate < correctionsReceivedDate) {
    reviews.push(`${label} has a resubmitted date before its corrections received date.`);
  }

  if (closeoutStatus && !receivedDate) {
    reviews.push(`${label} has inspection/closeout tracking but no permit received date.`);
  }
  if (["inspection_scheduled", "inspection_failed", "inspection_passed"].includes(closeoutStatus) && !inspectionDate) {
    reviews.push(`${label} has an inspection state but no inspection date.`);
  }
  if (receivedDate && inspectionDate && inspectionDate < receivedDate) {
    reviews.push(`${label} has an inspection date before its permit received date.`);
  }
  if (closeoutStatus === "closed_out" && !closeoutDate) {
    reviews.push(`${label} is marked closed out but has no closeout date.`);
  }
  if (closeoutDate && closeoutStatus !== "closed_out") {
    const statusLabel = closeoutStatus || "not recorded";
    reviews.push(`${label} has a closeout date but closeout status is ${statusLabel}.`);
  }
  if (inspectionDate && closeoutDate && closeoutDate < inspectionDate) {
    reviews.push(`${label} has a closeout date before its inspection date.`);
  }
  if (receivedDate && closeoutDate && closeoutDate < receivedDate) {
    reviews.push(`${label} has a closeout date before its permit received date.`);
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
  const openLines = lines.filter((line) => !isPermitLineEffectivelyComplete(line));
  const blockers = [];
  const reviews = lines.flatMap((line) => getPermitLineLifecycleReviews(line, today));
  const handoffReadiness = lines.map((line) => getPermitLineHandoffReadiness(line));
  handoffReadiness.forEach((handoff) => {
    blockers.push(...handoff.blockers);
    reviews.push(...handoff.reviews);
  });

  if (lines.length === 0) blockers.push("Permit workflow has not been configured yet.");

  openLines.forEach((line) => {
    const label = lineLabel(line);
    if (!String(line?.locality_id || line?.locality_name || "").trim()) blockers.push(`${label} is missing its locality.`);
    if (!Array.isArray(line?.steps) || line.steps.length === 0) blockers.push(`${label} has no workflow steps configured.`);
    if (line?.submitted_date && !line?.permit_received_date && !asDateKey(line?.next_followup_date)) reviews.push(`${label} was submitted but has no next follow-up scheduled.`);
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
    description: "Pick which town or office to file with",
    className: "border-violet-200 bg-violet-50 text-violet-800",
  },
  overdue: {
    label: "Overdue",
    shortLabel: "Overdue",
    description: "A follow-up is late — call or check now",
    className: "border-red-200 bg-red-50 text-red-800",
  },
  due_today: {
    label: "Due Today",
    shortLabel: "Today",
    description: "Follow up today",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  needs_action: {
    label: "Needs Action",
    shortLabel: "Action",
    description: "Needs your next step — nothing scheduled",
    className: "border-blue-200 bg-blue-50 text-blue-800",
  },
  waiting: {
    label: "Waiting",
    shortLabel: "Waiting",
    description: "Waiting — next check-in is scheduled",
    className: "border-slate-200 bg-slate-50 text-slate-700",
  },
  completed: {
    label: "Completed",
    shortLabel: "Done",
    description: "All done",
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

  const openLines = lines.filter((line) => !isPermitLineEffectivelyComplete(line));
  if (openLines.length === 0) {
    return {
      key: "completed",
      nextAction: "Permit workflow complete.",
      followupDate: "",
      timingLabel: "Complete",
      urgencyDays: null,
    };
  }

  const setupLine = openLines.find((line) => !String(line?.locality_id || line?.locality_name || "").trim() || !Array.isArray(line?.steps) || line.steps.length === 0);
  if (setupLine) {
    const missingLocality = !String(setupLine?.locality_id || setupLine?.locality_name || "").trim();
    const missingWorkflow = !Array.isArray(setupLine?.steps) || setupLine.steps.length === 0;
    return {
      key: "needs_setup",
      nextAction: missingLocality && missingWorkflow
        ? `Select the locality and workflow for ${lineLabel(setupLine)}.`
        : missingLocality
          ? `Select the locality for ${lineLabel(setupLine)}.`
          : `Configure the permit workflow steps for ${lineLabel(setupLine)}.`,
      followupDate: "",
      timingLabel: "Setup needed",
      urgencyDays: null,
    };
  }

  const storedCompletionConflictLine = openLines.find((line) => line?.status === "completed");
  if (storedCompletionConflictLine) {
    return {
      key: "needs_action",
      nextAction: `Reopen ${lineLabel(storedCompletionConflictLine)} before continuing its recorded permit work.`,
      followupDate: "",
      timingLabel: "Completion needs repair",
      urgencyDays: null,
      actionPriority: 5,
    };
  }

  const feeDueLine = openLines.find((line) => String(line?.jurisdiction_fee_status || "").trim().toLowerCase() === "due");
  if (feeDueLine) {
    return {
      key: "needs_action",
      nextAction: `Resolve the recorded jurisdiction fee due for ${lineLabel(feeDueLine)}.`,
      followupDate: "",
      timingLabel: "Fee due",
      urgencyDays: null,
      actionPriority: 10,
    };
  }

  const failedInspectionLine = openLines.find((line) => normalizedCloseoutStatus(line) === "inspection_failed");
  if (failedInspectionLine) {
    return {
      key: "needs_action",
      nextAction: `Resolve the failed inspection items for ${lineLabel(failedInspectionLine)} and prepare for reinspection.`,
      followupDate: "",
      timingLabel: "Inspection failed",
      urgencyDays: null,
      actionPriority: 20,
    };
  }

  const inspectionRequiredLine = openLines.find((line) => normalizedCloseoutStatus(line) === "inspection_required");
  if (inspectionRequiredLine) {
    return {
      key: "needs_action",
      nextAction: `Schedule the required inspection for ${lineLabel(inspectionRequiredLine)}.`,
      followupDate: "",
      timingLabel: "Inspection needed",
      urgencyDays: null,
      actionPriority: 30,
    };
  }

  const inspectionScheduledLine = openLines.find((line) => normalizedCloseoutStatus(line) === "inspection_scheduled");
  if (inspectionScheduledLine) {
    const inspectionDate = asDateKey(inspectionScheduledLine?.inspection_date);
    if (!inspectionDate) {
      return {
        key: "needs_action",
        nextAction: `Record the scheduled inspection date for ${lineLabel(inspectionScheduledLine)}.`,
        followupDate: "",
        timingLabel: "Inspection date needed",
        urgencyDays: null,
        actionPriority: 40,
      };
    }
    const daysUntilInspection = todayKey ? daysBetween(todayKey, inspectionDate) : null;
    if (todayKey && inspectionDate < todayKey) {
      const daysPast = Math.abs(daysUntilInspection || 0);
      return {
        key: "overdue",
        nextAction: `Confirm the inspection outcome for ${lineLabel(inspectionScheduledLine)}.`,
        followupDate: inspectionDate,
        timingLabel: `${pluralDays(daysPast)} past inspection date · ${formatDateKey(inspectionDate)}`,
        urgencyDays: -daysPast,
      };
    }
    if (todayKey && inspectionDate === todayKey) {
      return {
        key: "due_today",
        nextAction: `Inspection is scheduled today for ${lineLabel(inspectionScheduledLine)}.`,
        followupDate: inspectionDate,
        timingLabel: `Inspection today · ${formatDateKey(inspectionDate)}`,
        urgencyDays: 0,
      };
    }
    return {
      key: "waiting",
      nextAction: `Inspection is scheduled for ${formatDateKey(inspectionDate)} for ${lineLabel(inspectionScheduledLine)}.`,
      followupDate: inspectionDate,
      timingLabel: daysUntilInspection !== null
        ? `Inspection in ${pluralDays(daysUntilInspection)} · ${formatDateKey(inspectionDate)}`
        : `Inspection scheduled · ${formatDateKey(inspectionDate)}`,
      urgencyDays: daysUntilInspection,
    };
  }

  const inspectionPassedLine = openLines.find((line) => normalizedCloseoutStatus(line) === "inspection_passed");
  if (inspectionPassedLine) {
    return {
      key: "needs_action",
      nextAction: `Complete permit closeout for ${lineLabel(inspectionPassedLine)}.`,
      followupDate: "",
      timingLabel: "Inspection passed",
      urgencyDays: null,
      actionPriority: 50,
    };
  }

  const receivedButOpenLine = openLines.find((line) => asDateKey(line?.permit_received_date));
  if (receivedButOpenLine) {
    return {
      key: "needs_action",
      nextAction: `Review the issued permit for ${lineLabel(receivedButOpenLine)} and mark the workflow line complete when its recorded obligations are finished.`,
      followupDate: "",
      timingLabel: "Permit received",
      urgencyDays: null,
      actionPriority: 60,
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

  const correctionLine = openLines.find((line) => ["corrections_received", "working_corrections"].includes(String(line?.correction_status || "").trim().toLowerCase()));
  if (correctionLine) {
    return {
      key: "needs_action",
      nextAction: `Address corrections for ${lineLabel(correctionLine)} and prepare the resubmission.`,
      followupDate: "",
      timingLabel: "Corrections need action",
      urgencyDays: null,
      actionPriority: 70,
    };
  }

  const lineWithoutFutureFollowup = openLines.find((line) => !asDateKey(line?.next_followup_date));
  if (lineWithoutFutureFollowup) {
    const correctionStatus = String(lineWithoutFutureFollowup?.correction_status || "").trim().toLowerCase();
    const nextStep = firstIncompleteStep(lineWithoutFutureFollowup);
    const hasApproval = !!asDateKey(lineWithoutFutureFollowup?.approval_date);
    const hasSubmission = !!asDateKey(lineWithoutFutureFollowup?.submitted_date);
    return {
      key: "needs_action",
      nextAction: correctionStatus === "resubmitted"
        ? `Schedule or complete the next follow-up for the resubmitted ${lineLabel(lineWithoutFutureFollowup)} permit.`
        : hasApproval
          ? `Record the issued permit when received, or schedule the next follow-up for ${lineLabel(lineWithoutFutureFollowup)}.`
          : hasSubmission
            ? `Schedule the next follow-up for the submitted ${lineLabel(lineWithoutFutureFollowup)} permit.`
            : nextStep?.name
              ? `${nextStep.name} — ${lineLabel(lineWithoutFutureFollowup)}`
              : `Continue the ${lineLabel(lineWithoutFutureFollowup)} workflow.`,
      followupDate: "",
      timingLabel: "Needs next action",
      urgencyDays: null,
      actionPriority: correctionStatus === "resubmitted" ? 80 : hasApproval ? 90 : hasSubmission ? 100 : 110,
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
  const aPriority = Number.isFinite(aState.actionPriority) ? aState.actionPriority : Number.POSITIVE_INFINITY;
  const bPriority = Number.isFinite(bState.actionPriority) ? bState.actionPriority : Number.POSITIVE_INFINITY;
  if (aPriority !== bPriority) return aPriority - bPriority;
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
