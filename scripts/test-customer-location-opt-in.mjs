import assert from "node:assert/strict";
import {
  buildEstimateCustomerLocation,
  ensureEstimateCustomerLocation,
} from "../src/components/estimator/customerLocationService.js";

const input = {
  customerId: "customer-synthetic-1",
  siteAddress: "123 Synthetic Way, Cincinnati, OH 45202",
  estimateId: "estimate-synthetic-1",
};
const draft = buildEstimateCustomerLocation(input);
assert.deepEqual(draft, {
  creation_request_key: "aio-estimate-location:estimate-synthetic-1",
  customer_id: "customer-synthetic-1",
  label: input.siteAddress,
  address_line_1: input.siteAddress,
  country: "US",
  site_type: "install",
  is_active: true,
  source_summary: { source: "aio_estimate_opt_in", estimate_id: input.estimateId },
});
assert.equal(buildEstimateCustomerLocation({ ...input, customerId: "" }), null);
assert.equal(buildEstimateCustomerLocation({ ...input, siteAddress: "   " }), null);
assert.equal(buildEstimateCustomerLocation({ ...input, estimateId: "" }), null);

const entityFor = (rows, { loseCreateResponse = false } = {}) => ({
  filter: async (query) => rows.filter((row) => Object.entries(query).every(([key, value]) => row[key] === value)),
  create: async (data) => {
    const record = { ...data, id: `location-${rows.length + 1}` };
    rows.push(record);
    if (loseCreateResponse) throw new Error("Synthetic create response lost");
    return record;
  },
});

{
  const rows = [];
  const entity = entityFor(rows);
  const first = await ensureEstimateCustomerLocation({ entity, ...input });
  const retry = await ensureEstimateCustomerLocation({ entity, ...input });
  assert.equal(first.status, "created");
  assert.equal(retry.status, "existing");
  assert.equal(rows.length, 1, "retry uses the stable estimate key");
}

{
  const rows = [{
    id: "saved-location",
    customer_id: input.customerId,
    address_line_1: "123 Synthetic Way, Cincinnati, OH 45202",
    creation_request_key: "older-key",
  }];
  const result = await ensureEstimateCustomerLocation({ entity: entityFor(rows), ...input });
  assert.equal(result.status, "existing");
  assert.equal(result.record.id, "saved-location", "existing address is reused despite spacing/case normalization");
  assert.equal(rows.length, 1);
}

{
  const rows = [];
  const result = await ensureEstimateCustomerLocation({
    entity: entityFor(rows, { loseCreateResponse: true }),
    ...input,
  });
  assert.equal(result.status, "recovered");
  assert.equal(rows.length, 1);
}

{
  await assert.rejects(
    ensureEstimateCustomerLocation({ entity: { filter: async () => ({}), create: async () => null }, ...input }),
    /could not be checked before saving/,
  );
}

console.log("PASS opt-in estimate CustomerLocation persistence (12 assertions)");
