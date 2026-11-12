/**
 * portalIntegration — Hooks into PortalSyndicationService for
 * property listing operations.
 */
import OperationsService from '../OperationsService.js';

class PortalIntegration {
  /**
   * Register a portal syndication batch operation.
   */
  static async registerSyndication({ portalName, listingCount, action, initiatedBy, metadata = {} }) {
    try {
      return await OperationsService.registerOperation({
        name: `${portalName} ${action || 'Syndication'}`,
        operationType: action === 'remove' ? 'portal_removal' : 'portal_syndication',
        category: 'property_distribution',
        channel: 'portal',
        initiatedBy,
        totalItems: listingCount || 0,
        metadata: { portalName, action, ...metadata },
      });
    } catch (err) {
      console.error('[PortalIntegration] Failed to register syndication:', err.message);
    }
  }

  static async updateProgress(jobId, progress) {
    try {
      await OperationsService.updateProgress(jobId, progress);
    } catch (err) {
      console.error('[PortalIntegration] Progress update failed:', err.message);
    }
  }

  static async complete(jobId, result) {
    try {
      await OperationsService.completeOperation(jobId, result);
    } catch (err) {
      console.error('[PortalIntegration] Complete failed:', err.message);
    }
  }

  static async fail(jobId, error) {
    try {
      await OperationsService.failOperation(jobId, error);
    } catch (err) {
      console.error('[PortalIntegration] Fail recording failed:', err.message);
    }
  }
}

export default PortalIntegration;
