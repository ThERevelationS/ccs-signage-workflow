const clean = (value, max = 256) => String(value ?? "").trim().slice(0, max);

export function buildQuoteRecipientContact({ estimate = {}, delivery = {} } = {}) {
  const customerId = clean(estimate.customer_id, 128);
  const email = clean(delivery.recipient_email, 320).toLowerCase();
  if (!customerId || !email) return null;

  const displayName = clean(estimate.order_contact || estimate.contact_name, 120);
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : nameParts[0] || "";
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";

  return {
    creation_request_key: `quote-contact:${customerId}:${email}`,
    customer_id: customerId,
    first_name: firstName,
    last_name: lastName,
    display_name: displayName || email,
    email,
    authority_role: "unknown",
    preferred_contact_method: "email",
    is_active: true,
    source_summary: {
      source: "estimate_quote_delivery",
      estimate_id: clean(estimate.id, 128),
      quote_version: Math.max(0, Math.floor(Number(delivery.quote_version) || 0)),
    },
  };
}

export async function ensureQuoteRecipientContact({
  customerContact,
  estimate,
  delivery,
  createWithRecovery,
} = {}) {
  const data = buildQuoteRecipientContact({ estimate, delivery });
  if (!data) return { record: null, status: "skipped" };
  if (typeof customerContact?.filter !== "function" || typeof createWithRecovery !== "function") {
    throw new Error("Quote recipient contact could not initialize a safe create.");
  }

  const existingRows = await customerContact.filter({ customer_id: data.customer_id });
  if (!Array.isArray(existingRows)) {
    throw new Error("Customer contacts could not be verified before quote delivery.");
  }
  const existing = existingRows.find(
    (row) => clean(row?.email, 320).toLowerCase() === data.email,
  );
  if (existing) return { record: existing, status: "existing" };

  const result = await createWithRecovery({
    entity: customerContact,
    data,
    readMatches: () => customerContact.filter({ creation_request_key: data.creation_request_key }),
    label: "Quote recipient CustomerContact",
  });
  if (!result?.record?.id) {
    throw new Error("Quote recipient contact create could not be verified.");
  }
  return result;
}
