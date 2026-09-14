// Legacy Google Drive picker/file-access endpoint.
//
// The live app now uses googleDriveOperations plus the concurrency-safe
// WorkOrder persistence helpers. Keep this endpoint fail-closed so an old
// client cannot bypass the current signed-session Drive workflow.
Deno.serve(() => Response.json({
  error: 'This legacy Google Drive endpoint is no longer available. Use the current Google Drive workflow.',
}, { status: 410 }));
