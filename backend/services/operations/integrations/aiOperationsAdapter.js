/**
 * aiOperationsAdapter — Future-compatible adapter interface for AI operations.
 *
 * Defines the integration contract for AI calling, voice agents,
 * AI lead qualification, AI follow-up workflows, and AI document processing.
 *
 * Not activated yet — implement concrete methods when AI modules are ready.
 */
import OperationsService from '../OperationsService.js';

class AIOperationsAdapter {
  /**
   * Register a generic AI operation.
   */
  static async registerAIOperation({ name, aiType, initiatedBy, totalItems = 1, metadata = {} }) {
    const typeMap = {
      calling:           'ai_calling',
      voice_agent:       'ai_voice_agent',
      lead_qualification: 'ai_lead_qualification',
      follow_up:         'ai_follow_up',
      document:          'ai_document_processing',
      automation:        'ai_automation',
    };

    try {
      return await OperationsService.registerOperation({
        name: name || `AI ${aiType}`,
        operationType: typeMap[aiType] || `ai_${aiType}`,
        category: 'ai',
        channel: 'ai',
        initiatedBy,
        totalItems,
        metadata: { aiType, ...metadata },
      });
    } catch (err) {
      console.error(`[AIAdapter] Failed to register ${aiType}:`, err.message);
    }
  }

  static async updateProgress(jobId, progress) {
    try {
      await OperationsService.updateProgress(jobId, progress);
    } catch (err) { /* non-fatal */ }
  }

  static async complete(jobId, result) {
    try {
      await OperationsService.completeOperation(jobId, result);
    } catch (err) { /* non-fatal */ }
  }

  static async fail(jobId, error) {
    try {
      await OperationsService.failOperation(jobId, error);
    } catch (err) { /* non-fatal */ }
  }
}

export default AIOperationsAdapter;
