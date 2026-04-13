import axios from 'axios';
import SystemSetting from '../src/modules/systemSettings/system.model.js';
import { ingestLead } from './LeadIngestionService.js';

const GRAPH_BASE = 'https://graph.facebook.com';

/**
 * MetaLeadService.js
 * handles lead retrieval from Meta Lead Ads via Graph API.
 */
class MetaLeadService {
    constructor() {
        this.graphVersion = 'v19.0';
    }

    async _getAccessToken() {
        const config = await SystemSetting.findOne({ key: 'social_graph_config' }).lean();
        return config?.value?.pageAccessToken || process.env.FB_PAGE_ACCESS_TOKEN;
    }

    /**
     * Fetch lead details using the leadgen_id provided by webhook
     * @param {string} leadgenId 
     */
    async processMetaLead(leadgenId) {
        try {
            const token = await this._getAccessToken();
            if (!token) throw new Error('Meta Access Token missing');

            console.log(`[MetaLeadService] Fetching details for lead: ${leadgenId}`);
            const url = `${GRAPH_BASE}/${this.graphVersion}/${leadgenId}`;
            const { data } = await axios.get(url, {
                params: { access_token: token }
            });

            if (!data || !data.field_data) {
                throw new Error('Invalid lead data received from Meta');
            }

            // Map Meta field data to CRM Lead structure
            const mappedData = this._mapMetaFields(data.field_data);
            mappedData.portal = 'Facebook Lead Ads';
            mappedData.listingDetails = `Meta Form: ${data.form_id || 'Unknown'}`;

            console.log(`[MetaLeadService] Mapped lead data:`, mappedData);

            // Ingest lead into CRM
            const lead = await ingestLead(mappedData);
            return { success: true, leadId: lead?._id };

        } catch (err) {
            console.error('[MetaLeadService] Error processing lead:', err.response?.data || err.message);
            throw err;
        }
    }

    /**
     * Map Meta's key-value pair fields to our CRM Lead structure
     */
    _mapMetaFields(fieldData) {
        const result = {
            name: '',
            mobile: '',
            email: ''
        };

        fieldData.forEach(field => {
            const name = field.name.toLowerCase();
            const value = field.values?.[0] || '';

            if (name.includes('full_name') || name === 'name') {
                result.name = value;
            } else if (name.includes('phone') || name === 'mobile_number') {
                result.mobile = value;
            } else if (name.includes('email')) {
                result.email = value;
            } else {
                // Add unknown fields to listingDetails
                result.listingDetails = (result.listingDetails || '') + `\n${field.name}: ${value}`;
            }
        });

        return result;
    }
}

export default new MetaLeadService();
