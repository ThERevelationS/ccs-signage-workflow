import assert from "node:assert/strict";
import {
  buildQuoteRecipientContact,
  ensureQuoteRecipientContact,
} from "../base44/shared/quoteRecipientContact.mjs";
import { createFoundationRecordWithRecovery } from "../base44/shared/opportunityFoundationPersistence.mjs";

const estimate = {
  id: "estimate-synthetic-1",
  customer_id: "customer-synthetic-1",
  order_contact: "Jane Q Public",
  contact_email: "old@example.test",
};
const delivery = {
  recipient_email: "JANE@EXAMPLE.TEST",
  quote_version: 2,
};

const contact = buildQuoteRecipientContact({ estimate, delivery });
assert.deepEqual(contact, {
  creation_request_key: "quote-contact:customer-synthetic-1:jane@example.test",
  customer_id: "customer-synthetic-1",
  first_name: "Jane Q",
  last_name: "Public",
  display_name: "Jane Q Public",
  email: "jane@example.test",
  authority_role: "unknown",
  preferred_contact_method: "email",
  is_active: true,
  source_summary: {
    source: "estimate_quote_delivery",
    estimate_id: "estimate-synthetic-1",
    quote_version: 2,
  },
});
assert.equal(buildQuoteRecipientContact({ estimate: {}, delivery }), null);
assert.equal(buildQuoteRecipientContact({ estimate, delivery: {} }), null);

{
  let createCalls = 0;
  const rows = [{ id: "existing-contact", customer_id: estimate.customer_id, email: "Jane@Example.Test" }];
  const customerContact = { filter: async (query) => rows.filter((row) => Object.entries(query).every(([key, value]) => row[key] === value)) };
  const result = await ensureQuoteRecipientContact({
    customerContact,
    estimate,
    delivery,
    createWithRecovery: async () => { createCalls++; throw new Error("Should not create a duplicate"); },
  });
  assert.equal(result.status, "existing");
  assert.equal(result.record.id, "existing-contact");
  assert.equal(createCalls, 0);
}

{
  const rows = [];
  const customerContact = {
    filter: async (query) => rows.filter((row) => Object.entries(query).every(([key, value]) => row[key] === value)),
    create: async (data) => {
      const record = { ...data, id: "created-contact" };
      rows.push(record);
      throw new Error("Synthetic response lost after create");
    },
    get: async (id) => rows.find((row) => row.id === id) || null,
  };
  const first = await ensureQuoteRecipientContact({
    customerContact,
    estimate,
    delivery,
    createWithRecovery: createFoundationRecordWithRecovery,
  });
  const retry = await ensureQuoteRecipientContact({
    customerContact,
    estimate,
    delivery,
    createWithRecovery: createFoundationRecordWithRecovery,
  });
  assert.equal(first.status, "recovered");
  assert.equal(retry.status, "existing");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].creation_request_key, contact.creation_request_key);
}

{
  const customerContact = { filter: async () => ({}) };
  await assert.rejects(
    ensureQuoteRecipientContact({
      customerContact,
      estimate,
      delivery,
      createWithRecovery: async () => ({ record: { id: "should-not-create" } }),
    }),
    /could not be verified before quote delivery/,
  );
}

console.log("PASS quote recipient contact handoff (10 assertions)");