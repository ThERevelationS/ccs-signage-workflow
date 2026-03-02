import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Wrapper function that calls the jurisdictionResearch agent
 * Used by: JurisdictionFormDialog (create), refreshJurisdiction (refresh), batch operations
 * This allows agent prompt control from the dashboard while keeping backend integration simple
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { jurisdictionName, jurisdictionState, jurisdictionType = 'county', includeParentCounty = true } = await req.json();
    
    if (!jurisdictionName || !jurisdictionState) {
      return Response.json({ error: 'jurisdictionName and jurisdictionState required' }, { status: 400 });
    }

    // Call the jurisdictionResearch agent via conversation API
    const conversation = await base44.agents.createConversation({
      agent_name: "jurisdictionResearch",
      metadata: {
        name: `Research: ${jurisdictionName}, ${jurisdictionState}`,
        type: "api_call",
        jurisdiction_type: jurisdictionType
      }
    });

    // Send the research request to the agent
    const userMessage = `Research sign permitting requirements for ${jurisdictionName} ${jurisdictionType}, ${jurisdictionState}. ${includeParentCounty && jurisdictionType !== 'county' ? 'Include parent county information.' : ''}`;
    
    await base44.agents.addMessage(conversation, {
      role: "user",
      content: userMessage
    });

    // Wait for agent to complete research and parse the structured response
    // The agent will return structured JSON data based on its instructions
    let researchData = null;
    let maxAttempts = 60; // 30 seconds with 500ms polling
    
    while (maxAttempts > 0) {
      const updatedConversation = await base44.agents.getConversation(conversation.id);
      
      if (updatedConversation.messages.length > 1) {
        const lastMessage = updatedConversation.messages[updatedConversation.messages.length - 1];
        
        if (lastMessage.role === 'assistant' && lastMessage.content) {
          // Try to extract JSON from the response
          try {
            const jsonMatch = lastMessage.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              researchData = JSON.parse(jsonMatch[0]);
              break;
            }
          } catch (e) {
            // If JSON parsing fails, return the raw response and let caller handle it
            researchData = {
              raw_response: lastMessage.content,
              website_url: null,
              permitting_url: null,
              documents: [],
              permit_requirements: {},
              contact_info: {}
            };
            break;
          }
        }
      }
      
      maxAttempts--;
      if (maxAttempts > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (!researchData) {
      return Response.json({ 
        error: 'Agent did not complete research within timeout',
        conversation_id: conversation.id
      }, { status: 408 });
    }

    return Response.json({ 
      success: true,
      data: researchData,
      conversation_id: conversation.id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});