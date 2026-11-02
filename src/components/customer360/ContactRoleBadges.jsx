import React, { useMemo, useState } from "react";
import { Mail } from "lucide-react";
import {
  CONTACT_ROLES,
  CONTACT_ROLE_LABELS,
  CONTACT_STATUS_LABELS,
  contactEmailGroups,
  contactsForRole,
  resolveContactRoles,
  roleAssignmentPlan,
} from "../../../base44/shared/contactRolesModel.ts";
import { clean, contactDisplayName } from "./customer360Model";

// Role badge strip for CustomerContact rows — masterplan G-04 / A-11.
//
// Two modes:
//   • Per-contact (mount in a contact card): <ContactRoleBadges contact={c}
//     contacts={all} onAssignRole={fn} /> — chips for the roles THIS contact
//     holds (explicit holds render solid, title-inferred holds render dimmed
//     outline chips), non-active lifecycle status chip, email-group chips,
//     and the "Set role…" select which emits a full roleAssignmentPlan to
//     onAssignRole(contact, role, plan).
//   • Summary (no `contact` prop): <ContactRoleBadges contacts={all} /> — one
//     chip per assigned role across the list ("Label — Name", or "Label ×N"
//     for multi-holder roles) with the holder names in the chip's title
//     tooltip. Unassigned roles render nothing.
//
// Role chips are keyed by the CONTACT_ROLES registry
// (primary/billing/jobsite/decision_maker/ap); slot roles are
// single-assignment per customer, decision_maker/ap are per-person.

const ROLE_TONE = {
  primary: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
  billing: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
  jobsite: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  decision_maker: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  ap: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300",
};
const INFERRED_TONE =
  "border border-dashed border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400";
const STATUS_TONE = {
  deactivated: "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300",
  do_not_mail: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  hot_prospect: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  referral: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300",
};
const GROUP_TONE =
  "border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400";

function Chip({ tone, title, children }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}
    >
      {children}
    </span>
  );
}

// Summary mode: one chip per assigned role across a contacts array. The chip
// text names the single holder ("Billing — Betty Books"); multi-holder roles
// collapse to "×N" with every holder listed in the tooltip.
function RoleSummaryChips({ contacts }) {
  const assigned = useMemo(() => {
    const rows = Array.isArray(contacts) ? contacts : [];
    return CONTACT_ROLES.map((role) => {
      const holders = contactsForRole(rows, role.key);
      const names = holders.map((c) => contactDisplayName(c));
      return { role, holders, names };
    }).filter((x) => x.holders.length > 0);
  }, [contacts]);

  if (!assigned.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {assigned.map(({ role, holders, names }) => (
        <Chip
          key={role.key}
          tone={ROLE_TONE[role.key] || ROLE_TONE.jobsite}
          title={`${role.label} — ${names.join(", ")}`}
        >
          {role.label}
          {holders.length === 1 ? ` — ${names[0]}` : ` ×${holders.length}`}
        </Chip>
      ))}
    </div>
  );
}

function PerContactBadges({ contact, contacts = [], onAssignRole, busy = false }) {
  const info = useMemo(() => resolveContactRoles(contact), [contact]);
  const groups = useMemo(() => contactEmailGroups(contact), [contact]);
  const [assignError, setAssignError] = useState("");
  const [pending, setPending] = useState(false);

  const canAssign = typeof onAssignRole === "function" && Boolean(info.contact_id);
  const disabled = busy || pending;

  const handleChange = async (event) => {
    const value = event.target.value;
    event.target.value = "";
    if (!value) return;
    const [verb, role] = value.split(":");
    const assign = verb !== "clear";
    const plan = roleAssignmentPlan({
      contacts: Array.isArray(contacts) ? contacts : [contact],
      contact_id: info.contact_id,
      role,
      assign,
    });
    if (plan.errors.length) {
      setAssignError(plan.errors[0] === "unknown_role" ? "Unknown role." : "Contact could not be matched.");
      return;
    }
    setAssignError("");
    if (plan.noop) return;
    setPending(true);
    try {
      await onAssignRole(contact, role, plan);
    } catch (err) {
      setAssignError(err?.message || "The role assignment could not be saved.");
    } finally {
      setPending(false);
    }
  };

  const held = new Set(info.roles);
  const showStrip = info.roles.length > 0 || info.inferred_roles.length > 0 || info.status !== "active" || groups.length > 0;
  if (!showStrip && !canAssign) return null;

  const roleTooltip = (key) => {
    const def = CONTACT_ROLES.find((r) => r.key === key);
    return def ? `${def.label} — ${def.description}` : key;
  };

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {info.roles.map((role) => (
        <Chip key={role} tone={ROLE_TONE[role] || ROLE_TONE.jobsite} title={roleTooltip(role)}>
          {CONTACT_ROLE_LABELS[role] || role}
        </Chip>
      ))}
      {info.inferred_roles.map((role) => (
        <Chip
          key={`inferred-${role}`}
          tone={INFERRED_TONE}
          title={`${CONTACT_ROLE_LABELS[role] || role} — inferred from "${clean(contact.position) || clean(contact.title) || "title"}" (not explicitly assigned)`}
        >
          {CONTACT_ROLE_LABELS[role] || role}?
        </Chip>
      ))}
      {info.status !== "active" && (
        <Chip tone={STATUS_TONE[info.status] || STATUS_TONE.deactivated} title="Contact lifecycle status">
          {CONTACT_STATUS_LABELS[info.status] || info.status}
        </Chip>
      )}
      {groups.map((g) => (
        <Chip key={g} tone={GROUP_TONE} title={`Email group: ${g.replace(/_/g, " ")}`}>
          <Mail className="h-2.5 w-2.5" />
          {g.replace(/_/g, " ")}
        </Chip>
      ))}

      {canAssign && (
        <select
          aria-label={`Assign a role to ${info.display_name || "this contact"}`}
          defaultValue=""
          disabled={disabled}
          onChange={handleChange}
          className="ml-auto h-6 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-500 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
        >
          <option value="" disabled>
            {pending ? "Saving…" : "Set role…"}
          </option>
          {CONTACT_ROLES.filter((r) => !held.has(r.key)).map((r) => (
            <option key={r.key} value={`assign:${r.key}`}>
              Set as {r.label.toLowerCase()} contact
            </option>
          ))}
          {CONTACT_ROLES.filter((r) => held.has(r.key)).map((r) => (
            <option key={r.key} value={`clear:${r.key}`}>
              Clear {r.label.toLowerCase()} role
            </option>
          ))}
        </select>
      )}
      {assignError && (
        <span className="basis-full text-[11px] font-medium text-red-600 dark:text-red-400">{assignError}</span>
      )}
    </div>
  );
}

// Mode switch lives in the hook-free wrapper so per-contact hooks never run
// conditionally.
export default function ContactRoleBadges({ contact, contacts = [], onAssignRole, busy = false }) {
  if (!contact) {
    return <RoleSummaryChips contacts={contacts} />;
  }
  return (
    <PerContactBadges
      contact={contact}
      contacts={contacts}
      onAssignRole={onAssignRole}
      busy={busy}
    />
  );
}
