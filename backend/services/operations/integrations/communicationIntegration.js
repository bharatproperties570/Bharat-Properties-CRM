/**
 * communicationIntegration — Maps WhatsApp, SMS, Email dispatch to operations.
 */
import OperationsService from '../OperationsService.js';

const CHANNEL_MAP = {
  whatsapp:      { channel: 'whatsapp',      type: 'whatsapp_dispatch' },
  whatsapp_web:  { channel: 'whatsapp_web',  type: 'whatsapp_web_dispatch' },
  sms:           { channel: 'sms',           type: 'sms_dispatch' },
  email:         { channel: 'email',         type: 'email_dispatch' },
  rcs:           { channel: 'rcs',           type: 'rcs_dispatch' },
  voice:         { channel: 'voice',         type: 'voice_call' },
};

class CommunicationIntegration {
  /**
   * Register a bulk communication dispatch as an operation.
   */
  static async registerBulkDispatch(channelKey, { name, recipientCount, initiatedBy, metadata = {} }) {
    const mapping = CHANNEL_MAP[channelKey] || { channel: channelKey, type: `${channelKey}_dispatch` };

    try {
      return await OperationsService.registerOperation({
        name: name || `${mapping.channel} Bulk Send`,
        operationType: mapping.type,
        category: 'communication',
        channel: mapping.channel,
        initiatedBy,
        totalItems: recipientCount || 0,
        metadata,
      });
    } catch (err) {
      console.error(`[CommIntegration] Failed to register ${channelKey} dispatch:`, err.message);
    }
  }

  /**
   * Update dispatch progress.
   */
  static async updateProgress(jobId, progress) {
    try {
      await OperationsService.updateProgress(jobId, progress);
    } catch (err) {
      console.error('[CommIntegration] Progress update failed:', err.message);
    }
  }

  /**
   * Complete a dispatch operation.
   */
  static async complete(jobId, summary) {
    try {
      await OperationsService.completeOperation(jobId, summary);
    } catch (err) {
      console.error('[CommIntegration] Complete failed:', err.message);
    }
  }

  /**
   * Fail a dispatch operation.
   */
  static async fail(jobId, error) {
    try {
      await OperationsService.failOperation(jobId, error);
    } catch (err) {
      console.error('[CommIntegration] Fail recording failed:', err.message);
    }
  }
}

export default CommunicationIntegration;
