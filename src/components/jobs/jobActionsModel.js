// D-07 — Job workspace actions-row model (CoreBridge "Order.aspx" actions,
// COREBRIDGE_MAP.md §5): Edit, Clone, Print/Email Invoice, Packing Slip,
// Invoice View Settings, Void, Enter Payment.
//
// Pure and IO-free — the registry + gating matrix is unit-testable under Node
// (scripts/test-job-workspace-tabs.mjs). The React row (JobActionsRow.jsx)
// resolves every action through actionStates() and only wires the click side;
// ALL role/status/confirm rules live here so the gating matrix is assertable.
//
// ctx (everything the page already holds — zero extra reads):
//   user          — currentUser from useAuth ({email, role, full_name})
//   sessionToken  — EmailGate token; "" while signed out
//   workOrder     — the loaded WO row (or null while loading)
//   invoices      — linked invoice rows (jobWorkspaceFinancials query)
//   payments      — linked payment rows (same query)
//   financialsLoaded — the query has resolved at least once
//
// Action result: { key, label, kind, visible, enabled, reason, confirm,
//                  dangerous, needs_session, invoice_count } — `visible`
// decides render, `enabled` the click, `reason` the tooltip/disabled note,
// `confirm` the confirm-guard level ('none' | 'confirm' | 'reason').

import {
  orderLifecycleState,
  orderFinancialState,
  canTransition,
} from "./completedVsPaidModel.js";
import { recordLinksWorkOrder } from "./jobWorkspaceModel.js";

const clean = (v) => String(v ?? "").trim();
const norm = (v) => clean(v).toLowerCase();
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);
const asList = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

// --- action registry ----------------------------------------------------------

export const JOB_WORKSPACE_ACTIONS = [
  {
    key: "edit",
    label: "Edit",
    kind: "navigate", // → /MainWorkflow?wo=<id> (the existing edit surface)
    dangerous: false,
    confirm: "none",
    roles: "any",
    needs_session: false,
  },
  {
    key: "clone",
    label: "Clone",
    kind: "action", // duplicates the source estimate → new draft estimate
    dangerous: false,
    confirm: "none",
    roles: "any",
    needs_session: true,
  },
  {
    key: "print_email_invoice",
    label: "Print/Email Invoice",
    kind: "menu", // invoice picker → print render | email_invoice action
    dangerous: false,
    confirm: "none",
    roles: "any",
    needs_session: true,
  },
  {
    key: "packing_slip",
    label: "Packing Slip",
    kind: "action", // renderPackingSlipHtml → print window
    dangerous: false,
    confirm: "none",
    roles: "any",
    needs_session: false,
  },
  {
    key: "invoice_view_settings",
    label: "Invoice View Settings",
    kind: "dialog", // per-user display prefs → localStorage
    dangerous: false,
    confirm: "none",
    roles: "any",
    needs_session: false,
  },
  {
    key: "void",
    label: "Void",
    kind: "dialog", // reason-required confirm dialog → lifecycle 'voided'
    dangerous: true,
    confirm: "reason",
    roles: ["admin"],
    needs_session: true,
  },
  {
    key: "enter_payment",
    label: "Enter Payment",
    kind: "dialog", // record_payment on the invoice with open balance
    dangerous: false,
    confirm: "none",
    roles: "any",
    needs_session: true,
  },
];

export const JOB_WORKSPACE_ACTION_KEYS = JOB_WORKSPACE_ACTIONS.map((a) => a.key);

export function jobWorkspaceAction(key) {
  return JOB_WORKSPACE_ACTIONS.find((a) => a.key === clean(key)) || null;
}

// --- role + invoice helpers -----------------------------------------------------

// Admin convention app-wide: AuthorizedEmail.role === 'admin' rides the
// session user (SmartsheetSyncWidget / SyncConflictAlert check it the same
// way). Anything else on a signed-in session counts as staff.
export function userRole(user) {
  return norm(user?.role) === "admin" ? "admin" : "staff";
}

const roleAllowed = (action, user) =>
  action.roles === "any" || (Array.isArray(action.roles) && action.roles.includes(userRole(user)));

// Invoices linked to this order AND still live (not void, not deleted).
export function liveInvoices(workOrder, invoices = []) {
  const wo = isObj(workOrder) ? workOrder : {};
  return asList(invoices).filter(
    (inv) => isObj(inv) && recordLinksWorkOrder(inv, wo) && norm(inv.status) !== "void",
  );
}

// Invoices that can still take a payment — open balance on a sent/partial
// invoice (invoicingAction.record_payment's OPEN_AR_STATUSES rule).
export function payableInvoices(workOrder, invoices = []) {
  return liveInvoices(workOrder, invoices)
    .filter((inv) => ["sent", "partially_paid"].includes(norm(inv.status)))
    .filter((inv) => num(inv.balance_due, num(inv.total) - num(inv.amount_paid)) > 0.004);
}

// The default invoice an action targets: the most recent live invoice with an
// open balance first, else the newest live invoice at all.
export function primaryInvoice(workOrder, invoices = []) {
  const live = liveInvoices(workOrder, invoices);
  if (!live.length) return null;
  const open = live.filter((inv) => num(inv.balance_due, num(inv.total) - num(inv.amount_paid)) > 0.004);
  const pool = open.length ? open : live;
  return pool
    .slice()
    .sort((a, b) => clean(b.created_date || b.issue_date || b.id).localeCompare(clean(a.created_date || a.issue_date || a.id)))[0];
}

// --- gating ---------------------------------------------------------------------

const disabled = (reason) => ({ enabled: false, reason });

// Per-action availability. Every rule reads ctx only — no IO.
function evaluate(action, ctx = {}) {
  const wo = isObj(ctx.workOrder) ? ctx.workOrder : null;
  const session = clean(ctx.sessionToken).length > 0;
  const invoices = asList(ctx.invoices);
  const role = userRole(ctx.user);

  if (!roleAllowed(action, ctx.user)) {
    return { visible: false, ...disabled(`Requires ${action.roles.join("/")} role.`) };
  }
  if (action.needs_session && !session) {
    return { visible: true, ...disabled("Sign in to use this action.") };
  }
  if (!wo) {
    return { visible: true, ...disabled("Work order is still loading.") };
  }

  switch (action.key) {
    case "edit":
      return { enabled: true, reason: "" };

    case "clone": {
      if (!clean(wo.estimate_id)) {
        return disabled("No source estimate to clone — only estimate-converted orders can be cloned.");
      }
      return { enabled: true, reason: "" };
    }

    case "print_email_invoice": {
      if (!ctx.financialsLoaded) return disabled("Invoice data is still loading.");
      const live = liveInvoices(wo, invoices);
      if (!live.length) return disabled("No invoice on this order yet — create one from Invoices first.");
      const mailable = live.filter((inv) => !["void", "draft"].includes(norm(inv.status)));
      if (!mailable.length) return disabled("Only draft invoices exist — mark one sent before printing/emailing.");
      return { enabled: true, reason: "", invoice_count: live.length };
    }

    case "packing_slip": {
      const hasProducts = asList(wo.products).length > 0 ||
        [1, 2, 3, 4, 5, 6].some((i) => clean(wo[`product_${i}`]));
      if (!hasProducts) return disabled("No products on this order — nothing to pack.");
      return { enabled: true, reason: "" };
    }

    case "invoice_view_settings":
      return { enabled: true, reason: "" };

    case "void": {
      if (role !== "admin") return { visible: false, ...disabled("Void is admin-only.") };
      const lifecycle = orderLifecycleState(wo);
      if (["closed", "voided"].includes(lifecycle)) {
        return disabled(`Order is already ${lifecycle} — reopen via admin instead.`);
      }
      const check = canTransition(wo, "voided", { reason: "preview", invoices });
      if (!check.ok) return disabled(check.message || "Order cannot be voided.");
      const fin = orderFinancialState(wo, invoices);
      return {
        enabled: true,
        reason: "",
        warn: fin.paid_total > 0
          ? `${fin.paid_total.toFixed(2)} collected on linked invoices — refund before voiding AR.`
          : "",
      };
    }

    case "enter_payment": {
      if (!ctx.financialsLoaded) return disabled("Invoice data is still loading.");
      const open = payableInvoices(wo, invoices);
      if (!open.length) {
        return disabled(
          liveInvoices(wo, invoices).length
            ? "No open balance on linked invoices."
            : "No sent invoice on this order yet.",
        );
      }
      return { enabled: true, reason: "", invoice_count: open.length };
    }

    default:
      return { visible: false, ...disabled("Unknown action.") };
  }
}

// Resolve the full action row for a workspace context.
// Returns [{key, label, kind, dangerous, confirm, visible, enabled, reason, warn?}].
export function actionStates(ctx = {}) {
  return JOB_WORKSPACE_ACTIONS.map((action) => {
    const result = evaluate(action, ctx);
    return {
      ...action,
      visible: result.visible !== false,
      enabled: result.enabled === true,
      reason: result.reason || "",
      warn: result.warn || "",
      invoice_count: result.invoice_count || 0,
    };
  });
}

// Compact lookup — {edit: {enabled, reason}, …} keyed by action key.
export function actionStateMap(ctx = {}) {
  const out = {};
  actionStates(ctx).forEach((a) => { out[a.key] = a; });
  return out;
}
