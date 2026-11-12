/**
 * socialIntegration — Hooks into social media publishing to register
 * Facebook, Instagram, LinkedIn posts as operations.
 */
import OperationsService from '../OperationsService.js';

class SocialIntegration {
  /**
   * Register a social media publish operation.
   */
  static async registerPublish({ platform, postTitle, initiatedBy, metadata = {} }) {
    const channelMap = {
      facebook: 'facebook',
      instagram: 'instagram',
      linkedin: 'linkedin',
    };

    try {
      return await OperationsService.registerOperation({
        name: postTitle || `${platform} Post`,
        operationType: 'social_publish',
        category: 'marketing',
        channel: channelMap[platform] || platform,
        initiatedBy,
        totalItems: 1,
        metadata: { platform, ...metadata },
      });
    } catch (err) {
      console.error(`[SocialIntegration] Failed to register ${platform} publish:`, err.message);
    }
  }

  /**
   * Mark publish as completed.
   */
  static async complete(jobId, result) {
    try {
      await OperationsService.completeOperation(jobId, result);
    } catch (err) {
      console.error('[SocialIntegration] Complete failed:', err.message);
    }
  }

  /**
   * Mark publish as failed.
   */
  static async fail(jobId, error) {
    try {
      await OperationsService.failOperation(jobId, error);
    } catch (err) {
      console.error('[SocialIntegration] Fail recording failed:', err.message);
    }
  }
}

export default SocialIntegration;
