import mongoose from 'mongoose';
import WhatsAppIntegration from '../models/WhatsAppIntegration.js';
import SystemSetting from '../models/SystemSetting.js';
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

        let { code, waba_id, phone_number_id, pin, redirect_uri } = payload;
        
        try {
            // 1. Update state: Meta Auth Started
            const updatePayload = {};
            if (waba_id) updatePayload.wabaId = waba_id;
            if (phone_number_id) updatePayload.phoneNumberId = phone_number_id;
            await this._updateState(integration, 'META_AUTH_STARTED', updatePayload);

            // 2. Exchange Code
            const clientId = process.env.FB_GRAPH_APP_ID;
            const clientSecret = process.env.FB_APP_SECRET;
            // Use dynamic frontend URI if provided, else fallback to env
            const finalRedirectUri = redirect_uri || process.env.FB_EMBEDDED_SIGNUP_REDIRECT_URI || '';
            
            const tokenResponse = await metaApiClient.exchangeCodeForToken(clientId, clientSecret, finalRedirectUri, code);
            const accessToken = tokenResponse.access_token;

            await this._updateState(integration, 'TOKEN_EXCHANGED');

            // 3. Server-Side Discovery of WABA ID (if not provided by frontend)
            if (!waba_id) {
                const debugInfo = await metaApiClient.getDebugTokenInfo(accessToken, clientId, clientSecret);
                const granularScopes = debugInfo.data?.granular_scopes || [];
                const waScope = granularScopes.find(s => s.scope === 'whatsapp_business_management' || s.scope === 'whatsapp_business_messaging');
                
                if (!waScope || !waScope.target_ids || waScope.target_ids.length === 0) {
                    throw new Error('No WhatsApp Business Accounts found attached to this authentication.');
                }
                if (waScope.target_ids.length > 1) {
                    throw new Error('Multiple WhatsApp Business Accounts discovered. Ambiguous selection.');
                }
                waba_id = waScope.target_ids[0];
            }

            // 4. Verify WABA ownership and details
            const wabaData = await metaApiClient.getWabaDetails(waba_id, accessToken);
            if (!wabaData || wabaData.id !== waba_id) {
                throw new Error('Failed to verify WABA ownership');
            }
            
            // Save discovered WABA ID
            await this._updateState(integration, 'WABA_DISCOVERED', { wabaId: waba_id });

            // 5. Server-Side Discovery of Phone Number (if not provided)
            const phoneDataResponse = await metaApiClient.getPhoneNumbers(waba_id, accessToken);
            const phoneList = phoneDataResponse.data || [];
            console.log(`[WhatsAppOnboarding] Discovered ${phoneList.length} phone number(s) in WABA:`, JSON.stringify(phoneList.map(p => ({ id: p.id, number: p.display_phone_number, platform: p.platform_type }))));
            
            if (!phone_number_id) {
                if (phoneList.length === 0) {
                    throw new Error('No phone numbers found in this WhatsApp Business Account.');
                } else if (phoneList.length === 1) {
                    phone_number_id = phoneList[0].id;
                } else {
                    // Multiple phone numbers discovered in WABA
                    if (integration.connectionType === 'COEXISTENCE') {
                        // For Coexistence flow, prefer the mobile WhatsApp Business App number (non-Cloud API)
                        const coexistenceCandidate = phoneList.find(p => p.platform_type !== 'CLOUD_API');
                        if (coexistenceCandidate) {
                            phone_number_id = coexistenceCandidate.id;
                            console.log(`[WhatsAppOnboarding] Auto-selected Coexistence candidate: ${coexistenceCandidate.display_phone_number} (${coexistenceCandidate.id})`);
                        }
                    }

                    // If still unresolved, select the phone number not already bound to an active integration
                    if (!phone_number_id) {
                        const activeIntegrations = await WhatsAppIntegration.find({
                            wabaId: waba_id,
                            status: { $ne: 'REVOKED' },
                            _id: { $ne: integrationId }
                        });
                        const usedPhoneIds = new Set(activeIntegrations.map(i => i.phoneNumberId));
                        const availableCandidate = phoneList.find(p => !usedPhoneIds.has(p.id));
                        if (availableCandidate) {
                            phone_number_id = availableCandidate.id;
                            console.log(`[WhatsAppOnboarding] Auto-selected available candidate: ${availableCandidate.display_phone_number} (${availableCandidate.id})`);
                        }
                    }

                    // Final fallback: use the last phone number
                    if (!phone_number_id) {
                        phone_number_id = phoneList[phoneList.length - 1].id;
                        console.log(`[WhatsAppOnboarding] Fallback selected phone number: ${phone_number_id}`);
                    }
                }
            }

            const phoneInfo = phoneList.find(p => p.id === phone_number_id);
            if (!phoneInfo) {
                throw new Error('Phone number not found in this WABA');
            }
            
            const displayPhoneNumber = phoneInfo.display_phone_number;
            
            // Ensure idempotency for the phone number before proceeding with Registration/Subscription
            const existing = await WhatsAppIntegration.findOne({
                wabaId: waba_id,
                phoneNumberId: phone_number_id,
                status: { $ne: 'REVOKED' },
                _id: { $ne: integrationId }
            });
            if (existing) {
                if (existing.organizationId?.toString() === integration.organizationId?.toString()) {
                    console.log(`[WhatsAppOnboarding] Revoking previous active integration ${existing._id} for reconnect`);
                    existing.status = 'REVOKED';
                    existing.onboardingStatus = 'REVOKED';
                    existing.revokedAt = new Date();
                    await existing.save();
                } else {
                    throw new Error('This WhatsApp number is already connected to another organization.');
                }
            }

            await this._updateState(integration, 'PHONE_DISCOVERED', { 
                phoneNumberId: phone_number_id,
                displayPhoneNumber 
            });

            // 5. Register Phone (Cloud API Initialization)
            // Coexistence / Standard API requires phone registration
            if (integration.connectionType !== 'COEXISTENCE') {
                await metaApiClient.registerPhoneNumber(phone_number_id, pin || '123456', accessToken);
            }
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

            // COMPATIBILITY LAYER: Synchronize with existing meta_wa_config ONLY for standard Cloud API
            // Coexistence connection is stored separately in WhatsAppIntegration and must NOT overwrite the Cloud API automation number
            if (integration.connectionType !== 'COEXISTENCE') {
                await this._syncToLegacySystemSetting(waba_id, phone_number_id, accessToken);
            }

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
