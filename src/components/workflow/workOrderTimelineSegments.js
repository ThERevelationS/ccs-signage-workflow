// Builds the dated "portions" of a work order for the Main Workflow Gantt
// visualizer. Each portion (the whole-job due date, a rider, a task, or a
// Sales Pipeline milestone date) becomes its own bar when it has a due date.
// A work order with no dated portions produces an empty list and is hidden
// from the visualizer.

const stageColors = {
  estimating: "#FFF9C4",
  sales: "#B2DFDB",
  permitting: "#FFE4D6",
  design: "#D4E9F7",
  production: "#C8F4E9",
  fabrication: "#FFD6E8",
  installation: "#E0D4F7",
};

const stageNames = {
  estimating: "Estimating",
  sales: "Sales",
  permitting: "Permitting",
  design: "Design",
  production: "Production",
  fabrication: "Fabrication",
  installation: "Installation",
};

// Sales Pipeline / lifecycle date fields on the WorkOrder. Each becomes its
// own bar when set, so the workflow visualizer reflects every dated milestone.
const SALES_DATE_FIELDS = [
  { field: "date_initial_contact", label: "Initial Contact", stage: "sales" },
  { field: "site_survey_date", label: "Site Survey", stage: "design" },
  { field: "date_estimate_sent", label: "Estimate Sent", stage: "estimating" },
  { field: "date_order_created", label: "Order Created", stage: "production" },
  { field: "permit_submitted_date", label: "Permit Submitted", stage: "permitting" },
  { field: "permit_receipt_confirmed_date", label: "Permit Receipt", stage: "permitting" },
  { field: "permit_approved_date", label: "Permit Approved", stage: "permitting" },
  { field: "project_install_date", label: "Installation", stage: "installation" },
  { field: "follow_up_date", label: "Follow Up", stage: "sales" },
  { field: "expected_close_date", label: "Expected Close", stage: "sales" },
  { field: "close_date", label: "Close", stage: "sales" },
];

function isSet(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function truncate(text, max) {
  const str = String(text || "");
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

export function buildWorkOrderSegments(workOrder) {
  if (!workOrder) return [];
  const segments = [];

  // Top-level workflow due date (the whole-job bar).
  if (isSet(workOrder.due_date)) {
    segments.push({
      id: `${workOrder.id}__main`,
      kind: "main",
      label: stageNames[workOrder.current_stage] || "Job",
      stage: workOrder.current_stage || "estimating",
      color: stageColors[workOrder.current_stage] || stageColors.estimating,
      start: workOrder.start_date || workOrder.created_date,
      due: workOrder.due_date,
      record: workOrder,
    });
  }

  // Sales Pipeline / lifecycle milestone dates.
  for (const def of SALES_DATE_FIELDS) {
    const value = workOrder[def.field];
    if (isSet(value)) {
      segments.push({
        id: `${workOrder.id}__${def.field}`,
        kind: "milestone",
        label: def.label,
        stage: def.stage,
        color: stageColors[def.stage] || stageColors.estimating,
        start: value,
        due: value,
        record: workOrder,
      });
    }
  }

  // Tasks (notes) with due dates.
  const notes = Array.isArray(workOrder.notes) ? workOrder.notes : [];
  for (const note of notes) {
    if (isSet(note.due_date)) {
      segments.push({
        id: `${workOrder.id}__task_${note.id || truncate(note.text, 20)}`,
        kind: "task",
        label: note.text ? truncate(note.text, 40) : "Task",
        stage: workOrder.current_stage || "estimating",
        color: stageColors[workOrder.current_stage] || stageColors.estimating,
        start: note.start_date || note.due_date,
        due: note.due_date,
        record: workOrder,
      });
    }
  }

  // Riders with due dates.
  const riders = Array.isArray(workOrder.riders) ? workOrder.riders : [];
  for (const rider of riders) {
    if (isSet(rider.due_date)) {
      segments.push({
        id: `${rider.id}__rider`,
        kind: "rider",
        label: stageNames[rider.rider_stage || rider.current_stage] || "Rider",
        stage: rider.rider_stage || rider.current_stage || "estimating",
        color: stageColors[rider.rider_stage || rider.current_stage] || stageColors.estimating,
        start: rider.start_date || rider.created_date,
        due: rider.due_date,
        record: rider,
      });
    }
  }

  return segments;
}

export function hasAnyTimelineSegment(workOrder) {
  return buildWorkOrderSegments(workOrder).length > 0;
}

export function earliestSegmentDue(workOrder) {
  const segments = buildWorkOrderSegments(workOrder);
  let min = Infinity;
  for (const seg of segments) {
    const t = new Date(seg.due).getTime();
    if (!Number.isNaN(t) && t < min) min = t;
  }
  if (min === Infinity && workOrder.updated_date) {
    const t = new Date(workOrder.updated_date).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return min;
}

export { stageColors, stageNames };