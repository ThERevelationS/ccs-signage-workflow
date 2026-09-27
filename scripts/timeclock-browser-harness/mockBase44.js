// Browser-only Time Clock SDK mock. All calls stay on the local Vite fixture.
// This module deliberately imports no production auth, Base44 SDK, or credentials.
export async function syntheticTimeClockCall(op, payload = {}) {
  const response = await fetch("/__timeclock_fixture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op, ...payload }),
  });
  const data = await response.json();
  if (!response.ok) {
    if (data?.simulate_lost_ack) throw new Error("Synthetic lost server acknowledgement");
    const error = new Error(data?.error || "Synthetic Time Clock request failed");
    error.response = { status: response.status, data };
    throw error;
  }
  return data;
}
export const base44 = {
  entities: { TimeClockPayPeriod: { synthetic: true } },
  functions: {
    async invoke(name, payload) {
      if (name !== "timeClockAction") throw new Error("Unexpected fixture function: " + name);
      return { data: await syntheticTimeClockCall("invoke", { payload }) };
    },
  },
};
