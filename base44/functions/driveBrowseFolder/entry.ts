// Legacy per-user Google Drive token browser.
//
// The live app now uses googleDriveOperations, which requires the signed
// sign-shop session and the app's managed Google Drive connector. Keep this
// endpoint fail-closed so the retired per-user token architecture cannot be
// reactivated accidentally by an old client.
Deno.serve(() => Response.json({
  error: 'This legacy Google Drive endpoint is no longer available. Use the current Google Drive workflow.',
}, { status: 410 }));
