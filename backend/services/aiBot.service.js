import AiAgent from '../models/AiAgent.js';
import unifiedAIService from './UnifiedAIService.js';
import IntegrationSettings from '../models/IntegrationSettings.js'; // Kept for ElevenLabs right now

/**
 * AI Bot Service
 * Handles interactions with Custom AI Personas via unifiedAIService
 * and ElevenLabs for Text-to-Speech.
 */

// --- Helpers ---

const getAiCredentials = async () => {
    const settings = await IntegrationSettings.findOne();
    if (!settings) {
        throw new Error("AI credentials not configured in settings.");
    }
    return settings;
};

// --- Core Reasoner ---

export const generateBotResponse = async (message, context = {}, options = {}) => {
    try {
        const targetUseCase = options.useCase || 'whatsapp_live';
        // Find the active AI Agent designated for the target use case
        const agent = await AiAgent.findOne({ useCases: targetUseCase, isActive: true });
        
        if (!agent) {
            console.warn(`No active AI Agent found for '${targetUseCase}' use case.`);
            return { success: false, error: 'AI Agent Off' };
        }

        // Use the agent's system prompt for persona, and the user message + context for the request
        let contextString = `CHAT HISTORY:\n${context.chatHistory || 'No previous messages.'}\n\n`;
        
        if (context.lead) {
            contextString += `LEAD IDENTITY:
- Name: ${context.lead.firstName} ${context.lead.lastName}
- Current Status: ${context.lead.status}
- Intent Level: ${context.lead.intentIndex}/100
- CRM Description: ${context.lead.description || 'None'}
- Tags: ${JSON.stringify(context.lead.customFields || {})}
- Entity Type: ${context.entityType}
\n`;
        }

        // 🚀 Acknowledge System Intake Actions
        if (context.intakeResult && context.intakeResult.type !== 'PASSIVE') {
            contextString += `RECENT SYSTEM ACTIONS:
- Action: Automated ${context.intakeResult.type} Capture
- Result: System has already processed this request and created/updated a ${context.intakeResult.type} record in the CRM.
- Details: ${context.intakeResult.type === 'DEAL' ? `New Deal for ${context.intakeResult.data.name}` : 'New Lead record created.'}
\n`;
        }

        // 🧠 SENIOR PROFESSIONAL: Enterprise Memory Retrieval (RAG)
        if (agent.memoryAccess && agent.memoryAccess.length > 0) {
            contextString += `--- ENTERPRISE CRM MEMORY ---\n`;
            
            // A. Detect Location Search Intent (e.g. "Sector 4", "Sec 4", "Nirwana")
            const locationMatch = message.match(/(?:sector|sec|project|near|at|in)\s+([a-zA-Z0-9\s]{2,20})/i);
            const searchKeyword = locationMatch ? locationMatch[1].trim() : null;
            const searchRegex = searchKeyword ? new RegExp(searchKeyword, 'i') : null;

            if (searchKeyword) {
                contextString += `USER SEARCH INTENT: Searching for properties in "${searchKeyword}"\n`;
            }

            // 1. 🤝 CUSTOMER RELATIONSHIP CONTEXT (Activities & Past Communication)
            // This satisfies the user's request for "behavioral intelligence"
            if (agent.memoryAccess.includes('communications') && (context.lead?._id || context.lead?.id)) {
                const Activity = (await import('../models/Activity.js')).default;
                const Conversation = (await import('../models/Conversation.js')).default;
                const leadId = context.lead?._id || context.lead?.id;

                // Fetch recent activities to gauge behavior
                const recentActivities = await Activity.find({ entityId: leadId }).sort({ createdAt: -1 }).limit(10).lean();
                
                // Fetch past conversations (excluding current) to gauge history
                const pastConvos = await Conversation.find({ 
                    $or: [{ lead: leadId }, { contact: context.lead.contactId }],
                    _id: { $ne: context.conversationId } 
                }).sort({ updatedAt: -1 }).limit(1).lean();

                contextString += `RELATIONSHIP INTELLIGENCE:\n`;
                
                if (recentActivities.length > 0) {
                    const completedSiteVisits = recentActivities.filter(a => a.type === 'Site Visit' && a.status === 'Completed').length;
                    const missedCalls = recentActivities.filter(a => a.type === 'Call' && a.status === 'Missed').length;
                    const dealWins = recentActivities.filter(a => a.type === 'Deal' && a.status === 'Closed Won').length;
                    
                    contextString += `- Interaction Profile: ${dealWins > 0 ? 'Existing Customer (Has bought before)' : (completedSiteVisits > 0 ? 'Serious Prospect (Attended Site Visits)' : 'New Discovery')}\n`;
                    contextString += `- Behavioral Note: ${missedCalls > 2 ? 'Client often misses calls. Prefer messaging.' : 'Highly responsive'}\n`;
                    contextString += `- Latest Engagement: ${recentActivities[0].type} was ${recentActivities[0].status} on ${new Date(recentActivities[0].createdAt).toLocaleDateString()}\n`;
                }

                if (pastConvos.length > 0) {
                    const lastMsg = pastConvos[0].messages?.slice(-1)[0];
                    contextString += `- Historical Snapshot: Last contact was ${new Date(pastConvos[0].updatedAt).toLocaleDateString()}. Previously discussed: "${lastMsg?.content?.substring(0, 60)}..."\n`;
                }
                contextString += `\n`;
            }

            // 2. Fetch Associated Deals (Linked to user OR matching location)
            if (agent.memoryAccess.includes('deals')) {
                const Deal = (await import('../models/Deal.js')).default;
                const leadId = context.lead?._id || context.lead?.id;
                const dealQuery = {
                    $or: [
                        ...(leadId ? [{ leadId: leadId }] : []),
                        ...(searchRegex ? [{ location: searchRegex }, { projectName: searchRegex }] : [])
                    ]
                };
                
                const activeDeals = await Deal.find(dealQuery)
                    .limit(5)
                    .select('projectName location price stage status leadId') // NO UNIT NUMBERS
                    .lean();
                
                if (activeDeals.length > 0) {
                    contextString += `ACTIVE OFFERS/DEALS:\n`;
                    activeDeals.forEach(d => {
                        const isPersonal = String(d.leadId) === String(leadId);
                        contextString += `- ${d.projectName || 'Deal'} | Location: ${d.location || 'Local'} | Status: ${d.stage} ${isPersonal ? '(CLIENT ALREADY HAS AN ACTIVE TRANSACTION FOR THIS)' : ''}\n`;
                    });
                }
            }

            // 3. Fetch Relevant Inventory (Location-targeted or Featured)
            if (agent.memoryAccess.includes('inventory')) {
                const Inventory = (await import('../models/Inventory.js')).default;
                const inventoryQuery = { status: 'Available' };
                if (searchRegex) {
                    inventoryQuery.$or = [
                        { projectName: searchRegex }, { sector: searchRegex }, { 'address.area': searchRegex }, { 'address.city': searchRegex }, { 'address.locality': searchRegex }
                    ];
                }

                const searchResults = await Inventory.find(inventoryQuery).limit(searchRegex ? 10 : 5).select('projectName price address sector status').lean();

                if (searchResults.length > 0) {
                    contextString += `MATCHING AVAILABLE INVENTORY:\n`;
                    searchResults.forEach(inv => {
                        const loc = inv.sector || inv.address?.area || inv.address?.city || 'Local';
                        contextString += `- ${inv.projectName} | Location: ${loc} | Price: ${inv.price?.value || 'Contact'}\n`;
                    });
                } else if (searchRegex) {
                    contextString += `SYSTEM NOTE: No exact matches found for "${searchKeyword}" in Inventory.\n`;
                }
            }
            contextString += `\n`;
        }

        const userPrompt = `
### HIGH-PRIORITY INSTRUCTIONS:
1. INVENTORY is our master database. Discuss Project/Sector names and Pricing freely.
2. 🔒 DATA PRIVACY: NEVER share specific Unit Numbers or Plot Numbers (e.g. Unit 45, Plot 12) with the user. Only discuss the general availability in the Sector/Project.
3. If a client wants to SELL, follow this sequence: Project/Sector Name -> Expected Price. (Do not ask for unit number).
4. DEALS are transactions created FROM Inventory.
5. If a client wants to BUY, refer to the "AVAILABLE INVENTORY" section and offer matching projects.

CURRENT CRM CONTEXT:
${contextString}

USER MESSAGE:
${message}
`;

        // Dispatch through Unified AI Service...
        const reply = await unifiedAIService.generate(userPrompt, { 
            provider: agent.provider,
            model: agent.modelName, // PASS THE AGENT'S CONFIGURED MODEL
            systemPrompt: agent.systemPrompt
        });

        return {
            success: true,
            reply: reply,
            intent: null // TODO: prompt injection to output JSON for intent
        };

    } catch (error) {
        console.error("AI Service Error:", error.message, error.stack);
        return { success: false, error: 'Failed to generate AI response: ' + error.message };
    }
};

export const synthesizeVoice = async (text) => {
    try {
        const creds = await getAiCredentials();
        if (!creds.elevenLabsKey) {
            throw new Error("ElevenLabs API Key is missing.");
        }

        // Example ElevenLabs config
        // const response = await axios.post(...)
        
        return { success: true, audioStr: 'base64_or_url_here' };
    } catch (error) {
        console.error("Voice Synthesis Error:", error.message);
        return { success: false, error: 'Voice synthesis failed' };
    }
};

export default { generateBotResponse, synthesizeVoice };
