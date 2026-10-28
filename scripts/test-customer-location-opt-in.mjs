import assert from "node:assert/strict";
import { ensureEstimateCustomerLocation } from "../src/components/estimator/customerLocationService.js";

const input = {
  customerId: "customer-synthetic-1",
  siteAddress: "123 Synthetic Way, Cincinnati, OH 45202",
  estimateId: "estimate-synthetic-1",
};

const entityFor = (rows, { loseCreateResponse = false } = {}) => {
  let createCalls = 0;
  return {
    rows,
    get createCalls() { return createCalls; },
    filter: async (query) => rows.filter((row) => Object.entries(query).every(([key, value]) => row[key] === value)),
    create: async (data) => {
      createCalls++;
      const record = { ...data, id: `location-${rows.length + 1}` };
      rows.push(record);
      if (loseCreateResponse) throw new Error("Synthetic create response lost");
      return record;
    },
  };
};

assert.equal(await ensureEstimateCustomerLocation({ customerId: "", siteAddress: input.siteAddress }), null);
assert.equal(await ensureEstimateCustomerLocation({ customerId: input.customerId, siteAddress: " " }), null);

{
  const entity = entityFor([]);
  const first = await ensureEstimateCustomerLocation({ entity, ...input });
  assert.equal(first.id, "location-1");
  assert.equal(first.customer_id, input.customerId);
  assert.equal(first.label, input.siteAddress);
  assert.equal(first.address_line_1, "123 Synthetic Way");
  assert.equal(first.city, "Cincinnati");
  assert.equal(first.state, "OH");
  assert.equal(first.postal_code, "45202");
  assert.equal(first.country, "US");
  assert.equal(first.site_type, "install");
  assert.equal(first.is_primary_site, true);
  assert.deepEqual(first.source_summary, {
    promoted_from: "AllInOneEstimate",
    estimate_id: input.estimateId,
    captured_address: input.siteAddress,
    captured_at: first.source_summary.captured_at,
  });
  assert.ok(Date.parse(first.source_summary.captured_at), "source capture timestamp is valid");

  const retry = await ensureEstimateCustomerLocation({ entity, ...input });
  assert.equal(retry.id, first.id, "retry finds the existing matching location");
  assert.equal(entity.createCalls, 1);
  assert.equal(entity.rows.length, 1);
}

{
  const existing = {
    id: "saved-location",
    customer_id: input.customerId,
    label: "123 synthetic way, Cincinnati, OH 45202",
    address_line_1: "123 Synthetic Way",
    city: "Cincinnati",
    state: "OH",
    postal_code: "45202",
  };
  const entity = entityFor([existing]);
  const result = await ensureEstimateCustomerLocation({ entity, ...input });
  assert.equal(result.id, "saved-location", "case/punctuation-normalized addresses reuse the saved site");
  assert.equal(entity.createCalls, 0);
}

{
  const entity = entityFor([{ id: "other-site", customer_id: input.customerId, address_line_1: "99 Other Street" }], { loseCreateResponse: true });
  await assert.rejects(ensureEstimateCustomerLocation({ entity, ...input }), /Synthetic create response lost/);
  const retryEntity = { ...entity, create: entity.create.bind(entity) };
  const recovered = await ensureEstimateCustomerLocation({ entity: retryEntity, ...input });
  assert.equal(recovered.id, "location-2", "a retry discovers the uncertain create by normalized address");
  assert.equal(entity.createCalls, 1);
}

console.log("PASS opt-in estimate CustomerLocation persistence (17 assertions)");
