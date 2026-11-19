Deno.serve(() => Response.json(
  { success: false, error: 'Emergency admin bootstrap sign-in has been retired.' },
  { status: 410 },
));