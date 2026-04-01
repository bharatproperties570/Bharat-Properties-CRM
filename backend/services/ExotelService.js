/**
 * ExotelService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Service for automated outgoing calls via Exotel API.
 * Connects an internal Agent to a potential Lead automatically.
 */

import axios from 'axios';

class ExotelService {
    constructor() {
        this.SID = process.env.EXOTEL_SID;
        this.API_KEY = process.env.EXOTEL_API_KEY;
        this.API_TOKEN = process.env.EXOTEL_API_TOKEN;
        this.CALLER_ID = process.env.EXOTEL_CALLER_ID; // Your Exophone number
        this.MOCK = process.env.EXOTEL_MOCK !== 'false' && (!this.SID || !this.API_KEY);

        if (this.MOCK) {
            console.log('📶 ExotelService: Using Mock Mode (No SID/Key found)');
        }
    }

    /**
     * Triggers a call to connect an Agent with a Lead.
     * @param {string} leadPhone - Phone number of the lead.
     * @param {string} agentPhone - Phone number of the agent (optional, falls back to default).
     * @returns {Promise<object>} - Exotel response or Mock data.
     */
    async makeCall(leadPhone, agentPhone = '9991000570') {
        if (!leadPhone) {
            throw new Error('[Exotel] Lead phone number is required.');
        }

        // Clean numbers: Remove + and spaces
        const cleanTo = leadPhone.replace(/\D/g, '');
        const cleanFrom = agentPhone.replace(/\D/g, '');

        if (this.MOCK) {
            console.log(`[Mock Exotel] Initiating call: Agent(${cleanFrom}) ⇄ Lead(${cleanTo})`);
            return {
                success: true,
                mock: true,
                Sid: `mock_call_${Date.now()}`,
                Status: 'queued'
            };
        }

        try {
            // Exotel Connect URL: https://api.exotel.com/v1/Accounts/{AccountSid}/Calls/connect.json
            const url = `https://api.exotel.com/v1/Accounts/${this.SID}/Calls/connect.json`;
            const auth = Buffer.from(`${this.API_KEY}:${this.API_TOKEN}`).toString('base64');

            const params = new URLSearchParams();
            params.append('From', cleanFrom);
            params.append('To', cleanTo);
            params.append('CallerId', this.CALLER_ID);
            params.append('TimeLimit', '1800'); // 30 mins max
            params.append('TimeOut', '30');    // Wait 30s for agent to pick up
            params.append('StatusCallback', `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/webhooks/exotel-callback`);

            const response = await axios.post(url, params, {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            console.log(`[Exotel] Call initiated successfully: ${response.data.Call?.Sid}`);
            return { success: true, data: response.data };
        } catch (error) {
            console.error('[Exotel] API Error:', error.response?.data || error.message);
            throw new Error(`Exotel Call Failed: ${error.message}`);
        }
    }
}

export default new ExotelService();
