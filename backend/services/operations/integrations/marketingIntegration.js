/**
 * marketingIntegration — Hooks into BroadcastLiveTracker to register
 * marketing campaigns as operations in the Operations Center.
 *
 * This is an event-based bridge: listens to campaign lifecycle events
 * and maps them to OperationsService calls. Does NOT modify existing
 * campaign processing code.
 */
import OperationsService from '../OperationsService.js';

const CAMPAIGN_STATUS_MAP = {
  'pending':     'queued',
  'scheduled':   'queued',
  'processing':  'processing',
  'sending':     'processing',
  'running':     'processing',
  'completed':   'completed',
  'failed':      'failed',
  'paused':      'paused',
  'cancelled':   'cancelled',
  'partially_completed': 'completed_with_errors',
};

class MarketingIntegration {
  /**
   * Register a new campaign as an operations job.
   */
  static async registerCampaign(campaign, initiatedBy) {
    try {
      return await OperationsService.registerOperation({
        name: campaign.name || `Campaign ${campaign._id}`,
        operationType: 'marketing_campaign',
        category: 'marketing',
        channel: campaign.channel || 'whatsapp',
        initiatedBy,
        totalItems: campaign.recipientCount || campaign.audience?.length || 0,
        metadata: {
          campaignId: campaign._id?.toString(),
          channel: campaign.channel,
          templateName: campaign.templateName,
        },
      });
    } catch (err) {
      console.error('[MarketingIntegration] Failed to register campaign:', err.message);
    }
  }

  /**
   * Update campaign progress.
   */
  static async updateProgress(jobId, { sent, delivered, failed, total }) {
    try {
      await OperationsService.updateProgress(jobId, {
        processed: (sent || 0) + (failed || 0),
        successful: delivered || sent || 0,
        failed: failed || 0,
        total: total || 0,
      });
    } catch (err) {
      console.error('[MarketingIntegration] Progress update failed:', err.message);
    }
  }

  /**
   * Map campaign status change to operations status.
   */
  static async updateStatus(jobId, campaignStatus, error) {
    const opsStatus = CAMPAIGN_STATUS_MAP[campaignStatus];
    if (!opsStatus) return;

    try {
      if (opsStatus === 'completed') {
        await OperationsService.completeOperation(jobId);
      } else if (opsStatus === 'failed') {
        await OperationsService.failOperation(jobId, error || new Error('Campaign failed'));
      } else {
        await OperationsService.updateStatus(jobId, opsStatus);
      }
    } catch (err) {
      console.error('[MarketingIntegration] Status update failed:', err.message);
    }
  }
}

export default MarketingIntegration;
