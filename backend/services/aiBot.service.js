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

        const combinedPrompt = `
SYSTEM INSTRUCTIONS:
${agent.systemPrompt}

CURRENT CONTEXT:
${JSON.stringify(context, null, 2)}

USER MESSAGE:
${message}
`;

        // Dispatch through Unified AI Service, forcing the agent's preferred provider
        const reply = await unifiedAIService.generate(combinedPrompt, { 
            provider: agent.provider 
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
