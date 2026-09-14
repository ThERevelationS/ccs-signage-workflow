// Legacy all-in-one Google Drive OAuth/token/listing endpoint.
//
// This retired flow used a separate per-user token architecture. The live app
// uses the managed Google Drive connector through googleDriveOperations. Keep
// this duplicate OAuth path fail-closed; the signed callback remains intact for
// any authorization attempt that was already in flight when this was retired.
Deno.serve(() => Response.json({
  error: 'This legacy Google Drive endpoint is no longer available. Use the current Google Drive workflow.',
}, { status: 410 }));
