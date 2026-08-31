Deno.serve(() => Response.json({ success: false, error: 'Migration endpoint retired' }, { status: 410 }));
