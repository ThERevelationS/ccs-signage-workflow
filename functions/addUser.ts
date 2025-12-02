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

        // Create user using service role (bypasses security rules)
        const newUser = await base44.asServiceRole.entities.User.create({
            email: email.toLowerCase(),
            full_name: full_name || null,
            role: role || 'user'
        });

        // Send notification email
        try {
            await base44.asServiceRole.integrations.Core.SendEmail({
                to: email,
                subject: "You've been added to Sign Shop Workflow",
                body: `Hello${full_name ? ` ${full_name}` : ''},\n\nYou have been added to the Sign Shop Workflow Manager.\n\nSimply visit the application and enter this email address (${email}) to access the system.\n\nYour role: ${role === 'admin' ? 'Administrator' : 'User'}\n\nBest regards,\nSign Shop Team`
            });
        } catch (emailError) {
            console.log("Email notification failed:", emailError);
        }

        return Response.json({ success: true, user: newUser });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});