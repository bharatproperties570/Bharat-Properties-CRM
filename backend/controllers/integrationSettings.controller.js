import IntegrationSettings from '../models/IntegrationSettings.js';
import SystemSetting from '../models/SystemSetting.js';

export const getSettings = async (req, res) => {
    try {
        const settings = await IntegrationSettings.getSettings();
        // Mask the keys before sending to frontend for security
        const maskedSettings = {
            openaiKey: settings.openaiKey ? 'sk-...' + settings.openaiKey.slice(-4) : '',
            elevenLabsKey: settings.elevenLabsKey ? 'el-...' + settings.elevenLabsKey.slice(-4) : '',
            whatsappToken: settings.whatsappToken ? 'EA...' + settings.whatsappToken.slice(-4) : '',
            whatsappPhoneNumberId: settings.whatsappPhoneNumberId
        };
        
        res.status(200).json({ success: true, data: maskedSettings });
    } catch (error) {
        console.error('Error fetching integration settings:', error);
        res.status(500).json({ success: false, message: 'Server error fetching integration settings' });
    }
};

export const updateSettings = async (req, res) => {
    try {
        const { openaiKey, elevenLabsKey, whatsappToken, whatsappPhoneNumberId } = req.body;
        
        const settings = await IntegrationSettings.getSettings();
        
        // Only update if a new, unmasked key is provided
        if (openaiKey && !openaiKey.includes('sk-...')) settings.openaiKey = openaiKey;
        if (elevenLabsKey && !elevenLabsKey.includes('el-...')) settings.elevenLabsKey = elevenLabsKey;
        if (whatsappToken && !whatsappToken.includes('EA...')) settings.whatsappToken = whatsappToken;
        if (whatsappPhoneNumberId !== undefined) settings.whatsappPhoneNumberId = whatsappPhoneNumberId;
        
        settings.updatedBy = req.user?.id; // Assuming auth middleware sets req.user
        
        await settings.save();
        
        res.status(200).json({ success: true, message: 'Integration settings updated successfully' });
    } catch (error) {
        console.error('Error updating integration settings:', error);
        res.status(500).json({ success: false, message: 'Server error updating integration settings' });
    }
};

/**
 * Get Available AI Integrations
 * Dynamically checks the database for active API keys to return
 * which AI providers and channels can be selected in the AI Agent Hub.
 */
export const getAvailableAiIntegrations = async (req, res) => {
    try {
        const settings = await SystemSetting.find({
            key: { $in: ['ai_openai_config', 'ai_anthropic_config', 'ai_gemini_config'] }
        });

        const providers = [];
        
        settings.forEach(setting => {
            if (setting?.value?.apiKey && setting.value.apiKey.length > 10) {
                if (setting.key === 'ai_openai_config') providers.push('openai');
                if (setting.key === 'ai_anthropic_config') providers.push('anthropic');
                if (setting.key === 'ai_gemini_config') providers.push('gemini');
            }
        });

        if (providers.length === 0) providers.push('openai');

        const channels = ['marketing_campaigns', 'social_media', 'lead_qualification', 'whatsapp_live', 'sms_automation', 'email_drip', 'voice_calls'];

        res.json({
            success: true,
            data: {
                providers,
                channels
            }
        });

    } catch (error) {
        console.error('getAvailableAiIntegrations Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
