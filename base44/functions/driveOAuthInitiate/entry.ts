// Legacy per-user Google Drive OAuth initiator.
//
// The live app uses the managed Google Drive connector through
// googleDriveOperations. Keep this duplicate OAuth entry point fail-closed; the
// signed callback remains intact for any authorization attempt already in flight.
Deno.serve(() => Response.json({
  error: 'This legacy Google Drive endpoint is no longer available. Use the current Google Drive workflow.',
}, { status: 410 }));
