// src/utils/communicationHelper.js
// Centralized helper for reliable campaign dispatch with retries and queue persistence.

import { marketingAPI } from './api';
import { toast } from 'react-hot-toast';

/** Simple exponential back‑off sleep */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send a campaign with automatic retries.
 * @param {string} channel - 'WHATSAPP' | 'SMS' | 'EMAIL' | 'RCS'
 * @param {object} payload - payload as expected by marketingAPI.sendCampaign
 * @param {number} maxAttempts - number of retry attempts (default 3)
 * @returns {Promise<{success:boolean, error?:string}>}
 */
export const sendCampaignWithRetry = async (channel, payload, maxAttempts = 3) => {
  const queueKey = 'bp_campaign_queue';
  const pending = JSON.parse(localStorage.getItem(queueKey) || '[]');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await marketingAPI.sendCampaign(channel, payload);
      if (res?.success) {
        // Clean any previous queued entry for this lead (if present)
        const cleaned = pending.filter((p) => {
          const recId = payload?.recipients?.[0]?.id || payload?.recipients?.[0]?._id;
          return recId && recId !== p?.data?.recipients?.[0]?.id;
        });
        localStorage.setItem(queueKey, JSON.stringify(cleaned));
        return { success: true };
      }
      throw new Error(res?.error || 'Unknown backend error');
    } catch (err) {
      console.warn(`[CampaignRetry] ${channel} attempt ${attempt} failed:`, err);
      if (attempt === maxAttempts) {
        // Persist to queue for manual retry later
        pending.push({ channel, data: payload, error: err.message, timestamp: Date.now() });
        localStorage.setItem(queueKey, JSON.stringify(pending));
        return { success: false, error: err.message };
      }
      // exponential back‑off (500ms → 1s → 2s)
      await delay(500 * Math.pow(2, attempt - 1));
    }
  }
};
