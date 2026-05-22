// src/services/contactDependencyService.js
// 🛡️ Enterprise Service: Retrieves cross‑module references for a contact before deletion.
// This service abstracts the API call to fetch dependencies such as inventory items, deals, leads, activities, post‑sale records, and marketing links.

import { api } from '../utils/api';

const contactDependencyService = {
  /**
   * Fetches dependency summary for a given contact ID.
   * @param {string} contactId - Mongo/ObjectId of the contact.
   * @returns {Promise<Object>} - Structure: { inventory: [], deals: [], leads: [], activities: [], postSales: [], marketing: [] }
   */
  async getDependencies(contactId) {
    if (!contactId) throw new Error('contactId is required');
    try {
      // Backend endpoint expected to return the aggregated references.
      const response = await api.get(`contacts/${contactId}/dependencies`);
      if (response.data && response.data.success) {
        return response.data.dependencies || {};
      }
      // Fallback to empty object if API contract differs.
      return {};
    } catch (err) {
      console.error('[ContactDependencyService] Error fetching dependencies', err);
      // Propagate error to caller for handling.
      throw err;
    }
  }
};

export default contactDependencyService;
