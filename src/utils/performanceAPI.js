// Performance API - Meta Conversions API (CAPI) & Offline Conversions Simulation

export const performanceAPI = {
    /**
     * Send a Conversion Event to the backend / directly to Meta CAPI
     * @param {string} eventName - e.g., 'Purchase', 'Lead', 'SiteVisit'
     * @param {object} eventData - Custom data like value, currency, leadId
     * @param {object} userData - User data for matching (email, phone)
     */
    sendConversionEvent: async (eventName, eventData = {}, userData = {}) => {
        console.log(`%c[Performance API] Triggering Conversion Event: ${eventName}`, 'color: #2563eb; font-weight: bold; font-size: 14px');
        console.log('Event Data:', eventData);
        console.log('User Matching Data:', userData);
        
        try {
            // In a real scenario, this would be an API call to your backend:
            // await apiRequest('/marketing/performance/capi', { method: 'POST', body: JSON.stringify({ eventName, eventData, userData }) });
            
            // Simulating network delay
            await new Promise(resolve => setTimeout(resolve, 800));

            // Log Success
            console.log(`%c[Performance API] Successfully sent ${eventName} to Meta CAPI`, 'color: #16a34a; font-weight: bold');
            
            // Optional: return success structure
            return { success: true, message: 'Event recorded successfully' };
        } catch (error) {
            console.error(`[Performance API] Failed to send ${eventName}:`, error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Parse UTM Parameters from a given URL or Lead Source
     */
    parseUTMs: (urlOrSource) => {
        // Mock logic for parsing UTMs, useful when importing leads
        try {
            if (!urlOrSource) return {};
            if (urlOrSource.includes('?')) {
                const url = new URL(urlOrSource);
                return {
                    utm_source: url.searchParams.get('utm_source'),
                    utm_medium: url.searchParams.get('utm_medium'),
                    utm_campaign: url.searchParams.get('utm_campaign'),
                    utm_content: url.searchParams.get('utm_content'),
                    utm_term: url.searchParams.get('utm_term'),
                };
            }
            return { utm_source: urlOrSource.toLowerCase() };
        } catch (e) {
            return { utm_source: urlOrSource };
        }
    }
};
