import { ensureIdempotentEntityCreate } from "@/components/estimator/idempotentEntityCreate";

export async function ensureReusableRecord({ entity, idempotencyKey, data, label = "Reusable item" }) {
  return ensureIdempotentEntityCreate({
    entity,
    keyField: "idempotency_key",
    key: idempotencyKey,
    data,
    label,
  });
}
