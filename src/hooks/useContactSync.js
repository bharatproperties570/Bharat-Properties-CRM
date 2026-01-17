/**
 * React hook for Contact Sync integration
 * Use this in ContactsView to automatically sync contacts
 */

import { useEffect, useCallback } from 'react';
import contactSyncManager from '../services/contactSyncManager';

export const useContactSync = () => {
    /**
     * Sync a single contact
     * Call this when creating or updating a contact
     */
    const syncContact = useCallback(async (contact) => {
        try {
            const results = await contactSyncManager.syncContact(contact);

            // Check if any syncs failed
            const hasErrors = (results.google.attempted && !results.google.success) ||
                (results.apple.attempted && !results.apple.success);

            if (hasErrors) {
                const errors = [];
                if (results.google.error) errors.push(`Google: ${results.google.error}`);
                if (results.apple.error) errors.push(`Apple: ${results.apple.error}`);

                console.warn('Contact sync partial failure:', errors.join(', '));
                return { success: false, errors };
            }

            return { success: true, results };
        } catch (error) {
            console.error('Contact sync error:', error);
            return { success: false, error: error.message };
        }
    }, []);

    /**
     * Sync multiple contacts at once
    */
    const syncMultipleContacts = useCallback(async (contacts) => {
        try {
            const results = await contactSyncManager.syncMultipleContacts(contacts);
            return { success: true, results };
        } catch (error) {
            console.error('Bulk sync error:', error);
            return { success: false, error: error.message };
        }
    }, []);

    /**
     * Get sync status for a contact
     */
    const getSyncStatus = useCallback((contact) => {
        return contactSyncManager.getContactSyncStatus(contact);
    }, []);

    /**
     * Get overall sync configuration
     */
    const getSyncConfig = useCallback(() => {
        return contactSyncManager.getSyncStatus();
    }, []);

    return {
        syncContact,
        syncMultipleContacts,
        getSyncStatus,
        getSyncConfig
    };
};

/**
 * Example usage in ContactsView:
 * 
 * import { useContactSync } from '../hooks/useContactSync';
 * 
 * const ContactsView = () => {
 *     const { syncContact, getSyncStatus } = useContactSync();
 * 
 *     const handleAddContact = async (newContact) => {
 *         // Save to CRM
 *         const savedContact = await saveContactToDatabase(newContact);
 *         
 *         // Sync to cloud
 *         await syncContact(savedContact);
 *         
 *         // Update UI
 *         // ...
 *     };
 * 
 *     const renderContactSyncIndicator = (contact) => {
 *         const status = getSyncStatus(contact);
 *         
 *         return (
 *             <div style={{ display: 'flex', gap: '4px' }}>
 *                 {status.google.synced && (
 *                     <span title="Synced to Google">
 *                         <i className="fab fa-google" style={{ color: '#4285F4' }}></i>
 *                     </span>
 *                 )}
 *                 {status.apple.synced && (
 *                     <span title="Synced to Apple">
 *                         <i className="fab fa-apple" style={{ color: '#64748b' }}></i>
 *                     </span>
 *                 )}
 *             </div>
 *         );
 *     };
 * 
 *     return (
 *         // ... your component JSX
 *     );
 * };
 */

export default useContactSync;
