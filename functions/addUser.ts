import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { email, full_name, role } = await req.json();

        if (!email) {
            return Response.json({ error: 'Email is required' }, { status: 400 });
        }

        // Check if user already exists
        const existingUsers = await base44.asServiceRole.entities.User.list();
        const exists = existingUsers.some(u => u.email?.toLowerCase() === email.toLowerCase());
        
        if (exists) {
            return Response.json({ error: 'A user with this email already exists' }, { status: 400 });
        }

        // Use the built-in invite API with service role
        await base44.asServiceRole.auth.inviteUser(
            email.toLowerCase(),
            role || 'user',
            full_name || undefined
        );

        return Response.json({ success: true, email: email.toLowerCase() });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});