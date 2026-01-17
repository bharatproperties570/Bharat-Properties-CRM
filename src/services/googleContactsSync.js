/**
 * Google Contacts Sync Service
 * Integrates with Google People API to sync CRM contacts
 */

class GoogleContactsSync {
    constructor() {
        this.clientId = null;
        this.apiKey = null;
        this.accessToken = null;
        this.tokenExpiry = null;
        this.isInitialized = false;
    }

    /**
     * Initialize Google API client
     * @param {string} clientId - OAuth 2.0 Client ID
     * @param {string} apiKey - Google API Key
     */
    async initialize(clientId, apiKey) {
        this.clientId = clientId;
        this.apiKey = apiKey;

        // Load Google API script
        if (!window.gapi) {
            await this.loadGoogleAPI();
        }

        // Load auth2 and people API
        return new Promise((resolve, reject) => {
            window.gapi.load('client:auth2', async () => {
                try {
                    await window.gapi.client.init({
                        apiKey: this.apiKey,
                        clientId: this.clientId,
                        discoveryDocs: ['https://people.googleapis.com/$discovery/rest?version=v1'],
                        scope: 'https://www.googleapis.com/auth/contacts'
                    });

                    this.isInitialized = true;

                    // Check if already signed in
                    const authInstance = window.gapi.auth2.getAuthInstance();
                    if (authInstance.isSignedIn.get()) {
                        this.updateAuthToken();
                    }

                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    /**
     * Load Google API script dynamically
     */
    loadGoogleAPI() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }

    /**
     * Sign in to Google account
     */
    async signIn() {
        if (!this.isInitialized) {
            throw new Error('Google API not initialized');
        }

        const authInstance = window.gapi.auth2.getAuthInstance();
        try {
            await authInstance.signIn();
            this.updateAuthToken();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Sign out from Google account
     */
    async signOut() {
        const authInstance = window.gapi.auth2.getAuthInstance();
        await authInstance.signOut();
        this.accessToken = null;
        this.tokenExpiry = null;
        localStorage.removeItem('googleContactsSyncToken');
    }

    /**
     * Update stored auth token
     */
    updateAuthToken() {
        const authInstance = window.gapi.auth2.getAuthInstance();
        const user = authInstance.currentUser.get();
        const authResponse = user.getAuthResponse(true);

        this.accessToken = authResponse.access_token;
        this.tokenExpiry = authResponse.expires_at;

        // Store token securely (Note: In production, use backend)
        localStorage.setItem('googleContactsSyncToken', JSON.stringify({
            token: this.accessToken,
            expiry: this.tokenExpiry
        }));
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        if (!this.isInitialized) return false;
        const authInstance = window.gapi.auth2.getAuthInstance();
        return authInstance && authInstance.isSignedIn.get();
    }

    /**
     * Sync a single contact to Google
     * @param {Object} contact - CRM contact object
     */
    async syncContact(contact) {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated with Google');
        }

        try {
            // Map CRM contact to Google People API format
            const googleContact = this.mapToGoogleContact(contact);

            // Check if contact already exists in Google
            const existingContact = await this.findExistingContact(contact);

            if (existingContact) {
                // Update existing contact
                return await this.updateContact(existingContact.resourceName, googleContact);
            } else {
                // Create new contact
                return await this.createContact(googleContact);
            }
        } catch (error) {
            console.error('Error syncing contact to Google:', error);
            throw error;
        }
    }

    /**
     * Create a new contact in Google
     */
    async createContact(googleContact) {
        const response = await window.gapi.client.people.people.createContact({
            resource: googleContact
        });

        return {
            success: true,
            resourceName: response.result.resourceName,
            etag: response.result.etag
        };
    }

    /**
     * Update an existing contact in Google
     */
    async updateContact(resourceName, googleContact) {
        const response = await window.gapi.client.people.people.updateContact({
            resourceName: resourceName,
            updatePersonFields: 'names,phoneNumbers,emailAddresses,addresses,biographies',
            resource: googleContact
        });

        return {
            success: true,
            resourceName: response.result.resourceName,
            etag: response.result.etag
        };
    }

    /**
     * Find existing contact by phone or email
     */
    async findExistingContact(contact) {
        try {
            const response = await window.gapi.client.people.people.connections.list({
                resourceName: 'people/me',
                personFields: 'names,phoneNumbers,emailAddresses'
            });

            const connections = response.result.connections || [];

            // Search by phone or email
            return connections.find(conn => {
                const hasMatchingPhone = conn.phoneNumbers?.some(p =>
                    p.value.replace(/\D/g, '') === contact.phone?.replace(/\D/g, '')
                );
                const hasMatchingEmail = conn.emailAddresses?.some(e =>
                    e.value.toLowerCase() === contact.email?.toLowerCase()
                );
                return hasMatchingPhone || hasMatchingEmail;
            });
        } catch (error) {
            console.error('Error finding existing contact:', error);
            return null;
        }
    }

    /**
     * Map CRM contact to Google People API format
     */
    mapToGoogleContact(contact) {
        const googleContact = {};

        // Name
        if (contact.name) {
            googleContact.names = [{
                displayName: contact.name,
                familyName: contact.name.split(' ').pop(),
                givenName: contact.name.split(' ')[0]
            }];
        }

        // Phone numbers
        if (contact.phone) {
            const phones = contact.phone.split('/').map(p => p.trim());
            googleContact.phoneNumbers = phones.map(phone => ({
                value: phone,
                type: 'mobile'
            }));
        }

        // Email
        if (contact.email) {
            googleContact.emailAddresses = [{
                value: contact.email,
                type: 'work'
            }];
        }

        // Address
        if (contact.address) {
            googleContact.addresses = [{
                formattedValue: contact.address,
                type: 'work'
            }];
        }

        // Notes/Bio (include source, budget, lead type)
        const notes = [];
        if (contact.source) notes.push(`Source: ${contact.source}`);
        if (contact.budget) notes.push(`Budget: ${contact.budget}`);
        if (contact.leadType) notes.push(`Lead Type: ${contact.leadType}`);
        if (contact.notes) notes.push(contact.notes);

        if (notes.length > 0) {
            googleContact.biographies = [{
                value: notes.join('\n'),
                contentType: 'TEXT_PLAIN'
            }];
        }

        return googleContact;
    }

    /**
     * Bulk sync multiple contacts
     */
    async syncMultipleContacts(contacts) {
        const results = {
            total: contacts.length,
            synced: 0,
            failed: 0,
            errors: []
        };

        for (const contact of contacts) {
            try {
                await this.syncContact(contact);
                results.synced++;
            } catch (error) {
                results.failed++;
                results.errors.push({
                    contact: contact.name,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Get sync status for a contact
     */
    getSyncStatus(contact) {
        // In a real implementation, you'd track this in a database
        // For now, we'll use a simple localStorage approach
        const syncData = localStorage.getItem(`google_sync_${contact.id}`);
        if (!syncData) return { synced: false };

        const data = JSON.parse(syncData);
        return {
            synced: true,
            lastSyncTime: data.timestamp,
            resourceName: data.resourceName
        };
    }

    /**
     * Mark contact as synced
     */
    markAsSynced(contactId, resourceName) {
        localStorage.setItem(`google_sync_${contactId}`, JSON.stringify({
            resourceName,
            timestamp: new Date().toISOString()
        }));
    }
}

// Export singleton instance
export default new GoogleContactsSync();
