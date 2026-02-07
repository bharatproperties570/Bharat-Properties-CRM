import dotenv from "dotenv";

dotenv.config();

export const config = {
    port: process.env.PORT || 5002,
    mongoUri: process.env.MONGODB_URI,
    jwtSecret: process.env.JWT_SECRET || "super_secret_key_change_later",
    mockMode: process.env.MOCK_MODE === 'true',
    nodeEnv: process.env.NODE_ENV || 'development'
};

// Validate required environment variables
const requiredEnvVars = ['MONGODB_URI'];

requiredEnvVars.forEach(varName => {
    if (!process.env[varName] && !config.mockMode) {
        console.warn(`⚠️  Warning: ${varName} is not set in environment variables`);
    }
});

export default config;
