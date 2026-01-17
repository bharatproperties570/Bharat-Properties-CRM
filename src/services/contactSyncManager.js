/**
 * Contact Sync Manager
 * Orchestrates synchronization between CRM and cloud providers
 */

import googleContactsSync from './googleContactsSync';
import appleContactsSync from './appleContactsSync';

class ContactSyncManager {
    constructor() {
        this.providers = {
            google: googleContactsSync,
            apple: appleContactsSync
        };
        this.syncConfig = this.loadConfig();
    }

    /**
     * Load sync configuration from localStorage
     */
    loadConfig() {
        const config = localStorage.getItem('contactSyncConfig');
        return config ? JSON.parse(config) : {
            autoSync: true,
            providers: {
                google: { enabled: false },
                apple: { enabled: false }
            }
        };
    }

    /**
     * Save sync configuration
     */
    saveConfig(config) {
        this.syncConfig = { ...this.syncConfig, ...config };
        localStorage.setItem('contactSyncConfig', JSON.stringify(this.syncConfig));
    }

    /**
     * Enable/disable auto-sync
     */
    setAutoSync(enabled) {
        this.saveConfig({ autoSync: enabled });
    }

    /**
     * Enable a specific provider
     */
    enableProvider(provider) {
        const config = { ...this.syncConfig };
        config.providers[provider] = { enabled: true };
        this.saveConfig(config);
    }

    /**
     * Disable a specific provider
     */
    disableProvider(provider) {
        const config = { ...this.syncConfig };
        config.providers[provider] = { enabled: false };
        this.saveConfig(config);
    }

    /**
     * Sync a contact to all enabled providers
     */
    async syncContact(contact) {
        if (!this.syncConfig.autoSync) {
            console.log('Auto-sync is disabled');
            return;
        }

        const results = {
            google: { attempted: false, success: false, error: null },
            apple: { attempted: false, success: false, error: null }
        };

        // Sync to Google
        if (this.syncConfig.providers.google.enabled && this.providers.google.isAuthenticated()) {
            results.google.attempted = true;
            try {
                await this.providers.google.syncContact(contact);
                this.providers.google.markAsSynced(contact.id, contact.id);
                results.google.success = true;
            } catch (error) {
                results.google.error = error.message;
                console.error('Google sync error:', error);
            }
        }

        // Sync to Apple
        if (this.syncConfig.providers.apple.enabled && this.providers.apple.isConnected) {
            results.apple.attempted = true;
            try {
                await this.providers.apple.syncContact(contact);
                results.apple.success = true;
            } catch (error) {
                results.apple.error = error.message;
                console.error('Apple sync error:', error);
            }
        }

        return results;
    }

    /**
     * Sync multiple contacts
     */
    async syncMultipleContacts(contacts) {
        const results = {
            total: contacts.length,
            google: { synced: 0, failed: 0, skipped: 0 },
            apple: { synced: 0, failed: 0, skipped: 0 }
        };

        for (const contact of contacts) {
            const syncResults = await this.syncContact(contact);

            // Google results
            if (syncResults.google.attempted) {
                if (syncResults.google.success) {
                    results.google.synced++;
                } else {
                    results.google.failed++;
                }
            } else {
                results.google.skipped++;
            }

            // Apple results
            if (syncResults.apple.attempted) {
                if (syncResults.apple.success) {
                    results.apple.synced++;
                } else {
                    results.apple.failed++;
                }
            } else {
                results.apple.skipped++;
            }
        }

        return results;
    }

    /**
     * Get sync status for a contact
     */
    getContactSyncStatus(contact) {
        return {
            google: this.providers.google.getSyncStatus(contact),
            apple: this.providers.apple.getSyncStatus(contact)
        };
    }

    /**
     * Get overall sync status
     */
    getSyncStatus() {
        return {
            autoSync: this.syncConfig.autoSync,
            providers: {
                google: {
                    enabled: this.syncConfig.providers.google.enabled,
                    connected: this.providers.google.isAuthenticated()
                },
                apple: {
                    enabled: this.syncConfig.providers.apple.enabled,
                    connected: this.providers.apple.isConnected
                }
            }
        };
    }

    /**
     * Initialize a provider
     */
    async initializeProvider(provider, credentials) {
        switch (provider) {
            case 'google':
                return await this.providers.google.initialize(
                    credentials.clientId,
                    credentials.apiKey
                );
            case 'apple':
                return await this.providers.apple.connect(
                    credentials.username,
                    credentials.appPassword
                );
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }

    /**
     * Sign in to a provider
     */
    async signIn(provider) {
        switch (provider) {
            case 'google':
                const result = await this.providers.google.signIn();
                if (result.success) {
                    this.enableProvider('google');
                }
                return result;
            case 'apple':
                // Apple connection happens during initialize
                this.enableProvider('apple');
                return { success: true };
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }

    /**
     * Sign out from a provider
     */
    async signOut(provider) {
        switch (provider) {
            case 'google':
                await this.providers.google.signOut();
                this.disableProvider('google');
                break;
            case 'apple':
                this.providers.apple.disconnect();
                this.disableProvider('apple');
                break;
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }
}

// Export singleton instance
export default new ContactSyncManager();
