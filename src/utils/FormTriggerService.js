/**
 * FormTriggerService.js
 * Unifies triggering of mandatory forms across the application.
 */

export const REQUIRED_FORM_TYPES = {
    REQUIREMENT: 'Requirement Form',
    MEETING: 'Meetings Form',
    SITE_VISIT: 'Site visit Form',
    QUOTATION: 'Quotation Form',
    OFFER: 'Offer Form',
    FEEDBACK: 'Feedback Form'
};

/**
 * Triggers a form by dispatching a global 'trigger-form' event.
 * @param {string} formType - One of REQUIRED_FORM_TYPES
 * @param {string} entityId - ID of the lead or deal
 * @param {Object} context - Optional extra data (e.g. contactId, leadData, etc.)
 */
export const triggerRequiredForm = (formType, entityId, context = {}) => {
    if (!formType || formType === 'None') return;

    console.log(`[FormTriggerService] Dispatching trigger for: ${formType}`, { entityId, context });

    window.dispatchEvent(new CustomEvent('trigger-form', {
        detail: {
            formType,
            entityId,
            ...context
        }
    }));
};
