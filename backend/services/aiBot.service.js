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

export const generateBotResponse = async (message, context = {}) => {
    try {
        // Find the active AI Agent designated for WhatsApp Automation
        const agent = await AiAgent.findOne({ useCases: 'whatsapp_live', isActive: true });
        
        if (!agent) {
            console.warn("No active AI Agent found for 'whatsapp_live' use case.");
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
            
            // 1. Fetch Associated Deals
            if (agent.memoryAccess.includes('deals') && context.lead?._id) {
                const Deal = (await import('../models/Deal.js')).default;
                const activeDeals = await Deal.find({ 
                    $or: [
                        { leadId: context.lead._id },
                        { contact: context.lead.contactId }
                    ]
                }).limit(3).lean();
                
                if (activeDeals.length > 0) {
                    contextString += `ACTIVE DEALS:\n`;
                    activeDeals.forEach(d => {
                        contextString += `- Deal: ${d.name} | Stage: ${d.stage} | Price: ${d.price || 'N/A'}\n`;
                    });
                }
            }

            // 2. Fetch Relevant Inventory (Logic: Matching Lead Location/Requirement)
            if (agent.memoryAccess.includes('inventory')) {
                const Inventory = (await import('../models/Inventory.js')).default;
                // Fetch top 5 available properties to act as the agent's "knowledge base"
                const featuredInventory = await Inventory.find({ status: 'Available' })
                    .limit(5)
                    .select('projectName unitNumber price address status')
                    .lean();

                if (featuredInventory.length > 0) {
                    contextString += `AVAILABLE INVENTORY (DATABASE):\n`;
                    featuredInventory.forEach(inv => {
                        contextString += `- ${inv.projectName} (Unit ${inv.unitNumber}) | Price: ${inv.price?.value || 'Contact'} | Location: ${inv.address?.city || 'Local'}\n`;
                    });
                }
            }
            contextString += `\n`;
        }

        const userPrompt = `
### HIGH-PRIORITY INSTRUCTIONS:
1. INVENTORY is our master database. If a user provides "Project/Sector Name" and "Unit/Plot Number", DO NOT ask for Size or Location (we already have it).
2. If a client wants to SELL, follow this sequence: Project/Sector Name -> Unit Number -> Expected Price. Skip everything else.
3. DEALS are transactions created FROM Inventory.
4. If a client wants to BUY, refer to the "AVAILABLE INVENTORY" section and offer matching units.

CURRENT CRM CONTEXT:
${contextString}

USER MESSAGE:
${message}
`;

        // Dispatch through Unified AI Service...
        // Passing systemPrompt separately allows better model adherence (system role in OpenAI / systemInstruction in Gemini)
        const reply = await unifiedAIService.generate(userPrompt, { 
            provider: agent.provider,
            systemPrompt: agent.systemPrompt
        });

        return {
            success: true,
            reply: reply,
            intent: null // TODO: prompt injection to output JSON for intent
        };

    } catch (error) {
        console.error("AI Service Error:", error.message);
        return { success: false, error: 'Failed to generate AI response' };
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
