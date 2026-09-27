// SIPS browser acceptance uses only the local Vite fixture endpoint.
// No production Base44 client, credentials or live records are ever imported.
async function fixture(op, data = {}) {
  const response = await fetch("/__sips_fixture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op, ...data }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Synthetic fixture request failed");
  return result;
}
export const base44 = {
  entities: {
    WorkOrder: {
      filter: (query, sort, limit, skip) => fixture("list", { query, sort, limit, skip }),
      get: (id) => fixture("get", { id }),
      updateMany: (query, patch) => fixture("updateMany", { query, patch }),
    },
    AuthorizedEmail: { list: async () => [] },
    GlobalSettings: { filter: async () => [] },
  },
};
