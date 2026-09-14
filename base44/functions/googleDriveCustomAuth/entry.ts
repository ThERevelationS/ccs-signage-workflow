// Legacy custom per-user Google Drive OAuth/listing endpoint.
//
// The live app uses the managed Google Drive connector through
// googleDriveOperations. Keep this duplicate auth path fail-closed so an old
// client cannot restart the retired per-user token flow.
Deno.serve(() => Response.json({
  error: 'This legacy Google Drive endpoint is no longer available. Use the current Google Drive workflow.',
}, { status: 410 }));
