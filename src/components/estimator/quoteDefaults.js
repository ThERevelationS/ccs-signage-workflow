import { base44 } from "@/api/base44Client";

export const QUOTE_DEFAULT_KEYS = [
  "company_name", "company_phone", "company_email", "company_address", "company_website", "company_license", "company_logo_url",
  "quote_title", "quote_accent_color", "quote_valid_days", "payment_terms", "quote_intro_text", "quote_footer_text", "quote_terms_conditions", "warranty_text", "lead_time_text",
  "scope_auto_apply", "hide_section_prices", "show_company_block", "show_logo", "show_contact_block", "show_estimate_number", "show_po_number", "show_site_address", "show_dates", "show_category_column", "show_section_descriptions", "show_quantity_column", "show_scope_lists", "show_subtotal_line", "show_discount_line", "show_fees_line", "show_tax_line", "show_deposit_lines", "show_notes_on_quote", "show_terms_block", "show_warranty_block", "show_lead_time_block", "show_signature_block", "show_validity_footer", "round_prices_to_dollar",
];

export const DEFAULT_QUOTE_SETTINGS = {
  company_name: "",
  company_phone: "",
  company_email: "",
  company_address: "",
  company_website: "",
  company_license: "",
  company_logo_url: "",
  quote_title: "Project Estimate",
  quote_accent_color: "#4f46e5",
  quote_valid_days: 30,
  payment_terms: "",
  quote_intro_text: "",
  quote_footer_text: "",
  quote_terms_conditions: "",
  warranty_text: "",
  lead_time_text: "",
  scope_auto_apply: true,
  hide_section_prices: false,
  show_company_block: true,
  show_logo: false,
  show_contact_block: true,
  show_estimate_number: true,
  show_po_number: true,
  show_site_address: true,
  show_dates: true,
  show_category_column: true,
  show_section_descriptions: true,
  show_quantity_column: false,
  show_scope_lists: true,
  show_subtotal_line: true,
  show_discount_line: true,
  show_fees_line: true,
  show_tax_line: true,
  show_deposit_lines: true,
  show_notes_on_quote: false,
  show_terms_block: true,
  show_warranty_block: true,
  show_lead_time_block: true,
  show_signature_block: true,
  show_validity_footer: true,
  round_prices_to_dollar: false,
};

export function quoteDefaultsPayload(record = {}) {
  return QUOTE_DEFAULT_KEYS.reduce((result, key) => {
    if (record[key] !== undefined && record[key] !== null) result[key] = record[key];
    return result;
  }, {});
}

export function quoteDefaultsForm(record = null) {
  return { ...DEFAULT_QUOTE_SETTINGS, ...quoteDefaultsPayload(record || {}) };
}

export function canonicalQuoteDefaults(rows = []) {
  return (rows || []).slice().sort((a, b) => {
    const aTime = Date.parse(a?.created_date || a?.updated_date || "") || 0;
    const bTime = Date.parse(b?.created_date || b?.updated_date || "") || 0;
    if (aTime !== bTime) return aTime - bTime;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  })[0] || null;
}

export async function loadQuoteDefaults() {
  const rows = await base44.entities.QuoteDefaults.filter({ config_name: "default" });
  return canonicalQuoteDefaults(rows || []);
}
