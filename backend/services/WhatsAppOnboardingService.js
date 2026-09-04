import mongoose from 'mongoose';
import WhatsAppIntegration from '../models/WhatsAppIntegration.js';
import metaApiClient from '../utils/metaApiClient.js';

class WhatsAppOnboardingService {
    
    /**
     * Start a new onboarding session
     */
    async initiateOnboarding(organizationId, connectionType, userId) {
        // Idempotency: Cancel any pending onboarding for this org/connectionType
        await WhatsAppIntegration.updateMany(
            { organizationId, connectionType, status: 'PENDING_ONBOARDING' },
            { $set: { status: 'REVOKED', onboardingStatus: 'CANCELLED', revokedAt: new Date() } }
        );

        const integration = new WhatsAppIntegration({
            organizationId,
            wabaId: 'PENDING', // Will be updated later
            phoneNumberId: 'PENDING',
            connectionType,
            onboardingStatus: 'INITIATED',
            status: 'PENDING_ONBOARDING',
            connectedBy: userId
        });

        await integration.save();
        return integration;
    }

    /**
     * Handle OAuth Code and complete onboarding
     * @param {string} integrationId - The pending integration record ID
     * @param {Object} payload - { code, waba_id, phone_number_id, pin }
     */
    async completeOnboarding(integrationId, payload) {
        const integration = await WhatsAppIntegration.findById(integrationId);
        if (!integration || integration.status !== 'PENDING_ONBOARDING') {
            throw new Error('Invalid or expired onboarding session');
        }

        const { code, waba_id, phone_number_id, pin } = payload;
        
        try {
            // 1. Update state: Meta Auth Started
            await this._updateState(integration, 'META_AUTH_STARTED', { wabaId: waba_id, phoneNumberId: phone_number_id });

            // Ensure idempotency for the phone number before proceeding with Meta
            const existing = await WhatsAppIntegration.findOne({
                wabaId: waba_id,
                phoneNumberId: phone_number_id,
                status: { $ne: 'REVOKED' },
                _id: { $ne: integrationId }
            });
            if (existing) {
                throw new Error('This WhatsApp number is already connected to an active integration.');
            }

            // 2. Exchange Code
            const clientId = process.env.FB_GRAPH_APP_ID;
            const clientSecret = process.env.FB_APP_SECRET;
            const redirectUri = process.env.FB_EMBEDDED_SIGNUP_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:4000'}/api/whatsapp-onboarding/callback`;
            
            // NOTE: In standard embedded signup flow via JS SDK callback, the code is swapped for a token.
            const tokenResponse = await metaApiClient.exchangeCodeForToken(clientId, clientSecret, redirectUri, code);
            const accessToken = tokenResponse.access_token;

            await this._updateState(integration, 'TOKEN_EXCHANGED');

            // 3. Verify WABA ownership
            const wabaData = await metaApiClient.getWabaDetails(waba_id, accessToken);
            if (!wabaData || wabaData.id !== waba_id) {
                throw new Error('Failed to verify WABA ownership');
            }
            await this._updateState(integration, 'WABA_DISCOVERED');

            // 4. Verify Phone ownership
            const phoneDataResponse = await metaApiClient.getPhoneNumbers(waba_id, accessToken);
            const phoneInfo = phoneDataResponse.data?.find(p => p.id === phone_number_id);
            if (!phoneInfo) {
                throw new Error('Phone number not found in this WABA');
            }
            
            const displayPhoneNumber = phoneInfo.display_phone_number;
            await this._updateState(integration, 'PHONE_DISCOVERED', { displayPhoneNumber });

            // 5. Register Phone (Cloud API Initialization)
            // Coexistence / Standard API requires phone registration
            await metaApiClient.registerPhoneNumber(phone_number_id, pin || '123456', accessToken);
            await this._updateState(integration, 'PHONE_REGISTERED');

            // 6. Subscribe App to WABA
            await this._updateState(integration, 'SUBSCRIPTION_PENDING');
            await metaApiClient.subscribeWebhook(waba_id, accessToken);

            // 7. Mark Connected and execute Compatibility Sync
            await this._updateState(integration, 'CONNECTED', {
                status: 'ACTIVE',
                webhookStatus: 'SUBSCRIBED',
                subscriptionStatus: 'SUBSCRIBED',
                connectedAt: new Date(),
                credentials: { systemUserToken: accessToken }
            });

            // COMPATIBILITY LAYER: Synchronize with existing meta_wa_config
            await this._syncToLegacySystemSetting(waba_id, phone_number_id, accessToken);

            return integration;

        } catch (error) {
            // Determine failure state based on where it failed
            let failState = 'FAILED_AUTH';
            if (integration.onboardingStatus === 'TOKEN_EXCHANGED') failState = 'FAILED_VALIDATION';
            if (integration.onboardingStatus === 'PHONE_DISCOVERED') failState = 'FAILED_PHONE';
            if (integration.onboardingStatus === 'PHONE_REGISTERED' || integration.onboardingStatus === 'SUBSCRIPTION_PENDING') failState = 'FAILED_SUBSCRIPTION';
            
            await this._updateState(integration, failState, { 
                status: 'REVOKED', 
                failureReason: error.message 
            });

            throw error;
        }
    }

    /**
     * Internal State Updater
     */
    async _updateState(integration, newState, extraFields = {}) {
        integration.onboardingStatus = newState;
        for (const [key, value] of Object.entries(extraFields)) {
            integration[key] = value;
        }
        await integration.save();
    }

    /**
     * Backward compatibility sync
     * Safe operation - only overwrites token/IDs, preserving existing routing.
     */
    async _syncToLegacySystemSetting(wabaId, phoneNumberId, token) {
        const SystemSetting = mongoose.model('SystemSetting');
        
        // Find existing or create new
        const setting = await SystemSetting.findOne({ key: 'meta_wa_config' });
        
        const newValue = {
            ...(setting?.value || {}),
            businessId: wabaId,
            phoneId: phoneNumberId,
            token: token, // Used by existing WhatsAppService
        };

        await SystemSetting.findOneAndUpdate(
            { key: 'meta_wa_config' },
            { 
                $set: { 
                    value: newValue,
                    category: 'integration',
                    active: true 
                } 
            },
            { upsert: true, new: true }
        );
        console.log(`[WhatsAppOnboarding] Legacy SystemSetting sync completed safely for WABA: ${wabaId}`);
    }
}

export default new WhatsAppOnboardingService();
