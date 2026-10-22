import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";
import { authenticateSignShopSession } from "../../shared/signShopSession.ts";
import {
  createFoundationRecordWithRecovery,
  expectedFoundationFields,
  replaceFoundationFieldsIfUnchanged,
  replaceEstimatingRequestFieldsIfUnchanged,
} from "../../shared/opportunityFoundationPersistence.mjs";

const clean = (value: any) => String(value ?? "").trim();

const STAGES = ["new", "qualified", "estimating", "quoted", "follow_up", "on_hold", "won", "lost"];
const CLOSED_STAGES = new Set(["won", "lost"]);
const REQUIREMENT_VALUES = ["unknown", "yes", "no", "maybe", "na"];
const PRIORITIES = ["low", "normal", "high", "rush"];
const SOURCE_TYPES = [
  "manual", "existing_customer", "phone", "email", "website",
  "smartsheet", "repeat_customer", "walk_in", "historical", "integration",
];
const OPEN_REQUEST_STATUSES = new Set(["draft", "ready", "in_progress"]);

const REQUIREMENT_FIELDS = [
  "survey_requirement", "permit_requirement", "installation_requirement",
  "removal_requirement", "electrical_requirement",
];

const EDITABLE_OPPORTUNITY_FIELDS = [
  "title", "job_description", "customer_display_name", "customer_id",
  "contact_id", "location_id",
  "stage", "lost_reason",
  "salesperson", "lead_source", "origination",
  "budget_amount", "budget_note",
  "desired_completion_date", "desired_install_date", "priority",
  ...REQUIREMENT_FIELDS,
  "electrical_details", "property_relationship",
  "next_action", "next_action_due", "next_action_assignee", "notes",
];

const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { statusCode: status });

function requireEnum(value: any, allowed: string[], label: string) {
  const v = clean(value);
  if (!v) return "";
  if (!allowed.includes(v)) throw bad(`${label} must be one of ${allowed.join(", ")}.`);
  return v;
}

function pick(source: any, keys: string[]) {
  const out: any = {};
  for (const key of keys) {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
  }
  return out;
}

function expectedFor(baseline: any, current: any, desired: any) {
  const expected: any = {};
  for (const key of Object.keys(desired)) {
    expected[key] = baseline && Object.prototype.hasOwnProperty.call(baseline, key)
      ? baseline[key]
      : current?.[key];
  }
  return expected;
}

async function findByCreationKey(entity: any, key: string) {
  const rows = await entity.filter({ creation_request_key: clean(key) });
  if (!Array.isArray(rows)) throw bad("Creation receipt lookup did not return a record list.", 409);
  return rows;
}

function buildHandoffSnapshot({ opportunity, customer, primaryIntake }: any) {
  const captured = primaryIntake?.captured_fields && typeof primaryIntake.captured_fields === "object"
    ? primaryIntake.captured_fields
    : {};
  return {
    snapshot_version: 1,
    opportunity_id: clean(opportunity?.id),
    customer_id: clean(customer?.id || opportunity?.customer_id),
    customer_display_name: clean(customer?.company_name || opportunity?.customer_display_name),
    customer_verified: Boolean(clean(customer?.id)),
    contact_id: clean(opportunity?.contact_id),
    location_id: clean(opportunity?.location_id),
    title: clean(opportunity?.title),
    job_description: clean(opportunity?.job_description),
    salesperson: clean(opportunity?.salesperson),
    lead_source: clean(opportunity?.lead_source),
    origination: clean(opportunity?.origination),
    budget_amount: opportunity?.budget_amount ?? null,
    budget_note: clean(opportunity?.budget_note),
    desired_completion_date: clean(opportunity?.desired_completion_date),
    desired_install_date: clean(opportunity?.desired_install_date),
    priority: clean(opportunity?.priority) || "normal",
    survey_requirement: clean(opportunity?.survey_requirement) || "unknown",
    permit_requirement: clean(opportunity?.permit_requirement) || "unknown",
    installation_requirement: clean(opportunity?.installation_requirement) || "unknown",
    removal_requirement: clean(opportunity?.removal_requirement) || "unknown",
    electrical_requirement: clean(opportunity?.electrical_requirement) || "unknown",
    electrical_details: clean(opportunity?.electrical_details),
    property_relationship: clean(opportunity?.property_relationship) || "unknown",
    next_action: clean(opportunity?.next_action),
    next_action_due: clean(opportunity?.next_action_due),
    next_action_assignee: clean(opportunity?.next_action_assignee),
    notes: clean(opportunity?.notes),
    captured_contact_name: clean(captured.contact_name),
    captured_contact_email: clean(captured.contact_email),
    captured_contact_phone: clean(captured.contact_phone),
    captured_site_address: clean(captured.site_address || captured.install_location),
    attachment_refs: Array.isArray(opportunity?.attachment_refs) ? opportunity.attachment_refs : [],
    primary_intake_id: clean(primaryIntake?.id || opportunity?.source_primary_intake_id),
    source_type: clean(primaryIntake?.source_type),
    compatibility_work_order_id: clean(opportunity?.compatibility_work_order_id),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email) || clean(user?.id) || "unknown";
    const action = clean(body?.action);
    if (!action) throw bad("An action is required.");

    const Opportunity = base44.asServiceRole.entities.Opportunity;
    const Intake = base44.asServiceRole.entities.OpportunityIntake;
    const EstimatingRequest = base44.asServiceRole.entities.EstimatingRequest;
    const Customer = base44.asServiceRole.entities.Customer;
    const CustomerContact = base44.asServiceRole.entities.CustomerContact;
    const CustomerLocation = base44.asServiceRole.entities.CustomerLocation;
    const WorkOrder = base44.asServiceRole.entities.WorkOrder;
    const Estimate = base44.asServiceRole.entities.AllInOneEstimate;

    if (action === "search_customers") {
      const query = clean(body?.query).toLowerCase();
      const rows = await Customer.filter({});
      if (!Array.isArray(rows)) throw bad("Customer lookup failed.", 500);
      const matches = rows
        .filter((row: any) => !query || clean(row?.company_name).toLowerCase().includes(query))
        .slice(0, 25)
        .map((row: any) => ({
          id: clean(row?.id),
          company_name: clean(row?.company_name),
          contact_name: [clean(row?.contact_first_name), clean(row?.contact_last_name)].filter(Boolean).join(" "),
          contact_email: clean(row?.contact_email),
          contact_phone: clean(row?.company_phone),
          customer_status: clean(row?.customer_status),
        }));
      return Response.json({ success: true, action, customers: matches });
    }

    if (action === "list_opportunities") {
      const includeClosed = body?.include_closed === true;
      const limit = Math.max(1, Math.min(200, Number(body?.limit) || 200));
      const rows = await Opportunity.filter({}, "-last_activity_at", 500);
      if (!Array.isArray(rows)) throw bad("Opportunity lookup failed.", 500);
      const visible = rows
        .filter((row: any) => includeClosed || !CLOSED_STAGES.has(clean(row?.stage)))
        .slice(0, limit);
      return Response.json({ success: true, action, opportunities: visible, total: visible.length });
    }

    if (action === "get_opportunity") {
      const opportunityId = clean(body?.opportunity_id);
      if (!opportunityId) throw bad("opportunity_id is required.");
      const opportunity = await Opportunity.get(opportunityId).catch(() => null);
      if (!opportunity?.id) throw bad("Opportunity not found.", 404);
      const [intakes, requests, customer, contact, location, workOrder, estimates] = await Promise.all([
        Intake.filter({ opportunity_id: opportunityId }, "-captured_at", 100),
        EstimatingRequest.filter({ opportunity_id: opportunityId }, "-created_date", 100),
        clean(opportunity?.customer_id) ? Customer.get(clean(opportunity.customer_id)).catch(() => null) : null,
        clean(opportunity?.contact_id) ? CustomerContact.get(clean(opportunity.contact_id)).catch(() => null) : null,
        clean(opportunity?.location_id) ? CustomerLocation.get(clean(opportunity.location_id)).catch(() => null) : null,
        clean(opportunity?.compatibility_work_order_id)
          ? WorkOrder.get(clean(opportunity.compatibility_work_order_id)).catch(() => null)
          : null,
        Estimate.filter({ opportunity_id: opportunityId }, "-created_date", 50),
      ]);
      return Response.json({
        success: true,
        action,
        opportunity,
        customer: customer || null,
        contact: contact || null,
        location: location || null,
        intakes: Array.isArray(intakes) ? intakes : [],
        estimating_requests: Array.isArray(requests) ? requests : [],
        work_order: workOrder || null,
        estimates: Array.isArray(estimates) ? estimates : [],
      });
    }

    if (action === "capture_intake") {
      const key = clean(body?.creation_request_key);
      if (!key || key.length > 256) throw bad("A valid creation_request_key is required.");
      const sourceType = requireEnum(body?.source_type || "manual", SOURCE_TYPES, "source_type") || "manual";
      const oppKey = `${key}:opportunity`.slice(0, 256);
      const intakeKey = `${key}:intake`.slice(0, 256);

      const existingIntakes = await findByCreationKey(Intake, intakeKey);
      if (existingIntakes.length > 1) {
        throw bad("Multiple intake records share this creation receipt; review before retrying.", 409);
      }
      if (existingIntakes.length === 1) {
        const linkedId = clean(existingIntakes[0]?.opportunity_id);
        const existing = linkedId ? await Opportunity.get(linkedId).catch(() => null) : null;
        if (existing?.id) {
          return Response.json({ success: true, action, opportunity: existing, intake: existingIntakes[0], reused: true });
        }
      }

      const input = body?.fields && typeof body.fields === "object" ? body.fields : {};
      const requirements: any = {};
      for (const field of REQUIREMENT_FIELDS) {
        requirements[field] = requireEnum(input[field] || "unknown", REQUIREMENT_VALUES, field) || "unknown";
      }
      const customerId = clean(input.customer_id);
      let customer: any = null;
      if (customerId) {
        customer = await Customer.get(customerId).catch(() => null);
        if (!customer?.id) throw bad("The selected Customer no longer exists.", 409);
      }
      const displayName = clean(input.customer_display_name) || clean(customer?.company_name);
      const title = clean(input.title) || displayName || "New opportunity";
      if (!title) throw bad("A title or customer name is required.");

      const now = new Date().toISOString();
      const opportunityData: any = {
        creation_request_key: oppKey,
        customer_id: customer ? clean(customer.id) : customerId,
        customer_display_name: displayName || clean(customer?.company_name),
        title,
        job_description: clean(input.job_description),
        stage: "new",
        opened_at: now,
        stage_changed_at: now,
        last_activity_at: now,
        salesperson: clean(input.salesperson),
        lead_source: clean(input.lead_source),
        origination: clean(input.origination),
        budget_note: clean(input.budget_note),
        desired_completion_date: clean(input.desired_completion_date),
        desired_install_date: clean(input.desired_install_date),
        priority: requireEnum(input.priority || "normal", PRIORITIES, "priority") || "normal",
        ...requirements,
        electrical_details: clean(input.electrical_details),
        property_relationship: clean(input.property_relationship) || "unknown",
        next_action: clean(input.next_action),
        next_action_due: clean(input.next_action_due),
        next_action_assignee: clean(input.next_action_assignee),
        notes: clean(input.notes),
        source_summary: { capture_source: sourceType, captured_by: actor, captured_at: now },
      };
      const budgetAmount = Number(input.budget_amount);
      if (Number.isFinite(budgetAmount) && budgetAmount >= 0) opportunityData.budget_amount = budgetAmount;

      const oppResult = await createFoundationRecordWithRecovery({
        entity: Opportunity,
        data: opportunityData,
        readMatches: () => findByCreationKey(Opportunity, oppKey),
        label: "Opportunity intake capture",
      });
      const opportunity = oppResult.record;

      const intakeResult = await createFoundationRecordWithRecovery({
        entity: Intake,
        data: {
          creation_request_key: intakeKey,
          opportunity_id: clean(opportunity.id),
          source_type: sourceType,
          source_system: clean(input.source_system) || "ccs-app",
          source_external_id: clean(input.source_external_id),
          source_received_at: clean(input.source_received_at) || now,
          captured_at: now,
          captured_by: actor,
          captured_fields: input,
          resolution_status: "linked",
          resolution_notes: "Captured and linked through the Opportunities workspace.",
        },
        readMatches: () => findByCreationKey(Intake, intakeKey),
        label: "Opportunity intake event",
      });
      const intake = intakeResult.record;

      if (!clean(opportunity.source_primary_intake_id)) {
        await replaceFoundationFieldsIfUnchanged({
          entity: Opportunity,
          recordId: clean(opportunity.id),
          expectedFields: { source_primary_intake_id: opportunity.source_primary_intake_id ?? "" },
          nextFields: { source_primary_intake_id: clean(intake.id) },
          label: "Opportunity primary intake link",
        }).catch(() => null);
      }

      const fresh = await Opportunity.get(clean(opportunity.id)).catch(() => opportunity);
      return Response.json({
        success: true,
        action,
        opportunity: fresh || opportunity,
        intake,
        reused: oppResult.status !== "created",
      });
    }

    if (action === "update_opportunity") {
      const opportunityId = clean(body?.opportunity_id);
      if (!opportunityId) throw bad("opportunity_id is required.");
      const baseline = body?.baseline && typeof body.baseline === "object" ? body.baseline : null;
      const input = body?.fields && typeof body.fields === "object" ? body.fields : {};
      const desired: any = pick(input, EDITABLE_OPPORTUNITY_FIELDS);
      if (!Object.keys(desired).length) throw bad("No editable fields were provided.");

      if (Object.prototype.hasOwnProperty.call(desired, "stage")) {
        desired.stage = requireEnum(desired.stage, STAGES, "stage") || "new";
      }
      for (const field of REQUIREMENT_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(desired, field)) {
          desired[field] = requireEnum(desired[field] || "unknown", REQUIREMENT_VALUES, field) || "unknown";
        }
      }
      if (Object.prototype.hasOwnProperty.call(desired, "priority")) {
        desired.priority = requireEnum(desired.priority || "normal", PRIORITIES, "priority") || "normal";
      }
      if (Object.prototype.hasOwnProperty.call(desired, "property_relationship")) {
        const allowed = ["owner", "tenant", "agent", "unknown"];
        desired.property_relationship = requireEnum(desired.property_relationship || "unknown", allowed, "property_relationship") || "unknown";
      }
      if (Object.prototype.hasOwnProperty.call(desired, "customer_id")) {
        const cid = clean(desired.customer_id);
        if (cid) {
          const customer = await Customer.get(cid).catch(() => null);
          if (!customer?.id) throw bad("The selected Customer no longer exists.", 409);
        }
        desired.customer_id = cid;
      }
      if (Object.prototype.hasOwnProperty.call(desired, "contact_id")) {
        const cid = clean(desired.contact_id);
        if (cid) {
          const contact = await CustomerContact.get(cid).catch(() => null);
          if (!contact?.id) throw bad("The selected CustomerContact no longer exists.", 409);
        }
        desired.contact_id = cid;
      }
      if (Object.prototype.hasOwnProperty.call(desired, "location_id")) {
        const lid = clean(desired.location_id);
        if (lid) {
          const location = await CustomerLocation.get(lid).catch(() => null);
          if (!location?.id) throw bad("The selected CustomerLocation no longer exists.", 409);
        }
        desired.location_id = lid;
      }
      if (Object.prototype.hasOwnProperty.call(desired, "budget_amount")) {
        const amount = Number(desired.budget_amount);
        desired.budget_amount = Number.isFinite(amount) && amount >= 0 ? amount : null;
      }
      for (const key of Object.keys(desired)) {
        if (typeof desired[key] === "string") desired[key] = clean(desired[key]);
      }

      const now = new Date().toISOString();
      const current = await Opportunity.get(opportunityId).catch(() => null);
      if (!current?.id) throw bad("Opportunity not found.", 404);
      if (Object.prototype.hasOwnProperty.call(desired, "stage") && desired.stage !== clean(current.stage)) {
        desired.stage_changed_at = now;
        if (CLOSED_STAGES.has(desired.stage)) desired.closed_at = now;
        else if (Object.prototype.hasOwnProperty.call(desired, "closed_at") === false && clean(current.closed_at)) desired.closed_at = "";
      }
      desired.last_activity_at = now;

      const expected = expectedFor(baseline, current, desired);
      const saved = await replaceFoundationFieldsIfUnchanged({
        entity: Opportunity,
        recordId: opportunityId,
        expectedFields: expected,
        nextFields: desired,
        label: "Opportunity fields",
      });
      return Response.json({ success: true, action, opportunity: saved });
    }

    if (action === "resolve_intake") {
      const intakeId = clean(body?.intake_id);
      const resolutionAction = clean(body?.resolution_action);
      if (!intakeId) throw bad("intake_id is required.");
      if (!["link", "reject"].includes(resolutionAction)) throw bad("resolution_action must be link or reject.");
      const intake = await Intake.get(intakeId).catch(() => null);
      if (!intake?.id) throw bad("Intake record not found.", 404);

      const desired: any = { resolution_notes: clean(body?.resolution_notes) || clean(intake.resolution_notes) };
      if (resolutionAction === "reject") {
        desired.resolution_status = "rejected";
      } else {
        const opportunityId = clean(body?.opportunity_id);
        if (!opportunityId) throw bad("opportunity_id is required to link an intake.");
        const opportunity = await Opportunity.get(opportunityId).catch(() => null);
        if (!opportunity?.id) throw bad("Opportunity not found.", 404);
        desired.resolution_status = "linked";
        desired.opportunity_id = opportunityId;
      }
      const saved = await replaceFoundationFieldsIfUnchanged({
        entity: Intake,
        recordId: intakeId,
        expectedFields: expectedFor(body?.baseline, intake, desired),
        nextFields: desired,
        label: "Opportunity intake resolution",
      });
      return Response.json({ success: true, action, intake: saved });
    }

    if (action === "link_work_order") {
      const opportunityId = clean(body?.opportunity_id);
      const workOrderId = clean(body?.work_order_id);
      const requestId = clean(body?.estimating_request_id);
      if (!opportunityId || !workOrderId) throw bad("opportunity_id and work_order_id are required.");
      const [opportunity, workOrder] = await Promise.all([
        Opportunity.get(opportunityId).catch(() => null),
        WorkOrder.get(workOrderId).catch(() => null),
      ]);
      if (!opportunity?.id) throw bad("Opportunity not found.", 404);
      if (!workOrder?.id) throw bad("WorkOrder not found.", 404);
      if (clean(workOrder.opportunity_id) && clean(workOrder.opportunity_id) !== opportunityId) {
        throw bad("WorkOrder already links a different Opportunity.", 409);
      }
      if (clean(workOrder.estimating_request_id) && requestId && clean(workOrder.estimating_request_id) !== requestId) {
        throw bad("WorkOrder already links a different EstimatingRequest.", 409);
      }
      if (clean(opportunity.compatibility_work_order_id) && clean(opportunity.compatibility_work_order_id) !== workOrderId) {
        throw bad("Opportunity already links a different compatibility WorkOrder.", 409);
      }

      const now = new Date().toISOString();
      const woDesired: any = {};
      if (!clean(workOrder.opportunity_id)) woDesired.opportunity_id = opportunityId;
      if (requestId && !clean(workOrder.estimating_request_id)) woDesired.estimating_request_id = requestId;
      let savedWorkOrder = workOrder;
      if (Object.keys(woDesired).length) {
        savedWorkOrder = await replaceFoundationFieldsIfUnchanged({
          entity: WorkOrder,
          recordId: workOrderId,
          expectedFields: expectedFor(workOrder, workOrder, woDesired),
          nextFields: woDesired,
          label: "WorkOrder opportunity compatibility links",
        });
      }

      let savedOpportunity = opportunity;
      if (!clean(opportunity.compatibility_work_order_id)) {
        savedOpportunity = await replaceFoundationFieldsIfUnchanged({
          entity: Opportunity,
          recordId: opportunityId,
          expectedFields: expectedFor(null, opportunity, {
            compatibility_work_order_id: workOrderId,
            last_activity_at: now,
          }),
          nextFields: { compatibility_work_order_id: workOrderId, last_activity_at: now },
          label: "Opportunity compatibility WorkOrder link",
        });
      }

      return Response.json({
        success: true,
        action,
        opportunity: savedOpportunity,
        work_order: savedWorkOrder,
        reused: clean(opportunity.compatibility_work_order_id) === workOrderId && !Object.keys(woDesired).length,
      });
    }

    if (action === "request_estimate") {
      const opportunityId = clean(body?.opportunity_id);
      if (!opportunityId) throw bad("opportunity_id is required.");
      const opportunity = await Opportunity.get(opportunityId).catch(() => null);
      if (!opportunity?.id) throw bad("Opportunity not found.", 404);
      if (CLOSED_STAGES.has(clean(opportunity.stage))) {
        throw bad("Closed Opportunities cannot request a new estimate.", 409);
      }

      const key = clean(body?.creation_request_key);
      if (!key || key.length > 240) throw bad("A valid creation_request_key is required.");
      const requestKey = `${key}:request`.slice(0, 256);
      const estimateKey = `${key}:estimate`.slice(0, 256);
      const now = new Date().toISOString();

      const existingRequests = await EstimatingRequest.filter({ opportunity_id: opportunityId }, "-created_date", 100);
      const openRequest = (Array.isArray(existingRequests) ? existingRequests : [])
        .find((row: any) => OPEN_REQUEST_STATUSES.has(clean(row?.status)) && clean(row?.estimate_id));
      if (openRequest) {
        const estimate = await Estimate.get(clean(openRequest.estimate_id)).catch(() => null);
        if (estimate?.id) {
          return Response.json({
            success: true,
            action,
            estimating_request: openRequest,
            estimate,
            reused: true,
          });
        }
      }

      const [customer, primaryIntake] = await Promise.all([
        clean(opportunity.customer_id) ? Customer.get(clean(opportunity.customer_id)).catch(() => null) : null,
        clean(opportunity.source_primary_intake_id)
          ? Intake.get(clean(opportunity.source_primary_intake_id)).catch(() => null)
          : null,
      ]);
      const snapshot = buildHandoffSnapshot({ opportunity, customer, primaryIntake });

      const requestData: any = {
        creation_request_key: requestKey,
        opportunity_id: opportunityId,
        customer_id: clean(customer?.id || opportunity.customer_id),
        contact_id: clean(opportunity.contact_id),
        location_id: clean(opportunity.location_id),
        compatibility_work_order_id: clean(opportunity.compatibility_work_order_id),
        status: "ready",
        requested_at: now,
        requested_by: actor,
        submitted_at: now,
        assigned_estimator: clean(body?.assigned_estimator),
        priority: requireEnum(body?.priority || opportunity.priority || "normal", PRIORITIES, "priority") || "normal",
        desired_completion_date: clean(opportunity.desired_completion_date),
        desired_install_date: clean(opportunity.desired_install_date),
        request_notes: clean(body?.request_notes) || clean(opportunity.notes),
        survey_requirement: clean(opportunity.survey_requirement) || "unknown",
        permit_requirement: clean(opportunity.permit_requirement) || "unknown",
        installation_requirement: clean(opportunity.installation_requirement) || "unknown",
        removal_requirement: clean(opportunity.removal_requirement) || "unknown",
        electrical_requirement: clean(opportunity.electrical_requirement) || "unknown",
        handoff_snapshot_version: 1,
        handoff_snapshot: snapshot,
        attachment_refs: Array.isArray(opportunity.attachment_refs) ? opportunity.attachment_refs : [],
      };

      const requestResult = await createFoundationRecordWithRecovery({
        entity: EstimatingRequest,
        data: requestData,
        readMatches: () => findByCreationKey(EstimatingRequest, requestKey),
        label: "Estimating Request handoff",
      });
      let request = requestResult.record;

      const displayName = clean(customer?.company_name || opportunity.customer_display_name) || "Customer";
      const projectName = clean(opportunity.title) || `${displayName} — New estimate`;
      const requirementSummary = [
        ["Survey", snapshot.survey_requirement],
        ["Permit", snapshot.permit_requirement],
        ["Install", snapshot.installation_requirement],
        ["Removal", snapshot.removal_requirement],
        ["Electrical", snapshot.electrical_requirement],
      ]
        .filter(([, v]) => v && v !== "unknown" && v !== "na")
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");
      const notesText = [
        clean(snapshot.job_description),
        requirementSummary ? `Requirements — ${requirementSummary}` : "",
        clean(snapshot.notes),
      ].filter(Boolean).join("\n");
      const estimateData: any = {
        creation_request_key: estimateKey,
        project_name: projectName,
        client_name: displayName,
        customer_id: clean(customer?.id || opportunity.customer_id) || null,
        opportunity_id: opportunityId,
        estimating_request_id: clean(request.id),
        salesperson: clean(opportunity.salesperson),
        site_address: clean(snapshot.captured_site_address),
        contact_name: clean(snapshot.captured_contact_name),
        order_contact: clean(snapshot.captured_contact_name),
        contact_email: clean(snapshot.captured_contact_email),
        contact_phone: clean(snapshot.captured_contact_phone),
        office_phone: clean(snapshot.captured_contact_phone || customer?.company_phone),
        target_install_date: clean(snapshot.desired_install_date || snapshot.desired_completion_date),
        priority: clean(opportunity.priority) || "normal",
        notes: notesText,
        status: "draft",
      };
      const estimateResult = await createFoundationRecordWithRecovery({
        entity: Estimate,
        data: estimateData,
        readMatches: () => findByCreationKey(Estimate, estimateKey),
        label: "Estimating Request estimate",
      });
      const estimate = estimateResult.record;

      if (clean(request.status) !== "in_progress" || clean(request.estimate_id) !== clean(estimate.id)) {
        request = await replaceEstimatingRequestFieldsIfUnchanged({
          entity: EstimatingRequest,
          recordId: clean(request.id),
          expectedFields: { status: request.status, estimate_id: request.estimate_id ?? "" },
          nextFields: { status: "in_progress", estimate_id: clean(estimate.id) },
          label: "Estimating Request estimate link",
        });
      }

      const opportunityDesired: any = {
        primary_estimating_request_id: clean(request.id),
        last_activity_at: now,
      };
      if (!["estimating", "quoted"].includes(clean(opportunity.stage))) {
        opportunityDesired.stage = "estimating";
        opportunityDesired.stage_changed_at = now;
      }
      const freshOpportunity = await replaceFoundationFieldsIfUnchanged({
        entity: Opportunity,
        recordId: opportunityId,
        expectedFields: expectedFoundationFields(opportunity, opportunityDesired),
        nextFields: opportunityDesired,
        label: "Opportunity estimating link",
      }).catch(() => null);

      return Response.json({
        success: true,
        action,
        estimating_request: request,
        estimate,
        opportunity: freshOpportunity || opportunity,
        reused: requestResult.status !== "created",
      });
    }

    throw bad(`Unsupported opportunity workspace action: ${action}`);
  } catch (error: any) {
    const status = Number(error?.status || error?.statusCode || 500);
    const safeStatus = [400, 401, 403, 404, 409, 423, 503].includes(status) ? status : 500;
    console.error("opportunityWorkspaceAction error:", error?.message || error);
    return Response.json({
      success: false,
      error: clean(error?.message || "Opportunity workspace action failed."),
    }, { status: safeStatus });
  }
});
