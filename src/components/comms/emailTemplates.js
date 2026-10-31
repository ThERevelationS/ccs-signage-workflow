// Merge-field email templates for the follow-up automation queue
// (src/components/comms/followupModel.js). Pure + dependency-free so the file
// bundles cleanly under esbuild for scripts/test-followups.mjs.
//
// Supported merge fields ({{field}} or {{ field }}):
//   customer_name, estimate_number, invoice_number, total, balance, due_date,
//   company_name, contact_name, days_since_sent, days_past_due
// Unknown/blank keys render as an empty string — a template can never throw
// or leak a raw {{placeholder}} into an outgoing email.

export function renderTemplate(template, context = {}) {
  const ctx = context && typeof context === "object" ? context : {};
  return String(template ?? "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const value = ctx[key];
    if (value === undefined || value === null) return "";
    return String(value);
  });
}

// One {subject, body} pair per follow-up kind. Bodies are plain text — the
// deployed sendEmail gateway takes a `body` string, and staff can edit both
// fields per row before sending.
export const FOLLOWUP_TEMPLATES = {
  quote_followup_1: {
    subject: "Following up on quote {{estimate_number}} — {{company_name}}",
    body:
      "Hi {{contact_name}},\n\n" +
      "I wanted to follow up on the signage quote we sent over for {{customer_name}} — " +
      "quote {{estimate_number}} for {{total}}. It has been {{days_since_sent}} days since we issued it, " +
      "and I wanted to make sure it reached the right hands.\n\n" +
      "Happy to answer any questions, adjust options, or walk through the details whenever is convenient.\n\n" +
      "Thank you,\n{{company_name}}",
  },
  quote_followup_2: {
    subject: "Still interested? Quote {{estimate_number}} — {{company_name}}",
    body:
      "Hi {{contact_name}},\n\n" +
      "I'm circling back one more time on quote {{estimate_number}} for {{customer_name}} ({{total}}), " +
      "sent {{days_since_sent}} days ago. We would love to earn this project — if priorities or budgets " +
      "have shifted, just let me know and I can revise or close it out.\n\n" +
      "If everything looks good, you can approve it and we will get production moving.\n\n" +
      "Thank you,\n{{company_name}}",
  },
  invoice_overdue_1: {
    subject: "Payment reminder: {{invoice_number}} ({{days_past_due}} days past due) — {{company_name}}",
    body:
      "Hi {{contact_name}},\n\n" +
      "This is a friendly reminder that invoice {{invoice_number}} for {{customer_name}} " +
      "was due on {{due_date}} and shows an open balance of {{balance}}.\n\n" +
      "If payment is already on the way, thank you — please disregard this note. Otherwise we would " +
      "appreciate payment at your earliest convenience, or a quick reply so we know the status.\n\n" +
      "Thank you,\n{{company_name}}",
  },
  invoice_overdue_2: {
    subject: "Second notice: {{invoice_number}} is {{days_past_due}} days past due — {{company_name}}",
    body:
      "Hi {{contact_name}},\n\n" +
      "Invoice {{invoice_number}} for {{customer_name}} remains open with a balance of {{balance}}. " +
      "It was due {{due_date}} and is now {{days_past_due}} days past due.\n\n" +
      "Please arrange payment as soon as possible, or contact us right away if there is an issue " +
      "holding it up — we are glad to work through it with you.\n\n" +
      "Thank you,\n{{company_name}}",
  },
};

export const FOLLOWUP_TEMPLATE_KEYS = Object.keys(FOLLOWUP_TEMPLATES);
