import dotenv from "dotenv";

dotenv.config();

export const config = {
    port: process.env.PORT || 4000,
    mongoUri: process.env.MONGODB_URI,
    jwtSecret: process.env.JWT_SECRET || "super_secret_key_change_later",
    mockMode: process.env.MOCK_MODE === 'true',
    nodeEnv: process.env.NODE_ENV || 'development',
    
    // Staging Safety Controls
    disableBackgroundTasks: process.env.DISABLE_BACKGROUND_TASKS === 'true',
    disableExternalIntegrations: process.env.DISABLE_EXTERNAL_INTEGRATIONS === 'true',
    disableEmail: process.env.DISABLE_EMAIL === 'true' || process.env.DISABLE_EXTERNAL_INTEGRATIONS === 'true',
    disableSms: process.env.DISABLE_SMS === 'true' || process.env.DISABLE_EXTERNAL_INTEGRATIONS === 'true',
    disableWhatsapp: process.env.DISABLE_WHATSAPP === 'true' || process.env.DISABLE_EXTERNAL_INTEGRATIONS === 'true',
    disableWebhooks: process.env.DISABLE_WEBHOOKS === 'true' || process.env.DISABLE_EXTERNAL_INTEGRATIONS === 'true',
};

// Validate required environment variables
const requiredEnvVars = ['MONGODB_URI'];

requiredEnvVars.forEach(varName => {
    if (!process.env[varName] && !config.mockMode) {
        console.warn(`⚠️  Warning: ${varName} is not set in environment variables`);
    }
});

export default config;
