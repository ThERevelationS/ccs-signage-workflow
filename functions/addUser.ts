import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { email, full_name, role } = await req.json();

        if (!email) {
            return Response.json({ error: 'Email is required' }, { status: 400 });
        }

        // Check if user already exists using service role
        const existingUsers = await base44.asServiceRole.entities.User.list();
        const exists = existingUsers.some(u => u.email?.toLowerCase() === email.toLowerCase());
        
        if (exists) {
            return Response.json({ error: 'A user with this email already exists' }, { status: 400 });
        }

        // Use the auth.inviteUser method (service role provides admin privileges)
        await base44.auth.inviteUser(
            email.toLowerCase(),
            role || 'user',
            full_name || undefined
        );

        return Response.json({ success: true, email: email.toLowerCase() });

    } catch (error) {
        console.error("Add user error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});