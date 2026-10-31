// src/components/comms/emailTemplates.js
function renderTemplate(template, context = {}) {
  const ctx = context && typeof context === "object" ? context : {};
  return String(template ?? "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const value = ctx[key];
    if (value === void 0 || value === null) return "";
    return String(value);
  });
}
var FOLLOWUP_TEMPLATES = {
  quote_followup_1: {
    subject: "Following up on quote {{estimate_number}} \u2014 {{company_name}}",
    body: "Hi {{contact_name}},\n\nI wanted to follow up on the signage quote we sent over for {{customer_name}} \u2014 quote {{estimate_number}} for {{total}}. It has been {{days_since_sent}} days since we issued it, and I wanted to make sure it reached the right hands.\n\nHappy to answer any questions, adjust options, or walk through the details whenever is convenient.\n\nThank you,\n{{company_name}}"
  },
  quote_followup_2: {
    subject: "Still interested? Quote {{estimate_number}} \u2014 {{company_name}}",
    body: "Hi {{contact_name}},\n\nI'm circling back one more time on quote {{estimate_number}} for {{customer_name}} ({{total}}), sent {{days_since_sent}} days ago. We would love to earn this project \u2014 if priorities or budgets have shifted, just let me know and I can revise or close it out.\n\nIf everything looks good, you can approve it and we will get production moving.\n\nThank you,\n{{company_name}}"
  },
  invoice_overdue_1: {
    subject: "Payment reminder: {{invoice_number}} ({{days_past_due}} days past due) \u2014 {{company_name}}",
    body: "Hi {{contact_name}},\n\nThis is a friendly reminder that invoice {{invoice_number}} for {{customer_name}} was due on {{due_date}} and shows an open balance of {{balance}}.\n\nIf payment is already on the way, thank you \u2014 please disregard this note. Otherwise we would appreciate payment at your earliest convenience, or a quick reply so we know the status.\n\nThank you,\n{{company_name}}"
  },
  invoice_overdue_2: {
    subject: "Second notice: {{invoice_number}} is {{days_past_due}} days past due \u2014 {{company_name}}",
    body: "Hi {{contact_name}},\n\nInvoice {{invoice_number}} for {{customer_name}} remains open with a balance of {{balance}}. It was due {{due_date}} and is now {{days_past_due}} days past due.\n\nPlease arrange payment as soon as possible, or contact us right away if there is an issue holding it up \u2014 we are glad to work through it with you.\n\nThank you,\n{{company_name}}"
  }
};
var FOLLOWUP_TEMPLATE_KEYS = Object.keys(FOLLOWUP_TEMPLATES);
export {
  FOLLOWUP_TEMPLATES,
  FOLLOWUP_TEMPLATE_KEYS,
  renderTemplate
};
