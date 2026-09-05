import axios from 'axios';

const META_GRAPH_VERSION = 'v20.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/**
 * Isolated Meta Graph API client for WhatsApp Onboarding
 * Ensures tokens are redacted in logs and errors are structured.
 */
class MetaApiClient {
    constructor() {
        this.client = axios.create({
            baseURL: META_GRAPH_BASE,
            timeout: 15000 // 15 seconds
        });

        // Request interceptor for logging
        this.client.interceptors.request.use(config => {
            const redactedUrl = config.url.replace(/access_token=[^&]+/g, 'access_token=REDACTED');
            console.log(`[MetaApiClient] ${config.method.toUpperCase()} ${redactedUrl}`);
            return config;
        });

        // Response interceptor for error handling
        this.client.interceptors.response.use(
            response => response,
            error => {
                let metaError = null;
                if (error.response && error.response.data && error.response.data.error) {
                    metaError = error.response.data.error;
                    const redactedUrl = error.config?.url?.replace(/access_token=[^&]+/g, 'access_token=REDACTED');
                    console.error(`[MetaApiClient] Error calling ${redactedUrl} | Status: ${error.response.status} | Msg: ${metaError.message}`);
                } else {
                    console.error(`[MetaApiClient] Network/Unknown Error: ${error.message}`);
                }

                // Wrap into a structured error
                const structuredError = new Error(metaError ? metaError.message : error.message);
                structuredError.isMetaError = true;
                structuredError.status = error.response?.status || 500;
                structuredError.code = metaError?.code || 'UNKNOWN';
                structuredError.type = metaError?.type || 'UNKNOWN';
                structuredError.error_subcode = metaError?.error_subcode;
                
                return Promise.reject(structuredError);
            }
        );
    }

    /**
     * Exchange short-lived OAuth code for an access token
     */
    async exchangeCodeForToken(clientId, clientSecret, redirectUri, code) {
        const response = await this.client.get('/oauth/access_token', {
            params: {
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                code: code
            }
        });
        return response.data;
    }

    /**
     * Verify WABA ownership / details
     */
    async getWabaDetails(wabaId, accessToken) {
        const response = await this.client.get(`/${wabaId}`, {
            params: {
                fields: 'id,name,timezone_id',
                access_token: accessToken
            }
        });
        return response.data;
    }

    /**
     * Verify Phone Number belongs to WABA
     */
    async getPhoneNumbers(wabaId, accessToken) {
        const response = await this.client.get(`/${wabaId}/phone_numbers`, {
            params: {
                access_token: accessToken
            }
        });
        return response.data;
    }

    /**
     * Register phone number on Cloud API
     */
    async registerPhoneNumber(phoneNumberId, pin, accessToken) {
        // According to Meta Docs, registration requires the PIN (6 digits)
        const response = await this.client.post(`/${phoneNumberId}/register`, {
            messaging_tier: 'TIER_10K', // Default tier assumption or passed dynamically
            pin: pin
        }, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        return response.data;
    }

    /**
     * Subscribe WABA to the Meta App Webhook
     */
    async subscribeWebhook(wabaId, accessToken) {
        const response = await this.client.post(`/${wabaId}/subscribed_apps`, null, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        return response.data;
    }
}

export default new MetaApiClient();
