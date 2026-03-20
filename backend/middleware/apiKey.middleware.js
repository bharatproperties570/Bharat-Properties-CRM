/**
 * Middleware to verify the API Key for public website integration.
 * Expects X-API-KEY header.
 */
export const verifyApiKey = (req, res, next) => {
    // Allow CORS preflight requests
    if (req.method === 'OPTIONS') {
        return next();
    }

    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.WEBSITE_INTEGRATION_KEY;

    if (!apiKey || apiKey !== expectedKey) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized: Invalid or missing API Key'
        });
    }

    next();
};
