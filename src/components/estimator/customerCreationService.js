import { base44 } from "@/api/base44Client";

export function newCustomerCreationKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `customer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function ensureNewCustomer({ creationKey, customer }) {
  const key = String(creationKey || "").trim();
  if (!key) throw new Error("Customer creation key is required.");
  const response = await base44.functions.invoke("ensureNewCustomer", {
    creation_key: key,
    customer,
  });
  const result = response?.data || response;
  if (result?.error) throw new Error(result.error);
  if (!result?.customer?.id) throw new Error("The new Customer could not be verified after creation.");
  return result.customer;
}
